import { createHash } from 'node:crypto';

/**
 * نرمال‌سازیِ قطعیِ مقادیر — طبق PRODUCT_MASTER_TARGET_DESIGN.md §B2 (M-3) و §B (H-1).
 *
 * قواعد (ترتیب اعمال):
 *  1. Unicode NFC
 *  2. تبدیلِ ارقامِ فارسی/عربی → لاتین
 *  3. حذفِ کاراکترهای کنترلی (تا جداکنندهٔ امضای variant غیرقابلِ برخورد بماند)
 *  4. trim فاصله‌های ابتدا/انتها + فشردنِ فاصله‌های داخلی به یک space
 *  5. casefold برای بخشِ لاتین (toLowerCase نزدیکِ casefold برای ASCII/لاتین)
 *
 * برای بارکد: به‌جای فشردن، «همهٔ فاصله‌ها» حذف می‌شوند (اسکن/چاپ با فاصله‌های متناوب).
 */

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const LATIN_DIGITS = '0123456789';

/** ارقامِ فارسی/عربی → لاتین */
export function foldDigits(input: string): string {
  let out = '';
  for (const ch of input) {
    const pi = PERSIAN_DIGITS.indexOf(ch);
    if (pi >= 0) {
      out += LATIN_DIGITS[pi];
      continue;
    }
    const ai = ARABIC_DIGITS.indexOf(ch);
    out += ai >= 0 ? LATIN_DIGITS[ai] : ch;
  }
  return out;
}

/** نرمال‌سازیِ متن (نام، alias، مقدارِ صفت) — قطعی و پایدار */
export function normalizeText(input: string): string {
  return foldDigits(input.normalize('NFC'))
    .replace(/\p{Cc}/gu, '') // حذفِ کاراکترهای کنترلی
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

/** نرمال‌سازیِ بارکد: NFC + ارقامِ لاتین + حذفِ همهٔ فاصله‌ها (H-1) */
export function normalizeBarcode(input: string): string {
  return foldDigits(input.normalize('NFC')).replace(/\s+/g, '');
}

/** توکنِ صریحِ مقدارِ NULL/غایب در امضای variant (هرگز حذفِ محور از امضا) */
export const NULL_VALUE_TOKEN = '∅';

/**
 * نمایشِ canonیکِ عدد: حذفِ صفرهای انتهاییِ بی‌معنی (`1.50` → `1.5`)؛
 * `0.00` → `0`؛ بدونِ نمایشِ نمادی (پایدار برای امضا).
 */
export function canonicalNumber(value: number | string): string {
  const n = typeof value === 'string' ? Number(foldDigits(value.trim())) : value;
  if (!Number.isFinite(n)) return String(value).trim();
  // حذفِ صفرهای انتهایی بدونِ رفتن به نمایشِ علمی
  let s = n.toFixed(10).replace(/\.?0+$/, '');
  if (s === '-0') s = '0';
  return s;
}

/** نرمال‌سازیِ مقدارِ صفت بر اساسِ kind (B2 + B3) */
export function normalizeAttributeValue(
  kind: 'text' | 'number' | 'enum',
  value: string | number | null | undefined,
): string {
  if (value === null || value === undefined || value === '') return NULL_VALUE_TOKEN;
  if (kind === 'number') return canonicalNumber(value as number | string);
  return normalizeText(String(value));
}

/**
 * تولیدِ امضای variant (M-3/B2):
 *  - مرتب‌سازیِ قطعی بر اساسِ def_id
 *  - جفت‌های `def_id=value_norm` با جداکنندهٔ `\u0000` (پس از حذفِ کاراکترهای کنترلی از مقادیر، غیرقابلِ برخورد)
 *  - `variant_signature = sha256(canonical_string)` — الگوریتمِ ثابت
 */
export function variantSignature(
  entries: ReadonlyArray<{ defId: string; valueNorm: string }>,
): string {
  const canonical = [...entries]
    .sort((a, b) => (a.defId < b.defId ? -1 : a.defId > b.defId ? 1 : 0))
    .map((e) => `${e.defId}=${e.valueNorm}`)
    .join('\u0000');
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
