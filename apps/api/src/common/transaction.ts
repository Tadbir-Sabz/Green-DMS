import type { Pool, PoolClient } from 'pg';

/**
 * TASK-24Z — مرزِ تراکنشِ مشترک.
 *
 * یافتهٔ D-1 حسابرسیِ TASK-24Y: `requireApproved()` اتصال را مصرف می‌کرد و سپس
 * `repo.approve()` به‌صورتِ یک دستورِ **جدا** اجرا می‌شد. اگر نوشتنِ دوم شکست
 * می‌خورد (تصادمِ هم‌زمان، `not_approvable`، مرگِ فرآیند)، تأیید **سوخته** بود ولی
 * موجودیت تأیید نمی‌شد.
 *
 * قاعدهٔ این فایل: تأییدِ اتصال و گذارِ وضعیتِ کسب‌وکار باید در **یک** تراکنش باشند.
 * هیچ‌کدام نباید بدونِ دیگری commit شود.
 *
 * چرا `pool.connect()` و نه `pool.query()`:
 *   • `TenantAwarePool.connect()` همان GUCهای نشست (app.company_id/app.user_id) را
 *     روی اتصال می‌نشاند ⇒ RLS مهاجرت 0021 روی همان نشست اعمال می‌شود.
 *   • `release` آن همیشه ابتدا نشست را پاک می‌کند، پس اتصالِ «آلوده» به استخر
 *     برنمی‌گردد.
 */
export type Runner = Pick<PoolClient, 'query'>;

/** یک اتصال را برای اجرای داخلِ تراکنش برمی‌گرداند (repositoryها همین را می‌گیرند). */
export const runner = (pool: Pool | Runner, client?: Runner): Runner =>
  (client ?? (pool as Runner));

/**
 * اجرای یک واحدِ کار در یک تراکنش.
 *
 * رفتارِ خطا: هر استثنا ⇒ `ROLLBACK` و سپس انتشارِ همان خطا. بنابراین اگر گذارِ
 * کسب‌وکار شکست بخورد، مصرفِ اتصال هم برمی‌گردد و تأییدِ معتبر **از دست نمی‌رود**
 * (پذیرشِ D-1، موردِ ۲ و ۵).
 */
export async function withTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  let broken: Error | null = null;
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    try {
      await client.query('rollback');
    } catch (rollbackErr) {
      // تراکنش از پیش باطل شده (مثلاً قطعِ اتصال)؛ اتصال نباید به استخر برگردد.
      broken = rollbackErr instanceof Error ? rollbackErr : new Error(String(rollbackErr));
    }
    throw err;
  } finally {
    client.release(broken ?? undefined);
  }
}
