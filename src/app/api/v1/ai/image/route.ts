/**
 * POST /api/v1/ai/image — AI image generation.
 * Port of the former NestJS AiController.image() — identical wire contract.
 * Generates via the shared AI layer (paid Z.ai model with a free keyless
 * fallback), stores the result through the storage driver, and records 2
 * credits.
 */
import { parseBody, ok, handleError } from '@/lib/server/api/handler';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { db } from '@/lib/db';
import { assertAiCredits } from '@/lib/server/ai/plans';
import { generateImage } from '@/lib/server/ai/zai';
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

    const size = IMAGE_SIZES[body.aspectRatio] ?? '1024x1024';
    const { buffer, model, mimeType } = await generateImage(body.prompt, size);
    const saved = await saveUpload(buffer, extForMime(mimeType));
    const media = await db.postMedia.create({
      data: {
        postId: null,
        type: 'IMAGE',
        provider: 'GENERATED',
        url: saved.url,
        storageKey: saved.storageKey,
        mimeType,
        size: buffer.length,
        aspectRatio: body.aspectRatio,
      },
    });
    await db.aiUsage.create({
      data: { workspaceId: auth.workspaceId, userId: auth.userId, kind: 'IMAGE', credits: 2, model, meta: { aspectRatio: body.aspectRatio } },
    });
    return ok({ mediaId: media.id, url: media.url });
  } catch (err) {
    return handleError(err);
  }
}
