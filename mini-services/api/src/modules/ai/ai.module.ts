import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Module,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.module';
import { PrismaModule } from '../../common/prisma.module';
import { AuthGuard, requirePermission, type AuthContext } from '../../common/auth.guard';
import { CurrentAuth } from '../../common/current-auth.decorator';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { writeAudit } from '../../common/audit';
import { assertAiCredits } from '../../common/plans';
import { getZai, chatCompletion, chatCompletionWithHistory, extractJson, AI_MODEL } from '../../common/zai';
import { saveUpload, extForMime } from '../../common/uploads';
import { mediaUrl } from '../../common/uploads';
import {
  assistantSchema,
  captionSchema,
  imageSchema,
  planSchema,
  aiSettingsSchema,
  PLATFORM_META,
  PLATFORM_LABEL,
  type Platform,
} from '@smm/shared';
import { z } from 'zod';

const replyDraftSchema = z.object({
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
});

const IMAGE_SIZES: Record<string, string> = {
  '1:1': '1024x1024',
  '4:5': '864x1152',
  '9:16': '720x1440',
  '16:9': '1344x768',
};

const MODE_DESCRIPTION: Record<string, string> = {
  MANUAL: 'The user reviews and publishes all content manually.',
  APPROVAL: 'AI-generated content must be approved by the team before publishing.',
  AUTO: 'AI may schedule and publish content according to standing instructions.',
};

