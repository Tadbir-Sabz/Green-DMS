/**
 * TASK-PM-02-C11 — قراردادِ نرمال‌سازیِ «نامزد» (candidate canonical normalization).
 *
 * ⚠️ این ماژول **آزمایشی و غیرفعال** است. هیچ مسیرِ تولیدی (runtime) آن را import
 * نمی‌کند و هیچ رفتارِ فعالی را تغییر نمی‌دهد. تنها مصرف‌کنندهٔ آن تست‌های
 * `test/c11-normalization-contract.test.ts` هستند. فعال‌سازی در تولید یک
 * تصمیمِ جداگانه (C12) است و نیازمندِ تصویبِ مالک است.
 *
 * چرا ماژولِ جدا و نه تغییرِ `product-normalize.ts`؟
 *   توابعِ کنونی در `product-normalize.ts` و `reference-data.rules.ts` و
 *   `apps/web/src/lib/text.ts` در مسیرِ فعال‌اند. تغییرشان «تغییرِ رفتارِ تولید»
 *   است که C11 صریحاً ممنوع کرده. بنابراین قراردادِ نامزد جدا نوشته می‌شود و
 *   تست‌ها هر دو را کنارِ هم می‌سنجند تا شکاف مستند شود.
 *
 * اصولِ طراحی
 *   ۱. قطعی (deterministic): خروجی هیچ‌گاه به locale یا محیط بستگی ندارد.
 *   ۲. سه‌لایه: مقدارِ نمایشی (display) ≠ ورودیِ اصلیِ کاربر (raw) ≠ کلیدِ مقایسه (key).
 *      این ماژول **فقط** کلیدِ مقایسه می‌سازد و هرگز مقدارِ نمایشی را بازنویسی نمی‌کند.
 *   ۳. هر پروفایل جدا و مستقل است؛ «یک تابعِ جهانی برای همه‌چیز» وجود ندارد.
 *   ۴. حذفِ معنادار ممنوع: هیچ رقمِ بارکد، هیچ صفرِ ابتدایی و هیچ شناسهٔ معناداری
 *      حذف نمی‌شود مگر با قاعدهٔ کسب‌وکارِ مستند.
 */

// ---------------------------------------------------------------------------
// ثابت‌های یونیکد (کدپوینت‌ها صریح‌اند تا رفتار مستقل از فایل و ویرایشگر بماند)
// ---------------------------------------------------------------------------
const ZWNJ = '\u200C'; // نیم‌فاصلهٔ فارسی
const ZWJ = '\u200D';
const TATWEEL = '\u0640'; // کشیدهٔ عربی
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const LATIN_DIGITS = '0123456789';

/** اعراب و نشانه‌های ترکیبیِ عربی/فارسی + تطویل */
const DIACRITICS_AND_TATWEEL = /[\u064B-\u0652\u0653-\u0655\u0670\u0640]/g;

export type NormalizationProfileId =
  | 'ProductName'
  | 'ProductNameLatin'
  | 'ProductAlias'
  | 'ProductCode'
  | 'Barcode'
  | 'SearchKey';

export interface ProfileFailure {
  readonly code:
    | 'empty_after_normalization'
    | 'too_long'
    | 'invalid_character'
    | 'invalid_barcode_format'
    | 'barcode_leading_zero_lost';
  readonly message_fa: string;
}

export type ProfileResult<T> =
  | { readonly ok: true; readonly key: T }
  | { readonly ok: false; readonly failure: ProfileFailure };

// ---------------------------------------------------------------------------
// گام‌های اتمی (قابلِ ترکیب، قابلِ تستِ جدا)
// ---------------------------------------------------------------------------

/** ارقامِ فارسی/عربی → لاتین. تنها گامی که همیشه باید اجرا شود. */
export function foldDigits(input: string): string {
  let out = '';
  for (const ch of input) {
    const p = PERSIAN_DIGITS.indexOf(ch);
    if (p >= 0) {
      out += LATIN_DIGITS[p];
      continue;
    }
    const a = ARABIC_DIGITS.indexOf(ch);
    out += a >= 0 ? LATIN_DIGITS[a] : ch;
  }
  return out;
}

/** حذفِ اعراب، تنوین، سکون و تطویل (کشیده) */
export function stripDiacritics(input: string): string {
  return input.replace(DIACRITICS_AND_TATWEEL, '');
}

