/**
 * POST /api/v1/ai/image — AI image generation.
 * Port of the former NestJS AiController.image() — identical wire contract.
 * Generates via the z-ai-web-dev-sdk, stores the PNG through the local media
 * storage driver (served under /api/media/<filename>), and records 2 credits.
 */
import { parseBody, ok, handleError } from '@/lib/server/api/handler';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { badRequest } from '@/lib/server/api/errors';
import { db } from '@/lib/db';
import { assertAiCredits } from '@/lib/server/ai/plans';
import { getZai, AI_MODEL } from '@/lib/server/ai/zai';
import { saveUpload, extForMime } from '@/lib/server/ai/uploads';
import { imageSchema } from '@smm/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const IMAGE_SIZES: Record<string, string> = {
  '1:1': '1024x1024',
  '4:5': '864x1152',
  '9:16': '720x1440',
  '16:9': '1344x768',
};

export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'ai:use');
    const body = await parseBody(req, imageSchema);
    await assertAiCredits(auth.workspaceId, 2);

    const zai = await getZai();
    const size = IMAGE_SIZES[body.aspectRatio] ?? '1024x1024';
    const response = await zai.images.generations.create({ prompt: body.prompt, size: size as '1024x1024' });
    const base64 = response.data?.[0]?.base64;
    if (!base64) throw badRequest('Image generation returned no data — try again');

    const buffer = Buffer.from(base64, 'base64');
    const saved = await saveUpload(buffer, extForMime('image/png'));
    const media = await db.postMedia.create({
      data: {
        postId: null,
        type: 'IMAGE',
        provider: 'GENERATED',
        url: saved.url,
        storageKey: saved.storageKey,
        mimeType: 'image/png',
        size: buffer.length,
        aspectRatio: body.aspectRatio,
      },
    });
    await db.aiUsage.create({
      data: { workspaceId: auth.workspaceId, userId: auth.userId, kind: 'IMAGE', credits: 2, model: AI_MODEL, meta: { aspectRatio: body.aspectRatio } },
    });
    return ok({ mediaId: media.id, url: media.url });
  } catch (err) {
    return handleError(err);
  }
}
