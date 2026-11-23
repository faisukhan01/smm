/**
 * Queue execution layer for the publishing worker.
 *
 * Two drivers, selected by QUEUE_DRIVER:
 *
 * - 'db' (default): a setInterval tick reclaims stale PROCESSING rows (>5min
 *   lock), atomically claims due PENDING jobs (updateMany guarded by status —
 *   safe across concurrent workers) and runs the processor inline.
 *
 * - 'redis': the same DB scanning/claiming, but claimed jobs are pushed into a
 *   BullMQ queue ('smm-publishing') with jobId = idempotencyKey for dedup, and
 *   a BullMQ Worker (concurrency 3) executes them. If REDIS_URL is missing the
 *   process logs a fatal error and exits 1 — it degrades loudly, not silently.
 *
 * Retry semantics are identical for both drivers: the processor owns all DB
 * state transitions (COMPLETED / FAILED / PENDING+backoff). BullMQ runs with
 * attempts: 1; crash-recovery on the BullMQ failure event applies the same
 * retry path, using attemptsMade passed through for reconciliation.
 */
import { type PublishingJob, type Post } from '@prisma/client';
import { Queue, Worker, type Job as BullMqJob } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from './lib/prisma';
import { backoffDelayMs, jobLog, processPublishingJob, workerLog, type JobOutcome } from './processor';

const QUEUE_NAME = 'smm-publishing';
const STALE_LOCK_MS = 5 * 60 * 1000;
const CLAIM_BATCH_SIZE = 5;
const DEFAULT_POLL_INTERVAL_MS = 5000;
const BULLMQ_CONCURRENCY = 3;
const BULLMQ_REMOVE_AGE_SECONDS = 60 * 60;

interface EnqueuePayload {
  jobId: string;
  idempotencyKey: string;
}

type ClaimedJob = PublishingJob & { post: Post };

export interface QueueRuntime {
  driver: 'db' | 'redis';
  stop(): Promise<void>;
}

function pollIntervalMs(): number {
  return Number(process.env.WORKER_POLL_INTERVAL_MS || DEFAULT_POLL_INTERVAL_MS);
}

// ---------------------------------------------------------------------------
// Shared DB scanning: reclaim + atomic claim
// ---------------------------------------------------------------------------

/** Reclaim PROCESSING rows whose lock expired (crashed worker safety net). */
async function reclaimStaleJobs(): Promise<number> {
  const result = await prisma.publishingJob.updateMany({
    where: {
      status: 'PROCESSING',
      lockedAt: { lt: new Date(Date.now() - STALE_LOCK_MS) },
    },
    data: { status: 'PENDING', lockedAt: null },
  });
  return result.count;
}

/** Atomically claim due PENDING jobs (count===1 ⇒ this worker owns them). */
async function claimDueJobs(): Promise<ClaimedJob[]> {
  const due = await prisma.publishingJob.findMany({
    where: { status: 'PENDING', runAt: { lte: new Date() } },
    orderBy: { runAt: 'asc' },
    take: CLAIM_BATCH_SIZE,
    include: { post: true },
  });

  const claimed: ClaimedJob[] = [];
  for (const job of due) {
    const result = await prisma.publishingJob.updateMany({
      where: { id: job.id, status: 'PENDING' },
      data: { status: 'PROCESSING', lockedAt: new Date() },
    });
    if (result.count === 1) claimed.push(job);
  }
  return claimed;
}

/** Release a claimed job back to PENDING (e.g. enqueue failure in redis mode). */
async function releaseClaim(jobId: string): Promise<void> {
  await prisma.publishingJob.updateMany({
    where: { id: jobId, status: 'PROCESSING' },
    data: { status: 'PENDING', lockedAt: null },
  });
}

// ---------------------------------------------------------------------------
// DB driver
// ---------------------------------------------------------------------------

