'use client';

import { useMemo, useState } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { format } from 'date-fns';
import {
  CalendarClock,
  CalendarX2,
  Copy,
  FileText,
  Image as ImageIcon,
  Loader2,
  MoreHorizontal,
  Pencil,
  RefreshCcw,
  Rocket,
  Search,
  Send,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import type { Permission, Platform, PostDTO, PostStatus, SessionPayload } from '@smm/shared';
import { PLATFORMS, PLATFORM_LABEL, POST_STATUSES } from '@smm/shared';
import { apiDelete, apiGet, apiPost, ApiError } from '@/lib/api/client';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PostEditorDialog } from './posts/post-editor-dialog';
import { ScheduleDialog } from './posts/schedule-dialog';
import { PlatformLabels, StatusBadge } from './posts/status-badge';
import { QueryErrorAlert } from './posts/query-error';
import { cn } from '@/lib/utils';

interface PostListResponse {
  items: PostDTO[];
  total: number;
  counts: Record<PostStatus, number>;
}

type PostsAction = 'submit' | 'approve' | 'publish-now' | 'cancel' | 'duplicate' | 'retry';

const PAGE_SIZE = 20;
const EDITABLE_STATUSES: PostStatus[] = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SCHEDULED'];
const CANCELABLE_STATUSES: PostStatus[] = ['SCHEDULED', 'APPROVED', 'PENDING_APPROVAL'];
const SCHEDULABLE_STATUSES: PostStatus[] = ['APPROVED', 'SCHEDULED'];

const ACTION_SUCCESS: Record<PostsAction, string> = {
  submit: 'Submitted for approval',
  approve: 'Post approved',
  'publish-now': 'Publishing started',
  cancel: 'Post cancelled',
  duplicate: 'Post duplicated as a new draft',
  retry: 'Retrying failed targets',
};

/** Compact tab labels (full labels live in STATUS_LABEL for badges). */
const TAB_LABEL: Record<PostStatus, string> = {
  DRAFT: 'Drafts',
  PENDING_APPROVAL: 'Pending',
  APPROVED: 'Approved',
  SCHEDULED: 'Scheduled',
  PUBLISHING: 'Publishing',
  PUBLISHED: 'Published',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
};

