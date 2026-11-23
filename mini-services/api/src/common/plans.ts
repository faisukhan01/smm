import { ForbiddenException } from '@nestjs/common';
import { PLANS, type PlanLimits, type PlanTier } from '@smm/shared';
import type { PrismaService } from './prisma.module';

export const AI_CREDITS_EXHAUSTED = 'AI credits exhausted for this month — upgrade in Settings → Billing';

export interface PlanContext {
  tier: PlanTier;
  limits: PlanLimits;
  status: string;
}

/** Loads the workspace subscription, falling back to FREE when absent. */
export async function loadPlan(prisma: PrismaService, workspaceId: string): Promise<PlanContext> {
  const sub = await prisma.subscription.findUnique({ where: { workspaceId } });
  const tier = (sub?.plan ?? 'FREE') as PlanTier;
  return { tier, limits: PLANS[tier], status: sub?.status ?? 'ACTIVE' };
}

/** Start of the current UTC calendar month (AI credit window). */
export function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function thirtyDaysAgo(now = new Date()): Date {
  return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
}

function quotaMessage(kind: 'accounts' | 'members' | 'posts', planName: string): string {
  const noun = kind === 'accounts' ? 'Account' : kind === 'members' ? 'Member' : 'Post';
  return `${noun} limit reached for the ${planName} plan — upgrade in Settings → Billing`;
}

/** Throws ForbiddenException when the current usage count already saturates the plan quota. */
export async function assertQuota(
  prisma: PrismaService,
  workspaceId: string,
  kind: 'accounts' | 'members' | 'posts',
  used: number,
): Promise<PlanContext> {
  const plan = await loadPlan(prisma, workspaceId);
  const max =
    kind === 'accounts'
      ? plan.limits.maxAccounts
      : kind === 'members'
        ? plan.limits.maxMembers
        : plan.limits.maxPostsPerMonth;
  if (used >= max) throw new ForbiddenException(quotaMessage(kind, plan.limits.name));
  return plan;
}

/** Throws ForbiddenException when consuming `cost` AI credits would exceed the monthly allowance. */
export async function assertAiCredits(
  prisma: PrismaService,
  workspaceId: string,
  cost = 1,
): Promise<PlanContext> {
  const plan = await loadPlan(prisma, workspaceId);
  const agg = await prisma.aiUsage.aggregate({
    where: { workspaceId, createdAt: { gte: monthStart() } },
    _sum: { credits: true },
  });
  const used = agg._sum.credits ?? 0;
  if (used + cost > plan.limits.aiCreditsPerMonth) {
    throw new ForbiddenException(AI_CREDITS_EXHAUSTED);
  }
  return plan;
}

export async function countPostsLast30d(prisma: PrismaService, workspaceId: string): Promise<number> {
  return prisma.post.count({ where: { workspaceId, createdAt: { gte: thirtyDaysAgo() } } });
}

export async function countActiveMembers(prisma: PrismaService, workspaceId: string): Promise<number> {
  return prisma.workspaceMember.count({ where: { workspaceId, status: 'ACTIVE' } });
}

export async function countSocialAccounts(prisma: PrismaService, workspaceId: string): Promise<number> {
  return prisma.socialAccount.count({ where: { workspaceId } });
}

export async function sumAiCreditsThisMonth(prisma: PrismaService, workspaceId: string): Promise<number> {
  const agg = await prisma.aiUsage.aggregate({
    where: { workspaceId, createdAt: { gte: monthStart() } },
    _sum: { credits: true },
  });
  return agg._sum.credits ?? 0;
}

export async function sumStorageBytes(prisma: PrismaService, workspaceId: string): Promise<number> {
  const agg = await prisma.postMedia.aggregate({
    where: { post: { workspaceId } },
    _sum: { size: true },
  });
  return agg._sum.size ?? 0;
}
