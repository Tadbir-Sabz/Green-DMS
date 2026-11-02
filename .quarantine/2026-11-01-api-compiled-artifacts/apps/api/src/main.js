"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const dotenv_1 = require("dotenv");
const node_path_1 = __importDefault(require("node:path"));
// بارگذاری .env ریشه پروژه پیش از خواندن هر تنظیماتی
// (cwd هنگام اجرا با npm -w برابر apps/api است)
(0, dotenv_1.config)({ path: node_path_1.default.resolve(process.cwd(), '../../.env'), quiet: true });
(0, dotenv_1.config)({ path: node_path_1.default.resolve(process.cwd(), '.env'), quiet: true });
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const app_module_1 = require("./app.module");
const validation_1 = require("./common/validation");
const auto_migrate_1 = require("./database/auto-migrate");
async function bootstrap() {
    // مهاجرت‌های اعمال‌نشده پیش از listen اعمال می‌شوند (AUTO_MIGRATE=false فقط هشدار می‌دهد)
    // تا هرگز به شکل خطای 500 روی درخواست‌ها دیده نشوند
    await (0, auto_migrate_1.prepareDatabase)();
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    // اعتبارسنجی DTOها — پیام ساخت‌یافته فارسی طبق قرارداد Error (openapi)
    app.useGlobalPipes(new common_1.ValidationPipe(validation_1.validationPipeOptions));
    // نسخه‌بندی در مسیر طبق ضمیمه F: کسب‌وکار زیر /api/v1 و سلامت بدون نسخه
    app.setGlobalPrefix('api/v1', { exclude: ['api/health'] });
    app.enableCors({ origin: true, credentials: true });
    const port = Number(process.env.API_PORT ?? 4000);
    await app.listen(port);
    console.log(`DMS API  →  http://localhost:${port}/api`);
}
// شکست در مهاجرت/اتصال باید برنامه را متوقف کند؛ بالا آمدن نیمه‌کاره یعنی 500های بعدی
bootstrap().catch((err) => {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`✗ راه‌اندازی API متوقف شد:\n${detail}`);
    process.exit(1);
});
