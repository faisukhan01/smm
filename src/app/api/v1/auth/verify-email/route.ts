/**
 * POST /api/v1/auth/verify-email — port of mini-services/api
 * AuthController.verifyEmail + AuthService.verifyEmail.
 * Raw body read (no zod schema in the Nest source): String(body?.token ?? '').
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { badRequest } from '@/lib/server/api/errors';
import { handleError, ok } from '@/lib/server/api/handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<NextResponse> {
  try {
    // The Nest controller reads the body without a validation pipe and
    // coerces with String(body?.token ?? '') — mirror that exactly.
    let raw: unknown = null;
    try {
      raw = await req.json();
    } catch {
      raw = null;
    }
    const body = (raw ?? {}) as { token?: unknown };
    const token = String(body?.token ?? '');

    const user = await db.user.findFirst({ where: { verifyToken: token } });
    if (!user) throw badRequest('Invalid or expired verification token');
    await db.user.update({
      where: { id: user.id },
      data: { emailVerified: true, verifyToken: null },
    });
    return ok({ verified: true });
  } catch (err) {
    return handleError(err);
  }
}
