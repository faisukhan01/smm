/**
 * GET /api/v1/auth/session — port of mini-services/api AuthController.session
 * (AuthGuard → AuthService.buildSession). 401 when unauthenticated.
 */
import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/server/api/context';
import { handleError, ok } from '@/lib/server/api/handler';
import { buildSessionPayload } from '@/lib/server/api/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    const auth = await requireAuth();
    return ok(await buildSessionPayload(auth.userId, auth.workspaceId));
  } catch (err) {
    return handleError(err);
  }
}
