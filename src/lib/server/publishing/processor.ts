/**
 * Publishing processor — executes one PublishingJob end-to-end.
 *
 * Ported from mini-services/worker/src/processor.ts (faithful semantics, `db`
 * singleton instead of the worker's own PrismaClient, decryptSecret imported
 * from '@/lib/server/api/crypto' instead of the worker-local replica).
 *
 * Contract:
 *   1. Load job + target(+post+media+account); skip/cancel if no longer publishable.
 *   2. Flip post.status → PUBLISHING.
 *   3. Throttle per-account, execute the platform publisher (or the demo
 *      simulator), classify the outcome (ok / permanent / retryable).
 *   4. ALWAYS record a PublishingAttempt row (every execution path).
 *   5/6. Transition job/target/post + notification + audit; retryable failures
 *        are requeued as PENDING with exponential backoff (30s → 10min cap).
 *
 * The processor never fabricates success: demo publishes are labeled `mode:
 * 'demo'` in the attempt response, and real platform calls surface honest
 * failures (including 401/403 → account EXPIRED + reconnect notification).
 */
import { Prisma } from '@prisma/client';
import { PLATFORM_LABEL, type Platform } from '@smm/shared';
import { db } from '@/lib/db';
import { decryptSecret } from '@/lib/server/api/crypto';
import {
  cancelJobRow,
  completeJobRow,
  failJobRow,
  recordAttempt,
  rescheduleJobForRetry,
} from './queue';
import { demoPublisher } from './publishers/demo';
import { facebookPublisher } from './publishers/facebook';
import { instagramPublisher } from './publishers/instagram';
import { pinterestPublisher } from './publishers/pinterest';
import {
  sleep,
  type Publisher,
  type PublisherContext,
  type PublisherMedia,
  type PublishResult,
} from './publishers/types';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** Retry backoff: 2^attempts * 30s, capped at 10 minutes. */
export const RETRY_BACKOFF_BASE_MS = 30_000;
export const RETRY_BACKOFF_MAX_MS = 10 * 60_000;

/** Minimum gap between real publishes per account (platform rate limits). */
const RATE_LIMIT_MIN_GAP_MS: Record<Platform, number> = {
  PINTEREST: 1000,
  FACEBOOK: 500,
  INSTAGRAM: 500,
};

export function backoffDelayMs(attempts: number): number {
  return Math.min(2 ** attempts * RETRY_BACKOFF_BASE_MS, RETRY_BACKOFF_MAX_MS);
}

// ---------------------------------------------------------------------------
// Structured logs (same format as the worker source)
// ---------------------------------------------------------------------------

export function workerLog(message: string): void {
  console.log(`[worker] ${new Date().toISOString()} ${message}`);
}

export function jobLog(jobId: string, postId: string | null | undefined, message: string): void {
  console.log(`[worker] ${new Date().toISOString()} job=${jobId} post=${postId ?? '-'} ${message}`);
}

// ---------------------------------------------------------------------------
// Outcome contract (returned to the queue layer / cron pass)
// ---------------------------------------------------------------------------

