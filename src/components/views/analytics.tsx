'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AnalyticsSummaryDTO, Platform, PostStatus, SessionPayload } from '@smm/shared';
import { PLATFORM_LABEL } from '@smm/shared';
import { AlertCircle, Download, Info } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { apiGet, ApiError } from '@/lib/api/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const PLATFORM_DOT_COLOR: Record<Platform, string> = {
  FACEBOOK: '#1877F2',
  INSTAGRAM: '#E1306C',
  PINTEREST: '#E60023',
};

function PlatformDot({ platform, className }: { platform: Platform; className?: string }) {
  return (
    <span
      className={cn('inline-block size-2.5 shrink-0 rounded-full', className)}
      style={{ backgroundColor: PLATFORM_DOT_COLOR[platform] }}
      aria-hidden="true"
    />
  );
}

const POST_STATUS_BADGE: Record<PostStatus, { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'border-border bg-secondary text-secondary-foreground' },
  PENDING_APPROVAL: { label: 'Pending approval', className: 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  APPROVED: { label: 'Approved', className: 'border-teal-500/25 bg-teal-500/10 text-teal-600 dark:text-teal-400' },
  SCHEDULED: { label: 'Scheduled', className: 'border-teal-500/25 bg-teal-500/10 text-teal-600 dark:text-teal-400' },
  PUBLISHING: { label: 'Publishing', className: 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  PUBLISHED: { label: 'Published', className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  FAILED: { label: 'Failed', className: 'border-red-500/25 bg-red-500/10 text-red-600 dark:text-red-400' },
  CANCELLED: { label: 'Cancelled', className: 'border-border bg-secondary text-secondary-foreground' },
};

const RANGE_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
] as const;

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong. Please try again.';
}

interface SummaryTileProps {
  label: string;
  value: number | undefined;
  tone?: 'default' | 'destructive';
}

