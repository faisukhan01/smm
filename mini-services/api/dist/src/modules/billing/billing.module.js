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
    get BillingController () {
        return BillingController;
    },
    get BillingModule () {
        return BillingModule;
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
const PAYMENT_NOTE = 'Payment provider integration pending — plan changes apply immediately in this environment.';
class BillingController {
    prisma;
    constructor(prisma){
        this.prisma = prisma;
    }
    async get(auth) {
        (0, _authguard.requirePermission)(auth, 'workspace:read');
        const workspaceId = auth.workspaceId;
        const [plan, credits, accounts, posts30d, members, storageBytes] = await Promise.all([
            (0, _plans.loadPlan)(this.prisma, workspaceId),
            (0, _plans.sumAiCreditsThisMonth)(this.prisma, workspaceId),
            (0, _plans.countSocialAccounts)(this.prisma, workspaceId),
            (0, _plans.countPostsLast30d)(this.prisma, workspaceId),
            (0, _plans.countActiveMembers)(this.prisma, workspaceId),
            (0, _plans.sumStorageBytes)(this.prisma, workspaceId)
        ]);
        return {
            plan: plan.tier,
            planLimits: plan.limits,
            subscriptionStatus: plan.status,
            usage: {
                aiCredits: {
                    used: credits,
                    limit: plan.limits.aiCreditsPerMonth
                },
                accounts: {
                    used: accounts,
                    limit: plan.limits.maxAccounts
                },
                posts30d: {
                    used: posts30d,
                    limit: plan.limits.maxPostsPerMonth
                },
                members: {
                    used: members,
                    limit: plan.limits.maxMembers
                },
                storageMb: {
                    used: Math.round(storageBytes / (1024 * 1024) * 10) / 10,
                    limit: plan.limits.storageMb
                }
            },
            paymentNote: PAYMENT_NOTE
        };
    }
    async changePlan(auth, body) {
        (0, _authguard.requirePermission)(auth, 'billing:manage');
        if (!_shared.PLANS[body.plan]) throw new _common.BadRequestException('Unknown plan');
        await this.prisma.subscription.upsert({
            where: {
                workspaceId: auth.workspaceId
            },
            create: {
                workspaceId: auth.workspaceId,
                plan: body.plan,
                status: 'ACTIVE',
                periodStart: new Date()
            },
            update: {
                plan: body.plan,
                status: 'ACTIVE'
            }
        });
        await (0, _audit.writeAudit)(this.prisma, {
            workspaceId: auth.workspaceId,
            actorId: auth.userId,
            action: 'PLAN_CHANGED',
            entity: 'Subscription',
            meta: {
                plan: body.plan
            }
        });
        await (0, _notify.notify)(this.prisma, {
            workspaceId: auth.workspaceId,
            type: 'PLAN_CHANGED',
            title: 'Plan changed',
            body: `This workspace is now on the ${_shared.PLANS[body.plan].name} plan.`
        });
        return this.get(auth);
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
], BillingController.prototype, "get", null);
_ts_decorate([
    (0, _common.Post)('plan'),
    _ts_param(0, (0, _currentauthdecorator.CurrentAuth)()),
    _ts_param(1, (0, _common.Body)(new _zodpipe.ZodValidationPipe(_shared.planChangeSchema))),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof AuthContext === "undefined" ? Object : AuthContext,
        typeof _zod.z === "undefined" || typeof _zod.z.infer === "undefined" ? Object : _zod.z.infer
    ]),
    _ts_metadata("design:returntype", Promise)
], BillingController.prototype, "changePlan", null);
BillingController = _ts_decorate([
    (0, _common.Controller)('billing'),
    (0, _common.UseGuards)(_authguard.AuthGuard),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof _prismamodule.PrismaService === "undefined" ? Object : _prismamodule.PrismaService
    ])
], BillingController);
class BillingModule {
}
BillingModule = _ts_decorate([
    (0, _common.Module)({
        imports: [
            _prismamodule.PrismaModule
        ],
        controllers: [
            BillingController
        ]
    })
], BillingModule);
