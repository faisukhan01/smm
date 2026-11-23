'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BillingDTO, PlanTier, SessionPayload } from '@smm/shared';
import { PLANS, PLAN_TIERS, roleHas } from '@smm/shared';
import { Check, CreditCard } from 'lucide-react';
import { apiGet, apiPost } from '@/lib/api/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { LoadError, MutedAlert, PermGateButton, errorMessage } from '@/components/views/settings/ui';

const SUBSCRIPTION_BADGE: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: 'Active', className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  TRIALING: { label: 'Trialing', className: 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  PAST_DUE: { label: 'Past due', className: 'border-red-500/25 bg-red-500/10 text-red-600 dark:text-red-400' },
  CANCELED: { label: 'Canceled', className: 'border-border bg-secondary text-secondary-foreground' },
  UNPAID: { label: 'Unpaid', className: 'border-border bg-secondary text-secondary-foreground' },
};

interface UsageRowProps {
  label: string;
  used: number;
  limit: number;
}

function UsageRow({ label, used, limit }: UsageRowProps) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[13px]">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">
          {used} / {limit}
        </span>
      </div>
      <Progress value={pct} aria-label={`${label} usage: ${used} of ${limit}`} />
    </div>
  );
}

interface PlanCardProps {
  tier: PlanTier;
  currentPlan: PlanTier;
  canManage: boolean;
  onSwitch: (tier: PlanTier) => void;
  switching: boolean;
}

function PlanCard({ tier, currentPlan, canManage, onSwitch, switching }: PlanCardProps) {
  const plan = PLANS[tier];
  const isCurrent = tier === currentPlan;
  const isDowngrade = PLAN_TIERS.indexOf(tier) < PLAN_TIERS.indexOf(currentPlan);

  return (
    <Card className={cn('flex flex-col rounded-lg', isCurrent && 'ring-1 ring-primary')}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold tracking-tight">{plan.name}</CardTitle>
          {isCurrent ? (
            <Badge variant="secondary" className="rounded text-[10px] font-medium uppercase tracking-wide">
              Current
            </Badge>
          ) : null}
        </div>
        <p className="text-xl font-semibold tabular-nums tracking-tight">
          ${plan.priceMonthly}
          <span className="text-xs font-normal text-muted-foreground"> /mo</span>
        </p>
        <CardDescription className="text-xs leading-relaxed">{plan.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <ul className="space-y-1.5">
          {plan.features.slice(0, 4).map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-[13px] leading-snug">
              <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              {feature}
            </li>
          ))}
        </ul>
        <div className="mt-auto">
          {isCurrent ? (
            <Button variant="outline" size="sm" className="w-full" disabled>
              Current plan
            </Button>
          ) : !canManage ? (
            <PermGateButton
              allowed={false}
              deniedMessage="Changing the plan requires the billing:manage permission (Owner)."
              size="sm"
              className="w-full"
            >
              Switch to {plan.name}
            </PermGateButton>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" className="w-full">
                  Switch to {plan.name}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Switch to {plan.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Your workspace plan will change to {plan.name} at ${plan.priceMonthly}/month.
                    {isDowngrade ? ' Some limits will apply immediately.' : ''}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction disabled={switching} onClick={() => onSwitch(tier)}>
                    {switching ? 'Switching…' : 'Confirm switch'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function BillingSettings({ session }: { session: SessionPayload }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const canManageBilling = roleHas(session.role, 'billing:manage');

  const billingQ = useQuery({
    queryKey: ['billing'],
    queryFn: () => apiGet<BillingDTO>('/billing'),
  });

  const planMut = useMutation({
    mutationFn: (plan: PlanTier) => apiPost<BillingDTO>('/billing/plan', { plan }),
    onSuccess: (billing) => {
      queryClient.invalidateQueries({ queryKey: ['billing'] });
      toast({ title: `Plan switched to ${PLANS[billing.plan].name}` });
    },
    onError: (e) => toast({ title: 'Could not change plan', description: errorMessage(e), variant: 'destructive' }),
  });

  if (billingQ.isLoading) {
    return (
      <div className="space-y-4">
        <Card className="rounded-lg">
          <CardHeader className="gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64" />
          </CardHeader>
          <CardContent className="space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </CardContent>
        </Card>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (billingQ.isError) {
    return <LoadError message={errorMessage(billingQ.error)} onRetry={() => void billingQ.refetch()} />;
  }

  if (!billingQ.data) return null;
  const billing = billingQ.data;
  const subBadge = SUBSCRIPTION_BADGE[billing.subscriptionStatus] ?? {
    label: billing.subscriptionStatus,
    className: 'border-border bg-secondary text-secondary-foreground',
  };

  return (
    <div className="space-y-4">
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* Current plan */}
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-sm font-semibold tracking-tight">Current plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2.5">
              <CreditCard className="size-4 text-muted-foreground" aria-hidden="true" />
              <p className="text-lg font-semibold tracking-tight">{billing.planLimits.name}</p>
              <Badge variant="outline" className={cn('h-5 rounded px-1.5 text-[10px] font-medium', subBadge.className)}>
                {subBadge.label}
              </Badge>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">{billing.planLimits.description}</p>
            <MutedAlert title="Payments">
              {billing.paymentNote}
            </MutedAlert>
          </CardContent>
        </Card>

        {/* Usage */}
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle className="text-sm font-semibold tracking-tight">Usage</CardTitle>
            <CardDescription className="text-xs">Current consumption against plan limits.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <UsageRow label="AI credits (30 days)" used={billing.usage.aiCredits.used} limit={billing.usage.aiCredits.limit} />
            <UsageRow label="Connected accounts" used={billing.usage.accounts.used} limit={billing.usage.accounts.limit} />
            <UsageRow label="Posts (last 30 days)" used={billing.usage.posts30d.used} limit={billing.usage.posts30d.limit} />
            <UsageRow label="Team members" used={billing.usage.members.used} limit={billing.usage.members.limit} />
            <UsageRow label="Storage (MB)" used={billing.usage.storageMb.used} limit={billing.usage.storageMb.limit} />
          </CardContent>
        </Card>
      </div>

      {/* Plans */}
      <div>
        <p className="mb-3 text-[13px] font-medium">Plans</p>
        <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-4">
          {PLAN_TIERS.map((tier) => (
            <PlanCard
              key={tier}
              tier={tier}
              currentPlan={billing.plan}
              canManage={canManageBilling}
              switching={planMut.isPending}
              onSwitch={(t) => planMut.mutate(t)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
