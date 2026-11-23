'use client';

import { useCallback, useState } from 'react';
import type { MediaDTO, SessionPayload } from '@smm/shared';
import { CaptionGenerator, type CaptionVariant } from './studio/caption-generator';
import { Composer } from './studio/composer';
import { ImageGenerator } from './studio/image-generator';
import { hasPermission, normalizeHashtag } from './studio/helpers';
import { MediaUploader } from './studio/media-uploader';

/**
 * Content Studio: AI generation on the left, composer with live platform
 * previews on the right. Composer state lives here so generated captions,
 * generated images and uploads all attach to the same draft.
 */
export function StudioView({ session }: { session: SessionPayload }) {
  const [content, setContent] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [media, setMedia] = useState<MediaDTO[]>([]);

  const attachMedia = useCallback((next: MediaDTO) => {
    setMedia((previous) => (previous.some((item) => item.id === next.id) ? previous : [...previous, next]));
  }, []);

  const removeMedia = useCallback((id: string) => {
    setMedia((previous) => previous.filter((item) => item.id !== id));
  }, []);

  const resetComposer = useCallback(() => {
    setContent('');
    setHashtags([]);
    setMedia([]);
  }, []);

  const useVariant = useCallback((variant: CaptionVariant) => {
    setContent(variant.caption);
    const tags: string[] = [];
    for (const raw of variant.hashtags) {
      const tag = normalizeHashtag(raw);
      if (tag && !tags.includes(tag)) tags.push(tag);
    }
    setHashtags(tags);
  }, []);

  const canUseAi = hasPermission(session, 'ai:use');
  const attachedIds = media.map((item) => item.id);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
      <div className="flex flex-col gap-6">
        <CaptionGenerator enabled={canUseAi} onUse={useVariant} />
        <ImageGenerator enabled={canUseAi} attachedIds={attachedIds} onAttach={attachMedia} />
        <MediaUploader media={media} onAttach={attachMedia} onRemove={removeMedia} />
      </div>
      <div className="min-w-0">
        <Composer
          session={session}
          content={content}
          hashtags={hashtags}
          media={media}
          onContentChange={setContent}
          onHashtagsChange={setHashtags}
          onRemoveMedia={removeMedia}
          onReset={resetComposer}
        />
      </div>
    </div>
  );
}
