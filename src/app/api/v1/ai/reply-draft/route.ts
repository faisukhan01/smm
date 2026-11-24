/**
 * POST /api/v1/ai/reply-draft — AI draft reply for an inbox message.
 * Port of the former NestJS AiController.replyDraft() — identical wire contract.
 * Builds the thread context from the last 6 messages (oldest-first), generates
 * ONE reply grounded in the brand voice, stores it on Message.aiDraft, and
 * records 1 credit.
 */
import { z } from 'zod';
import { parseBody, ok, handleError } from '@/lib/server/api/handler';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { badRequest, notFound } from '@/lib/server/api/errors';
import { db } from '@/lib/db';
import { assertAiCredits } from '@/lib/server/ai/plans';
import { getZai, chatCompletion, AI_MODEL } from '@/lib/server/ai/zai';
import { brandPrompt } from '@/lib/server/ai/brand';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const replyDraftSchema = z.object({
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'ai:use');
    const body = await parseBody(req, replyDraftSchema);
    await assertAiCredits(auth.workspaceId, 1);
    const conversation = await db.conversation.findFirst({
      where: { id: body.conversationId, workspaceId: auth.workspaceId },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 6 } },
    });
    if (!conversation) throw notFound('Conversation not found');
    const message = conversation.messages.find((m) => m.id === body.messageId);
    if (!message) throw notFound('Message not found');

    const brand = await db.brandProfile.findUnique({ where: { workspaceId: auth.workspaceId } });
    const settings = await db.aiSettings.findUnique({ where: { workspaceId: auth.workspaceId } });
    const system = brandPrompt(brand, settings, [
      'Draft ONE short, helpful reply to the customer message below.',
      'Match the brand voice. Do not promise refunds, discounts or pricing unless the brand profile states them.',
      'Return only the reply text — no quotes, no preamble.',
    ].filter(Boolean).join(' '));
    const thread = [...conversation.messages]
      .reverse()
      .map((m) => `${m.direction === 'IN' ? 'Customer' : 'Us'}: ${m.text}`)
      .join('\n');
    const draft = (await chatCompletion(await getZai(), system, thread)).trim().slice(0, 2000);
    if (!draft) throw badRequest('AI returned an empty draft — try again');
    await db.message.update({ where: { id: message.id }, data: { aiDraft: draft } });

    await db.aiUsage.create({
      data: { workspaceId: auth.workspaceId, userId: auth.userId, kind: 'REPLY_DRAFT', credits: 1, model: AI_MODEL },
    });
    return ok({ draft });
  } catch (err) {
    return handleError(err);
  }
}
