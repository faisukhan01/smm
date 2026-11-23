'use client';

import type { Platform, PostDTO, PostStatus } from '@smm/shared';
import { PLATFORM_LABEL } from '@smm/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Platform identity — small colored dot shown next to platform labels
// ---------------------------------------------------------------------------

export const PLATFORM_DOT_COLOR: Record<Platform, string> = {
  FACEBOOK: '#1877F2',
  INSTAGRAM: '#E1306C',
  PINTEREST: '#E60023',
};

export function PlatformDot({
  platform,
  className,
}: {
  platform: Platform;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block size-2 shrink-0 rounded-full', className)}
      style={{ backgroundColor: PLATFORM_DOT_COLOR[platform] }}
    />
  );
}

export function PlatformLabel({
  platform,
  className,
}: {
  platform: Platform;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[13px] leading-none text-foreground',
        className,
      )}
    >
      <PlatformDot platform={platform} />
      {PLATFORM_LABEL[platform]}
    </span>
  );
}

/** Unique platforms of a post (target order preserved, deduplicated). */
export function postPlatforms(post: PostDTO): Platform[] {
  return [...new Set(post.targets.map((t) => t.platform))];
}

/** Vertical dot + label stack used in table cells. */
export function PlatformLabels({
  platforms,
  className,
  emptyHint = '—',
}: {
  platforms: Platform[];
  className?: string;
  emptyHint?: string;
}) {
  const unique = [...new Set(platforms)];
  if (unique.length === 0) {
    return (
      <span className={cn('text-[13px] text-muted-foreground', className)}>
        {emptyHint}
      </span>
    );
  }
  return (
    <div className={cn('flex flex-col items-start gap-1.5', className)}>
      {unique.map((platform) => (
        <PlatformLabel key={platform} platform={platform} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Post status — badge styling + calendar left-border + human labels
// ---------------------------------------------------------------------------

export const STATUS_LABEL: Record<PostStatus, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending approval',
  APPROVED: 'Approved',
  SCHEDULED: 'Scheduled',
  PUBLISHING: 'Publishing',
  PUBLISHED: 'Published',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
};

export const STATUS_BADGE_CLASS: Record<PostStatus, string> = {
  DRAFT:
    'border-zinc-300 bg-transparent text-zinc-700 dark:border-zinc-700 dark:text-zinc-300',
  PENDING_APPROVAL:
    'border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950 dark:text-amber-300',
  APPROVED:
    'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/60 dark:bg-teal-950 dark:text-teal-300',
  SCHEDULED:
    'border-violet-200 bg-violet-100 text-violet-800 dark:border-violet-900/60 dark:bg-violet-950 dark:text-violet-300',
  PUBLISHING:
    'border-cyan-200 bg-cyan-100 text-cyan-800 dark:border-cyan-900/60 dark:bg-cyan-950 dark:text-cyan-300',
  PUBLISHED:
    'border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950 dark:text-emerald-300',
  FAILED:
    'border-red-200 bg-red-100 text-red-800 dark:border-red-900/60 dark:bg-red-950 dark:text-red-300',
  CANCELLED:
    'border-transparent bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
};

/** Left accent border colors for calendar day cells (use with border-l-2). */
export const STATUS_BORDER_CLASS: Record<PostStatus, string> = {
  DRAFT: 'border-l-zinc-300 dark:border-l-zinc-600',
  PENDING_APPROVAL: 'border-l-amber-400 dark:border-l-amber-500',
  APPROVED: 'border-l-teal-500 dark:border-l-teal-500',
  SCHEDULED: 'border-l-violet-500 dark:border-l-violet-500',
  PUBLISHING: 'border-l-cyan-500 dark:border-l-cyan-500',
  PUBLISHED: 'border-l-emerald-500 dark:border-l-emerald-500',
  FAILED: 'border-l-red-500 dark:border-l-red-500',
  CANCELLED: 'border-l-zinc-300 dark:border-l-zinc-600',
};

export function StatusBadge({
  status,
  className,
}: {
  status: PostStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn('font-medium', STATUS_BADGE_CLASS[status], className)}
    >
      {STATUS_LABEL[status]}
    </Badge>
  );
}
