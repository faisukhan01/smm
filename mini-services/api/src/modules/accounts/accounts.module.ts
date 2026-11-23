import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Module,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma.module';
import { PrismaModule } from '../../common/prisma.module';
import { AuthGuard, requirePermission, type AuthContext } from '../../common/auth.guard';
import { CurrentAuth } from '../../common/current-auth.decorator';
import { ZodValidationPipe } from '../../common/zod.pipe';
import { writeAudit } from '../../common/audit';
import { notify } from '../../common/notify';
import { assertQuota, countSocialAccounts } from '../../common/plans';
import { encryptSecret, decryptSecret } from '../../common/crypto';
import { PLATFORM_LABEL, type AccountDTO, type Platform } from '@smm/shared';
import { z } from 'zod';
import type { SocialAccount } from '@prisma/client';

const platformSchema = z.object({ platform: z.enum(['FACEBOOK', 'INSTAGRAM', 'PINTEREST']) });
const oauthConfigSchema = z.object({
  platform: z.enum(['FACEBOOK', 'INSTAGRAM', 'PINTEREST']),
  clientId: z.string().min(4),
  clientSecret: z.string().min(4),
});

function mapAccount(a: SocialAccount): AccountDTO {
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

interface OAuthState {
  platform: Platform;
  workspaceId: string;
  userId: string;
  createdAt: number;
}

@Controller('accounts')
@UseGuards(AuthGuard)
export class AccountsController {
  /** OAuth anti-CSRF states — 10 minute TTL. */
  private states = new Map<string, OAuthState>();

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@CurrentAuth() auth: AuthContext) {
    requirePermission(auth, 'account:read');
    const rows = await this.prisma.socialAccount.findMany({
      where: { workspaceId: auth.workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapAccount);
  }

  @Post('demo')
  async connectDemo(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(platformSchema)) body: z.infer<typeof platformSchema>,
  ) {
    requirePermission(auth, 'account:connect');
    await assertQuota(this.prisma, auth.workspaceId, 'accounts', await countSocialAccounts(this.prisma, auth.workspaceId));

    const workspace = await this.prisma.workspace.findUniqueOrThrow({ where: { id: auth.workspaceId } });
    const slug = workspace.slug || 'workspace';
    const account = await this.prisma.socialAccount.create({
      data: {
        workspaceId: auth.workspaceId,
        platform: body.platform,
        externalId: `demo_${randomUUID().slice(0, 8)}`,
        username: `${slug}.demo`,
        displayName: `${workspace.name} — ${PLATFORM_LABEL[body.platform]} (demo)`,
        status: 'CONNECTED',
        isDemo: true,
        connectedById: auth.userId,
      },
    });

    // Seed one clearly-labeled sample conversation so the Inbox is explorable.
    const conversation = await this.prisma.conversation.create({
      data: {
        workspaceId: auth.workspaceId,
        accountId: account.id,
        platform: body.platform,
        externalId: `sample_${randomUUID().slice(0, 8)}`,
        participantName: 'Sample Customer',
        subject: 'Product question',
      },
    });
    const now = Date.now();
    await this.prisma.message.createMany({
      data: [
        {
          conversationId: conversation.id,
          direction: 'IN',
          authorName: 'Sample Customer',
          text: 'Hi! I just saw your latest post — is this available in other colors?',
          createdAt: new Date(now - 120000),
        },
        {
          conversationId: conversation.id,
          direction: 'IN',
          authorName: 'Sample Customer',
          text: 'Also, do you ship internationally?',
          createdAt: new Date(now - 60000),
        },
      ],
    });

    await writeAudit(this.prisma, {
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'ACCOUNT_CONNECTED',
      entity: 'SocialAccount',
      entityId: account.id,
      meta: { demo: true, platform: body.platform },
    });
    await notify(this.prisma, {
      workspaceId: auth.workspaceId,
      type: 'ACCOUNT_CONNECTED',
      title: `${PLATFORM_LABEL[body.platform]} demo connected`,
      body: 'Sandbox connection for evaluation — no real platform data.',
    });
    return mapAccount(account);
  }

  @Get('oauth-config')
  async oauthConfig(@CurrentAuth() auth: AuthContext) {
    requirePermission(auth, 'account:read');
    const rows = await this.prisma.oAuthAppConfig.findMany();
    const configured = {
      FACEBOOK: rows.some((r) => r.platform === 'FACEBOOK'),
      INSTAGRAM: rows.some((r) => r.platform === 'INSTAGRAM'),
      PINTEREST: rows.some((r) => r.platform === 'PINTEREST'),
    };
    return { configured };
  }

  @Post('oauth-config')
  async saveOauthConfig(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(oauthConfigSchema)) body: z.infer<typeof oauthConfigSchema>,
  ) {
    requirePermission(auth, 'team:manage');
    const existing = await this.prisma.oAuthAppConfig.findUnique({ where: { platform: body.platform } });
    await this.prisma.oAuthAppConfig.upsert({
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
    void existing;
    await writeAudit(this.prisma, {
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'OAUTH_CONFIGURED',
      entity: 'OAuthAppConfig',
      entityId: body.platform,
    });
    return { ok: true };
  }

  @Get('oauth/:platform/start')
  async oauthStart(@CurrentAuth() auth: AuthContext, @Param('platform') platformRaw: string) {
    requirePermission(auth, 'account:connect');
    const platform = platformRaw.toUpperCase() as Platform;
    if (!['FACEBOOK', 'INSTAGRAM', 'PINTEREST'].includes(platform)) {
      throw new BadRequestException('Unknown platform');
    }
    const config = await this.prisma.oAuthAppConfig.findUnique({ where: { platform } });
    if (!config) return { configured: false };

    const clientId = decryptSecret(config.clientIdEnc);
    const state = randomUUID();
    this.states.set(state, { platform, workspaceId: auth.workspaceId, userId: auth.userId, createdAt: Date.now() });
    // Sweep expired states (10 min TTL).
    for (const [key, value] of this.states) {
      if (Date.now() - value.createdAt > 10 * 60 * 1000) this.states.delete(key);
    }

    const redirectUri = `${process.env.PUBLIC_APP_URL || 'http://localhost:81'}/api/v1/accounts/oauth/${platform.toLowerCase()}/callback`;
    let authorizeUrl: string;
    if (platform === 'FACEBOOK') {
      authorizeUrl =
        `https://www.facebook.com/v21.0/dialog/oauth?client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}` +
        `&scope=${encodeURIComponent('pages_show_list,pages_manage_posts,pages_read_engagement,pages_manage_engagement')}`;
    } else if (platform === 'INSTAGRAM') {
      authorizeUrl =
        `https://www.facebook.com/v21.0/dialog/oauth?client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}` +
        `&scope=${encodeURIComponent('instagram_basic,instagram_content_publish,instagram_manage_comments,pages_show_list')}`;
    } else {
      authorizeUrl =
        `https://www.pinterest.com/oauth/?client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}` +
        `&scope=${encodeURIComponent('boards:read,pins:read,pins:write,user_accounts:read')}`;
    }
    return { configured: true, authorizeUrl };
  }

  @Get('oauth/:platform/callback')
  async oauthCallback(@Param('platform') platformRaw: string, @Param() params: Record<string, string>) {
    // Public endpoint (no session) — validated via signed state.
    const platform = platformRaw.toUpperCase() as Platform;
    const code = params.code;
    const state = params.state;
    const stored = state ? this.states.get(state) : undefined;
    if (!stored || !code || stored.platform !== platform || Date.now() - stored.createdAt > 10 * 60 * 1000) {
      throw new BadRequestException('Invalid or expired OAuth state');
    }
    this.states.delete(state);

    const config = await this.prisma.oAuthAppConfig.findUnique({ where: { platform } });
    if (!config) throw new BadRequestException('OAuth app not configured for this platform');
    const clientId = decryptSecret(config.clientIdEnc);
    const clientSecret = decryptSecret(config.clientSecretEnc);
    const redirectUri = `${process.env.PUBLIC_APP_URL || 'http://localhost:81'}/api/v1/accounts/oauth/${platform.toLowerCase()}/callback`;

    try {
      let accessToken: string;
      let externalId: string;
      let username: string;
      let displayName: string;
      let avatarUrl: string | null = null;
      let scopes: string | null = null;

      if (platform === 'PINTEREST') {
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
        const tokenJson = (await tokenRes.json()) as { access_token: string; scope?: string };
        accessToken = tokenJson.access_token;
        scopes = tokenJson.scope ?? null;
        const meRes = await fetch('https://api.pinterest.com/v5/user_account', {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(15000),
        });
        if (!meRes.ok) throw new Error(`Profile fetch failed (${meRes.status})`);
        const me = (await meRes.json()) as { username?: string; full_name?: string; image?: Record<string, { url: string }> };
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

        const pagesRes = await fetch(
          `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,username,picture&access_token=${encodeURIComponent(accessToken)}`,
          { signal: AbortSignal.timeout(15000) },
        );
        if (!pagesRes.ok) throw new Error(`Pages fetch failed (${pagesRes.status}) — did you approve pages_show_list?`);
        const pages = (await pagesRes.json()) as {
          data?: { id: string; name: string; username?: string; picture?: { data?: { url?: string } } }[];
        };
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
          const ig = (await igRes.json()) as { instagram_business_account?: { id: string } };
          if (!ig.instagram_business_account) {
            throw new Error('No Instagram Professional account linked to the selected Facebook Page');
          }
          const igUserRes = await fetch(
            `https://graph.facebook.com/v21.0/${ig.instagram_business_account.id}?fields=id,username,name,profile_picture_url&access_token=${encodeURIComponent(accessToken)}`,
            { signal: AbortSignal.timeout(15000) },
          );
          if (!igUserRes.ok) throw new Error(`Instagram profile fetch failed (${igUserRes.status})`);
          const igUser = (await igUserRes.json()) as { id: string; username: string; name?: string; profile_picture_url?: string };
          externalId = igUser.id;
          username = igUser.username;
          displayName = igUser.name ?? igUser.username;
          avatarUrl = igUser.profile_picture_url ?? null;
        }
      }

      await assertQuota(this.prisma, stored.workspaceId, 'accounts', await countSocialAccounts(this.prisma, stored.workspaceId));
      const account = await this.prisma.socialAccount.upsert({
        where: { workspaceId_platform_externalId: {
          workspaceId: stored.workspaceId,
          platform,
          externalId,
        } },
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
      await writeAudit(this.prisma, {
        workspaceId: stored.workspaceId,
        actorId: stored.userId,
        action: 'ACCOUNT_CONNECTED',
        entity: 'SocialAccount',
        entityId: account.id,
        meta: { platform },
      });
      await notify(this.prisma, {
        workspaceId: stored.workspaceId,
        type: 'ACCOUNT_CONNECTED',
        title: `${PLATFORM_LABEL[platform]} connected`,
        body: `@${username} is now connected. Publishing capability depends on your approved API permissions.`,
      });
      return { ok: true, account: mapAccount(account) };
    } catch (err) {
      throw new BadRequestException(
        `Platform authorization failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  @Delete(':id')
  async disconnect(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    requirePermission(auth, 'account:disconnect');
    const account = await this.prisma.socialAccount.findFirst({
      where: { id, workspaceId: auth.workspaceId },
    });
    if (!account) throw new NotFoundException('Account not found');
    await this.prisma.socialAccount.delete({ where: { id: account.id } });
    await writeAudit(this.prisma, {
      workspaceId: auth.workspaceId,
      actorId: auth.userId,
      action: 'ACCOUNT_DISCONNECTED',
      entity: 'SocialAccount',
      entityId: account.id,
      meta: { platform: account.platform },
    });
    return;
  }
}

@Module({
  imports: [PrismaModule],
  controllers: [AccountsController],
})
export class AccountsModule {}
