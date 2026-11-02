/**
 * قالب‌بندی اعداد و مبالغ با ارقام فارسی و جداکنندهٔ هزارگان.
 * مبالغ در قرارداد به‌صورت رشتهٔ اعشاری (numeric) هستند؛ این توابع هم رشته و هم
 * عدد را می‌پذیرند و برای مقدار تهی «—» برمی‌گردانند.
 */

/** عدد با ارقام فارسی و جداکنندهٔ هزارگان؛ «—» برای تهی/نامعتبر */
export function formatNumber(v: string | number | null | undefined): string {
  if (v == null || v === '') return '—';
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toLocaleString('fa-IR');
}

/** مبلغ (ریال) — مانند formatNumber با پسوند اختیاری واحد پول */
export function formatMoney(
  v: string | number | null | undefined,
  suffix = '',
): string {
  const base = formatNumber(v);
  if (base === '—') return base;
  return suffix ? `${base} ${suffix}` : base;
}

/** درصد با یک رقم اعشار و ارقام فارسی (ورودی نسبت ۰..۱ یا درصد — با unit مشخص می‌شود) */
export function formatPercent(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v.toLocaleString('fa-IR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}٪`;
}

/** جمع یک ستون رشته‌های اعشاری (بدون از دست دادن دقت با Number روی مقادیر بزرگ) */
export function sumDecimal(values: (string | number | null | undefined)[]): number {
  return values.reduce<number>((acc, v) => {
    const n = v == null || v === '' ? 0 : Number(v);
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
}
