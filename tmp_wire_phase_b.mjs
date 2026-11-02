import { readFileSync, writeFileSync } from 'node:fs';

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** anchor با هر دو شکل پایان خط (LF/CRLF، حتی مخلوط) پیدا و یک‌بار جایگزین می‌شود */
function patch(file, replacements) {
  let src = readFileSync(file, 'utf8');
  for (const [anchor, replacement] of replacements) {
    const rx = new RegExp(escapeRegExp(anchor).replace(/\n/g, '\\r?\\n'), 'g');
    const matches = src.match(rx);
    if (!matches || matches.length !== 1) {
      console.error(`ANCHOR-BAD file=${file} count=${matches ? matches.length : 0} anchor=${JSON.stringify(anchor.slice(0, 80))}`);
      process.exit(1);
    }
    src = src.replace(rx, () => replacement);
  }
  writeFileSync(file, src, 'utf8');
  console.log('PATCHED ' + file);
}

// ── AppModule: CommonInfraModule + فیلتر سراسری + interceptor نشست ──
patch('apps/api/src/app.module.ts', [
  [
    `import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';`,
    `import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { TenantInterceptor } from './common/tenant.interceptor';
import { CommonInfraModule } from './common/common-infra.module';
import { DatabaseModule } from './database/database.module';`,
  ],
  [
    `@Module({
  imports: [
    DatabaseModule,
    HealthModule,`,
    `@Module({
  imports: [
    // زیرساخت مشترک: Throttler، Redis، صف‌های BullMQ و health سراسری (فاز B)
    CommonInfraModule,
    DatabaseModule,
    HealthModule,`,
  ],
  [
    `    ReportsModule,
  ],
})
export class AppModule {}`,
    `    ReportsModule,
  ],
  providers: [
    // قرارداد Error با request_id برای همهٔ استثناها — باگ‌ها فقط در سمت سرور لاگ می‌شوند
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // فعال‌سازی RLS: connection اختصاصی هر درخواست احراز‌شده + app.company_id/app.user_id
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
  ],
})
export class AppModule {}`,
  ],
]);

// ── Redis: خطای اتصال نباید app را بکشد؛ retry با سقف ──
patch('apps/api/src/common/cache/redis.module.ts', [
  [
    `      useFactory: () => {
        return new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: Number(process.env.REDIS_PORT || 6379),
          maxRetriesPerRequest: null,
        });
      },`,
    `      useFactory: () => {
        const client = new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: Number(process.env.REDIS_PORT || 6379),
          maxRetriesPerRequest: null,
          // بدون Redis هم باید بالا بیاییم؛ اتصال بعداً خودترمیم می‌شود
          retryStrategy: (times: number) => Math.min(times * 500, 10_000),
        });
        // listener خطای ضروری: بدون آن، 'error' روی EventEmitter سطح crash است
        client.on('error', (err: Error) => {
          console.warn(\`⚠ Redis در دسترس نیست (\${err.message})؛ کش/صف سراسری غیرفعال است.\`);
        });
        return client;
      },`,
  ],
]);

// ── Queue (BullMQ): همان محافظت ──
patch('apps/api/src/common/queue/queue.module.ts', [
  [
    `      useFactory: () => new Redis({ host: process.env.REDIS_HOST || 'localhost', port: Number(process.env.REDIS_PORT || 6379), maxRetriesPerRequest: null }),`,
    `      useFactory: () => {
        const client = new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: Number(process.env.REDIS_PORT || 6379),
          maxRetriesPerRequest: null,
          retryStrategy: (times: number) => Math.min(times * 500, 10_000),
        });
        client.on('error', (err: Error) => {
          console.warn(\`⚠ Redis برای صف BullMQ در دسترس نیست (\${err.message})؛ شغل‌ها به‌صورت محلی اجرا می‌شوند.\`);
        });
        return client;
      },`,
  ],
]);

// ── Throttler: سقف از env و در تست‌ها آزاد تا رگرسیون ایجاد نکند ──
patch('apps/api/src/common/throttler.module.ts', [
  [
    `    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),`,
    `    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.THROTTLE_TTL_MS ?? 60_000),
        // در تست‌ها سقف برنامه‌ریزی‌شدهٔ ترافیک معنا ندارد؛ تولید/توسعه: ۱۰۰ درخواست در دقیقه
        limit: process.env.NODE_ENV === 'test' ? 100_000 : Number(process.env.THROTTLE_LIMIT ?? 100),
      },
    ]),`,
  ],
]);
