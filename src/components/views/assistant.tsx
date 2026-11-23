'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Bot, CalendarDays, Loader2, SendHorizontal, Sparkles, Wand2 } from 'lucide-react';
import type { PlanInput, PostDTO, SessionPayload } from '@smm/shared';
import { PLATFORMS, PLATFORM_LABEL, type Platform } from '@smm/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiPost } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { aiErrorMessage, hasPermission } from './studio/helpers';
import { PlatformDot } from './studio/platform-dots';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AssistantResponse {
  reply: string;
  creditsUsed: number;
}

interface PlanResponse {
  created: PostDTO[];
}

const MAX_SENT_MESSAGES = 12;

const QUICK_STARTS = [
  'Give me 5 post ideas for this week',
  'Draft a launch announcement',
  'Improvements for my posting schedule',
  'Write a caption for a product photo',
] as const;

function statusLabel(status: string): string {
  return status
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

function statusBadgeVariant(status: PostDTO['status']): 'default' | 'secondary' | 'outline' {
  switch (status) {
    case 'DRAFT':
      return 'secondary';
    case 'PENDING_APPROVAL':
      return 'outline';
    default:
      return 'default';
  }
}

function postPlatforms(post: PostDTO): Platform[] {
  return Array.from(new Set(post.targets.map((target) => target.platform)));
}

export function AssistantView({ session }: { session: SessionPayload }) {
  const { toast } = useToast();
  const canUseAi = hasPermission(session, 'ai:use');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [planResults, setPlanResults] = useState<PostDTO[]>([]);
  const [planFocus, setPlanFocus] = useState('');
  const [planPlatforms, setPlanPlatforms] = useState<Platform[]>([...PLATFORMS]);
  const [postsPerDay, setPostsPerDay] = useState<1 | 2 | 3>(1);

  const send = useMutation({
    mutationFn: (history: ChatMessage[]) =>
      apiPost<AssistantResponse>('/ai/assistant', { messages: history.slice(-MAX_SENT_MESSAGES) }),
    onSuccess: (data) => {
      setMessages((previous) => [...previous, { role: 'assistant', content: data.reply }]);
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: 'Assistant request failed', description: aiErrorMessage(error) });
    },
  });

  const plan = useMutation({
    mutationFn: (payload: PlanInput) => apiPost<PlanResponse>('/ai/plan', payload),
    onSuccess: (data) => {
      setPlanResults(data.created);
      toast({
        title: `${data.created.length} draft${data.created.length === 1 ? '' : 's'} created`,
        description: 'Manage them in Posts or the Content Calendar.',
      });
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: 'Plan generation failed', description: aiErrorMessage(error) });
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length, send.isPending]);

  const submitMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || send.isPending || !canUseAi) return;
    const next: ChatMessage[] = [...messages, { role: 'user', content: trimmed }];
    setMessages(next);
    setInput('');
    send.mutate(next);
  };

  const togglePlanPlatform = (platform: Platform, checked: boolean) => {
    setPlanPlatforms((previous) =>
      checked ? [...previous, platform] : previous.filter((value) => value !== platform),
    );
  };

  const generatePlan = () => {
    if (!canUseAi || planPlatforms.length === 0 || plan.isPending) return;
    plan.mutate({
      focus: planFocus.trim() || null,
      platforms: planPlatforms,
      postsPerDay,
    });
  };

  const conversationEmpty = messages.length === 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="size-4 text-primary" aria-hidden />
            AI Assistant
          </CardTitle>
          <CardDescription>Brand-aware — answers use your brand profile and AI settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {conversationEmpty && !send.isPending ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <Sparkles className="mx-auto size-5 text-muted-foreground" aria-hidden />
              <p className="mt-2 text-sm font-medium">Ask anything about your social content</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Ideas, drafts, schedules and strategy — grounded in your workspace.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}
                >
                  <div
                    className={cn(
                      'max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-[13px] leading-relaxed',
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-secondary-foreground',
                    )}
                  >
                    {message.content}
                  </div>
                </div>
              ))}
              {send.isPending ? (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-[13px] text-secondary-foreground">
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    Thinking…
                  </div>
                </div>
              ) : null}
            </div>
          )}
          <div ref={bottomRef} aria-hidden />
        </CardContent>
        <CardFooter className="flex flex-col items-stretch gap-3">
          {conversationEmpty ? (
            <div className="flex flex-wrap gap-2">
              {QUICK_STARTS.map((question) => (
                <Button
                  key={question}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-full text-xs"
                  onClick={() => submitMessage(question)}
                  disabled={!canUseAi || send.isPending}
                  title={!canUseAi ? 'Requires permission: ai:use' : undefined}
                >
                  {question}
                </Button>
              ))}
            </div>
          ) : null}
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submitMessage(input);
                }
              }}
              rows={2}
              disabled={!canUseAi}
              placeholder={canUseAi ? 'Ask your AI assistant… (Enter to send, Shift+Enter for a new line)' : 'Your role does not include AI access'}
              className="min-h-11 resize-none"
              aria-label="Message the AI assistant"
            />
            <Button
              type="button"
              size="icon"
              onClick={() => submitMessage(input)}
              disabled={!canUseAi || send.isPending || input.trim().length === 0}
              title={!canUseAi ? 'Requires permission: ai:use' : undefined}
              aria-label="Send message"
            >
              {send.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <SendHorizontal className="size-4" aria-hidden />
              )}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">Conversation history is kept in this session only</p>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="size-4 text-primary" aria-hidden />
            Weekly plan generator
          </CardTitle>
          <CardDescription>Creates drafts you can polish in Posts and place on the Calendar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="plan-focus">Focus (optional)</Label>
            <Input
              id="plan-focus"
              value={planFocus}
              onChange={(event) => setPlanFocus(event.target.value)}
              placeholder="e.g. Promote the spring launch"
              maxLength={500}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Platforms</Label>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((platform) => {
                const checked = planPlatforms.includes(platform);
                return (
                  <label
                    key={platform}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent',
                      checked && 'border-primary/40 bg-primary/5',
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) => togglePlanPlatform(platform, value === true)}
                      aria-label={`Include ${PLATFORM_LABEL[platform]}`}
                    />
                    <PlatformDot platform={platform} />
                    {PLATFORM_LABEL[platform]}
                  </label>
                );
              })}
            </div>
            {planPlatforms.length === 0 ? (
              <p className="text-xs text-destructive" role="alert">
                Select at least one platform
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="plan-frequency">Posts per day</Label>
            <Select
              value={String(postsPerDay)}
              onValueChange={(value) => setPostsPerDay(Number(value) as 1 | 2 | 3)}
            >
              <SelectTrigger id="plan-frequency" className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 post per day</SelectItem>
                <SelectItem value="2">2 posts per day</SelectItem>
                <SelectItem value="3">3 posts per day</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={generatePlan}
            disabled={!canUseAi || planPlatforms.length === 0 || plan.isPending}
            title={!canUseAi ? 'Requires permission: ai:use' : undefined}
          >
            {plan.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Wand2 className="size-4" aria-hidden />
            )}
            {plan.isPending ? 'Generating plan...' : 'Generate plan'}
          </Button>

          {planResults.length > 0 ? (
            <div className="space-y-2 border-t pt-4">
              <p className="text-xs font-medium text-muted-foreground">
                {planResults.length} draft{planResults.length === 1 ? '' : 's'} created
              </p>
              <ul className="space-y-2">
                {planResults.map((post) => (
                  <li key={post.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant={statusBadgeVariant(post.status)} className="text-[10px]">
                        {statusLabel(post.status)}
                      </Badge>
                      <span className="flex items-center gap-1.5">
                        {postPlatforms(post).map((platform) => (
                          <PlatformDot key={platform} platform={platform} />
                        ))}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed">{post.content}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
