/**
 * Worker-side secret decryption.
 *
 * NOTE: this is a deliberate, self-contained replica of
 * mini-services/api/src/common/crypto.ts (decryptSecret only). The worker runs
 * as a separate Bun process and must not import from the API package. The two
 * implementations MUST stay byte-for-byte compatible: rows written by the API
 * (SocialAccount.accessTokenEnc) use format `v1.<iv>.<tag>.<data>` with
 * base64url parts, AES-256-GCM, key = APP_ENCRYPTION_KEY (32 bytes, base64).
 */
import { createDecipheriv } from 'node:crypto';

const ALGO = 'aes-256-gcm';

function key(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) throw new Error('APP_ENCRYPTION_KEY is not set');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('APP_ENCRYPTION_KEY must be 32 bytes (base64)');
  return buf;
}

/** Decrypt `v1.<iv>.<tag>.<ciphertext>` (base64url parts, AES-256-GCM). */
export function decryptSecret(payload: string): string {
  const [version, iv, tag, data] = payload.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('Invalid encrypted payload');
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}
