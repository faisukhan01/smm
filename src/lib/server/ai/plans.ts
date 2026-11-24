/**
 * AI credit metering — mirrors the former NestJS API's common/plans.ts
 * (the subset the AI module needs). Credits are asserted BEFORE any SDK
 * call is spent, then recorded in AiUsage after success.
 */
import { forbidden } from '@/lib/server/api/errors';
import { PLANS, type PlanLimits, type PlanTier } from '@smm/shared';
import { db } from '@/lib/db';

export const AI_CREDITS_EXHAUSTED = 'AI credits exhausted for this month — upgrade in Settings → Billing';

export interface PlanContext {
  tier: PlanTier;
  limits: PlanLimits;
  status: string;
}

/** Loads the workspace subscription, falling back to FREE when absent. */
export async function loadPlan(workspaceId: string): Promise<PlanContext> {
  const sub = await db.subscription.findUnique({ where: { workspaceId } });
  const tier = (sub?.plan ?? 'FREE') as PlanTier;
  return { tier, limits: PLANS[tier], status: sub?.status ?? 'ACTIVE' };
}

/** Start of the current UTC calendar month (AI credit window). */
export function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Throws 403 (with the plan-upgrade hint) when consuming `cost` AI credits
 * would exceed the monthly allowance of the workspace's plan.
 */
export async function assertAiCredits(workspaceId: string, cost = 1): Promise<PlanContext> {
  const plan = await loadPlan(workspaceId);
  const agg = await db.aiUsage.aggregate({
    where: { workspaceId, createdAt: { gte: monthStart() } },
    _sum: { credits: true },
  });
  const used = agg._sum.credits ?? 0;
  if (used + cost > plan.limits.aiCreditsPerMonth) {
    throw forbidden(AI_CREDITS_EXHAUSTED);
  }
  return plan;
}
