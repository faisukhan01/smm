"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
require("reflect-metadata");
const _core = require("@nestjs/core");
const _common = require("@nestjs/common");
const _cookieparser = /*#__PURE__*/ _interop_require_default(require("cookie-parser"));
const _swagger = require("@nestjs/swagger");
const _appmodule = require("./app.module");
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
async function bootstrap() {
    const logger = new _common.Logger('SMM-API');
    const app = await _core.NestFactory.create(_appmodule.AppModule, {
        logger: [
            'log',
            'warn',
            'error'
        ]
    });
    app.use((0, _cookieparser.default)());
    app.enableCors({
        origin: true,
        credentials: true
    });
    app.setGlobalPrefix('api/v1');
    app.enableShutdownHooks();
    const swaggerConfig = new _swagger.DocumentBuilder().setTitle('SMM API').setDescription('AI Social Media Manager — REST API').setVersion('0.1.0').build();
    _swagger.SwaggerModule.setup('api/v1/docs', app, _swagger.SwaggerModule.createDocument(app, swaggerConfig));
    const port = Number(process.env.API_PORT || 3001);
    await app.listen(port, '0.0.0.0');
    logger.log(`SMM API listening on :${port}`);
}
void bootstrap();
