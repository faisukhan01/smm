"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: Object.getOwnPropertyDescriptor(all, name).get
    });
}
_export(exports, {
    get AccountsController () {
        return AccountsController;
    },
    get AccountsModule () {
        return AccountsModule;
    }
});
const _common = require("@nestjs/common");
const _nodecrypto = require("node:crypto");
const _prismamodule = require("../../common/prisma.module");
const _authguard = require("../../common/auth.guard");
const _currentauthdecorator = require("../../common/current-auth.decorator");
const _zodpipe = require("../../common/zod.pipe");
const _audit = require("../../common/audit");
const _notify = require("../../common/notify");
const _plans = require("../../common/plans");
const _crypto = require("../../common/crypto");
const _shared = require("@smm/shared");
const _zod = require("zod");
function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
function _ts_metadata(k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
}
function _ts_param(paramIndex, decorator) {
    return function(target, key) {
        decorator(target, key, paramIndex);
    };
}
const platformSchema = _zod.z.object({
    platform: _zod.z.enum([
        'FACEBOOK',
        'INSTAGRAM',
        'PINTEREST'
    ])
});
const oauthConfigSchema = _zod.z.object({
    platform: _zod.z.enum([
        'FACEBOOK',
        'INSTAGRAM',
        'PINTEREST'
    ]),
    clientId: _zod.z.string().min(4),
    clientSecret: _zod.z.string().min(4)
});
function mapAccount(a) {
    return {
        id: a.id,
        platform: a.platform,
        username: a.username,
        displayName: a.displayName,
        avatarUrl: a.avatarUrl,
        status: a.status,
        isDemo: a.isDemo,
        connectedAt: a.createdAt.toISOString()
    };
}
class AccountsController {
    prisma;
    /** OAuth anti-CSRF states — 10 minute TTL. */ states = new Map();
    constructor(prisma){
        this.prisma = prisma;
    }
    async list(auth) {
        (0, _authguard.requirePermission)(auth, 'account:read');
        const rows = await this.prisma.socialAccount.findMany({
            where: {
                workspaceId: auth.workspaceId
            },
            orderBy: {
                createdAt: 'desc'
            }
        });
        return rows.map(mapAccount);
    }
    async connectDemo(auth, body) {
        (0, _authguard.requirePermission)(auth, 'account:connect');
        await (0, _plans.assertQuota)(this.prisma, auth.workspaceId, 'accounts', await (0, _plans.countSocialAccounts)(this.prisma, auth.workspaceId));
        const workspace = await this.prisma.workspace.findUniqueOrThrow({
            where: {
                id: auth.workspaceId
            }
        });
        const slug = workspace.slug || 'workspace';
        const account = await this.prisma.socialAccount.create({
            data: {
                workspaceId: auth.workspaceId,
                platform: body.platform,
                externalId: `demo_${(0, _nodecrypto.randomUUID)().slice(0, 8)}`,
                username: `${slug}.demo`,
                displayName: `${workspace.name} — ${_shared.PLATFORM_LABEL[body.platform]} (demo)`,
                status: 'CONNECTED',
                isDemo: true,
                connectedById: auth.userId
            }
        });
        // Seed one clearly-labeled sample conversation so the Inbox is explorable.
        const conversation = await this.prisma.conversation.create({
            data: {
                workspaceId: auth.workspaceId,
                accountId: account.id,
                platform: body.platform,
                externalId: `sample_${(0, _nodecrypto.randomUUID)().slice(0, 8)}`,
                participantName: 'Sample Customer',
                subject: 'Product question'
            }
        });
        const now = Date.now();
        await this.prisma.message.createMany({
            data: [
                {
                    conversationId: conversation.id,
                    direction: 'IN',
                    authorName: 'Sample Customer',
                    text: 'Hi! I just saw your latest post — is this available in other colors?',
                    createdAt: new Date(now - 120000)
                },
                {
                    conversationId: conversation.id,
                    direction: 'IN',
                    authorName: 'Sample Customer',
                    text: 'Also, do you ship internationally?',
                    createdAt: new Date(now - 60000)
                }
            ]
        });
        await (0, _audit.writeAudit)(this.prisma, {
            workspaceId: auth.workspaceId,
            actorId: auth.userId,
            action: 'ACCOUNT_CONNECTED',
            entity: 'SocialAccount',
            entityId: account.id,
            meta: {
                demo: true,
                platform: body.platform
            }
        });
        await (0, _notify.notify)(this.prisma, {
            workspaceId: auth.workspaceId,
            type: 'ACCOUNT_CONNECTED',
            title: `${_shared.PLATFORM_LABEL[body.platform]} demo connected`,
            body: 'Sandbox connection for evaluation — no real platform data.'
        });
        return mapAccount(account);
    }
    async oauthConfig(auth) {
        (0, _authguard.requirePermission)(auth, 'account:read');
        const rows = await this.prisma.oAuthAppConfig.findMany();
        const configured = {
            FACEBOOK: rows.some((r)=>r.platform === 'FACEBOOK'),
            INSTAGRAM: rows.some((r)=>r.platform === 'INSTAGRAM'),
            PINTEREST: rows.some((r)=>r.platform === 'PINTEREST')
        };
        return {
            configured
        };
    }
    async saveOauthConfig(auth, body) {
        (0, _authguard.requirePermission)(auth, 'team:manage');
        const existing = await this.prisma.oAuthAppConfig.findUnique({
            where: {
                platform: body.platform
            }
        });
        await this.prisma.oAuthAppConfig.upsert({
            where: {
                platform: body.platform
            },
            create: {
                platform: body.platform,
                clientIdEnc: (0, _crypto.encryptSecret)(body.clientId),
                clientSecretEnc: (0, _crypto.encryptSecret)(body.clientSecret),
                configuredById: auth.userId
            },
            update: {
                clientIdEnc: (0, _crypto.encryptSecret)(body.clientId),
                clientSecretEnc: (0, _crypto.encryptSecret)(body.clientSecret),
                configuredById: auth.userId
            }
        });
        void existing;
        await (0, _audit.writeAudit)(this.prisma, {
            workspaceId: auth.workspaceId,
            actorId: auth.userId,
            action: 'OAUTH_CONFIGURED',
            entity: 'OAuthAppConfig',
            entityId: body.platform
        });
        return {
            ok: true
        };
    }
    async oauthStart(auth, platformRaw) {
        (0, _authguard.requirePermission)(auth, 'account:connect');
        const platform = platformRaw.toUpperCase();
        if (![
            'FACEBOOK',
            'INSTAGRAM',
            'PINTEREST'
        ].includes(platform)) {
            throw new _common.BadRequestException('Unknown platform');
        }
        const config = await this.prisma.oAuthAppConfig.findUnique({
            where: {
                platform
            }
        });
        if (!config) return {
            configured: false
        };
        const clientId = (0, _crypto.decryptSecret)(config.clientIdEnc);
        const state = (0, _nodecrypto.randomUUID)();
        this.states.set(state, {
            platform,
            workspaceId: auth.workspaceId,
            userId: auth.userId,
            createdAt: Date.now()
        });
        // Sweep expired states (10 min TTL).
        for (const [key, value] of this.states){
            if (Date.now() - value.createdAt > 10 * 60 * 1000) this.states.delete(key);
        }
        const redirectUri = `${process.env.PUBLIC_APP_URL || 'http://localhost:81'}/api/v1/accounts/oauth/${platform.toLowerCase()}/callback`;
        let authorizeUrl;
        if (platform === 'FACEBOOK') {
            authorizeUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${encodeURIComponent(clientId)}` + `&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}` + `&scope=${encodeURIComponent('pages_show_list,pages_manage_posts,pages_read_engagement,pages_manage_engagement')}`;
        } else if (platform === 'INSTAGRAM') {
            authorizeUrl = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${encodeURIComponent(clientId)}` + `&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}` + `&scope=${encodeURIComponent('instagram_basic,instagram_content_publish,instagram_manage_comments,pages_show_list')}`;
        } else {
            authorizeUrl = `https://www.pinterest.com/oauth/?client_id=${encodeURIComponent(clientId)}` + `&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}` + `&scope=${encodeURIComponent('boards:read,pins:read,pins:write,user_accounts:read')}`;
        }
        return {
            configured: true,
            authorizeUrl
        };
    }
    async oauthCallback(platformRaw, params) {
        // Public endpoint (no session) — validated via signed state.
        const platform = platformRaw.toUpperCase();
        const code = params.code;
        const state = params.state;
        const stored = state ? this.states.get(state) : undefined;
        if (!stored || !code || stored.platform !== platform || Date.now() - stored.createdAt > 10 * 60 * 1000) {
            throw new _common.BadRequestException('Invalid or expired OAuth state');
        }
        this.states.delete(state);
        const config = await this.prisma.oAuthAppConfig.findUnique({
            where: {
                platform
            }
        });
        if (!config) throw new _common.BadRequestException('OAuth app not configured for this platform');
        const clientId = (0, _crypto.decryptSecret)(config.clientIdEnc);
        const clientSecret = (0, _crypto.decryptSecret)(config.clientSecretEnc);
        const redirectUri = `${process.env.PUBLIC_APP_URL || 'http://localhost:81'}/api/v1/accounts/oauth/${platform.toLowerCase()}/callback`;
        try {
            let accessToken;
            let externalId;
            let username;
            let displayName;
            let avatarUrl = null;
            let scopes = null;
            if (platform === 'PINTEREST') {
                const tokenRes = await fetch('https://api.pinterest.com/v5/oauth/token', {
                    method: 'POST',
                    headers: {
                        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: new URLSearchParams({
                        grant_type: 'authorization_code',
                        code,
                        redirect_uri: redirectUri
                    }),
                    signal: AbortSignal.timeout(15000)
                });
                if (!tokenRes.ok) throw new Error(`Token exchange failed (${tokenRes.status})`);
                const tokenJson = await tokenRes.json();
                accessToken = tokenJson.access_token;
                scopes = tokenJson.scope ?? null;
                const meRes = await fetch('https://api.pinterest.com/v5/user_account', {
                    headers: {
                        Authorization: `Bearer ${accessToken}`
                    },
                    signal: AbortSignal.timeout(15000)
                });
                if (!meRes.ok) throw new Error(`Profile fetch failed (${meRes.status})`);
                const me = await meRes.json();
                externalId = me.username ?? 'pinterest-user';
                username = me.username ?? 'pinterest-user';
                displayName = me.full_name ?? username;
                avatarUrl = me.image?.['120x120']?.url ?? null;
            } else {
                const tokenRes = await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?client_id=${encodeURIComponent(clientId)}` + `&client_secret=${encodeURIComponent(clientSecret)}&redirect_uri=${encodeURIComponent(redirectUri)}` + `&code=${encodeURIComponent(code)}`, {
                    signal: AbortSignal.timeout(15000)
                });
                if (!tokenRes.ok) throw new Error(`Token exchange failed (${tokenRes.status})`);
                const tokenJson = await tokenRes.json();
                accessToken = tokenJson.access_token;
                const pagesRes = await fetch(`https://graph.facebook.com/v21.0/me/accounts?fields=id,name,username,picture&access_token=${encodeURIComponent(accessToken)}`, {
                    signal: AbortSignal.timeout(15000)
                });
                if (!pagesRes.ok) throw new Error(`Pages fetch failed (${pagesRes.status}) — did you approve pages_show_list?`);
                const pages = await pagesRes.json();
                const page = pages.data?.[0];
                if (!page) throw new Error('No Facebook Page found for this account');
                if (platform === 'FACEBOOK') {
                    externalId = page.id;
                    username = page.username ?? page.name;
                    displayName = page.name;
                    avatarUrl = page.picture?.data?.url ?? null;
                } else {
                    const igRes = await fetch(`https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account&access_token=${encodeURIComponent(accessToken)}`, {
                        signal: AbortSignal.timeout(15000)
                    });
                    if (!igRes.ok) throw new Error(`Instagram lookup failed (${igRes.status})`);
                    const ig = await igRes.json();
                    if (!ig.instagram_business_account) {
                        throw new Error('No Instagram Professional account linked to the selected Facebook Page');
                    }
                    const igUserRes = await fetch(`https://graph.facebook.com/v21.0/${ig.instagram_business_account.id}?fields=id,username,name,profile_picture_url&access_token=${encodeURIComponent(accessToken)}`, {
                        signal: AbortSignal.timeout(15000)
                    });
                    if (!igUserRes.ok) throw new Error(`Instagram profile fetch failed (${igUserRes.status})`);
                    const igUser = await igUserRes.json();
                    externalId = igUser.id;
                    username = igUser.username;
                    displayName = igUser.name ?? igUser.username;
                    avatarUrl = igUser.profile_picture_url ?? null;
                }
            }
            await (0, _plans.assertQuota)(this.prisma, stored.workspaceId, 'accounts', await (0, _plans.countSocialAccounts)(this.prisma, stored.workspaceId));
            const account = await this.prisma.socialAccount.upsert({
                where: {
                    workspaceId_platform_externalId: {
                        workspaceId: stored.workspaceId,
                        platform,
                        externalId
                    }
                },
                create: {
                    workspaceId: stored.workspaceId,
                    platform,
                    externalId,
                    username,
                    displayName,
                    avatarUrl,
                    accessTokenEnc: (0, _crypto.encryptSecret)(accessToken),
                    scopes,
                    status: 'CONNECTED',
                    isDemo: false,
                    connectedById: stored.userId
                },
                update: {
                    accessTokenEnc: (0, _crypto.encryptSecret)(accessToken),
                    status: 'CONNECTED',
                    username,
                    displayName,
                    avatarUrl
                }
            });
            await (0, _audit.writeAudit)(this.prisma, {
                workspaceId: stored.workspaceId,
                actorId: stored.userId,
                action: 'ACCOUNT_CONNECTED',
                entity: 'SocialAccount',
                entityId: account.id,
                meta: {
                    platform
                }
            });
            await (0, _notify.notify)(this.prisma, {
                workspaceId: stored.workspaceId,
                type: 'ACCOUNT_CONNECTED',
                title: `${_shared.PLATFORM_LABEL[platform]} connected`,
                body: `@${username} is now connected. Publishing capability depends on your approved API permissions.`
            });
            return {
                ok: true,
                account: mapAccount(account)
            };
        } catch (err) {
            throw new _common.BadRequestException(`Platform authorization failed: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    async disconnect(auth, id) {
        (0, _authguard.requirePermission)(auth, 'account:disconnect');
        const account = await this.prisma.socialAccount.findFirst({
            where: {
                id,
                workspaceId: auth.workspaceId
            }
        });
        if (!account) throw new _common.NotFoundException('Account not found');
        await this.prisma.socialAccount.delete({
            where: {
                id: account.id
            }
        });
        await (0, _audit.writeAudit)(this.prisma, {
            workspaceId: auth.workspaceId,
            actorId: auth.userId,
            action: 'ACCOUNT_DISCONNECTED',
            entity: 'SocialAccount',
            entityId: account.id,
            meta: {
                platform: account.platform
            }
        });
        return;
    }
}
_ts_decorate([
    (0, _common.Get)(),
    _ts_param(0, (0, _currentauthdecorator.CurrentAuth)()),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof AuthContext === "undefined" ? Object : AuthContext
    ]),
    _ts_metadata("design:returntype", Promise)
], AccountsController.prototype, "list", null);
_ts_decorate([
    (0, _common.Post)('demo'),
    _ts_param(0, (0, _currentauthdecorator.CurrentAuth)()),
    _ts_param(1, (0, _common.Body)(new _zodpipe.ZodValidationPipe(platformSchema))),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof AuthContext === "undefined" ? Object : AuthContext,
        typeof _zod.z === "undefined" || typeof _zod.z.infer === "undefined" ? Object : _zod.z.infer
    ]),
    _ts_metadata("design:returntype", Promise)
], AccountsController.prototype, "connectDemo", null);
_ts_decorate([
    (0, _common.Get)('oauth-config'),
    _ts_param(0, (0, _currentauthdecorator.CurrentAuth)()),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof AuthContext === "undefined" ? Object : AuthContext
    ]),
    _ts_metadata("design:returntype", Promise)
], AccountsController.prototype, "oauthConfig", null);
_ts_decorate([
    (0, _common.Post)('oauth-config'),
    _ts_param(0, (0, _currentauthdecorator.CurrentAuth)()),
    _ts_param(1, (0, _common.Body)(new _zodpipe.ZodValidationPipe(oauthConfigSchema))),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof AuthContext === "undefined" ? Object : AuthContext,
        typeof _zod.z === "undefined" || typeof _zod.z.infer === "undefined" ? Object : _zod.z.infer
    ]),
    _ts_metadata("design:returntype", Promise)
], AccountsController.prototype, "saveOauthConfig", null);
_ts_decorate([
    (0, _common.Get)('oauth/:platform/start'),
    _ts_param(0, (0, _currentauthdecorator.CurrentAuth)()),
    _ts_param(1, (0, _common.Param)('platform')),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof AuthContext === "undefined" ? Object : AuthContext,
        String
    ]),
    _ts_metadata("design:returntype", Promise)
], AccountsController.prototype, "oauthStart", null);
_ts_decorate([
    (0, _common.Get)('oauth/:platform/callback'),
    _ts_param(0, (0, _common.Param)('platform')),
    _ts_param(1, (0, _common.Param)()),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        String,
        typeof Record === "undefined" ? Object : Record
    ]),
    _ts_metadata("design:returntype", Promise)
], AccountsController.prototype, "oauthCallback", null);
_ts_decorate([
    (0, _common.Delete)(':id'),
    _ts_param(0, (0, _currentauthdecorator.CurrentAuth)()),
    _ts_param(1, (0, _common.Param)('id')),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof AuthContext === "undefined" ? Object : AuthContext,
        String
    ]),
    _ts_metadata("design:returntype", Promise)
], AccountsController.prototype, "disconnect", null);
AccountsController = _ts_decorate([
    (0, _common.Controller)('accounts'),
    (0, _common.UseGuards)(_authguard.AuthGuard),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof _prismamodule.PrismaService === "undefined" ? Object : _prismamodule.PrismaService
    ])
], AccountsController);
class AccountsModule {
}
AccountsModule = _ts_decorate([
    (0, _common.Module)({
        imports: [
            _prismamodule.PrismaModule
        ],
        controllers: [
            AccountsController
        ]
    })
], AccountsModule);
