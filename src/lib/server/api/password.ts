/** Verbatim port of mini-services/api/src/common/password.ts — hashes must stay identical. */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const N = 16384;
const KEYLEN = 64;

/** Format: scrypt$<salt b64>$<hash b64> */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password.normalize('NFKC'), salt, KEYLEN, { N });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [algo, saltB64, hashB64] = stored.split('$');
    if (algo !== 'scrypt' || !saltB64 || !hashB64) return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const actual = scryptSync(password.normalize('NFKC'), salt, expected.length, { N });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
