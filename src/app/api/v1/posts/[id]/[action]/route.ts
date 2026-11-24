/**
 * POST /api/v1/posts/:id/:action — ported from NestJS PostsController's
 * action endpoints (mini-services/api/src/modules/posts/posts.module.ts).
 *
 * EXACT action list (there is no `reject` in the former API):
 *   submit       → post:draft     DRAFT → PENDING_APPROVAL (+ notification)
 *   approve      → post:approve   PENDING_APPROVAL → APPROVED (+ audit)
 *   schedule     → post:schedule  APPROVED|SCHEDULED → SCHEDULED, creates/
 *                  refreshes a PublishingJob per target with idempotency key
 *                  `post:{postId}:target:{targetId}`
 *   publish-now  → post:schedule  APPROVED|SCHEDULED|FAILED → PUBLISHING now
 *   cancel       → post:schedule  SCHEDULED|APPROVED|PENDING_APPROVAL|FAILED
 *                  → CANCELLED (jobs cancelled, PUBLISHED targets untouched)
 *   duplicate    → post:draft     new DRAFT copy (content/hashtags/media/origin)
 *   retry        → post:schedule  FAILED → PUBLISHING, re-queues failed targets
 *
 * Unknown action names answer 404 `Cannot POST /api/v1/posts/{id}/{action}`,
 * the same response the Nest router produced for unmatched routes.
 */
import { db } from '@/lib/db';
import { requireAuth, requirePermission, type AuthContext } from '@/lib/server/api/context';
import { ApiError, badRequest, notFound } from '@/lib/server/api/errors';
import { handleError, ok, parseBody } from '@/lib/server/api/handler';
import { schedulePostSchema, type PostStatus } from '@smm/shared';
import {
  INCLUDE,
  loadPlan,
  mapPost,
  setStatus,
  writeAudit,
  type PostWithRelations,
} from '@/lib/server/posts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ACTIONS = ['submit', 'approve', 'schedule', 'publish-now', 'cancel', 'duplicate', 'retry'] as const;
type PostsAction = (typeof ACTIONS)[number];

// ---------------------------------------------------------------------------
// Per-action handlers — direct ports of the controller methods
// ---------------------------------------------------------------------------

/** POST /posts/:id/submit — post:draft. */
async function submitPost(auth: AuthContext, id: string): Promise<unknown> {
  requirePermission(auth, 'post:draft');
  const post = await setStatus(auth, id, 'DRAFT', 'PENDING_APPROVAL');
  await db.postTarget.updateMany({ where: { postId: id }, data: { status: 'PENDING_APPROVAL' } });
  await db.notification.create({
    data: {
      workspaceId: auth.workspaceId,
      type: 'APPROVAL_REQUESTED',
      title: 'Approval requested',
      body: `A post was submitted for approval by ${auth.role === 'OWNER' ? 'the workspace owner' : 'a team member'}.`,
    },
  });
  return mapPost(post);
}

/** POST /posts/:id/approve — post:approve. */
async function approvePost(auth: AuthContext, id: string): Promise<unknown> {
  requirePermission(auth, 'post:approve');
  const post = await setStatus(auth, id, 'PENDING_APPROVAL', 'APPROVED');
  await db.postTarget.updateMany({
    where: { postId: id, status: 'PENDING_APPROVAL' },
    data: { status: 'APPROVED' },
  });
  await writeAudit({
    workspaceId: auth.workspaceId,
    actorId: auth.userId,
    action: 'POST_APPROVED',
    entity: 'Post',
    entityId: id,
  });
  return mapPost(post);
}

