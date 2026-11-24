/**
 * POST /api/v1/auth/login — port of mini-services/api AuthController.login
 * + AuthService.login (200 + Set-Cookie).
 */
import { NextResponse } from 'next/server';
import { loginSchema } from '@smm/shared';
import { db } from '@/lib/db';
import { setSessionCookie } from '@/lib/server/api/context';
import { unauthorized } from '@/lib/server/api/errors';
import { handleError, ok, parseBody } from '@/lib/server/api/handler';
import { signSessionToken } from '@/lib/server/api/jwt';
import { verifyPassword } from '@/lib/server/api/password';
import { buildSessionPayload } from '@/lib/server/api/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = await parseBody(req, loginSchema);

    const email = body.email.toLowerCase().trim();
    const user = await db.user.findUnique({
      where: { email },
      include: { memberships: { where: { status: 'ACTIVE' }, take: 1 } },
    });
    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      throw unauthorized('Invalid email or password');
    }
    const workspaceId = user.memberships[0]?.workspaceId;
    if (!workspaceId) throw unauthorized('No active workspace');

    const session = await buildSessionPayload(user.id, workspaceId);
    const res = ok(session, 200);
    setSessionCookie(res, user.id, workspaceId, signSessionToken(user.id, workspaceId));
    return res;
  } catch (err) {
    return handleError(err);
  }
}
