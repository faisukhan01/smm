/**
 * Storage abstraction for media uploads — ported from the NestJS API's
 * common/uploads.ts with a driver switch on STORAGE_DRIVER.
 *
 * - 'local' (default): files are written to UPLOAD_DIR (default './uploads')
 *   under a generated hex-uuid filename and served publicly at
 *   GET /api/media/{filename} — exactly the URL pattern the NestJS API stored
 *   in the database (mediaUrl()). Serving is handled by the existing route
 *   src/app/api/media/[name]/route.ts (streams from UPLOAD_DIR with the right
 *   content type).
 * - 'vercel-blob': files go to Vercel Blob (@vercel/blob, dynamically imported
 *   so sandbox runs never touch the package); the returned public URL is
 *   stored in the database.
 *
 * Self-contained by design: no other module needs to know which driver is
 * active — callers only deal with { url, storageKey } and deleteUpload().
 */
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

export const MEDIA_URL_PREFIX = '/api/media/';

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
};

export function extForMime(mimeType: string): string {
  return EXT_BY_MIME[mimeType] ?? 'bin';
}

export function uploadDir(): string {
  return process.env.UPLOAD_DIR || './uploads';
}

/** Public URL under which the local driver serves stored media files. */
export function mediaUrl(filename: string): string {
  return `${MEDIA_URL_PREFIX}${filename}`;
}

export interface SavedUpload {
  /** Public URL to store on the media row (what clients will fetch). */
  url: string;
  /** Driver-native key; passes through to deleteUpload() later. */
  storageKey: string;
  /** Byte size of the stored object. */
  size: number;
  contentType: string;
}

/**
 * Persists an upload and returns its public URL plus the storage key.
 * The local driver mirrors the former NestJS implementation byte-for-byte:
 * a 32-char hex uuid filename with the extension derived from the MIME type.
 */
export async function saveUpload(
  fileName: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<SavedUpload> {
  if ((process.env.STORAGE_DRIVER || 'local') === 'vercel-blob') {
    const { put } = await import('@vercel/blob');
    const blob = await put(fileName, Buffer.from(bytes), {
      access: 'public',
      addRandomSuffix: true,
      contentType,
    });
    return {
      url: blob.url,
      storageKey: blob.pathname ?? fileName,
      size: bytes.length,
      contentType,
    };
  }

  // Local driver (default) — mirrors mini-services/api/src/common/uploads.ts.
  const dir = resolve(uploadDir());
  await mkdir(dir, { recursive: true });
  const filename = `${randomUUID().replace(/-/g, '')}.${extForMime(contentType)}`;
  await writeFile(join(dir, filename), bytes);
  return {
    url: mediaUrl(filename),
    storageKey: filename,
    size: bytes.length,
    contentType,
  };
}

/**
 * Removes a stored object by storage key (or /api/media/... URL for the
 * local driver, or blob URL/pathname for the vercel-blob driver).
 * Missing files are tolerated — the media row is deleted regardless, matching
 * the former NestJS DELETE /media/:id behavior.
 */
export async function deleteUpload(urlOrKey: string): Promise<void> {
  if ((process.env.STORAGE_DRIVER || 'local') === 'vercel-blob') {
    const { del } = await import('@vercel/blob');
    await del(urlOrKey);
    return;
  }

  // Local driver: accept either the bare storageKey or the stored public URL.
  const key = urlOrKey.startsWith(MEDIA_URL_PREFIX)
    ? urlOrKey.slice(MEDIA_URL_PREFIX.length)
    : urlOrKey;
  const dir = resolve(uploadDir());
  // Hardening over the Nest version: never let a tampered storageKey escape
  // the uploads directory.
  const target = resolve(dir, basename(key));
  if (!target.startsWith(dir + '/') && target !== dir) return;
  await unlink(target).catch(() => {
    // File already gone — the row is still removed.
  });
}
