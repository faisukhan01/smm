'use client';

import { Sparkles } from 'lucide-react';

/**
 * Shared SMM logo mark — the same treatment as the product dashboard sidebar.
 */
export function BrandMark() {
  return (
    <span
      aria-hidden="true"
      className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground"
    >
      <Sparkles className="size-4" />
    </span>
  );
}