/**
 * یکسان‌سازیِ حروفِ فارسی/عربی **با تصمیمِ صریح و مستند**.
 *
 * قاعدهٔ کلی: فقط آن جفت‌هایی یکی می‌شوند که در فارسیِ معاصر «یک حرف» شمرده
 * می‌شوند و تفاوتشان صرفاً رسم‌الخطِ عربی/فارسی است.
 *
 * یکی می‌شوند:
 *   ي (U+064A) → ی (U+06CC)      رسم‌الخط
 *   ى (U+0649) → ی (U+06CC)      رسم‌الخط (الفِ مقصوره)
 *   ك (U+0643) → ک (U+06A9)      رسم‌الخط
 *   ة (U+0629) → ه (U+0647)      «ة» در وام‌واژه‌های عربی در فارسی «ه» خوانده می‌شود
 *
 * **یکی نمی‌شوند (تصمیمِ آگاهانه):**
 *   أ (U+0623) ≠ ا    «أ» همزه دارد؛ در نامِ کالا می‌تواند معنادار باشد
 *   إ (U+0625) ≠ ا
 *   آ (U+0622) ≠ ا    «آ» با «ا» در فارسی دو حرفِ متفاوت‌اند (آب ≠ اب)
 *   ؤ (U+0624) ، ئ (U+0626) — همزه‌دار، حفظ می‌شوند
 *
 * دلیلِ کسب‌وکاری: یکسان‌کردنِ «آ/ا» یا «أ/ا» ریسکِ ادغامِ نام‌های واقعاً متفاوت
 * («آب» و «اب»، «أمل» و «امل») را دارد و بازگشت‌پذیر نیست. این موارد به‌جای
 * یکی‌شدن، در لایهٔ «هشدارِ شباهت» (similarity warning) بررسی می‌شوند.
 */
export function foldPersianLetterVariants(input: string): string {
  return input
    .replace(/\u064A/g, '\u06CC') // ي → ی
    .replace(/\u0649/g, '\u06CC') // ى → ی
    .replace(/\u0643/g, '\u06A9') // ك → ک
    .replace(/\u0629/g, '\u0647'); // ة → ه
}

/** نیم‌فاصله/ZWJ/انواعِ فاصلهٔ یونیکد → یک فاصلهٔ سادهٔ ASCII */
export function normalizeSpaceCharacters(input: string): string {
  return input
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, ' ') // ZWSP, ZWNJ, ZWJ, BOM
    .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ') // NBSP و فاصله‌های یونیکد
    .replace(/[\t\n\r\f\v]/g, ' ');
}

/**
 * یکسان‌سازیِ نشانه‌گذاری.
 *
 * فقط نشانه‌هایی که در فارسی «همان نقش» را دارند و تفاوتشان رسم‌الخط است.
 * پرانتز/گیومه عمداً دست‌نخورده می‌مانند چون می‌توانند بخشی از نامِ رسمیِ کالا
 * باشند (مثلاً «روغن (۵ لیتری)»).
 */
export function foldPunctuation(input: string): string {
  return input
    .replace(/[\u060C\u061B]/g, ',') // ، عربی و ؛ → ,
    .replace(/[\u061F]/g, '?') // ؟ → ?
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-') // انواعِ خطِ تیره → -
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D\u00AB\u00BB]/g, '"');
}

/** فشردنِ فاصله‌های تکراری + trim */
export function collapseWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

/** کوچک‌کردنِ حروف به‌شکلِ قطعی و مستقل از locale */
export function deterministicLowercase(input: string): string {
  // toLowerCase در JS مستقل از locale است (برخلاف toLocaleLowerCase).
  // برای اطمینانِ بیشتر، فقط بر اساسِ Unicode Default Case Conversion کار می‌کند.
  return input.toLowerCase();
}

/** اعتبارسنجیِ کاراکترهای مجاز (کنترل‌کاراکترها همیشه حذف می‌شوند) */
function stripControlCharacters(input: string): string {
  // eslint-disable-next-line no-control-regex
  return input.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
}

// ---------------------------------------------------------------------------
// هستهٔ مشترک: NFC + حذفِ کنترلی (پایهٔ همهٔ پروفایل‌ها)
// ---------------------------------------------------------------------------
/** ترتیب مهم است: ابتدا فاصله‌های ویژه به space تبدیل می‌شوند تا \t و \n
 *  «حذف» نشوند؛ سپس باقیِ کاراکترهای کنترلی حذف می‌شوند. */
function baseNormalize(input: string): string {
  return stripControlCharacters(normalizeSpaceCharacters(input.normalize('NFC')));
}