export type JobOutcome =
  | { outcome: 'COMPLETED'; externalPostId: string; demo: boolean }
  | { outcome: 'FAILED'; error: string; permanent: boolean }
  | { outcome: 'RETRY_SCHEDULED'; delayMs: number; error: string }
  | { outcome: 'CANCELLED'; reason: string }
  | { outcome: 'SKIPPED'; reason: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TargetWithRelations = Prisma.PostTargetGetPayload<{
  include: { post: { include: { media: true } }; account: true };
}>;

const REAL_PUBLISHERS: Record<Platform, Publisher> = {
  FACEBOOK: facebookPublisher,
  INSTAGRAM: instagramPublisher,
  PINTEREST: pinterestPublisher,
};

/** Composed caption text: post.content + '\n\n' + hashtags (skipped when empty). */
export function composeText(post: { content: string; hashtags: string[] }): string {
  const tags = post.hashtags.join(' ').trim();
  return tags ? `${post.content}\n\n${tags}` : post.content;
}

/** PUBLIC_MEDIA_BASE_URL + media.url — platforms must fetch media over public HTTP. */
export function publicMediaUrl(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  const base = (process.env.PUBLIC_MEDIA_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return `${base}${url.startsWith('/') ? url : `/${url}`}`;
}

/** Per-account in-memory last-publish timestamps for polite platform pacing.
 *  (Per serverless instance — a best-effort pacing guard, same as the source.) */
const lastPublishAt = new Map<string, number>();

async function throttleRealPublish(accountId: string, platform: Platform): Promise<void> {
  const minGapMs = RATE_LIMIT_MIN_GAP_MS[platform];
  const last = lastPublishAt.get(accountId);
  if (last !== undefined) {
    const waitMs = last + minGapMs - Date.now();
    if (waitMs > 0) await sleep(waitMs);
  }
  lastPublishAt.set(accountId, Date.now());
}

/** Kill-switch a dead token: account EXPIRED + reconnect notification. */
async function markAccountExpired(
  account: { id: string; platform: Platform; username: string },
  workspaceId: string,
  reason: string,
): Promise<void> {
  await db.socialAccount.updateMany({
    where: { id: account.id, status: 'CONNECTED' },
    data: { status: 'EXPIRED' },
  });
  await db.notification.create({
    data: {
      workspaceId,
      type: 'ACCOUNT_EXPIRED',
      title: 'Reconnect required',
      body: `${PLATFORM_LABEL[account.platform]} account @${account.username}: ${reason}`,
    },
  });
}

/**
 * Final-failure state transition: job FAILED, target FAILED, post FAILED +
 * notification + audit. Used for permanent failures, for retryable failures
 * that have exhausted maxAttempts, and for unusable credentials.
 */
async function writeFailureState(
  job: { id: string; postId: string },
  post: { id: string; workspaceId: string },
  target: { id: string },
  attemptNumber: number,
  failure: { error: string; httpStatus?: number },
): Promise<JobOutcome> {
  const errorText = failure.error.slice(0, 2000);

  await failJobRow(job.id, attemptNumber, errorText);
  await db.postTarget.update({
    where: { id: target.id },
    data: { status: 'FAILED', error: errorText },
  });
  await db.post.updateMany({
    where: { id: post.id, status: { not: 'PUBLISHED' } },
    data: { status: 'FAILED', failureReason: errorText },
  });
  await db.notification.create({
    data: {
      workspaceId: post.workspaceId,
      type: 'POST_FAILED',
      title: 'Publishing failed',
      body: `Publishing failed — ${errorText}`.slice(0, 1000),
    },
  });
  await db.auditLog.create({
    data: {
      workspaceId: post.workspaceId,
      actorId: null,
      action: 'POST_FAILED',
      entity: 'PostTarget',
      entityId: target.id,
      meta: { attempt: attemptNumber, httpStatus: failure.httpStatus ?? null },
    },
  });
  jobLog(job.id, post.id, `attempt=${attemptNumber} → failed ${errorText}`);
  return { outcome: 'FAILED', error: errorText, permanent: true };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Execute a claimed PublishingJob.
 *
 * `attemptsMade` (optional) exists for signature compatibility with the source
 * worker's BullMQ execution layer; the serverless port has no BullMQ, so the
 * parameter is ignored. Attempt numbering is always derived from the DB row
 * (job.attempts + 1) — the database is the single source of truth for how many
 * attempts have been consumed.
 */
export async function processPublishingJob(jobId: string, attemptsMade?: number): Promise<JobOutcome> {
  void attemptsMade;

  const job = await db.publishingJob.findUnique({ where: { id: jobId } });
  if (!job) {
    workerLog(`job=${jobId} → skipped (job row not found)`);
    return { outcome: 'SKIPPED', reason: 'job row not found' };
  }
  if (job.status === 'COMPLETED' || job.status === 'FAILED' || job.status === 'CANCELLED') {
    jobLog(job.id, job.postId, `→ skipped (already ${job.status})`);
    return { outcome: 'SKIPPED', reason: `job already ${job.status}` };
  }

  // -- 1. Load target + post + media + account ------------------------------
  const target: TargetWithRelations | null = await db.postTarget.findUnique({
    where: { id: job.targetId },
    include: { post: { include: { media: true } }, account: true },
  });
  if (!target) {
    const reason = 'Target no longer exists';
    await cancelJobRow(job.id, reason);
    jobLog(job.id, job.postId, `→ cancelled (${reason})`);
    return { outcome: 'CANCELLED', reason };
  }

  const post = target.post;
  const account = target.account;
  if (!post || !account) {
    const reason = 'Post or account no longer exists';
    await cancelJobRow(job.id, reason);
    jobLog(job.id, job.postId, `→ cancelled (${reason})`);
    return { outcome: 'CANCELLED', reason };
  }

  if (post.status === 'CANCELLED' || post.status === 'DRAFT') {
    const reason = `Post is ${post.status} — publishing skipped`;
    await cancelJobRow(job.id, reason);
    jobLog(job.id, post.id, `→ cancelled (${reason})`);
    return { outcome: 'CANCELLED', reason };
  }

  if (account.status !== 'CONNECTED') {
    const reason =
      account.status === 'EXPIRED'
        ? 'Account token expired — reconnect in Connected Accounts'
        : `Account is ${account.status} — publishing skipped`;
    await db.postTarget.update({
      where: { id: target.id },
      data: { status: 'FAILED', error: reason },
    });
    if (account.status === 'EXPIRED') {
      await db.notification.create({
        data: {
          workspaceId: post.workspaceId,
          type: 'ACCOUNT_EXPIRED',
          title: 'Reconnect required',
          body: `${PLATFORM_LABEL[account.platform]} account @${account.username}: ${reason}`,
        },
      });
    }
    await cancelJobRow(job.id, reason);
    jobLog(job.id, post.id, `→ cancelled (account ${account.status})`);
    return { outcome: 'CANCELLED', reason };
  }

  const attemptNumber = job.attempts + 1;
  const isDemo = account.isDemo;
  const attemptInput = {
    jobId: job.id,
    postId: post.id,
    targetId: target.id,
    attemptNumber,
  };

  // -- 2. Mark the post as PUBLISHING ---------------------------------------
  await db.post.updateMany({
    where: { id: post.id },
    data: { status: 'PUBLISHING' },
  });

  // -- 3. Execute publisher --------------------------------------------------
  const media: PublisherMedia[] = post.media.map((m) => ({ id: m.id, type: m.type, url: m.url }));
  const composedText = composeText(post);

  let token = '';
  if (!isDemo) {
    if (!account.accessTokenEnc) {
      // Honest failure: there is nothing to authenticate with.
      const failure: PublishResult = {
        ok: false,
        permanent: true,
        error: 'Account access token missing — reconnect in Connected Accounts',
      };
      await markAccountExpired(account, post.workspaceId, failure.error);
      await recordAttempt({ ...attemptInput, result: failure });
      return writeFailureState(job, post, target, attemptNumber, failure);
    }
    try {
      token = decryptSecret(account.accessTokenEnc);
    } catch (err) {
      const failure: PublishResult = {
        ok: false,
        permanent: true,
        error: `Account access token unreadable (${err instanceof Error ? err.message : 'decrypt failed'}) — reconnect in Connected Accounts`,
      };
      await markAccountExpired(account, post.workspaceId, failure.error);
      await recordAttempt({ ...attemptInput, result: failure });
      return writeFailureState(job, post, target, attemptNumber, failure);
    }
  }

  const ctx: PublisherContext = {
    jobId: job.id,
    post: { id: post.id, content: post.content, hashtags: post.hashtags },
    account: {
      id: account.id,
      platform: account.platform,
      externalId: account.externalId,
      username: account.username,
      scopes: account.scopes,
    },
    token,
    composedText,
    media,
    publicUrl: (m: PublisherMedia) => publicMediaUrl(m.url),
  };

  if (!isDemo) await throttleRealPublish(account.id, account.platform);

  const publisher: Publisher = isDemo ? demoPublisher : REAL_PUBLISHERS[account.platform];

  let result: PublishResult;
  try {
    result = await publisher(ctx);
  } catch (err) {
    // Publisher bug or unexpected error — retryable, never a fabricated success.
    result = {
      ok: false,
      permanent: false,
      error: `Publisher crashed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // -- 4. Record PublishingAttempt (ALWAYS) ----------------------------------
  await recordAttempt({ ...attemptInput, result });

  if (result.ok) {
    // -- 5. Success path -----------------------------------------------------
    await completeJobRow(job.id);
    await db.postTarget.update({
      where: { id: target.id },
      data: {
        status: 'PUBLISHED',
        externalPostId: result.externalPostId,
        publishedAt: new Date(),
        error: null,
      },
    });
    const remainingTargets = await db.postTarget.count({
      where: { postId: post.id, status: { not: 'PUBLISHED' } },
    });
    if (remainingTargets === 0) {
      await db.post.updateMany({
        where: { id: post.id, status: { not: 'PUBLISHED' } },
        data: { status: 'PUBLISHED', publishedAt: new Date(), failureReason: null },
      });
    }
    await db.notification.create({
      data: {
        workspaceId: post.workspaceId,
        type: 'POST_PUBLISHED',
        title: 'Post published',
        body: `Published to ${PLATFORM_LABEL[account.platform]}${isDemo ? ' (demo)' : ''}`,
      },
    });
    await db.auditLog.create({
      data: {
        workspaceId: post.workspaceId,
        actorId: null,
        action: 'POST_PUBLISHED',
        entity: 'PostTarget',
        entityId: target.id,
        meta: {
          platform: account.platform,
          externalPostId: result.externalPostId,
          attempt: attemptNumber,
          demo: isDemo,
        },
      },
    });
    jobLog(
      job.id,
      post.id,
      `attempt=${attemptNumber} → ok externalPostId=${result.externalPostId}${isDemo ? ' [demo]' : ` [${account.platform}]`}`,
    );
    return { outcome: 'COMPLETED', externalPostId: result.externalPostId, demo: isDemo };
  }

  // -- 6. Failure paths -------------------------------------------------------
  const errorText = result.error.slice(0, 2000);
  const permanent = result.permanent || attemptNumber >= job.maxAttempts;

  // 401/403 mean the token is dead → account EXPIRED + reconnect notification.
  if (result.httpStatus === 401 || result.httpStatus === 403) {
    await markAccountExpired(account, post.workspaceId, 'Token rejected by the platform — reconnect in Connected Accounts');
  }

  if (!permanent) {
    // Retryable: requeue with exponential backoff. Target/post stay untouched.
    const delayMs = backoffDelayMs(attemptNumber);
    await rescheduleJobForRetry(job.id, attemptNumber, errorText, delayMs);
    jobLog(job.id, post.id, `attempt=${attemptNumber} → retry(delayMs=${delayMs}) ${errorText}`);
    return { outcome: 'RETRY_SCHEDULED', delayMs, error: errorText };
  }

  return writeFailureState(job, post, target, attemptNumber, result);
}
