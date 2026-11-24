/**
 * GET /api/v1/inbox/conversations/[id] — full thread with messages.
 * Port of InboxController.thread() (Nest: GET /inbox/conversations/:id).
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { handleError } from '@/lib/server/api/handler';
import { notFound } from '@/lib/server/api/errors';
import { mapConversation, mapMessage } from '../../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await requireAuth();
    requirePermission(auth, 'inbox:read');
    const conversation = await db.conversation.findFirst({
      where: { id, workspaceId: auth.workspaceId },
      include: { account: true, messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation) throw notFound('Conversation not found');
    return NextResponse.json({
      conversation: mapConversation(conversation),
      messages: conversation.messages.map(mapMessage),
    });
  } catch (err) {
    return handleError(err);
  }
}
