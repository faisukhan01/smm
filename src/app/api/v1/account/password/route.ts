/**
 * POST /api/v1/account/password — port of mini-services/api
 * AccountController.changePassword (204; verifies old password, hashes new).
 * NOTE: the Nest source does NOT write an audit log here — kept faithful.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { badRequest, notFound } from '@/lib/server/api/errors';
import { handleError, noContent, parseBody } from '@/lib/server/api/handler';
import { hashPassword, verifyPassword } from '@/lib/server/api/password';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Local schema — declared in the Nest controller, not in @smm/shared. */
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100),
});

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'workspace:read');
    const body = await parseBody(req, changePasswordSchema);

    const user = await db.user.findUnique({ where: { id: auth.userId } });
    if (!user) throw notFound('Not found');
    if (!verifyPassword(body.currentPassword, user.passwordHash)) {
      throw badRequest('Current password is incorrect');
    }
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(body.newPassword) },
    });
    return noContent();
  } catch (err) {
    return handleError(err);
  }
}