/** POST /posts/:id/schedule — post:schedule. */
async function schedulePost(req: Request, auth: AuthContext, id: string): Promise<unknown> {
  requirePermission(auth, 'post:schedule');
  const body = await parseBody(req, schedulePostSchema);
  const post = await db.post.findFirst({
    where: { id, workspaceId: auth.workspaceId },
    include: { targets: true },
  });
  if (!post) throw notFound('Post not found');
  if (post.status !== 'APPROVED' && post.status !== 'SCHEDULED') {
    throw badRequest('Only approved posts can be scheduled');
  }
  const runAt = new Date(body.scheduledAt);
  if (Number.isNaN(runAt.getTime()) || runAt.getTime() <= Date.now()) {
    throw badRequest('Scheduled time must be in the future');
  }
  if (!post.targets.length) {
    throw badRequest('Add at least one target account before scheduling');
  }

  const plan = await loadPlan(auth.workspaceId);
  await db.$transaction(async (tx) => {
    await tx.post.update({
      where: { id: post.id },
      data: { status: 'SCHEDULED', scheduledAt: runAt, failureReason: null },
    });
    await tx.postTarget.updateMany({
      where: { postId: post.id },
      data: { status: 'SCHEDULED', error: null },
    });
    for (const target of post.targets) {
      const key = `post:${post.id}:target:${target.id}`;
      const existing = await tx.publishingJob.findUnique({ where: { idempotencyKey: key } });
      if (existing) {
        await tx.publishingJob.update({
          where: { idempotencyKey: key },
          data: { status: 'PENDING', runAt, attempts: 0, lockedAt: null, lastError: null },
        });
      } else {
        await tx.publishingJob.create({
          data: {
            postId: post.id,
            targetId: target.id,
            runAt,
            driver: process.env.QUEUE_DRIVER || 'db',
            idempotencyKey: key,
          },
        });
      }
    }
  });
  await writeAudit({
    workspaceId: auth.workspaceId,
    actorId: auth.userId,
    action: 'POST_SCHEDULED',
    entity: 'Post',
    entityId: post.id,
    meta: { scheduledAt: runAt.toISOString(), driver: plan.tier },
  });
  const updated: PostWithRelations = await db.post.findUniqueOrThrow({
    where: { id: post.id },
    include: INCLUDE,
  });
  return mapPost(updated);
}

/** POST /posts/:id/publish-now — post:schedule. */
async function publishNowPost(auth: AuthContext, id: string): Promise<unknown> {
  requirePermission(auth, 'post:schedule');
  const post = await db.post.findFirst({
    where: { id, workspaceId: auth.workspaceId },
    include: { targets: true },
  });
  if (!post) throw notFound('Post not found');
  const allowed = ['APPROVED', 'SCHEDULED', 'FAILED'] as PostStatus[];
  if (!allowed.includes(post.status as PostStatus)) {
    throw badRequest('Only approved or scheduled posts can be published now');
  }
  if (!post.targets.length) throw badRequest('Add at least one target account first');

  await db.$transaction(async (tx) => {
    await tx.post.update({
      where: { id: post.id },
      data: { status: 'PUBLISHING', failureReason: null },
    });
    await tx.postTarget.updateMany({
      where: { postId: post.id, status: { in: ['APPROVED', 'SCHEDULED', 'FAILED'] } },
      data: { status: 'PUBLISHING', error: null },
    });
    for (const target of post.targets) {
      const key = `post:${post.id}:target:${target.id}`;
      const existing = await tx.publishingJob.findUnique({ where: { idempotencyKey: key } });
      if (existing) {
        await tx.publishingJob.update({
          where: { idempotencyKey: key },
          data: { status: 'PENDING', runAt: new Date(), attempts: 0, lockedAt: null, lastError: null },
        });
      } else {
        await tx.publishingJob.create({
          data: {
            postId: post.id,
            targetId: target.id,
            runAt: new Date(),
            driver: process.env.QUEUE_DRIVER || 'db',
            idempotencyKey: key,
          },
        });
      }
    }
  });
  await writeAudit({
    workspaceId: auth.workspaceId,
    actorId: auth.userId,
    action: 'POST_PUBLISH_NOW',
    entity: 'Post',
    entityId: post.id,
  });
  const updated: PostWithRelations = await db.post.findUniqueOrThrow({
    where: { id: post.id },
    include: INCLUDE,
  });
  return mapPost(updated);
}

/** POST /posts/:id/cancel — post:schedule. */
async function cancelPost(auth: AuthContext, id: string): Promise<unknown> {
  requirePermission(auth, 'post:schedule');
  const post = await setStatus(
    auth,
    id,
    undefined,
    'CANCELLED',
    ['SCHEDULED', 'APPROVED', 'PENDING_APPROVAL', 'FAILED'],
  );
  await db.postTarget.updateMany({
    where: { postId: id, status: { notIn: ['PUBLISHED'] } },
    data: { status: 'CANCELLED' },
  });
  await db.publishingJob.updateMany({
    where: { postId: id, status: { in: ['PENDING', 'PROCESSING', 'FAILED'] } },
    data: { status: 'CANCELLED' },
  });
  await writeAudit({
    workspaceId: auth.workspaceId,
    actorId: auth.userId,
    action: 'POST_CANCELLED',
    entity: 'Post',
    entityId: id,
  });
  return mapPost(post);
}

