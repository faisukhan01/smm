'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addDays, format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import type { PostDTO } from '@smm/shared';
import { apiPost, ApiError } from '@/lib/api/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Format a Date for the datetime-local input (local time, "yyyy-MM-ddTHH:mm"). */
function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * Schedule dialog: pick a local date & time, posts it as an ISO string to
 * POST /posts/:id/schedule. Allowed for APPROVED and SCHEDULED posts.
 */
export function ScheduleDialog({
  post,
  open,
  onOpenChange,
  onScheduled,
}: {
  post: PostDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScheduled?: (post: PostDTO) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [value, setValue] = useState('');

  useEffect(() => {
    if (open && post) {
      // Pre-fill from the existing schedule, otherwise default to tomorrow 09:00 local.
      const base = post.scheduledAt
        ? new Date(post.scheduledAt)
        : (() => {
            const d = addDays(new Date(), 1);
            d.setHours(9, 0, 0, 0);
            return d;
          })();
      setValue(toLocalInputValue(base));
    }
  }, [open, post]);

  const schedule = useMutation({
    mutationFn: () => {
      if (!post) throw new Error('No post selected');
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        throw new Error('Pick a valid date and time first.');
      }
      return apiPost<PostDTO>(`/posts/${post.id}/schedule`, {
        scheduledAt: parsed.toISOString(),
      });
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      toast({
        title: post?.scheduledAt ? 'Schedule updated' : 'Post scheduled',
        description: updated.scheduledAt
          ? `Publishing ${format(new Date(updated.scheduledAt), 'MMM d, HH:mm')} (local time).`
          : undefined,
      });
      onScheduled?.(updated);
      onOpenChange(false);
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Could not schedule post',
        description:
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Unexpected error. Please try again.',
      });
    },
  });

  const parsed = new Date(value);
  const canSave =
    value !== '' && !Number.isNaN(parsed.getTime()) && !schedule.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!schedule.isPending) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            {post?.scheduledAt ? 'Reschedule post' : 'Schedule post'}
          </DialogTitle>
          <DialogDescription>
            Pick when this post should go out. The chosen time is sent as an ISO
            timestamp in your local timezone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="schedule-datetime">Date &amp; time</Label>
          <Input
            id="schedule-datetime"
            type="datetime-local"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="text-[13px]"
            aria-describedby="schedule-datetime-hint"
          />
          <p
            id="schedule-datetime-hint"
            className="text-[11px] text-muted-foreground"
          >
            Times are shown in your local timezone.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={schedule.isPending}
          >
            Cancel
          </Button>
          <Button onClick={() => schedule.mutate()} disabled={!canSave}>
            {schedule.isPending && <Loader2 className="size-4 animate-spin" />}
            {post?.scheduledAt ? 'Update schedule' : 'Schedule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
