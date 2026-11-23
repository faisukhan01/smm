import { ImageIcon } from 'lucide-react';

export interface PinterestPreviewProps {
  content: string;
  hashtags: string[];
  mediaUrl?: string | null;
  accountName: string;
}

/**
 * Compact, platform-faithful mock of a Pinterest pin card.
 * Static by design: it previews composer state, it is not a feed.
 */
export function PinterestPreview({ content, hashtags, mediaUrl, accountName }: PinterestPreviewProps) {
  const initial = (accountName.trim()[0] ?? 'P').toUpperCase();
  const lines = content.split('\n');
  const title = (lines[0] ?? '').trim();
  const description = lines.slice(1).join('\n').trim();
  const tags = hashtags.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`));

  return (
    <div
      className="mx-auto max-w-sm rounded-xl border bg-card text-card-foreground shadow-sm"
      aria-label="Pinterest pin preview"
    >
      <div className="p-3">
        {mediaUrl ? (
          <>
            { }
            <img
              src={mediaUrl}
              alt={`Pin media for ${accountName}`}
              className="aspect-[4/5] w-full rounded-xl object-cover"
            />
          </>
        ) : (
          <div className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-zinc-100 dark:bg-zinc-800">
            <ImageIcon className="size-6 text-zinc-400" aria-hidden />
            <p className="text-xs text-zinc-500 dark:text-zinc-400">No media</p>
          </div>
        )}
      </div>

      <div className="space-y-2 px-3 pb-3">
        {title ? (
          <p className="text-sm font-semibold leading-snug">{title}</p>
        ) : (
          <p className="text-sm italic text-muted-foreground">Nothing to preview yet — start writing your pin.</p>
        )}
        {description ? <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-secondary-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2 border-t px-3 py-2">
        <span
          aria-hidden
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-semibold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200"
        >
          {initial}
        </span>
        <p className="min-w-0 truncate text-xs font-medium">{accountName}</p>
        <span
          aria-hidden
          className="ml-auto rounded-full bg-[#E60023] px-3 py-1 text-xs font-medium text-white"
        >
          Save
        </span>
      </div>
    </div>
  );
}
