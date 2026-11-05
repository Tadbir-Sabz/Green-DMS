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

/** تابعِ آزادسازیِ connection (همان امضایِ pg: با خطا ⇒ نابودی، بدونِ خطا ⇒ بازگشت به استخر) */
export type ClientReleaser = (err?: Error) => void;

export interface TenantReleaseOutcome {
  /** پاک‌سازیِ GUCها با موفقیت انجام شد؟ */
  clean: boolean;
  /** connection نابود شد و به استخر برنگشت؟ */
  destroyed: boolean;
  /** خطایی که منجر به نابودی شد — هرگز نباید بی‌صدا بماند */
  error?: unknown;
}

/**
 * آزادسازیِ ایمنِ connectionِ اجاره‌محور (GDM-13-01).
 *
 * قراردادِ pg-pool: `release(err)` با آرگومانِ خطا، کلاینت را از استخر **حذف و
 * `end()`** می‌کند (یعنی نابودیِ واقعیِ اتصال)؛ `release()` بدونِ آرگومان آن را به
 * مجموعهٔ idle برمی‌گرداند. پیش از این، خطایِ پاک‌سازی با `.catch(() => undefined)`
 * بلعیده می‌شد و سپس اتصال «بدونِ خطا» آزاد می‌شد ⇒ connectionی که هنوز
 * `app.company_id` اجارهٔ قبلی را داشت به استخر بازمی‌گشت و درخواست/شغلِ بعدی
 * همان را می‌گرفت: نشتِ دادهٔ بین‌اجاره‌ای.
 *
 * این تابع سه تضمین می‌دهد:
 *  ۱) پاک‌سازی **پیش از** آزادسازی انجام می‌شود؛
 *  ۲) اگر پاک‌سازی شکست بخورد، اتصال **نابود** می‌شود (نه بازگشت به استخر)؛
 *  ۳) خطایِ پاک‌سازی هرگز بلعیده نمی‌شود و در `outcome.error` به فراخوان برگردانده
 *     می‌شود تا لاگ/هشدار بخورد. خودِ تابع هرگز پرتاب نمی‌کند تا خطایِ اصلیِ
 *     بدنهٔ کار (یا `finally`) پوشانده نشود.
 *
 * `reason` شرایطِ مرگبارِ اعلام‌شده از سویِ فراخوان است (مثلاً شکستِ `applyTenant`)؛
 * حتی اگر پاک‌سازی موفق شود، اتصالِ «اثبات‌نشده» نابود می‌شود.
 */
export async function releaseTenantClient(
  client: PoolClient,
  release: ClientReleaser,
  reason?: Error,
): Promise<TenantReleaseOutcome> {
  let cleanupError: unknown;
  try {
    await clearTenant(client);
  } catch (err) {
    cleanupError = err;
  }

  const fatal = cleanupError ?? reason;
  if (fatal) {
    const fatalError = fatal instanceof Error ? fatal : new Error(String(fatal));
    try {
      // ارسالِ خطا به release ⇒ pg-pool کلاینت را `_remove` و `end()` می‌کند
      release(fatalError);
    } catch {
      // اتصال از پیش آزاد/غیرقابلِ استفاده است؛ کاری باقی نمانده
    }
    return { clean: !cleanupError, destroyed: true, error: fatal };
  }

  try {
    release();
  } catch {
    return { clean: true, destroyed: false };
  }
  return { clean: true, destroyed: false };
}
