/**
 * GET /api/v1/accounts/oauth/[platform]/start — kick off the OAuth dance.
 * Port of AccountsController.oauthStart() (Nest: GET /accounts/oauth/:platform/start).
 *
 * Flow deviation (per migration spec): the Nest API answered with JSON
 * ({configured:false} | {configured:true, authorizeUrl}) and kept CSRF state
 * in an in-memory Map. Route handlers are stateless, so the state lives in a
 * signed httpOnly cookie and this endpoint responds with a 302 straight to the
 * platform authorize URL. Failure paths redirect back to the frontend accounts
 * view with ?oauth=error&message=… instead of returning JSON errors.
 *
 * Scopes / URL shapes are byte-identical to the Nest implementation.
 */
import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { handleError } from '@/lib/server/api/handler';
import { decryptSecret } from '@/lib/server/api/crypto';
import {
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_COOKIE_OPTIONS,
  accountsPageUrl,
  buildAuthorizeUrl,
  callbackRedirectUri,
  encodeOAuthState,
  instagramStandaloneCreds,
  isSupportedPlatform,
  unifiedIgConfigId,
} from '../../../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ platform: string }> }): Promise<NextResponse> {
  try {
    const { platform: platformRaw } = await params;
    const auth = await requireAuth();
    requirePermission(auth, 'account:connect');

    const platform = platformRaw.toUpperCase();
    if (!isSupportedPlatform(platform)) {
      return NextResponse.redirect(accountsPageUrl(req, { message: 'Unknown platform' }), 302);
    }

    const standalone = platform === 'INSTAGRAM' ? instagramStandaloneCreds() : null;
    // Unified Login ("API setup with Unified login", newer Meta apps) when its
    // configuration ID is provisioned; falls back to the FB-login flow otherwise.
    const unified = platform === 'INSTAGRAM' && !standalone ? unifiedIgConfigId() : undefined;

    let clientId: string;
    if (standalone) {
      // Instagram standalone ("Instagram API with Instagram Login"): the client
      // id/secret come from env, not the shared OAuthAppConfig row.
      clientId = standalone.appId;
    } else {
      const config = await db.oAuthAppConfig.findUnique({ where: { platform } });
      if (!config) {
        return NextResponse.redirect(accountsPageUrl(req, { message: 'OAuth app not configured for this platform' }), 302);
      }
      clientId = decryptSecret(config.clientIdEnc);
    }

    const state = randomUUID();
    const redirectUri = callbackRedirectUri(req, platform);
    const authorizeUrl = buildAuthorizeUrl(platform, clientId, redirectUri, state);

    const res = NextResponse.redirect(authorizeUrl, 302);
    res.cookies.set(
      OAUTH_STATE_COOKIE,
      encodeOAuthState({
        state,
        platform,
        workspaceId: auth.workspaceId,
        userId: auth.userId,
        createdAt: Date.now(),
        ...(platform === 'INSTAGRAM'
          ? { igMode: standalone ? ('standalone' as const) : unified ? ('unified' as const) : ('facebook' as const) }
          : {}),
      }),
      OAUTH_STATE_COOKIE_OPTIONS,
    );
    return res;
  } catch (err) {
    return handleError(err);
  }
}
