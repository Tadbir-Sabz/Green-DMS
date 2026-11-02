import 'reflect-metadata';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';

// بارگذاری .env ریشه پروژه پیش از خواندن هر تنظیماتی
// (cwd هنگام اجرا با npm -w برابر apps/api است)
loadEnv({ path: path.resolve(process.cwd(), '../../.env'), quiet: true });
loadEnv({ path: path.resolve(process.cwd(), '.env'), quiet: true });

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import { validationPipeOptions } from './common/validation';
import { prepareDatabase } from './database/auto-migrate';

async function bootstrap() {
  // مهاجرت‌های اعمال‌نشده پیش از listen اعمال می‌شوند (AUTO_MIGRATE=false فقط هشدار می‌دهد)
  // تا هرگز به شکل خطای 500 روی درخواست‌ها دیده نشوند
  await prepareDatabase();

  // rawBody برای اعتبارسنجی HMAC وب‌هوک درگاه روی بدنهٔ خام (بدون وابستگی
  // به ترتیب کلیدهای JSON پس از parse)
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // اعتبارسنجی DTOها — پیام ساخت‌یافته فارسی طبق قرارداد Error (openapi)
  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));

  // نسخه‌بندی در مسیر طبق ضمیمه F: کسب‌وکار زیر /api/v1 و سلامت بدون نسخه
  app.setGlobalPrefix('api/v1', { exclude: ['api/health'] });
  app.enableCors({ origin: true, credentials: true });

  // رهگیری زنده (ماژول ۶) روی socket.io با همان نسخه‌بندی
  app.useWebSocketAdapter(new IoAdapter(app));

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
