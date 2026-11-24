/**
 * Queue execution layer for the publishing engine (DB driver only).
 *
 * Ported from mini-services/worker/src/queue.ts. The original long-running
 * worker supported two drivers ('db' + BullMQ/Redis) driven by a setInterval
 * tick; this serverless port keeps the DB driver only — on Vercel there is no
 * resident process, so a cron-triggered route replaces the tick (one pass per
 * invocation) and the Redis/BullMQ path is dropped entirely.
 *
 * Semantics preserved from the source:
 * - Stale PROCESSING rows (lock older than 5min — crashed-worker safety net)
 *   are reclaimed to PENDING.
 * - Due PENDING jobs are claimed ATOMICALLY: a guarded updateMany
 *   (`where id + status='PENDING'`) — count===1 means this pass owns the row,
 *   so overlapping cron invocations can never double-claim.
 * - Due-time is a UTC instant comparison: `runAt <= now`. PublishingJob.runAt
 *   is a Prisma DateTime (stored UTC in Postgres) and the API writes it from
 *   `new Date(body.scheduledAt)` (an absolute ISO instant with offset), so
 *   scheduled posts are timezone-correct by construction — no wall-clock TZ
 *   math anywhere in the pipeline.
 * - The processor owns all DB state transitions; the guarded row-writers below
 *   (reschedule / fail / complete / cancel) are the exact transitions the
 *   source performed inline, extracted as helpers.
 * - A PublishingAttempt row is recorded for EVERY execution path.
 */
import { type Post, type PublishingJob } from '@prisma/client';
import { db } from '@/lib/db';
import type { PublishResult } from './publishers/types';

// ---------------------------------------------------------------------------
// Tunables (source: queue.ts)
// ---------------------------------------------------------------------------

/** PROCESSING rows whose lock is older than this are reclaimed to PENDING. */
const STALE_LOCK_MS = 5 * 60 * 1000;

/** Default claim batch size (source: CLAIM_BATCH_SIZE = 5; the cron pass passes ~10). */
export const DEFAULT_CLAIM_BATCH_SIZE = 5;

export type ClaimedJob = PublishingJob & { post: Post };

// ---------------------------------------------------------------------------
// Shared DB scanning: reclaim + atomic claim (source: queue.ts, verbatim)
// ---------------------------------------------------------------------------

/** Reclaim PROCESSING rows whose lock expired (crashed worker safety net). */
export async function reclaimStaleJobs(): Promise<number> {
  const result = await db.publishingJob.updateMany({
    where: {
      status: 'PROCESSING',
      lockedAt: { lt: new Date(Date.now() - STALE_LOCK_MS) },
    },
    data: { status: 'PENDING', lockedAt: null },
  });
  return result.count;
}

/** Atomically claim due PENDING jobs (count===1 ⇒ this pass owns them). */
export async function claimDueJobs(limit: number = DEFAULT_CLAIM_BATCH_SIZE): Promise<ClaimedJob[]> {
  const due = await db.publishingJob.findMany({
    where: { status: 'PENDING', runAt: { lte: new Date() } },
    orderBy: { runAt: 'asc' },
    take: limit,
    include: { post: true },
  });

  const claimed: ClaimedJob[] = [];
  for (const job of due) {
    const result = await db.publishingJob.updateMany({
      where: { id: job.id, status: 'PENDING' },
      data: { status: 'PROCESSING', lockedAt: new Date() },
    });
    if (result.count === 1) claimed.push(job);
  }
  return claimed;
}

/** Release a claimed job back to PENDING (e.g. cron time budget exhausted). */
export async function releaseClaim(jobId: string): Promise<void> {
  await db.publishingJob.updateMany({
    where: { id: jobId, status: 'PROCESSING' },
    data: { status: 'PENDING', lockedAt: null },
  });
}

// ---------------------------------------------------------------------------
// Guarded state-transition helpers (transitions the source performed inline in
// processor.ts / queue.ts BullMQ crash recovery)
// ---------------------------------------------------------------------------

/** Retryable failure → PENDING + exponential-backoff runAt (source: processor step 6). */
export async function rescheduleJobForRetry(
  jobId: string,
  attemptNumber: number,
  errorText: string,
  delayMs: number,
): Promise<void> {
  await db.publishingJob.updateMany({
    where: { id: jobId, status: 'PROCESSING' },
    data: {
      status: 'PENDING',
      attempts: attemptNumber,
      lockedAt: null,
      lastError: errorText,
      runAt: new Date(Date.now() + delayMs),
    },
  });
}

/** Final failure → FAILED (source: writeFailureState job transition). */
export async function failJobRow(jobId: string, attemptNumber: number, errorText: string): Promise<void> {
  await db.publishingJob.updateMany({
    where: { id: jobId, status: { in: ['PENDING', 'PROCESSING'] } },
    data: { status: 'FAILED', attempts: attemptNumber, lockedAt: null, lastError: errorText },
  });
}

/** Success → COMPLETED (source: processor success path job transition). */
export async function completeJobRow(jobId: string): Promise<void> {
  await db.publishingJob.updateMany({
    where: { id: jobId, status: { in: ['PENDING', 'PROCESSING'] } },
    data: { status: 'COMPLETED', lockedAt: null, lastError: null },
  });
}

/** Unpublishable target/post/account → CANCELLED (source: processor cancelJobRow). */
export async function cancelJobRow(jobId: string, reason: string): Promise<void> {
  await db.publishingJob.updateMany({
    where: { id: jobId, status: { in: ['PENDING', 'PROCESSING'] } },
    data: { status: 'CANCELLED', lockedAt: null, lastError: reason.slice(0, 2000) },
  });
}

// ---------------------------------------------------------------------------
// Attempt recording (source: processor.ts recordAttempt — ALWAYS, on every try)
// ---------------------------------------------------------------------------

export interface AttemptInput {
  jobId: string;
  postId: string;
  targetId: string;
  attemptNumber: number;
  result: PublishResult;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return '"unserializable response"';
  }
}

/** Persist a PublishingAttempt row (ALWAYS, on every execution). */
export async function recordAttempt(input: AttemptInput): Promise<void> {
  const { result } = input;
  await db.publishingAttempt.create({
    data: {
      jobId: input.jobId,
      postId: input.postId,
      targetId: input.targetId,
      attempt: input.attemptNumber,
      ok: result.ok,
      httpStatus: result.httpStatus ?? null,
      response: result.ok ? safeStringify(result.response).slice(0, 2000) : (result.response ?? null),
      error: result.ok ? null : result.error,
    },
  });
}
