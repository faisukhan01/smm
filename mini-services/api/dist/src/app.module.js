"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "AppModule", {
    enumerable: true,
    get: function() {
        return AppModule;
    }
});
const _common = require("@nestjs/common");
const _prismamodule = require("./common/prisma.module");
const _authmodule = require("./modules/auth/auth.module");
const _workspacemodule = require("./modules/workspace/workspace.module");
const _brandmodule = require("./modules/brand/brand.module");
const _accountsmodule = require("./modules/accounts/accounts.module");
const _postsmodule = require("./modules/posts/posts.module");
const _mediamodule = require("./modules/media/media.module");
const _aimodule = require("./modules/ai/ai.module");
const _inboxmodule = require("./modules/inbox/inbox.module");
const _analyticsmodule = require("./modules/analytics/analytics.module");
const _billingmodule = require("./modules/billing/billing.module");
const _notificationsmodule = require("./modules/notifications/notifications.module");
const _auditmodule = require("./modules/audit/audit.module");
function _ts_decorate(decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for(var i = decorators.length - 1; i >= 0; i--)if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
}
class AppModule {
}
AppModule = _ts_decorate([
    (0, _common.Module)({
        imports: [
            _prismamodule.PrismaModule,
            _authmodule.AuthModule,
            _workspacemodule.WorkspaceModule,
            _brandmodule.BrandModule,
            _accountsmodule.AccountsModule,
            _postsmodule.PostsModule,
            _mediamodule.MediaModule,
            _aimodule.AiModule,
            _inboxmodule.InboxModule,
            _analyticsmodule.AnalyticsModule,
            _billingmodule.BillingModule,
            _notificationsmodule.NotificationsModule,
            _auditmodule.AuditModule
        ]
    })
], AppModule);
