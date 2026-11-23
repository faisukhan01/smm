import { readFile } from 'node:fs/promises';
import path from 'node:path';

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';

const ALLOWED = new Map([
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['webp', 'image/webp'],
  ['mp4', 'video/mp4'],
]);

/**
 * Serves media stored by the local storage driver (sandbox fallback).
 * In production the S3-compatible driver serves media directly from object storage.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const ext = name.split('.').pop()?.toLowerCase();
  if (!ext || !ALLOWED.has(ext) || !/^[a-z0-9_-]+\.[a-z0-9]+$/i.test(name)) {
    return new Response('Not found', { status: 404 });
  }
  const safe = path.resolve(UPLOAD_DIR, name);
  if (!safe.startsWith(path.resolve(UPLOAD_DIR))) {
    return new Response('Not found', { status: 404 });
  }
  try {
    const file = await readFile(safe);
    return new Response(new Uint8Array(file), {
      headers: {
        'Content-Type': ALLOWED.get(ext)!,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
