'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Lightbulb, Loader2, X } from 'lucide-react';
import type { AccountDTO, MediaDTO, PostDTO, SessionPayload } from '@smm/shared';
import { PLATFORMS, PLATFORM_LABEL } from '@smm/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { ApiError, apiGet, apiPost } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { FacebookPreview, InstagramPreview, PinterestPreview } from '@/components/shared/previews';
import { hasPermission, normalizeHashtag } from './helpers';
import { PlatformDot } from './platform-dots';

const CONTENT_MAX_LENGTH = 5000;
const MAX_HASHTAGS = 30;

/** Shape returned by GET /brand (BrandProfileDTO-like). Null means not configured. */
interface BrandProfile {
  businessName: string | null;
  description: string | null;
  industry: string | null;
  productsServices: string | null;
  targetAudience: string | null;
  brandVoice: string | null;
  writingStyle: string | null;
  brandColors: string | null;
  contentRestrictions: string | null;
  language: string | null;
  website: string | null;
  links: string | null;
}

type SaveStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED';

interface ComposerProps {
  session: SessionPayload;
  content: string;
  hashtags: string[];
  media: MediaDTO[];
  onContentChange: (value: string) => void;
  onHashtagsChange: (hashtags: string[]) => void;
  onRemoveMedia: (id: string) => void;
  /** Clears the whole composer after a successful save. */
  onReset: () => void;
}

