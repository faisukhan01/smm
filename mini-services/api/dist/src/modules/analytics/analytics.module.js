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
    get AnalyticsController () {
        return AnalyticsController;
    },
    get AnalyticsModule () {
        return AnalyticsModule;
    }
});
const _common = require("@nestjs/common");
const _prismamodule = require("../../common/prisma.module");
const _authguard = require("../../common/auth.guard");
const _currentauthdecorator = require("../../common/current-auth.decorator");
const _shared = require("@smm/shared");
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
function csvEscape(value) {
    return `"${value.replace(/"/g, '""')}"`;
}
/**
 * Parses a from/to query pair. Date-only strings ("2026-11-23") are treated
 * as local-to-the-query calendar days: `from` becomes start-of-day UTC and
 * `to` becomes end-of-day UTC so the whole final day is included.
 */ function parseRange(from, to) {
    const isDateOnly = (s)=>/^\d{4}-\d{2}-\d{2}$/.test(s);
    const toD = to ? isDateOnly(to) ? new Date(`${to}T23:59:59.999Z`) : new Date(to) : new Date();
    const fromD = from ? isDateOnly(from) ? new Date(`${from}T00:00:00.000Z`) : new Date(from) : new Date(toD.getTime() - 30 * 864e5);
    return {
        fromD,
        toD
    };
}
class AnalyticsController {
    prisma;
    constructor(prisma){
        this.prisma = prisma;
    }
    async summary(auth, from, to) {
        (0, _authguard.requirePermission)(auth, 'analytics:read');
        const { fromD, toD } = parseRange(from, to);
        const [statusRows, aiAgg, targetRows, recentPosts, realAccount] = await Promise.all([
            this.prisma.post.groupBy({
                by: [
                    'status'
                ],
                where: {
                    workspaceId: auth.workspaceId,
                    OR: [
                        {
                            createdAt: {
                                gte: fromD,
                                lte: toD
                            }
                        },
                        {
                            scheduledAt: {
                                gte: fromD,
                                lte: toD
                            }
                        }
                    ]
                },
                _count: {
                    _all: true
                }
            }),
            this.prisma.aiUsage.aggregate({
                where: {
                    workspaceId: auth.workspaceId,
                    createdAt: {
                        gte: new Date(Date.now() - 30 * 864e5)
                    }
                },
                _sum: {
                    credits: true
                }
            }),
            this.prisma.postTarget.findMany({
                where: {
                    post: {
                        workspaceId: auth.workspaceId
                    }
                },
                select: {
                    platform: true,
                    status: true
                }
            }),
            this.prisma.post.findMany({
                where: {
                    workspaceId: auth.workspaceId
                },
                include: {
                    targets: {
                        select: {
                            platform: true
                        }
                    }
                },
                orderBy: {
                    updatedAt: 'desc'
                },
                take: 5
            }),
            this.prisma.socialAccount.findFirst({
                where: {
                    workspaceId: auth.workspaceId,
                    isDemo: false
                }
            })
        ]);
        const count = (s)=>statusRows.find((r)=>r.status === s)?._count._all ?? 0;
        const totals = {
            posts: statusRows.reduce((acc, r)=>acc + r._count._all, 0),
            published: count('PUBLISHED'),
            scheduled: count('SCHEDULED'),
            failed: count('FAILED'),
            drafts: count('DRAFT')
        };
        const byPlatform = _shared.PLATFORMS.map((platform)=>({
                platform,
                published: targetRows.filter((t)=>t.platform === platform && t.status === 'PUBLISHED').length,
                failed: targetRows.filter((t)=>t.platform === platform && t.status === 'FAILED').length
            }));
        return {
            totals,
            aiCreditsUsed30d: aiAgg._sum.credits ?? 0,
            byPlatform,
            recent: recentPosts.map((p)=>({
                    id: p.id,
                    status: p.status,
                    platform: p.targets[0]?.platform ?? null,
                    publishedAt: p.publishedAt?.toISOString() ?? null,
                    title: p.content.slice(0, 60)
                })),
            platformInsightsAvailable: Boolean(realAccount)
        };
    }
    async exportCsv(auth, from, to) {
        (0, _authguard.requirePermission)(auth, 'analytics:read');
        const where = from || to ? {
            workspaceId: auth.workspaceId,
            createdAt: {
                ...from ? {
                    gte: new Date(from)
                } : {},
                ...to ? {
                    lte: new Date(to)
                } : {}
            }
        } : {
            workspaceId: auth.workspaceId
        };
        const posts = await this.prisma.post.findMany({
            where,
            include: {
                targets: {
                    select: {
                        platform: true
                    }
                }
            },
            orderBy: {
                createdAt: 'desc'
            },
            take: 5000
        });
        const rows = [
            [
                'id',
                'status',
                'platforms',
                'scheduled_at',
                'published_at',
                'content'
            ].join(','),
            ...posts.map((p)=>[
                    p.id,
                    p.status,
                    p.targets.map((t)=>t.platform).join('|'),
                    p.scheduledAt?.toISOString() ?? '',
                    p.publishedAt?.toISOString() ?? '',
                    csvEscape(p.content.replace(/\r?\n/g, ' '))
                ].join(','))
        ];
        return rows.join('\r\n');
    }
}
_ts_decorate([
    (0, _common.Get)('summary'),
    _ts_param(0, (0, _currentauthdecorator.CurrentAuth)()),
    _ts_param(1, (0, _common.Query)('from')),
    _ts_param(2, (0, _common.Query)('to')),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof AuthContext === "undefined" ? Object : AuthContext,
        String,
        String
    ]),
    _ts_metadata("design:returntype", Promise)
], AnalyticsController.prototype, "summary", null);
_ts_decorate([
    (0, _common.Get)('export.csv'),
    _ts_param(0, (0, _currentauthdecorator.CurrentAuth)()),
    _ts_param(1, (0, _common.Query)('from')),
    _ts_param(2, (0, _common.Query)('to')),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof AuthContext === "undefined" ? Object : AuthContext,
        String,
        String
    ]),
    _ts_metadata("design:returntype", Promise)
], AnalyticsController.prototype, "exportCsv", null);
AnalyticsController = _ts_decorate([
    (0, _common.Controller)('analytics'),
    (0, _common.UseGuards)(_authguard.AuthGuard),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof _prismamodule.PrismaService === "undefined" ? Object : _prismamodule.PrismaService
    ])
], AnalyticsController);
class AnalyticsModule {
}
AnalyticsModule = _ts_decorate([
    (0, _common.Module)({
        imports: [
            _prismamodule.PrismaModule
        ],
        controllers: [
            AnalyticsController
        ]
    })
], AnalyticsModule);
