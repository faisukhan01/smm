'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AiMode, SessionPayload } from '@smm/shared';
import { roleHas } from '@smm/shared';
import { apiGet, apiPut } from '@/lib/api/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { LoadError, PermGateButton, errorMessage } from '@/components/views/settings/ui';

interface AiSettingsResponse {
  mode: AiMode;
  autoReply: boolean;
  restrictedTopics: string | null;
}

const MODE_OPTIONS: { value: AiMode; title: string; description: string }[] = [
  {
    value: 'MANUAL',
    title: 'Manual',
    description: 'AI drafts content; you publish manually.',
  },
  {
    value: 'APPROVAL',
    title: 'Approval',
    description: 'AI requests approval before anything is published.',
  },
  {
    value: 'AUTO',
    title: 'Auto',
    description: 'AI may schedule and publish according to your instructions.',
  },
];

export function AiSettings({ session }: { session: SessionPayload }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const canUpdate = roleHas(session.role, 'workspace:update');

  const [mode, setMode] = useState<AiMode>('MANUAL');
  const [autoReply, setAutoReply] = useState(false);
  const [restrictedTopics, setRestrictedTopics] = useState('');

  const settingsQ = useQuery({
    queryKey: ['ai-settings'],
    queryFn: () => apiGet<AiSettingsResponse>('/ai-settings'),
  });

  useEffect(() => {
    if (settingsQ.isSuccess && settingsQ.data) {
      setMode(settingsQ.data.mode);
      setAutoReply(settingsQ.data.autoReply);
      setRestrictedTopics(settingsQ.data.restrictedTopics ?? '');
    }
  }, [settingsQ.isSuccess, settingsQ.data]);

  const saveMut = useMutation({
    mutationFn: () =>
      apiPut<AiSettingsResponse>('/ai-settings', {
        mode,
        autoReply,
        restrictedTopics: restrictedTopics.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-settings'] });
      toast({ title: 'AI settings saved' });
    },
    onError: (e) => toast({ title: 'Could not save AI settings', description: errorMessage(e), variant: 'destructive' }),
  });

  if (settingsQ.isLoading) {
    return (
      <Card className="rounded-lg">
        <CardHeader className="gap-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-72" />
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-lg" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (settingsQ.isError) {
    return <LoadError message={errorMessage(settingsQ.error)} onRetry={() => void settingsQ.refetch()} />;
  }

  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle className="text-sm font-semibold tracking-tight">AI Settings</CardTitle>
        <CardDescription className="text-xs leading-relaxed">
          Control how much autonomy the AI has across content creation and publishing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2.5">
          <p className="text-xs font-medium">Autonomy mode</p>
          <RadioGroup
            value={mode}
            onValueChange={(v) => setMode(v as AiMode)}
            className="grid gap-3 md:grid-cols-3"
            aria-label="AI autonomy mode"
          >
            {MODE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                onClick={() => setMode(opt.value)}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-accent/50',
                  mode === opt.value && 'border-primary bg-primary/5',
                )}
              >
                <RadioGroupItem value={opt.value} className="mt-0.5" aria-label={opt.title} />
                <span className="space-y-1">
                  <span className="block text-[13px] font-medium leading-tight">{opt.title}</span>
                  <span className="block text-xs leading-relaxed text-muted-foreground">{opt.description}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
        </div>

        <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
          <div className="space-y-1">
            <p className="text-[13px] font-medium">Automatic AI replies (where supported)</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Replies are only sent on platforms whose APIs allow it. AI drafts are always shown for review first.
            </p>
          </div>
          <Switch checked={autoReply} onCheckedChange={setAutoReply} aria-label="Automatic AI replies" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ai-restricted-topics" className="text-xs">Restricted topics</Label>
          <Input
            id="ai-restricted-topics"
            value={restrictedTopics}
            onChange={(e) => setRestrictedTopics(e.target.value)}
            className="text-[13px]"
            placeholder="Comma-separated topics AI must not reference"
          />
        </div>

        <div className="flex justify-end border-t pt-4">
          <PermGateButton
            allowed={canUpdate}
            deniedMessage="Changing AI settings requires the workspace:update permission (Owner or Admin)."
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            aria-label="Save AI settings"
          >
            {saveMut.isPending ? 'Saving…' : 'Save AI settings'}
          </PermGateButton>
        </div>
      </CardContent>
    </Card>
  );
}
