/**
 * قلاب‌های خطای آزمایشی (S8-07 / R6) — فقط برای آزمون‌های شکستِ پنجرهٔ مهاجرت (W5/W6/D4).
 *
 * قواعد (همه باید هم‌زمان برقرار باشند؛ در غیر این صورت هیچ خطایی تزریق نمی‌شود):
 *   1. DMS_TEST_HOOKS دقیقاً برابر I-UNDERSTAND-TEST-ONLY باشد.
 *   2. NODE_ENV برابر production نباشد.
 *   3. نقشِ جاریِ اتصالِ مدیریتی (current_user) هیچ‌یک از هویت‌های زمانِ اجرا/نگه‌داری/مهاجرت نباشد.
 *      (قلاب هرگز با هویتی که API یا مهاجرت با آن کار می‌کند فعال نمی‌شود.)
 *
 * نقاطِ تزریق: revoke (در closeWindow) و grant-check (در grantWindow پس از GRANT و پیش از بررسیِ SET).
 * مشخصه: «<نقطه>:<n>» (n بار اول شکست می‌خورد) یا «<نقطه>:always».
 */

export const HOOK_ACK = 'I-UNDERSTAND-TEST-ONLY';
export const FAULT_POINTS = Object.freeze(['revoke', 'grant-check']);
const RUNTIME_ROLES = new Set(['dms_app', 'dms_readonly', 'dms_maintainer', 'dms_owner', 'dms_migrator']);

/** فعال‌بودنِ قلاب‌ها؛ {enabled, reason}. */
export function faultHooksEnabled({ env, currentUser }) {
  if ((env.NODE_ENV ?? '') === 'production') return { enabled: false, reason: 'NODE_ENV=production' };
  if ((env.DMS_TEST_HOOKS ?? '') !== HOOK_ACK) return { enabled: false, reason: 'DMS_TEST_HOOKS تنظیم نشده' };
  if (!currentUser) return { enabled: false, reason: 'نقشِ جاری نامشخص است' };
  if (RUNTIME_ROLES.has(currentUser)) return { enabled: false, reason: `نقشِ «${currentUser}» هرگز قلابِ آزمایشی ندارد` };
  return { enabled: true, reason: null };
}

/** تجزیهٔ مشخصه؛ نامعتبر ⇒ خطا (fail-closed). */
export function parseFaultSpec(spec) {
  if (spec === undefined || spec === null || spec === '') return null;
  const m = /^([a-z-]+):(\d+|always)$/.exec(String(spec).trim());
  if (!m) throw new Error(`DMS_TEST_FAULT نامعتبر است: «${spec}» (مثال: revoke:1 یا revoke:always)`);
  if (!FAULT_POINTS.includes(m[1])) throw new Error(`نقطهٔ خطای ناشناخته: «${m[1]}»`);
  const count = m[2] === 'always' ? 'always' : Number(m[2]);
  if (count !== 'always' && (!Number.isInteger(count) || count < 1)) throw new Error('تعداد خطا باید ≥ ۱ باشد');
  return { point: m[1], count };
}

/**
 * تزریق‌کننده؛ hit(point) فقط برای نقطهٔ مشخص‌شده و فقط در فراخوانیِ مجاز true می‌دهد.
 * شمارنده در همان فرایند است (قطعی و بدون زمان‌بندی).
 */
export function createFaultInjector({ enabled, spec }) {
  const parsed = enabled ? parseFaultSpec(spec) : null;
  let seen = 0;
  return {
    active: parsed !== null,
    hit(point) {
      if (!parsed || parsed.point !== point) return false;
      seen += 1;
      return parsed.count === 'always' || seen <= parsed.count;
    },
  };
}
