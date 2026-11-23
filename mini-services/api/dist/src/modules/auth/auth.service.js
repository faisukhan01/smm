"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "AuthService", {
    enumerable: true,
    get: function() {
        return AuthService;
    }
});
const _common = require("@nestjs/common");
const _jwt = require("@nestjs/jwt");
const _prismamodule = require("../../common/prisma.module");
const _password = require("../../common/password");
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
const SESSION_DAYS = 7;
class AuthService {
    prisma;
    jwt;
    constructor(prisma, jwt){
        this.prisma = prisma;
        this.jwt = jwt;
    }
    async register(input) {
        const email = input.email.toLowerCase().trim();
        const existing = await this.prisma.user.findUnique({
            where: {
                email
            }
        });
        if (existing) throw new _common.ConflictException('An account with this email already exists');
        const user = await this.prisma.user.create({
            data: {
                email,
                name: input.name.trim(),
                passwordHash: (0, _password.hashPassword)(input.password),
                verifyToken: crypto.randomUUID()
            }
        });
        const workspace = await this.createOwnedWorkspace(user.id, `${input.name.trim().split(' ')[0] || 'My'} Workspace`);
        return this.buildSession(user.id, workspace.id);
    }
    async login(input) {
        const email = input.email.toLowerCase().trim();
        const user = await this.prisma.user.findUnique({
            where: {
                email
            },
            include: {
                memberships: {
                    where: {
                        status: 'ACTIVE'
                    },
                    take: 1
                }
            }
        });
        if (!user || !(0, _password.verifyPassword)(input.password, user.passwordHash)) {
            throw new _common.UnauthorizedException('Invalid email or password');
        }
        const workspaceId = user.memberships[0]?.workspaceId;
        if (!workspaceId) throw new _common.UnauthorizedException('No active workspace');
        return this.buildSession(user.id, workspaceId);
    }
    /** Switch the active workspace (multi-workspace users: AGENCY plan). */ async switchWorkspace(userId, workspaceId) {
        const member = await this.prisma.workspaceMember.findFirst({
            where: {
                userId,
                workspaceId,
                status: 'ACTIVE'
            }
        });
        if (!member) throw new _common.BadRequestException('Not a member of this workspace');
        return this.buildSession(userId, workspaceId);
    }
    async verifyEmail(token) {
        const user = await this.prisma.user.findFirst({
            where: {
                verifyToken: token
            }
        });
        if (!user) throw new _common.BadRequestException('Invalid or expired verification token');
        await this.prisma.user.update({
            where: {
                id: user.id
            },
            data: {
                emailVerified: true,
                verifyToken: null
            }
        });
        return {
            verified: true
        };
    }
    async createOwnedWorkspace(ownerId, name) {
        const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'workspace';
        const slug = `${base}-${crypto.randomUUID().slice(0, 8)}`;
        return this.prisma.$transaction(async (tx)=>{
            const workspace = await tx.workspace.create({
                data: {
                    name,
                    slug,
                    ownerId
                }
            });
            await tx.workspaceMember.create({
                data: {
                    workspaceId: workspace.id,
                    userId: ownerId,
                    role: 'OWNER',
                    status: 'ACTIVE'
                }
            });
            await tx.subscription.create({
                data: {
                    workspaceId: workspace.id,
                    plan: 'FREE',
                    status: 'ACTIVE',
                    periodStart: new Date()
                }
            });
            await tx.aiSettings.create({
                data: {
                    workspaceId: workspace.id,
                    mode: 'MANUAL'
                }
            });
            await tx.notification.create({
                data: {
                    workspaceId: workspace.id,
                    type: 'WORKSPACE_CREATED',
                    title: 'Welcome to SMM',
                    body: 'Connect a social account and configure your brand profile to get started.'
                }
            });
            return workspace;
        });
    }
    async buildSession(userId, workspaceId) {
        const user = await this.prisma.user.findUniqueOrThrow({
            where: {
                id: userId
            }
        });
        const membership = await this.prisma.workspaceMember.findUniqueOrThrow({
            where: {
                workspaceId_userId: {
                    workspaceId,
                    userId
                }
            },
            include: {
                workspace: {
                    include: {
                        subscription: true
                    }
                }
            }
        });
        const role = membership.role;
        return {
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                emailVerified: user.emailVerified
            },
            workspace: {
                id: membership.workspace.id,
                name: membership.workspace.name,
                slug: membership.workspace.slug,
                plan: membership.workspace.subscription?.plan ?? 'FREE'
            },
            role,
            permissions: _shared.ROLE_PERMISSIONS[role]
        };
    }
}
AuthService = _ts_decorate([
    (0, _common.Injectable)(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof _prismamodule.PrismaService === "undefined" ? Object : _prismamodule.PrismaService,
        typeof _jwt.JwtService === "undefined" ? Object : _jwt.JwtService
    ])
], AuthService);
