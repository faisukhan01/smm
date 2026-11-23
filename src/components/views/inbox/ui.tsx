'use client';

import type { Platform } from '@smm/shared';
import { cn } from '@/lib/utils';

/** Platform dot colors — shared by the inbox list and thread panes. */
export const PLATFORM_DOT_COLOR: Record<Platform, string> = {
  FACEBOOK: '#1877F2',
  INSTAGRAM: '#E1306C',
  PINTEREST: '#E60023',
};

export function PlatformDot({ platform, className }: { platform: Platform; className?: string }) {
  return (
    <span
      className={cn('inline-block size-2.5 shrink-0 rounded-full', className)}
      style={{ backgroundColor: PLATFORM_DOT_COLOR[platform] }}
      aria-hidden="true"
    />
  );
}
