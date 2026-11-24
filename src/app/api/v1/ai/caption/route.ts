/**
 * POST /api/v1/ai/caption — AI caption generator.
 * Port of the former NestJS AiController.caption() — identical wire contract.
 */
import { parseBody, ok, handleError } from '@/lib/server/api/handler';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { db } from '@/lib/db';
import { assertAiCredits } from '@/lib/server/ai/plans';
import { getZai, chatCompletion, AI_MODEL } from '@/lib/server/ai/zai';
import { brandPrompt, parseVariants } from '@/lib/server/ai/brand';
import { PLATFORM_LABEL, PLATFORM_META, captionSchema, type Platform } from '@smm/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'ai:use');
    const body = await parseBody(req, captionSchema);
    await assertAiCredits(auth.workspaceId, 1);
    const brand = await db.brandProfile.findUnique({ where: { workspaceId: auth.workspaceId } });
    const settings = await db.aiSettings.findUnique({ where: { workspaceId: auth.workspaceId } });

    const system = brandPrompt(brand, settings, [
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
    const parsed = parseVariants(raw, body.variants);

    await db.aiUsage.create({
      data: { workspaceId: auth.workspaceId, userId: auth.userId, kind: 'CAPTION', credits: 1, model: AI_MODEL, meta: { platform: body.platform } },
    });
    return ok({ variants: parsed, creditsUsed: 1 });
  } catch (err) {
    return handleError(err);
  }
}
