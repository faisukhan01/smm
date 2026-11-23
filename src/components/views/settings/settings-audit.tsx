'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SessionPayload } from '@smm/shared';
import { roleHas } from '@smm/shared';
import { ChevronLeft, ChevronRight, Lock, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { apiGet } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LoadError, MutedAlert, errorMessage } from '@/components/views/settings/ui';

interface AuditItem {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  actorName: string | null;
  createdAt: string;
  meta: unknown;
}

interface AuditResponse {
  items: AuditItem[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 25;

function truncate(value: string, max = 120): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function AuditLogSettings({ session }: { session: SessionPayload }) {
  const canReadAudit = roleHas(session.role, 'audit:read');
  const [page, setPage] = useState(1);

  const auditQ = useQuery({
    queryKey: ['audit', page],
    queryFn: () => apiGet<AuditResponse>(`/audit?page=${page}&pageSize=${PAGE_SIZE}`),
    enabled: canReadAudit,
  });

  if (!canReadAudit) {
    return (
      <MutedAlert icon={Lock} title="Audit log unavailable">
        You do not have permission to view the audit log. Ask a workspace Owner or Admin if you need access.
      </MutedAlert>
    );
  }

  const audit = auditQ.data;
  const total = audit?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold tracking-tight">Audit Log</CardTitle>
            <CardDescription className="text-xs">
              Security-relevant events across the workspace, newest first.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => void auditQ.refetch()}
            disabled={auditQ.isFetching}
            aria-label="Refresh audit log"
          >
            <RefreshCw className={cn('size-3.5', auditQ.isFetching && 'animate-spin')} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-0 px-0 pb-0">
        {auditQ.isLoading ? (
          <div className="space-y-2 px-6 pb-6">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : auditQ.isError ? (
          <div className="px-6 pb-6">
            <LoadError message={errorMessage(auditQ.error)} onRetry={() => void auditQ.refetch()} />
          </div>
        ) : !audit || audit.items.length === 0 ? (
          <p className="px-6 pb-6 text-xs text-muted-foreground">
            {audit ? 'No audit events recorded yet.' : 'No audit events loaded.'}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6 text-xs">Action</TableHead>
                <TableHead className="text-xs">Entity</TableHead>
                <TableHead className="text-xs">Actor</TableHead>
                <TableHead className="text-xs">Details</TableHead>
                <TableHead className="pr-6 text-right text-xs">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {audit.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="py-2.5 pl-6">
                    <code className="font-mono text-xs">{item.action}</code>
                  </TableCell>
                  <TableCell className="py-2.5">
                    <code className="font-mono text-xs text-muted-foreground">
                      {item.entity}
                      <span className="ml-1 opacity-70">{truncate(item.entityId, 18)}</span>
                    </code>
                  </TableCell>
                  <TableCell className="py-2.5 text-[13px]">{item.actorName ?? 'System'}</TableCell>
                  <TableCell className="max-w-[220px] py-2.5">
                    <span className="block truncate font-mono text-xs text-muted-foreground" title={JSON.stringify(item.meta ?? {})}>
                      {truncate(JSON.stringify(item.meta ?? {}))}
                    </span>
                  </TableCell>
                  <TableCell className="py-2.5 pr-6 text-right text-xs tabular-nums text-muted-foreground">
                    {format(new Date(item.createdAt), 'MMM d, yyyy HH:mm:ss')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between border-t px-6 py-3">
          <p className="text-xs text-muted-foreground">
            {total} event{total === 1 ? '' : 's'} · page {page} of {totalPages}
          </p>
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={page <= 1 || auditQ.isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-3.5" />
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              disabled={page >= totalPages || auditQ.isFetching}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Next page"
            >
              Next
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