function startDbDriver(): QueueRuntime {
  const interval = pollIntervalMs();
  let stopped = false;
  let ticking = false;
  let inflight: Promise<void> | null = null;

  const tick = async (): Promise<void> => {
    if (ticking || stopped) return;
    ticking = true;
    inflight = (async () => {
      try {
        const reclaimed = await reclaimStaleJobs();
        if (reclaimed > 0) workerLog(`reclaimed ${reclaimed} stale PROCESSING job(s) → PENDING`);
        const jobs = await claimDueJobs();
        for (const job of jobs) {
          try {
            await processPublishingJob(job.id);
          } catch (err) {
            // The processor is designed not to throw; if it does, leave the
            // row PROCESSING so the stale-lock reclaim retries it safely.
            workerLog(
              `job=${job.id} processor crashed: ${err instanceof Error ? err.message : String(err)} — left PROCESSING for stale-lock reclaim`,
            );
          }
        }
      } catch (err) {
        workerLog(`db tick error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        ticking = false;
        inflight = null;
      }
    })();
    await inflight;
  };

  workerLog(`driver=db pollIntervalMs=${interval} batchSize=${CLAIM_BATCH_SIZE}`);
  const timer = setInterval(() => void tick(), interval);
  void tick(); // first tick immediately

  return {
    driver: 'db',
    stop: async () => {
      stopped = true;
      clearInterval(timer);
      if (inflight) await inflight;
    },
  };
}

// ---------------------------------------------------------------------------
// Redis (BullMQ) driver
// ---------------------------------------------------------------------------

/** Crash-recovery for a BullMQ job whose processor threw unexpectedly. */
async function recoverFailedBullMqJob(jobId: string, attemptsMade: number, err: Error): Promise<void> {
  try {
    const job = await prisma.publishingJob.findUnique({ where: { id: jobId } });
    if (!job) return;
    const attempts = Math.max(job.attempts, attemptsMade);
    if (attempts < job.maxAttempts) {
      const delayMs = backoffDelayMs(attempts);
      await prisma.publishingJob.updateMany({
        where: { id: job.id, status: 'PROCESSING' },
        data: {
          status: 'PENDING',
          attempts,
          lockedAt: null,
          lastError: err.message.slice(0, 2000),
          runAt: new Date(Date.now() + delayMs),
        },
      });
      jobLog(job.id, job.postId, `attempt=${attempts} → retry(delayMs=${delayMs}) [bullmq crash recovery] ${err.message}`);
    } else {
      await prisma.publishingJob.updateMany({
        where: { id: job.id, status: 'PROCESSING' },
        data: { status: 'FAILED', attempts, lockedAt: null, lastError: err.message.slice(0, 2000) },
      });
      jobLog(job.id, job.postId, `attempt=${attempts} → failed [bullmq crash recovery] ${err.message}`);
    }
  } catch (recoveryErr) {
    workerLog(`job=${jobId} crash recovery failed: ${recoveryErr instanceof Error ? recoveryErr.message : String(recoveryErr)}`);
  }
}

function startRedisDriver(): QueueRuntime {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    workerLog('FATAL: QUEUE_DRIVER=redis but REDIS_URL is not set — cannot start BullMQ execution layer');
    process.exit(1);
  }

  const interval = pollIntervalMs();
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  connection.on('error', (err) => workerLog(`redis connection error: ${err.message}`));

  const queue = new Queue<EnqueuePayload, JobOutcome>(QUEUE_NAME, { connection });

  const worker = new Worker<EnqueuePayload, JobOutcome>(
    QUEUE_NAME,
    async (bullJob: BullMqJob<EnqueuePayload>): Promise<JobOutcome> => {
      // attemptsMade is passed through for reconciliation; the processor
      // derives the authoritative attempt number from the DB row.
      return processPublishingJob(bullJob.data.jobId, bullJob.attemptsMade);
    },
    { connection, concurrency: BULLMQ_CONCURRENCY },
  );

  worker.on('completed', (bullJob, result) => {
    if (result?.outcome === 'COMPLETED') {
      // Processor already transitioned the row; reconcile defensively.
      void prisma.publishingJob
        .updateMany({ where: { id: bullJob.data.jobId, status: 'PROCESSING' }, data: { status: 'COMPLETED' } })
        .catch(() => undefined);
    }
    workerLog(`bullmq job=${bullJob.data.jobId} completed outcome=${result?.outcome ?? 'unknown'}`);
  });

  worker.on('failed', (bullJob, err) => {
    const jobId = bullJob?.data.jobId;
    if (!jobId) {
      workerLog(`bullmq job failed without payload: ${err.message}`);
      return;
    }
    void recoverFailedBullMqJob(jobId, bullJob?.attemptsMade ?? 1, err);
  });

  worker.on('error', (err) => workerLog(`bullmq worker error: ${err.message}`));

  let stopped = false;
  let ticking = false;
  let inflight: Promise<void> | null = null;

  const tick = async (): Promise<void> => {
    if (ticking || stopped) return;
    ticking = true;
    inflight = (async () => {
      try {
        const reclaimed = await reclaimStaleJobs();
        if (reclaimed > 0) workerLog(`reclaimed ${reclaimed} stale PROCESSING job(s) → PENDING`);
        const jobs = await claimDueJobs();
        for (const job of jobs) {
          try {
            // name = PublishingJob.id, jobId = idempotencyKey (dedup), delay 0.
            await queue.add(job.id, { jobId: job.id, idempotencyKey: job.idempotencyKey }, {
              jobId: job.idempotencyKey,
              attempts: 1,
              removeOnComplete: { age: BULLMQ_REMOVE_AGE_SECONDS, count: 1000 },
              removeOnFail: { age: BULLMQ_REMOVE_AGE_SECONDS, count: 1000 },
            });
            workerLog(`job=${job.id} enqueued to bullmq (${QUEUE_NAME})`);
          } catch (err) {
            await releaseClaim(job.id);
            workerLog(`job=${job.id} enqueue failed — released back to PENDING: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      } catch (err) {
        workerLog(`redis tick error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        ticking = false;
        inflight = null;
      }
    })();
    await inflight;
  };

  workerLog(`driver=redis queue=${QUEUE_NAME} concurrency=${BULLMQ_CONCURRENCY} pollIntervalMs=${interval}`);
  const timer = setInterval(() => void tick(), interval);
  void tick();

  return {
    driver: 'redis',
    stop: async () => {
      stopped = true;
      clearInterval(timer);
      try {
        await worker.close();
        await queue.close();
        await connection.quit();
      } catch (err) {
        workerLog(`redis shutdown warning: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

export function resolveDriver(): 'db' | 'redis' {
  return (process.env.QUEUE_DRIVER || 'db').trim().toLowerCase() === 'redis' ? 'redis' : 'db';
}

export function startQueue(driver: 'db' | 'redis'): QueueRuntime {
  return driver === 'redis' ? startRedisDriver() : startDbDriver();
}
