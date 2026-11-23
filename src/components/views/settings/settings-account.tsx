'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SessionPayload } from '@smm/shared';
import { KeyRound, Mail } from 'lucide-react';
import { apiGet, apiPatch, apiPost } from '@/lib/api/client';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { LoadError, MutedAlert, errorMessage } from '@/components/views/settings/ui';

interface AccountResponse {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

export function AccountSettings({ session: _session }: { session: SessionPayload }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const accountQ = useQuery({
    queryKey: ['account'],
    queryFn: () => apiGet<AccountResponse>('/account'),
  });

  // Sync editable profile fields once the query resolves.
  useEffect(() => {
    if (accountQ.isSuccess && accountQ.data) {
      setName(accountQ.data.name);
    }
  }, [accountQ.isSuccess, accountQ.data]);

  const profileMut = useMutation({
    mutationFn: () => apiPatch<AccountResponse>('/account', { name: name.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['account'] });
      toast({ title: 'Profile updated' });
    },
    onError: (e) => toast({ title: 'Could not update profile', description: errorMessage(e), variant: 'destructive' }),
  });

  const passwordMut = useMutation({
    mutationFn: () =>
      apiPost<void>('/account/password', { currentPassword, newPassword }),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setPasswordError(null);
      toast({ title: 'Password updated' });
    },
    onError: (e) => {
      setPasswordError(errorMessage(e));
    },
  });

  function submitPassword() {
    if (!currentPassword) {
      setPasswordError('Enter your current password.');
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError('New password must be different from the current one.');
      return;
    }
    setPasswordError(null);
    passwordMut.mutate();
  }

  if (accountQ.isLoading) {
    return (
      <div className="space-y-4">
        {[0, 1].map((i) => (
          <Card key={i} className="rounded-lg">
            <CardHeader className="gap-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-56" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-9 w-full max-w-md" />
              <Skeleton className="h-9 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (accountQ.isError) {
    return <LoadError message={errorMessage(accountQ.error)} onRetry={() => void accountQ.refetch()} />;
  }

  if (!accountQ.data) return null;
  const account = accountQ.data;

  return (
    <div className="space-y-4">
      {/* Profile */}
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="text-sm font-semibold tracking-tight">Profile</CardTitle>
          <CardDescription className="text-xs">Your display name as shown to other workspace members.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="account-name" className="text-xs">Name</Label>
            <Input
              id="account-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="max-w-md text-[13px]"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="account-email" className="text-xs">Email</Label>
            <div className="flex items-center gap-2">
              <span id="account-email" className="flex items-center gap-1.5 text-[13px]">
                <Mail className="size-3.5 text-muted-foreground" aria-hidden="true" />
                {account.email}
              </span>
              <Badge
                variant="outline"
                className={
                  account.emailVerified
                    ? 'h-5 rounded border-emerald-500/25 bg-emerald-500/10 px-1.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400'
                    : 'h-5 rounded border-amber-500/25 bg-amber-500/10 px-1.5 text-[10px] font-medium text-amber-600 dark:text-amber-400'
                }
              >
                {account.emailVerified ? 'Verified' : 'Not verified'}
              </Badge>
            </div>
          </div>
          {!account.emailVerified ? (
            <MutedAlert>
              Email verification requires an SMTP provider; the verification endpoint exists and is documented.
            </MutedAlert>
          ) : null}
          <div className="flex justify-end border-t pt-4">
            <Button
              size="sm"
              onClick={() => profileMut.mutate()}
              disabled={!name.trim() || name.trim() === account.name || profileMut.isPending}
              aria-label="Save profile"
            >
              {profileMut.isPending ? 'Saving…' : 'Save profile'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Password */}
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <KeyRound className="size-4 text-muted-foreground" aria-hidden="true" />
            Change password
          </CardTitle>
          <CardDescription className="text-xs">Minimum 8 characters. You stay signed in after changing it.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="account-current-password" className="text-xs">Current password</Label>
              <Input
                id="account-current-password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="text-[13px]"
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="account-new-password" className="text-xs">New password</Label>
              <Input
                id="account-new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="text-[13px]"
                autoComplete="new-password"
                aria-describedby="password-error"
              />
            </div>
          </div>
          {passwordError ? (
            <Alert variant="destructive" className="py-2">
              <AlertDescription className="text-xs" id="password-error">{passwordError}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex justify-end border-t pt-4">
            <Button
              size="sm"
              onClick={submitPassword}
              disabled={!currentPassword || !newPassword || passwordMut.isPending}
              aria-label="Update password"
            >
              {passwordMut.isPending ? 'Updating…' : 'Update password'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
