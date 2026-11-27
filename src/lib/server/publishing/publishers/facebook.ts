/**
 * Facebook Pages publisher (Graph API v21.0).
 *
 * Ported from mini-services/worker/src/publishers/facebook.ts.
 *
 * - Text only  → POST /{page-id}/feed   { message }
 * - Image      → POST /{page-id}/photos { url, caption }      (first IMAGE media)
 * - Video      → POST /{page-id}/videos { file_url, description }
 *
 * The page id comes from SocialAccount.externalId. Tokens are decrypted by the
 * processor and passed in via ctx.token. Authentication failures surface as
 * honest permanent failures — the processor marks the account EXPIRED.
 *
 * Page token resolution: Meta's current Pages experience rejects /{page-id}/
 * feed POSTs made with a FB Login for Business USER token (HTTP 403 #200
 * "…as an admin with sufficient administrative permission") even when the
 * token carries pages_manage_posts. Publishing therefore exchanges the stored
 * user token for a PAGE access token (GET /{page-id}?fields=access_token,
 * granted via pages_read_engagement/pages_show_list) before every publish;
 * on exchange failure it degrades honestly to the stored token.
 */
import { failureFromHttp, firstImage, firstVideo, httpRequest, pickExternalId, type Publisher, type PublishResult } from './types';

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

async function resolvePageToken(userToken: string, pageId: string): Promise<string> {
  const res = await httpRequest(
    `${GRAPH_API_BASE}/${encodeURIComponent(pageId)}?fields=access_token&access_token=${encodeURIComponent(userToken)}`,
    { method: 'GET' },
  );
  const token =
    res.ok && res.json && typeof res.json === 'object'
      ? (res.json as Record<string, unknown>)['access_token']
      : null;
  return typeof token === 'string' && token.length > 0 ? token : userToken;
}

export const facebookPublisher: Publisher = async (ctx): Promise<PublishResult> => {
  const pageId = ctx.account.externalId;
  const image = firstImage(ctx.media);
  const video = firstVideo(ctx.media);

  const pageToken = await resolvePageToken(ctx.token, pageId);

  let endpoint: string;
  const form = new URLSearchParams({ access_token: pageToken });

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