// ---------------------------------------------------------------------------
// پروفایل‌ها
// ---------------------------------------------------------------------------

/**
 * ProductName — کلیدِ مقایسهٔ **نامِ فارسیِ کالا**.
 * حروفِ رسم‌الخطی یکی می‌شوند، اعراب حذف، فاصله/نشانه یکسان، حروف کوچک.
 * همزه‌دارها و «آ» حفظ می‌شوند (نگاه به `foldPersianLetterVariants`).
 */
export function productNameKey(input: string): ProfileResult<string> {
  const raw = typeof input === 'string' ? input : '';
  let s = baseNormalize(raw);
  s = foldDigits(s);
  s = stripDiacritics(s);
  s = foldPersianLetterVariants(s);
  s = normalizeSpaceCharacters(s);
  s = foldPunctuation(s);
  s = collapseWhitespace(s);
  s = deterministicLowercase(s);
  if (!s) return { ok: false, failure: { code: 'empty_after_normalization', message_fa: 'نام پس از نرمال‌سازی خالی است.' } };
  if ([...s].length > 255) return { ok: false, failure: { code: 'too_long', message_fa: 'نام بیش از ۲۵۵ نویسه است.' } };
  return { ok: true, key: s };
}

/**
 * ProductNameLatin — کلیدِ مقایسهٔ نامِ لاتین.
 *
 * تفاوتِ عمدی با ProductName:
 *   - NFKC اعمال می‌شود تا حروفِ تمام‌عرضِ لاتین (`ＡＢＣ`) به نیم‌عرض (`abc`) برسند؛
 *     این برای لاتین ایمن است چون «هم‌ارزیِ سازگاری» در لاتین معنای نمایشیِ یکسان دارد.
 *   - حروفِ فارسی/عربی دست‌نخورده می‌مانند (این پروفایل برای لاتین است، ولی اگر
 *     کاربر متنِ فارسی وارد کند، ما آن را خراب نمی‌کنیم).
 */
export function productNameLatinKey(input: string): ProfileResult<string> {
  const raw = typeof input === 'string' ? input : '';
  let s = stripControlCharacters(normalizeSpaceCharacters(raw.normalize('NFKC')));
  s = foldDigits(s);
  s = collapseWhitespace(s);
  s = deterministicLowercase(s);
  if (!s) return { ok: false, failure: { code: 'empty_after_normalization', message_fa: 'نام لاتین پس از نرمال‌سازی خالی است.' } };
  if ([...s].length > 255) return { ok: false, failure: { code: 'too_long', message_fa: 'نام لاتین بیش از ۲۵۵ نویسه است.' } };
  return { ok: true, key: s };
}

/**
 * ProductAlias — کلیدِ مقایسهٔ نام جایگزین.
 *
 * **مهم‌ترین تفاوت با ProductName:** نشانه‌گذاری حذف نمی‌شود، فقط یکسان می‌شود.
 * دلیل: نام جایگزین نوعِ `code` (کد قدیمی/تأمین‌کننده) در اسکن استفاده می‌شود و
 * حذفِ `-` یا `.` می‌تواند دو کدِ متفاوت را یکی کند. پس خطِ تیره و نقطه حفظ
 * می‌شوند (فقط انواعِ مختلفِ خطِ تیره به یک شکل می‌رسند).
 */
export function productAliasKey(input: string): ProfileResult<string> {
  const raw = typeof input === 'string' ? input : '';
  let s = baseNormalize(raw);
  s = foldDigits(s);
  s = stripDiacritics(s);
  s = foldPersianLetterVariants(s);
  s = normalizeSpaceCharacters(s);
  s = foldPunctuation(s);
  s = collapseWhitespace(s);
  s = deterministicLowercase(s);
  if (!s) return { ok: false, failure: { code: 'empty_after_normalization', message_fa: 'نام جایگزین پس از نرمال‌سازی خالی است.' } };
  if ([...s].length > 255) return { ok: false, failure: { code: 'too_long', message_fa: 'نام جایگزین بیش از ۲۵۵ نویسه است.' } };
  return { ok: true, key: s };
}

/** الگوی کدِ کالا: حروف/ارقام لاتین + `-` و `_` و `.` (پس از نرمال‌سازی) */
const PRODUCT_CODE_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

