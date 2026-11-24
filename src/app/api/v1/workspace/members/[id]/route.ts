/**
 * PATCH + DELETE /api/v1/workspace/members/:id — ported from NestJS
 * WorkspaceController.updateMemberRole and removeMember.
 *
 * Role-change rules (owner protection, as in the former API):
 *  - the target member's role must be one of ADMIN/MANAGER/EDITOR/VIEWER;
 *  - a member whose role is OWNER can never be changed (400 "The workspace
 *    owner role cannot be changed");
 *  - requires `team:manage` (OWNER/ADMIN).
 *
 * Removal rules:
 *  - the workspace OWNER can never be removed (400 "The workspace owner
 *    cannot be removed");
 *  - you cannot remove yourself (400 "You cannot remove yourself");
 *  - unknown members 404.
 */
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { UserRole } from '@smm/shared';
import { db } from '@/lib/db';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { badRequest, notFound } from '@/lib/server/api/errors';
import { handleError, noContent, ok, parseBody } from '@/lib/server/api/handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const memberRoleSchema = z.object({
  role: z.enum(['ADMIN', 'MANAGER', 'EDITOR', 'VIEWER']),
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

/** Same member DTO mapping as the Nest controller's toMemberDTO. */
function toMemberDTO(member: { id: string; userId: string; role: string; status: string; createdAt: Date; user: { name: string; email: string } }) {
  return {
    id: member.id,
    userId: member.userId,
    name: member.user.name,
    email: member.user.email,
    role: member.role as UserRole,
    status: member.status,
    createdAt: member.createdAt,
  };
}

/** Nest private findMember(): workspace-scoped lookup, 404 when absent. */
async function findMember(workspaceId: string, memberId: string) {
  const member = await db.workspaceMember.findFirst({
    where: { id: memberId, workspaceId },
  });
  if (!member) throw notFound('Not found');
  return member;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const { id } = await params;
    const auth = await requireAuth();
    requirePermission(auth, 'team:manage');
    const body = await parseBody(req, memberRoleSchema);
    const member = await findMember(auth.workspaceId, id);
    if (member.role === 'OWNER') {
      throw badRequest('The workspace owner role cannot be changed');
    }
    const previousRole = member.role;
    const updated = await db.workspaceMember.update({
      where: { id: member.id },
      data: { role: body.role },
      include: { user: { select: { name: true, email: true } } },
    });
    await writeAudit({
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'MEMBER_ROLE_CHANGED',
      entity: 'WorkspaceMember',
      entityId: updated.id,
      meta: { userId: updated.userId, from: previousRole, to: body.role },
    });
    return ok(toMemberDTO(updated));
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
    requirePermission(auth, 'team:manage');
    const member = await findMember(auth.workspaceId, id);
    if (member.role === 'OWNER') throw badRequest('The workspace owner cannot be removed');
    if (member.userId === auth.userId) throw badRequest('You cannot remove yourself');
    await db.workspaceMember.delete({ where: { id: member.id } });
    await writeAudit({
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'MEMBER_REMOVED',
      entity: 'WorkspaceMember',
      entityId: member.id,
      meta: { userId: member.userId, role: member.role },
    });
    return noContent();
  } catch (err) {
    return handleError(err);
  }
}
