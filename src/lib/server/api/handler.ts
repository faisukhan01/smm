/**
 * Route helpers — uniform success/error envelopes and zod body parsing,
 * matching the former NestJS API's wire contract.
 */
import { NextResponse } from 'next/server';
import type { ZodType } from 'zod';
import { ApiError } from './errors';

export function ok<T>(data: T, status = 200, headers?: Record<string, string>): NextResponse {
  return NextResponse.json(data, { status, headers });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

/** Parses the JSON body against a shared zod schema — 400 with `issues` on failure. */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const result = schema.safeParse(raw ?? {});
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new ApiError(400, 'Validation failed', issues);
  }
  return result.data;
}

/** Parses a query-string param map with defaults. */
export function query(req: Request): URLSearchParams {
  return new URL(req.url).searchParams;
}

/** Converts any thrown error into the API error envelope. */
export function handleError(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json(
      { message: err.message, ...(err.issues ? { issues: err.issues } : {}) },
      { status: err.status },
    );
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  console.error('[api] unhandled error:', err);
  return NextResponse.json({ message }, { status: 500 });
}
