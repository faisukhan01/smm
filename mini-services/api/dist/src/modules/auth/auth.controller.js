"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "AuthController", {
    enumerable: true,
    get: function() {
        return AuthController;
    }
});
const _common = require("@nestjs/common");
const _jwt = require("@nestjs/jwt");
const _authguard = require("../../common/auth.guard");
const _currentauthdecorator = require("../../common/current-auth.decorator");
const _zodpipe = require("../../common/zod.pipe");
const _shared = require("@smm/shared");
const _authservice = require("./auth.service");
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
class AuthController {
    auth;
    jwt;
    constructor(auth, jwt){
        this.auth = auth;
        this.jwt = jwt;
    }
    async register(body, res) {
        const session = await this.auth.register(body);
        this.setSessionCookie(res, session.user.id, session.workspace.id);
        return session;
    }
    async login(body, res) {
        const session = await this.auth.login(body);
        this.setSessionCookie(res, session.user.id, session.workspace.id);
        return session;
    }
    logout(res) {
        res.clearCookie(_authguard.SESSION_COOKIE, {
            path: '/'
        });
        return;
    }
    verifyEmail(body) {
        return this.auth.verifyEmail(String(body?.token ?? ''));
    }
    session(auth) {
        return this.auth.buildSession(auth.userId, auth.workspaceId);
    }
    setSessionCookie(res, userId, workspaceId) {
        const token = this.jwt.sign({
            sub: userId,
            wsId: workspaceId
        }, {
            expiresIn: '7d'
        });
        res.cookie(_authguard.SESSION_COOKIE, token, {
            httpOnly: true,
            sameSite: 'lax',
            secure: process.env.NODE_ENV === 'production',
            path: '/',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });
    }
}
_ts_decorate([
    (0, _common.Post)('register'),
    (0, _common.HttpCode)(201),
    _ts_param(0, (0, _common.Body)(new _zodpipe.ZodValidationPipe(_shared.registerSchema))),
    _ts_param(1, (0, _common.Res)({
        passthrough: true
    })),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        Object,
        typeof Response === "undefined" ? Object : Response
    ]),
    _ts_metadata("design:returntype", Promise)
], AuthController.prototype, "register", null);
_ts_decorate([
    (0, _common.Post)('login'),
    (0, _common.HttpCode)(200),
    _ts_param(0, (0, _common.Body)(new _zodpipe.ZodValidationPipe(_shared.loginSchema))),
    _ts_param(1, (0, _common.Res)({
        passthrough: true
    })),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        Object,
        typeof Response === "undefined" ? Object : Response
    ]),
    _ts_metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
_ts_decorate([
    (0, _common.Post)('logout'),
    (0, _common.HttpCode)(204),
    _ts_param(0, (0, _common.Res)({
        passthrough: true
    })),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof Response === "undefined" ? Object : Response
    ]),
    _ts_metadata("design:returntype", void 0)
], AuthController.prototype, "logout", null);
_ts_decorate([
    (0, _common.Post)('verify-email'),
    (0, _common.HttpCode)(200),
    _ts_param(0, (0, _common.Body)()),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        Object
    ]),
    _ts_metadata("design:returntype", void 0)
], AuthController.prototype, "verifyEmail", null);
_ts_decorate([
    (0, _common.Get)('session'),
    (0, _common.UseGuards)(_authguard.AuthGuard),
    _ts_param(0, (0, _currentauthdecorator.CurrentAuth)()),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        Object
    ]),
    _ts_metadata("design:returntype", void 0)
], AuthController.prototype, "session", null);
AuthController = _ts_decorate([
    (0, _common.Controller)('auth'),
    _ts_metadata("design:type", Function),
    _ts_metadata("design:paramtypes", [
        typeof _authservice.AuthService === "undefined" ? Object : _authservice.AuthService,
        typeof _jwt.JwtService === "undefined" ? Object : _jwt.JwtService
    ])
], AuthController);
