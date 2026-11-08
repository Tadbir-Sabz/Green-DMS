/**
 * TASK-24X · منبعِ واحدِ «تاریخِ کسب‌وکار» (Business Date).
 *
 * پیش از این سه پیاده‌سازیِ موازی وجود داشت و همین ناسازگاری منشأ یافتهٔ
 * MEDIUM حسابرسیِ TASK-24W شد:
 *
 *   ۱) `sales-chain.service.ts` هنگامِ تبدیلِ درخواست، تاریخِ سند را با
 *      `new Date().toISOString().slice(0,10)` می‌ساخت ⇒ **تاریخِ UTC**.
 *   ۲) `pricing-engine.service.ts` مرزِ «عقب‌گرد» را با `todayTehran()` می‌سنجید
 *      ⇒ **تاریخِ تهران**.
 *   ۳) `quoteWithPolicy()` پیش‌فرضِ تاریخ را با `today()` (UTC) می‌گذاشت، ولی
 *      همان مقدار را در `pricedPolicyRun` با `todayTehran()` مقایسه می‌کرد.
 *
 * پیامدِ عملی: تهران UTC+3:30 است، پس در بازهٔ **۲۰:۳۰ تا ۲۴:۰۰ UTC** تاریخِ UTC
 * یک روز عقب‌تر از تاریخِ تهران است. در این پنجره، تبدیلِ درخواستی که کاربر
 * «امروز» می‌داند با خطای «برای تاریخِ گذشته، ثبتِ دلیل الزامی است» رد می‌شد.
 *
 * قاعدهٔ این فایل:
 *   • هر تصمیمِ تاریخ‌محورِ کسب‌وکار (سند، عقب‌گرد، مرزِ اعتبار) باید از این
 *     توابع استفاده کند — نه از `new Date()`، نه از `Date#toISOString`، و نه از
 *     منطقهٔ زمانیِ ماشین.
 *   • `Intl.DateTimeFormat` با `timeZone` صریح، مستقل از TZ ماشین است و در
 *     DST (که ایران ندارد) و در سال‌های کبیسه هم درست عمل می‌کند.
 */

/** منطقهٔ زمانیِ رسمیِ کسب‌وکار (ایران DST ندارد: همیشه UTC+03:30) */
export const BUSINESS_TIME_ZONE = 'Asia/Tehran';

const isoDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * تاریخِ کسب‌وکار (YYYY-MM-DD) برای یک لحظهٔ زمانی.
 * `en-CA` تولیدِ `YYYY-MM-DD` را تضمین می‌کند (نه MM/DD/YYYY).
 */
export const businessDateOf = (when: Date = new Date()): string => isoDateFormatter.format(when);

/** تاریخِ امروزِ کسب‌وکار — جانشینِ همهٔ `new Date().toISOString().slice(0,10)` ها */
export const businessToday = (): string => businessDateOf(new Date());

/**
 * آیا رشتهٔ ورودی قالبِ تاریخِ کسب‌وکار را دارد؟
 * عمداً دقیق است تا `2026-1-1` یا `2026-01-01T00:00:00Z` رد شود؛ پذیرشِ
 * قالب‌های مبهم همان چیزی است که مقایسهٔ رشته‌ایِ تاریخ را می‌شکند.
 */
export const isBusinessDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * نرمال‌سازیِ مقدارِ تاریخ به تاریخِ کسب‌وکار.
 * برای ورودیِ ISO کامل (با ساعت) ابتدا لحظه را می‌فهمیم و بعد به تاریخِ تهران
 * تبدیل می‌کنیم؛ صرفِ `slice(0,10)` روی یک ISOِ UTC همان باگِ اصلی است.
 */
export const toBusinessDate = (value: string): string | null => {
  if (isBusinessDate(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return businessDateOf(parsed);
};

/**
 * جابه‌جاییِ تاریخِ کسب‌وکار به تعدادِ روز.
 * از نیمه‌شبِ UTC به‌عنوان «تاریخِ خالص» استفاده می‌کند تا حسابِ روزهاش
 * مستقل از TZ ماشین و از ساعتِ روز باشد (بدونِ اثرِ DST).
 */
export const shiftBusinessDate = (date: string, days: number): string => {
  if (!isBusinessDate(date)) throw new RangeError(`تاریخِ کسب‌وکار نامعتبر است: ${date}`);
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
};

/** `date` چند روز پیش از `reference` است؟ (منفی = آینده) */
export const businessDaysBehind = (date: string, reference: string): number => {
  if (!isBusinessDate(date) || !isBusinessDate(reference)) {
    throw new RangeError('مقایسهٔ تاریخ فقط با قالبِ YYYY-MM-DD مجاز است.');
  }
  const a = new Date(`${date}T00:00:00Z`).getTime();
  const b = new Date(`${reference}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
};

/** آیا `date` در معنای کسب‌وکار «گذشته» است؟ (مقایسهٔ رشته‌ای برای ISO معتبر درست است) */
export const isBackdated = (date: string, today: string = businessToday()): boolean => date < today;
