'use client';

import type { Platform } from '@smm/shared';
import { PLATFORM_LABEL } from '@smm/shared';
import {
  Bell,
  Bot,
  CalendarDays,
  FileText,
  LayoutDashboard,
  Lock,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { PlatformDot } from './platform-logos';

/**
 * A code-built miniature of the real SMM dashboard (mirrors the product's
 * sidebar treatment, stat tiles and posts table). All numbers and captions
 * below are static UI illustration inside a product screenshot mock — marked
 * as role="img" so assistive tech reads a single description, not the mock.
 */

const SIDEBAR_ITEMS = [
  { label: 'Overview', icon: LayoutDashboard, active: true },
  { label: 'Content Studio', icon: Wand2, active: false },
  { label: 'Calendar', icon: CalendarDays, active: false },
  { label: 'Posts', icon: FileText, active: false },
];

const STATS = [
  { label: 'Drafts', value: '12' },
  { label: 'Scheduled', value: '8' },
  { label: 'Published', value: '142' },
  { label: 'Failed', value: '1' },
];

type PreviewStatus = 'Draft' | 'Scheduled' | 'Published';

const UP_NEXT: { caption: string; platform: Platform; time: string; status: PreviewStatus }[] = [
  {
    caption: 'Behind the scenes: how our autumn collection came to life',
    platform: 'INSTAGRAM',
    time: '2:30 PM',
    status: 'Draft',
  },
  {
    caption: 'Studio lookbook pins — warm tones, natural light',
    platform: 'PINTEREST',
    time: '4:00 PM',
    status: 'Scheduled',
  },
  {
    caption: 'Five tips for growing your Page organically',
    platform: 'FACEBOOK',
    time: '5:15 PM',
    status: 'Published',
  },
];

const STATUS_BADGE: Record<PreviewStatus, 'secondary' | 'default' | 'outline'> = {
  Draft: 'secondary',
  Scheduled: 'default',
  Published: 'outline',
};

const AI_HASHTAGS = ['#studiolife', '#autumncollection', '#madewithcare'];

/** Official Instagram brand glyph — the one permitted gradient on the page. */
function InstagramGlyph() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-3 shrink-0 items-center justify-center rounded-[3px]"
      style={{
        background:
          'radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)',
      }}
    >
      <svg viewBox="0 0 24 24" className="size-2" fill="none">
        <rect x="4" y="4" width="16" height="16" rx="4.5" stroke="white" strokeWidth="2.4" />
        <circle cx="12" cy="12" r="3.6" stroke="white" strokeWidth="2.4" />
        <circle cx="16.4" cy="7.6" r="1.3" fill="white" />
      </svg>
    </span>
  );
}

function PlatformChip({ platform }: { platform: Platform }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {platform === 'INSTAGRAM' ? <InstagramGlyph /> : <PlatformDot platform={platform} className="size-2" />}
      <span className="text-[10px] text-muted-foreground">{PLATFORM_LABEL[platform]}</span>
    </span>
  );
}

export function DashboardPreview() {
  return (
    <div
      role="img"
      aria-label="Preview of the SMM dashboard: stat tiles for drafts, scheduled, published and failed posts, an upcoming-posts table across Facebook, Instagram and Pinterest, and the AI assistant drafting a caption with hashtags."
      className="relative mx-auto mt-12 w-full max-w-5xl md:mt-16"
    >
      <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
        {/* Browser chrome */}
        <div className="flex items-center border-b bg-muted/60 px-3 py-2 md:px-4">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
          </div>
          <div className="mx-auto flex h-6 w-44 items-center justify-center gap-1.5 rounded-md border bg-background px-2 text-[11px] leading-none text-muted-foreground md:w-56">
            <Lock className="size-3" aria-hidden="true" />
            app.smm.dev
          </div>
          <div className="w-10 md:w-14" aria-hidden="true" />
        </div>

        <div className="flex">
          {/* Mini sidebar (160px) */}
          <div className="hidden w-40 shrink-0 flex-col border-r bg-card sm:flex" aria-hidden="true">
            <div className="flex h-9 items-center gap-1.5 border-b px-3">
              <span className="flex size-5 items-center justify-center rounded-[5px] bg-primary text-primary-foreground">
                <Sparkles className="size-3" />
              </span>
              <span className="text-[11px] font-semibold tracking-tight">SMM</span>
            </div>
            <nav className="space-y-0.5 p-2">
              {SIDEBAR_ITEMS.map((item) => (
                <div
                  key={item.label}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1 text-[11px] font-medium',
                    item.active ? 'bg-primary/10 text-primary' : 'text-muted-foreground',
                  )}
                >
                  <item.icon className="size-3" />
                  {item.label}
                </div>
              ))}
            </nav>
          </div>

          {/* Mini main panel */}
          <div className="min-w-0 flex-1">
            <div className="flex h-9 items-center justify-between border-b px-3" aria-hidden="true">
              <span className="text-[11px] font-semibold tracking-tight">Overview</span>
              <span className="flex items-center gap-2">
                <Bell className="size-3 text-muted-foreground" />
                <span className="flex size-5 items-center justify-center rounded-full bg-secondary text-[8px] font-semibold">
                  FK
                </span>
              </span>
            </div>

            <div className="space-y-2.5 p-3" aria-hidden="true">
              {/* Stat tiles */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {STATS.map((stat) => (
                  <div key={stat.label} className="rounded-md border bg-card p-2">
                    <p className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                      {stat.label}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold tabular-nums">{stat.value}</p>
                  </div>
                ))}
              </div>

              {/* Upcoming posts */}
              <div className="rounded-md border bg-card">
                <p className="border-b px-2.5 py-1.5 text-[10px] font-semibold">Upcoming posts</p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[430px] text-left">
                    <thead>
                      <tr className="border-b">
                        <th className="px-2.5 py-1.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                          Post
                        </th>
                        <th className="px-2.5 py-1.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                          Platform
                        </th>
                        <th className="px-2.5 py-1.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                          Time
                        </th>
                        <th className="px-2.5 py-1.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {UP_NEXT.map((post) => (
                        <tr key={post.caption} className="border-b last:border-0">
                          <td className="max-w-[230px] truncate px-2.5 py-1.5 text-[10px] font-medium">
                            {post.caption}
                          </td>
                          <td className="px-2.5 py-1.5">
                            <PlatformChip platform={post.platform} />
                          </td>
                          <td className="whitespace-nowrap px-2.5 py-1.5 text-[10px] tabular-nums text-muted-foreground">
                            {post.time}
                          </td>
                          <td className="px-2.5 py-1.5">
                            <Badge
                              variant={STATUS_BADGE[post.status]}
                              className="px-1.5 py-0 text-[9px] leading-4"
                            >
                              {post.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* AI assistant card */}
              <div className="rounded-md border bg-card p-2.5">
                <div className="flex items-center gap-1.5">
                  <Bot className="size-3 text-primary" />
                  <span className="text-[10px] font-semibold">AI Assistant</span>
                  <Badge
                    variant="outline"
                    className="ml-auto px-1.5 py-0 text-[9px] font-medium leading-4 text-muted-foreground"
                  >
                    Draft
                  </Badge>
                </div>
                <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                  Behind the scenes at the studio: every piece starts as a quick sketch before
                  colour and craft bring it to life — a look at how our autumn collection came
                  together.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {AI_HASHTAGS.map((tag) => (
                    <span
                      key={tag}
                      className="rounded bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                  <span className="ml-auto inline-flex h-5 items-center gap-1 rounded-md bg-primary px-2 text-[9px] font-medium text-primary-foreground">
                    <Wand2 className="size-2.5" />
                    Generate
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
