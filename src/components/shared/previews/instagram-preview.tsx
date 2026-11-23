import { Bookmark, Heart, ImageIcon, MessageCircle, MoreHorizontal, Send } from 'lucide-react';

export interface InstagramPreviewProps {
  content: string;
  hashtags: string[];
  mediaUrl?: string | null;
  accountName: string;
}

/**
 * Compact, platform-faithful mock of an Instagram post (phone-frame card).
 * Static by design: it previews composer state, it is not a feed.
 */
export function InstagramPreview({ content, hashtags, mediaUrl, accountName }: InstagramPreviewProps) {
  const initial = (accountName.trim()[0] ?? 'I').toUpperCase();
  const tags = hashtags.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)).join(' ');
  const hasText = content.trim().length > 0;
  const hasTags = tags.length > 0;

  return (
    <div
      className="mx-auto max-w-sm overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm"
      aria-label="Instagram post preview"
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[11px] font-semibold text-zinc-700 ring-2 ring-[#E1306C] ring-offset-2 ring-offset-card dark:bg-zinc-700 dark:text-zinc-200"
        >
          {initial}
        </span>
        <p className="min-w-0 truncate text-xs font-semibold">{accountName}</p>
        <MoreHorizontal className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden />
      </div>

      {mediaUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- media is served by this app under /api/media */}
          <img
            src={mediaUrl}
            alt={`Post media for ${accountName}`}
            className="aspect-square w-full object-cover"
          />
        </>
      ) : (
        <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 bg-zinc-100 px-8 text-center dark:bg-zinc-800">
          <ImageIcon className="size-6 text-zinc-400" aria-hidden />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Media required to publish to Instagram</p>
        </div>
      )}

      <div className="flex items-center px-3 py-2">
        <div className="flex items-center gap-4 text-foreground">
          <Heart className="size-5" aria-hidden />
          <MessageCircle className="size-5" aria-hidden />
          <Send className="size-5" aria-hidden />
        </div>
        <Bookmark className="ml-auto size-5 text-foreground" aria-hidden />
      </div>

      <div className="space-y-1 px-3 pb-2">
        {hasText || hasTags ? (
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed">
            <span className="font-semibold">{accountName}</span>
            {hasText ? ' ' + content.trim() : ''}
            {hasTags ? <span className="text-primary">{hasText ? '\n' : ' '}{tags}</span> : null}
          </p>
        ) : (
          <p className="text-[13px] italic text-muted-foreground">Nothing to preview yet — start writing your post.</p>
        )}
      </div>

      <div className="px-3 pb-3">
        <p className="text-xs text-muted-foreground">View all comments</p>
      </div>
    </div>
  );
}
