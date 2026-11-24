/**
 * POST /api/v1/inbox/conversations/[id]/apply-draft — send an existing AI draft.
 * Port of InboxController.applyDraft() (Nest: POST /inbox/conversations/:id/apply-draft).
 * Drafts are always delivered locally (no platform call) — identical to Nest.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { handleError, ok, parseBody } from '@/lib/server/api/handler';
import { badRequest, notFound } from '@/lib/server/api/errors';
import { mapMessage } from '../../../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const applyDraftSchema = z.object({ messageId: z.string().min(1) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await requireAuth();
    requirePermission(auth, 'inbox:reply');
    const body = await parseBody(req, applyDraftSchema);
    const conversation = await db.conversation.findFirst({
      where: { id, workspaceId: auth.workspaceId },
    });
    if (!conversation) throw notFound('Conversation not found');
    const message = await db.message.findFirst({
      where: { id: body.messageId, conversationId: conversation.id },
    });
    if (!message) throw notFound('Message not found');
    if (!message.aiDraft) throw badRequest('This message has no AI draft to send');
    const sent = await db.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'OUT',
        authorName: 'You',
        text: message.aiDraft,
      },
    });
    await db.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });
    await db.auditLog.create({
      data: {
        workspaceId: auth.workspaceId,
        actorId: auth.userId,
        action: 'INBOX_DRAFT_SENT',
        entity: 'Conversation',
        entityId: conversation.id,
      },
    });
    return ok({ message: mapMessage(sent) }, 201);
  } catch (err) {
    return handleError(err);
  }
}
