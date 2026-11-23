import { Globe, MessageCircle, Share2, ThumbsUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FacebookPreviewProps {
  content: string;
  hashtags: string[];
  mediaUrl?: string | null;
  accountName: string;
}

function tagList(hashtags: string[]): string {
  return hashtags.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)).join(' ');
}

/**
 * Compact, platform-faithful mock of a Facebook Page post.
 * Static by design: it previews composer state, it is not a feed.
 */
export function FacebookPreview({ content, hashtags, mediaUrl, accountName }: FacebookPreviewProps) {
  const initial = (accountName.trim()[0] ?? 'S').toUpperCase();
  const tags = tagList(hashtags);
  const hasText = content.trim().length > 0;
  const hasTags = tags.length > 0;

  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm" aria-label="Facebook post preview">
      <div className="flex items-center gap-2.5 p-3">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-sm font-semibold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
        >
          {initial}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold leading-tight">{accountName}</p>
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            Just now · <Globe className="size-3" />
          </p>
        </div>
      </div>

      {hasText || hasTags ? (
        <div className="px-3 pb-3">
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed">
            {content}
            {hasText && hasTags ? '\n\n' : null}
            {hasTags ? <span>{tags}</span> : null}
          </p>
        </div>
      ) : (
        <div className="px-3 pb-3">
          <p className="text-[13px] italic text-muted-foreground">Nothing to preview yet — start writing your post.</p>
        </div>
      )}

      {mediaUrl ? (
        <div className="px-3 pb-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- media is served by this app under /api/media */}
          <img
            src={mediaUrl}
            alt={`Post media for ${accountName}`}
            className="aspect-square max-h-80 w-full rounded-md border object-cover"
          />
        </div>
      ) : (
        <div className="px-3 pb-3">
          <div className="flex aspect-square max-h-80 w-full items-center justify-center rounded-md border border-dashed bg-zinc-100 dark:bg-zinc-800">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">No media</p>
          </div>
        </div>
      )}

      <div className="border-t px-3 py-2">
        <div className="flex items-center justify-between">
          {(
            [
              { icon: ThumbsUp, label: 'Like' },
              { icon: MessageCircle, label: 'Comment' },
              { icon: Share2, label: 'Share' },
            ] as const
          ).map((action) => (
            <span
              key={action.label}
              aria-hidden
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground',
                'hover:bg-accent hover:text-foreground',
              )}
            >
              <action.icon className="size-3.5" />
              {action.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
