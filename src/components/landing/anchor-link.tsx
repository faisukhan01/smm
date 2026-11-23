'use client';

import type { MouseEvent, ReactNode } from 'react';

/**
 * Smoothly scrolls to a section id. Sections opt into clearance from the
 * sticky nav with `scroll-mt-16`.
 */
export function scrollToId(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

interface AnchorLinkProps {
  /** Section id (without "#") to link to. */
  target: string;
  children: ReactNode;
  className?: string;
  /**
   * Called instead of the default immediate scroll — lets callers run their
   * own logic first (e.g. close the mobile sheet, then scroll).
   */
  onNavigate?: () => void;
}

export function AnchorLink({ target, children, className, onNavigate }: AnchorLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (onNavigate) {
      onNavigate();
    } else {
      scrollToId(target);
    }
  };

  return (
    <a href={`#${target}`} className={className} onClick={handleClick}>
      {children}
    </a>
  );
}
