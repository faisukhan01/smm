import { roleHas, type Permission, type SessionPayload } from '@smm/shared';
import { ApiError } from '@/lib/api/client';

/**
 * Permission check for UI affordances. The server session carries the resolved
 * permission list; the shared role matrix is used as a consistent fallback.
 */
export function hasPermission(session: SessionPayload, permission: Permission): boolean {
  return session.permissions.includes(permission) || roleHas(session.role, permission);
}

export const AI_CREDITS_EXHAUSTED_MESSAGE =
  'AI credits exhausted for this plan — upgrade in Settings → Billing';

/**
 * Maps API failures to user-facing messages.
 * 402 = credits exhausted (fixed copy), other ApiErrors surface their message.
 */
export function aiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.status === 402 ? AI_CREDITS_EXHAUSTED_MESSAGE : error.message;
  }
  return 'Something went wrong. Please try again.';
}

/** Normalizes a hashtag for storage: trims whitespace and strips leading # characters. */
export function normalizeHashtag(raw: string): string {
  return raw.trim().replace(/^#+/, '').trim();
}
