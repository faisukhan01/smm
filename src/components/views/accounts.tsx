'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AccountDTO, AccountStatus, Platform, SessionPayload } from '@smm/shared';
import { PLATFORMS, PLATFORM_LABEL, PLATFORM_META, roleHas } from '@smm/shared';
import { AlertCircle, Check, ChevronDown, ExternalLink, Unlink, X } from 'lucide-react';
import { apiDelete, apiGet, apiPost, ApiError } from '@/lib/api/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

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

const STATUS_BADGE: Record<AccountStatus, { label: string; className: string }> = {
  CONNECTED: { label: 'Connected', className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  EXPIRED: { label: 'Expired', className: 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  REVOKED: { label: 'Revoked', className: 'border-border bg-secondary text-secondary-foreground' },
  ERROR: { label: 'Error', className: 'border-red-500/25 bg-red-500/10 text-red-600 dark:text-red-400' },
};

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong. Please try again.';
}


interface PlatformCardProps {
  platform: Platform;
  accounts: AccountDTO[];
  configured: boolean | undefined;
  canConnect: boolean;
  canDisconnect: boolean;
  canManage: boolean;
}

function PlatformCard({ platform, accounts, configured, canConnect, canDisconnect, canManage }: PlatformCardProps) {
  const meta = PLATFORM_META[platform];
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [configOpen, setConfigOpen] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [starting, setStarting] = useState(false);

  const demoMut = useMutation({
    mutationFn: () => apiPost<AccountDTO>('/accounts/demo', { platform }),
    onSuccess: (account) => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      toast({ title: 'Sandbox demo connection added', description: `${account.username} is now available for evaluation.` });
    },
    onError: (e) => toast({ title: 'Could not add demo connection', description: errorMessage(e), variant: 'destructive' }),
  });

  const disconnectMut = useMutation({
    mutationFn: (id: string) => apiDelete<void>(`/accounts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      toast({ title: 'Account disconnected' });
    },
    onError: (e) => toast({ title: 'Could not disconnect account', description: errorMessage(e), variant: 'destructive' }),
  });

  const oauthConfigMut = useMutation({
    mutationFn: (input: { clientId: string; clientSecret: string }) =>
      apiPost<void>('/accounts/oauth-config', { platform, ...input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['oauth-config'] });
      setClientId('');
      setClientSecret('');
      setConfigOpen(false);
      toast({ title: `${meta.name} OAuth app saved`, description: 'You can now connect real accounts.' });
    },
    onError: (e) => toast({ title: 'Could not save OAuth app', description: errorMessage(e), variant: 'destructive' }),
  });

  async function startOAuth() {
    setStarting(true);
    try {
      // The start route validates the OAuth app config itself and either
      // redirects to the platform authorize URL (302) or back with an error
      // message — no JSON contract needed.
      window.location.href = `/api/v1/accounts/oauth/${platform.toLowerCase()}/start`;
    } catch (e) {
      toast({ title: 'Could not start OAuth', description: errorMessage(e), variant: 'destructive' });
      setStarting(false);
    }
  }

  return (
    <Card className="flex flex-col gap-4 rounded-lg">
      <CardHeader className="gap-1 border-b py-4">
        <div className="flex items-center gap-2">
          <PlatformDot platform={platform} />
          <CardTitle className="text-sm font-semibold tracking-tight">{meta.name}</CardTitle>
          <a
            href={meta.docsUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`View ${meta.name} API docs`}
            className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            View API docs
            <ExternalLink className="size-3" />
          </a>
        </div>
        <CardDescription className="text-xs leading-relaxed">{meta.accountRequirement}</CardDescription>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4">
        {/* Capabilities */}
        <ul className="space-y-2" aria-label={`${meta.name} capabilities`}>
          {meta.capabilities.map((cap) => (
            <li key={cap.key} className="flex items-start gap-2">
              {cap.supported ? (
                <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              ) : (
                <X className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
              )}
              <div className="min-w-0">
                <p className={cn('text-[13px] leading-tight', !cap.supported && 'text-muted-foreground')}>{cap.label}</p>
                {cap.note ? <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{cap.note}</p> : null}
              </div>
            </li>
          ))}
        </ul>

        {/* Required approved permissions */}
        <div>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Required approved permissions
          </p>
          <div className="flex flex-wrap gap-1">
            {meta.reviewRequired.split(',').map((scope) => (
              <code
                key={scope.trim()}
                className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] leading-4 text-muted-foreground"
              >
                {scope.trim()}
              </code>
            ))}
          </div>
        </div>

        <div className="flex-1" />

        {/* Connected accounts */}
        <div className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Connected accounts</p>
          {accounts.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground">
              No {PLATFORM_LABEL[platform]} accounts connected yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {accounts.map((account) => (
                <li key={account.id} className="flex items-center gap-2.5 rounded-md border px-2.5 py-2 transition-colors hover:bg-accent/50">
                  <span
                    className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold uppercase"
                    aria-hidden="true"
                  >
                    {account.displayName.slice(0, 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-[13px] font-medium leading-tight">
                      <span className="truncate">@{account.username}</span>
                      {account.isDemo ? (
                        <Badge variant="secondary" className="h-4 shrink-0 rounded px-1 text-[9px] font-medium uppercase tracking-wide">
                          Demo
                        </Badge>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{account.displayName}</p>
                  </div>
                  <Badge variant="outline" className={cn('h-5 shrink-0 rounded px-1.5 text-[10px] font-medium', STATUS_BADGE[account.status].className)}>
                    {STATUS_BADGE[account.status].label}
                  </Badge>
                  {canDisconnect ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                          aria-label={`Disconnect ${account.username}`}
                          disabled={disconnectMut.isPending}
                        >
                          <Unlink className="size-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Disconnect account?</AlertDialogTitle>
                          <AlertDialogDescription>
                            SMM will lose access to @{account.username} on {PLATFORM_LABEL[platform]}. Scheduled posts
                            targeting this account may fail until it is reconnected.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => disconnectMut.mutate(account.id)}
                          >
                            Disconnect
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Connect flow */}
        <div className="space-y-3 border-t pt-4">
          {configured ? (
            <Button
              className="w-full"
              size="sm"
              onClick={() => void startOAuth()}
              disabled={!canConnect || starting}
              aria-label={`Connect with ${meta.name}`}
            >
              {starting ? 'Redirecting…' : `Connect with ${meta.name}`}
            </Button>
          ) : (
            <>
              <Alert className="border-dashed bg-muted/40">
                <AlertCircle className="size-4 shrink-0" />
                <AlertTitle className="text-[13px]">
                  {configured === undefined ? 'OAuth configuration unavailable' : 'OAuth app not configured'}
                </AlertTitle>
                <AlertDescription className="text-xs leading-relaxed text-muted-foreground">
                  Platform connection requires your registered developer app.
                </AlertDescription>
              </Alert>

              {canManage ? (
                <Collapsible open={configOpen} onOpenChange={setConfigOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 w-full justify-between px-2 text-xs text-muted-foreground">
                      Configure OAuth app
                      <ChevronDown className={cn('size-3.5 transition-transform', configOpen && 'rotate-180')} />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 pt-2">
                    <div className="space-y-1.5">
                      <Label htmlFor={`${platform}-client-id`} className="text-xs">Client ID</Label>
                      <Input
                        id={`${platform}-client-id`}
                        value={clientId}
                        onChange={(e) => setClientId(e.target.value)}
                        placeholder="App ID / Client ID from the developer portal"
                        className="h-8 text-xs"
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`${platform}-client-secret`} className="text-xs">Client secret</Label>
                      <Input
                        id={`${platform}-client-secret`}
                        type="password"
                        value={clientSecret}
                        onChange={(e) => setClientSecret(e.target.value)}
                        placeholder="Stored encrypted server-side"
                        className="h-8 text-xs"
                        autoComplete="off"
                      />
                    </div>
                    <Button
                      size="sm"
                      className="w-full"
                      disabled={!clientId.trim() || !clientSecret.trim() || oauthConfigMut.isPending}
                      onClick={() => oauthConfigMut.mutate({ clientId: clientId.trim(), clientSecret: clientSecret.trim() })}
                    >
                      {oauthConfigMut.isPending ? 'Saving…' : 'Save OAuth app'}
                    </Button>
                  </CollapsibleContent>
                </Collapsible>
              ) : null}

              {canConnect ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full">
                      Add sandbox demo connection
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Add sandbox demo connection</AlertDialogTitle>
                      <AlertDialogDescription>
                        A sandbox demo connection simulates publishing and inbox behavior for evaluation. It is NOT a
                        real platform connection and creates no platform data.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => demoMut.mutate()}>
                        Add demo connection
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function AccountsView({ session }: { session: SessionPayload }) {
  const accountsQ = useQuery({
    queryKey: ['accounts'],
    queryFn: () => apiGet<AccountDTO[]>('/accounts'),
  });
  const oauthQ = useQuery({
    queryKey: ['oauth-config'],
    queryFn: () => apiGet<{ configured: Record<Platform, boolean> }>('/accounts/oauth-config'),
  });

  const canConnect = roleHas(session.role, 'account:connect');
  const canDisconnect = roleHas(session.role, 'account:disconnect');
  const canManage = roleHas(session.role, 'team:manage');

  const accounts = accountsQ.data ?? [];

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted-foreground">
        Connect official platform apps through OAuth, or add sandbox demo connections to evaluate publishing and
        inbox flows without platform approval.
      </p>

      {accountsQ.isLoading || oauthQ.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="rounded-lg">
              <CardHeader className="gap-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-full" />
              </CardHeader>
              <CardContent className="space-y-2.5">
                {[0, 1, 2, 3, 4].map((j) => (
                  <Skeleton key={j} className="h-3.5 w-full" />
                ))}
                <Skeleton className="mt-4 h-8 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : accountsQ.isError ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4 shrink-0" />
          <AlertTitle className="text-[13px]">Could not load connected accounts</AlertTitle>
          <AlertDescription className="text-xs">
            <p>{errorMessage(accountsQ.error)}</p>
            <Button variant="outline" size="sm" className="mt-2 h-7 border-destructive/40 text-xs" onClick={() => void accountsQ.refetch()}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-3">
          {PLATFORMS.map((platform) => (
            <PlatformCard
              key={platform}
              platform={platform}
              accounts={accounts.filter((a) => a.platform === platform)}
              configured={oauthQ.data?.configured[platform]}
              canConnect={canConnect}
              canDisconnect={canDisconnect}
              canManage={canManage}
            />
          ))}
        </div>
      )}
    </div>
  );
}
