'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ConversationDTO, SessionPayload } from '@smm/shared';
import { Info } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { apiGet } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InboxThread } from '@/components/views/inbox/inbox-thread';
import { PlatformDot } from '@/components/views/inbox/ui';

type ConversationFilter = 'OPEN' | 'RESOLVED';

const INBOX_NOTICE =
  'Inbox shows conversations available through official platform APIs. Real comment/message sync requires approved platform permissions and a connected (non-demo) account.';

interface ConversationRowProps {
  conversation: ConversationDTO;
  active: boolean;
  onSelect: (id: string) => void;
}

function ConversationRow({ conversation, active, onSelect }: ConversationRowProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(conversation.id)}
      aria-current={active ? 'true' : undefined}
      className={cn(
        'w-full border-b px-3 py-2.5 text-left transition-colors last:border-0',
        active ? 'bg-accent' : 'hover:bg-accent/50',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[13px] font-medium leading-tight">{conversation.participantName}</p>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {formatDistanceToNowStrict(new Date(conversation.lastMessageAt), { addSuffix: true })}
        </span>
      </div>
      <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <PlatformDot platform={conversation.platform} className="size-2" />
        <span className="truncate">@{conversation.accountUsername}</span>
      </p>
      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{conversation.preview}</p>
    </button>
  );
}

export function InboxView({ session }: { session: SessionPayload }) {
  const [filter, setFilter] = useState<ConversationFilter>('OPEN');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ['inbox', 'conversations', filter],
    queryFn: () => apiGet<{ items: ConversationDTO[] }>(`/inbox/conversations?status=${filter}`),
  });

  const items = listQ.data?.items ?? [];

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[460px] overflow-hidden rounded-lg border bg-card">
      {/* Conversation list */}
      <div
        className={cn(
          'w-full shrink-0 flex-col border-r md:flex md:w-80',
          selectedId ? 'hidden md:flex' : 'flex',
        )}
      >
        <div className="shrink-0 border-b px-3 py-2.5">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as ConversationFilter)}>
            <TabsList className="grid h-8 w-full grid-cols-2">
              <TabsTrigger value="OPEN" className="h-6 text-xs">Open</TabsTrigger>
              <TabsTrigger value="RESOLVED" className="h-6 text-xs">Resolved</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <ScrollArea className="flex-1">
          {listQ.isLoading ? (
            <div className="space-y-0">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="space-y-1.5 border-b px-3 py-3">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-full" />
                </div>
              ))}
            </div>
          ) : listQ.isError ? (
            <div className="p-3">
              <Alert variant="destructive">
                <AlertDescription className="text-xs">
                  Could not load conversations.
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 h-7 border-destructive/40 text-xs"
                    onClick={() => void listQ.refetch()}
                  >
                    Try again
                  </Button>
                </AlertDescription>
              </Alert>
            </div>
          ) : items.length === 0 ? (
            <div className="space-y-3 p-3">
              <Alert className="border-dashed bg-muted/40">
                <Info className="size-4 shrink-0" />
                <AlertDescription className="text-xs leading-relaxed text-muted-foreground">
                  {INBOX_NOTICE}
                </AlertDescription>
              </Alert>
              <p className="text-center text-xs text-muted-foreground">
                {filter === 'OPEN' ? 'No open conversations.' : 'No resolved conversations.'}
              </p>
            </div>
          ) : (
            <div>
              {items.map((c) => (
                <ConversationRow
                  key={c.id}
                  conversation={c}
                  active={c.id === selectedId}
                  onSelect={setSelectedId}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Thread pane */}
      <div className={cn('min-w-0 flex-1 md:flex', selectedId ? 'flex' : 'hidden')}>
        {selectedId ? (
          <InboxThread
            key={selectedId}
            conversationId={selectedId}
            session={session}
            onBack={() => setSelectedId(null)}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            {listQ.isLoading ? (
              <Skeleton className="h-4 w-40" />
            ) : (
              <>
                <p className="text-[13px] font-medium text-muted-foreground">Select a conversation</p>
                <Alert className="max-w-md border-dashed bg-muted/40 text-left">
                  <Info className="size-4 shrink-0" />
                  <AlertDescription className="text-xs leading-relaxed text-muted-foreground">
                    {INBOX_NOTICE}
                  </AlertDescription>
                </Alert>
              </>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
