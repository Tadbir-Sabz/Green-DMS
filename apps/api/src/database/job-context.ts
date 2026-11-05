import type { Pool } from 'pg';
import { applyTenant, clearTenant, tenantStorage } from './tenant-context';

/**
 * زمینهٔ اجاره برایِ کارِ «بیرونِ درخواستِ HTTP» — کارگرِ پس‌زمینه، صف و jobهایِ زمان‌بندی‌شده.
 *
 * چرا لازم است: لایهٔ TenantAwarePool زمینهٔ اجاره را از AsyncLocalStorageِ «درخواستِ جاری»
 * می‌گیرد (TenantInterceptor). یک زمان‌بندِ داخلِ پروسه هیچ درخواستی ندارد، پس بدونِ این تابع
 * queryهایش رویِ Poolِ مشترک می‌روند با GUCهایِ خالی ⇒ زیرِ نقشِ زمانِ اجرا (dms_app) و RLS
 * **صفر ردیف** می‌بینند. یعنی کارگر بی‌صدا هیچ کاری نمی‌کند، در حالی که شغل‌ها «queued» می‌مانند.
 *
 * سه تضمینی که این تابع می‌دهد:
 *  ۱) زمینه «پیش از» هر پرس‌وجویِ اجاره‌محور ست می‌شود؛
 *  ۲) هر شغل connection اختصاصیِ خودش را دارد و همهٔ queryهایِ همان شغل (به‌واسطهٔ
 *     tenantStorage) به همان connection می‌روند ⇒ دو شغلِ هم‌زمان زمینهٔ هم را نمی‌بینند؛
 *  ۳) در `finally` و «پیش از» release پاک‌سازی می‌شود ⇒ connectionِ بازگشتی به pool هرگز
 *     اجارهٔ شغلِ قبلی را به درخواست/شغلِ بعدی نشت نمی‌دهد (حتی اگر fn پرتاب کند).
 */

/**
 * شناسهٔ کاربرِ job: عمداً خالی. هیچ انسانِ پشتِ کارِ پس‌زمینه نیست و سیاستِ p_invoice_scope
 * (0021/0041) بر پایهٔ app.user_id دامنه را «گشاد» می‌کند؛ با مقدارِ خالی هیچ user_scope‌ای
 * تطبیق نمی‌یابد ⇒ گشادشدنِ ناخواستهٔ دامنه در کارِ پس‌زمینه ممکن نیست (fail-closed).
 */
export const JOB_USER_ID = '';

export async function runAsJobTenant<T>(
  pool: Pool,
  companyId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  const tenant = { companyId, userId: JOB_USER_ID };
  try {
    await applyTenant(client, tenant);
    return await tenantStorage.run({ client, tenant }, fn);
  } finally {
    await clearTenant(client).catch(() => undefined);
    client.release();
  }
}
