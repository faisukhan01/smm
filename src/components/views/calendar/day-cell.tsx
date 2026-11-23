'use client';

import { format } from 'date-fns';
import type { PostDTO } from '@smm/shared';
import { PlatformDot, postPlatforms, STATUS_BORDER_CLASS } from '@/components/views/posts/status-badge';
import { cn } from '@/lib/utils';

/**
 * A single month-grid cell: date number, up to 3 scheduled posts and a
 * "+N more" affordance. Clicking anywhere opens the day dialog (handled by
 * the parent via onOpen); buttons keep it keyboard reachable.
 */
export function CalendarDayCell({
  day,
  posts,
  isCurrentMonth,
  isToday,
  onOpen,
}: {
  day: Date;
  posts: PostDTO[];
  isCurrentMonth: boolean;
  isToday: boolean;
  onOpen: () => void;
}) {
  const visible = posts.slice(0, 3);
  const extra = posts.length - visible.length;

  return (
    <div
      className={cn(
        'relative flex min-h-24 flex-col items-stretch gap-1 bg-background p-1.5',
        !isCurrentMonth && 'bg-muted/40',
        isToday && 'ring-1 ring-inset ring-primary',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${format(day, 'EEEE, MMMM d')}${posts.length > 0 ? ` — ${posts.length} post${posts.length === 1 ? '' : 's'} scheduled` : ' — view this day'}`}
        className={cn(
          'w-fit rounded-sm px-1 text-[12px] font-medium tabular-nums transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          isCurrentMonth ? 'text-foreground' : 'text-muted-foreground',
          isToday && 'font-semibold text-primary',
        )}
      >
        {format(day, 'd')}
      </button>

      {visible.map((post) => {
        if (!post.scheduledAt) return null;
        const platforms = postPlatforms(post).slice(0, 3);
        return (
          <button
            key={post.id}
            type="button"
            onClick={onOpen}
            title={`${format(new Date(post.scheduledAt), 'HH:mm')} — ${post.content}`}
            className={cn(
              'flex w-full items-center gap-1 overflow-hidden rounded-sm border-l-2 px-1 py-0.5 text-left text-[11px] leading-tight transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              STATUS_BORDER_CLASS[post.status],
              !isCurrentMonth && 'opacity-60',
            )}
          >
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {format(new Date(post.scheduledAt), 'HH:mm')}
            </span>
            <span className="flex shrink-0 items-center gap-0.5" aria-hidden="true">
              {platforms.map((platform) => (
                <PlatformDot key={platform} platform={platform} className="size-1.5" />
              ))}
            </span>
            <span className="line-clamp-1 min-w-0 flex-1">{post.content}</span>
          </button>
        );
      })}

      {extra > 0 && (
        <button
          type="button"
          onClick={onOpen}
          className="w-fit rounded-sm px-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          +{extra} more
        </button>
      )}
    </div>
  );
}
