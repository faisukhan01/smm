/**
 * DELETE /api/v1/media/:id — ported from NestJS MediaController.remove
 * (@HttpCode(204)). Attached media is scoped through its post; unattached
 * media may be cleaned up freely. The stored file is removed via the storage
 * abstraction (missing files tolerated — the row is deleted regardless) and a
 * MEDIA_DELETED audit entry is written.
 */
import { db } from '@/lib/db';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { notFound } from '@/lib/server/api/errors';
import { handleError, noContent } from '@/lib/server/api/handler';
import { deleteUpload } from '@/lib/server/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Records an audit trail entry (port of common/audit.ts writeAudit). */
async function writeAudit(input: {
  workspaceId: string;
  actorId?: string;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: import('@prisma/client').Prisma.InputJsonValue;
}): Promise<void> {
  await db.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      actorId: input.actorId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      meta: input.meta ?? undefined,
    },
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const auth = await requireAuth();
    requirePermission(auth, 'post:draft');
    const media = await db.postMedia.findFirst({
      where: { id },
      include: { post: { select: { workspaceId: true } } },
    });
    if (!media) throw notFound('Not found');
    // Attached media is scoped through its post; unattached media may be
    // cleaned up freely.
    if (media.post && media.post.workspaceId !== auth.workspaceId) {
      throw notFound('Not found');
    }

    try {
      await deleteUpload(media.storageKey);
    } catch {
      // File already gone or stored remotely — the row is still removed.
    }
    await db.postMedia.delete({ where: { id: media.id } });
    await writeAudit({
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'MEDIA_DELETED',
      entity: 'PostMedia',
      entityId: media.id,
      meta: { storageKey: media.storageKey },
    });
    return noContent();
  } catch (err) {
    return handleError(err);
  }
}
