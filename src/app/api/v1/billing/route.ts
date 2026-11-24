/**
 * GET /api/v1/billing — ported from NestJS BillingController.get.
 * Returns the current plan with REAL usage counters (AI credits this UTC
 * month, connected social accounts, posts created in the last 30 days,
 * active members, storage used by post media). Nothing is estimated.
 */
import { PLANS, type BillingDTO, type PlanLimits, type PlanTier } from '@smm/shared';
import { db } from '@/lib/db';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { handleError, ok } from '@/lib/server/api/handler';

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

export async function GET(): Promise<Response> {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'workspace:read');
    return ok(await buildBillingDTO(auth.workspaceId));
  } catch (err) {
    return handleError(err);
  }
}
