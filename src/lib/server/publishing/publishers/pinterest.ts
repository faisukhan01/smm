/**
 * Pinterest publisher (API v5).
 *
 * Ported from mini-services/worker/src/publishers/pinterest.ts.
 *
 * POST /v5/pins with Bearer auth:
 *   { board_id, title, description, media_source: { source_type: 'image_url', url } }
 *
 * board_id resolution order:
 *   1. PINTEREST_DEFAULT_BOARD_ID env var
 *   2. first board from GET /v5/boards — cached in-memory per account for the
 *      life of the process (per serverless instance here).
 *
 * Pins require an image; text-only (or video-only) posts fail permanently.
 */
import {
  failureFromHttp,
  firstImage,
  httpRequest,
  pickExternalId,
  type Publisher,
  type PublishResult,
} from './types';

const PINTEREST_API_BASE = 'https://api.pinterest.com/v5';

/** accountId → boardId cache (cleared on 400s in case the board was deleted). */
const boardCache = new Map<string, string>();

async function resolveBoardId(accountId: string, token: string): Promise<string | PublishResult> {
  const fromEnv = process.env.PINTEREST_DEFAULT_BOARD_ID;
  if (fromEnv) return fromEnv;

  const cached = boardCache.get(accountId);
  if (cached) return cached;

  const boardsResult = await httpRequest(`${PINTEREST_API_BASE}/boards`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!boardsResult.ok) {
    return failureFromHttp(boardsResult, 'Pinterest board lookup failed');
  }

  const json = boardsResult.json as { items?: Array<{ id?: unknown }> } | null;
  const firstId = json?.items?.[0]?.id;
  if (typeof firstId !== 'string' || firstId.length === 0) {
    return {
      ok: false,
      permanent: true,
      error: 'No Pinterest boards found for this account — create a board or set PINTEREST_DEFAULT_BOARD_ID',
    };
  }
  boardCache.set(accountId, firstId);
  return firstId;
}

export const pinterestPublisher: Publisher = async (ctx): Promise<PublishResult> => {
  const image = firstImage(ctx.media);
  if (!image) {
    return {
      ok: false,
      permanent: true,
      error: 'Pinterest pins require an image',
    };
  }

  const resolved = await resolveBoardId(ctx.account.id, ctx.token);
  if (typeof resolved !== 'string') return resolved; // already a PublishResult failure
  const boardId = resolved;

  const headers = {
    Authorization: `Bearer ${ctx.token}`,
    'Content-Type': 'application/json',
  };

  const body = {
    board_id: boardId,
    title: ctx.post.content.slice(0, 100),
    description: ctx.composedText,
    media_source: {
      source_type: 'image_url',
      url: ctx.publicUrl(image),
    },
  };

  const result = await httpRequest(`${PINTEREST_API_BASE}/pins`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!result.ok) {
    // A stale cached board (deleted on Pinterest's side) would 400 forever — drop the cache entry.
    if (result.status === 400) boardCache.delete(ctx.account.id);
    return failureFromHttp(result, 'Pinterest pin creation failed');
  }

  const externalPostId = pickExternalId(result.json, ['id']);
  if (!externalPostId) {
    return {
      ok: false,
      permanent: false,
      error: 'Pinterest pin response did not contain an id',
      httpStatus: result.status,
      response: result.raw,
    };
  }
  return { ok: true, externalPostId, response: result.json, httpStatus: result.status };
};
