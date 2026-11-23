/**
 * Facebook Pages publisher (Graph API v21.0).
 *
 * - Text only  → POST /{page-id}/feed   { message }
 * - Image      → POST /{page-id}/photos { url, caption }      (first IMAGE media)
 * - Video      → POST /{page-id}/videos { file_url, description }
 *
 * The page id comes from SocialAccount.externalId. Tokens are decrypted by the
 * processor and passed in via ctx.token. Authentication failures surface as
 * honest permanent failures — the processor marks the account EXPIRED.
 */
import { failureFromHttp, firstImage, firstVideo, httpRequest, pickExternalId, type Publisher, type PublishResult } from './types';

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

export const facebookPublisher: Publisher = async (ctx): Promise<PublishResult> => {
  const pageId = ctx.account.externalId;
  const image = firstImage(ctx.media);
  const video = firstVideo(ctx.media);

  let endpoint: string;
  const form = new URLSearchParams({ access_token: ctx.token });

  if (image) {
    endpoint = `${GRAPH_API_BASE}/${pageId}/photos`;
    form.set('url', ctx.publicUrl(image));
    form.set('caption', ctx.composedText);
  } else if (video) {
    endpoint = `${GRAPH_API_BASE}/${pageId}/videos`;
    form.set('file_url', ctx.publicUrl(video));
    form.set('description', ctx.composedText);
  } else {
    endpoint = `${GRAPH_API_BASE}/${pageId}/feed`;
    form.set('message', ctx.composedText);
  }

  const result = await httpRequest(endpoint, {
    method: 'POST',
    // URLSearchParams body → application/x-www-form-urlencoded automatically.
    body: form,
  });
  if (!result.ok) return failureFromHttp(result, 'Facebook publish failed');

  const externalPostId = pickExternalId(result.json, ['post_id', 'id']);
  if (!externalPostId) {
    return {
      ok: false,
      permanent: false,
      error: 'Facebook response did not contain a post id',
      httpStatus: result.status,
      response: result.raw,
    };
  }
  return { ok: true, externalPostId, response: result.json, httpStatus: result.status };
};
