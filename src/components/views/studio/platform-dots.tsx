import type { Platform } from '@smm/shared';
import { cn } from '@/lib/utils';

/** Official platform brand colors, used for small identifying dots only. */
export const PLATFORM_DOT_COLOR: Record<Platform, string> = {
  FACEBOOK: '#1877F2',
  INSTAGRAM: '#E1306C',
  PINTEREST: '#E60023',
};

export function PlatformDot({ platform, className }: { platform: Platform; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-2 shrink-0 rounded-full', className)}
      style={{ backgroundColor: PLATFORM_DOT_COLOR[platform] }}
    />
  );
}
