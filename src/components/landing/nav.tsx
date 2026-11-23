'use client';

import { useState } from 'react';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { AnchorLink, scrollToId } from './anchor-link';
import type { AuthTab } from './auth-dialog';
import { BrandMark } from './brand-mark';

const NAV_LINKS = [
  { id: 'features', label: 'Features' },
  { id: 'how', label: 'How it works' },
  { id: 'pricing', label: 'Pricing' },
] as const;

export function SiteNav({ onOpenAuth }: { onOpenAuth: (tab: AuthTab) => void }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <nav aria-label="Main" className="mx-auto flex h-14 max-w-6xl items-center px-4 md:px-6">
        <a
          href="#top"
          className="flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          onClick={(event) => {
            event.preventDefault();
            scrollToId('top');
          }}
        >
          <BrandMark />
          <span className="text-[15px] font-semibold tracking-tight">SMM</span>
        </a>

        <div className="ml-8 hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <AnchorLink
              key={link.id}
              target={link.id}
              className="rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </AnchorLink>
          ))}
        </div>

        <div className="ml-auto hidden items-center gap-1.5 md:flex">
          <Button variant="ghost" size="sm" onClick={() => onOpenAuth('login')}>
            Sign in
          </Button>
          <Button size="sm" onClick={() => onOpenAuth('register')}>
            Get started
          </Button>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="ml-auto md:hidden"
          aria-label="Open menu"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
        >
          <Menu />
        </Button>
      </nav>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="right" className="w-72">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2.5 text-left text-sm">
              <BrandMark />
              SMM
            </SheetTitle>
            <SheetDescription className="text-left">
              Navigate the page or get started.
            </SheetDescription>
          </SheetHeader>
          <nav aria-label="Mobile" className="flex flex-col gap-1 px-4">
            {NAV_LINKS.map((link) => (
              <AnchorLink
                key={link.id}
                target={link.id}
                className="rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onNavigate={() => {
                  // Close the sheet first; scroll once the scroll lock releases.
                  setMobileOpen(false);
                  window.setTimeout(() => scrollToId(link.id), 350);
                }}
              >
                {link.label}
              </AnchorLink>
            ))}
          </nav>
          <div className="mt-4 space-y-2 px-4">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setMobileOpen(false);
                onOpenAuth('login');
              }}
            >
              Sign in
            </Button>
            <Button
              className="w-full"
              onClick={() => {
                setMobileOpen(false);
                onOpenAuth('register');
              }}
            >
              Get started
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
