'use client';

import { BarChart3, Bot, CalendarDays, Inbox, Send, Wand2 } from 'lucide-react';

const FEATURES = [
  {
    icon: Wand2,
    title: 'AI Content Creation',
    description: 'Brand-aware captions, hashtags and creatives in seconds.',
  },
  {
    icon: Send,
    title: 'Multi-Platform Publishing',
    description: 'One post, every connected platform — scheduled and delivered by a background engine.',
  },
  {
    icon: CalendarDays,
    title: 'Content Calendar',
    description: 'Plan weeks ahead on a clear visual calendar.',
  },
  {
    icon: Bot,
    title: 'AI Social Assistant',
    description: 'Ask for a weekly plan, ideas or improvements — it works in your brand voice.',
  },
  {
    icon: Inbox,
    title: 'Unified Inbox',
    description: 'Comments and messages where the platforms allow it, with AI-drafted replies.',
  },
  {
    icon: BarChart3,
    title: 'Performance Analytics',
    description: 'Honest metrics from real platform APIs — never fabricated.',
  },
] as const;

export function Features() {
  return (
    <section id="features" aria-labelledby="features-heading" className="scroll-mt-16 py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-4 md:px-6">
        <div className="max-w-2xl">
          <h2 id="features-heading" className="text-2xl font-semibold tracking-tight md:text-3xl">
            Everything you need to plan, create and publish
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
            Six focused capabilities, designed around the official platform APIs — with AI
            assisting where it genuinely helps.
          </p>
        </div>

        <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title}>
              <feature.icon className="size-5 text-primary" aria-hidden="true" />
              <h3 className="mt-4 text-[15px] font-semibold">{feature.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
