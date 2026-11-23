'use client';

import { Check } from 'lucide-react';
import { PLANS, PLAN_TIERS } from '@smm/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { AuthTab } from './auth-dialog';

export function Pricing({ onOpenAuth }: { onOpenAuth: (tab: AuthTab) => void }) {
  return (
    <section id="pricing" aria-labelledby="pricing-heading" className="scroll-mt-16 py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="max-w-2xl">
          <h2 id="pricing-heading" className="text-2xl font-semibold tracking-tight md:text-3xl">
            Simple pricing that scales with you
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            Start free and upgrade when your publishing grows. Every plan includes official API
            publishing and the brand-aware AI engine.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PLAN_TIERS.map((tier) => {
            const plan = PLANS[tier];
            const isPopular = tier === 'PROFESSIONAL';
            return (
              <div
                key={tier}
                className={cn(
                  'relative flex flex-col rounded-lg border bg-card p-5 transition-shadow hover:shadow-sm',
                  isPopular && 'ring-1 ring-primary',
                )}
              >
                {isPopular && (
                  <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-medium">
                    Most popular
                  </Badge>
                )}

                <h3 className="text-sm font-semibold">{plan.name}</h3>

                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold tracking-tight">
                    {plan.priceMonthly === 0 ? 'Free' : `$${plan.priceMonthly}`}
                  </span>
                  {plan.priceMonthly > 0 && (
                    <span className="text-sm text-muted-foreground">/ month</span>
                  )}
                </div>

                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {plan.description}
                </p>

                <ul className="mt-5 flex-1 space-y-2.5">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2.5 text-sm text-muted-foreground"
                    >
                      <Check
                        className="mt-0.5 size-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      {feature}
                    </li>
                  ))}
                </ul>

                <Button className="mt-6 w-full" onClick={() => onOpenAuth('register')}>
                  {plan.priceMonthly === 0 ? 'Start free' : 'Get started'}
                </Button>
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground">
          Plan limits are enforced platform-wide — no credit card required to start. Payment
          provider integration pending.
        </p>
      </div>
    </section>
  );
}
