'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SessionPayload, WorkspaceMemberDTO } from '@smm/shared';
import { roleHas } from '@smm/shared';
import { Trash2, UserPlus } from 'lucide-react';
import { format } from 'date-fns';
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from '@/lib/api/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LoadError, MutedAlert, PermGateButton, errorMessage } from '@/components/views/settings/ui';

type AssignableRole = 'ADMIN' | 'MANAGER' | 'EDITOR' | 'VIEWER';

const ASSIGNABLE_ROLES: AssignableRole[] = ['ADMIN', 'MANAGER', 'EDITOR', 'VIEWER'];

const ROLE_LABEL: Record<AssignableRole, string> = {
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  EDITOR: 'Editor',
  VIEWER: 'Viewer',
};

interface InviteDTO {
  id: string;
  email: string;
  role: AssignableRole;
  status: string;
  expiresAt: string;
  note?: string;
}

interface WorkspaceResponse {
  workspace: { id: string; name: string; slug: string; createdAt: string };
  members: WorkspaceMemberDTO[];
  invites: InviteDTO[];
}

const MEMBER_STATUS_BADGE: Record<WorkspaceMemberDTO['status'], { label: string; className: string }> = {
  ACTIVE: { label: 'Active', className: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  PENDING: { label: 'Pending', className: 'border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-400' },
};

export function WorkspaceTeamSettings({ session }: { session: SessionPayload }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const canUpdateWorkspace = roleHas(session.role, 'workspace:update');
  const canManageTeam = roleHas(session.role, 'team:manage');

  const [workspaceName, setWorkspaceName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AssignableRole>('MANAGER');
  const [inviteNote, setInviteNote] = useState<string | null>(null);

  const workspaceQ = useQuery({
    queryKey: ['workspace'],
    queryFn: () => apiGet<WorkspaceResponse>('/workspace'),
  });

  const data = workspaceQ.data;
  const members = data?.members ?? [];
  const invites = data?.invites ?? [];

  // Sync the editable workspace name once the query resolves.
  useEffect(() => {
    if (data) {
      setWorkspaceName(data.workspace.name);
    }
     
  }, [workspaceQ.isSuccess]);

  const renameMut = useMutation({
    mutationFn: () => apiPatch<void>('/workspace', { name: workspaceName.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace'] });
      toast({ title: 'Workspace updated' });
    },
    onError: (e) => toast({ title: 'Could not update workspace', description: errorMessage(e), variant: 'destructive' }),
  });

  const roleMut = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: AssignableRole }) =>
      apiPatch<WorkspaceMemberDTO>(`/workspace/members/${memberId}`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace'] });
      toast({ title: 'Role updated' });
    },
    onError: (e) => toast({ title: 'Could not change role', description: errorMessage(e), variant: 'destructive' }),
  });

  const removeMut = useMutation({
    mutationFn: (memberId: string) => apiDelete<void>(`/workspace/members/${memberId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace'] });
      toast({ title: 'Member removed' });
    },
    onError: (e) => toast({ title: 'Could not remove member', description: errorMessage(e), variant: 'destructive' }),
  });

  const inviteMut = useMutation({
    mutationFn: () => apiPost<InviteDTO>('/workspace/invites', { email: inviteEmail.trim(), role: inviteRole }),
    onSuccess: (invite) => {
      queryClient.invalidateQueries({ queryKey: ['workspace'] });
      setInviteEmail('');
      setInviteNote(invite.note ?? null);
      toast({ title: 'Invite created', description: invite.email });
    },
    onError: (e) => {
      setInviteNote(null);
      toast({ title: 'Could not create invite', description: errorMessage(e), variant: 'destructive' });
    },
  });

  const revokeMut = useMutation({
    // DELETE is the documented route; fall back to the PATCH variant on 405/404.
    mutationFn: async (inviteId: string) => {
      try {
        return await apiDelete<void>(`/workspace/invites/${inviteId}`);
      } catch (e) {
        if (e instanceof ApiError && (e.status === 405 || e.status === 404)) {
          return apiPatch<void>(`/workspace/invites/${inviteId}`, { status: 'REVOKED' });
        }
        throw e;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace'] });
      toast({ title: 'Invite revoked' });
    },
    onError: (e) => toast({ title: 'Could not revoke invite', description: errorMessage(e), variant: 'destructive' }),
  });

  if (workspaceQ.isLoading) {
    return (
      <Card className="rounded-lg">
        <CardHeader className="gap-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-64" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (workspaceQ.isError || !data) {
    return <LoadError message={errorMessage(workspaceQ.error)} onRetry={() => void workspaceQ.refetch()} />;
  }

  return (
    <div className="space-y-4">
      {/* Workspace */}
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="text-sm font-semibold tracking-tight">Workspace</CardTitle>
          <CardDescription className="text-xs">The workspace name appears across SMM for every member.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="workspace-name" className="text-xs">Name</Label>
              <Input
                id="workspace-name"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                disabled={!canUpdateWorkspace}
                className="text-[13px]"
              />
              <p className="text-xs text-muted-foreground">
                Slug: <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">{data.workspace.slug}</code>
              </p>
            </div>
            <PermGateButton
              allowed={canUpdateWorkspace}
              deniedMessage="Renaming the workspace requires the workspace:update permission (Owner or Admin)."
              onClick={() => renameMut.mutate()}
              disabled={!workspaceName.trim() || workspaceName.trim() === data.workspace.name || renameMut.isPending}
              aria-label="Save workspace name"
            >
              {renameMut.isPending ? 'Saving…' : 'Save'}
            </PermGateButton>
          </div>
        </CardContent>
      </Card>

      {/* Members */}
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="text-sm font-semibold tracking-tight">Members</CardTitle>
          <CardDescription className="text-xs">
            {canManageTeam
              ? 'Change roles or remove members. Owner access cannot be changed.'
              : 'Only Owners and Admins can manage team members.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6 text-xs">Member</TableHead>
                <TableHead className="text-xs">Role</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="pr-6 text-xs"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => {
                const isOwner = member.role === 'OWNER';
                const isSelf = member.userId === session.user.id;
                return (
                  <TableRow key={member.id}>
                    <TableCell className="py-2.5 pl-6">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium leading-tight">
                          {member.name}
                          {isSelf ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span> : null}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                      </div>
                    </TableCell>
                    <TableCell className="py-2.5">
                      {isOwner ? (
                        <Badge variant="secondary" className="rounded text-[10px] font-medium uppercase tracking-wide">
                          Owner
                        </Badge>
                      ) : (
                        <Select
                          value={member.role}
                          onValueChange={(v) => roleMut.mutate({ memberId: member.id, role: v as AssignableRole })}
                          disabled={!canManageTeam || roleMut.isPending}
                        >
                          <SelectTrigger className="h-8 w-[130px] text-xs" aria-label={`Role for ${member.name}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ASSIGNABLE_ROLES.map((r) => (
                              <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell className="py-2.5">
                      <Badge
                        variant="outline"
                        className={cn('h-5 rounded px-1.5 text-[10px] font-medium', MEMBER_STATUS_BADGE[member.status].className)}
                      >
                        {MEMBER_STATUS_BADGE[member.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2.5 pr-6 text-right">
                      {canManageTeam && !isOwner && !isSelf ? (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-muted-foreground hover:text-destructive"
                              aria-label={`Remove ${member.name} from workspace`}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove member?</AlertDialogTitle>
                              <AlertDialogDescription>
                                {member.name} will immediately lose access to this workspace. Their published posts and
                                drafts remain.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => removeMut.mutate(member.id)}
                              >
                                Remove member
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Invites */}
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="text-sm font-semibold tracking-tight">Pending invites</CardTitle>
          <CardDescription className="text-xs">Invites expire automatically if not accepted.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {invites.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground">No pending invites.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {invites.map((invite) => (
                <li key={invite.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium leading-tight">{invite.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {ROLE_LABEL[invite.role]} · expires {format(new Date(invite.expiresAt), 'MMM d, yyyy')}
                    </p>
                  </div>
                  {canManageTeam ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-muted-foreground hover:text-destructive"
                          aria-label={`Revoke invite for ${invite.email}`}
                        >
                          Revoke
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Revoke invite?</AlertDialogTitle>
                          <AlertDialogDescription>
                            The invitation link for {invite.email} will stop working immediately.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => revokeMut.mutate(invite.id)}
                          >
                            Revoke invite
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <div className="space-y-3 border-t pt-4">
            <p className="flex items-center gap-1.5 text-[13px] font-medium">
              <UserPlus className="size-3.5 text-muted-foreground" aria-hidden="true" />
              Invite a teammate
            </p>
            <div className="grid gap-2 md:grid-cols-[1fr_150px_auto] md:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="invite-email" className="text-xs">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="teammate@company.com"
                  className="text-[13px]"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Role</Label>
                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as AssignableRole)}>
                  <SelectTrigger className="h-9 text-[13px]" aria-label="Invite role">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ASSIGNABLE_ROLES.map((r) => (
                      <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <PermGateButton
                allowed={canManageTeam}
                deniedMessage="Inviting members requires the team:manage permission (Owner or Admin)."
                onClick={() => inviteMut.mutate()}
                disabled={!inviteEmail.trim() || !inviteEmail.includes('@') || inviteMut.isPending}
                aria-label="Send invite"
              >
                {inviteMut.isPending ? 'Inviting…' : 'Send invite'}
              </PermGateButton>
            </div>
            {inviteNote ? (
              <MutedAlert>{inviteNote}</MutedAlert>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
