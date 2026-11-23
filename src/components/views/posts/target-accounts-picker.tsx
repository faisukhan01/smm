'use client';

import { useQuery } from '@tanstack/react-query';
import type { AccountDTO } from '@smm/shared';
import { PLATFORMS, PLATFORM_LABEL } from '@smm/shared';
import { apiGet } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { PlatformDot } from './status-badge';
import { cn } from '@/lib/utils';

/**
 * Checkbox list of connected accounts, grouped by platform, used to pick
 * publish targets for a post. Only CONNECTED accounts can be selected;
 * others are shown disabled with their status so the state is honest.
 */
export function TargetAccountsPicker({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  className?: string;
}) {
  const accountsQuery = useQuery({
    queryKey: ['accounts'],
    queryFn: () => apiGet<AccountDTO[]>('/accounts'),
  });

  const toggle = (id: string, checked: boolean) => {
    onChange(checked ? [...value, id] : value.filter((v) => v !== id));
  };

  if (accountsQuery.isPending) {
    return (
      <div className={cn('space-y-2', className)} aria-hidden="true">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-10 w-full rounded-md" />
        <Skeleton className="h-10 w-full rounded-md" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
    );
  }

  if (accountsQuery.isError) {
    return (
      <div
        role="alert"
        className={cn(
          'flex items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px]',
          className,
        )}
      >
        <span>Couldn&rsquo;t load connected accounts.</span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2.5 text-xs"
          onClick={() => accountsQuery.refetch()}
        >
          Retry
        </Button>
      </div>
    );
  }

  const accounts = accountsQuery.data ?? [];

  if (accounts.length === 0) {
    return (
      <p
        className={cn(
          'text-[13px] text-muted-foreground',
          className,
        )}
      >
        No accounts connected yet. Connect one from the sidebar to publish to it.
      </p>
    );
  }

  return (
    <div
      role="group"
      aria-label="Target accounts"
      className={cn('space-y-3', className)}
    >
      {PLATFORMS.map((platform) => {
        const group = accounts.filter((a) => a.platform === platform);
        if (group.length === 0) return null;

        return (
          <div key={platform}>
            <p className="flex items-center gap-1.5 pb-1.5 text-xs font-medium text-muted-foreground">
              <PlatformDot platform={platform} />
              {PLATFORM_LABEL[platform]}
            </p>
            <div className="space-y-1.5">
              {group.map((account) => {
                const selectable = account.status === 'CONNECTED';
                const checked = value.includes(account.id);
                return (
                  <label
                    key={account.id}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md border px-3 py-2 text-[13px] transition-colors',
                      checked
                        ? 'border-primary/40 bg-primary/5'
                        : 'hover:bg-accent/50',
                      !selectable && 'opacity-60',
                      disabled && 'pointer-events-none opacity-50',
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={disabled || !selectable}
                      onCheckedChange={(next) => toggle(account.id, next === true)}
                      aria-label={`Publish to @${account.username} on ${PLATFORM_LABEL[account.platform]}`}
                    />
                    <span className="min-w-0 truncate font-medium">
                      @{account.username}
                    </span>
                    <span className="hidden min-w-0 truncate text-xs text-muted-foreground sm:inline">
                      {account.displayName}
                    </span>
                    {account.isDemo && (
                      <Badge variant="secondary" className="text-[10px]">
                        Demo
                      </Badge>
                    )}
                    {!selectable && (
                      <span
                        className="ml-auto shrink-0 text-[11px] font-medium text-red-600 dark:text-red-400"
                        title={`Account status: ${account.status}`}
                      >
                        {account.status.toLowerCase()}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