export function Composer({
  session,
  content,
  hashtags,
  media,
  onContentChange,
  onHashtagsChange,
  onRemoveMedia,
  onReset,
}: ComposerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [hashtagDraft, setHashtagDraft] = useState('');
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState('');
  const [showTargetWarning, setShowTargetWarning] = useState(false);

  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => apiGet<AccountDTO[]>('/accounts') });
  const brand = useQuery({ queryKey: ['brand'], queryFn: () => apiGet<BrandProfile | null>('/brand') });

  const canDraft = hasPermission(session, 'post:draft');
  const canApprove = hasPermission(session, 'post:approve');
  const canSchedule = hasPermission(session, 'post:schedule');

  const hasContent = content.trim().length > 0;
  const previewMediaUrl = useMemo(() => media.find((item) => item.type === 'IMAGE')?.url ?? null, [media]);
  const previewAccountName = useMemo(() => {
    const first = accounts.data?.find((account) => account.id === targetIds[0]);
    return first?.displayName || session.workspace.name;
  }, [accounts.data, targetIds, session.workspace.name]);

  const addHashtag = () => {
    const tag = normalizeHashtag(hashtagDraft);
    if (!tag) return;
    if (hashtags.includes(tag)) {
      setHashtagDraft('');
      return;
    }
    if (hashtags.length >= MAX_HASHTAGS) {
      toast({ variant: 'destructive', title: 'Hashtag limit reached', description: 'A post can carry up to 30 hashtags.' });
      return;
    }
    onHashtagsChange([...hashtags, tag]);
    setHashtagDraft('');
  };

  const toggleTarget = (id: string, checked: boolean) => {
    setTargetIds((previous) => (checked ? [...previous, id] : previous.filter((value) => value !== id)));
    setShowTargetWarning(false);
  };

  const save = useMutation({
    mutationFn: (input: { status: SaveStatus; scheduledAt?: string | null }) =>
      apiPost<PostDTO>('/posts', {
        content: content.trim(),
        hashtags,
        targetAccountIds: targetIds,
        status: input.status,
        scheduledAt: input.scheduledAt ?? null,
        mediaIds: media.map((item) => item.id),
      }),
    onSuccess: (post, input) => {
      const copy: Record<SaveStatus, { title: string; description: string }> = {
        DRAFT: { title: 'Draft saved', description: 'Continue it any time under Posts.' },
        PENDING_APPROVAL: { title: 'Submitted for approval', description: 'A teammate with approval rights will review it.' },
        APPROVED: post.scheduledAt
          ? { title: 'Post scheduled', description: `It will publish ${new Date(post.scheduledAt).toLocaleString()}.` }
          : { title: 'Post approved', description: 'Ready to be scheduled or published.' },
      };
      toast({ title: copy[input.status].title, description: copy[input.status].description });
      onReset();
      setTargetIds([]);
      setScheduledAt('');
      setShowTargetWarning(false);
      void queryClient.invalidateQueries({ queryKey: ['posts'] });
      void queryClient.invalidateQueries({ queryKey: ['calendar'] });
      void queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Could not save post',
        description: error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
      });
    },
  });

  const isSaving = (status: SaveStatus, scheduled: boolean) =>
    save.isPending && save.variables?.status === status && Boolean(save.variables?.scheduledAt) === scheduled;

  const handleSchedule = () => {
    if (!hasContent || save.isPending) return;
    if (targetIds.length === 0) {
      setShowTargetWarning(true);
      return;
    }
    const date = scheduledAt ? new Date(scheduledAt) : null;
    if (!date || Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
      toast({
        variant: 'destructive',
        title: 'Invalid schedule time',
        description: 'Pick a date and time in the future.',
      });
      return;
    }
    save.mutate({ status: 'APPROVED', scheduledAt: date.toISOString() });
  };

  const grouped = PLATFORMS.map((platform) => ({
    platform,
    items: (accounts.data ?? []).filter((account) => account.platform === platform),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Composer</CardTitle>
          <CardDescription>Write once, preview on every platform, then save, approve or schedule.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="composer-content">Content</Label>
              <span
                className={cn(
                  'text-[11px] tabular-nums',
                  content.length > CONTENT_MAX_LENGTH - 200 ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {content.length}/{CONTENT_MAX_LENGTH}
              </span>
            </div>
            <Textarea
              id="composer-content"
              value={content}
              onChange={(event) => onContentChange(event.target.value)}
              maxLength={CONTENT_MAX_LENGTH}
              rows={6}
              placeholder="What do you want to share?"
              className="min-h-28"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="composer-hashtag">Hashtags</Label>
            {hashtags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {hashtags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-secondary-foreground"
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() => onHashtagsChange(hashtags.filter((value) => value !== tag))}
                      aria-label={`Remove hashtag ${tag}`}
                      className="rounded-full p-0.5 transition-colors hover:bg-secondary-foreground/10"
                    >
                      <X className="size-3" aria-hidden />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <Input
              id="composer-hashtag"
              value={hashtagDraft}
              onChange={(event) => setHashtagDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addHashtag();
                }
              }}
              maxLength={60}
              placeholder="Add a hashtag and press Enter"
            />
          </div>

          {media.length > 0 ? (
            <div className="space-y-1.5">
              <Label>Media</Label>
              <div className="flex flex-wrap gap-2">
                {media.map((item) =>
                  item.type === 'IMAGE' ? (
                    // eslint-disable-next-line @next/next/no-img-element -- media is served by this app under /api/media
                    <img
                      key={item.id}
                      src={item.url}
                      alt={item.altText ?? 'Attached media'}
                      className="size-16 rounded-md border object-cover"
                    />
                  ) : (
                    <video
                      key={item.id}
                      src={item.url}
                      muted
                      playsInline
                      preload="metadata"
                      aria-label={item.altText ?? 'Attached video'}
                      className="size-16 rounded-md border object-cover"
                    />
                  ),
                )}
              </div>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Target accounts</Label>
              {targetIds.length > 0 ? (
                <span className="text-[11px] text-muted-foreground">{targetIds.length} selected</span>
              ) : null}
            </div>
            {accounts.isPending ? (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" aria-hidden /> Loading accounts...
              </p>
            ) : accounts.isError ? (
              <p className="text-xs text-destructive">Could not load connected accounts. Try refreshing.</p>
            ) : grouped.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No connected accounts — connect one in Connected Accounts
              </p>
            ) : (
              <div className="max-h-52 space-y-3 overflow-y-auto pr-1">
                {grouped.map((group) => (
                  <div key={group.platform} className="space-y-1.5">
                    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <PlatformDot platform={group.platform} />
                      {PLATFORM_LABEL[group.platform]}
                    </p>
                    {group.items.map((account) => (
                      <label
                        key={account.id}
                        className="flex cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-2 text-[13px] transition-colors hover:bg-accent"
                      >
                        <Checkbox
                          checked={targetIds.includes(account.id)}
                          onCheckedChange={(checked) => toggleTarget(account.id, checked === true)}
                          aria-label={`Target @${account.username} on ${PLATFORM_LABEL[account.platform]}`}
                        />
                        <PlatformDot platform={account.platform} />
                        <span className="min-w-0 truncate font-medium">@{account.username}</span>
                        {account.isDemo ? (
                          <Badge variant="outline" className="text-[10px]">
                            Demo
                          </Badge>
                        ) : null}
                        {account.status !== 'CONNECTED' ? (
                          <Badge variant="outline" className="ml-auto text-[10px] font-normal text-muted-foreground">
                            {account.status.charAt(0) + account.status.slice(1).toLowerCase()}
                          </Badge>
                        ) : null}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          <Tabs defaultValue="FACEBOOK">
            <TabsList>
              <TabsTrigger value="FACEBOOK">Facebook</TabsTrigger>
              <TabsTrigger value="INSTAGRAM">Instagram</TabsTrigger>
              <TabsTrigger value="PINTEREST">Pinterest</TabsTrigger>
            </TabsList>
            <TabsContent value="FACEBOOK" className="pt-2">
              <FacebookPreview
                content={content}
                hashtags={hashtags}
                mediaUrl={previewMediaUrl}
                accountName={previewAccountName}
              />
            </TabsContent>
            <TabsContent value="INSTAGRAM" className="pt-2">
              <InstagramPreview
                content={content}
                hashtags={hashtags}
                mediaUrl={previewMediaUrl}
                accountName={previewAccountName}
              />
            </TabsContent>
            <TabsContent value="PINTEREST" className="pt-2">
              <PinterestPreview
                content={content}
                hashtags={hashtags}
                mediaUrl={previewMediaUrl}
                accountName={previewAccountName}
              />
            </TabsContent>
          </Tabs>

          <div className="space-y-1.5">
            <Label htmlFor="composer-schedule">Schedule</Label>
            <Input
              id="composer-schedule"
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
              className="max-w-xs"
            />
            <p className="text-[11px] text-muted-foreground">Times are saved in your local timezone</p>
          </div>

          {showTargetWarning && targetIds.length === 0 ? (
            <p className="text-xs font-medium text-destructive" role="alert">
              Select at least one target account
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => save.mutate({ status: 'DRAFT' })}
              disabled={!canDraft || !hasContent || save.isPending}
              title={
                !canDraft
                  ? 'Requires permission: post:draft'
                  : !hasContent
                    ? 'Write some content first'
                    : undefined
              }
            >
              {isSaving('DRAFT', false) ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Save draft
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => save.mutate({ status: 'PENDING_APPROVAL' })}
              disabled={!canDraft || !hasContent || save.isPending}
              title={
                !canDraft
                  ? 'Requires permission: post:draft'
                  : !hasContent
                    ? 'Write some content first'
                    : undefined
              }
            >
              {isSaving('PENDING_APPROVAL', false) ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Submit for approval
            </Button>
            {canApprove ? (
              <Button
                type="button"
                onClick={() => save.mutate({ status: 'APPROVED' })}
                disabled={!hasContent || save.isPending}
                title={!hasContent ? 'Write some content first' : undefined}
              >
                {isSaving('APPROVED', false) ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Approve
              </Button>
            ) : null}
            <Button
              type="button"
              onClick={handleSchedule}
              disabled={!canSchedule || !hasContent || save.isPending}
              title={
                !canSchedule
                  ? 'Requires permission: post:schedule'
                  : !hasContent
                    ? 'Write some content first'
                    : undefined
              }
            >
              {isSaving('APPROVED', true) ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <CalendarClock className="size-4" aria-hidden />
              )}
              Schedule
            </Button>
          </div>
        </CardContent>
      </Card>

      {brand.isSuccess && (!brand.data || !brand.data.businessName?.trim()) ? (
        <Alert className="border-dashed">
          <Lightbulb className="size-4" aria-hidden />
          <AlertDescription className="text-xs text-muted-foreground">
            Tip: configure your Brand Profile in Settings so AI content matches your brand voice.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
