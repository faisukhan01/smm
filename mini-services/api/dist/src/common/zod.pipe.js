"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "ZodValidationPipe", {
    enumerable: true,
    get: function() {
        return ZodValidationPipe;
    }
});
const _common = require("@nestjs/common");
class ZodValidationPipe {
    schema;
    constructor(schema){
        this.schema = schema;
    }
    transform(value) {
        const result = this.schema.safeParse(value);
        if (!result.success) {
            const issues = result.error.issues.map((i)=>({
                    path: i.path.join('.'),
                    message: i.message
                }));
            throw new _common.BadRequestException({
                message: 'Validation failed',
                issues
            });
        }
        return result.data;
    }
}