/**
 * ProductCode — کلیدِ مقایسهٔ کدِ کالا.
 *
 * تصمیم‌های عمدی:
 *   - ارقامِ فارسی/عربی → لاتین (وگرنه `۱۲۳` و `123` دو کدِ متفاوت می‌شوند).
 *   - حروف کوچک می‌شوند (امروز `uq_product_code` روی `(company_id, code)` **case-sensitive**
 *     است ولی جست‌وجو با `lower(code)` انجام می‌شود ⇒ ناسازگاریِ موجود).
 *   - **صفرِ ابتدایی حفظ می‌شود** (`007` ≠ `7`).
 *   - فاصله‌ها حذف می‌شوند **فقط** از دو سر؛ فاصلهٔ داخلی ⇒ نامعتبر (کدِ کالا نباید فاصله داشته باشد).
 *   - کاراکترِ غیرمجاز ⇒ خطای صریح، نه حذفِ بی‌صدا.
 */
export function productCodeKey(input: string): ProfileResult<string> {
  const raw = typeof input === 'string' ? input : '';
  let s = baseNormalize(raw);
  s = foldDigits(s);
  s = normalizeSpaceCharacters(s).trim();
  s = deterministicLowercase(s);
  if (!s) return { ok: false, failure: { code: 'empty_after_normalization', message_fa: 'کد کالا خالی است.' } };
  if (s.includes(' ')) {
    return { ok: false, failure: { code: 'invalid_character', message_fa: 'کد کالا نباید فاصلهٔ داخلی داشته باشد.' } };
  }
  if (!PRODUCT_CODE_PATTERN.test(s)) {
    return { ok: false, failure: { code: 'invalid_character', message_fa: 'کد کالا فقط می‌تواند شاملِ حروف/ارقام لاتین و - _ . باشد.' } };
  }
  if (s.length > 64) return { ok: false, failure: { code: 'too_long', message_fa: 'کد کالا بیش از ۶۴ نویسه است.' } };
  return { ok: true, key: s };
}

/**
 * Barcode — کلیدِ مقایسهٔ بارکد.
 *
 * تصمیم‌های عمدی و **حساس**:
 *   - همهٔ فاصله‌ها حذف می‌شوند (فاصله در بارکد هرگز معنادار نیست؛ فقط از هم‌پوشانیِ چاپ می‌آید).
 *   - انواعِ خطِ تیره حذف می‌شوند (نمایشی‌اند). مثال: `123-456` → `123456`.
 *     ⚠️ این یک **قاعدهٔ کسب‌وکار** است و در قرارداد مستند شده: خطِ تیره در بارکد
 *     جداکنندهٔ گروهی است، نه بخشی از ارزش.
 *   - **صفرِ ابتدایی هرگز حذف نمی‌شود**: `007` یک بارکدِ متفاوت از `7` است.
 *     (حذفِ صفرِ ابتدایی یک خطای رایج و فاجعه‌بار در انبار است.)
 *   - ارقامِ فارسی/عربی → لاتین.
 *   - حروف کوچک می‌شوند (بارکدهای alphanumeric مثلِ کدِ داخلی).
 *   - کاراکترِ غیرمجاز ⇒ خطای صریح.
 */
export function barcodeKey(input: string): ProfileResult<string> {
  const raw = typeof input === 'string' ? input : '';
  let s = baseNormalize(raw);
  s = foldDigits(s);
  s = normalizeSpaceCharacters(s).replace(/ /g, '');
  s = s.replace(/[\u2010-\u2015\u2212-]/g, ''); // انواعِ خطِ تیره و خطِ تیرهٔ ساده
  s = deterministicLowercase(s);
  if (!s) return { ok: false, failure: { code: 'empty_after_normalization', message_fa: 'بارکد خالی است.' } };
  if (!/^[a-z0-9]+$/.test(s)) {
    return { ok: false, failure: { code: 'invalid_character', message_fa: 'بارکد فقط می‌تواند شاملِ حروف/ارقام لاتین باشد.' } };
  }
  if (s.length > 64) return { ok: false, failure: { code: 'too_long', message_fa: 'بارکد بیش از ۶۴ نویسه است.' } };
  return { ok: true, key: s };
}

/**
 * SearchKey — کلیدِ جست‌وجوی آزاد (کاربر هرچه می‌نویسد).
 *
 * تفاوتِ عمدی: **تهاجمی‌ترین** پروفایل است، چون فقط برای «پیدا کردن» است و
 * نتیجه‌اش هیچ‌گاه مستقیماً یکتایی یا رد/قبول را تعیین نمی‌کند.
 *   - همهٔ گام‌های ProductName، به‌علاوهٔ NFKC (تا حروفِ تمام‌عرض هم پیدا شوند)
 *     و حذفِ نشانه‌گذاری (تا `123-456` و `123456` هر دو پیدا شوند).
 *   - خروجیِ خالی مجاز است (یعنی «بدونِ فیلتر») — برای جست‌وجو خطا نیست.
 */
