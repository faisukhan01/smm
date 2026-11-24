/**
 * POST /api/v1/billing/plan — ported from NestJS BillingController.changePlan.
 * Changes the workspace plan (applies immediately; no payment provider yet),
 * writes an audit entry, notifies the workspace, then returns the fresh
 * billing snapshot — the exact same shape as GET /api/v1/billing.
 */
import type { Prisma } from '@prisma/client';
import { PLANS, planChangeSchema, type BillingDTO, type PlanLimits, type PlanTier } from '@smm/shared';
import { db } from '@/lib/db';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { badRequest } from '@/lib/server/api/errors';
import { handleError, ok, parseBody } from '@/lib/server/api/handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAYMENT_NOTE =
  'Payment provider integration pending — plan changes apply immediately in this environment.';

/** Loads the workspace subscription, falling back to FREE when absent. */
async function loadPlan(workspaceId: string): Promise<{ tier: PlanTier; limits: PlanLimits; status: string }> {
  const sub = await db.subscription.findUnique({ where: { workspaceId } });
  const tier = (sub?.plan ?? 'FREE') as PlanTier;
  return { tier, limits: PLANS[tier], status: sub?.status ?? 'ACTIVE' };
}

/** Start of the current UTC calendar month (AI credit window). */
function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function thirtyDaysAgo(now = new Date()): Date {
  return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
}

async function buildBillingDTO(workspaceId: string): Promise<BillingDTO> {
  const [plan, credits, accounts, posts30d, members, storageBytes] = await Promise.all([
    loadPlan(workspaceId),
    db.aiUsage
      .aggregate({ where: { workspaceId, createdAt: { gte: monthStart() } }, _sum: { credits: true } })
      .then((agg) => agg._sum.credits ?? 0),
    db.socialAccount.count({ where: { workspaceId } }),
    db.post.count({ where: { workspaceId, createdAt: { gte: thirtyDaysAgo() } } }),
    db.workspaceMember.count({ where: { workspaceId, status: 'ACTIVE' } }),
    db.postMedia
      .aggregate({ where: { post: { workspaceId } }, _sum: { size: true } })
      .then((agg) => agg._sum.size ?? 0),
  ]);

  return {
    plan: plan.tier,
    planLimits: plan.limits,
    subscriptionStatus: plan.status,
    usage: {
      aiCredits: { used: credits, limit: plan.limits.aiCreditsPerMonth },
      accounts: { used: accounts, limit: plan.limits.maxAccounts },
      posts30d: { used: posts30d, limit: plan.limits.maxPostsPerMonth },
      members: { used: members, limit: plan.limits.maxMembers },
      storageMb: { used: Math.round((storageBytes / (1024 * 1024)) * 10) / 10, limit: plan.limits.storageMb },
    },
    paymentNote: PAYMENT_NOTE,
  };
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
    requirePermission(auth, 'billing:manage');
    const body = await parseBody(req, planChangeSchema);
    if (!PLANS[body.plan]) throw badRequest('Unknown plan');
    await db.subscription.upsert({
      where: { workspaceId: auth.workspaceId },
      create: { workspaceId: auth.workspaceId, plan: body.plan, status: 'ACTIVE', periodStart: new Date() },
      update: { plan: body.plan, status: 'ACTIVE' },
    });
    await writeAudit({
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'PLAN_CHANGED',
      entity: 'Subscription',
      meta: { plan: body.plan },
    });
    await notify({
      workspaceId: auth.workspaceId,
      type: 'PLAN_CHANGED',
      title: 'Plan changed',
      body: `This workspace is now on the ${PLANS[body.plan].name} plan.`,
    });
    return ok(await buildBillingDTO(auth.workspaceId), 201);
  } catch (err) {
    return handleError(err);
  }
}
