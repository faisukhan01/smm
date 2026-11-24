/**
 * GET / PATCH /api/v1/workspace — ported from NestJS WorkspaceController.
 * GET returns the workspace overview (profile + all members with user
 * name/email + pending invites). PATCH renames the workspace and writes an
 * audit entry. Response shapes match the former API exactly.
 */
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { UserRole } from '@smm/shared';
import { db } from '@/lib/db';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { notFound } from '@/lib/server/api/errors';
import { handleError, ok, parseBody } from '@/lib/server/api/handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const updateWorkspaceSchema = z.object({
  name: z.string().min(2).max(80),
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

export async function GET(): Promise<Response> {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'workspace:read');
    const workspace = await db.workspace.findUnique({ where: { id: auth.workspaceId } });
    if (!workspace) throw notFound('Not found');
    const [members, invites] = await Promise.all([
      db.workspaceMember.findMany({
        where: { workspaceId: workspace.id },
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      db.invite.findMany({
        where: { workspaceId: workspace.id, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return ok({
      workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug, createdAt: workspace.createdAt },
      members: members.map((m) => toMemberDTO(m)),
      invites: invites.map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role,
        status: i.status,
        expiresAt: i.expiresAt,
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: Request): Promise<Response> {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'workspace:update');
    const body = await parseBody(req, updateWorkspaceSchema);
    const workspace = await db.workspace.update({
      where: { id: auth.workspaceId },
      data: { name: body.name.trim() },
    });
    await writeAudit({
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'WORKSPACE_UPDATED',
      entity: 'Workspace',
      entityId: workspace.id,
      meta: { name: workspace.name },
    });
    return ok({ id: workspace.id, name: workspace.name, slug: workspace.slug, createdAt: workspace.createdAt });
  } catch (err) {
    return handleError(err);
  }
}
