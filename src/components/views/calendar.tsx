'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Pencil, Plus } from 'lucide-react';
import type { PostDTO, PostStatus, SessionPayload } from '@smm/shared';
import { apiGet } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { CreatePostDialog } from './calendar/create-post-dialog';
import { CalendarDayCell } from './calendar/day-cell';
import { PostEditorDialog } from './posts/post-editor-dialog';
import { QueryErrorAlert } from './posts/query-error';
import { PlatformDot, postPlatforms, StatusBadge } from './posts/status-badge';

interface PostListResponse {
  items: PostDTO[];
  total: number;
  counts: Record<PostStatus, number>;
}

const EDITABLE_STATUSES: PostStatus[] = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SCHEDULED'];

export function CalendarView({ session }: { session: SessionPayload }) {
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [dayDialogDate, setDayDialogDate] = useState<Date | null>(null);
  const [editorPost, setEditorPost] = useState<PostDTO | null>(null);
  const [createDialogDate, setCreateDialogDate] = useState<Date | null>(null);

  // The query spans the visible grid (including leading/trailing other-month
  // days) so every rendered cell can resolve its posts.
  const gridStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
  const fromIso = gridStart.toISOString();
  const toIso = gridEnd.toISOString();

  const monthQuery = useQuery({
    queryKey: ['posts', 'calendar', fromIso, toIso],
    queryFn: () => {
      const params = new URLSearchParams({
        from: fromIso,
        to: toIso,
        pageSize: '100',
      });
      return apiGet<PostListResponse>(`/posts?${params.toString()}`);
    },
  });

  const posts = useMemo(() => monthQuery.data?.items ?? [], [monthQuery.data]);

  const byDay = useMemo(() => {
    const map = new Map<string, Array<PostDTO & { scheduledAt: string }>>();
    for (const post of posts) {
      if (!post.scheduledAt || post.status === 'CANCELLED') continue;
      const key = format(new Date(post.scheduledAt), 'yyyy-MM-dd');
      const list = map.get(key) ?? [];
      list.push(post as PostDTO & { scheduledAt: string });
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
      );
    }
    return map;
  }, [posts]);

  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const weekdayLabels = eachDayOfInterval({
    start: startOfWeek(new Date(), { weekStartsOn: 1 }),
    end: endOfWeek(new Date(), { weekStartsOn: 1 }),
  }).map((d) => format(d, 'EEE'));

  const dayKey = dayDialogDate ? format(dayDialogDate, 'yyyy-MM-dd') : '';
  const dayPosts = dayKey ? byDay.get(dayKey) ?? [] : [];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => setCursor((c) => addMonths(c, -1))}
          aria-label="Previous month"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="size-8"
          onClick={() => setCursor((c) => addMonths(c, 1))}
          aria-label="Next month"
        >
          <ChevronRight className="size-4" />
        </Button>
        <h2 className="ml-1 text-sm font-semibold tracking-tight">
          {format(cursor, 'MMMM yyyy')}
        </h2>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => setCursor(new Date())}
        >
          Today
        </Button>
        {monthQuery.data && (
          <p className="ml-auto text-xs text-muted-foreground" aria-live="polite">
            {posts.filter((p) => p.scheduledAt && p.status !== 'CANCELLED').length}{' '}
            scheduled in view
          </p>
        )}
      </div>

      {/* Month grid */}
      <div className="overflow-hidden rounded-lg border">
        <div className="grid grid-cols-7 border-b bg-muted/40">
          {weekdayLabels.map((label) => (
            <div
              key={label}
              className="px-2 py-1.5 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>

        {monthQuery.isPending ? (
          <div className="grid grid-cols-7 gap-px bg-border" aria-hidden="true">
            {Array.from({ length: 35 }, (_, i) => (
              <div key={i} className="min-h-24 bg-background p-1.5">
                <Skeleton className="h-3 w-5" />
                <Skeleton className="mt-2 h-4 w-full" />
                <Skeleton className="mt-1 h-4 w-4/5" />
              </div>
            ))}
          </div>
        ) : monthQuery.isError ? (
          <div className="p-4">
            <QueryErrorAlert
              title="Couldn't load the calendar"
              error={monthQuery.error}
              onRetry={() => monthQuery.refetch()}
            />
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-px bg-border">
            {days.map((day) => (
              <CalendarDayCell
                key={day.toISOString()}
                day={day}
                posts={byDay.get(format(day, 'yyyy-MM-dd')) ?? []}
                isCurrentMonth={isSameMonth(day, cursor)}
                isToday={isToday(day)}
                onOpen={() => setDayDialogDate(day)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Subtle hint bar for an empty month */}
      {!monthQuery.isPending && !monthQuery.isError && posts.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No posts scheduled in {format(cursor, 'MMMM yyyy')} — pick a day and plan
          your first one.
        </p>
      )}

      {/* Day dialog */}
      <Dialog
        open={dayDialogDate !== null}
        onOpenChange={(open) => {
          if (!open) setDayDialogDate(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-base">
              {dayDialogDate && format(dayDialogDate, 'EEEE, MMMM d, yyyy')}
            </DialogTitle>
            <DialogDescription>
              {dayPosts.length === 0
                ? 'Nothing scheduled for this day yet.'
                : `${dayPosts.length} post${dayPosts.length === 1 ? '' : 's'} scheduled.`}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
            {dayPosts.length === 0 ? (
              <p className="rounded-md border border-dashed px-4 py-8 text-center text-[13px] text-muted-foreground">
                Nothing here — create a post to fill this day.
              </p>
            ) : (
              dayPosts.map((post) => (
                <div
                  key={post.id}
                  className="flex items-center gap-2 rounded-md border px-2.5 py-2"
                >
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {format(new Date(post.scheduledAt), 'HH:mm')}
                  </span>
                  <span className="flex shrink-0 items-center gap-0.5" aria-hidden="true">
                    {postPlatforms(post).map((platform) => (
                      <PlatformDot key={platform} platform={platform} className="size-2" />
                    ))}
                  </span>
                  <p className="line-clamp-1 min-w-0 flex-1 text-[13px]">
                    {post.content}
                  </p>
                  <StatusBadge status={post.status} />
                  {EDITABLE_STATUSES.includes(post.status) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      disabled={!session.permissions.includes('post:edit')}
                      title={
                        session.permissions.includes('post:edit')
                          ? undefined
                          : 'Requires permission "post:edit"'
                      }
                      onClick={() => setEditorPost(post)}
                    >
                      <Pencil className="size-3.5" />
                      Edit
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>

          <DialogFooter className="sm:justify-start">
            <Button
              variant="outline"
              size="sm"
              disabled={!session.permissions.includes('post:draft')}
              title={
                session.permissions.includes('post:draft')
                  ? undefined
                  : 'Requires permission "post:draft"'
              }
              onClick={() => setCreateDialogDate(dayDialogDate)}
            >
              <Plus className="size-4" />
              Create post for this day
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog (opened from the day dialog) */}
      <PostEditorDialog
        post={editorPost}
        open={editorPost !== null}
        onOpenChange={(open) => {
          if (!open) setEditorPost(null);
        }}
      />

      {/* Create dialog (preset to the picked day at 09:00 local) */}
      {createDialogDate && (
        <CreatePostDialog
          date={createDialogDate}
          session={session}
          open={createDialogDate !== null}
          onOpenChange={(open) => {
            if (!open) setCreateDialogDate(null);
          }}
        />
      )}
    </div>
  );
}
