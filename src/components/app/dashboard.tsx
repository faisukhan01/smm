'use client';

import { useState } from 'react';
import {
  BarChart3,
  Bell,
  Bot,
  CalendarDays,
  CheckSquare,
  CreditCard,
  FileText,
  Inbox,
  LayoutDashboard,
  Link2,
  LogOut,
  Settings,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NotificationDTO, SessionPayload } from '@smm/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { apiGet, apiPost } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { OverviewView } from '@/components/views/overview';
import { AssistantView } from '@/components/views/assistant';
import { StudioView } from '@/components/views/studio';
import { CalendarView } from '@/components/views/calendar';
import { PostsView } from '@/components/views/posts';
import { AccountsView } from '@/components/views/accounts';
import { InboxView } from '@/components/views/inbox';
import { AnalyticsView } from '@/components/views/analytics';
import { SettingsView } from '@/components/views/settings';

export type ViewKey =
  | 'overview'
  | 'assistant'
  | 'studio'
  | 'calendar'
  | 'posts'
  | 'accounts'
  | 'inbox'
  | 'analytics'
  | 'settings';

const NAV: { section: string; items: { key: ViewKey; label: string; icon: React.ComponentType<{ className?: string }> }[] }[] = [
  {
    section: 'Workspace',
    items: [
      { key: 'overview', label: 'Overview', icon: LayoutDashboard },
      { key: 'assistant', label: 'AI Assistant', icon: Bot },
      { key: 'studio', label: 'Content Studio', icon: Wand2 },
    ],
  },
  {
    section: 'Content',
    items: [
      { key: 'calendar', label: 'Calendar', icon: CalendarDays },
      { key: 'posts', label: 'Posts', icon: FileText },
      { key: 'accounts', label: 'Connected Accounts', icon: Link2 },
    ],
  },
  {
    section: 'Engage',
    items: [
      { key: 'inbox', label: 'Inbox', icon: Inbox },
      { key: 'analytics', label: 'Analytics', icon: BarChart3 },
    ],
  },
  {
    section: 'Manage',
    items: [
      { key: 'settings', label: 'Settings', icon: Settings },
    ],
  },
];

const VIEW_TITLES: Record<ViewKey, string> = {
  overview: 'Overview',
  assistant: 'AI Assistant',
  studio: 'Content Studio',
  calendar: 'Content Calendar',
  posts: 'Posts',
  accounts: 'Connected Accounts',
  inbox: 'Inbox',
  analytics: 'Analytics',
  settings: 'Settings',
};

export function Dashboard({ session, onSessionChange }: { session: SessionPayload; onSessionChange: (s: SessionPayload | null) => void }) {
  const [view, setView] = useState<ViewKey>('overview');
  const queryClient = useQueryClient();

  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () => apiGet<{ items: NotificationDTO[]; unread: number }>('/notifications'),
    refetchInterval: 30_000,
  });

  const logout = useMutation({
    mutationFn: () => apiPost<void>('/auth/logout'),
    onSuccess: () => {
      queryClient.clear();
      onSessionChange(null);
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => apiPost<void>('/notifications/read-all'),
    onSuccess: () => notifications.refetch(),
  });

  const active = NAV.flatMap((s) => s.items).find((i) => i.key === view)!;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-card md:flex">
        <div className="flex h-14 items-center gap-2.5 border-b px-4">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </span>
          <span className="text-sm font-semibold tracking-tight">SMM</span>
          <Badge variant="secondary" className="ml-auto text-[10px] font-medium uppercase tracking-wide">
            {session.workspace.plan}
          </Badge>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4" aria-label="Dashboard navigation">
          {NAV.map((group) => (
            <div key={group.section}>
              <p className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {group.section}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setView(item.key)}
                    aria-current={view === item.key ? 'page' : undefined}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors',
                      view === item.key
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )}
                  >
                    <item.icon className="size-4 shrink-0" />
                    {item.label}
                    {item.key === 'inbox' ? null : null}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t p-3">
          <div className="flex items-center gap-2.5 rounded-md px-1 py-1">
            <span className="flex size-7 items-center justify-center rounded-full bg-secondary text-[11px] font-semibold">
              {session.user.name.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium leading-tight">{session.user.name}</p>
              <p className="truncate text-[11px] text-muted-foreground">{session.workspace.name}</p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7" aria-label="Account menu">
                  <CheckSquare className="hidden" />
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuLabel className="text-xs">
                  <p className="font-medium">{session.user.email}</p>
                  <p className="text-muted-foreground">Role: {session.role.toLowerCase()}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setView('settings')}>
                  <CreditCard className="size-4" /> Settings &amp; Billing
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => logout.mutate()} disabled={logout.isPending}>
                  <LogOut className="size-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-card px-4 md:px-6">
          {/* Mobile nav */}
          <div className="flex items-center gap-2 md:hidden">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Sparkles className="size-4" />
            </span>
            <span className="text-sm font-semibold">SMM</span>
          </div>
          <h1 className="truncate text-sm font-semibold tracking-tight md:text-[15px]">{VIEW_TITLES[view]}</h1>
          <p className="hidden truncate text-[13px] text-muted-foreground lg:block">
            {session.workspace.name}
          </p>
          <div className="ml-auto flex items-center gap-1.5">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative size-8" aria-label="Notifications">
                  <Bell className="size-4" />
                  {(notifications.data?.unread ?? 0) > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">
                      {notifications.data!.unread > 9 ? '9+' : notifications.data!.unread}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <p className="text-[13px] font-semibold">Notifications</p>
                  {(notifications.data?.unread ?? 0) > 0 && (
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={() => markAllRead.mutate()}>
                      Mark all read
                    </Button>
                  )}
                </div>
                <ScrollArea className="max-h-72">
                  {notifications.data?.items.length ? (
                    notifications.data.items.map((n) => (
                      <div key={n.id} className={cn('border-b px-3 py-2.5 last:border-0', !n.read && 'bg-primary/5')}>
                        <p className="text-[13px] font-medium leading-tight">{n.title}</p>
                        {n.body && <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>}
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {new Date(n.createdAt).toLocaleString()}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="px-3 py-6 text-center text-xs text-muted-foreground">No notifications yet</p>
                  )}
                </ScrollArea>
              </PopoverContent>
            </Popover>
            <Separator orientation="vertical" className="h-5" />
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
              {session.role}
            </Badge>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-4 py-5 md:px-6 md:py-6">
            {view === 'overview' && <OverviewView session={session} onNavigate={setView} />}
            {view === 'assistant' && <AssistantView session={session} />}
            {view === 'studio' && <StudioView session={session} />}
            {view === 'calendar' && <CalendarView session={session} />}
            {view === 'posts' && <PostsView session={session} />}
            {view === 'accounts' && <AccountsView session={session} />}
            {view === 'inbox' && <InboxView session={session} />}
            {view === 'analytics' && <AnalyticsView session={session} />}
            {view === 'settings' && <SettingsView session={session} />}
          </div>
        </main>
      </div>
    </div>
  );
}
