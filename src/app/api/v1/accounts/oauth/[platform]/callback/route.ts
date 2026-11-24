/**
 * GET /api/v1/accounts/oauth/[platform]/callback — OAuth redirect landing.
 * Port of AccountsController.oauthCallback() (Nest: GET /accounts/oauth/:platform/callback).
 *
 * Public endpoint (no session) — the OAuth context travels in the signed
 * smm_oauth_state cookie set by /start (the Nest API kept it in an in-memory
 * Map; TTL + single-use semantics are preserved).
 *
 * Flow deviation (per migration spec): the Nest API answered with JSON
 * ({ok:true, account}) or 400 {message}. Here every outcome — success or
 * failure — is a 302 back to the frontend accounts view:
 *   success: /?view=accounts&oauth=connected
 *   failure: /?view=accounts&oauth=error&message=<urlencoded reason>
 * Error messages are byte-identical to the Nest API.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { handleError } from '@/lib/server/api/handler';
import { decryptSecret, encryptSecret } from '@/lib/server/api/crypto';
import { PLATFORM_LABEL, type Platform } from '@smm/shared';
import {
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_MS,
  accountsPageUrl,
  callbackRedirectUri,
  decodeOAuthState,
  instagramStandaloneCreds,
  notifyWorkspace,
  writeAudit,
  assertAccountQuota,
} from '../../../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PinterestTokenResponse {
  access_token: string;
  scope?: string;
}
interface PinterestUserAccount {
  username?: string;
  full_name?: string;
  image?: Record<string, { url: string }>;
}
interface FbPage {
  id: string;
  name: string;
  username?: string;
  picture?: { data?: { url?: string } };
}
interface InstagramBusinessLookup {
  instagram_business_account?: { id: string };
}
interface InstagramUser {
  id: string;
  username: string;
  name?: string;
  profile_picture_url?: string;
}
interface InstagramStandaloneTokenResponse {
  access_token: string;
  user_id: number;
  permissions?: string;
}
interface InstagramStandaloneProfile {
  user_id?: string;
  id?: string;
  username?: string;
  account_type?: string;
  profile_picture_url?: string;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ platform: string }> }): Promise<NextResponse> {
  try {
    const { platform: platformRaw } = await params;
    const platform = platformRaw.toUpperCase() as Platform;

    /** Every response after state validation is single-use: clear the state cookie. */
    const finish = (url: URL): NextResponse => {
      const res = NextResponse.redirect(url, 302);
      res.cookies.delete(OAUTH_STATE_COOKIE);
      return res;
    };
    const errorRedirect = (message: string): NextResponse => finish(accountsPageUrl(req, { message }));

    // --- 1. Validate the signed state cookie + query state (anti-CSRF) ---
    const searchParams = new URL(req.url).searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const stored = decodeOAuthState(req.cookies.get(OAUTH_STATE_COOKIE)?.value);
    if (
      !stored ||
      !code ||
      !state ||
      state !== stored.state ||
      stored.platform !== platform ||
      Date.now() - stored.createdAt > OAUTH_STATE_TTL_MS
    ) {
      return errorRedirect('Invalid or expired OAuth state');
    }

    // --- 2. Load the platform app credentials ------------------------------
    // Instagram standalone ("Instagram API with Instagram Login") exchanges
    // codes with env-provided Instagram app credentials instead of the shared
    // OAuthAppConfig row (which holds the Meta/Facebook app for FB-login flows).
    const standalone = platform === 'INSTAGRAM' && stored.igMode === 'standalone' ? instagramStandaloneCreds() : null;
    if (platform === 'INSTAGRAM' && stored.igMode === 'standalone' && !standalone) {
      return errorRedirect('Instagram standalone credentials are not configured on the server');
    }

    let clientId = '';
    let clientSecret = '';
    if (!standalone) {
      const config = await db.oAuthAppConfig.findUnique({ where: { platform } });
      if (!config) return errorRedirect('OAuth app not configured for this platform');
      clientId = decryptSecret(config.clientIdEnc);
      clientSecret = decryptSecret(config.clientSecretEnc);
    }
    const redirectUri = callbackRedirectUri(req, platform);

    // --- 3. Exchange the code, fetch the profile, upsert the account ---
    try {
      let accessToken: string;
      let externalId: string;
      let username: string;
      let displayName: string;
      let avatarUrl: string | null = null;
      let scopes: string | null = null;

      if (standalone) {
        // --- Instagram API with Instagram Login (no Facebook involved) -------
        const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: standalone.appId,
            client_secret: standalone.appSecret,
            grant_type: 'authorization_code',
            redirect_uri: redirectUri,
            code,
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (!tokenRes.ok) throw new Error(`Instagram token exchange failed (${tokenRes.status})`);
        const tokenJson = (await tokenRes.json()) as InstagramStandaloneTokenResponse;
        scopes = tokenJson.permissions ?? null;

        // Short-lived (1h) → long-lived (~60 days) via graph.instagram.com.
        const longRes = await fetch(
          `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(standalone.appSecret)}` +
            `&access_token=${encodeURIComponent(tokenJson.access_token)}`,
          { signal: AbortSignal.timeout(15000) },
        );
        accessToken = longRes.ok ? ((await longRes.json()) as { access_token: string }).access_token : tokenJson.access_token;

        const meRes = await fetch(
          `https://graph.instagram.com/me?fields=user_id,username,account_type,profile_picture_url&access_token=${encodeURIComponent(accessToken)}`,
          { signal: AbortSignal.timeout(15000) },
        );
        if (!meRes.ok) throw new Error(`Instagram profile fetch failed (${meRes.status})`);
        const me = (await meRes.json()) as InstagramStandaloneProfile;
        if (me.account_type && me.account_type !== 'BUSINESS' && me.account_type !== 'CREATOR') {
          throw new Error('Only Instagram Professional (Business or Creator) accounts can be connected');
        }
        externalId = me.user_id ?? me.id ?? String(tokenJson.user_id);
        username = me.username ?? `ig_${externalId}`;
        displayName = me.username ?? username;
        avatarUrl = me.profile_picture_url ?? null;
      } else if (platform === 'PINTEREST') {
        const tokenRes = await fetch('https://api.pinterest.com/v5/oauth/token', {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
          signal: AbortSignal.timeout(15000),
        });
        if (!tokenRes.ok) throw new Error(`Token exchange failed (${tokenRes.status})`);
        const tokenJson = (await tokenRes.json()) as PinterestTokenResponse;
        accessToken = tokenJson.access_token;
        scopes = tokenJson.scope ?? null;
        const meRes = await fetch('https://api.pinterest.com/v5/user_account', {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(15000),
        });
        if (!meRes.ok) throw new Error(`Profile fetch failed (${meRes.status})`);
        const me = (await meRes.json()) as PinterestUserAccount;
        externalId = me.username ?? 'pinterest-user';
        username = me.username ?? 'pinterest-user';
        displayName = me.full_name ?? username;
        avatarUrl = me.image?.['120x120']?.url ?? null;
      } else {
        const tokenRes = await fetch(
          `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${encodeURIComponent(clientId)}` +
            `&client_secret=${encodeURIComponent(clientSecret)}&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&code=${encodeURIComponent(code)}`,
          { signal: AbortSignal.timeout(15000) },
        );
        if (!tokenRes.ok) throw new Error(`Token exchange failed (${tokenRes.status})`);
        const tokenJson = (await tokenRes.json()) as { access_token: string };
        accessToken = tokenJson.access_token;

        // Facebook user tokens from the dialog are short-lived (~1-2h). Upgrade
        // to a ~60-day token so scheduled publishing keeps working; on failure
        // fall back to the short-lived token (honest degradation).
        if (platform === 'FACEBOOK' || platform === 'INSTAGRAM') {
          try {
            const longRes = await fetch(
              `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(clientId)}` +
                `&client_secret=${encodeURIComponent(clientSecret)}&fb_exchange_token=${encodeURIComponent(accessToken)}`,
              { signal: AbortSignal.timeout(15000) },
            );
            if (longRes.ok) {
              accessToken = ((await longRes.json()) as { access_token?: string }).access_token ?? accessToken;
            }
          } catch {
            /* keep the short-lived token */
          }
        }

        const pagesRes = await fetch(
          `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,username,picture&access_token=${encodeURIComponent(accessToken)}`,
          { signal: AbortSignal.timeout(15000) },
        );
        if (!pagesRes.ok) throw new Error(`Pages fetch failed (${pagesRes.status}) — did you approve pages_show_list?`);
        const pages = (await pagesRes.json()) as { data?: FbPage[] };
        const page = pages.data?.[0];
        if (!page) throw new Error('No Facebook Page found for this account');

        if (platform === 'FACEBOOK') {
          externalId = page.id;
          username = page.username ?? page.name;
          displayName = page.name;
          avatarUrl = page.picture?.data?.url ?? null;
        } else {
          const igRes = await fetch(
            `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${encodeURIComponent(accessToken)}`,
            { signal: AbortSignal.timeout(15000) },
          );
          if (!igRes.ok) throw new Error(`Instagram lookup failed (${igRes.status})`);
          const ig = (await igRes.json()) as InstagramBusinessLookup;
          if (!ig.instagram_business_account) {
            throw new Error('No Instagram Professional account linked to the selected Facebook Page');
          }
          const igUserRes = await fetch(
            `https://graph.facebook.com/v21.0/${ig.instagram_business_account.id}?fields=id,username,name,profile_picture_url&access_token=${encodeURIComponent(accessToken)}`,
            { signal: AbortSignal.timeout(15000) },
          );
          if (!igUserRes.ok) throw new Error(`Instagram profile fetch failed (${igUserRes.status})`);
          const igUser = (await igUserRes.json()) as InstagramUser;
          externalId = igUser.id;
          username = igUser.username;
          displayName = igUser.name ?? igUser.username;
          avatarUrl = igUser.profile_picture_url ?? null;
        }
      }

      await assertAccountQuota(stored.workspaceId);
      const account = await db.socialAccount.upsert({
        where: {
          workspaceId_platform_externalId: {
            workspaceId: stored.workspaceId,
            platform,
            externalId,
          },
        },
        create: {
          workspaceId: stored.workspaceId,
          platform,
          externalId,
          username,
          displayName,
          avatarUrl,
          accessTokenEnc: encryptSecret(accessToken),
          scopes,
          status: 'CONNECTED',
          isDemo: false,
          connectedById: stored.userId,
        },
        update: {
          accessTokenEnc: encryptSecret(accessToken),
          status: 'CONNECTED',
          username,
          displayName,
          avatarUrl,
        },
      });
      await writeAudit({
        workspaceId: stored.workspaceId,
        actorId: stored.userId,
        action: 'ACCOUNT_CONNECTED',
        entity: 'SocialAccount',
        entityId: account.id,
        meta: { platform },
      });
      await notifyWorkspace({
        workspaceId: stored.workspaceId,
        type: 'ACCOUNT_CONNECTED',
        title: `${PLATFORM_LABEL[platform]} connected`,
        body: `@${username} is now connected. Publishing capability depends on your approved API permissions.`,
      });
      return finish(accountsPageUrl(req, { ok: true }));
    } catch (err) {
      return errorRedirect(`Platform authorization failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  } catch (err) {
    return handleError(err);
  }
}
