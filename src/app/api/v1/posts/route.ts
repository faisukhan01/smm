/**
 * GET / POST /api/v1/posts — ported from NestJS PostsController.list / create
 * (mini-services/api/src/modules/posts/posts.module.ts).
 *
 * GET honours ?page&pageSize&status&platform&from&to exactly like the former
 * API and answers { items, total, counts } — `counts` is a per-status tally
 * over the whole workspace (NOT page/pageSize, matching the Nest envelope).
 * POST creates a draft (or PENDING_APPROVAL/APPROVED) post with the plan's
 * posts-per-month quota enforced and an audit entry written.
 */
import type { Prisma } from '@prisma/client';
import { createPostSchema, POST_STATUSES, type PostStatus } from '@smm/shared';
import { db } from '@/lib/db';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { handleError, ok, parseBody, query } from '@/lib/server/api/handler';
import {
  assertAccounts,
  assertPostsQuota,
  INCLUDE,
  mapPost,
  resolveMedia,
  writeAudit,
} from '@/lib/server/posts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'post:read');
    const url = query(req);
    const status = url.get('status') ?? undefined;
    const platform = url.get('platform') ?? undefined;
    const from = url.get('from') ?? undefined;
    const to = url.get('to') ?? undefined;
    const page = url.get('page') ?? undefined;
    const pageSize = url.get('pageSize') ?? undefined;

    const p = Math.max(1, Number(page) || 1);
    const size = Math.min(100, Math.max(1, Number(pageSize) || 20));

    const where: Prisma.PostWhereInput = { workspaceId: auth.workspaceId };
    if (status && (POST_STATUSES as readonly string[]).includes(status)) {
      where.status = status as PostStatus;
    }
    if (platform && ['FACEBOOK', 'INSTAGRAM', 'PINTEREST'].includes(platform)) {
      where.targets = { some: { platform: platform as 'FACEBOOK' | 'INSTAGRAM' | 'PINTEREST' } };
    }
    if (from || to) {
      const range: Prisma.DateTimeFilter = {};
      if (from) range.gte = new Date(from);
      if (to) range.lte = new Date(to);
      where.OR = [{ createdAt: range }, { scheduledAt: range }, { publishedAt: range }];
    }

    const [rows, total, statusRows] = await Promise.all([
      db.post.findMany({
        where,
        include: INCLUDE,
        orderBy: { updatedAt: 'desc' },
        skip: (p - 1) * size,
        take: size,
      }),
      db.post.count({ where }),
      db.post.groupBy({
        by: ['status'],
        where: { workspaceId: auth.workspaceId },
        _count: { _all: true },
      }),
    ]);

    const counts = Object.fromEntries(
      POST_STATUSES.map((s) => [s, statusRows.find((r) => r.status === s)?._count._all ?? 0]),
    ) as Record<PostStatus, number>;

    return ok({ items: rows.map(mapPost), total, counts });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'post:draft');
    const body = await parseBody(req, createPostSchema);

    const used = await db.post.count({
      where: { workspaceId: auth.workspaceId, createdAt: { gte: new Date(Date.now() - 30 * 864e5) } },
    });
    await assertPostsQuota(auth.workspaceId, used);

    const media = await resolveMedia(auth, body.mediaIds);
    const accounts = await assertAccounts(auth, body.targetAccountIds);
    const byId = new Map(accounts.map((a) => [a.id, a]));

    const post = await db.post.create({
      data: {
        workspaceId: auth.workspaceId,
        authorId: auth.userId,
        content: body.content,
        hashtags: body.hashtags,
        status: body.status,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        aiModel: body.aiModel ?? null,
        aiPrompt: body.aiPrompt ?? null,
        media: { connect: media.map((m) => ({ id: m.id })) },
        targets: {
          create: body.targetAccountIds.map((accountId) => ({
            accountId,
            platform: byId.get(accountId)!.platform,
            status: body.status === 'APPROVED' ? 'APPROVED' : 'PENDING_APPROVAL',
          })),
        },
      },
      include: INCLUDE,
    });
    await writeAudit({
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'POST_CREATED',
      entity: 'Post',
      entityId: post.id,
    });
    return ok(mapPost(post));
  } catch (err) {
    return handleError(err);
  }
}
