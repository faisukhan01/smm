/**
 * POST /api/v1/inbox/conversations/[id]/reply — send a reply.
 * Port of InboxController.reply() (Nest: POST /inbox/conversations/:id/reply).
 *
 * Capability rules (honoring PLATFORM_META, identical outcomes to Nest):
 *  - Demo accounts: no platform delivery, reply stored locally, no warning.
 *  - PINTEREST (comments + messaging both unsupported by PLATFORM_META):
 *    hard 400 — "Comment management is not supported by the Pinterest API".
 *  - FACEBOOK with a stored access token: attempts the Graph API comment
 *    endpoint; delivery failure surfaces a `warning` (reply still stored).
 *  - INSTAGRAM (and FACEBOOK without token): no delivery attempt, warning
 *    "Direct replies for this platform require approved messaging
 *    permissions — reply stored locally."
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { handleError, ok, parseBody } from '@/lib/server/api/handler';
import { badRequest, notFound } from '@/lib/server/api/errors';
import { decryptSecret } from '@/lib/server/api/crypto';
import { PLATFORM_META } from '@smm/shared';
import { mapMessage } from '../../../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const replySchema = z.object({ text: z.string().min(1).max(2000) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  try {
    const { id } = await params;
    const auth = await requireAuth();
    requirePermission(auth, 'inbox:reply');
    const body = await parseBody(req, replySchema);
    const conversation = await db.conversation.findFirst({
      where: { id, workspaceId: auth.workspaceId },
      include: { account: true, messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation) throw notFound('Conversation not found');

    // Real platform delivery when the conversation came from a real account and
    // the platform officially supports comment/messaging replies.
    let warning: string | null = null;
    if (!conversation.account.isDemo) {
      const capabilities = PLATFORM_META[conversation.platform].capabilities;
      const commentsSupported = capabilities.some((c) => c.key === 'comments' && c.supported);
      const messagingSupported = capabilities.some((c) => c.key === 'messaging' && c.supported);
      if (!commentsSupported && !messagingSupported) {
        // PLATFORM_META grants Pinterest neither comments nor messaging — the
        // only platform this hits today; message string mirrors Nest exactly.
        throw badRequest('Comment management is not supported by the Pinterest API');
      }
      if (conversation.platform === 'FACEBOOK' && conversation.externalId && conversation.account.accessTokenEnc) {
        try {
          const token = decryptSecret(conversation.account.accessTokenEnc);
          const res = await fetch(
            `https://graph.facebook.com/v21.0/${conversation.externalId}/comments?message=${encodeURIComponent(body.text)}&access_token=${encodeURIComponent(token)}`,
            { method: 'POST', signal: AbortSignal.timeout(15000) },
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } catch (err) {
          warning = `Platform delivery failed: ${err instanceof Error ? err.message : String(err)}`;
        }
      } else {
        warning = 'Direct replies for this platform require approved messaging permissions — reply stored locally.';
      }
    }

    const message = await db.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'OUT',
        authorName: 'You',
        text: body.text,
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
        action: 'INBOX_REPLIED',
        entity: 'Conversation',
        entityId: conversation.id,
        meta: { platform: conversation.platform, demo: conversation.account.isDemo },
      },
    });
    const result: { message: ReturnType<typeof mapMessage>; warning?: string } = { message: mapMessage(message) };
    if (warning) result.warning = warning;
    return ok(result, 201);
  } catch (err) {
    return handleError(err);
  }
}
