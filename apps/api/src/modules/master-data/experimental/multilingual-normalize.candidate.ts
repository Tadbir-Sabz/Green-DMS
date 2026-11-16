/**
 * TASK-PM-02-C14-IDENTITY-INTEGRITY-02 — نرمال‌سازیِ چندزبانه/فارسی.
 *
 * ⚠️ **آزمایشی و غیرفعال (inert).** هیچ مسیرِ تولیدی این ماژول را import نمی‌کند.
 * این ماژول **فقط کلیدِ مقایسه** می‌سازد؛ هرگز مقدارِ ذخیره‌شده را بازنویسی نمی‌کند.
 *
 * سه لایهٔ عمداً جدا (هرگز نباید با هم ادغام شوند):
 *  ۱. `storedIdentifierKey` — کلیدِ یکتابودن/مقایسه برای شناسهٔ ذخیره‌شده (کد کالا، alias، نام).
 *     تلاش می‌کند دو شیوهٔ نوشتارِ رایجِ فارسی را یکسان ببیند: ک↔ك، ی↔ي، ارقام، فضا، حروفِ کنترلی.
 *  ۲. `searchKey` — برای جستجوی کاربر: لایهٔ ۱ به‌علاوهٔ حذفِ تطویل (ـ / ّZWNJ) و اعراب/تشدید/حرکت‌ها.
 *  ۳. `uniquenessPolicyFor(field)` — نقشۀ صریحِ فیلد → لایهٔ مجاز. «سیاستِ یکتایی» تصمیم مالک است؛
 *     این نقشه فقط مستند می‌کند کدام لایه برای کدام فیلد *به کار می‌رود*، نه اینکه کدام یکتایی درست است.
 *
 * قواعد سخت:
 *  - این توابع روی ورودی چیزی نمی‌نویسند؛ خروجی کلیدِ مقایسه است.
 *  - idempotent: apply(apply(x)) === apply(x) برای هر دو تابع.
 *  - هیچ تبدیلِ بی‌سروصدا روی متنِ لاتین انجام نمی‌شود جز casefold/NFKCِ امن.
 *  - ZWNJ در شناسهٔ ذخیره‌شده **حذف نمی‌شود** (معنا دارد)؛ فقط در searchKey برداشته می‌شود.
 */

import { foldDigits } from '../product-normalize';

const ARABIC_KEH = 'ك';
const ARABIC_YEH = 'ي';
const PERSIAN_KEH = 'ک';
const PERSIAN_YEH = 'ی';
const ARABIC_HEH_GOAL = 'ة';
const ARABIC_HEH = 'ه';

/** کاراکترهای «همسان‌نمایِ رایج» — فقط همان‌هایی که کاربر فارسی/عربی مرتب می‌سازد */
function foldArabicLetters(input: string): string {
  let out = '';
  for (const ch of input) {
    switch (ch) {
      case ARABIC_KEH:
        out += PERSIAN_KEH;
        break;
      case ARABIC_YEH:
        out += PERSIAN_YEH;
        break;
      case ARABIC_HEH_GOAL:
        out += ARABIC_HEH;
        break;
      default:
        out += ch;
    }
  }
  return out;
}

/** حذفِ همهٔ کاراکترهای کنترلی و قالب‌بندی (از جمله ZWNJ برای شناسه حذف نمی‌شود — فقط در searchKey) */
const CONTROL_AND_FORMAT = /[\p{Cc}\p{Cf}]/gu;
/** تطویل/کشیده — همیشه در هر دو لایه حذف می‌شود (هیچ معنای فونتیک ندارد) */
const TATWEEL = /\u0640/g;
const ZWNJ_ZWJ = /[\u200C\u200D]/g;
/** اعراب/تشدید/حرکت‌های عربی (fathatan..sukun + superscript alef + Quranic marks) */
const ARABIC_DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g;

