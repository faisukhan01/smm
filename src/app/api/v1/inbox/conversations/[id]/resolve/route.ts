/**
 * POST /api/v1/inbox/conversations/[id]/resolve — mark conversation RESOLVED.
 * Port of InboxController.resolve() (Nest: POST /inbox/conversations/:id/resolve).
 */
import { NextResponse } from 'next/server';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { handleError, ok } from '@/lib/server/api/handler';
import { setConversationStatus } from '../../../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await requireAuth();
    requirePermission(auth, 'inbox:reply');
    const conversation = await setConversationStatus(auth.workspaceId, id, 'RESOLVED');
    return ok(conversation, 201);
  } catch (err) {
    return handleError(err);
  }
}
