import { createHash } from 'node:crypto';

/**
 * TASK-24Z · Phase H — اثرانگشتِ موجودیت (Entity Fingerprint).
 *
 * یافتهٔ حسابرسیِ TASK-24Y: ستونِ `approval_binding.entity_fingerprint` **نوشته**
 * می‌شد ولی **هرگز مقایسه نمی‌شد**؛ هیچ فراخوانی هم مقداری برایش نمی‌فرستاد. یعنی
 * کنترل روی کاغذ وجود داشت و در عمل هیچ".
 *
 * این فایل قراردادِ صریحِ «وضعیتِ تأییدشده» را برای هر عملیات تعریف می‌کند:
 *
 *   • اثرانگشت روی **فیلدهای تصمیم‌ساز** گرفته می‌شود، نه روی همهٔ ستون‌ها. تغییرِ
 *     فراداده (مثلِ `updated_at`، `row_version`، یادداشتِ داخلی) نباید تأیید را باطل
 *     کند — وگرنه هر نویزِ بی‌ربط کاربر را مجبور به تأییدِ دوباره می‌کند.
 *   • فیلدهای عددی به‌صورتِ **رشته‌ای نرمال‌شده** (بدونِ صفرِ اعشاریِ اضافه) وارد
 *     می‌شوند تا `1000` و `1000.00` یک اثرانگشت بدهند.
 *   • ترتیبِ کلیدها ثابت است (آرایهٔ صریح، نه `Object.keys`) تا هش پایدار بماند.
 *   • `null` و `undefined` یک‌سان رفتار می‌شوند.
 *
 * عملیاتِ پشتیبانی‌شده همان سه عملیاتِ تحتِ حاکمیتِ TASK-24Y هستند. برای هر
 * عملیاتِ تازه باید یک ورودی به `FINGERPRINT_FIELDS` افزوده شود؛ عملیاتِ ناشناخته
 * **fail-closed** است (اثرانگشتِ null ⇒ اجرا رد می‌شود)، نه «بدونِ کنترل».
 */

/** فیلدهای تصمیم‌سازِ هر عملیات — همین ترتیب، همین نام‌ها، بخشی از قرارداد است. */
export const FINGERPRINT_FIELDS: Record<string, readonly string[]> = {
  // مبلغ، مشتری، شعبه و اقلام، وضعیتِ تأییدشده را می‌سازند.
  // `status` عمداً نیست: تأیید خودش وضعیت را عوض می‌کند.
  'sales.order.approve': ['customer_id', 'branch_id', 'grand_total', 'order_date', 'items'],
  // مرجوعی ستونِ مبلغِ کل ندارد؛ مبلغ از اقلام می‌آید (جمعِ qty*unit_price) و
  // در همان کوئریِ واکشی محاسبه می‌شود تا تغییرِ اقلام هم اثرانگشت را عوض کند.
  'sales.return.approve': ['customer_id', 'branch_id', 'invoice_id', 'line_count', 'qty_total', 'items'],
  'ap.purchase.approve': ['supplier_id', 'branch_id', 'grand_total', 'items'],
};

const normalize = (v: unknown): string => {
  if (v == null) return '\u0000null';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '\u0000nan';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') {
    // اعدادِ رشته‌ای (numeric از pg) نرمال می‌شوند تا 1000.00 == 1000
    const trimmed = v.trim();
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) return String(Number(trimmed));
    return trimmed;
  }
  return JSON.stringify(v);
};

/**
 * محاسبهٔ اثرانگشت از یک ردیفِ موجودیت.
 *
 * @returns هشِ ۶۴ کاراکتری، یا `null` اگر عملیات ناشناخته باشد (⇒ فراخوان باید رد کند)
 */
export function fingerprintOf(
  operation: string,
  entity: Record<string, unknown> | null | undefined,
): string | null {
  const fields = FINGERPRINT_FIELDS[operation];
  if (!fields) return null;
  if (!entity) return null;
  const canonical = fields.map((f) => `${f}=${normalize(entity[f])}`).join('\u001f');
  return createHash('sha256').update(`${operation}\u001e${canonical}`).digest('hex');
}

/** فیلدهای این عملیات — برای پیامِ خطا و مستندسازی. */
export const fingerprintFieldsFor = (operation: string): readonly string[] =>
  FINGERPRINT_FIELDS[operation] ?? [];

/**
 * مقایسهٔ امن (بدونِ واگذاریِ زودهنگام) — طول‌ثابت‌ها همیشه با هم مقایسه می‌شوند.
 * خروجی `true` یعنی «وضعیت از زمانِ تأیید تغییر نکرده».
 */
export function fingerprintMatches(approved: string | null, current: string | null): boolean {
  if (!approved || !current) return false;
  if (approved.length !== current.length) return false;
  let diff = 0;
  for (let i = 0; i < approved.length; i++) diff |= approved.charCodeAt(i) ^ current.charCodeAt(i);
  return diff === 0;
}
