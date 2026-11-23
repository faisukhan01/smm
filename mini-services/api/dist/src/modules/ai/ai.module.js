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
    get AiController () {
        return AiController;
    },
    get AiModule () {
        return AiModule;
    },
    get AiSettingsController () {
        return AiSettingsController;
    }
});
const _common = require("@nestjs/common");
const _prismamodule = require("../../common/prisma.module");
const _authguard = require("../../common/auth.guard");
const _currentauthdecorator = require("../../common/current-auth.decorator");
const _zodpipe = require("../../common/zod.pipe");
const _audit = require("../../common/audit");
const _plans = require("../../common/plans");
const _zai = require("../../common/zai");
const _uploads = require("../../common/uploads");
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
const replyDraftSchema = _zod.z.object({
    conversationId: _zod.z.string().min(1),
    messageId: _zod.z.string().min(1)
});
const IMAGE_SIZES = {
    '1:1': '1024x1024',
    '4:5': '864x1152',
    '9:16': '720x1440',
    '16:9': '1344x768'
};
const MODE_DESCRIPTION = {
    MANUAL: 'The user reviews and publishes all content manually.',
    APPROVAL: 'AI-generated content must be approved by the team before publishing.',
    AUTO: 'AI may schedule and publish content according to standing instructions.'
};
class AiController {
    prisma;
    constructor(prisma){
        this.prisma = prisma;
    }
    async caption(auth, body) {
        (0, _authguard.requirePermission)(auth, 'ai:use');
        await (0, _plans.assertAiCredits)(this.prisma, auth.workspaceId, 1);
        const brand = await this.prisma.brandProfile.findUnique({
            where: {
                workspaceId: auth.workspaceId
            }
        });
        const settings = await this.prisma.aiSettings.findUnique({
            where: {
                workspaceId: auth.workspaceId
            }
        });
        const system = this.brandPrompt(brand, settings, [
            'You are the SMM AI copywriter for a social media management product.',
            `Target platform: ${_shared.PLATFORM_LABEL[body.platform]} — ${_shared.PLATFORM_META[body.platform].accountRequirement}`,
            body.platform === 'FACEBOOK' && 'Style: conversational, 1-3 short paragraphs, at most a couple of emojis if it fits the brand voice.',
            body.platform === 'INSTAGRAM' && 'Style: hook-first first line, concise, up to 10 relevant hashtags.',
            body.platform === 'PINTEREST' && 'Style: return caption as "Title — description" (title max 100 chars), keyword-rich for search.',
            'Respond with STRICT JSON only — an array of objects: [{"caption": "...", "hashtags": ["#example"]}].',
            `Produce exactly ${body.variants} distinct variant(s).`,
            body.includeHashtags ? 'Include 5-12 hashtags per variant.' : 'Use an empty hashtags array.',
            `Write in ${body.language}. Tone: ${body.tone}. Goal: ${body.goal}.`
        ].filter(Boolean).join(' '));
        const user = `Business topic: ${body.topic}`;
        const raw = await (0, _zai.chatCompletion)(await (0, _zai.getZai)(), system, user);
        const parsed = this.parseVariants(raw, body.variants);
        await this.prisma.aiUsage.create({
            data: {
                workspaceId: auth.workspaceId,
                userId: auth.userId,
                kind: 'CAPTION',
                credits: 1,
                model: _zai.AI_MODEL,
                meta: {
                    platform: body.platform
                }
            }
        });
        return {
            variants: parsed,
            creditsUsed: 1
        };
    }
    async image(auth, body) {
        (0, _authguard.requirePermission)(auth, 'ai:use');
        await (0, _plans.assertAiCredits)(this.prisma, auth.workspaceId, 2);
        const zai = await (0, _zai.getZai)();
        const size = IMAGE_SIZES[body.aspectRatio] ?? '1024x1024';
        const response = await zai.images.generations.create({
            prompt: body.prompt,
            size: size
        });
        const base64 = response.data?.[0]?.base64;
        if (!base64) throw new _common.BadRequestException('Image generation returned no data — try again');
        const buffer = Buffer.from(base64, 'base64');
        const filename = await (0, _uploads.saveUpload)(buffer, (0, _uploads.extForMime)('image/png'));
        const media = await this.prisma.postMedia.create({
            data: {
                postId: null,
                type: 'IMAGE',
                provider: 'GENERATED',
                url: (0, _uploads.mediaUrl)(filename),
                storageKey: filename,
                mimeType: 'image/png',
                size: buffer.length,
                aspectRatio: body.aspectRatio
            }
        });
        await this.prisma.aiUsage.create({
            data: {
                workspaceId: auth.workspaceId,
                userId: auth.userId,
                kind: 'IMAGE',
                credits: 2,
                model: _zai.AI_MODEL,
                meta: {
                    aspectRatio: body.aspectRatio
                }
            }
        });
        return {
            mediaId: media.id,
            url: media.url
        };
    }
    async assistant(auth, body) {
        (0, _authguard.requirePermission)(auth, 'ai:use');
        await (0, _plans.assertAiCredits)(this.prisma, auth.workspaceId, 1);
        const brand = await this.prisma.brandProfile.findUnique({
            where: {
                workspaceId: auth.workspaceId
            }
        });
        const settings = await this.prisma.aiSettings.findUnique({
            where: {
                workspaceId: auth.workspaceId
            }
        });
        const system = this.brandPrompt(brand, settings, [
            'You are the SMM AI Assistant — a practical social media strategist.',
            'Give concrete, ready-to-use suggestions: caption drafts, post ideas, weekly plans, improvements.',
            'Never fabricate analytics or follower numbers. If asked for performance data, say it lives in the Analytics section once platforms are connected.'
        ].filter(Boolean).join(' '));
        const history = body.messages.slice(-12).map((m)=>({
                role: m.role,
                content: m.content
            }));
        const last = history[history.length - 1];
        const reply = await (0, _zai.chatCompletion)(await (0, _zai.getZai)(), system, last.content);
        await this.prisma.assistantMessage.createMany({
            data: [
                {
                    workspaceId: auth.workspaceId,
                    userId: auth.userId,
                    role: 'user',
                    content: last.content
                },
                {
                    workspaceId: auth.workspaceId,
                    userId: auth.userId,
                    role: 'assistant',
                    content: reply
                }
            ]
        });
        await this.prisma.aiUsage.create({
            data: {
                workspaceId: auth.workspaceId,
                userId: auth.userId,
                kind: 'ASSISTANT',
                credits: 1,
                model: _zai.AI_MODEL
            }
        });
        return {
            reply,
            creditsUsed: 1
        };
    }
    async plan(auth, body) {
        (0, _authguard.requirePermission)(auth, 'ai:use');
        await (0, _plans.assertAiCredits)(this.prisma, auth.workspaceId, 1);
        const brand = await this.prisma.brandProfile.findUnique({
            where: {
                workspaceId: auth.workspaceId
            }
        });
        const settings = await this.prisma.aiSettings.findUnique({
            where: {
                workspaceId: auth.workspaceId
            }
        });
        const system = this.brandPrompt(brand, settings, [
            'You are the SMM weekly content planner.',
            `Create a 7-day plan with ${body.postsPerDay} post(s) per day (7 x ${body.postsPerDay} items).`,
            'Mix content pillars across the week: educational, promotional, engaging/community, and informative.',
            'Respond with STRICT JSON only — an array: [{"day": 1, "content": "...", "hashtags": ["#..."]}, ...].',
            body.focus ? `Content focus: ${body.focus}.` : ''
        ].filter(Boolean).join(' '));
        const raw = await (0, _zai.chatCompletion)(await (0, _zai.getZai)(), system, 'Generate the weekly plan now.');
        const parsed = this.parsePlanItems(raw, 7 * body.postsPerDay);
        const accounts = await this.prisma.socialAccount.findMany({
            where: {
                workspaceId: auth.workspaceId,
                status: 'CONNECTED',
                platform: {
                    in: body.platforms
                }
            }
        });
        const initialStatus = settings?.mode === 'APPROVAL' ? 'PENDING_APPROVAL' : settings?.mode === 'AUTO' ? 'APPROVED' : 'DRAFT';
        const created = [];
        for (const item of parsed){
            const targetAccounts = accounts;
            const post = await this.prisma.post.create({
                data: {
                    workspaceId: auth.workspaceId,
                    authorId: auth.userId,
                    content: item.content,
                    hashtags: item.hashtags,
                    status: initialStatus,
                    origin: 'AI',
                    aiModel: _zai.AI_MODEL,
                    aiPrompt: body.focus ?? 'Weekly plan',
                    targets: {
                        create: targetAccounts.map((a)=>({
                                accountId: a.id,
                                platform: a.platform,
                                status: initialStatus === 'APPROVED' ? 'APPROVED' : 'PENDING_APPROVAL'
                            }))
                    }
                },
                include: {
                    media: true,
                    targets: true,
                    author: {
                        select: {
                            name: true
                        }
                    }
                }
            });
            created.push(post);
        }
        await this.prisma.aiUsage.create({
            data: {
                workspaceId: auth.workspaceId,
                userId: auth.userId,
                kind: 'PLAN',
                credits: 1,
                model: _zai.AI_MODEL,
                meta: {
                    posts: created.length
                }
            }
        });
        await (0, _audit.writeAudit)(this.prisma, {
            workspaceId: auth.workspaceId,
            actorId: auth.userId,
            action: 'AI_PLAN_CREATED',
            entity: 'Post',
            meta: {
                posts: created.length,
                mode: settings?.mode ?? 'MANUAL'
            }
        });
        return {
            created: created.map((p)=>({
                    id: p.id,
                    content: p.content,
                    status: p.status
                }))
        };
    }
    async replyDraft(auth, body) {
        (0, _authguard.requirePermission)(auth, 'ai:use');
        await (0, _plans.assertAiCredits)(this.prisma, auth.workspaceId, 1);
        const conversation = await this.prisma.conversation.findFirst({
            where: {
                id: body.conversationId,
                workspaceId: auth.workspaceId
            },
            include: {
                messages: {
                    orderBy: {
                        createdAt: 'desc'
                    },
                    take: 6
                }
            }
        });
        if (!conversation) throw new _common.NotFoundException('Conversation not found');
        const message = conversation.messages.find((m)=>m.id === body.messageId);
        if (!message) throw new _common.NotFoundException('Message not found');
        const brand = await this.prisma.brandProfile.findUnique({
            where: {
                workspaceId: auth.workspaceId
            }
        });
        const settings = await this.prisma.aiSettings.findUnique({
            where: {
                workspaceId: auth.workspaceId
            }
        });
        const system = this.brandPrompt(brand, settings, [
            'Draft ONE short, helpful reply to the customer message below.',
            'Match the brand voice. Do not promise refunds, discounts or pricing unless the brand profile states them.',
            'Return only the reply text — no quotes, no preamble.'
        ].filter(Boolean).join(' '));
        const thread = [
            ...conversation.messages
        ].reverse().map((m)=>`${m.direction === 'IN' ? 'Customer' : 'Us'}: ${m.text}`).join('\n');
        const draft = (await (0, _zai.chatCompletion)(await (0, _zai.getZai)(), system, thread)).trim().slice(0, 2000);
        if (!draft) throw new _common.BadRequestException('AI returned an empty draft — try again');
        await this.prisma.message.update({
            where: {
                id: message.id
            },
            data: {
                aiDraft: draft
            }
        });
        await this.prisma.aiUsage.create({
            data: {
                workspaceId: auth.workspaceId,
                userId: auth.userId,
                kind: 'REPLY_DRAFT',
                credits: 1,
                model: _zai.AI_MODEL
            }
        });
        return {
            draft
        };
    }
    // ---------------------------------------------------------------------------
    brandPrompt(brand, settings, extra) {
        const lines = [];
        if (brand) {
            if (brand.businessName) lines.push(`Business: ${brand.businessName}`);
            if (brand.description) lines.push(`About: ${brand.description}`);
            if (brand.industry) lines.push(`Industry: ${brand.industry}`);
            if (brand.productsServices) lines.push(`Products/services: ${brand.productsServices}`);
            if (brand.targetAudience) lines.push(`Target audience: ${brand.targetAudience}`);
            if (brand.brandVoice) lines.push(`Brand voice: ${brand.brandVoice}`);
            if (brand.writingStyle) lines.push(`Writing style: ${brand.writingStyle}`);
            if (brand.brandColors) lines.push(`Brand colors: ${brand.brandColors}`);
            if (brand.language) lines.push(`Preferred language: ${brand.language}`);
        } else {
            lines.push('No brand profile is configured yet — write generically professional content.');
        }
        const restrictions = [
            brand?.contentRestrictions,
            settings?.restrictedTopics
        ].filter(Boolean).join('; ');
        if (restrictions) lines.push(`Content restrictions (MUST respect): avoid these topics and claims — ${restrictions}`);
        lines.push(`Automation mode: ${MODE_DESCRIPTION.AUTO}`);
        return [
            ...lines,
            ...extra
        ].join(' ');
    }
    parseVariants(raw, expected) {
        const data = (0, _zai.extractJson)(raw);
        let items = null;
        if (Array.isArray(data)) items = data;
        else if (data && typeof data === 'object' && Array.isArray(data.variants)) {
            items = data.variants;
        }
        if (!items?.length) throw new _common.BadRequestException('AI returned an invalid response — try again');
        const variants = items.map((item)=>{
            const v = item;
            return {
                caption: typeof v.caption === 'string' ? v.caption.trim() : '',
                hashtags: Array.isArray(v.hashtags) ? v.hashtags.filter((h)=>typeof h === 'string').slice(0, 30) : []
            };
        }).filter((v)=>v.caption.length > 0).map((v)=>({
                ...v,
                hashtags: [
                    ...new Set(v.hashtags)
                ]
            })).slice(0, expected);
        if (!variants.length) throw new _common.BadRequestException('AI returned an invalid response — try again');
        return variants;
    }
    parsePlanItems(raw, max) {
        const data = (0, _zai.extractJson)(raw);
        const items = Array.isArray(data) ? data : null;
        if (!items?.length) throw new _common.BadRequestException('AI returned an invalid plan — try again');
        const plan = items.map((item)=>{
            const v = item;
            return {
                content: typeof v.content === 'string' ? v.content.trim().slice(0, 5000) : '',
                hashtags: Array.isArray(v.hashtags) ? v.hashtags.filter((h)=>typeof h === 'string').slice(0, 30) : []
            };
        }).filter((v)=>v.content.length > 0).slice(0, max);
        if (!plan.length) throw new _common.BadRequestException('AI returned an invalid plan — try again');
        return plan;
    }
}
_ts_decorate([
    (0, _common.Post)('caption'),
    _ts_param(0, (0, _currentauthdecorator.CurrentAuth)()),
    _ts_param(1, (0, _common.Body)(new _zodpipe.ZodValidationPipe(_shared.captionSchema))),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof AuthContext === "undefined" ? Object : AuthContext,
        typeof _zod.z === "undefined" || typeof _zod.z.infer === "undefined" ? Object : _zod.z.infer
    ]),
    _ts_metadata("design:returntype", Promise)
], AiController.prototype, "caption", null);
_ts_decorate([
    (0, _common.Post)('image'),
    _ts_param(0, (0, _currentauthdecorator.CurrentAuth)()),
    _ts_param(1, (0, _common.Body)(new _zodpipe.ZodValidationPipe(_shared.imageSchema))),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof AuthContext === "undefined" ? Object : AuthContext,
        typeof _zod.z === "undefined" || typeof _zod.z.infer === "undefined" ? Object : _zod.z.infer
    ]),
    _ts_metadata("design:returntype", Promise)
], AiController.prototype, "image", null);
_ts_decorate([
    (0, _common.Post)('assistant'),
    _ts_param(0, (0, _currentauthdecorator.CurrentAuth)()),
    _ts_param(1, (0, _common.Body)(new _zodpipe.ZodValidationPipe(_shared.assistantSchema))),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof AuthContext === "undefined" ? Object : AuthContext,
        typeof _zod.z === "undefined" || typeof _zod.z.infer === "undefined" ? Object : _zod.z.infer
    ]),
    _ts_metadata("design:returntype", Promise)
], AiController.prototype, "assistant", null);
_ts_decorate([
    (0, _common.Post)('plan'),
    _ts_param(0, (0, _currentauthdecorator.CurrentAuth)()),
    _ts_param(1, (0, _common.Body)(new _zodpipe.ZodValidationPipe(_shared.planSchema))),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof AuthContext === "undefined" ? Object : AuthContext,
        typeof _zod.z === "undefined" || typeof _zod.z.infer === "undefined" ? Object : _zod.z.infer
    ]),
    _ts_metadata("design:returntype", Promise)
], AiController.prototype, "plan", null);
_ts_decorate([
    (0, _common.Post)('reply-draft'),
    _ts_param(0, (0, _currentauthdecorator.CurrentAuth)()),
    _ts_param(1, (0, _common.Body)(new _zodpipe.ZodValidationPipe(replyDraftSchema))),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof AuthContext === "undefined" ? Object : AuthContext,
        typeof _zod.z === "undefined" || typeof _zod.z.infer === "undefined" ? Object : _zod.z.infer
    ]),
    _ts_metadata("design:returntype", Promise)
], AiController.prototype, "replyDraft", null);
AiController = _ts_decorate([
    (0, _common.Controller)('ai'),
    (0, _common.UseGuards)(_authguard.AuthGuard),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof _prismamodule.PrismaService === "undefined" ? Object : _prismamodule.PrismaService
    ])
], AiController);
class AiSettingsController {
    prisma;
    constructor(prisma){
        this.prisma = prisma;
    }
    async getSettings(auth) {
        (0, _authguard.requirePermission)(auth, 'workspace:read');
        const settings = await this.prisma.aiSettings.findUnique({
            where: {
                workspaceId: auth.workspaceId
            }
        });
        return settings ?? {
            mode: 'MANUAL',
            autoReply: false,
            restrictedTopics: null
        };
    }
    async putSettings(auth, body) {
        (0, _authguard.requirePermission)(auth, 'workspace:update');
        const settings = await this.prisma.aiSettings.upsert({
            where: {
                workspaceId: auth.workspaceId
            },
            create: {
                workspaceId: auth.workspaceId,
                mode: body.mode ?? 'MANUAL',
                autoReply: body.autoReply ?? false,
                restrictedTopics: body.restrictedTopics ?? null
            },
            update: {
                ...body.mode !== undefined ? {
                    mode: body.mode
                } : {},
                ...body.autoReply !== undefined ? {
                    autoReply: body.autoReply
                } : {},
                ...body.restrictedTopics !== undefined ? {
                    restrictedTopics: body.restrictedTopics
                } : {}
            }
        });
        await (0, _audit.writeAudit)(this.prisma, {
            workspaceId: auth.workspaceId,
            actorId: auth.userId,
            action: 'AI_SETTINGS_UPDATED',
            entity: 'AiSettings',
            entityId: settings.id,
            meta: {
                mode: settings.mode
            }
        });
        return settings;
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
], AiSettingsController.prototype, "getSettings", null);
_ts_decorate([
    (0, _common.Put)(),
    _ts_param(0, (0, _currentauthdecorator.CurrentAuth)()),
    _ts_param(1, (0, _common.Body)(new _zodpipe.ZodValidationPipe(_shared.aiSettingsSchema))),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof AuthContext === "undefined" ? Object : AuthContext,
        typeof _zod.z === "undefined" || typeof _zod.z.infer === "undefined" ? Object : _zod.z.infer
    ]),
    _ts_metadata("design:returntype", Promise)
], AiSettingsController.prototype, "putSettings", null);
AiSettingsController = _ts_decorate([
    (0, _common.Controller)('ai-settings'),
    (0, _common.UseGuards)(_authguard.AuthGuard),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof _prismamodule.PrismaService === "undefined" ? Object : _prismamodule.PrismaService
    ])
], AiSettingsController);
class AiModule {
}
AiModule = _ts_decorate([
    (0, _common.Module)({
        imports: [
            _prismamodule.PrismaModule
        ],
        controllers: [
            AiController,
            AiSettingsController
        ]
    })
], AiModule);
