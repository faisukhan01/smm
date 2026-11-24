/**
 * Serverless publishing engine — single entry point.
 *
 * Replaces the resident worker loop (mini-services/worker/src/main.ts + the
 * setInterval tick in queue.ts) with one processable pass per invocation: a
 * cron trigger (e.g. cron-job.org, every minute) pings
 * /api/v1/cron/publish, which calls runPublishingPass().
 *
 * One pass = reclaim stale locks → atomically claim up to `limit` due
 * PublishingJobs → run the processor on each within a soft wall-clock budget.
 * When the budget is exhausted, claimed-but-unprocessed jobs are released back
 * to PENDING so they stay due for the next invocation (no lost work, no
 * double-claims — claiming is a guarded conditional UPDATE, see queue.ts).
 */
import {
  claimDueJobs,
  reclaimStaleJobs,
  releaseClaim,
} from './queue';
import { processPublishingJob, workerLog, type JobOutcome } from './processor';

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------

/** Max jobs claimed per pass (task spec: N≈10; source worker claimed 5/tick). */
export const PUBLISH_PASS_LIMIT = 10;

/** Soft wall-clock budget per pass (~50s) — fits maxDuration=60 cron route. */
export const PUBLISH_PASS_TIME_BUDGET_MS = 50_000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PublishingPassOptions {
  /** Max due jobs to claim this pass. Defaults to PUBLISH_PASS_LIMIT (10). */
  limit?: number;
  /** Soft time budget in ms. Defaults to PUBLISH_PASS_TIME_BUDGET_MS (50s). */
  timeBudgetMs?: number;
}

export interface PublishingPassSummary {
  /** Rows reclaimed from an expired PROCESSING lock → PENDING. */
  reclaimed: number;
  /** Jobs atomically claimed this pass. */
  claimed: number;
  /** Jobs the processor actually ran (excludes budget-released claims). */
  processed: number;
  /** processor outcome tallies. */
  published: number;
  failed: number;
  retried: number;
  cancelled: number;
  skipped: number;
  /** Claims released back to PENDING because the time budget ran out. */
  releasedForBudget: number;
  budgetExceeded: boolean;
  tookMs: number;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Run one publishing pass. Never throws for per-job problems: the processor is
 * designed not to throw (an unexpected crash leaves the row PROCESSING so the
 * stale-lock reclaim retries it safely — same contract as the source worker).
 */
export async function runPublishingPass(options: PublishingPassOptions = {}): Promise<PublishingPassSummary> {
  const startedAt = Date.now();
  const limit = options.limit ?? PUBLISH_PASS_LIMIT;
  const timeBudgetMs = options.timeBudgetMs ?? PUBLISH_PASS_TIME_BUDGET_MS;
  const deadline = startedAt + timeBudgetMs;

  const summary: PublishingPassSummary = {
    reclaimed: 0,
    claimed: 0,
    processed: 0,
    published: 0,
    failed: 0,
    retried: 0,
    cancelled: 0,
    skipped: 0,
    releasedForBudget: 0,
    budgetExceeded: false,
    tookMs: 0,
  };

  // Crash-recovery safety net first (source: db tick step 1).
  try {
    summary.reclaimed = await reclaimStaleJobs();
    if (summary.reclaimed > 0) workerLog(`reclaimed ${summary.reclaimed} stale PROCESSING job(s) → PENDING`);
  } catch (err) {
    workerLog(`reclaim error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Atomically claim up to `limit` due jobs (guarded updateMany — no double-claims).
  let jobs: Awaited<ReturnType<typeof claimDueJobs>>;
  try {
    jobs = await claimDueJobs(limit);
  } catch (err) {
    workerLog(`claim error: ${err instanceof Error ? err.message : String(err)}`);
    summary.tookMs = Date.now() - startedAt;
    return summary;
  }
  summary.claimed = jobs.length;

  for (const job of jobs) {
    // Soft budget: stop processing and release remaining claims back to
    // PENDING so they stay due for the next cron invocation.
    if (Date.now() >= deadline) {
      summary.budgetExceeded = true;
      await releaseClaim(job.id);
      summary.releasedForBudget += 1;
      workerLog(`job=${job.id} time budget exhausted — released back to PENDING`);
      continue;
    }

    summary.processed += 1;
    let outcome: JobOutcome;
    try {
      outcome = await processPublishingJob(job.id);
    } catch (err) {
      // The processor is designed not to throw; if it does, leave the row
      // PROCESSING so the stale-lock reclaim retries it safely.
      workerLog(
        `job=${job.id} processor crashed: ${err instanceof Error ? err.message : String(err)} — left PROCESSING for stale-lock reclaim`,
      );
      continue;
    }

    switch (outcome.outcome) {
      case 'COMPLETED':
        summary.published += 1;
        break;
      case 'FAILED':
        summary.failed += 1;
        break;
      case 'RETRY_SCHEDULED':
        summary.retried += 1;
        break;
      case 'CANCELLED':
        summary.cancelled += 1;
        break;
      case 'SKIPPED':
        summary.skipped += 1;
        break;
    }
  }

  summary.tookMs = Date.now() - startedAt;
  workerLog(
    `pass complete: claimed=${summary.claimed} processed=${summary.processed} published=${summary.published} failed=${summary.failed} retried=${summary.retried} cancelled=${summary.cancelled} skipped=${summary.skipped} released=${summary.releasedForBudget} tookMs=${summary.tookMs}`,
  );
  return summary;
}
