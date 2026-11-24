/**
 * Publisher contracts shared by all platform publishers.
 *
 * Ported from mini-services/worker/src/publishers/types.ts — the Next.js
 * publishing engine (src/lib/server/publishing) executes the same pipeline
 * from a cron-triggered route instead of a resident worker process.
 *
 * A publisher receives a fully-prepared context (decrypted token, composed
 * caption text, resolved public media URLs) and returns either an honest
 * success (with the platform's external post id) or an honest failure, where
 * `permanent: true` means retrying the exact same payload can never succeed.
 *
 * This module also hosts the small HTTP runtime shared by the real publishers
 * (20s AbortSignal timeout, JSON parsing, status classification).
 */
import type { Platform } from '@smm/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PublisherMedia {
  id: string;
  type: 'IMAGE' | 'VIDEO';
  url: string;
}

export interface PublisherAccount {
  id: string;
  platform: Platform;
  externalId: string;
  username: string;
}

export interface PublisherPost {
  id: string;
  content: string;
  hashtags: string[];
}

export interface PublisherContext {
  jobId: string;
  post: PublisherPost;
  account: PublisherAccount;
  /** Decrypted access token ('' for demo accounts). */
  token: string;
  /** post.content + '\n\n' + hashtags.join(' ') — composed once in the processor. */
  composedText: string;
  media: PublisherMedia[];
  /** PUBLIC_MEDIA_BASE_URL + media.url — platforms must fetch media over HTTP. */
  publicUrl: (media: PublisherMedia) => string;
}

export interface PublishSuccess {
  ok: true;
  externalPostId: string;
  /** Raw platform response payload (persisted into PublishingAttempt.response). */
  response: unknown;
  httpStatus?: number;
}

export interface PublishFailure {
  ok: false;
  /** true → job goes straight to FAILED; false → eligible for retry/backoff. */
  permanent: boolean;
  error: string;
  httpStatus?: number;
  /** Raw HTTP response body (persisted into PublishingAttempt.response). */
  response?: string | null;
}

export type PublishResult = PublishSuccess | PublishFailure;

export type Publisher = (ctx: PublisherContext) => Promise<PublishResult>;

// ---------------------------------------------------------------------------
// Shared runtime helpers
// ---------------------------------------------------------------------------

export const HTTP_TIMEOUT_MS = 20_000;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function firstImage(media: PublisherMedia[]): PublisherMedia | undefined {
  return media.find((m) => m.type === 'IMAGE');
}

export function firstVideo(media: PublisherMedia[]): PublisherMedia | undefined {
  return media.find((m) => m.type === 'VIDEO');
}

export interface HttpResult {
  /** 0 means the request never got a response (network error / timeout). */
  status: number;
  ok: boolean;
  json: unknown;
  raw: string;
}

/** fetch + AbortSignal.timeout(20s) + tolerant JSON parsing. */
export async function httpRequest(
  url: string,
  init: { method: string; body?: URLSearchParams | string; headers?: Record<string, string> },
): Promise<HttpResult> {
  try {
    const res = await fetch(url, { method: init.method, body: init.body, headers: init.headers, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
    const raw = await res.text();
    let json: unknown = null;
    if (raw) {
      try {
        json = JSON.parse(raw) as unknown;
      } catch {
        json = null;
      }
    }
    return { status: res.status, ok: res.ok, json, raw: raw.slice(0, 2000) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: 0, ok: false, json: null, raw: message };
  }
}

/**
 * HTTP failure classification:
 * 400/401/403/404/422 → permanent (bad request, auth, missing resource, invalid media);
 * 429/5xx/anything else (incl. status 0 network errors) → retryable.
 */
export function classifyHttpFailure(status: number): 'permanent' | 'retryable' {
  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 422) return 'permanent';
  return 'retryable';
}

/** Best-effort extraction of a human-readable error message from an API body. */
export function extractErrorMessage(result: HttpResult): string | null {
  const json = result.json;
  if (json && typeof json === 'object') {
    const obj = json as Record<string, unknown>;
    const err = obj['error'];
    if (typeof err === 'string') return err;
    if (err && typeof err === 'object') {
      const msg = (err as Record<string, unknown>)['message'];
      if (typeof msg === 'string') return msg;
    }
    if (typeof obj['message'] === 'string') return obj['message'] as string;
    const detail = obj['detail'];
    if (typeof detail === 'string') return detail;
    if (detail && typeof detail === 'object') {
      const msg = (detail as Record<string, unknown>)['message'];
      if (typeof msg === 'string') return msg;
    }
  }
  return result.raw || null;
}

/** Turn an HttpResult into a PublishFailure using the shared classification. */
export function failureFromHttp(result: HttpResult, prefix?: string): PublishFailure {
  const detail = extractErrorMessage(result);
  if (result.status === 0) {
    return {
      ok: false,
      permanent: false,
      error: `${prefix ? prefix + ': ' : ''}network error or timeout — ${result.raw || 'no response'}`,
      response: null,
    };
  }
  const permanent = classifyHttpFailure(result.status) === 'permanent';
  return {
    ok: false,
    permanent,
    error: `${prefix ? prefix + ' ' : ''}HTTP ${result.status}${detail ? ` — ${detail}` : ''}`,
    httpStatus: result.status,
    response: result.raw,
  };
}

/** Robustly pick a string id out of a platform response (id / post_id / data[0].id). */
export function pickExternalId(json: unknown, keys: string[]): string | null {
  if (!json || typeof json !== 'object') return null;
  const obj = json as Record<string, unknown>;
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  const data = obj['data'];
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0];
    if (first && typeof first === 'object') {
      for (const key of keys) {
        const value = (first as Record<string, unknown>)[key];
        if (typeof value === 'string' && value.length > 0) return value;
      }
    }
  }
  return null;
}
