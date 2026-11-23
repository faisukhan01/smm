'use client';

import { useCallback, useState } from 'react';
import type { SessionPayload } from '@smm/shared';
import { AuthDialog, type AuthTab } from './auth-dialog';
import { Features } from './features';
import { SiteFooter } from './footer';
import { Hero } from './hero';
import { HowItWorks } from './how-it-works';
import { LegalDialog, type LegalDoc } from './legal-dialog';
import { SiteNav } from './nav';
import { PlatformStrip } from './platform-logos';
import { Pricing } from './pricing';

/**
 * Public marketing landing page. Mounted as
 * <Landing onAuthed={(session: SessionPayload) => void} /> — the page wrapper
 * is a full-height flex column so the footer sticks to the bottom on short
 * viewports.
 */
export function Landing({ onAuthed }: { onAuthed: (session: SessionPayload) => void }) {
  const [authOpen, setAuthOpen] = useState(false);
  const [authTab, setAuthTab] = useState<AuthTab>('register');
  const [legalDoc, setLegalDoc] = useState<LegalDoc | null>(null);

  const openAuth = useCallback((tab: AuthTab) => {
    setAuthTab(tab);
    setAuthOpen(true);
  }, []);

  const openLegal = useCallback((doc: LegalDoc) => {
    setLegalDoc(doc);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteNav onOpenAuth={openAuth} />

      <main className="flex-1">
        <Hero onOpenAuth={openAuth} />
        <PlatformStrip />
        <Features />
        <HowItWorks />
        <Pricing onOpenAuth={openAuth} />
      </main>

      <SiteFooter onOpenLegal={openLegal} />

      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        tab={authTab}
        onTabChange={setAuthTab}
        onAuthed={onAuthed}
        onOpenLegal={openLegal}
      />
      <LegalDialog doc={legalDoc} onOpenChange={(next) => setLegalDoc(next ? legalDoc : null)} />
    </div>
  );
}