/** POST /posts/:id/duplicate — post:draft. */
async function duplicatePost(auth: AuthContext, id: string): Promise<unknown> {
  requirePermission(auth, 'post:draft');
  const post = await db.post.findFirst({
    where: { id, workspaceId: auth.workspaceId },
    include: { media: true },
  });
  if (!post) throw notFound('Post not found');
  const copy = await db.post.create({
    data: {
      workspaceId: auth.workspaceId,
      authorId: auth.userId,
      content: post.content,
      hashtags: [...post.hashtags],
      status: 'DRAFT',
      origin: post.origin,
      media: {
        connect: post.media.filter((m) => m.postId === post.id).map((m) => ({ id: m.id })),
      },
    },
    include: INCLUDE,
  });
  await writeAudit({
    workspaceId: auth.workspaceId,
    actorId: auth.userId,
    action: 'POST_DUPLICATED',
    entity: 'Post',
    entityId: copy.id,
    meta: { sourcePostId: post.id },
  });
  return mapPost(copy);
}

/** POST /posts/:id/retry — post:schedule. */
async function retryPost(auth: AuthContext, id: string): Promise<unknown> {
  requirePermission(auth, 'post:schedule');
  const post = await db.post.findFirst({
    where: { id, workspaceId: auth.workspaceId },
    include: { targets: true },
  });
  if (!post) throw notFound('Post not found');
  if (post.status !== 'FAILED') throw badRequest('Only failed posts can be retried');

  const failedTargets = post.targets.filter((t) => t.status === 'FAILED');
  if (!failedTargets.length) throw badRequest('No failed targets to retry');

  const runAt = post.scheduledAt && post.scheduledAt > new Date() ? post.scheduledAt : new Date();
  await db.$transaction(async (tx) => {
    await tx.post.update({
      where: { id: post.id },
      data: { status: 'PUBLISHING', failureReason: null },
    });
    await tx.postTarget.updateMany({
      where: { id: { in: failedTargets.map((t) => t.id) } },
      data: { status: 'PUBLISHING', error: null },
    });
    for (const target of failedTargets) {
      const key = `post:${post.id}:target:${target.id}`;
      await tx.publishingJob.upsert({
        where: { idempotencyKey: key },
        create: {
          postId: post.id,
          targetId: target.id,
          runAt,
          driver: process.env.QUEUE_DRIVER || 'db',
          idempotencyKey: key,
        },
        update: { status: 'PENDING', runAt, attempts: 0, lockedAt: null, lastError: null },
      });
    }
  });
  await writeAudit({
    workspaceId: auth.workspaceId,
    actorId: auth.userId,
    action: 'POST_RETRY',
    entity: 'Post',
    entityId: post.id,
    meta: { targets: failedTargets.length },
  });
  const updated: PostWithRelations = await db.post.findUniqueOrThrow({
    where: { id: post.id },
    include: INCLUDE,
  });
  return mapPost(updated);
}

const HANDLERS: Record<PostsAction, (req: Request, auth: AuthContext, id: string) => Promise<unknown>> = {
  submit: (_req, auth, id) => submitPost(auth, id),
  approve: (_req, auth, id) => approvePost(auth, id),
  schedule: (req, auth, id) => schedulePost(req, auth, id),
  'publish-now': (_req, auth, id) => publishNowPost(auth, id),
  cancel: (_req, auth, id) => cancelPost(auth, id),
  duplicate: (_req, auth, id) => duplicatePost(auth, id),
  retry: (_req, auth, id) => retryPost(auth, id),
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
): Promise<Response> {
  try {
    const { id, action } = await params;
    // Route-level 404 first, exactly like the Nest router (which never even
    // reached the AuthGuard for unmatched action names).
    if (!(ACTIONS as readonly string[]).includes(action)) {
      throw new ApiError(404, `Cannot POST /api/v1/posts/${id}/${action}`);
    }
    const auth = await requireAuth();
    return ok(await HANDLERS[action as PostsAction](req, auth, id));
  } catch (err) {
    return handleError(err);
  }
}
