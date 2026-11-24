/**
 * Session payload builder — extracted verbatim from
 * mini-services/api/src/modules/auth/auth.service.ts `buildSession`.
 * Wire contract: { user: {...}, workspace: {...}, role, permissions }.
 */
import { ROLE_PERMISSIONS, type PlanTier, type SessionPayload, type UserRole } from '@smm/shared';
import { db } from '@/lib/db';

export async function buildSessionPayload(userId: string, workspaceId: string): Promise<SessionPayload> {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const membership = await db.workspaceMember.findUniqueOrThrow({
    where: { workspaceId_userId: { workspaceId, userId } },
    include: { workspace: { include: { subscription: true } } },
  });
  const role = membership.role as UserRole;
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
    },
    workspace: {
      id: membership.workspace.id,
      name: membership.workspace.name,
      slug: membership.workspace.slug,
      plan: (membership.workspace.subscription?.plan ?? 'FREE') as PlanTier,
    },
    role,
    permissions: ROLE_PERMISSIONS[role],
  };
}
