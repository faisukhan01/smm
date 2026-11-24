/**
 * Private helpers for the /api/v1/inbox module — colocated, NOT routed
 * (underscore prefix is ignored by the Next.js App Router).
 *
 * Verbatim ports of the mapping helpers in
 * mini-services/api/src/modules/inbox/inbox.module.ts so every route file
 * emits the exact same ConversationDTO / MessageDTO wire shape.
 */
import type { ConversationDTO, MessageDTO } from '@smm/shared';
import type { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { notFound } from '@/lib/server/api/errors';

export type ConversationWithAccount = Prisma.ConversationGetPayload<{ include: { account: true } }>;

export function mapConversation(c: ConversationWithAccount & { messages?: { text: string }[] }): ConversationDTO {
  const last = c.messages?.length ? c.messages[c.messages.length - 1] : null;
  return {
    id: c.id,
    platform: c.platform,
    accountUsername: c.account.username,
    participantName: c.participantName,
    subject: c.subject,
    lastMessageAt: c.lastMessageAt.toISOString(),
    status: c.status,
    preview: last?.text?.slice(0, 120) ?? '',
  };
}

export interface MessageRow {
  id: string;
  direction: string;
  authorName: string;
  text: string;
  aiDraft: string | null;
  createdAt: Date;
}

export function mapMessage(m: MessageRow): MessageDTO {
  return {
    id: m.id,
    direction: m.direction as 'IN' | 'OUT',
    authorName: m.authorName,
    text: m.text,
    aiDraft: m.aiDraft,
    createdAt: m.createdAt.toISOString(),
  };
}

/** Shared by resolve/reopen — Nest InboxController.setStatus(). */
export async function setConversationStatus(workspaceId: string, id: string, status: 'OPEN' | 'RESOLVED'): Promise<ConversationDTO> {
  const conversation = await db.conversation.findFirst({
    where: { id, workspaceId },
    include: { account: true, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  if (!conversation) throw notFound('Conversation not found');
  const updated = await db.conversation.update({ where: { id }, data: { status } });
  return mapConversation({ ...conversation, status: updated.status });
}