/** لایهٔ پایهٔ مشترک: NFC → ارقام → تطویل → حروف کنترل/قالب → فضا → casefold → کاف/ی/ة */
function baseLayer(input: string, dropZwnjZwj: boolean): string {
  let s = foldDigits(input.normalize('NFC'));
  s = s.replace(TATWEEL, '');
  if (dropZwnjZwj) s = s.replace(ZWNJ_ZWJ, '');
  // ZWNJ/ZWJ (U+200C/D) جزو Cf هستند ولی در فارسی معنا دارند؛ برای شناسهٔ ذخیره‌شده حفظ می‌شوند
  if (!dropZwnjZwj) {
    s = s.replace(/\p{Cc}/gu, '');
    s = s.replace(/\p{Cf}/gu, (ch) => (ch === '\u200C' || ch === '\u200D' ? ch : ''));
  } else {
    s = s.replace(CONTROL_AND_FORMAT, '');
  }
  return foldArabicLetters(
    s
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase(),
  );
}

export interface NormalizedValue {
  /** کلیدِ مقایسه (هرگز به‌عنوان مقدار ذخیره نمی‌شود) */
  readonly key: string;
  /** آیا ورودی چیزی از دست رفته/تغییر کرده؟ (برای گزارش، نه اعمال) */
  readonly changed: boolean;
  /** کاراکترهایی که حذف شدند (تعداد) — فقط جهت گزارش */
  readonly removed_count: number;
}

function wrap(input: string, dropZwnjZwj: boolean): NormalizedValue {
  const key = baseLayer(input, dropZwnjZwj);
  const removed = Math.max(0, [...input].length - [...key].length);
  return { key, changed: key !== input || removed > 0, removed_count: removed };
}

/**
 * کلیدِ شناسهٔ ذخیره‌شده (برای مقایسهٔ یکتایی/برابری).
 * ZWNJ حفظ می‌شود چون در کلمات فارسی معنادار است («می‌روم» ≠ «میروم» برای اسم).
 */
export function storedIdentifierKey(value: string): NormalizedValue {
  return wrap(value, false);
}

/**
 * کلیدِ جستجوی کاربر: لایهٔ پایهٔ شناسه + حذفِ ZWNJ/ZWJ و اعراب/تشدید.
 * برای انطباقِ «می روم»، «می‌روم»، «میرم» با هم.
 */
export function searchKey(value: string): NormalizedValue {
  const base = storedIdentifierKey(value).key;
  const key = foldArabicLetters(
    base.replace(ZWNJ_ZWJ, '').replace(ARABIC_DIACRITICS, ''),
  )
    .trim()
    .replace(/\s+/g, ' ');
  return { key, changed: key !== value, removed_count: Math.max(0, [...value].length - [...key].length) };
}

export type MultilingualField =
  | 'product_code'
  | 'alias'
  | 'barcode'
  | 'packaging_barcode'
  | 'variant_signature'
  | 'name'
  | 'name_latin'
  | 'attribute_text';

export type MultilingualLayer = 'stored_identifier' | 'search' | 'exact_canonical';

/**
 * نقشۀ صریحِ فیلد → لایهٔ مجاز. «policy» به معنای «این فیلد این‌گونه مقایسه می‌شود» است،
 * نه «این تصمیم مالک گرفته شده». بارکد/امضا هرگز از مسیرِ متن عبور نمی‌کنند.
 */
export const FIELD_KEY_POLICY: Readonly<Record<MultilingualField, MultilingualLayer>> = Object.freeze({
  product_code: 'stored_identifier',
  alias: 'stored_identifier',
  barcode: 'exact_canonical', // normalizeBarcode/scan_pad — جدا از متن
  packaging_barcode: 'exact_canonical',
  variant_signature: 'exact_canonical', // sha256 — هرگز نرمال نمی‌شود
  name: 'search',
  name_latin: 'search',
  attribute_text: 'search',
});

export function uniquenessPolicyFor(field: MultilingualField): MultilingualLayer {
  return FIELD_KEY_POLICY[field];
}

/** کلیدِ مقایسهٔ یکتایی برای فیلدهای متنی؛ برای بارکد/امضا null (یعنی «این لایه به درد آن فیلد نمی‌خورد») */
export function comparisonKeyFor(field: MultilingualField, value: string): NormalizedValue | null {
  const layer = FIELD_KEY_POLICY[field];
  if (layer === 'exact_canonical') return null;
  if (layer === 'search') return searchKey(value);
  return storedIdentifierKey(value);
}
