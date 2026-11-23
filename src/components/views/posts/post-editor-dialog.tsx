'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import type { PostDTO } from '@smm/shared';
import { apiPatch, ApiError } from '@/lib/api/client';
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
import { HashtagInput } from './hashtag-input';
import { TargetAccountsPicker } from './target-accounts-picker';
import { StatusBadge } from './status-badge';

const MAX_CONTENT = 5000;
const MAX_MEDIA = 10;

/**
 * Edit dialog for posts still in an editable state (DRAFT, PENDING_APPROVAL,
 * APPROVED, SCHEDULED). Edits content, hashtags, targets and removes existing
 * media; new media uploads belong to Content Studio.
 */
export function PostEditorDialog({
  post,
  open,
  onOpenChange,
  onSaved,
}: {
  post: PostDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (post: PostDTO) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [mediaIds, setMediaIds] = useState<string[]>([]);

  // Hydrate the draft state every time the dialog opens for a post.
  useEffect(() => {
    if (open && post) {
      setContent(post.content);
      setHashtags(post.hashtags);
      setTargetIds(post.targets.map((t) => t.accountId));
      setMediaIds(post.media.map((m) => m.id));
    }
  }, [open, post]);

  const save = useMutation({
    mutationFn: () => {
      if (!post) throw new Error('No post selected');
      return apiPatch<PostDTO>(`/posts/${post.id}`, {
        content: content.trim(),
        hashtags,
        targetAccountIds: targetIds,
        mediaIds,
      });
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      queryClient.invalidateQueries({ queryKey: ['analytics'] });
      toast({ title: 'Post updated' });
      onSaved?.(updated);
      onOpenChange(false);
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Could not save post',
        description:
          err instanceof ApiError
            ? err.message
            : 'Unexpected error. Please try again.',
      });
    },
  });

  const visibleMedia = (post?.media ?? []).filter((m) => mediaIds.includes(m.id));
  const canSave =
    content.trim().length > 0 && content.length <= MAX_CONTENT && !save.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!save.isPending) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            Edit post
            {post && <StatusBadge status={post.status} />}
          </DialogTitle>
          <DialogDescription>
            Update the content, hashtags, targets and attachments. This does not
            change the post&rsquo;s schedule.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="post-editor-content">Content</Label>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {content.length}/{MAX_CONTENT}
              </span>
            </div>
            <Textarea
              id="post-editor-content"
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
              disabled={save.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label>Target accounts</Label>
            <TargetAccountsPicker
              value={targetIds}
              onChange={setTargetIds}
              disabled={save.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label>Media</Label>
            {visibleMedia.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">
                No media attached to this post.
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {visibleMedia.map((media) => (
                  <div
                    key={media.id}
                    className="group relative overflow-hidden rounded-md border"
                  >
                    <img
                      src={media.url}
                      alt={media.altText ?? 'Post media'}
                      loading="lazy"
                      className="aspect-square size-full bg-muted object-cover"
                    />
                    <button
                      type="button"
                      disabled={save.isPending}
                      onClick={() =>
                        setMediaIds((ids) => ids.filter((id) => id !== media.id))
                      }
                      aria-label={`Remove media${media.altText ? `: ${media.altText}` : ''}`}
                      className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              You can keep or remove existing attachments here — up to{' '}
              {MAX_MEDIA}. Uploading new media happens in Content Studio.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={save.isPending}
          >
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={!canSave}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