export function PostsView({ session }: { session: SessionPayload }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const can = (perm: Permission) => session.permissions.includes(perm);
  const missingPermTitle = (perm: Permission) =>
    can(perm) ? undefined : `Requires permission "${perm}"`;

  const [statusFilter, setStatusFilter] = useState<PostStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState<Platform | 'ALL'>('ALL');
  const [editorPost, setEditorPost] = useState<PostDTO | null>(null);
  const [schedulePost, setSchedulePost] = useState<PostDTO | null>(null);
  const [postToDelete, setPostToDelete] = useState<PostDTO | null>(null);

  // Dedicated counts query: pageSize=1 keeps it cheap; response carries `counts`.
  const countsQuery = useQuery({
    queryKey: ['posts', 'counts'],
    queryFn: () => apiGet<PostListResponse>('/posts?pageSize=1'),
  });

  const listQuery = useInfiniteQuery({
    queryKey: ['posts', 'list', statusFilter],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        page: String(pageParam),
        pageSize: String(PAGE_SIZE),
      });
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      return apiGet<PostListResponse>(`/posts?${params.toString()}`);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce(
        (sum, page) => sum + (page.items?.length ?? 0),
        0,
      );
      return lastPage.total > 0 && loaded < lastPage.total
        ? allPages.length + 1
        : undefined;
    },
  });

  const items = useMemo(
    () => listQuery.data?.pages.flatMap((page) => page.items ?? []) ?? [],
    [listQuery.data],
  );
  const total = listQuery.data?.pages[0]?.total ?? 0;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((post) => {
      if (q && !post.content.toLowerCase().includes(q)) return false;
      if (
        platformFilter !== 'ALL' &&
        !post.targets.some((t) => t.platform === platformFilter)
      ) {
        return false;
      }
      return true;
    });
  }, [items, search, platformFilter]);

  const invalidateAfterMutation = () => {
    queryClient.invalidateQueries({ queryKey: ['posts'] });
    queryClient.invalidateQueries({ queryKey: ['analytics'] });
  };

  const runAction = useMutation({
    mutationFn: ({ id, act }: { id: string; act: PostsAction }) =>
      apiPost<PostDTO>(`/posts/${id}/${act}`),
    onSuccess: (_post, vars) => {
      invalidateAfterMutation();
      toast({ title: ACTION_SUCCESS[vars.act] });
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Action failed',
        description:
          err instanceof ApiError
            ? err.message
            : 'Unexpected error. Please try again.',
      });
    },
  });

  const deletePost = useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/posts/${id}`),
    onSuccess: () => {
      invalidateAfterMutation();
      toast({ title: 'Draft deleted' });
      setPostToDelete(null);
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Could not delete draft',
        description:
          err instanceof ApiError
            ? err.message
            : 'Unexpected error. Please try again.',
      });
    },
  });

  const counts = countsQuery.data?.counts;
  const totalCount = countsQuery.data?.total;
  const hasFilters = statusFilter !== 'ALL' || search !== '' || platformFilter !== 'ALL';

  const openEditor = (post: PostDTO) => setEditorPost(post);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="-mx-1 max-w-full overflow-x-auto px-1 pb-0.5">
            <Tabs
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as PostStatus | 'ALL')}
            >
              <TabsList className="h-9 w-max max-w-none">
                <TabsTrigger value="ALL" className="gap-1.5 text-[13px]">
                  All
                  {totalCount !== undefined && (
                    <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">
                      {totalCount}
                    </span>
                  )}
                </TabsTrigger>
                {POST_STATUSES.map((status) => (
                  <TabsTrigger key={status} value={status} className="gap-1.5 text-[13px]">
                    {TAB_LABEL[status]}
                    {counts && (
                      <span className="rounded-full bg-muted px-1.5 text-[10px] tabular-nums text-muted-foreground">
                        {counts[status]}
                      </span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <div className="flex flex-1 items-center gap-2 lg:flex-none">
            <div className="relative w-full sm:w-64">
              <Search
                className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search posts"
                aria-label="Search posts by content"
                className="h-9 pl-8 text-[13px]"
              />
            </div>
            <Select
              value={platformFilter}
              onValueChange={(v) => setPlatformFilter(v as Platform | 'ALL')}
            >
              <SelectTrigger
                className="h-9 w-[150px] text-[13px]"
                aria-label="Filter by platform"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All platforms</SelectItem>
                {PLATFORMS.map((platform) => (
                  <SelectItem key={platform} value={platform}>
                    {PLATFORM_LABEL[platform]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Content */}
      {listQuery.isError ? (
        <QueryErrorAlert
          title="Couldn't load posts"
          error={listQuery.error}
          onRetry={() => listQuery.refetch()}
        />
      ) : listQuery.isPending ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        hasFilters || total > 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center">
            <p className="text-sm font-medium">No posts match your filters</p>
            <p className="text-[13px] text-muted-foreground">
              Try a different search term, platform or status.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearch('');
                setPlatformFilter('ALL');
                setStatusFilter('ALL');
              }}
            >
              Clear filters
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-muted">
              <FileText className="size-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">No posts yet</p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Create your first post in Content Studio — open it from the
                workspace sidebar.
              </p>
            </div>
          </div>
        )
      ) : (
        <>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[32%] min-w-[220px]">Content</TableHead>
                  <TableHead>Platforms</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Schedule / Published</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((post) => (
                  <PostRow
                    key={post.id}
                    post={post}
                    busy={runAction.isPending || deletePost.isPending}
                    canEdit={can('post:edit')}
                    canDraft={can('post:draft')}
                    canApprove={can('post:approve')}
                    canSchedule={can('post:schedule')}
                    canDelete={can('post:delete')}
                    permTitle={missingPermTitle}
                    onEdit={() => openEditor(post)}
                    onSchedule={() => setSchedulePost(post)}
                    onAction={(act) => runAction.mutate({ id: post.id, act })}
                    onDelete={() => setPostToDelete(post)}
                  />
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              Showing {filtered.length} of {total} post{total === 1 ? '' : 's'}
              {hasFilters ? ' (filters applied on top of the loaded pages)' : ''}
            </p>
            {listQuery.hasNextPage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => listQuery.fetchNextPage()}
                disabled={listQuery.isFetchingNextPage}
              >
                {listQuery.isFetchingNextPage ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : null}
                Load more
              </Button>
            )}
          </div>
        </>
      )}

      {/* Dialogs */}
      <PostEditorDialog
        post={editorPost}
        open={editorPost !== null}
        onOpenChange={(open) => {
          if (!open) setEditorPost(null);
        }}
      />
      <ScheduleDialog
        post={schedulePost}
        open={schedulePost !== null}
        onOpenChange={(open) => {
          if (!open) setSchedulePost(null);
        }}
      />
      <AlertDialog
        open={postToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPostToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
            <AlertDialogDescription>
              The draft and its targets will be removed permanently. This cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePost.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deletePost.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (postToDelete) deletePost.mutate(postToDelete.id);
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deletePost.isPending && <Loader2 className="size-4 animate-spin" />}
              Delete draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

function PostRow({
  post,
  busy,
  canEdit,
  canDraft,
  canApprove,
  canSchedule,
  canDelete,
  permTitle,
  onEdit,
  onSchedule,
  onAction,
  onDelete,
}: {
  post: PostDTO;
  busy: boolean;
  canEdit: boolean;
  canDraft: boolean;
  canApprove: boolean;
  canSchedule: boolean;
  canDelete: boolean;
  permTitle: (perm: Permission) => string | undefined;
  onEdit: () => void;
  onSchedule: () => void;
  onAction: (act: PostsAction) => void;
  onDelete: () => void;
}) {
  const scheduledOrPublished = post.publishedAt
    ? { label: 'Published', at: post.publishedAt }
    : post.scheduledAt
      ? { label: 'Scheduled', at: post.scheduledAt }
      : null;

  const editable = EDITABLE_STATUSES.includes(post.status);
  const schedulable = SCHEDULABLE_STATUSES.includes(post.status);
  const cancelable = CANCELABLE_STATUSES.includes(post.status);

  return (
    <TableRow>
      <TableCell className="max-w-[360px]">
        <p className="line-clamp-2 whitespace-normal text-[13px] leading-snug">
          {post.content}
        </p>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
          {post.media.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <ImageIcon className="size-3" aria-hidden="true" />
              {post.media.length}
            </span>
          )}
          {post.hashtags.length > 0 && (
            <span>
              {post.hashtags.length} hashtag{post.hashtags.length === 1 ? '' : 's'}
            </span>
          )}
          {post.origin === 'AI' && (
            <Badge variant="secondary" className="px-1 py-0 text-[10px] font-medium">
              AI
            </Badge>
          )}
        </div>
        {post.status === 'FAILED' && post.failureReason && (
          <p className="mt-1 line-clamp-1 whitespace-normal text-[11px] text-red-600 dark:text-red-400">
            {post.failureReason}
          </p>
        )}
      </TableCell>

      <TableCell>
        <PlatformLabels platforms={post.targets.map((t) => t.platform)} />
      </TableCell>

      <TableCell>
        <StatusBadge status={post.status} />
      </TableCell>

      <TableCell className="text-[13px]">
        {scheduledOrPublished ? (
          <span
            title={`${scheduledOrPublished.label}: ${format(new Date(scheduledOrPublished.at), 'MMM d, yyyy, HH:mm')}`}
            className="tabular-nums"
          >
            <span className="mr-1.5 hidden text-[11px] text-muted-foreground xl:inline">
              {scheduledOrPublished.label}
            </span>
            {format(new Date(scheduledOrPublished.at), 'MMM d, HH:mm')}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>

      <TableCell className="max-w-[140px] truncate text-[13px]">
        {post.authorName}
      </TableCell>

      <TableCell className="text-[13px] tabular-nums text-muted-foreground">
        {format(new Date(post.createdAt), 'MMM d, yyyy')}
      </TableCell>

      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={`Actions for post: ${post.content.slice(0, 40)}`}
              disabled={busy}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {editable && (
              <DropdownMenuItem
                disabled={!canEdit}
                title={permTitle('post:edit')}
                onClick={onEdit}
              >
                <Pencil className="size-4" />
                Edit
              </DropdownMenuItem>
            )}

            {post.status === 'DRAFT' && (
              <DropdownMenuItem
                disabled={!canDraft}
                title={permTitle('post:draft')}
                onClick={() => onAction('submit')}
              >
                <Send className="size-4" />
                Submit for approval
              </DropdownMenuItem>
            )}

            {post.status === 'PENDING_APPROVAL' && (
              <DropdownMenuItem
                disabled={!canApprove}
                title={permTitle('post:approve')}
                onClick={() => onAction('approve')}
              >
                <ShieldCheck className="size-4" />
                Approve
              </DropdownMenuItem>
            )}

            {schedulable && (
              <>
                <DropdownMenuItem
                  disabled={!canSchedule}
                  title={permTitle('post:schedule')}
                  onClick={onSchedule}
                >
                  <CalendarClock className="size-4" />
                  {post.status === 'SCHEDULED' ? 'Reschedule…' : 'Schedule…'}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!canSchedule}
                  title={permTitle('post:schedule')}
                  onClick={() => onAction('publish-now')}
                >
                  <Rocket className="size-4" />
                  Publish now
                </DropdownMenuItem>
              </>
            )}

            <DropdownMenuItem
              disabled={!canDraft}
              title={permTitle('post:draft')}
              onClick={() => onAction('duplicate')}
            >
              <Copy className="size-4" />
              Duplicate
            </DropdownMenuItem>

            {post.status === 'FAILED' && (
              <DropdownMenuItem
                disabled={!canSchedule}
                title={permTitle('post:schedule')}
                onClick={() => onAction('retry')}
              >
                <RefreshCcw className="size-4" />
                Retry failed targets
              </DropdownMenuItem>
            )}

            {cancelable && (
              <DropdownMenuItem
                disabled={!canSchedule}
                title={permTitle('post:schedule')}
                onClick={() => onAction('cancel')}
              >
                <CalendarX2 className="size-4" />
                Cancel
              </DropdownMenuItem>
            )}

            {post.status === 'DRAFT' && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={!canDelete}
                  title={permTitle('post:delete')}
                  onClick={onDelete}
                >
                  <Trash2 className="size-4" />
                  Delete draft
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

// ---------------------------------------------------------------------------
// Loading state — skeleton shaped like the real table rows
// ---------------------------------------------------------------------------

function TableSkeleton() {
  return (
    <div className="rounded-lg border" aria-hidden="true">
      <div className="flex items-center gap-4 border-b bg-muted/40 px-4 py-2.5">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-14" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-16" />
        <Skeleton className="ml-auto h-3 w-10" />
      </div>
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className={cn('flex items-center gap-4 px-4 py-3.5', i < 5 && 'border-b')}
        >
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-2/5" />
          </div>
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-5 w-24 rounded-md" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-16" />
          <Skeleton className="size-8 rounded-md" />
        </div>
      ))}
    </div>
  );
}
