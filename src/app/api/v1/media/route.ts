/**
 * GET / POST /api/v1/media — ported from NestJS MediaController.list / upload
 * (mini-services/api/src/modules/media/media.controller.ts).
 *
 * POST accepts the exact wire contract the former API (and the existing web
 * client) uses: a JSON body { base64, mimeType, altText? }. Additionally a
 * multipart/form-data body with `file` (plus optional `altText` field) is
 * accepted, decoded through the same validation pipeline.
 *
 * Validation mirrors Nest byte-for-byte: mimeType ∈ {image/png, image/jpeg,
 * image/webp, video/mp4}, ≤ 5MB ("File too large (max 5MB)"), non-empty
 * ("Invalid file data"). Files go through the storage abstraction
 * (src/lib/server/storage.ts) — the local driver stores the same
 * /api/media/{filename} URL pattern the Nest API persisted.
 */
import type { PostMedia } from '@prisma/client';
import { z } from 'zod';
import type { MediaDTO } from '@smm/shared';
import { db } from '@/lib/db';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { ApiError, badRequest, notFound } from '@/lib/server/api/errors';
import { handleError, ok, parseBody, query } from '@/lib/server/api/handler';
import { extForMime, saveUpload } from '@/lib/server/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'video/mp4'] as const;

/** Identical to the Nest uploadMediaSchema (JSON body path). */
const uploadMediaSchema = z.object({
  base64: z.string().min(1),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'video/mp4']),
  altText: z.string().max(500).optional(),
});

/** DTO mapping — identical field names/shape as the Nest toMediaDTO. */
function toMediaDTO(media: Pick<PostMedia, 'id' | 'type' | 'url' | 'aspectRatio' | 'altText' | 'provider'>): MediaDTO {
  return {
    id: media.id,
    type: media.type,
    url: media.url,
    aspectRatio: media.aspectRatio ?? null,
    altText: media.altText ?? null,
    provider: media.provider,
  };
}

/** Shared size checks with the former API's exact error messages. */
function assertBufferSize(bytes: Uint8Array): void {
  if (!bytes.length) throw badRequest('Invalid file data');
  if (bytes.length > MAX_UPLOAD_BYTES) throw badRequest('File too large (max 5MB)');
}

type AltText = string | undefined;

/** Persists bytes via the storage layer and creates the unattached PostMedia row. */
async function persistUpload(
  fileName: string,
  bytes: Uint8Array,
  mimeType: (typeof ALLOWED_MIME_TYPES)[number],
  altText: AltText,
): Promise<Response> {
  assertBufferSize(bytes);
  const saved = await saveUpload(fileName, bytes, mimeType);
  const media = await db.postMedia.create({
    // Unattached until linked to a post (postId is nullable).
    data: {
      postId: null,
      type: mimeType === 'video/mp4' ? 'VIDEO' : 'IMAGE',
      provider: 'UPLOADED',
      url: saved.url,
      storageKey: saved.storageKey,
      mimeType,
      size: saved.size,
      altText: altText ?? null,
    },
  });
  return ok(toMediaDTO(media));
}

/** JSON body path — the exact contract of the Nest POST /media. */
async function uploadJson(req: Request): Promise<Response> {
  const body = await parseBody(req, uploadMediaSchema);
  const buffer = Buffer.from(body.base64, 'base64');
  return persistUpload(`upload.${extForMime(body.mimeType)}`, new Uint8Array(buffer), body.mimeType, body.altText);
}

/** Multipart path — extra convenience beyond the Nest contract. */
async function uploadMultipart(req: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw badRequest('Malformed multipart body');
  }
  const file = [...form.values()].find((v): v is File => v instanceof File);
  if (!file) throw badRequest('Invalid file data');

  const mimeCheck = uploadMediaSchema.shape.mimeType.safeParse(file.type);
  if (!mimeCheck.success) {
    throw new ApiError(
      400,
      'Validation failed',
      mimeCheck.error.issues.map((i) => ({ path: 'mimeType', message: i.message })),
    );
  }
  const altRaw = form.get('altText');
  const altCheck = uploadMediaSchema.shape.altText.safeParse(typeof altRaw === 'string' ? altRaw : undefined);
  if (!altCheck.success) {
    throw new ApiError(
      400,
      'Validation failed',
      altCheck.error.issues.map((i) => ({ path: 'altText', message: i.message })),
    );
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  return persistUpload(file.name || 'upload', bytes, mimeCheck.data, altCheck.data);
}

export async function POST(req: Request): Promise<Response> {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'post:draft');
    const contentType = req.headers.get('content-type') ?? '';
    if (contentType.includes('multipart/form-data')) {
      return await uploadMultipart(req);
    }
    return await uploadJson(req);
  } catch (err) {
    return handleError(err);
  }
}

export async function GET(req: Request): Promise<Response> {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'post:read');
    const postId = query(req).get('postId') ?? undefined;
    if (!postId) return ok({ items: [] as MediaDTO[] });
    const post = await db.post.findFirst({
      where: { id: postId, workspaceId: auth.workspaceId },
      select: { id: true },
    });
    if (!post) throw notFound('Not found');
    const items = await db.postMedia.findMany({
      where: { postId },
      orderBy: { createdAt: 'asc' },
    });
    return ok({ items: items.map(toMediaDTO) });
  } catch (err) {
    return handleError(err);
  }
}
