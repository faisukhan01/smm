import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Module,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.module';
import { PrismaModule } from '../../common/prisma.module';
import { AuthGuard, requirePermission, type AuthContext } from '../../common/auth.guard';
import { CurrentAuth } from '../../common/current-auth.decorator';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { writeAudit } from '../../common/audit';
import { decryptSecret } from '../../common/crypto';
import { PLATFORM_LABEL, type ConversationDTO, type MessageDTO } from '@smm/shared';
import { z } from 'zod';
import type { Conversation, Prisma } from '@prisma/client';

const replySchema = z.object({ text: z.string().min(1).max(2000) });
const applyDraftSchema = z.object({ messageId: z.string().min(1) });

type ConversationWithAccount = Prisma.ConversationGetPayload<{ include: { account: true; messages: true } }>;

function mapConversation(c: ConversationWithAccount & { messages?: { text: string }[] }): ConversationDTO {
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

function mapMessage(m: { id: string; direction: string; authorName: string; text: string; aiDraft: string | null; createdAt: Date }): MessageDTO {
  return {
    id: m.id,
    direction: m.direction as 'IN' | 'OUT',
    authorName: m.authorName,
    text: m.text,
    aiDraft: m.aiDraft,
    createdAt: m.createdAt.toISOString(),
  };
}

@Controller('inbox')
@UseGuards(AuthGuard)
export class InboxController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('conversations')
  async conversations(@CurrentAuth() auth: AuthContext, @Query('status') status?: string) {
    requirePermission(auth, 'inbox:read');
    const where: Prisma.ConversationWhereInput = { workspaceId: auth.workspaceId };
    if (status === 'OPEN' || status === 'RESOLVED') where.status = status;
    const rows = await this.prisma.conversation.findMany({
      where,
      include: { account: true, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
    });
    return { items: rows.map(mapConversation) };
  }

  @Get('conversations/:id')
  async thread(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    requirePermission(auth, 'inbox:read');
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, workspaceId: auth.workspaceId },
      include: { account: true, messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    return {
      conversation: mapConversation(conversation),
      messages: conversation.messages.map(mapMessage),
    };
  }

  @Post('conversations/:id/reply')
  async reply(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(replySchema)) body: z.infer<typeof replySchema>,
  ) {
    requirePermission(auth, 'inbox:reply');
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, workspaceId: auth.workspaceId },
      include: { account: true, messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');

    // Real platform delivery when the conversation came from a real account and
    // the platform officially supports comment/messaging replies.
    let warning: string | null = null;
    if (!conversation.account.isDemo) {
      if (conversation.platform === 'PINTEREST') {
        throw new BadRequestException('Comment management is not supported by the Pinterest API');
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

    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'OUT',
        authorName: 'You',
        text: body.text,
      },
    });
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });
    await writeAudit(this.prisma, {
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'INBOX_REPLIED',
      entity: 'Conversation',
      entityId: conversation.id,
      meta: { platform: conversation.platform, demo: conversation.account.isDemo },
    });
    const result: { message: MessageDTO; warning?: string } = { message: mapMessage(message) };
    if (warning) result.warning = warning;
    return result;
  }

  @Post('conversations/:id/resolve')
  async resolve(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    requirePermission(auth, 'inbox:reply');
    return this.setStatus(auth, id, 'RESOLVED');
  }

  @Post('conversations/:id/reopen')
  async reopen(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    requirePermission(auth, 'inbox:reply');
    return this.setStatus(auth, id, 'OPEN');
  }

  @Post('conversations/:id/apply-draft')
  async applyDraft(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(applyDraftSchema)) body: z.infer<typeof applyDraftSchema>,
  ) {
    requirePermission(auth, 'inbox:reply');
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, workspaceId: auth.workspaceId },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    const message = await this.prisma.message.findFirst({
      where: { id: body.messageId, conversationId: conversation.id },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (!message.aiDraft) throw new BadRequestException('This message has no AI draft to send');
    const sent = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'OUT',
        authorName: 'You',
        text: message.aiDraft,
      },
    });
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });
    await writeAudit(this.prisma, {
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'INBOX_DRAFT_SENT',
      entity: 'Conversation',
      entityId: conversation.id,
    });
    return { message: mapMessage(sent) };
  }

  private async setStatus(auth: AuthContext, id: string, status: 'OPEN' | 'RESOLVED'): Promise<ConversationDTO> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, workspaceId: auth.workspaceId },
      include: { account: true, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    const updated = await this.prisma.conversation.update({ where: { id }, data: { status } });
    const mapped = mapConversation({ ...conversation, status: updated.status });
    void PLATFORM_LABEL;
    return mapped;
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [InboxController],
})
export class InboxModule {}
