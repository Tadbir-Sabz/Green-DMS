import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';
import { TenantAwarePool } from './tenant-pool';

/** توکن تزریق اتصال پایگاه‌داده در سراسر اپ */
export const PG_POOL = 'PG_POOL';

/**
 * اتصال مشترک PostgreSQL — بدون ORM طبق §۳.۲ سند؛
 * لایه Repository در هر ماژول همین Pool را تزریق می‌گیرد.
 *
 * نکته: مقدار تزریق‌شده لایه TenantAwarePool است (با همان رابط query/connect)
 * تا RLS مهاجرت 0021 با GUCهای نشست فعال شود؛ repositoryها بدون تغییر کار می‌کنند.
 */
@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: (): Pool => {
        const inner = new Pool({
          // تفکیکِ هویتِ «مهاجرت» از هویتِ «زمانِ اجرا» (مهاجرت 0041 و
          // docs/db-privilege-architecture.md):
          //   * APP_DATABASE_URL → نقشِ dms_app: غیرِابرکاربر، غیرِBYPASSRLS و مالکِ
          //     هیچ جدولی نیست ⇒ RLS دربارهٔ او واقعاً اعمال می‌شود.
          //   * DATABASE_URL → نقشِ مدیریتی/مهاجرت (scripts/migrate.mjs فقط از همین
          //     استفاده می‌کند) و همچنین «پیش‌فرضِ سازگارِ عقب‌رو» وقتی APP_DATABASE_URL
          //     ست نشده باشد؛ بنابراین فعال‌سازیِ جداسازی یک تصمیمِ استقرار است، نه
          //     یک تغییرِ شکنندهٔ کد.
          connectionString: process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL,
          max: 10,
          idleTimeoutMillis: 30_000,
        });
        // pg رویداد 'error' را برای clientهای بی‌کار منتشر می‌کند — مثلاً وقتی
        // سرور اتصال را با «terminating connection due to administrator command»
        // (57P01) می‌بندد، همان‌طور که در teardown تست‌ها رخ می‌دهد
        // (pg_terminate_backend پیش از drop database). بدون listener، Node آن را
        // به uncaught exception تبدیل و کل فرآیند/اجرای vitest را crash می‌کند؛
        // طبق مستندات pg یک listener ثبت می‌کنیم. اتصالِ از دست رفته توسط خودِ
        // pool بازیابی می‌شود، پس اینجا تنها خطا را ثبت می‌کنیم.
        inner.on('error', (err: Error) => {
          console.error('[PG_POOL] idle client error:', err.message);
        });
        return new TenantAwarePool(inner) as unknown as Pool;
      },
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}