export function searchKey(input: string): ProfileResult<string> {
  const raw = typeof input === 'string' ? input : '';
  let s = stripControlCharacters(normalizeSpaceCharacters(raw.normalize('NFKC')));
  s = foldDigits(s);
  s = stripDiacritics(s);
  s = foldPersianLetterVariants(s);
  s = foldPunctuation(s);
  // نشانه‌گذاری → فاصله (نه حذف): تا «ABC-12» به «abc 12» برسد و واژه‌ها به هم نچسبند.
  s = s.replace(/[.,'"?!:;/\\()[\]{}-]/g, ' ');
  s = collapseWhitespace(s);
  s = deterministicLowercase(s);
  return { ok: true, key: s };
}

// ---------------------------------------------------------------------------
// ثبتِ پروفایل‌ها (برای مستندسازی و تستِ یکنواختی)
// ---------------------------------------------------------------------------
export interface ProfileSpec {
  readonly id: NormalizationProfileId;
  readonly unicode_form: 'NFC' | 'NFKC' | 'none';
  readonly folds_digits: boolean;
  readonly folds_persian_letters: boolean;
  readonly strips_diacritics: boolean;
  readonly normalizes_space_chars: boolean;
  readonly folds_punctuation: boolean;
  readonly removes_punctuation: boolean;
  readonly lowercases: boolean;
  readonly empty_allowed: boolean;
  readonly preserves_leading_zeros: boolean;
  readonly used_in_uniqueness: boolean;
}

export const PROFILE_SPECS: readonly ProfileSpec[] = Object.freeze([
  { id: 'ProductName', unicode_form: 'NFC', folds_digits: true, folds_persian_letters: true, strips_diacritics: true, normalizes_space_chars: true, folds_punctuation: true, removes_punctuation: false, lowercases: true, empty_allowed: false, preserves_leading_zeros: true, used_in_uniqueness: false },
  { id: 'ProductNameLatin', unicode_form: 'NFKC', folds_digits: true, folds_persian_letters: false, strips_diacritics: false, normalizes_space_chars: true, folds_punctuation: false, removes_punctuation: false, lowercases: true, empty_allowed: false, preserves_leading_zeros: true, used_in_uniqueness: false },
  { id: 'ProductAlias', unicode_form: 'NFC', folds_digits: true, folds_persian_letters: true, strips_diacritics: true, normalizes_space_chars: true, folds_punctuation: true, removes_punctuation: false, lowercases: true, empty_allowed: false, preserves_leading_zeros: true, used_in_uniqueness: true },
  { id: 'ProductCode', unicode_form: 'NFC', folds_digits: true, folds_persian_letters: false, strips_diacritics: false, normalizes_space_chars: true, folds_punctuation: false, removes_punctuation: false, lowercases: true, empty_allowed: false, preserves_leading_zeros: true, used_in_uniqueness: true },
  { id: 'Barcode', unicode_form: 'NFC', folds_digits: true, folds_persian_letters: false, strips_diacritics: false, normalizes_space_chars: true, folds_punctuation: false, removes_punctuation: true, lowercases: true, empty_allowed: false, preserves_leading_zeros: true, used_in_uniqueness: true },
  { id: 'SearchKey', unicode_form: 'NFKC', folds_digits: true, folds_persian_letters: true, strips_diacritics: true, normalizes_space_chars: true, folds_punctuation: true, removes_punctuation: true, lowercases: true, empty_allowed: true, preserves_leading_zeros: true, used_in_uniqueness: false },
]);

export const PROFILE_FUNCTIONS: Readonly<Record<NormalizationProfileId, (input: string) => ProfileResult<string>>> = Object.freeze({
  ProductName: productNameKey,
  ProductNameLatin: productNameLatinKey,
  ProductAlias: productAliasKey,
  ProductCode: productCodeKey,
  Barcode: barcodeKey,
  SearchKey: searchKey,
});

/** اجرای یک پروفایل با شناسه (برای تستِ پارامتری) */
export function keyFor(profile: NormalizationProfileId, input: string): ProfileResult<string> {
  return PROFILE_FUNCTIONS[profile](input);
}
