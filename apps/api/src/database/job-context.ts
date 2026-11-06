import type { Pool } from 'pg';
import { applyTenant, releaseTenantClient, tenantStorage } from './tenant-context';

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

export interface JobTenantOptions {
  /**
   * گزارشِ شکستِ پاک‌سازی/نابودیِ اتصال. خطایِ پاک‌سازی هرگز بلعیده نمی‌شود؛ اگر
   * فراخوان گزارش‌دهنده ندهد، جزئیات در `outcome`ِ داخلی می‌ماند و اتصال نابود شده است.
   */
  onConnectionDiscarded?: (info: {
    companyId: string;
    stage: 'apply' | 'clear';
    error: unknown;
    destroyed: boolean;
  }) => void;
}

export async function runAsJobTenant<T>(
  pool: Pool,
  companyId: string,
  fn: () => Promise<T>,
  options: JobTenantOptions = {},
): Promise<T> {
  const client = await pool.connect();
  const release = client.release.bind(client);
  const tenant = { companyId, userId: JOB_USER_ID };
  let applyError: Error | undefined;
  try {
    try {
      await applyTenant(client, tenant);
    } catch (err) {
      applyError = err instanceof Error ? err : new Error(String(err));
      throw applyError;
    }
    return await tenantStorage.run({ client, tenant }, fn);
  } finally {
    // اگر applyTenant شکست خورده باشد، وضعیتِ اتصال اثبات‌نشده است ⇒ `reason` داده
    // می‌شود تا اتصال حتی در صورتِ موفقیتِ پاک‌سازی نابود شود (نه بازگشت به استخر).
    const outcome = await releaseTenantClient(client, release, applyError);
    if (outcome.destroyed) {
      options.onConnectionDiscarded?.({
        companyId,
        stage: applyError ? 'apply' : 'clear',
        error: outcome.error,
        destroyed: true,
      });
    }
  }
}
