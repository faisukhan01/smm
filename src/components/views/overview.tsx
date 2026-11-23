'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format, formatDistanceToNow, subDays } from 'date-fns';
import {
  AlertTriangle,
  Bot,
  CalendarDays,
  Link2,
  Plus,
} from 'lucide-react';
import type {
  AnalyticsSummaryDTO,
  PostDTO,
  PostStatus,
  SessionPayload,
} from '@smm/shared';
import { apiGet } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { QueryErrorAlert } from './posts/query-error';
import { PlatformDot, postPlatforms, StatusBadge } from './posts/status-badge';
import { cn } from '@/lib/utils';

interface PostListResponse {
  items: PostDTO[];
  total: number;
  counts: Record<PostStatus, number>;
}

type NavigateTarget =
  | 'overview'
  | 'assistant'
  | 'studio'
  | 'calendar'
  | 'posts'
  | 'accounts'
  | 'inbox'
  | 'analytics'
  | 'settings';

export function OverviewView({
  session,
  onNavigate,
}: {
  session: SessionPayload;
  onNavigate: (view: NavigateTarget) => void;
}) {
  // Default analytics range: the last 30 days, fixed once per mount.
  const [{ from, to }] = useMemo(() => {
    const now = new Date();
    return [{ from: subDays(now, 30).toISOString(), to: now.toISOString() }];
  }, []);

  const summaryQuery = useQuery({
    queryKey: ['analytics', 'summary', from, to],
    queryFn: () =>
      apiGet<AnalyticsSummaryDTO>(
        `/analytics/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      ),
  });

  const upcomingQuery = useQuery({
    queryKey: ['posts', 'upcoming'],
    queryFn: () => apiGet<PostListResponse>('/posts?pageSize=100'),
  });

  const upcoming = useMemo(() => {
    return (upcomingQuery.data?.items ?? [])
      .filter(
        (post): post is PostDTO & { scheduledAt: string } =>
          (post.status === 'SCHEDULED' || post.status === 'APPROVED') &&
          post.scheduledAt !== null,
      )
      .sort(
        (a, b) =>
          new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
      )
      .slice(0, 5);
  }, [upcomingQuery.data]);

  const totals = summaryQuery.data?.totals;
  const recent = summaryQuery.data?.recent?.slice(0, 5) ?? [];

  const stats: Array<{
    label: string;
    value: number | undefined;
    hint: string;
    warn?: boolean;
  }> = [
    { label: 'Posts (30d)', value: totals?.posts, hint: 'created in the last 30 days' },
    { label: 'Published', value: totals?.published, hint: 'went live successfully' },
    { label: 'Scheduled', value: totals?.scheduled, hint: 'awaiting publish' },
    {
      label: 'Failed',
      value: totals?.failed,
      hint: 'need attention',
      warn: (totals?.failed ?? 0) > 0,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Stat tiles */}
      <section
        aria-label="Publishing stats for the last 30 days"
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
      >
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg border p-4">
            <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
            {summaryQuery.isPending ? (
              <Skeleton className="mt-2 h-8 w-12" />
            ) : (
              <p
                className={cn(
                  'mt-1 text-2xl font-semibold tabular-nums',
                  stat.warn && 'text-red-600 dark:text-red-400',
                )}
              >
                {stat.value ?? '—'}
              </p>
            )}
            <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              {stat.warn && <AlertTriangle className="size-3 text-red-500" aria-hidden="true" />}
              {stat.hint}
            </p>
          </div>
        ))}
      </section>

      {/* Next up + AI activity */}
      <section className="grid gap-4 lg:grid-cols-2" aria-label="Upcoming posts and AI activity">
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-sm font-semibold">Next up</CardTitle>
            <CardDescription className="text-xs">
              Scheduled and approved posts, soonest first
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4">
            {upcomingQuery.isPending ? (
              <div className="space-y-3" aria-hidden="true">
                {Array.from({ length: 3 }, (_, i) => (
                  <div key={i} className="space-y-1.5 py-1">
                    <Skeleton className="h-3.5 w-4/5" />
                    <Skeleton className="h-3 w-2/5" />
                  </div>
                ))}
              </div>
            ) : upcomingQuery.isError ? (
              <QueryErrorAlert
                title="Couldn't load scheduled posts"
                error={upcomingQuery.error}
                onRetry={() => upcomingQuery.refetch()}
              />
            ) : upcoming.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-8 text-center">
                <CalendarDays className="size-5 text-muted-foreground" aria-hidden="true" />
                <p className="text-[13px] font-medium">Nothing scheduled</p>
                <p className="text-xs text-muted-foreground">Plan your week on the content calendar.</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1"
                  onClick={() => onNavigate('calendar')}
                >
                  Open calendar
                </Button>
              </div>
            ) : (
              <div className="divide-y">
                {upcoming.map((post) => (
                  <div
                    key={post.id}
                    className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-[13px] leading-snug">
                        {post.content}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1" aria-label="Platforms">
                          {postPlatforms(post).map((platform) => (
                            <PlatformDot
                              key={platform}
                              platform={platform}
                              className="size-2"
                            />
                          ))}
                        </span>
                        <span className="tabular-nums">
                          {format(new Date(post.scheduledAt), 'MMM d, HH:mm')}
                        </span>
                      </div>
                    </div>
                    <StatusBadge status={post.status} />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-sm font-semibold">AI activity</CardTitle>
            <CardDescription className="text-xs">
              Usage across captions, images and the assistant
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col px-4">
            {summaryQuery.isPending ? (
              <Skeleton className="h-9 w-16" />
            ) : (
              <p className="text-3xl font-semibold tabular-nums">
                {summaryQuery.data?.aiCreditsUsed30d ?? '—'}
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              AI credits used (30 days)
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 w-fit"
              onClick={() => onNavigate('assistant')}
            >
              <Bot className="size-4" aria-hidden="true" />
              Open AI Assistant
            </Button>

            <div className="mt-auto border-t pt-3">
              <p className="pb-2 text-xs font-medium text-muted-foreground">
                Quick actions
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 justify-center"
                  onClick={() => onNavigate('studio')}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  New post
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 justify-center"
                  onClick={() => onNavigate('calendar')}
                >
                  <CalendarDays className="size-4" aria-hidden="true" />
                  View calendar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 justify-center"
                  onClick={() => onNavigate('accounts')}
                >
                  <Link2 className="size-4" aria-hidden="true" />
                  Connect accounts
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Recent activity */}
      <section aria-label="Recent activity">
        <Card className="gap-3 py-4">
          <CardHeader className="px-4">
            <CardTitle className="text-sm font-semibold">Recent activity</CardTitle>
            <CardDescription className="text-xs">
              The latest posts across your workspace
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4">
            {summaryQuery.isPending ? (
              <div className="space-y-3" aria-hidden="true">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="flex items-center gap-3 py-1">
                    <Skeleton className="size-2 rounded-full" />
                    <Skeleton className="h-3.5 flex-1" />
                    <Skeleton className="h-5 w-20 rounded-md" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                ))}
              </div>
            ) : summaryQuery.isError ? (
              <QueryErrorAlert
                title="Couldn't load recent activity"
                error={summaryQuery.error}
                onRetry={() => summaryQuery.refetch()}
              />
            ) : recent.length === 0 ? (
              <p className="rounded-md border border-dashed px-4 py-8 text-center text-[13px] text-muted-foreground">
                No recent activity yet — your latest posts will show up here.
              </p>
            ) : (
              <div className="divide-y">
                {recent.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 py-2.5 first:pt-0 last:pb-0"
                  >
                    <span className="flex w-4 shrink-0 justify-center">
                      {item.platform && (
                        <PlatformDot platform={item.platform} className="size-2" />
                      )}
                    </span>
                    <p className="line-clamp-1 min-w-0 flex-1 text-[13px]">
                      {item.title}
                    </p>
                    <StatusBadge status={item.status} />
                    <span className="w-28 shrink-0 truncate text-right text-[11px] text-muted-foreground">
                      {item.publishedAt
                        ? formatDistanceToNow(new Date(item.publishedAt), {
                            addSuffix: true,
                          })
                        : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
