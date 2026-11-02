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
      useFactory: (): Pool =>
        new TenantAwarePool(
          new Pool({
            connectionString: process.env.DATABASE_URL,
            max: 10,
            idleTimeoutMillis: 30_000,
          }),
        ) as unknown as Pool,
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}
