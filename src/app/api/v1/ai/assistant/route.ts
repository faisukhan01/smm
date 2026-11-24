/**
 * POST /api/v1/ai/assistant — conversational planning assistant grounded in
 * the workspace brand profile and AI settings.
 * Port of the former NestJS AiController.assistant() — identical wire contract.
 */
import { parseBody, ok, handleError } from '@/lib/server/api/handler';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { db } from '@/lib/db';
import { assertAiCredits } from '@/lib/server/ai/plans';
import { getZai, chatCompletion, AI_MODEL } from '@/lib/server/ai/zai';
import { brandPrompt } from '@/lib/server/ai/brand';
import { assistantSchema } from '@smm/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'ai:use');
    const body = await parseBody(req, assistantSchema);
    await assertAiCredits(auth.workspaceId, 1);
    const brand = await db.brandProfile.findUnique({ where: { workspaceId: auth.workspaceId } });
    const settings = await db.aiSettings.findUnique({ where: { workspaceId: auth.workspaceId } });

    const system = brandPrompt(brand, settings, [
      'You are the SMM AI Assistant — a practical social media strategist.',
      'Give concrete, ready-to-use suggestions: caption drafts, post ideas, weekly plans, improvements.',
      'Never fabricate analytics or follower numbers. If asked for performance data, say it lives in the Analytics section once platforms are connected.',
    ].filter(Boolean).join(' '));
    const history = body.messages.slice(-12).map((m) => ({ role: m.role, content: m.content }));
    const last = history[history.length - 1];
    const reply = await chatCompletion(await getZai(), system, last.content);

    await db.assistantMessage.createMany({
      data: [
        { workspaceId: auth.workspaceId, userId: auth.userId, role: 'user', content: last.content },
        { workspaceId: auth.workspaceId, userId: auth.userId, role: 'assistant', content: reply },
      ],
    });
    await db.aiUsage.create({
      data: { workspaceId: auth.workspaceId, userId: auth.userId, kind: 'ASSISTANT', credits: 1, model: AI_MODEL },
    });
    return ok({ reply, creditsUsed: 1 });
  } catch (err) {
    return handleError(err);
  }
}
