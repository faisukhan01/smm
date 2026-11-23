/**
 * Instagram publisher (Graph API v21.0, Instagram Professional accounts).
 *
 * Two-step container flow:
 *   1. POST /{ig-user-id}/media   { image_url | video_url + media_type: 'REELS', caption }
 *      → { id: creationId }
 *   2. POST /{ig-user-id}/media_publish { creation_id } → { id }
 *
 * NOTE (honest limitation): video containers can take time to finish processing
 * on Meta's side. Production-grade pipelines poll GET /{creationId}
 * ?fields=status_code until FINISHED before publishing. This worker follows the
 * plain two-step contract; if Meta rejects media_publish because the container
 * is still processing, that surfaces as an honest (retryable) failure.
 */
import { failureFromHttp, firstImage, firstVideo, httpRequest, pickExternalId, type Publisher, type PublishResult } from './types';

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

export const instagramPublisher: Publisher = async (ctx): Promise<PublishResult> => {
  const igUserId = ctx.account.externalId;
  const image = firstImage(ctx.media);
  const video = firstVideo(ctx.media);

  if (!image && !video) {
    return {
      ok: false,
      permanent: true,
      error: 'Instagram requires media (image or video) to publish',
    };
  }

  // Step 1 — create the media container.
  const containerForm = new URLSearchParams({ access_token: ctx.token, caption: ctx.composedText });
  if (image) {
    containerForm.set('image_url', ctx.publicUrl(image));
  } else {
    containerForm.set('video_url', ctx.publicUrl(video!));
    containerForm.set('media_type', 'REELS');
  }

  const createResult = await httpRequest(`${GRAPH_API_BASE}/${igUserId}/media`, {
    method: 'POST',
    body: containerForm,
  });
  if (!createResult.ok) return failureFromHttp(createResult, 'Instagram container creation failed');

  const creationId = pickExternalId(createResult.json, ['id']);
  if (!creationId) {
    return {
      ok: false,
      permanent: false,
      error: 'Instagram media container response did not contain an id',
      httpStatus: createResult.status,
      response: createResult.raw,
    };
  }

  // Step 2 — publish the container.
  const publishResult = await httpRequest(`${GRAPH_API_BASE}/${igUserId}/media_publish`, {
    method: 'POST',
    body: new URLSearchParams({ access_token: ctx.token, creation_id: creationId }),
  });
  if (!publishResult.ok) return failureFromHttp(publishResult, 'Instagram publish failed');

  const externalPostId = pickExternalId(publishResult.json, ['id']);
  if (!externalPostId) {
    return {
      ok: false,
      permanent: false,
      error: 'Instagram media_publish response did not contain an id',
      httpStatus: publishResult.status,
      response: publishResult.raw,
    };
  }

  const publishedJson =
    publishResult.json && typeof publishResult.json === 'object'
      ? (publishResult.json as Record<string, unknown>)
      : {};
  return {
    ok: true,
    externalPostId,
    response: { creation_id: creationId, ...publishedJson },
    httpStatus: publishResult.status,
  };
};
