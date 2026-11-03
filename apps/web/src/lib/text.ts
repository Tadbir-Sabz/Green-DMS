/**
 * ابزارهای متنی مشترک برای جست‌وجو در رابط فارسی.
 *
 * جست‌وجوی فارسی بدون نرمال‌سازی عملاً کار نمی‌کند: کاربر «ي» عربی یا «ک»
 * عربی می‌نویسد، نیم‌فاصله می‌گذارد یا از اعراب استفاده می‌کند، درحالی‌که دادهٔ
 * ذخیره‌شده شکل دیگری دارد. این تابع هر دو سمت مقایسه را یکسان می‌کند.
 */

/** یکی‌کردن ی/ک، حذف اعراب و کشیده، و تبدیل نیم‌فاصله به فاصله */
export function normalizeFa(input: string): string {
  return input
    // اعراب، تنوین، سوکون و کشیدهٔ عربی (تطویل)
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    .replace(/[يىئ]/g, "ی")
    .replace(/[كک]/g, "ک")
    // نیم‌فاصله (ZWNJ) و فاصلهٔ نشکن
    .replace(/[\u200c\u200d]/g, " ")
    // ارقام عربی/فارسی → لاتین تا جست‌وجوی عددی هم کار کند
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** آیا `haystack` (پس از نرمال‌سازی) شامل `needle` است؟ */
export function faIncludes(haystack: string, needle: string): boolean {
  const n = normalizeFa(needle);
  if (!n) return true;
  return normalizeFa(haystack).includes(n);
}
