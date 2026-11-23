/**
 * Typed API client for the NestJS backend (mini-services/api on :3001).
 * The sandbox gateway forwards requests using the XTransformPort query param.
 * All requests are relative and send the httpOnly session cookie.
 */

const API_PORT = '3001';

export class ApiError extends Error {
  status: number;
  issues?: { path: string; message: string }[];

  constructor(status: number, message: string, issues?: { path: string; message: string }[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.issues = issues;
  }
}

function buildUrl(path: string): string {
  const url = new URL(`/api/v1${path}`, window.location.origin);
  if (!url.searchParams.has('XTransformPort')) {
    url.searchParams.set('XTransformPort', API_PORT);
  }
  return url.toString();
}

export async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(buildUrl(path), {
    ...rest,
    credentials: 'include',
    headers: {
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(rest.headers ?? {}),
    },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  if (res.status === 204) return undefined as T;

  let data: unknown = null;
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    data = await res.json().catch(() => null);
  }

  if (!res.ok) {
    const payload = (data ?? {}) as { message?: string; issues?: { path: string; message: string }[] };
    throw new ApiError(
      res.status,
      typeof payload.message === 'string' ? payload.message : `Request failed (${res.status})`,
      payload.issues,
    );
  }
  return data as T;
}

export const apiGet = <T,>(path: string) => api<T>(path);
export const apiPost = <T,>(path: string, json?: unknown) =>
  api<T>(path, { method: 'POST', json });
export const apiPatch = <T,>(path: string, json?: unknown) =>
  api<T>(path, { method: 'PATCH', json });
export const apiPut = <T,>(path: string, json?: unknown) =>
  api<T>(path, { method: 'PUT', json });
export const apiDelete = <T,>(path: string) => api<T>(path, { method: 'DELETE' });
