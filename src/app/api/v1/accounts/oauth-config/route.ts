/**
 * /api/v1/accounts/oauth-config — per-platform OAuth app configuration status.
 * Port of AccountsController.oauthConfig() / saveOauthConfig()
 * (Nest: GET + POST /accounts/oauth-config).
 *
 * NOTE: OAuthAppConfig is a GLOBAL per-platform row (platform @unique) — the
 * same developer app is shared by every workspace, exactly as in the Nest API.
 * Secrets are only ever written (encrypted); GET exposes booleans only.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { requireAuth, requirePermission } from '@/lib/server/api/context';
import { handleError, ok, parseBody } from '@/lib/server/api/handler';
import { encryptSecret } from '@/lib/server/api/crypto';
import { PLATFORMS } from '@smm/shared';
import { writeAudit } from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const oauthConfigSchema = z.object({
  platform: z.enum(PLATFORMS),
  clientId: z.string().min(4),
  clientSecret: z.string().min(4),
});

export async function GET(): Promise<NextResponse> {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'account:read');
    const rows = await db.oAuthAppConfig.findMany();
    const configured = {
      FACEBOOK: rows.some((r) => r.platform === 'FACEBOOK'),
      INSTAGRAM: rows.some((r) => r.platform === 'INSTAGRAM'),
      PINTEREST: rows.some((r) => r.platform === 'PINTEREST'),
    };
    return NextResponse.json({ configured });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const auth = await requireAuth();
    requirePermission(auth, 'team:manage');
    const body = await parseBody(req, oauthConfigSchema);
    await db.oAuthAppConfig.upsert({
      where: { platform: body.platform },
      create: {
        platform: body.platform,
        clientIdEnc: encryptSecret(body.clientId),
        clientSecretEnc: encryptSecret(body.clientSecret),
        configuredById: auth.userId,
      },
      update: {
        clientIdEnc: encryptSecret(body.clientId),
        clientSecretEnc: encryptSecret(body.clientSecret),
        configuredById: auth.userId,
      },
    });
    await writeAudit({
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'OAUTH_CONFIGURED',
      entity: 'OAuthAppConfig',
      entityId: body.platform,
    });
    return ok({ ok: true }, 201);
  } catch (err) {
    return handleError(err);
  }
}
