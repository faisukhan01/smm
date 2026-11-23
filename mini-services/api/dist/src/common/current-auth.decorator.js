"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "CurrentAuth", {
    enumerable: true,
    get: function() {
        return CurrentAuth;
    }
});
const _common = require("@nestjs/common");
const CurrentAuth = (0, _common.createParamDecorator)((_data, ctx)=>{
    const req = ctx.switchToHttp().getRequest();
    return req.auth;
});
