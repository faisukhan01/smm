'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ConversationDTO, MessageDTO, SessionPayload } from '@smm/shared';
import { PLATFORM_LABEL, roleHas } from '@smm/shared';
import { AlertCircle, ArrowLeft, CheckCircle2, RotateCcw, Send, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { apiGet, apiPost, ApiError } from '@/lib/api/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PlatformDot } from '@/components/views/inbox/ui';

const CONVERSATION_STATUS_BADGE: Record<ConversationDTO['status'], { label: string; className: string }> = {
  OPEN: { label: 'Open', className: 'border-teal-500/25 bg-teal-500/10 text-teal-600 dark:text-teal-400' },
  RESOLVED: { label: 'Resolved', className: 'border-border bg-secondary text-secondary-foreground' },
};

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong. Please try again.';
}

interface InboxThreadProps {
  conversationId: string;
  session: SessionPayload;
  /** Mobile only: returns to the conversation list. */
  onBack: () => void;
}

export function InboxThread({ conversationId, session, onBack }: InboxThreadProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [replyText, setReplyText] = useState('');

  const canReply = roleHas(session.role, 'inbox:reply');
  const canUseAi = roleHas(session.role, 'ai:use');

  const threadQ = useQuery({
    queryKey: ['inbox', 'conversation', conversationId],
    queryFn: () => apiGet<{ conversation: ConversationDTO; messages: MessageDTO[] }>(`/inbox/conversations/${conversationId}`),
  });

  const conversation = threadQ.data?.conversation;
  const messages = threadQ.data?.messages ?? [];

  const lastInWithDraft = [...messages].reverse().find((m) => m.direction === 'IN' && m.aiDraft) ?? null;
  const latestIn = [...messages].reverse().find((m) => m.direction === 'IN') ?? null;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [conversationId, messages.length]);

  function invalidateInbox() {
    void queryClient.invalidateQueries({ queryKey: ['inbox'] });
  }

  const replyMut = useMutation({
    mutationFn: (text: string) => apiPost<MessageDTO>(`/inbox/conversations/${conversationId}/reply`, { text }),
    onSuccess: () => {
      setReplyText('');
      invalidateInbox();
    },
    onError: (e) => toast({ title: 'Could not send reply', description: errorMessage(e), variant: 'destructive' }),
  });

  const statusMut = useMutation({
    mutationFn: (action: 'resolve' | 'reopen') =>
      apiPost<ConversationDTO>(`/inbox/conversations/${conversationId}/${action}`),
    onSuccess: (updated) => {
      invalidateInbox();
      toast({ title: updated.status === 'RESOLVED' ? 'Conversation resolved' : 'Conversation reopened' });
    },
    onError: (e) => toast({ title: 'Could not update conversation', description: errorMessage(e), variant: 'destructive' }),
  });

  const draftMut = useMutation({
    mutationFn: (messageId: string) =>
      apiPost<{ draft: string }>('/ai/reply-draft', { conversationId, messageId }),
    onSuccess: () => {
      invalidateInbox();
      toast({ title: 'AI draft ready', description: 'Review the draft before sending — nothing is sent automatically.' });
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 402) {
        toast({ title: 'AI credits exhausted', description: 'Upgrade in Settings → Billing to keep using AI.', variant: 'destructive' });
        return;
      }
      toast({ title: 'Could not draft reply', description: errorMessage(e), variant: 'destructive' });
    },
  });

  const applyDraftMut = useMutation({
    mutationFn: (messageId: string) =>
      apiPost<MessageDTO>(`/inbox/conversations/${conversationId}/apply-draft`, { messageId }),
    onSuccess: () => {
      invalidateInbox();
      toast({ title: 'Draft sent' });
    },
    onError: (e) => toast({ title: 'Could not send draft', description: errorMessage(e), variant: 'destructive' }),
  });

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Thread header */}
      <div className="flex h-12 shrink-0 items-center gap-2.5 border-b px-4">
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 md:hidden"
          onClick={onBack}
          aria-label="Back to conversations"
        >
          <ArrowLeft className="size-4" />
        </Button>
        {threadQ.isLoading ? (
          <Skeleton className="h-4 w-44" />
        ) : conversation ? (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold leading-tight">{conversation.participantName}</p>
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <PlatformDot platform={conversation.platform} className="size-2" />
                <span className="truncate">
                  {PLATFORM_LABEL[conversation.platform]} · @{conversation.accountUsername}
                </span>
              </p>
            </div>
            <Badge
              variant="outline"
              className={cn('h-5 shrink-0 rounded px-1.5 text-[10px] font-medium', CONVERSATION_STATUS_BADGE[conversation.status].className)}
            >
              {CONVERSATION_STATUS_BADGE[conversation.status].label}
            </Badge>
            {canReply ? (
              <Button
                variant="outline"
                size="sm"
                className="h-7 shrink-0 text-xs"
                disabled={statusMut.isPending}
                onClick={() => statusMut.mutate(conversation.status === 'OPEN' ? 'resolve' : 'reopen')}
              >
                {conversation.status === 'OPEN' ? (
                  <>
                    <CheckCircle2 className="size-3.5" />
                    Mark resolved
                  </>
                ) : (
                  <>
                    <RotateCcw className="size-3.5" />
                    Reopen
                  </>
                )}
              </Button>
            ) : null}
          </>
        ) : null}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4" role="log" aria-label="Conversation messages">
        {threadQ.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-2/3" />
            <Skeleton className="ml-auto h-12 w-1/2" />
            <Skeleton className="h-14 w-3/5" />
          </div>
        ) : threadQ.isError ? (
          <Alert variant="destructive" className="mx-auto max-w-md">
            <AlertCircle className="size-4 shrink-0" />
            <AlertTitle className="text-[13px]">Could not load conversation</AlertTitle>
            <AlertDescription className="text-xs">
              <p>{errorMessage(threadQ.error)}</p>
              <Button variant="outline" size="sm" className="mt-2 h-7 border-destructive/40 text-xs" onClick={() => void threadQ.refetch()}>
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">No messages in this conversation yet.</p>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-3">
            {messages.map((m) => (
              <div key={m.id} className="space-y-1">
                <div
                  className={cn(
                    'flex',
                    m.direction === 'IN' ? 'justify-start' : 'justify-end',
                  )}
                >
                  <div className={cn('max-w-[78%]', m.direction === 'OUT' && 'items-end text-right')}>
                    <div
                      className={cn(
                        'inline-block whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-left text-[13px] leading-relaxed',
                        m.direction === 'IN'
                          ? 'bg-secondary text-secondary-foreground'
                          : 'bg-primary text-primary-foreground',
                      )}
                    >
                      {m.text}
                    </div>
                    <p className={cn('mt-0.5 px-1 text-[10px] text-muted-foreground', m.direction === 'OUT' && 'text-right')}>
                      {m.authorName} · {format(new Date(m.createdAt), 'MMM d, HH:mm')}
                    </p>
                  </div>
                </div>
                {lastInWithDraft?.id === m.id && m.aiDraft ? (
                  <div
                    className={cn('ml-8 rounded-md border border-dashed border-teal-500/40 bg-teal-500/5 p-3')}
                    aria-label="AI draft reply"
                  >
                    <p className="flex items-center gap-1.5 text-[11px] font-medium text-teal-600 dark:text-teal-400">
                      <Sparkles className="size-3" aria-hidden="true" />
                      AI draft — review before sending
                    </p>
                    <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed">{m.aiDraft}</p>
                    <div className="mt-2.5 flex gap-2">
                      {canReply ? (
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          disabled={applyDraftMut.isPending}
                          onClick={() => applyDraftMut.mutate(m.id)}
                        >
                          {applyDraftMut.isPending ? 'Sending…' : 'Send draft'}
                        </Button>
                      ) : null}
                      {canReply ? (
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setReplyText(m.aiDraft ?? '')}>
                          Edit
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t px-4 py-3">
        <TooltipProvider delayDuration={150}>
          <div className="mx-auto max-w-2xl space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={!canUseAi || !latestIn || draftMut.isPending}
                    onClick={() => latestIn && draftMut.mutate(latestIn.id)}
                    aria-label="Draft AI reply"
                  >
                    <Sparkles className="size-3.5 text-teal-600 dark:text-teal-400" />
                    {draftMut.isPending ? 'Drafting…' : 'Draft AI reply'}
                  </Button>
                </TooltipTrigger>
                {!canUseAi ? (
                  <TooltipContent className="text-xs">Requires AI permission</TooltipContent>
                ) : !latestIn ? (
                  <TooltipContent className="text-xs">No incoming message to reply to yet</TooltipContent>
                ) : null}
              </Tooltip>
              {conversation?.subject ? (
                <p className="truncate text-[11px] text-muted-foreground" title={conversation.subject}>
                  {conversation.subject}
                </p>
              ) : null}
            </div>
            <div className="flex items-end gap-2">
              <Textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={canReply ? 'Write a reply…' : 'You do not have permission to reply'}
                disabled={!canReply}
                rows={2}
                className="min-h-9 resize-none text-[13px]"
                aria-label="Reply message"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canReply && replyText.trim()) {
                    replyMut.mutate(replyText.trim());
                  }
                }}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex">
                    <Button
                      size="sm"
                      className="h-9"
                      disabled={!canReply || !replyText.trim() || replyMut.isPending}
                      onClick={() => replyMut.mutate(replyText.trim())}
                      aria-label="Send reply"
                    >
                      <Send className="size-3.5" />
                      Send
                    </Button>
                  </span>
                </TooltipTrigger>
                {!canReply ? <TooltipContent className="text-xs">Requires reply permission</TooltipContent> : null}
              </Tooltip>
            </div>
            <p className="text-[10px] text-muted-foreground">Cmd/Ctrl + Enter to send</p>
          </div>
        </TooltipProvider>
      </div>
    </div>
  );
}
