/**
 * POST /api/v1/ai/plan — weekly content plan generator.
 * Port of the former NestJS AiController.plan() (@Post('plan')) — identical
 * wire contract. Parses the model reply into plan items and CREATES real Post
 * drafts (origin AI) targeted at all connected accounts on the requested
 * platforms, with the initial status derived from the workspace AI mode.
 */
import { parseBody, ok, handleError } from '@/lib/server/api/handler';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { db } from '@/lib/db';
import { assertAiCredits } from '@/lib/server/ai/plans';
import { getZai, chatCompletion, AI_MODEL } from '@/lib/server/ai/zai';
import { brandPrompt, parsePlanItems } from '@/lib/server/ai/brand';
import { writeAudit } from '@/lib/server/ai/audit';
import { planSchema } from '@smm/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'ai:use');
    const body = await parseBody(req, planSchema);
    await assertAiCredits(auth.workspaceId, 1);
    const brand = await db.brandProfile.findUnique({ where: { workspaceId: auth.workspaceId } });
    const settings = await db.aiSettings.findUnique({ where: { workspaceId: auth.workspaceId } });

    const system = brandPrompt(brand, settings, [
      'You are the SMM weekly content planner.',
      `Create a 7-day plan with ${body.postsPerDay} post(s) per day (7 x ${body.postsPerDay} items).`,
      'Mix content pillars across the week: educational, promotional, engaging/community, and informative.',
      'Respond with STRICT JSON only — an array: [{"day": 1, "content": "...", "hashtags": ["#..."]}, ...].',
      body.focus ? `Content focus: ${body.focus}.` : '',
    ].filter(Boolean).join(' '));

    const raw = await chatCompletion(await getZai(), system, 'Generate the weekly plan now.');
    const parsed = parsePlanItems(raw, 7 * body.postsPerDay);

    const accounts = await db.socialAccount.findMany({
      where: { workspaceId: auth.workspaceId, status: 'CONNECTED', platform: { in: body.platforms } },
    });
    const initialStatus = settings?.mode === 'APPROVAL' ? 'PENDING_APPROVAL' : settings?.mode === 'AUTO' ? 'APPROVED' : 'DRAFT';

    const created: Awaited<ReturnType<typeof db.post.create>>[] = [];
    for (const item of parsed) {
      const targetAccounts = accounts;
      const post = await db.post.create({
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
    await db.aiUsage.create({
      data: { workspaceId: auth.workspaceId, userId: auth.userId, kind: 'PLAN', credits: 1, model: AI_MODEL, meta: { posts: created.length } },
    });
    await writeAudit({
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'AI_PLAN_CREATED',
      entity: 'Post',
      meta: { posts: created.length, mode: settings?.mode ?? 'MANUAL' },
    });
    return ok({ created: created.map((p) => ({ id: p.id, content: p.content, status: p.status })) });
  } catch (err) {
    return handleError(err);
  }
}
