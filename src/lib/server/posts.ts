/**
 * Posts domain service — ported from mini-services/api
 * src/modules/posts/posts.module.ts (PostsController + its private helpers)
 * so every /api/v1/posts route handler maps rows and enforces rules exactly
 * like the former NestJS API: identical DTO shape, status-transition messages,
 * plan quota message and audit actions.
 */
import type { Prisma, SocialAccount } from '@prisma/client';
import {
  PLANS,
  type PlanLimits,
  type PlanTier,
  type PostDTO,
  type PostStatus,
} from '@smm/shared';
import { db } from '@/lib/db';
import { badRequest, forbidden, notFound } from '@/lib/server/api/errors';
import type { AuthContext } from '@/lib/server/api/context';

type PostWithRelations = Prisma.PostGetPayload<{
  include: { media: true; targets: true; author: { select: { name: true } } };
}>;

export const INCLUDE = {
  media: true,
  targets: true,
  author: { select: { name: true } },
} as const;

export type { PostWithRelations };

/** DTO mapping — identical field names/shape as the Nest controller's mapPost. */
export function mapPost(post: PostWithRelations): PostDTO {
  return {
    id: post.id,
    content: post.content,
    hashtags: post.hashtags,
    status: post.status as PostStatus,
    origin: post.origin,
    scheduledAt: post.scheduledAt?.toISOString() ?? null,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    failureReason: post.failureReason,
    authorName: post.author.name,
    media: post.media
      .filter((m) => m.postId === post.id)
      .map((m) => ({
        id: m.id,
        type: m.type,
        url: m.url,
        aspectRatio: m.aspectRatio,
        altText: m.altText,
        provider: m.provider,
      })),
    targets: post.targets.map((t) => ({
      id: t.id,
      accountId: t.accountId,
      platform: t.platform,
      status: t.status as PostStatus,
      externalPostId: t.externalPostId,
      publishedAt: t.publishedAt?.toISOString() ?? null,
      error: t.error,
    })),
  };
}

/** Records an audit trail entry (port of common/audit.ts writeAudit). */
export async function writeAudit(input: {
  workspaceId: string;
  actorId?: string;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await db.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      actorId: input.actorId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      meta: (input.meta ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

/** Loads the workspace subscription, falling back to FREE when absent. */
export async function loadPlan(
  workspaceId: string,
): Promise<{ tier: PlanTier; limits: PlanLimits; status: string }> {
  const sub = await db.subscription.findUnique({ where: { workspaceId } });
  const tier = (sub?.plan ?? 'FREE') as PlanTier;
  return { tier, limits: PLANS[tier], status: sub?.status ?? 'ACTIVE' };
}

/**
 * Posts variant of common/plans.ts assertQuota — same 403 message.
 * `used` is the count of posts created in the last 30 days.
 */
export async function assertPostsQuota(workspaceId: string, used: number): Promise<void> {
  const plan = await loadPlan(workspaceId);
  if (used >= plan.limits.maxPostsPerMonth) {
    throw forbidden(`Post limit reached for the ${plan.limits.name} plan — upgrade in Settings → Billing`);
  }
}

/** Port of PostsController.assertAccounts. */
export async function assertAccounts(
  auth: AuthContext,
  ids: string[],
): Promise<SocialAccount[]> {
  if (!ids.length) return [];
  const accounts = await db.socialAccount.findMany({
    where: { id: { in: ids }, workspaceId: auth.workspaceId },
  });
  if (accounts.length !== new Set(ids).size) {
    throw badRequest('One or more target accounts not found in this workspace');
  }
  return accounts;
}

/** Port of PostsController.resolveMedia. */
export async function resolveMedia(
  auth: AuthContext,
  ids: string[] | undefined,
  postId?: string,
) {
  if (!ids || !ids.length) return [];
  const media = await db.postMedia.findMany({
    where: {
      id: { in: ids },
      OR: [{ post: { workspaceId: auth.workspaceId } }, { postId: null }],
    },
  });
  if (media.length !== new Set(ids).size) {
    throw badRequest('One or more media items not found');
  }
  void postId;
  return media;
}

/**
 * Port of PostsController.setStatus — either a strict from→to transition or,
 * when `allowed` is given, membership in an allowed-status list. The error
 * messages match the former API exactly.
 */
export async function setStatus(
  auth: AuthContext,
  id: string,
  from: PostStatus | undefined,
  to: PostStatus,
  allowed?: PostStatus[],
): Promise<PostWithRelations> {
  const post = await db.post.findFirst({
    where: { id, workspaceId: auth.workspaceId },
    include: INCLUDE,
  });
  if (!post) throw notFound('Post not found');
  if (allowed ? !allowed.includes(post.status as PostStatus) : post.status !== from) {
    throw badRequest(
      allowed
        ? `Cannot ${to.toLowerCase()} a post in status ${post.status}`
        : `Post must be ${from} to transition to ${to}`,
    );
  }
  await db.post.update({ where: { id: post.id }, data: { status: to } });
  return { ...post, status: to };
}
