import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export function uploadDir(): string {
  return process.env.UPLOAD_DIR || './uploads';
}

/** Public URL under which the gateway serves stored media files. */
export function mediaUrl(filename: string): string {
  return `/api/media/${filename}`;
}

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
};

export function extForMime(mimeType: string): string {
  return EXT_BY_MIME[mimeType] ?? 'bin';
}

/** Persists a decoded buffer in the uploads dir; returns the generated filename. */
export async function saveUpload(buffer: Buffer, ext: string): Promise<string> {
  const dir = resolve(uploadDir());
  await mkdir(dir, { recursive: true });
  const filename = `${randomUUID().replace(/-/g, '')}.${ext}`;
  await writeFile(join(dir, filename), buffer);
  return filename;
}
