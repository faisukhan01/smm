/**
 * /api/v1/account — port of mini-services/api AccountController (AuthGuard,
 * requirePermission('workspace:read') on every handler).
 * GET  → { id, email, name, emailVerified }
 * PATCH → same shape after renaming.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { notFound } from '@/lib/server/api/errors';
import { handleError, ok, parseBody } from '@/lib/server/api/handler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Local schema — declared in the Nest controller, not in @smm/shared. */
const updateAccountSchema = z.object({
  name: z.string().min(2).max(80),
});

export async function GET(): Promise<NextResponse> {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'workspace:read');
    const user = await db.user.findUnique({ where: { id: auth.userId } });
    if (!user) throw notFound('Not found');
    return ok({ id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified });
  } catch (err) {
    return handleError(err);
  }
}

export async function PATCH(req: Request): Promise<NextResponse> {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'workspace:read');
    const body = await parseBody(req, updateAccountSchema);
    const user = await db.user.update({
      where: { id: auth.userId },
      data: { name: body.name.trim() },
    });
    return ok({ id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified });
  } catch (err) {
    return handleError(err);
  }
}
