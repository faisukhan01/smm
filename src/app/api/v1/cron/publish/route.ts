/**
 * Cron-triggered publishing route — replaces the resident worker process.
 *
 * A free external cron (cron-job.org) pings this endpoint every minute; each
 * ping runs one publishing pass (reclaim stale locks → atomically claim up to
 * 10 due PublishingJobs → process within a ~50s soft budget).
 *
 * Auth:
 *   - CRON_SECRET set → requires `?key=CRON_SECRET` (cron-job.org custom
 *     query param) OR `authorization: Bearer CRON_SECRET` (Vercel Cron style).
 *     Otherwise 401.
 *   - CRON_SECRET unset (sandbox/dev) → allowed; the route still only
 *     processes due jobs, so an open ping cannot publish anything early.
 */
import { NextResponse } from 'next/server';
import { handleError } from '@/lib/server/api/handler';
import { runPublishingPass, PUBLISH_PASS_LIMIT, PUBLISH_PASS_TIME_BUDGET_MS } from '@/lib/server/publishing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // sandbox/dev — no secret configured, allow

  const url = new URL(req.url);
  if (url.searchParams.get('key') === secret) return true;

  const auth = req.headers.get('authorization') ?? '';
  return auth === `Bearer ${secret}`;
}

async function runCronPass(req: Request): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const summary = await runPublishingPass({
      limit: PUBLISH_PASS_LIMIT,
      timeBudgetMs: PUBLISH_PASS_TIME_BUDGET_MS,
    });
    return NextResponse.json({
      processed: summary.processed,
      published: summary.published,
      failed: summary.failed,
      retried: summary.retried,
      // Terminal cancel-outs (deleted target/post, disconnected account) are
      // reported under `skipped` — they are neither published, failed, nor retried.
      skipped: summary.skipped + summary.cancelled,
      tookMs: summary.tookMs,
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function GET(req: Request): Promise<Response> {
  return runCronPass(req);
}

export async function POST(req: Request): Promise<Response> {
  return runCronPass(req);
}
