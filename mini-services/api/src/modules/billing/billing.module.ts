import { BadRequestException, Body, Controller, Get, Module, Post, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.module';
import { PrismaModule } from '../../common/prisma.module';
import { AuthGuard, requirePermission, type AuthContext } from '../../common/auth.guard';
import { CurrentAuth } from '../../common/current-auth.decorator';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { writeAudit } from '../../common/audit';
import { notify } from '../../common/notify';
import {
  countActiveMembers,
  countPostsLast30d,
  countSocialAccounts,
  loadPlan,
  sumAiCreditsThisMonth,
  sumStorageBytes,
} from '../../common/plans';
import { planChangeSchema, PLANS, type BillingDTO } from '@smm/shared';
import { z } from 'zod';

const PAYMENT_NOTE =
  'Payment provider integration pending — plan changes apply immediately in this environment.';

@Controller('billing')
@UseGuards(AuthGuard)
export class BillingController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get(@CurrentAuth() auth: AuthContext): Promise<BillingDTO> {
    requirePermission(auth, 'workspace:read');
    const workspaceId = auth.workspaceId;
    const [plan, credits, accounts, posts30d, members, storageBytes] = await Promise.all([
      loadPlan(this.prisma, workspaceId),
      sumAiCreditsThisMonth(this.prisma, workspaceId),
      countSocialAccounts(this.prisma, workspaceId),
      countPostsLast30d(this.prisma, workspaceId),
      countActiveMembers(this.prisma, workspaceId),
      sumStorageBytes(this.prisma, workspaceId),
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
        storageMb: { used: Math.round(storageBytes / (1024 * 1024) * 10) / 10, limit: plan.limits.storageMb },
      },
      paymentNote: PAYMENT_NOTE,
    };
  }

  @Post('plan')
  async changePlan(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(planChangeSchema)) body: z.infer<typeof planChangeSchema>,
  ): Promise<BillingDTO> {
    requirePermission(auth, 'billing:manage');
    if (!PLANS[body.plan]) throw new BadRequestException('Unknown plan');
    await this.prisma.subscription.upsert({
      where: { workspaceId: auth.workspaceId },
      create: { workspaceId: auth.workspaceId, plan: body.plan, status: 'ACTIVE', periodStart: new Date() },
      update: { plan: body.plan, status: 'ACTIVE' },
    });
    await writeAudit(this.prisma, {
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'PLAN_CHANGED',
      entity: 'Subscription',
      meta: { plan: body.plan },
    });
    await notify(this.prisma, {
      workspaceId: auth.workspaceId,
      type: 'PLAN_CHANGED',
      title: 'Plan changed',
      body: `This workspace is now on the ${PLANS[body.plan].name} plan.`,
    });
    return this.get(auth);
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [BillingController],
})
export class BillingModule {}