@Controller('ai')
@UseGuards(AuthGuard)
export class AiController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('caption')
  async caption(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(captionSchema)) body: z.infer<typeof captionSchema>,
  ) {
    requirePermission(auth, 'ai:use');
    await assertAiCredits(this.prisma, auth.workspaceId, 1);
    const brand = await this.prisma.brandProfile.findUnique({ where: { workspaceId: auth.workspaceId } });
    const settings = await this.prisma.aiSettings.findUnique({ where: { workspaceId: auth.workspaceId } });

    const system = this.brandPrompt(brand, settings, [
      'You are the SMM AI copywriter for a social media management product.',
      `Target platform: ${PLATFORM_LABEL[body.platform]} — ${PLATFORM_META[body.platform as Platform].accountRequirement}`,
      body.platform === 'FACEBOOK' && 'Style: conversational, 1-3 short paragraphs, at most a couple of emojis if it fits the brand voice.',
      body.platform === 'INSTAGRAM' && 'Style: hook-first first line, concise, up to 10 relevant hashtags.',
      body.platform === 'PINTEREST' && 'Style: return caption as "Title — description" (title max 100 chars), keyword-rich for search.',
      'Respond with STRICT JSON only — an array of objects: [{"caption": "...", "hashtags": ["#example"]}].',
      `Produce exactly ${body.variants} distinct variant(s).`,
      body.includeHashtags ? 'Include 5-12 hashtags per variant.' : 'Use an empty hashtags array.',
      `Write in ${body.language}. Tone: ${body.tone}. Goal: ${body.goal}.`,
    ].filter(Boolean).join(' '));

    const user = `Business topic: ${body.topic}`;
    const raw = await chatCompletion(await getZai(), system, user);
    const parsed = this.parseVariants(raw, body.variants);

    await this.prisma.aiUsage.create({
      data: { workspaceId: auth.workspaceId, userId: auth.userId, kind: 'CAPTION', credits: 1, model: AI_MODEL, meta: { platform: body.platform } },
    });
    return { variants: parsed, creditsUsed: 1 };
  }

  @Post('image')
  async image(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(imageSchema)) body: z.infer<typeof imageSchema>,
  ) {
    requirePermission(auth, 'ai:use');
    await assertAiCredits(this.prisma, auth.workspaceId, 2);

    const zai = await getZai();
    const size = IMAGE_SIZES[body.aspectRatio] ?? '1024x1024';
    const response = await zai.images.generations.create({ prompt: body.prompt, size: size as '1024x1024' });
    const base64 = response.data?.[0]?.base64;
    if (!base64) throw new BadRequestException('Image generation returned no data — try again');

    const buffer = Buffer.from(base64, 'base64');
    const filename = await saveUpload(buffer, extForMime('image/png'));
    const media = await this.prisma.postMedia.create({
      data: {
        postId: null,
        type: 'IMAGE',
        provider: 'GENERATED',
        url: mediaUrl(filename),
        storageKey: filename,
        mimeType: 'image/png',
        size: buffer.length,
        aspectRatio: body.aspectRatio,
      },
    });
    await this.prisma.aiUsage.create({
      data: { workspaceId: auth.workspaceId, userId: auth.userId, kind: 'IMAGE', credits: 2, model: AI_MODEL, meta: { aspectRatio: body.aspectRatio } },
    });
    return { mediaId: media.id, url: media.url };
  }

  @Post('assistant')
  async assistant(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(assistantSchema)) body: z.infer<typeof assistantSchema>,
  ) {
    requirePermission(auth, 'ai:use');
    await assertAiCredits(this.prisma, auth.workspaceId, 1);
    const brand = await this.prisma.brandProfile.findUnique({ where: { workspaceId: auth.workspaceId } });
    const settings = await this.prisma.aiSettings.findUnique({ where: { workspaceId: auth.workspaceId } });

    const system = this.brandPrompt(brand, settings, [
      'You are the SMM AI Assistant — a practical social media strategist.',
      'Give concrete, ready-to-use suggestions: caption drafts, post ideas, weekly plans, improvements.',
      'Never fabricate analytics or follower numbers. If asked for performance data, say it lives in the Analytics section once platforms are connected.',
    ].filter(Boolean).join(' '));
    const history = body.messages.slice(-12).map((m) => ({ role: m.role, content: m.content }));
    const last = history[history.length - 1];
    const reply = await chatCompletion(await getZai(), system, last.content);

    await this.prisma.assistantMessage.createMany({
      data: [
        { workspaceId: auth.workspaceId, userId: auth.userId, role: 'user', content: last.content },
        { workspaceId: auth.workspaceId, userId: auth.userId, role: 'assistant', content: reply },
      ],
    });
    await this.prisma.aiUsage.create({
      data: { workspaceId: auth.workspaceId, userId: auth.userId, kind: 'ASSISTANT', credits: 1, model: AI_MODEL },
    });
    return { reply, creditsUsed: 1 };
  }

  @Post('plan')
  async plan(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(planSchema)) body: z.infer<typeof planSchema>,
  ) {
    requirePermission(auth, 'ai:use');
    await assertAiCredits(this.prisma, auth.workspaceId, 1);
    const brand = await this.prisma.brandProfile.findUnique({ where: { workspaceId: auth.workspaceId } });
    const settings = await this.prisma.aiSettings.findUnique({ where: { workspaceId: auth.workspaceId } });

    const system = this.brandPrompt(brand, settings, [
      'You are the SMM weekly content planner.',
      `Create a 7-day plan with ${body.postsPerDay} post(s) per day (7 x ${body.postsPerDay} items).`,
      'Mix content pillars across the week: educational, promotional, engaging/community, and informative.',
      'Respond with STRICT JSON only — an array: [{"day": 1, "content": "...", "hashtags": ["#..."]}, ...].',
      body.focus ? `Content focus: ${body.focus}.` : '',
    ].filter(Boolean).join(' '));

    const raw = await chatCompletion(await getZai(), system, 'Generate the weekly plan now.');
    const parsed = this.parsePlanItems(raw, 7 * body.postsPerDay);

    const accounts = await this.prisma.socialAccount.findMany({
      where: { workspaceId: auth.workspaceId, status: 'CONNECTED', platform: { in: body.platforms } },
    });
    const initialStatus = settings?.mode === 'APPROVAL' ? 'PENDING_APPROVAL' : settings?.mode === 'AUTO' ? 'APPROVED' : 'DRAFT';

    const created = [];
    for (const item of parsed) {
      const targetAccounts = accounts;
      const post = await this.prisma.post.create({
        data: {
          workspaceId: auth.workspaceId,
          authorId: auth.userId,
          content: item.content,
          hashtags: item.hashtags,
          status: initialStatus,
          origin: 'AI',
          aiModel: AI_MODEL,
          aiPrompt: body.focus ?? 'Weekly plan',
          targets: {
            create: targetAccounts.map((a) => ({
              accountId: a.id,
              platform: a.platform,
              status: initialStatus === 'APPROVED' ? 'APPROVED' : 'PENDING_APPROVAL',
            })),
          },
        },
        include: { media: true, targets: true, author: { select: { name: true } } },
      });
      created.push(post);
    }
    await this.prisma.aiUsage.create({
      data: { workspaceId: auth.workspaceId, userId: auth.userId, kind: 'PLAN', credits: 1, model: AI_MODEL, meta: { posts: created.length } },
    });
    await writeAudit(this.prisma, {
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'AI_PLAN_CREATED',
      entity: 'Post',
      meta: { posts: created.length, mode: settings?.mode ?? 'MANUAL' },
    });
    return { created: created.map((p) => ({ id: p.id, content: p.content, status: p.status })) };
  }

  @Post('reply-draft')
  async replyDraft(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(replyDraftSchema)) body: z.infer<typeof replyDraftSchema>,
  ) {
    requirePermission(auth, 'ai:use');
    await assertAiCredits(this.prisma, auth.workspaceId, 1);
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: body.conversationId, workspaceId: auth.workspaceId },
      include: { messages: { orderBy: { createdAt: 'desc' }, take: 6 } },
    });
    if (!conversation) throw new NotFoundException('Conversation not found');
    const message = conversation.messages.find((m) => m.id === body.messageId);
    if (!message) throw new NotFoundException('Message not found');

    const brand = await this.prisma.brandProfile.findUnique({ where: { workspaceId: auth.workspaceId } });
    const settings = await this.prisma.aiSettings.findUnique({ where: { workspaceId: auth.workspaceId } });
    const system = this.brandPrompt(brand, settings, [
      'Draft ONE short, helpful reply to the customer message below.',
      'Match the brand voice. Do not promise refunds, discounts or pricing unless the brand profile states them.',
      'Return only the reply text — no quotes, no preamble.',
    ].filter(Boolean).join(' '));
    const thread = [...conversation.messages]
      .reverse()
      .map((m) => `${m.direction === 'IN' ? 'Customer' : 'Us'}: ${m.text}`)
      .join('\n');
    const draft = (await chatCompletion(await getZai(), system, thread)).trim().slice(0, 2000);
    if (!draft) throw new BadRequestException('AI returned an empty draft — try again');
    await this.prisma.message.update({ where: { id: message.id }, data: { aiDraft: draft } });

    await this.prisma.aiUsage.create({
      data: { workspaceId: auth.workspaceId, userId: auth.userId, kind: 'REPLY_DRAFT', credits: 1, model: AI_MODEL },
    });
    return { draft };
  }

  // ---------------------------------------------------------------------------

  private brandPrompt(
    brand: { businessName: string | null; description: string | null; industry: string | null; productsServices: string | null; targetAudience: string | null; brandVoice: string | null; writingStyle: string | null; brandColors: string | null; contentRestrictions: string | null; language: string | null } | null,
    settings: { restrictedTopics: string | null } | null,
    extra: string,
  ): string {
    const lines: string[] = [];
    if (brand) {
      if (brand.businessName) lines.push(`Business: ${brand.businessName}`);
      if (brand.description) lines.push(`About: ${brand.description}`);
      if (brand.industry) lines.push(`Industry: ${brand.industry}`);
      if (brand.productsServices) lines.push(`Products/services: ${brand.productsServices}`);
      if (brand.targetAudience) lines.push(`Target audience: ${brand.targetAudience}`);
      if (brand.brandVoice) lines.push(`Brand voice: ${brand.brandVoice}`);
      if (brand.writingStyle) lines.push(`Writing style: ${brand.writingStyle}`);
      if (brand.brandColors) lines.push(`Brand colors: ${brand.brandColors}`);
      if (brand.language) lines.push(`Preferred language: ${brand.language}`);
    } else {
      lines.push('No brand profile is configured yet — write generically professional content.');
    }
    const restrictions = [brand?.contentRestrictions, settings?.restrictedTopics].filter(Boolean).join('; ');
    if (restrictions) lines.push(`Content restrictions (MUST respect): avoid these topics and claims — ${restrictions}`);
    lines.push(`Automation mode: ${MODE_DESCRIPTION.AUTO}`);
    return [...lines, ...extra].join(' ');
  }

  private parseVariants(raw: string, expected: number): { caption: string; hashtags: string[] }[] {
    const data = extractJson(raw);
    let items: unknown[] | null = null;
    if (Array.isArray(data)) items = data;
    else if (data && typeof data === 'object' && Array.isArray((data as { variants?: unknown }).variants)) {
      items = (data as { variants: unknown[] }).variants;
    }
    if (!items?.length) throw new BadRequestException('AI returned an invalid response — try again');
    const variants = items
      .map((item) => {
        const v = item as { caption?: unknown; hashtags?: unknown };
        return {
          caption: typeof v.caption === 'string' ? v.caption.trim() : '',
          hashtags: Array.isArray(v.hashtags)
            ? (v.hashtags as unknown[]).filter((h): h is string => typeof h === 'string').slice(0, 30)
            : [],
        };
      })
      .filter((v) => v.caption.length > 0)
      .map((v) => ({ ...v, hashtags: [...new Set(v.hashtags)] }))
      .slice(0, expected);
    if (!variants.length) throw new BadRequestException('AI returned an invalid response — try again');
    return variants;
  }

  private parsePlanItems(raw: string, max: number): { content: string; hashtags: string[] }[] {
    const data = extractJson(raw);
    const items = Array.isArray(data) ? data : null;
    if (!items?.length) throw new BadRequestException('AI returned an invalid plan — try again');
    const plan = items
      .map((item) => {
        const v = item as { content?: unknown; hashtags?: unknown };
        return {
          content: typeof v.content === 'string' ? v.content.trim().slice(0, 5000) : '',
          hashtags: Array.isArray(v.hashtags)
            ? (v.hashtags as unknown[]).filter((h): h is string => typeof h === 'string').slice(0, 30)
            : [],
        };
      })
      .filter((v) => v.content.length > 0)
      .slice(0, max);
    if (!plan.length) throw new BadRequestException('AI returned an invalid plan — try again');
    return plan;
  }
}


