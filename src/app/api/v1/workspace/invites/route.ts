/**
 * POST /api/v1/workspace/invites — ported from NestJS WorkspaceController.createInvite.
 * Creates a 7-day pending invite after enforcing the plan's member quota
 * (active members + pending invites), rejecting duplicates (already a member
 * / already a pending invite). Audit + notification follow the Nest flow.
 *
 * Note: the former API exposed no GET /workspace/invites route (invites are
 * embedded in GET /workspace), so none is provided here either.
 */
import type { Prisma } from '@prisma/client';
import { inviteSchema, PLANS } from '@smm/shared';
import { db } from '@/lib/db';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { conflict, forbidden } from '@/lib/server/api/errors';
import { handleError, ok, parseBody } from '@/lib/server/api/handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Loads the workspace subscription, falling back to FREE when absent (common/plans). */
async function loadPlan(workspaceId: string) {
  const sub = await db.subscription.findUnique({ where: { workspaceId } });
  const tier = sub?.plan ?? 'FREE';
  return { tier, limits: PLANS[tier], status: sub?.status ?? 'ACTIVE' };
}

function quotaMessage(kind: 'accounts' | 'members' | 'posts', planName: string): string {
  const noun = kind === 'accounts' ? 'Account' : kind === 'members' ? 'Member' : 'Post';
  return `${noun} limit reached for the ${planName} plan — upgrade in Settings → Billing`;
}

/** Throws 403 when the current usage count already saturates the plan quota (common/plans). */
async function assertQuota(
  workspaceId: string,
  kind: 'accounts' | 'members' | 'posts',
  used: number,
) {
  const plan = await loadPlan(workspaceId);
  const max =
    kind === 'accounts'
      ? plan.limits.maxAccounts
      : kind === 'members'
        ? plan.limits.maxMembers
        : plan.limits.maxPostsPerMonth;
  if (used >= max) throw forbidden(quotaMessage(kind, plan.limits.name));
  return plan;
}

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

/** Creates a workspace-scoped in-app notification (common/notify). */
async function notify(input: { workspaceId: string; type: string; title: string; body?: string | null }): Promise<void> {
  await db.notification.create({
    data: {
      workspaceId: input.workspaceId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
    },
  });
}

export async function POST(req: Request): Promise<Response> {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'team:manage');
    const body = await parseBody(req, inviteSchema);
    const [memberCount, pendingInvites] = await Promise.all([
      db.workspaceMember.count({ where: { workspaceId: auth.workspaceId, status: 'ACTIVE' } }),
      db.invite.count({ where: { workspaceId: auth.workspaceId, status: 'PENDING' } }),
    ]);
    await assertQuota(auth.workspaceId, 'members', memberCount + pendingInvites);

    const email = body.email.toLowerCase().trim();
    const existingMember = await db.workspaceMember.findFirst({
      where: { workspaceId: auth.workspaceId, user: { email } },
    });
    if (existingMember) throw conflict('This person is already a member of the workspace');
    const existingInvite = await db.invite.findFirst({
      where: { workspaceId: auth.workspaceId, email, status: 'PENDING' },
    });
    if (existingInvite) throw conflict('An invite for this email is already pending');

    const invite = await db.invite.create({
      data: {
        workspaceId: auth.workspaceId,
        email,
        role: body.role,
        invitedById: auth.userId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    await writeAudit({
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'INVITE_CREATED',
      entity: 'Invite',
      entityId: invite.id,
      meta: { email, role: invite.role },
    });
    await notify({
      workspaceId: auth.workspaceId,
      type: 'INVITE_CREATED',
      title: 'Team invite sent',
      body: `${email} was invited as ${body.role.toLowerCase()}.`,
    });
    return ok(
      {
        invite: {
          id: invite.id,
          email: invite.email,
          role: invite.role,
          status: invite.status,
          expiresAt: invite.expiresAt,
        },
        note: 'Email delivery is not configured — share the invite manually for now.',
      },
      201,
    );
  } catch (err) {
    return handleError(err);
  }
}
