'use client';

import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { AnchorLink } from './anchor-link';
import { BrandMark } from './brand-mark';
import type { LegalDoc } from './legal-dialog';

const PRODUCT_LINKS = [
  { id: 'features', label: 'Features' },
  { id: 'how', label: 'How it works' },
  { id: 'pricing', label: 'Pricing' },
] as const;

const RESOURCE_LINKS = [
  { label: 'GitHub — faisukhan01/smm', href: 'https://github.com/faisukhan01/smm' },
  { label: 'API reference', href: 'https://github.com/faisukhan01/smm#readme' },
  { label: 'Developer docs', href: 'https://developers.facebook.com/docs/' },
] as const;

const CONTACT_LINKS = [
  { label: 'GitHub Issues', href: 'https://github.com/faisukhan01/smm/issues' },
  { label: 'faisalkhan01.vercel.app', href: 'https://faisalkhan01.vercel.app' },
] as const;

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      {children}
      <ArrowUpRight className="size-3 opacity-60" aria-hidden="true" />
    </a>
  );
}

function FooterColumnHeading({ children }: { children: ReactNode }) {
  return <h3 className="text-sm font-semibold">{children}</h3>;
}

export function SiteFooter({ onOpenLegal }: { onOpenLegal: (doc: LegalDoc) => void }) {
  return (
    <footer className="mt-auto border-t bg-background">
      <div className="mx-auto max-w-6xl px-4 py-12 md:px-6 md:py-14">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <BrandMark />
              <span className="text-[15px] font-semibold tracking-tight">SMM</span>
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Your AI-powered social media team, working across your connected platforms.
            </p>
          </div>

          <nav aria-label="Product">
            <FooterColumnHeading>Product</FooterColumnHeading>
            <ul className="mt-3.5 space-y-2.5">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.id}>
                  <AnchorLink
                    target={link.id}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </AnchorLink>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Resources">
            <FooterColumnHeading>Resources</FooterColumnHeading>
            <ul className="mt-3.5 space-y-2.5">
              {RESOURCE_LINKS.map((link) => (
                <li key={link.label}>
                  <ExternalLink href={link.href}>{link.label}</ExternalLink>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="Legal">
            <FooterColumnHeading>Legal</FooterColumnHeading>
            <ul className="mt-3.5 space-y-2.5">
              <li>
                <button
                  type="button"
                  onClick={() => onOpenLegal('privacy')}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Privacy Policy
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => onOpenLegal('terms')}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  Terms of Service
                </button>
              </li>
            </ul>
          </nav>

          <nav aria-label="Contact">
            <FooterColumnHeading>Contact</FooterColumnHeading>
            <ul className="mt-3.5 space-y-2.5">
              {CONTACT_LINKS.map((link) => (
                <li key={link.label}>
                  <ExternalLink href={link.href}>{link.label}</ExternalLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            © 2026 SMM. Built by Faisal Arslan Khan.
          </p>
          <p className="text-xs text-muted-foreground">
            Official platform APIs · Encrypted credentials · No automation bots
          </p>
        </div>
      </div>
    </footer>
  );
}
