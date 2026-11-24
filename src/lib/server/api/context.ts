/**
 * Request auth context — replaces the NestJS AuthGuard.
 * Reads the httpOnly session cookie, verifies the HS-256 JWT, then loads the
 * ACTIVE workspace membership from the database.
 */
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { ROLE_PERMISSIONS, type Permission, type UserRole } from '@smm/shared';
import { db } from '@/lib/db';
import { verifySessionToken } from './jwt';
import { forbidden, unauthorized } from './errors';

export const SESSION_COOKIE = 'smm_session';
export const SESSION_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7d, matches former API

export interface AuthContext {
  userId: string;
  workspaceId: string;
  role: UserRole;
  permissions: Permission[];
}

/** Returns the authenticated context, or null when not signed in. */
export async function getAuth(): Promise<AuthContext | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = verifySessionToken(token);
  if (!payload) return null;

  const member = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: payload.wsId, userId: payload.sub } },
  });
  if (!member || member.status !== 'ACTIVE') return null;

  return {
    userId: payload.sub,
    workspaceId: payload.wsId,
    role: member.role,
    permissions: ROLE_PERMISSIONS[member.role],
  };
}

/** Throws 401 unless authenticated. */
export async function requireAuth(): Promise<AuthContext> {
  const auth = await getAuth();
  if (!auth) throw unauthorized('Session expired');
  return auth;
}

/** Throws unless the authenticated role holds the given permission. */
export function requirePermission(auth: AuthContext, permission: Permission): AuthContext {
  if (!auth.permissions.includes(permission)) throw forbidden(`Missing permission: ${permission}`);
  return auth;
}

/** Mirrors the former API's Set-Cookie options exactly. */
export function setSessionCookie(res: NextResponse, userId: string, workspaceId: string, token: string): void {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_COOKIE_MAX_AGE,
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}
