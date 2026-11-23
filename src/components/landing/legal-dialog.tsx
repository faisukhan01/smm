'use client';

import type { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export type LegalDoc = 'privacy' | 'terms';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <div className="mt-1.5 space-y-2 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </div>
  );
}

function PrivacyContent() {
  return (
    <div className="space-y-6">
      <Section title="What SMM stores">
        <p>
          When you create an account, SMM stores your name, email address and a securely hashed
          password. We also store the content you create in SMM — drafts, captions, hashtags,
          media and schedules — along with your workspace and brand settings.
        </p>
        <p>
          To publish on your behalf, SMM stores OAuth access and refresh tokens for the platform
          accounts you connect. These credentials are encrypted at rest and are used only to call
          the official platform APIs you authorized.
        </p>
        <p>
          We keep basic usage analytics (which features are used and how often) to maintain and
          improve the service.
        </p>
      </Section>

      <Section title="What we do not do">
        <p>
          We do not sell your data, and we do not share it with advertisers. We do not use your
          content or brand materials to train AI models.
        </p>
      </Section>

      <Section title="Third-party platform APIs">
        <p>
          SMM interacts with Facebook, Instagram and Pinterest exclusively through their official
          developer APIs. When you connect an account, those platforms process data under their
          own privacy policies. You can revoke SMM&apos;s access at any time — from your platform
          account settings, or by disconnecting the account in SMM.
        </p>
      </Section>

      <Section title="Data removal and contact">
        <p>
          You can delete posts, media and connected accounts from within SMM at any time. If you
          want your account and personal data removed entirely, open an issue on our{' '}
          <a
            href="https://github.com/faisukhan01/smm/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline underline-offset-2"
          >
            GitHub Issues
          </a>{' '}
          page and we will process the request.
        </p>
      </Section>
    </div>
  );
}

function TermsContent() {
  return (
    <div className="space-y-6">
      <Section title="The service">
        <p>
          SMM is provided &quot;as is&quot; while the product is in active development. Features
          may change, and we cannot guarantee uninterrupted availability. We will always be
          upfront about what works today and what is still pending.
        </p>
      </Section>

      <Section title="Acceptable use">
        <p>
          Use SMM only for accounts you own or are authorized to manage. Do not use SMM to create
          fake engagement, spam, or any form of automation that violates platform rules. SMM
          publishes exclusively through official platform APIs — and we expect every workspace to
          stay within each platform&apos;s own terms.
        </p>
      </Section>

      <Section title="Your responsibility">
        <p>
          You are responsible for the content you publish: make sure you hold the necessary
          rights to images, music and claims, and that your posts comply with the terms of each
          connected platform and with applicable law.
        </p>
      </Section>

      <Section title="Subscriptions">
        <p>
          Paid plans are listed for transparency. Payment provider integration is pending, so no
          charges are processed today. When billing goes live, these terms will be updated with
          the provider&apos;s conditions — and you will always be asked to confirm before any
          charge.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about these terms? Reach us via{' '}
          <a
            href="https://github.com/faisukhan01/smm/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline underline-offset-2"
          >
            GitHub Issues
          </a>
          .
        </p>
      </Section>
    </div>
  );
}

export function LegalDialog({
  doc,
  onOpenChange,
}: {
  doc: LegalDoc | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={doc !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{doc === 'terms' ? 'Terms of Service' : 'Privacy Policy'}</DialogTitle>
          <DialogDescription>
            {doc === 'terms'
              ? 'The agreement between you and SMM.'
              : 'How SMM handles your data and credentials.'}
          </DialogDescription>
        </DialogHeader>
        {doc === 'terms' ? <TermsContent /> : <PrivacyContent />}
      </DialogContent>
    </Dialog>
  );
}
