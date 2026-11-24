/**
 * DELETE /api/v1/accounts/[id] — disconnect a social account.
 * Port of AccountsController.disconnect() (Nest: DELETE /accounts/:id).
 * Workspace-scoped lookup; cascades conversations/posts via FK constraints.
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { handleError, noContent } from '@/lib/server/api/handler';
import { notFound } from '@/lib/server/api/errors';
import { writeAudit } from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await requireAuth();
    requirePermission(auth, 'account:disconnect');
    const account = await db.socialAccount.findFirst({
      where: { id, workspaceId: auth.workspaceId },
    });
    if (!account) throw notFound('Account not found');
    await db.socialAccount.delete({ where: { id: account.id } });
    await writeAudit({
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'ACCOUNT_DISCONNECTED',
      entity: 'SocialAccount',
      entityId: account.id,
      meta: { platform: account.platform },
    });
    return noContent();
  } catch (err) {
    return handleError(err);
  }
}
