import { AsyncLocalStorage } from 'node:async_hooks';
import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../../database/database.module';
import { tenantStorage } from '../../database/tenant-context';

/**
 * TASK-24X · A-1 — **سازوکارِ مرجعِ قفلِ ساختِ سفارش**.
 *
 * یافتهٔ A-1 حسابرسیِ TASK-24W: تبدیلِ درخواست (`POST /requests/{id}/convert`) قفلِ
 * advisory می‌گرفت، ولی `POST /orders` با `request_id` **هیچ قفلی نمی‌گرفت** و
 * `sales_order.request_id` هم unique نبود. نتیجه: دو سفارشِ فعال برای یک درخواست.
 *
 * دو نکتهٔ طراحی که هر دو از آزمونِ رقابت بیرون آمدند:
 *
 * ۱) **قفل روی اتصالِ درخواست، نه اتصالِ دوم.**
 *    `TenantInterceptor` به ازای هر درخواستِ احرازشده یک connection lease می‌کند و
 *    تا پایانِ درخواست نگه می‌دارد. اگر قفل هم اتصالِ تازه‌ای از pool بگیرد، هر
 *    درخواست دو connection مصرف می‌کند؛ با سقفِ pool (=۱۰) فقط ۵ درخواستِ هم‌زمان
 *    کافی است تا درخواستِ ششم تا ابد منتظر بماند و *خودِ قفل‌ها هم هرگز آزاد نشوند*
 *    (deadlockِ ناشی از اشباعِ pool). پس قفل همیشه روی connection همان درخواست
 *    (`tenantStorage`) گرفته می‌شود که pool را دو برابر مصرف نمی‌کند.
 *
 * ۲) **بازگشتی (reentrant).**
 *    مسیرِ تبدیل با قفل شروع می‌شود و در همان مسیر `OrderService.create()` با
 *    همان `request_id` صدا زده می‌شود. `pg_advisory_lock` بازگشتی نیست (هر فراخوانی
 *    یک قفلِ جدید روی همان session می‌گیرد و درخواست روی خودش deadlock می‌کند).
 *    مجموعهٔ کلیدهای گرفته‌شده در زنجیرهٔ asyncِ جاری نگه داشته می‌شود تا قفلِ
 *    تکراری به «قفلِ مجدد» تبدیل شود، نه درخواستِ دومِ واقعی.
 */

/** اتصال‌هایی که قفل روی آن‌ها گرفته‌ایم → کلیدهای فعال روی همان اتصال */
const heldByClient = new WeakMap<PoolClient, Set<string>>();
/** کلیدهای گرفته‌شده در زنجیرهٔ asyncِ جاری (برای تشخیصِ قفلِ بازگشتی) */
const heldInContext = new AsyncLocalStorage<Set<string>>();

@Injectable()
export class OrderCreationLock {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** قفلِ انحصاری برای یک هویتِ درخواست؛ تا پایانِ `work` نگه داشته می‌شود. */
  async withRequestLock<T>(requestId: string, work: () => Promise<T>): Promise<T> {
    return this.withKey(`request:${requestId}`, work);
  }

  /**
   * قفل بر اساسِ یک کلیدِ متنی. نامِ کلید در `hashtextextended` هش می‌شود (bigint)
   * تا فضای نامِ قفل‌ها تصادمِ معنایی نداشته باشد.
   */
  async withKey<T>(key: string, work: () => Promise<T>): Promise<T> {
    const current = heldInContext.getStore();
    if (current?.has(key)) return work(); // قفلِ بازگشتی در همین زنجیره

    // اتصالِ اختصاصیِ درخواست اگر موجود باشد (بدونِ مصرفِ connection اضافی)
    const leased = tenantStorage.getStore()?.client;
    if (leased) return this.lockOn(leased, key, current, work, false);

    const client = await this.pool.connect();
    try {
      return await this.lockOn(client, key, current, work, true);
    } finally {
      client.release();
    }
  }

  private async lockOn<T>(
    client: PoolClient,
    key: string,
    current: Set<string> | undefined,
    work: () => Promise<T>,
    ownClient: boolean,
  ): Promise<T> {
    // قفلِ بازگشتی در سطحِ *همان اتصال*: اگر این اتصال همین کلید را دارد،
    // دوباره گرفتنش روی session خودش deadlock می‌کند.
    const onClient = heldByClient.get(client);
    if (onClient?.has(key)) return work();

    await client.query('select pg_advisory_lock(hashtextextended($1, 0))', [key]);
    const keysForClient = onClient ?? new Set<string>();
    keysForClient.add(key);
    heldByClient.set(client, keysForClient);

    const next = new Set(current ?? []);
    next.add(key);
    try {
      return await heldInContext.run(next, work);
    } finally {
      if (ownClient) {
        // اتصالِ خودمان: آزادسازی صریح، سپس بازگشت به pool
        await client.query('select pg_advisory_unlock(hashtextextended($1, 0))', [key]).catch(
          () => undefined,
        );
        keysForClient.delete(key);
      } else {
        // اتصالِ اجاره‌ایِ درخواست: آزادسازی همیشه؛ اگر شکست بخورد اتصال آلوده
        // می‌ماند، پس قفل را در مجموعهٔ اتصال نگه می‌داریم تا وضعیت نادرست نشود.
        await client
          .query('select pg_advisory_unlock(hashtextextended($1, 0))', [key])
          .then(() => keysForClient.delete(key))
          .catch(() => undefined);
      }
    }
  }
}
