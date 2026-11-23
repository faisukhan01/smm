'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const MAX_HASHTAGS = 30;

function normalize(raw: string): string {
  return raw.trim().replace(/^#+/, '').replace(/\s+/g, '-').slice(0, 60);
}

/**
 * Chip-style hashtag editor: type + Enter (or comma) to add, chips removable,
 * Backspace on an empty input removes the last chip. Max 30 per API contract.
 */
export function HashtagInput({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState('');

  const addDraft = () => {
    const tag = normalize(draft);
    if (!tag) {
      setDraft('');
      return;
    }
    if (!value.includes(tag) && value.length < MAX_HASHTAGS) {
      onChange([...value, tag]);
    }
    setDraft('');
  };

  const remove = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  return (
    <div className={cn('space-y-2', className)}>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <Badge key={tag} variant="outline" className="gap-1 pr-1 font-normal">
              #{tag}
              <button
                type="button"
                disabled={disabled}
                onClick={() => remove(tag)}
                aria-label={`Remove hashtag ${tag}`}
                className="flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <Input
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            addDraft();
          } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        placeholder={
          value.length >= MAX_HASHTAGS
            ? `Maximum of ${MAX_HASHTAGS} hashtags`
            : 'Type a hashtag and press Enter'
        }
        aria-label="Add hashtag"
        className="h-9 text-[13px]"
      />
      <p className="text-[11px] text-muted-foreground">
        {value.length}/{MAX_HASHTAGS} hashtags
      </p>
    </div>
  );
}
