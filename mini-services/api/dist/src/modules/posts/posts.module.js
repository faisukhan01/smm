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
    get PostsController () {
        return PostsController;
    },
    get PostsModule () {
        return PostsModule;
    },
    get mapPost () {
        return mapPost;
    }
});
const _common = require("@nestjs/common");
const _prismamodule = require("../../common/prisma.module");
const _authguard = require("../../common/auth.guard");
const _currentauthdecorator = require("../../common/current-auth.decorator");
const _zodpipe = require("../../common/zod.pipe");
const _audit = require("../../common/audit");
const _notify = require("../../common/notify");
const _plans = require("../../common/plans");
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
function mapPost(post) {
    return {
        id: post.id,
        content: post.content,
        hashtags: post.hashtags,
        status: post.status,
        origin: post.origin,
        scheduledAt: post.scheduledAt?.toISOString() ?? null,
        publishedAt: post.publishedAt?.toISOString() ?? null,
        createdAt: post.createdAt.toISOString(),
        updatedAt: post.updatedAt.toISOString(),
        failureReason: post.failureReason,
        authorName: post.author.name,
        media: post.media.filter((m)=>m.postId === post.id).map((m)=>({
                id: m.id,
                type: m.type,
                url: m.url,
                aspectRatio: m.aspectRatio,
                altText: m.altText,
                provider: m.provider
            })),
        targets: post.targets.map((t)=>({
                id: t.id,
                accountId: t.accountId,
                platform: t.platform,
                status: t.status,
                externalPostId: t.externalPostId,
                publishedAt: t.publishedAt?.toISOString() ?? null,
                error: t.error
            }))
    };
}
const INCLUDE = {
    media: true,
    targets: true,
    author: {
        select: {
            name: true
        }
    }
};
class PostsController {
    prisma;
    constructor(prisma){
        this.prisma = prisma;
    }
    async list(auth, status, platform, from, to, page, pageSize) {
        (0, _authguard.requirePermission)(auth, 'post:read');
        const p = Math.max(1, Number(page) || 1);
        const size = Math.min(100, Math.max(1, Number(pageSize) || 20));
        const where = {
            workspaceId: auth.workspaceId
        };
        if (status && _shared.POST_STATUSES.includes(status)) {
            where.status = status;
        }
        if (platform && [
            'FACEBOOK',
            'INSTAGRAM',
            'PINTEREST'
        ].includes(platform)) {
            where.targets = {
                some: {
                    platform: platform
                }
            };
        }
        if (from || to) {
            const range = {};
            if (from) range.gte = new Date(from);
            if (to) range.lte = new Date(to);
            where.OR = [
                {
                    createdAt: range
                },
                {
                    scheduledAt: range
                },
                {
                    publishedAt: range
                }
            ];
        }
        const [rows, total, statusRows] = await Promise.all([
            this.prisma.post.findMany({
                where,
                include: INCLUDE,
                orderBy: {
                    updatedAt: 'desc'
                },
                skip: (p - 1) * size,
                take: size
            }),
            this.prisma.post.count({
                where
            }),
            this.prisma.post.groupBy({
                by: [
                    'status'
                ],
                where: {
                    workspaceId: auth.workspaceId
                },
                _count: {
                    _all: true
                }
            })
        ]);
        const counts = Object.fromEntries(_shared.POST_STATUSES.map((s)=>[
                s,
                statusRows.find((r)=>r.status === s)?._count._all ?? 0
            ]));
        return {
            items: rows.map(mapPost),
            total,
            counts
        };
    }
    async get(auth, id) {
        (0, _authguard.requirePermission)(auth, 'post:read');
        const post = await this.prisma.post.findFirst({
            where: {
                id,
                workspaceId: auth.workspaceId
            },
            include: INCLUDE
        });
        if (!post) throw new _common.NotFoundException('Post not found');
        return mapPost(post);
    }
    async create(auth, body) {
        (0, _authguard.requirePermission)(auth, 'post:draft');
        const used = await this.prisma.post.count({
            where: {
                workspaceId: auth.workspaceId,
                createdAt: {
                    gte: new Date(Date.now() - 30 * 864e5)
                }
            }
        });
        await (0, _plans.assertQuota)(this.prisma, auth.workspaceId, 'posts', used);
        const media = await this.resolveMedia(auth, body.mediaIds);
        const accounts = await this.assertAccounts(auth, body.targetAccountIds);
        const byId = new Map(accounts.map((a)=>[
                a.id,
                a
            ]));
        const post = await this.prisma.post.create({
            data: {
                workspaceId: auth.workspaceId,
                authorId: auth.userId,
                content: body.content,
                hashtags: body.hashtags,
                status: body.status,
                scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
                aiModel: body.aiModel ?? null,
                aiPrompt: body.aiPrompt ?? null,
                media: {
                    connect: media.map((m)=>({
                            id: m.id
                        }))
                },
                targets: {
                    create: body.targetAccountIds.map((accountId)=>({
                            accountId,
                            platform: byId.get(accountId).platform,
                            status: body.status === 'APPROVED' ? 'APPROVED' : 'PENDING_APPROVAL'
                        }))
                }
            },
            include: INCLUDE
        });
        await (0, _audit.writeAudit)(this.prisma, {
            workspaceId: auth.workspaceId,
            actorId: auth.userId,
            action: 'POST_CREATED',
            entity: 'Post',
            entityId: post.id
        });
        return mapPost(post);
    }
    async update(auth, id, body) {
        (0, _authguard.requirePermission)(auth, 'post:edit');
        const post = await this.prisma.post.findFirst({
            where: {
                id,
                workspaceId: auth.workspaceId
            },
            include: INCLUDE
        });
        if (!post) throw new _common.NotFoundException('Post not found');
        const editable = [
            'DRAFT',
            'PENDING_APPROVAL',
            'APPROVED',
            'SCHEDULED'
        ];
        if (!editable.includes(post.status)) {
            throw new _common.BadRequestException('Post can no longer be edited');
        }
        if (body.targetAccountIds) await this.assertAccounts(auth, body.targetAccountIds);
        if (body.mediaIds) await this.resolveMedia(auth, body.mediaIds, id);
        const data = {};
        if (body.content !== undefined) data.content = body.content;
        if (body.hashtags !== undefined) data.hashtags = body.hashtags;
        if (body.scheduledAt !== undefined) {
            data.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
        }
        if (body.targetAccountIds) {
            const accounts = await this.assertAccounts(auth, body.targetAccountIds);
            const byId = new Map(accounts.map((a)=>[
                    a.id,
                    a
                ]));
            await this.prisma.$transaction(async (tx)=>{
                await tx.post.update({
                    where: {
                        id: post.id
                    },
                    data
                });
                await tx.postTarget.deleteMany({
                    where: {
                        postId: post.id
                    }
                });
                if (body.targetAccountIds.length) {
                    await tx.postTarget.createMany({
                        data: body.targetAccountIds.map((accountId)=>({
                                postId: post.id,
                                accountId,
                                platform: byId.get(accountId).platform,
                                status: post.status === 'APPROVED' ? 'APPROVED' : 'PENDING_APPROVAL'
                            }))
                    });
                }
                if (body.mediaIds) {
                    await tx.postMedia.updateMany({
                        where: {
                            id: {
                                in: body.mediaIds
                            },
                            post: {
                                workspaceId: auth.workspaceId
                            }
                        },
                        data: {
                            postId: post.id
                        }
                    });
                }
                if (body.scheduledAt !== undefined && post.status === 'SCHEDULED') {
                    await tx.publishingJob.updateMany({
                        where: {
                            postId: post.id,
                            status: {
                                in: [
                                    'PENDING',
                                    'FAILED',
                                    'CANCELLED'
                                ]
                            }
                        },
                        data: {
                            runAt: body.scheduledAt ? new Date(body.scheduledAt) : new Date(),
                            status: 'PENDING',
                            attempts: 0
                        }
                    });
                }
            });
        } else {
            await this.prisma.$transaction(async (tx)=>{
                await tx.post.update({
                    where: {
                        id: post.id
                    },
                    data
                });
                if (body.mediaIds) {
                    await tx.postMedia.updateMany({
                        where: {
                            id: {
                                in: body.mediaIds
                            },
                            post: {
                                workspaceId: auth.workspaceId
                            }
                        },
                        data: {
                            postId: post.id
                        }
                    });
                }
                if (body.scheduledAt !== undefined && post.status === 'SCHEDULED') {
                    await tx.publishingJob.updateMany({
                        where: {
                            postId: post.id,
                            status: {
                                in: [
                                    'PENDING',
                                    'FAILED',
                                    'CANCELLED'
                                ]
                            }
                        },
                        data: {
                            runAt: body.scheduledAt ? new Date(body.scheduledAt) : new Date(),
                            status: 'PENDING',
                            attempts: 0
                        }
                    });
                }
            });
        }
        await (0, _audit.writeAudit)(this.prisma, {
            workspaceId: auth.workspaceId,
            actorId: auth.userId,
            action: 'POST_UPDATED',
            entity: 'Post',
            entityId: post.id
        });
        const updated = await this.prisma.post.findUniqueOrThrow({
            where: {
                id: post.id
            },
            include: INCLUDE
        });
        return mapPost(updated);
    }
    async submit(auth, id) {
        (0, _authguard.requirePermission)(auth, 'post:draft');
        const post = await this.setStatus(auth, id, 'DRAFT', 'PENDING_APPROVAL');
        await this.prisma.postTarget.updateMany({
            where: {
                postId: id
            },
            data: {
                status: 'PENDING_APPROVAL'
            }
        });
        await (0, _notify.notify)(this.prisma, {
            workspaceId: auth.workspaceId,
            type: 'APPROVAL_REQUESTED',
            title: 'Approval requested',
            body: `A post was submitted for approval by ${auth.role === 'OWNER' ? 'the workspace owner' : 'a team member'}.`
        });
        return mapPost(post);
    }
    async approve(auth, id) {
        (0, _authguard.requirePermission)(auth, 'post:approve');
        const post = await this.setStatus(auth, id, 'PENDING_APPROVAL', 'APPROVED');
        await this.prisma.postTarget.updateMany({
            where: {
                postId: id,
                status: 'PENDING_APPROVAL'
            },
            data: {
                status: 'APPROVED'
            }
        });
        await (0, _audit.writeAudit)(this.prisma, {
            workspaceId: auth.workspaceId,
            actorId: auth.userId,
            action: 'POST_APPROVED',
            entity: 'Post',
            entityId: id
        });
        return mapPost(post);
    }
    async schedule(auth, id, body) {
        (0, _authguard.requirePermission)(auth, 'post:schedule');
        const post = await this.prisma.post.findFirst({
            where: {
                id,
                workspaceId: auth.workspaceId
            },
            include: {
                targets: true
            }
        });
        if (!post) throw new _common.NotFoundException('Post not found');
        if (post.status !== 'APPROVED' && post.status !== 'SCHEDULED') {
            throw new _common.BadRequestException('Only approved posts can be scheduled');
        }
        const runAt = new Date(body.scheduledAt);
        if (Number.isNaN(runAt.getTime()) || runAt.getTime() <= Date.now()) {
            throw new _common.BadRequestException('Scheduled time must be in the future');
        }
        if (!post.targets.length) throw new _common.BadRequestException('Add at least one target account before scheduling');
        const plan = await (0, _plans.loadPlan)(this.prisma, auth.workspaceId);
        await this.prisma.$transaction(async (tx)=>{
            await tx.post.update({
                where: {
                    id: post.id
                },
                data: {
                    status: 'SCHEDULED',
                    scheduledAt: runAt,
                    failureReason: null
                }
            });
            await tx.postTarget.updateMany({
                where: {
                    postId: post.id
                },
                data: {
                    status: 'SCHEDULED',
                    error: null
                }
            });
            for (const target of post.targets){
                const key = `post:${post.id}:target:${target.id}`;
                const existing = await tx.publishingJob.findUnique({
                    where: {
                        idempotencyKey: key
                    }
                });
                if (existing) {
                    await tx.publishingJob.update({
                        where: {
                            idempotencyKey: key
                        },
                        data: {
                            status: 'PENDING',
                            runAt,
                            attempts: 0,
                            lockedAt: null,
                            lastError: null
                        }
                    });
                } else {
                    await tx.publishingJob.create({
                        data: {
                            postId: post.id,
                            targetId: target.id,
                            runAt,
                            driver: process.env.QUEUE_DRIVER || 'db',
                            idempotencyKey: key
                        }
                    });
                }
            }
        });
        await (0, _audit.writeAudit)(this.prisma, {
            workspaceId: auth.workspaceId,
            actorId: auth.userId,
            action: 'POST_SCHEDULED',
            entity: 'Post',
            entityId: post.id,
            meta: {
                scheduledAt: runAt.toISOString(),
                driver: plan.tier
            }
        });
        const updated = await this.prisma.post.findUniqueOrThrow({
            where: {
                id: post.id
            },
            include: INCLUDE
        });
        return mapPost(updated);
    }
    async publishNow(auth, id) {
        (0, _authguard.requirePermission)(auth, 'post:schedule');
        const post = await this.prisma.post.findFirst({
            where: {
                id,
                workspaceId: auth.workspaceId
            },
            include: {
                targets: true
            }
        });
        if (!post) throw new _common.NotFoundException('Post not found');
        const allowed = [
            'APPROVED',
            'SCHEDULED',
            'FAILED'
        ];
        if (!allowed.includes(post.status)) {
            throw new _common.BadRequestException('Only approved or scheduled posts can be published now');
        }
        if (!post.targets.length) throw new _common.BadRequestException('Add at least one target account first');
        await this.prisma.$transaction(async (tx)=>{
            await tx.post.update({
                where: {
                    id: post.id
                },
                data: {
                    status: 'PUBLISHING',
                    failureReason: null
                }
            });
            await tx.postTarget.updateMany({
                where: {
                    postId: post.id,
                    status: {
                        in: [
                            'APPROVED',
                            'SCHEDULED',
                            'FAILED'
                        ]
                    }
                },
                data: {
                    status: 'PUBLISHING',
                    error: null
                }
            });
            for (const target of post.targets){
                const key = `post:${post.id}:target:${target.id}`;
                const existing = await tx.publishingJob.findUnique({
                    where: {
                        idempotencyKey: key
                    }
                });
                if (existing) {
                    await tx.publishingJob.update({
                        where: {
                            idempotencyKey: key
                        },
                        data: {
                            status: 'PENDING',
                            runAt: new Date(),
                            attempts: 0,
                            lockedAt: null,
                            lastError: null
                        }
                    });
                } else {
                    await tx.publishingJob.create({
                        data: {
                            postId: post.id,
                            targetId: target.id,
                            runAt: new Date(),
                            driver: process.env.QUEUE_DRIVER || 'db',
                            idempotencyKey: key
                        }
                    });
                }
            }
        });
        await (0, _audit.writeAudit)(this.prisma, {
            workspaceId: auth.workspaceId,
            actorId: auth.userId,
            action: 'POST_PUBLISH_NOW',
            entity: 'Post',
            entityId: post.id
        });
        const updated = await this.prisma.post.findUniqueOrThrow({
            where: {
                id: post.id
            },
            include: INCLUDE
        });
        return mapPost(updated);
    }
    async cancel(auth, id) {
        (0, _authguard.requirePermission)(auth, 'post:schedule');
        const post = await this.setStatus(auth, id, undefined, 'CANCELLED', [
            'SCHEDULED',
            'APPROVED',
            'PENDING_APPROVAL',
            'FAILED'
        ]);
        await this.prisma.postTarget.updateMany({
            where: {
                postId: id,
                status: {
                    notIn: [
                        'PUBLISHED'
                    ]
                }
            },
            data: {
                status: 'CANCELLED'
            }
        });
        await this.prisma.publishingJob.updateMany({
            where: {
                postId: id,
                status: {
                    in: [
                        'PENDING',
                        'PROCESSING',
                        'FAILED'
                    ]
                }
            },
            data: {
                status: 'CANCELLED'
            }
        });
        await (0, _audit.writeAudit)(this.prisma, {
            workspaceId: auth.workspaceId,
            actorId: auth.userId,
            action: 'POST_CANCELLED',
            entity: 'Post',
            entityId: id
        });
        return mapPost(post);
    }
    async duplicate(auth, id) {
        (0, _authguard.requirePermission)(auth, 'post:draft');
        const post = await this.prisma.post.findFirst({
            where: {
                id,
                workspaceId: auth.workspaceId
            },
            include: {
                media: true
            }
        });
        if (!post) throw new _common.NotFoundException('Post not found');
        const copy = await this.prisma.post.create({
            data: {
                workspaceId: auth.workspaceId,
                authorId: auth.userId,
                content: post.content,
                hashtags: [
                    ...post.hashtags
                ],
                status: 'DRAFT',
                origin: post.origin,
                media: {
                    connect: post.media.filter((m)=>m.postId === post.id).map((m)=>({
                            id: m.id
                        }))
                }
            },
            include: INCLUDE
        });
        await (0, _audit.writeAudit)(this.prisma, {
            workspaceId: auth.workspaceId,
            actorId: auth.userId,
            action: 'POST_DUPLICATED',
            entity: 'Post',
            entityId: copy.id,
            meta: {
                sourcePostId: post.id
            }
        });
        return mapPost(copy);
    }
    async retry(auth, id) {
        (0, _authguard.requirePermission)(auth, 'post:schedule');
        const post = await this.prisma.post.findFirst({
            where: {
                id,
                workspaceId: auth.workspaceId
            },
            include: {
                targets: true
            }
        });
        if (!post) throw new _common.NotFoundException('Post not found');
        if (post.status !== 'FAILED') throw new _common.BadRequestException('Only failed posts can be retried');
        const failedTargets = post.targets.filter((t)=>t.status === 'FAILED');
        if (!failedTargets.length) throw new _common.BadRequestException('No failed targets to retry');
        const runAt = post.scheduledAt && post.scheduledAt > new Date() ? post.scheduledAt : new Date();
        await this.prisma.$transaction(async (tx)=>{
            await tx.post.update({
                where: {
                    id: post.id
                },
                data: {
                    status: 'PUBLISHING',
                    failureReason: null
                }
            });
            await tx.postTarget.updateMany({
                where: {
                    id: {
                        in: failedTargets.map((t)=>t.id)
                    }
                },
                data: {
                    status: 'PUBLISHING',
                    error: null
                }
            });
            for (const target of failedTargets){
                const key = `post:${post.id}:target:${target.id}`;
                await tx.publishingJob.upsert({
                    where: {
                        idempotencyKey: key
                    },
                    create: {
                        postId: post.id,
                        targetId: target.id,
                        runAt,
                        driver: process.env.QUEUE_DRIVER || 'db',
                        idempotencyKey: key
                    },
                    update: {
                        status: 'PENDING',
                        runAt,
                        attempts: 0,
                        lockedAt: null,
                        lastError: null
                    }
                });
            }
        });
        await (0, _audit.writeAudit)(this.prisma, {
            workspaceId: auth.workspaceId,
            actorId: auth.userId,
            action: 'POST_RETRY',
            entity: 'Post',
            entityId: post.id,
            meta: {
                targets: failedTargets.length
            }
        });
        const updated = await this.prisma.post.findUniqueOrThrow({
            where: {
                id: post.id
            },
            include: INCLUDE
        });
        return mapPost(updated);
    }
    async remove(auth, id) {
        (0, _authguard.requirePermission)(auth, 'post:delete');
        const post = await this.prisma.post.findFirst({
            where: {
                id,
                workspaceId: auth.workspaceId
            }
        });
        if (!post) throw new _common.NotFoundException('Post not found');
        if (post.status !== 'DRAFT') throw new _common.BadRequestException('Only drafts can be deleted');
        await this.prisma.post.delete({
            where: {
                id
            }
        });
        await (0, _audit.writeAudit)(this.prisma, {
            workspaceId: auth.workspaceId,
            actorId: auth.userId,
            action: 'POST_DELETED',
            entity: 'Post',
            entityId: id
        });
        return;
    }
    // -------------------------------------------------------------------------
    // helpers
    // -------------------------------------------------------------------------
    async assertAccounts(auth, ids) {
        if (!ids.length) return [];
        const accounts = await this.prisma.socialAccount.findMany({
            where: {
                id: {
                    in: ids
                },
                workspaceId: auth.workspaceId
            }
        });
        if (accounts.length !== new Set(ids).size) {
            throw new _common.BadRequestException('One or more target accounts not found in this workspace');
        }
        return accounts;
    }
    async resolveMedia(auth, ids, postId) {
        if (!ids || !ids.length) return [];
        const media = await this.prisma.postMedia.findMany({
            where: {
                id: {
                    in: ids
                },
                OR: [
                    {
                        post: {
                            workspaceId: auth.workspaceId
                        }
                    },
                    {
                        postId: null
                    }
                ]
            }
        });
        if (media.length !== new Set(ids).size) {
            throw new _common.BadRequestException('One or more media items not found');
        }
        void postId;
        return media;
    }
    async setStatus(auth, id, from, to, allowed) {
        const post = await this.prisma.post.findFirst({
            where: {
                id,
                workspaceId: auth.workspaceId
            },
            include: INCLUDE
        });
        if (!post) throw new _common.NotFoundException('Post not found');
        if (allowed ? !allowed.includes(post.status) : post.status !== from) {
            throw new _common.BadRequestException(allowed ? `Cannot ${to.toLowerCase()} a post in status ${post.status}` : `Post must be ${from} to transition to ${to}`);
        }
        await this.prisma.post.update({
            where: {
                id: post.id
            },
            data: {
                status: to
            }
        });
        return {
            ...post,
            status: to
        };
    }
}
_ts_decorate([
    (0, _common.Get)(),
    _ts_param(0, (0, _currentauthdecorator.CurrentAuth)()),
    _ts_param(1, (0, _common.Query)('status')),
    _ts_param(2, (0, _common.Query)('platform')),
    _ts_param(3, (0, _common.Query)('from')),
    _ts_param(4, (0, _common.Query)('to')),
    _ts_param(5, (0, _common.Query)('page')),
    _ts_param(6, (0, _common.Query)('pageSize')),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof AuthContext === "undefined" ? Object : AuthContext,
        String,
        String,
        String,
        String,
        String,
        String
    ]),
    _ts_metadata("design:returntype", Promise)
], PostsController.prototype, "list", null);
_ts_decorate([
    (0, _common.Get)(':id'),
    _ts_param(0, (0, _currentauthdecorator.CurrentAuth)()),
    _ts_param(1, (0, _common.Param)('id')),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof AuthContext === "undefined" ? Object : AuthContext,
        String
    ]),
    _ts_metadata("design:returntype", Promise)
], PostsController.prototype, "get", null);
_ts_decorate([
    (0, _common.Post)(),
    _ts_param(0, (0, _currentauthdecorator.CurrentAuth)()),
    _ts_param(1, (0, _common.Body)(new _zodpipe.ZodValidationPipe(_shared.createPostSchema))),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof AuthContext === "undefined" ? Object : AuthContext,
        typeof _zod.z === "undefined" || typeof _zod.z.infer === "undefined" ? Object : _zod.z.infer
    ]),
    _ts_metadata("design:returntype", Promise)
], PostsController.prototype, "create", null);
_ts_decorate([
    (0, _common.Patch)(':id'),
    _ts_param(0, (0, _currentauthdecorator.CurrentAuth)()),
    _ts_param(1, (0, _common.Param)('id')),
    _ts_param(2, (0, _common.Body)(new _zodpipe.ZodValidationPipe(_shared.updatePostSchema))),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof AuthContext === "undefined" ? Object : AuthContext,
        String,
        typeof _zod.z === "undefined" || typeof _zod.z.infer === "undefined" ? Object : _zod.z.infer
    ]),
    _ts_metadata("design:returntype", Promise)
], PostsController.prototype, "update", null);
_ts_decorate([
    (0, _common.Post)(':id/submit'),
    _ts_param(0, (0, _currentauthdecorator.CurrentAuth)()),
    _ts_param(1, (0, _common.Param)('id')),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof AuthContext === "undefined" ? Object : AuthContext,
        String
    ]),
    _ts_metadata("design:returntype", Promise)
], PostsController.prototype, "submit", null);
_ts_decorate([
    (0, _common.Post)(':id/approve'),
    _ts_param(0, (0, _currentauthdecorator.CurrentAuth)()),
    _ts_param(1, (0, _common.Param)('id')),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof AuthContext === "undefined" ? Object : AuthContext,
        String
    ]),
    _ts_metadata("design:returntype", Promise)
], PostsController.prototype, "approve", null);
_ts_decorate([
    (0, _common.Post)(':id/schedule'),
    _ts_param(0, (0, _currentauthdecorator.CurrentAuth)()),
    _ts_param(1, (0, _common.Param)('id')),
    _ts_param(2, (0, _common.Body)(new _zodpipe.ZodValidationPipe(_shared.schedulePostSchema))),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof AuthContext === "undefined" ? Object : AuthContext,
        String,
        typeof _zod.z === "undefined" || typeof _zod.z.infer === "undefined" ? Object : _zod.z.infer
    ]),
    _ts_metadata("design:returntype", Promise)
], PostsController.prototype, "schedule", null);
_ts_decorate([
    (0, _common.Post)(':id/publish-now'),
    _ts_param(0, (0, _currentauthdecorator.CurrentAuth)()),
    _ts_param(1, (0, _common.Param)('id')),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof AuthContext === "undefined" ? Object : AuthContext,
        String
    ]),
    _ts_metadata("design:returntype", Promise)
], PostsController.prototype, "publishNow", null);
_ts_decorate([
    (0, _common.Post)(':id/cancel'),
    _ts_param(0, (0, _currentauthdecorator.CurrentAuth)()),
    _ts_param(1, (0, _common.Param)('id')),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof AuthContext === "undefined" ? Object : AuthContext,
        String
    ]),
    _ts_metadata("design:returntype", Promise)
], PostsController.prototype, "cancel", null);
_ts_decorate([
    (0, _common.Post)(':id/duplicate'),
    _ts_param(0, (0, _currentauthdecorator.CurrentAuth)()),
    _ts_param(1, (0, _common.Param)('id')),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof AuthContext === "undefined" ? Object : AuthContext,
        String
    ]),
    _ts_metadata("design:returntype", Promise)
], PostsController.prototype, "duplicate", null);
_ts_decorate([
    (0, _common.Post)(':id/retry'),
    _ts_param(0, (0, _currentauthdecorator.CurrentAuth)()),
    _ts_param(1, (0, _common.Param)('id')),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof AuthContext === "undefined" ? Object : AuthContext,
        String
    ]),
    _ts_metadata("design:returntype", Promise)
], PostsController.prototype, "retry", null);
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
], PostsController.prototype, "remove", null);
PostsController = _ts_decorate([
    (0, _common.Controller)('posts'),
    (0, _common.UseGuards)(_authguard.AuthGuard),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof _prismamodule.PrismaService === "undefined" ? Object : _prismamodule.PrismaService
    ])
], PostsController);
class PostsModule {
}
PostsModule = _ts_decorate([
    (0, _common.Module)({
        imports: [
            _prismamodule.PrismaModule
        ],
        controllers: [
            PostsController
        ]
    })
], PostsModule);
