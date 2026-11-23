'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';
import type { PostDTO, SessionPayload } from '@smm/shared';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { HashtagInput } from '@/components/views/posts/hashtag-input';
import { TargetAccountsPicker } from '@/components/views/posts/target-accounts-picker';

const MAX_CONTENT = 5000;

/** The preset publish time for posts created from a calendar day: 09:00 local. */
function presetScheduledAt(date: Date): Date {
  const d = new Date(date);
  d.setHours(9, 0, 0, 0);
  return d;
}

/**
 * Minimal create dialog launched from a calendar day. Content is created as a
 * DRAFT with scheduledAt preset to 09:00 local; when the user may schedule,
 * the schedule endpoint is called right after creation.
 */
export function CreatePostDialog({
  date,
  session,
  open,
  onOpenChange,
  onCreated,
}: {
  date: Date;
  session: SessionPayload;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (post: PostDTO) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [targetIds, setTargetIds] = useState<string[]>([]);

  const canSchedule = session.permissions.includes('post:schedule');
  const scheduledAt = presetScheduledAt(date);

  const create = useMutation({
    mutationFn: async () => {
      const created = await apiPost<PostDTO>('/posts', {
        content: content.trim(),
        hashtags,
        targetAccountIds: targetIds,
        status: 'DRAFT',
        scheduledAt: scheduledAt.toISOString(),
      });
      if (canSchedule) {
        await apiPost<PostDTO>(`/posts/${created.id}/schedule`, {
          scheduledAt: scheduledAt.toISOString(),
        });
      }
      return created;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      toast({
        title: canSchedule
          ? `Scheduled for ${format(scheduledAt, 'MMM d, HH:mm')}`
          : 'Draft created — needs approval/scheduling',
        description: canSchedule ? created.content.slice(0, 80) : undefined,
      });
      onCreated?.(created);
      onOpenChange(false);
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Could not create post',
        description:
          err instanceof ApiError
            ? err.message
            : 'Unexpected error. Please try again.',
      });
    },
  });

  const canSave = content.trim().length > 0 && !create.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!create.isPending) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-base">
            New post for {format(date, 'EEEE, MMMM d')}
          </DialogTitle>
          <DialogDescription>
            {canSchedule
              ? `It will be scheduled for ${format(scheduledAt, "MMM d 'at' HH:mm")} (local time).`
              : 'It will be saved as a draft preset for 09:00 — a manager can then approve and schedule it.'}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="calendar-create-content">Content</Label>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {content.length}/{MAX_CONTENT}
              </span>
            </div>
            <Textarea
              id="calendar-create-content"
              value={content}
              maxLength={MAX_CONTENT}
              rows={5}
              placeholder="What do you want to share?"
              onChange={(e) => setContent(e.target.value)}
              className="text-[13px]"
            />
          </div>

          <div className="space-y-2">
            <Label>Hashtags</Label>
            <HashtagInput
              value={hashtags}
              onChange={setHashtags}
              disabled={create.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label>Target accounts</Label>
            <TargetAccountsPicker
              value={targetIds}
              onChange={setTargetIds}
              disabled={create.isPending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={create.isPending}
          >
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} disabled={!canSave}>
            {create.isPending && <Loader2 className="size-4 animate-spin" />}
            {canSchedule ? 'Create & schedule' : 'Save as draft'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
