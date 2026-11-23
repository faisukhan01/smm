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
    get AuthGuard () {
        return AuthGuard;
    },
    get SESSION_COOKIE () {
        return SESSION_COOKIE;
    },
    get requirePermission () {
        return requirePermission;
    }
});
const _common = require("@nestjs/common");
const _jwt = require("@nestjs/jwt");
const _prismamodule = require("./prisma.module");
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
const SESSION_COOKIE = 'smm_session';
class AuthGuard {
    jwt;
    prisma;
    constructor(jwt, prisma){
        this.jwt = jwt;
        this.prisma = prisma;
    }
    async canActivate(context) {
        const req = context.switchToHttp().getRequest();
        const token = req.cookies?.[SESSION_COOKIE];
        if (!token) throw new _common.UnauthorizedException('Not authenticated');
        let payload;
        try {
            payload = await this.jwt.verifyAsync(token);
        } catch  {
            throw new _common.UnauthorizedException('Session expired');
        }
        if (!payload.sub || !payload.wsId) throw new _common.UnauthorizedException('Invalid session');
        const member = await this.prisma.workspaceMember.findUnique({
            where: {
                workspaceId_userId: {
                    workspaceId: payload.wsId,
                    userId: payload.sub
                }
            }
        });
        if (!member || member.status !== 'ACTIVE') throw new _common.UnauthorizedException('Workspace access revoked');
        req.auth = {
            userId: payload.sub,
            workspaceId: payload.wsId,
            role: member.role,
            permissions: _shared.ROLE_PERMISSIONS[member.role]
        };
        return true;
    }
}
AuthGuard = _ts_decorate([
    (0, _common.Injectable)(),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof _jwt.JwtService === "undefined" ? Object : _jwt.JwtService,
        typeof _prismamodule.PrismaService === "undefined" ? Object : _prismamodule.PrismaService
    ])
], AuthGuard);
function requirePermission(auth, permission) {
    if (!auth) throw new _common.UnauthorizedException('Not authenticated');
    if (!auth.permissions.includes(permission)) {
        throw new _common.ForbiddenException(`Missing permission: ${permission}`);
    }
    return auth;
}
