'use client';

import type { Platform } from '@smm/shared';
import { PLATFORM_META } from '@smm/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Official platform brand colors — used exclusively for platform identity
 * dots/chips, never as general UI accent colors.
 */
export const PLATFORM_COLORS: Record<Platform, string> = {
  FACEBOOK: '#1877F2',
  INSTAGRAM: '#E1306C',
  PINTEREST: '#E60023',
};

export function PlatformDot({ platform, className }: { platform: Platform; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block size-2.5 shrink-0 rounded-full', className)}
      style={{ backgroundColor: PLATFORM_COLORS[platform] }}
    />
  );
}

const ORDERED: Platform[] = ['FACEBOOK', 'INSTAGRAM', 'PINTEREST'];

const PLATFORM_BLURBS: Record<Platform, string> = {
  FACEBOOK: 'Publish, engage and measure Page posts via the Meta Graph API.',
  INSTAGRAM: 'Business and Creator accounts via the official Instagram Platform API.',
  PINTEREST: 'Create and schedule Pins via Pinterest API v5.',
};

export function PlatformStrip() {
  return (
    <section id="platforms" aria-labelledby="platforms-heading" className="scroll-mt-16 py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="max-w-2xl">
          <h2 id="platforms-heading" className="text-2xl font-semibold tracking-tight md:text-3xl">
            Built on official platform APIs, never automation
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            SMM publishes, engages and measures through each platform&apos;s own API — no scraping,
            no unofficial workarounds, no bots.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {ORDERED.map((platform) => (
            <div
              key={platform}
              className="rounded-lg border bg-card p-5 transition-shadow hover:shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <PlatformDot platform={platform} className="size-3" />
                  <h3 className="text-sm font-semibold">{PLATFORM_META[platform].name}</h3>
                </div>
                <Badge
                  variant="outline"
                  className="text-[10px] font-medium text-muted-foreground"
                >
                  Official API
                </Badge>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {PLATFORM_BLURBS[platform]}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
