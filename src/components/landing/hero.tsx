'use client';

import { Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { scrollToId } from './anchor-link';
import type { AuthTab } from './auth-dialog';
import { DashboardPreview } from './dashboard-preview';

export function Hero({ onOpenAuth }: { onOpenAuth: (tab: AuthTab) => void }) {
  return (
    <section id="top" aria-label="Introduction" className="scroll-mt-16 py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <Badge
            variant="outline"
            className="gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-muted-foreground"
          >
            <Sparkles className="size-3 text-primary" aria-hidden="true" />
            AI-powered social media management
          </Badge>

          <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight md:text-5xl">
            Your Social Media, Managed by AI.
          </h1>

          <p className="mx-auto mt-4 max-w-2xl text-balance text-[15px] leading-relaxed text-muted-foreground">
            SMM helps businesses create, schedule and publish content across Facebook, Instagram
            and Pinterest — with a brand-aware AI engine doing the heavy lifting.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button onClick={() => onOpenAuth('register')}>Start free</Button>
            <Button variant="outline" asChild>
              <a
                href="#features"
                onClick={(event) => {
                  event.preventDefault();
                  scrollToId('features');
                }}
              >
                Explore features
              </a>
            </Button>
          </div>
        </div>

        <DashboardPreview />
      </div>
    </section>
  );
}
