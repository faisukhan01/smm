/**
 * Server-side session lookup for SSR pages. Reads the httpOnly session
 * cookie directly (no HTTP self-call to the API), verifies the HS-256 JWT,
 * checks the ACTIVE workspace membership and builds the session payload
 * locally — identical result to GET /api/v1/auth/session, minus the hop.
 */
import { cookies } from 'next/headers';
import type { SessionPayload } from '@smm/shared';
import { db } from '@/lib/db';
import { SESSION_COOKIE } from './api/context';
import { verifySessionToken } from './api/jwt';
import { buildSessionPayload } from './api/session';

export async function getServerSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const payload = verifySessionToken(token);
    if (!payload) return null;

    const member = await db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: payload.wsId, userId: payload.sub } },
    });
    if (!member || member.status !== 'ACTIVE') return null;

    return await buildSessionPayload(payload.sub, payload.wsId);
  } catch {
    return null;
  }
}
