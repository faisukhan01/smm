/**
 * DELETE + PATCH /api/v1/workspace/invites/:id — ported from NestJS
 * WorkspaceController.revokeInvite (DELETE) and revokeInviteFallback (PATCH
 * with body { status: "REVOKED" }, for clients that cannot issue DELETE).
 * Both are @HttpCode(204) in the Nest API. Only PENDING invites transition
 * to REVOKED (writing an INVITE_REVOKED audit entry); already-processed
 * invites are silently left untouched — and unknown ids 404, exactly as in
 * the former API.
 */
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { notFound } from '@/lib/server/api/errors';
import { handleError, noContent, parseBody } from '@/lib/server/api/handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const revokeInviteSchema = z.object({
  status: z.literal('REVOKED'),
});

/** Records an audit trail entry for a workspace mutation (common/audit). */
async function writeAudit(input: {
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

/** Shared revoke flow (Nest private revoke()). */
async function revoke(workspaceId: string, actorId: string, id: string): Promise<void> {
  const invite = await db.invite.findFirst({
    where: { id, workspaceId },
  });
  if (!invite) throw notFound('Not found');
  if (invite.status === 'PENDING') {
    await db.invite.update({ where: { id: invite.id }, data: { status: 'REVOKED' } });
    await writeAudit({
      workspaceId,
      actorId,
      action: 'INVITE_REVOKED',
      entity: 'Invite',
      entityId: invite.id,
      meta: { email: invite.email },
    });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const auth = await requireAuth();
    requirePermission(auth, 'team:manage');
    await revoke(auth.workspaceId, auth.userId, id);
    return noContent();
  } catch (err) {
    return handleError(err);
  }
}

/** Fallback revoke route (some clients cannot issue DELETE). */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const auth = await requireAuth();
    requirePermission(auth, 'team:manage');
    await parseBody(req, revokeInviteSchema);
    await revoke(auth.workspaceId, auth.userId, id);
    return noContent();
  } catch (err) {
    return handleError(err);
  }
}