function SummaryTile({ label, value, tone = 'default' }: SummaryTileProps) {
  return (
    <Card className="rounded-lg py-4">
      <CardContent className="px-4">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        {value === undefined ? (
          <Skeleton className="mt-1.5 h-7 w-12" />
        ) : (
          <p className={cn('mt-1 text-2xl font-semibold tabular-nums tracking-tight', tone === 'destructive' && value > 0 && 'text-red-600 dark:text-red-400')}>
            {value}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function AnalyticsView({ session: _session }: { session: SessionPayload }) {
  const { toast } = useToast();
  const [days, setDays] = useState<string>('30');
  const [exporting, setExporting] = useState(false);

  const { from, to } = useMemo(() => {
    const n = Number(days);
    return {
      from: format(subDays(new Date(), n - 1), 'yyyy-MM-dd'),
      to: format(new Date(), 'yyyy-MM-dd'),
    };
  }, [days]);

  const summaryQ = useQuery({
    queryKey: ['analytics', 'summary', days],
    queryFn: () => apiGet<AnalyticsSummaryDTO>(`/analytics/summary?from=${from}&to=${to}`),
  });

  const summary = summaryQ.data;

  async function exportCsv() {
    setExporting(true);
    try {
      const res = await fetch(`/api/v1/analytics/export.csv?from=${from}&to=${to}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics_${from}_${to}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: 'Export downloaded', description: `analytics_${from}_${to}.csv` });
    } catch (e) {
      toast({ title: 'Export failed', description: errorMessage(e), variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="h-8 w-[150px] text-[13px]" aria-label="Date range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-8 text-[13px]" onClick={() => void exportCsv()} disabled={exporting} aria-label="Export analytics as CSV">
          <Download className="size-3.5" />
          {exporting ? 'Exporting…' : 'Export CSV'}
        </Button>
        <p className="ml-auto text-xs text-muted-foreground">
          {from} – {to}
        </p>
      </div>

      {summaryQ.isLoading ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} className="rounded-lg py-4">
                <CardContent className="px-4 space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-7 w-12" />
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {[0, 1].map((i) => (
              <Card key={i} className="rounded-lg">
                <CardContent className="space-y-3 p-6">
                  {[0, 1, 2].map((j) => (
                    <Skeleton key={j} className="h-4 w-full" />
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : summaryQ.isError ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4 shrink-0" />
          <AlertTitle className="text-[13px]">Could not load analytics</AlertTitle>
          <AlertDescription className="text-xs">
            <p>{errorMessage(summaryQ.error)}</p>
            <Button variant="outline" size="sm" className="mt-2 h-7 border-destructive/40 text-xs" onClick={() => void summaryQ.refetch()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : summary ? (
        <>
          {/* Summary tiles */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryTile label="Posts" value={summary.totals.posts} />
            <SummaryTile label="Published" value={summary.totals.published} />
            <SummaryTile label="Scheduled" value={summary.totals.scheduled} />
            <SummaryTile label="Failed" value={summary.totals.failed} tone="destructive" />
          </div>

          {/* Platform breakdown + AI credits */}
          <div className="grid items-start gap-4 md:grid-cols-2">
            <Card className="rounded-lg">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold tracking-tight">Publishing by platform</CardTitle>
                <CardDescription className="text-xs">SMM publishing activity in the selected range.</CardDescription>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                {summary.byPlatform.length === 0 ? (
                  <p className="px-6 pb-6 text-xs text-muted-foreground">No publishing activity in this range.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-6 text-xs">Platform</TableHead>
                        <TableHead className="text-right text-xs">Published</TableHead>
                        <TableHead className="pr-6 text-right text-xs">Failed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.byPlatform.map((row) => (
                        <TableRow key={row.platform}>
                          <TableCell className="py-2.5 pl-6">
                            <span className="flex items-center gap-2 text-[13px] font-medium">
                              <PlatformDot platform={row.platform} />
                              {PLATFORM_LABEL[row.platform]}
                            </span>
                          </TableCell>
                          <TableCell className="py-2.5 text-right text-[13px] tabular-nums">{row.published}</TableCell>
                          <TableCell className="py-2.5 pr-6 text-right text-[13px] tabular-nums">
                            <span className={cn(row.failed > 0 && 'text-red-600 dark:text-red-400')}>{row.failed}</span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-lg">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold tracking-tight">AI credits used</CardTitle>
                <CardDescription className="text-xs">Rolling 30-day window across the workspace.</CardDescription>
              </CardHeader>
              <CardContent className="pb-6">
                <p className="text-4xl font-semibold tabular-nums tracking-tight">{summary.aiCreditsUsed30d}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Counts every AI generation call in the last 30 days.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Recent posts */}
          <Card className="rounded-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold tracking-tight">Recent posts</CardTitle>
              <CardDescription className="text-xs">Latest publishing outcomes across connected accounts.</CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {summary.recent.length === 0 ? (
                <p className="px-6 pb-6 text-xs text-muted-foreground">No posts yet — published posts will appear here.</p>
              ) : (
                <ul className="divide-y">
                  {summary.recent.map((item) => (
                    <li key={item.id} className="flex items-center gap-3 px-6 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-[13px] font-medium">{item.title}</p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          {item.platform ? (
                            <>
                              <PlatformDot platform={item.platform} className="size-2" />
                              {PLATFORM_LABEL[item.platform]} ·
                            </>
                          ) : null}
                          {item.publishedAt ? format(new Date(item.publishedAt), 'MMM d, yyyy HH:mm') : 'Not published'}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn('h-5 shrink-0 rounded px-1.5 text-[10px] font-medium', POST_STATUS_BADGE[item.status].className)}
                      >
                        {POST_STATUS_BADGE[item.status].label}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Platform insights availability */}
          <Alert className="border-dashed bg-muted/40">
            <Info className="size-4 shrink-0" />
            <AlertTitle className="text-[13px]">
              {summary.platformInsightsAvailable ? 'Platform insights partially available' : 'Platform insights not available'}
            </AlertTitle>
            <AlertDescription className="text-xs leading-relaxed text-muted-foreground">
              Platform-native insights (reach, impressions, engagement) require a real connected account with approved
              API permissions. Metrics shown here reflect SMM publishing activity only.
            </AlertDescription>
          </Alert>
        </>
      ) : null}
    </div>
  );
}
