import { Controller, Get, Module, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.module';
import { PrismaModule } from '../../common/prisma.module';
import { AuthGuard, requirePermission, type AuthContext } from '../../common/auth.guard';
import { CurrentAuth } from '../../common/current-auth.decorator';
import { PLATFORMS, POST_STATUSES, type AnalyticsSummaryDTO, type PostStatus } from '@smm/shared';
import type { Platform } from '@prisma/client';

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

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

@Controller('analytics')
@UseGuards(AuthGuard)
export class AnalyticsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('summary')
  async summary(
    @CurrentAuth() auth: AuthContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<AnalyticsSummaryDTO> {
    requirePermission(auth, 'analytics:read');
    const { fromD, toD } = parseRange(from, to);

    const [statusRows, aiAgg, targetRows, recentPosts, realAccount] = await Promise.all([
      this.prisma.post.groupBy({
        by: ['status'],
        where: {
          workspaceId: auth.workspaceId,
          OR: [{ createdAt: { gte: fromD, lte: toD } }, { scheduledAt: { gte: fromD, lte: toD } }],
        },
        _count: { _all: true },
      }),
      this.prisma.aiUsage.aggregate({
        where: { workspaceId: auth.workspaceId, createdAt: { gte: new Date(Date.now() - 30 * 864e5) } },
        _sum: { credits: true },
      }),
      this.prisma.postTarget.findMany({
        where: { post: { workspaceId: auth.workspaceId } },
        select: { platform: true, status: true },
      }),
      this.prisma.post.findMany({
        where: { workspaceId: auth.workspaceId },
        include: { targets: { select: { platform: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 5,
      }),
      this.prisma.socialAccount.findFirst({ where: { workspaceId: auth.workspaceId, isDemo: false } }),
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

    return {
      totals,
      aiCreditsUsed30d: aiAgg._sum.credits ?? 0,
      byPlatform,
      recent: recentPosts.map((p) => ({
        id: p.id,
        status: p.status as PostStatus,
        platform: (p.targets[0]?.platform ?? null) as Platform | null,
        publishedAt: p.publishedAt?.toISOString() ?? null,
        title: p.content.slice(0, 60),
      })),
      platformInsightsAvailable: Boolean(realAccount),
    };
  }

  @Get('export.csv')
  async exportCsv(@CurrentAuth() auth: AuthContext, @Query('from') from?: string, @Query('to') to?: string): Promise<string> {
    requirePermission(auth, 'analytics:read');
    const where = from || to
      ? {
          workspaceId: auth.workspaceId,
          createdAt: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : { workspaceId: auth.workspaceId };
    const posts = await this.prisma.post.findMany({
      where,
      include: { targets: { select: { platform: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5000,
    });
    const rows = [
      ['id', 'status', 'platforms', 'scheduled_at', 'published_at', 'content'].join(','),
      ...posts.map((p) =>
        [
          p.id,
          p.status,
          p.targets.map((t) => t.platform).join('|'),
          p.scheduledAt?.toISOString() ?? '',
          p.publishedAt?.toISOString() ?? '',
          csvEscape(p.content.replace(/\r?\n/g, ' ')),
        ].join(','),
      ),
    ];
    return rows.join('\r\n');
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [AnalyticsController],
})
export class AnalyticsModule {}
