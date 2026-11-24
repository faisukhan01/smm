/**
 * GET /api/v1/analytics/summary — ported from NestJS AnalyticsController.summary.
 * Honest-numbers policy: every figure below is computed from real publishing
 * records (Post/PostTarget status, AiUsage credits). Nothing is extrapolated
 * or fabricated; platform insights are only advertised when a real (non-demo)
 * social account exists.
 */
import { PLATFORMS, type AnalyticsSummaryDTO, type PostStatus } from '@smm/shared';
import { db } from '@/lib/db';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { handleError, ok, query } from '@/lib/server/api/handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Parses a from/to query pair. Date-only strings ("2026-11-23") are treated
 * as local-to-the-query calendar days: `from` becomes start-of-day UTC and
 * `to` becomes end-of-day UTC so the whole final day is included.
 */
function parseRange(from?: string, to?: string): { fromD: Date; toD: Date } {
  const isDateOnly = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const toD = to
    ? isDateOnly(to)
      ? new Date(`${to}T23:59:59.999Z`)
      : new Date(to)
    : new Date();
  const fromD = from
    ? isDateOnly(from)
      ? new Date(`${from}T00:00:00.000Z`)
      : new Date(from)
    : new Date(toD.getTime() - 30 * 864e5);
  return { fromD, toD };
}

export async function GET(req: Request): Promise<Response> {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'analytics:read');
    const q = query(req);
    const { fromD, toD } = parseRange(q.get('from') ?? undefined, q.get('to') ?? undefined);

    const [statusRows, aiAgg, targetRows, recentPosts, realAccount] = await Promise.all([
      db.post.groupBy({
        by: ['status'],
        where: {
          workspaceId: auth.workspaceId,
          OR: [{ createdAt: { gte: fromD, lte: toD } }, { scheduledAt: { gte: fromD, lte: toD } }],
        },
        _count: { _all: true },
      }),
      db.aiUsage.aggregate({
        where: { workspaceId: auth.workspaceId, createdAt: { gte: new Date(Date.now() - 30 * 864e5) } },
        _sum: { credits: true },
      }),
      db.postTarget.findMany({
        where: { post: { workspaceId: auth.workspaceId } },
        select: { platform: true, status: true },
      }),
      db.post.findMany({
        where: { workspaceId: auth.workspaceId },
        include: { targets: { select: { platform: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
      db.socialAccount.findFirst({ where: { workspaceId: auth.workspaceId, isDemo: false } }),
    ]);

    const count = (s: PostStatus) => statusRows.find((r) => r.status === s)?._count._all ?? 0;
    const totals = {
      posts: statusRows.reduce((acc, r) => acc + r._count._all, 0),
      published: count('PUBLISHED'),
      scheduled: count('SCHEDULED'),
      failed: count('FAILED'),
      drafts: count('DRAFT'),
    };

    const byPlatform = PLATFORMS.map((platform) => ({
      platform,
      published: targetRows.filter((t) => t.platform === platform && t.status === 'PUBLISHED').length,
      failed: targetRows.filter((t) => t.platform === platform && t.status === 'FAILED').length,
    }));

    const data: AnalyticsSummaryDTO = {
      totals,
      aiCreditsUsed30d: aiAgg._sum.credits ?? 0,
      byPlatform,
      recent: recentPosts.map((p) => ({
        id: p.id,
        status: p.status as PostStatus,
        platform: (p.targets[0]?.platform ?? null) as AnalyticsSummaryDTO['recent'][number]['platform'],
        publishedAt: p.publishedAt?.toISOString() ?? null,
        title: p.content.slice(0, 60),
      })),
      platformInsightsAvailable: Boolean(realAccount),
    };
    return ok(data);
  } catch (err) {
    return handleError(err);
  }
}
