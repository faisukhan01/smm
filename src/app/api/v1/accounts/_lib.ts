/**
 * Private helpers for the /api/v1/accounts module — colocated, NOT routed
 * (underscore prefix is ignored by the Next.js App Router).
 *
 * Verbatim ports of the shared pieces of
 * mini-services/api/src/modules/accounts/accounts.module.ts plus the small
 * common helpers it leaned on (plans, audit, notify, crypto). The NestJS
 * in-memory OAuth state Map is replaced by a signed, httpOnly state cookie
 * (route handlers are stateless in Next.js); the 10-minute TTL is preserved.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PLANS, PLATFORMS, type AccountDTO, type PlanTier, type Platform } from '@smm/shared';
import type { Prisma, SocialAccount } from '@prisma/client';
import { db } from '@/lib/db';
import { forbidden } from '@/lib/server/api/errors';

// ---------------------------------------------------------------------------
// DTO mapping — identical wire shape to the Nest API's mapAccount()
// ---------------------------------------------------------------------------

export function mapAccount(a: SocialAccount): AccountDTO {
  return {
    id: a.id,
    platform: a.platform,
    username: a.username,
    displayName: a.displayName,
    avatarUrl: a.avatarUrl,
    status: a.status,
    isDemo: a.isDemo,
    connectedAt: a.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Plan quota (ported from mini-services/api/src/common/plans.ts — accounts only)
// ---------------------------------------------------------------------------

interface PlanContext {
  tier: PlanTier;
  limits: (typeof PLANS)[PlanTier];
  status: string;
}

/** Loads the workspace subscription, falling back to FREE when absent. */
export async function loadPlan(workspaceId: string): Promise<PlanContext> {
  const sub = await db.subscription.findUnique({ where: { workspaceId } });
  const tier = (sub?.plan ?? 'FREE') as PlanTier;
  return { tier, limits: PLANS[tier], status: sub?.status ?? 'ACTIVE' };
}

export async function countSocialAccounts(workspaceId: string): Promise<number> {
  return db.socialAccount.count({ where: { workspaceId } });
}

/** Throws 403 when the current usage count already saturates the plan quota. */
export async function assertAccountQuota(workspaceId: string): Promise<PlanContext> {
  const plan = await loadPlan(workspaceId);
  if ((await countSocialAccounts(workspaceId)) >= plan.limits.maxAccounts) {
    throw forbidden(`Account limit reached for the ${plan.limits.name} plan — upgrade in Settings → Billing`);
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Audit + notifications (ported from mini-services/api/src/common/{audit,notify}.ts)
// ---------------------------------------------------------------------------

export interface AuditInput {
  workspaceId: string;
  actorId?: string;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: Record<string, unknown>;
}

export async function writeAudit(input: AuditInput): Promise<void> {
  await db.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      actorId: input.actorId ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      meta: (input.meta ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

export interface NotifyInput {
  workspaceId: string;
  type: string;
  title: string;
  body?: string | null;
}

export async function notifyWorkspace(input: NotifyInput): Promise<void> {
  await db.notification.create({
    data: {
      workspaceId: input.workspaceId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
    },
  });
}

// ---------------------------------------------------------------------------
// Base URL + redirect targets
// ---------------------------------------------------------------------------

/** PUBLIC_APP_URL when configured, otherwise the origin the request came in on. */
export function appBaseUrl(req: Request): string {
  if (process.env.PUBLIC_APP_URL) return process.env.PUBLIC_APP_URL.replace(/\/+$/, '');
  return new URL(req.url).origin;
}

/** Redirect URI registered at the platform: {base}/api/v1/accounts/oauth/{platform}/callback */
export function callbackRedirectUri(req: Request, platform: Platform): string {
  return `${appBaseUrl(req)}/api/v1/accounts/oauth/${platform.toLowerCase()}/callback`;
}

/**
 * Frontend landing page after the OAuth round trip. The dashboard is a
 * single-route SPA ("/"); the accounts view is addressed via ?view=accounts.
 * Success: /?view=accounts&oauth=connected
 * Failure: /?view=accounts&oauth=error&message=<urlencoded reason>
 */
export function accountsPageUrl(req: Request, outcome: { ok?: boolean; message?: string }): URL {
  const url = new URL('/', appBaseUrl(req));
  url.searchParams.set('view', 'accounts');
  if (outcome.ok) url.searchParams.set('oauth', 'connected');
  if (outcome.message) {
    url.searchParams.set('oauth', 'error');
    url.searchParams.set('message', outcome.message);
  }
  return url;
}

// ---------------------------------------------------------------------------
// Signed OAuth state cookie (replaces the Nest controller's in-memory Map)
// ---------------------------------------------------------------------------

export const OAUTH_STATE_COOKIE = 'smm_oauth_state';
/** OAuth anti-CSRF states — 10 minute TTL, same as the Nest API. */
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export interface OAuthState {
  state: string;
  platform: Platform;
  workspaceId: string;
  userId: string;
  createdAt: number;
}

function stateHmac(body: string): string {
  const secret = process.env.APP_JWT_SECRET;
  if (!secret) throw new Error('APP_JWT_SECRET is not set');
  return createHmac('sha256', secret).update(body).digest('base64url');
}

/** base64url(payload).base64url(hmac) — tamper-proof carrier for workspace/user. */
export function encodeOAuthState(payload: OAuthState): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${body}.${stateHmac(body)}`;
}

export function decodeOAuthState(value: string | undefined | null): OAuthState | null {
  if (!value) return null;
  const [body, signature] = value.split('.');
  if (!body || !signature) return null;
  const expected = Buffer.from(stateHmac(body), 'base64url');
  const given = Buffer.from(signature, 'base64url');
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthState;
    if (!data.state || !data.platform || !data.workspaceId || !data.userId || typeof data.createdAt !== 'number') {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/** Set-Cookie options mirroring the session cookie (lax survives the provider redirect back). */
export const OAUTH_STATE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: OAUTH_STATE_TTL_MS / 1000,
};

// ---------------------------------------------------------------------------
// Platform authorize URLs — exact scopes/URLs from the Nest API
// ---------------------------------------------------------------------------

export function isSupportedPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

export function buildAuthorizeUrl(platform: Platform, clientId: string, redirectUri: string, state: string): string {
  if (platform === 'FACEBOOK') {
    return (
      `https://www.facebook.com/v21.0/dialog/oauth?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}` +
      `&scope=${encodeURIComponent('pages_show_list,pages_manage_posts,pages_read_engagement,pages_manage_engagement')}`
    );
  }
  if (platform === 'INSTAGRAM') {
    return (
      `https://www.facebook.com/v21.0/dialog/oauth?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}` +
      `&scope=${encodeURIComponent('instagram_basic,instagram_content_publish,instagram_manage_comments,pages_show_list')}`
    );
  }
  return (
    `https://www.pinterest.com/oauth/?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}` +
    `&scope=${encodeURIComponent('boards:read,pins:read,pins:write,user_accounts:read')}`
  );
}
