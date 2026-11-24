/**
 * Minimal HS-256 session JWT — wire-compatible with the tokens the former
 * NestJS API signed via @nestjs/jwt with APP_JWT_SECRET.
 * Payload: { sub: userId, wsId: workspaceId, iat, exp }
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SessionJwtPayload {
  sub: string;
  wsId: string;
  iat?: number;
  exp?: number;
}

const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // matches former API: 7d

function secret(): string {
  const raw = process.env.APP_JWT_SECRET;
  if (!raw) throw new Error('APP_JWT_SECRET is not set');
  return raw;
}

function b64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function hmac(headerAndPayload: string): Buffer {
  return createHmac('sha256', secret()).update(headerAndPayload).digest();
}

export function signSessionToken(sub: string, wsId: string, ttlSeconds = SESSION_TTL_SECONDS): string {
  const header = b64urlJson({ alg: 'HS256', typ: 'JWT' });
  const now = Math.floor(Date.now() / 1000);
  const payload = b64urlJson({ sub, wsId, iat: now, exp: now + ttlSeconds });
  const signature = hmac(`${header}.${payload}`).toString('base64url');
  return `${header}.${payload}.${signature}`;
}

export function verifySessionToken(token: string): SessionJwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expected = hmac(`${header}.${payload}`);
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionJwtPayload;
    if (!data.sub || !data.wsId) return null;
    if (typeof data.exp === 'number' && data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}
