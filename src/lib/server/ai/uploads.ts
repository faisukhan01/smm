/**
 * AI-generated media storage — delegates to the shared storage abstraction
 * (src/lib/server/storage.ts) so generated images are persisted by whichever
 * STORAGE_DRIVER is active: 'vercel-blob' in production (survives across
 * serverless invocations and is fetchable by social platforms) and the local
 * ./uploads driver in development — identical behavior to the original
 * implementation in both cases.
 */
import { randomUUID } from 'node:crypto';

export { extForMime } from '@/lib/server/storage';

export interface SavedAiUpload {
  /** Public URL to store on the media row (what clients will fetch). */
  url: string;
  /** Driver-native key; passes through to deleteUpload() later. */
  storageKey: string;
}

/** Persists a decoded buffer via the shared storage layer; returns URL + key. */
export async function saveUpload(buffer: Buffer, ext: string): Promise<SavedAiUpload> {
  const { saveUpload: sharedSave, extForMime } = await import('@/lib/server/storage');
  const mime = Object.entries({ png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', mp4: 'video/mp4' }).find(
    ([e]) => e === ext,
  )?.[1];
  const contentType = mime ?? 'application/octet-stream';
  const fileName = `${randomUUID().replace(/-/g, '')}.${extForMime(contentType)}`;
  const saved = await sharedSave(fileName, new Uint8Array(buffer), contentType);
  return { url: saved.url, storageKey: saved.storageKey };
}
