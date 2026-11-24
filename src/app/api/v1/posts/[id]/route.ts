/**
 * GET / PATCH / DELETE /api/v1/posts/:id — ported from NestJS
 * PostsController.get / update / remove
 * (mini-services/api/src/modules/posts/posts.module.ts).
 *
 * PATCH keeps the former editability window (DRAFT, PENDING_APPROVAL,
 * APPROVED, SCHEDULED), recreates targets atomically when targetAccountIds is
 * sent, re-attaches unattached media and reschedules PUBLISHING jobs when the
 * scheduledAt of an already-scheduled post moves. DELETE only removes drafts.
 */
import type { Prisma } from '@prisma/client';
import { updatePostSchema, type PostStatus } from '@smm/shared';
import { db } from '@/lib/db';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { badRequest, notFound } from '@/lib/server/api/errors';
import { handleError, ok, parseBody } from '@/lib/server/api/handler';
import {
  assertAccounts,
  INCLUDE,
  mapPost,
  resolveMedia,
  writeAudit,
  type PostWithRelations,
} from '@/lib/server/posts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const auth = await requireAuth();
    requirePermission(auth, 'post:read');
    const post = await db.post.findFirst({
      where: { id, workspaceId: auth.workspaceId },
      include: INCLUDE,
    });
    if (!post) throw notFound('Post not found');
    return ok(mapPost(post));
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const auth = await requireAuth();
    requirePermission(auth, 'post:edit');
    const body = await parseBody(req, updatePostSchema);

    const post = await db.post.findFirst({
      where: { id, workspaceId: auth.workspaceId },
      include: INCLUDE,
    });
    if (!post) throw notFound('Post not found');
    const editable: PostStatus[] = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SCHEDULED'];
    if (!editable.includes(post.status as PostStatus)) {
      throw badRequest('Post can no longer be edited');
    }
    if (body.targetAccountIds) await assertAccounts(auth, body.targetAccountIds);
    if (body.mediaIds) await resolveMedia(auth, body.mediaIds, id);

    const data: Prisma.PostUpdateInput = {};
    if (body.content !== undefined) data.content = body.content;
    if (body.hashtags !== undefined) data.hashtags = body.hashtags;
    if (body.scheduledAt !== undefined) {
      data.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    }

    if (body.targetAccountIds) {
      const accounts = await assertAccounts(auth, body.targetAccountIds);
      const byId = new Map(accounts.map((a) => [a.id, a]));
      await db.$transaction(async (tx) => {
        await tx.post.update({ where: { id: post.id }, data });
        await tx.postTarget.deleteMany({ where: { postId: post.id } });
        if (body.targetAccountIds!.length) {
          await tx.postTarget.createMany({
            data: body.targetAccountIds!.map((accountId) => ({
              postId: post.id,
              accountId,
              platform: byId.get(accountId)!.platform,
              status: post.status === 'APPROVED' ? 'APPROVED' : 'PENDING_APPROVAL',
            })),
          });
        }
        if (body.mediaIds) {
          await tx.postMedia.updateMany({
            where: { id: { in: body.mediaIds }, post: { workspaceId: auth.workspaceId } },
            data: { postId: post.id },
          });
        }
        if (body.scheduledAt !== undefined && post.status === 'SCHEDULED') {
          await tx.publishingJob.updateMany({
            where: { postId: post.id, status: { in: ['PENDING', 'FAILED', 'CANCELLED'] } },
            data: {
              runAt: body.scheduledAt ? new Date(body.scheduledAt) : new Date(),
              status: 'PENDING',
              attempts: 0,
            },
          });
        }
      });
    } else {
      await db.$transaction(async (tx) => {
        await tx.post.update({ where: { id: post.id }, data });
        if (body.mediaIds) {
          await tx.postMedia.updateMany({
            where: { id: { in: body.mediaIds }, post: { workspaceId: auth.workspaceId } },
            data: { postId: post.id },
          });
        }
        if (body.scheduledAt !== undefined && post.status === 'SCHEDULED') {
          await tx.publishingJob.updateMany({
            where: { postId: post.id, status: { in: ['PENDING', 'FAILED', 'CANCELLED'] } },
            data: {
              runAt: body.scheduledAt ? new Date(body.scheduledAt) : new Date(),
              status: 'PENDING',
              attempts: 0,
            },
          });
        }
      });
    }

    await writeAudit({
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'POST_UPDATED',
      entity: 'Post',
      entityId: post.id,
    });
    const updated: PostWithRelations = await db.post.findUniqueOrThrow({
      where: { id: post.id },
      include: INCLUDE,
    });
    return ok(mapPost(updated));
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const auth = await requireAuth();
    requirePermission(auth, 'post:delete');
    const post = await db.post.findFirst({ where: { id, workspaceId: auth.workspaceId } });
    if (!post) throw notFound('Post not found');
    if (post.status !== 'DRAFT') throw badRequest('Only drafts can be deleted');
    await db.post.delete({ where: { id } });
    await writeAudit({
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'POST_DELETED',
      entity: 'Post',
      entityId: id,
    });
    return ok(null);
  } catch (err) {
    return handleError(err);
  }
}
