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
    get InboxController () {
        return InboxController;
    },
    get InboxModule () {
        return InboxModule;
    }
});
const _common = require("@nestjs/common");
const _prismamodule = require("../../common/prisma.module");
const _authguard = require("../../common/auth.guard");
const _currentauthdecorator = require("../../common/current-auth.decorator");
const _zodpipe = require("../../common/zod.pipe");
const _audit = require("../../common/audit");
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
const replySchema = _zod.z.object({
    text: _zod.z.string().min(1).max(2000)
});
const applyDraftSchema = _zod.z.object({
    messageId: _zod.z.string().min(1)
});
function mapConversation(c) {
    const last = c.messages?.length ? c.messages[c.messages.length - 1] : null;
    return {
        id: c.id,
        platform: c.platform,
        accountUsername: c.account.username,
        participantName: c.participantName,
        subject: c.subject,
        lastMessageAt: c.lastMessageAt.toISOString(),
        status: c.status,
        preview: last?.text?.slice(0, 120) ?? ''
    };
}
function mapMessage(m) {
    return {
        id: m.id,
        direction: m.direction,
        authorName: m.authorName,
        text: m.text,
        aiDraft: m.aiDraft,
        createdAt: m.createdAt.toISOString()
    };
}
class InboxController {
    prisma;
    constructor(prisma){
        this.prisma = prisma;
    }
    async conversations(auth, status) {
        (0, _authguard.requirePermission)(auth, 'inbox:read');
        const where = {
            workspaceId: auth.workspaceId
        };
        if (status === 'OPEN' || status === 'RESOLVED') where.status = status;
        const rows = await this.prisma.conversation.findMany({
            where,
            include: {
                account: true,
                messages: {
                    orderBy: {
                        createdAt: 'desc'
                    },
                    take: 1
                }
            },
            orderBy: {
                lastMessageAt: 'desc'
            },
            take: 100
        });
        return {
            items: rows.map(mapConversation)
        };
    }
    async thread(auth, id) {
        (0, _authguard.requirePermission)(auth, 'inbox:read');
        const conversation = await this.prisma.conversation.findFirst({
            where: {
                id,
                workspaceId: auth.workspaceId
            },
            include: {
                account: true,
                messages: {
                    orderBy: {
                        createdAt: 'asc'
                    }
                }
            }
        });
        if (!conversation) throw new _common.NotFoundException('Conversation not found');
        return {
            conversation: mapConversation(conversation),
            messages: conversation.messages.map(mapMessage)
        };
    }
    async reply(auth, id, body) {
        (0, _authguard.requirePermission)(auth, 'inbox:reply');
        const conversation = await this.prisma.conversation.findFirst({
            where: {
                id,
                workspaceId: auth.workspaceId
            },
            include: {
                account: true,
                messages: {
                    orderBy: {
                        createdAt: 'asc'
                    }
                }
            }
        });
        if (!conversation) throw new _common.NotFoundException('Conversation not found');
        // Real platform delivery when the conversation came from a real account and
        // the platform officially supports comment/messaging replies.
        let warning = null;
        if (!conversation.account.isDemo) {
            if (conversation.platform === 'PINTEREST') {
                throw new _common.BadRequestException('Comment management is not supported by the Pinterest API');
            }
            if (conversation.platform === 'FACEBOOK' && conversation.externalId && conversation.account.accessTokenEnc) {
                try {
                    const token = (0, _crypto.decryptSecret)(conversation.account.accessTokenEnc);
                    const res = await fetch(`https://graph.facebook.com/v21.0/${conversation.externalId}/comments?message=${encodeURIComponent(body.text)}&access_token=${encodeURIComponent(token)}`, {
                        method: 'POST',
                        signal: AbortSignal.timeout(15000)
                    });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                } catch (err) {
                    warning = `Platform delivery failed: ${err instanceof Error ? err.message : String(err)}`;
                }
            } else {
                warning = 'Direct replies for this platform require approved messaging permissions — reply stored locally.';
            }
        }
        const message = await this.prisma.message.create({
            data: {
                conversationId: conversation.id,
                direction: 'OUT',
                authorName: 'You',
                text: body.text
            }
        });
        await this.prisma.conversation.update({
            where: {
                id: conversation.id
            },
            data: {
                lastMessageAt: new Date()
            }
        });
        await (0, _audit.writeAudit)(this.prisma, {
            workspaceId: auth.workspaceId,
            actorId: auth.userId,
            action: 'INBOX_REPLIED',
            entity: 'Conversation',
            entityId: conversation.id,
            meta: {
                platform: conversation.platform,
                demo: conversation.account.isDemo
            }
        });
        const result = {
            message: mapMessage(message)
        };
        if (warning) result.warning = warning;
        return result;
    }
    async resolve(auth, id) {
        (0, _authguard.requirePermission)(auth, 'inbox:reply');
        return this.setStatus(auth, id, 'RESOLVED');
    }
    async reopen(auth, id) {
        (0, _authguard.requirePermission)(auth, 'inbox:reply');
        return this.setStatus(auth, id, 'OPEN');
    }
    async applyDraft(auth, id, body) {
        (0, _authguard.requirePermission)(auth, 'inbox:reply');
        const conversation = await this.prisma.conversation.findFirst({
            where: {
                id,
                workspaceId: auth.workspaceId
            }
        });
        if (!conversation) throw new _common.NotFoundException('Conversation not found');
        const message = await this.prisma.message.findFirst({
            where: {
                id: body.messageId,
                conversationId: conversation.id
            }
        });
        if (!message) throw new _common.NotFoundException('Message not found');
        if (!message.aiDraft) throw new _common.BadRequestException('This message has no AI draft to send');
        const sent = await this.prisma.message.create({
            data: {
                conversationId: conversation.id,
                direction: 'OUT',
                authorName: 'You',
                text: message.aiDraft
            }
        });
        await this.prisma.conversation.update({
            where: {
                id: conversation.id
            },
            data: {
                lastMessageAt: new Date()
            }
        });
        await (0, _audit.writeAudit)(this.prisma, {
            workspaceId: auth.workspaceId,
            actorId: auth.userId,
            action: 'INBOX_DRAFT_SENT',
            entity: 'Conversation',
            entityId: conversation.id
        });
        return {
            message: mapMessage(sent)
        };
    }
    async setStatus(auth, id, status) {
        const conversation = await this.prisma.conversation.findFirst({
            where: {
                id,
                workspaceId: auth.workspaceId
            },
            include: {
                account: true,
                messages: {
                    orderBy: {
                        createdAt: 'desc'
                    },
                    take: 1
                }
            }
        });
        if (!conversation) throw new _common.NotFoundException('Conversation not found');
        const updated = await this.prisma.conversation.update({
            where: {
                id
            },
            data: {
                status
            }
        });
        const mapped = mapConversation({
            ...conversation,
            status: updated.status
        });
        void _shared.PLATFORM_LABEL;
        return mapped;
    }
}
_ts_decorate([
    (0, _common.Get)('conversations'),
    _ts_param(0, (0, _currentauthdecorator.CurrentAuth)()),
    _ts_param(1, (0, _common.Query)('status')),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof AuthContext === "undefined" ? Object : AuthContext,
        String
    ]),
    _ts_metadata("design:returntype", Promise)
], InboxController.prototype, "conversations", null);
_ts_decorate([
    (0, _common.Get)('conversations/:id'),
    _ts_param(0, (0, _currentauthdecorator.CurrentAuth)()),
    _ts_param(1, (0, _common.Param)('id')),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof AuthContext === "undefined" ? Object : AuthContext,
        String
    ]),
    _ts_metadata("design:returntype", Promise)
], InboxController.prototype, "thread", null);
_ts_decorate([
    (0, _common.Post)('conversations/:id/reply'),
    _ts_param(0, (0, _currentauthdecorator.CurrentAuth)()),
    _ts_param(1, (0, _common.Param)('id')),
    _ts_param(2, (0, _common.Body)(new _zodpipe.ZodValidationPipe(replySchema))),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof AuthContext === "undefined" ? Object : AuthContext,
        String,
        typeof _zod.z === "undefined" || typeof _zod.z.infer === "undefined" ? Object : _zod.z.infer
    ]),
    _ts_metadata("design:returntype", Promise)
], InboxController.prototype, "reply", null);
_ts_decorate([
    (0, _common.Post)('conversations/:id/resolve'),
    _ts_param(0, (0, _currentauthdecorator.CurrentAuth)()),
    _ts_param(1, (0, _common.Param)('id')),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof AuthContext === "undefined" ? Object : AuthContext,
        String
    ]),
    _ts_metadata("design:returntype", Promise)
], InboxController.prototype, "resolve", null);
_ts_decorate([
    (0, _common.Post)('conversations/:id/reopen'),
    _ts_param(0, (0, _currentauthdecorator.CurrentAuth)()),
    _ts_param(1, (0, _common.Param)('id')),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof AuthContext === "undefined" ? Object : AuthContext,
        String
    ]),
    _ts_metadata("design:returntype", Promise)
], InboxController.prototype, "reopen", null);
_ts_decorate([
    (0, _common.Post)('conversations/:id/apply-draft'),
    _ts_param(0, (0, _currentauthdecorator.CurrentAuth)()),
    _ts_param(1, (0, _common.Param)('id')),
    _ts_param(2, (0, _common.Body)(new _zodpipe.ZodValidationPipe(applyDraftSchema))),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof AuthContext === "undefined" ? Object : AuthContext,
        String,
        typeof _zod.z === "undefined" || typeof _zod.z.infer === "undefined" ? Object : _zod.z.infer
    ]),
    _ts_metadata("design:returntype", Promise)
], InboxController.prototype, "applyDraft", null);
InboxController = _ts_decorate([
    (0, _common.Controller)('inbox'),
    (0, _common.UseGuards)(_authguard.AuthGuard),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof _prismamodule.PrismaService === "undefined" ? Object : _prismamodule.PrismaService
    ])
], InboxController);
class InboxModule {
}
InboxModule = _ts_decorate([
    (0, _common.Module)({
        imports: [
            _prismamodule.PrismaModule
        ],
        controllers: [
            InboxController
        ]
    })
], InboxModule);
