/**
 * POST /api/v1/auth/logout — port of mini-services/api AuthController.logout
 * (204, clears the session cookie).
 */
import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/server/api/context';
import { handleError, noContent } from '@/lib/server/api/handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(): Promise<NextResponse> {
  try {
    const res = noContent();
    clearSessionCookie(res);
    return res;
  } catch (err) {
    return handleError(err);
  }
}