@Controller('ai-settings')
@UseGuards(AuthGuard)
export class AiSettingsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getSettings(@CurrentAuth() auth: AuthContext) {
    requirePermission(auth, 'workspace:read');
    const settings = await this.prisma.aiSettings.findUnique({ where: { workspaceId: auth.workspaceId } });
    return settings ?? { mode: 'MANUAL', autoReply: false, restrictedTopics: null };
  }

  @Put()
  async putSettings(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(aiSettingsSchema)) body: z.infer<typeof aiSettingsSchema>,
  ) {
    requirePermission(auth, 'workspace:update');
    const settings = await this.prisma.aiSettings.upsert({
      where: { workspaceId: auth.workspaceId },
      create: {
        workspaceId: auth.workspaceId,
        mode: body.mode ?? 'MANUAL',
        autoReply: body.autoReply ?? false,
        restrictedTopics: body.restrictedTopics ?? null,
      },
      update: {
        ...(body.mode !== undefined ? { mode: body.mode } : {}),
        ...(body.autoReply !== undefined ? { autoReply: body.autoReply } : {}),
        ...(body.restrictedTopics !== undefined ? { restrictedTopics: body.restrictedTopics } : {}),
      },
    });
    await writeAudit(this.prisma, {
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'AI_SETTINGS_UPDATED',
      entity: 'AiSettings',
      entityId: settings.id,
      meta: { mode: settings.mode },
    });
    return settings;
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [AiController, AiSettingsController],
})
export class AiModule {}
