import { AsyncLocalStorage } from 'node:async_hooks';
import type { PoolClient } from 'pg';

export interface TenantIdentity {
  companyId: string;
  userId: string;
}

export interface TenantStore {
  /** connection اختصاصی درخواست جاری — همه queryها روی همین اجرا می‌شوند */
  client: PoolClient;
  tenant: TenantIdentity;
}

/**
 * context نشست در سطح هر درخواست (mهاجرت 0021 › RLS):
 * سیاست‌های row level security از current_setting('app.company_id') و
 * current_setting('app.user_id') می‌خوانند؛ این استنتاج‌ها فقط وقتی درست است
 * که مقدار GUC دقیقاً مربوط به نشست جاری باشد.
 */
export const tenantStorage = new AsyncLocalStorage<TenantStore>();

/**
 * تنظیم GUCهای نشست روی یک connection مشخص (نه session-level روی کل pool).
 * دلیل: pool بین درخواست‌ها connection را جابه‌جا می‌کند؛ اگر مقدار روی کل pool
 * ست شود، درخواست بعدی ممکن است دادهٔ شرکت قبلی را ببیند. این تابع همیشه روی
 * connection اختصاصیِ اجاره‌شده اجرا می‌شود.
 */
export async function applyTenant(client: PoolClient, tenant: TenantIdentity): Promise<void> {
  await client.query(`select set_config('app.company_id', $1, false), set_config('app.user_id', $2, false)`, [
    tenant.companyId,
    tenant.userId,
  ]);
}

/**
 * پاک‌سازی GUC پیش از بازگشت connection به pool — هر connection آزاد باید بدون
 * نشست باشد تا درخواست بعدی بدون احراز هویت هرگز دادهٔ شرکت دیگری نبیند
 * (اگر RLS روی جدولی فعال باشد، خالی‌بودن GUC یعنی خطا، نه دیدن داده).
 */
export async function clearTenant(client: PoolClient): Promise<void> {
  await client.query(`select set_config('app.company_id', '', false), set_config('app.user_id', '', false)`);
}
