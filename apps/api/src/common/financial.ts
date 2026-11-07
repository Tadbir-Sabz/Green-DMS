/**
 * قواعدِ مالیِ مشترک — تنها منبعِ حقیقت برای گرد‌کردن در قیمت/تخفیف/مالیات.
 *
 * ⚠️ قراردادِ سازگاری (TASK-24): این توابع باید *عیناً* همان رفتارِ پیشینِ
 * `apps/api/src/modules/sales/order.service.ts` را تولید کنند، از جمله رفتارِ
 * مقادیرِ منفی. دلیل: اسنادِ مالیِ تاریخی نباید با بازآراییِ کد تغییر کنند
 * (اصلِ «حفظِ رفتارِ گرد‌کردنِ مالیِ موجود» در TASK-24 §2).
 *
 * پیش از این فایل، دو قاعدهٔ مجزا در کد وجود داشت:
 *   ۱) `money(n) = (Math.round(n * 100) / 100).toFixed(2)` — برای همهٔ مبالغِ سند
 *   ۲) `tax = Math.round(gross * ratePct) / 100` — مالیاتِ هر قلم (ریالِ صحیح)
 * هر دو این‌جا بازتولید شده‌اند و تست‌های `financial-rounding.test.ts` مثبت/منفی/نیمه
 * را قفل می‌کنند.
 *
 * نکتهٔ ریاضیِ مهم (نباید «اصلاح» شود): `Math.round` در JS برای .5 به سمت +∞ می‌رود
 * (`Math.round(-2.5) === -2`). این یعنی گرد‌کردنِ مبالغِ منفی asymmetric است. تغییر
 * آن به half-away-from-zero رفتارِ اسنادِ مالیِ گذشته/مرجوعی‌ها را عوض می‌کند؛
 * بنابراین عمداً حفظ شده و در تست‌ها به‌عنوان قرارداد ثبت شده است.
 */

/** مبلغِ مالیِ استاندارد سند — رشتهٔ ۲ رقمِ اعشار (numeric(19,2)) */
export const money = (n: number): string => (Math.round(n * 100) / 100).toFixed(2);

/** مبلغ به‌صورت عدد با ۲ رقم اعشار (برای ادامهٔ محاسبه، نه نمایش) */
export const roundMoney2 = (n: number): number => Math.round(n * 100) / 100;

/** قیمتِ واحد — رشتهٔ ۴ رقمِ اعشار (numeric(19,4)) */
export const unitPrice = (n: number): string => (Math.round(n * 10000) / 10000).toFixed(4);

/**
 * مالیاتِ یک قلم — قراردادِ موجودِ سفارش/فاکتور (عیناً حفظ شده):
 *   tax_amount = Math.round(gross × rate_pct) / 100
 * توجه: گرد‌کردن روی حاصل‌ضرب انجام می‌شود، پس نتیجه می‌تواند ۲ رقم اعشار داشته باشد
 * (مثلاً 1620 × 9% ⇒ 14580 ⇒ 145.80). این *رفتارِ موجود* است و تغییرش مبلغِ
 * اسنادِ تاریخی/مرجوعی را عوض می‌کند؛ بنابراین به‌عنوان قرارداد قفل شده است.
 * نرخ ≤ 0 ⇒ صفر. مبنا: مبلغِ پس از تخفیفِ قلم، بدونِ مالیات.
 */
export const lineTax = (grossAfterDiscount: number, ratePct: number): number =>
  ratePct > 0 ? Math.round(grossAfterDiscount * ratePct) / 100 : 0;

/** درصد با ۴ رقم اعشار (numeric(7,4)) */
export const roundPct4 = (n: number): number => Math.round(n * 10000) / 10000;

/** درصد با ۲ رقم اعشار (numeric(5,2)) */
export const roundPct2 = (n: number): number => Math.round(n * 100) / 100;

/** تبدیلِ امنِ رشتهٔ decimal دیتابیس به عدد (null/خالی → صفر) */
export const dec = (v: string | number | null | undefined): number => {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * درصدِ تخفیفِ یک مبلغ نسبت به مبنا (۰ وقتی مبنا صفر است).
 * برای مقایسه با سقف‌ها استفاده می‌شود و ۴ رقم گرد می‌شود.
 */
export const discountPct = (discount: number, base: number): number =>
  base > 0 ? roundPct4((discount / base) * 100) : 0;

/** درصدِ حاشیهٔ سود: (درآمدِ خالص − بهای تمام‌شده) ÷ درآمدِ خالص × ۱۰۰ */
export const marginPct = (netRevenue: number, cost: number): number | null => {
  if (!Number.isFinite(netRevenue) || !Number.isFinite(cost)) return null;
  if (netRevenue === 0) return null; // درآمدِ صفر ⇒ درصد تعریف‌نشده (نه ۰، نه ۱۰۰)
  return roundPct4(((netRevenue - cost) / netRevenue) * 100);
};
