/**
 * TASK-PM-02-C13 — قراردادِ مقایسهٔ بین‌میدانیِ هویت (Cross-Field Identity Resolution).
 *
 * ⚠️ **آزمایشی و غیرفعال.** هیچ مسیرِ تولیدی این ماژول را import نمی‌کند.
 * تنها مصرف‌کنندگان: ماژول‌های دیگرِ `experimental/` و تست‌های `test/c13-*.test.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * مسئله‌ای که این ماژول حل می‌کند (یافتهٔ CF-10 در C12)
 * ─────────────────────────────────────────────────────────────────────────────
 * C12 نشان داد اگر هر میدان را با پروفایلِ خودش نرمال کنیم و بعد کلیدها را مقایسه
 * کنیم، **برخوردهای بین‌میدانیِ واقعی از دست می‌روند**:
 *
 *   alias  «400 111» → پروفایلِ ProductAlias → «400 111»   (فاصله حفظ می‌شود)
 *   barcode «400111» → پروفایلِ Barcode      → «400111»    (فاصله حذف می‌شود)
 *
 * دو کلیدِ متفاوت ⇒ هیچ گروهی ساخته نمی‌شود ⇒ برخورد دیده نمی‌شود. در حالی که در
 * **اسکنِ واقعی** هر دو به «400111» می‌رسند و ابهامِ عملیاتی می‌سازند.
 *
 * C12 این را با یک «گذرِ مخصوصِ alias↔barcode» وصله کرد. آن وصله تعمیم‌پذیر نبود:
 * هر جفت‌میدانِ تازه یک وصلهٔ تازه می‌خواست و هیچ‌جا ثبت نمی‌شد که کدام جفت‌ها اصلاً
 * *باید* مقایسه شوند و کدام نه.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * راه‌حل: «فضای مقایسه» + «قراردادِ جفت»
 * ─────────────────────────────────────────────────────────────────────────────
 * نرمال‌سازیِ **میدانی** دست نمی‌خورد (C11 آن را قفل کرده است). به‌جایش برای هر
 * *مقایسه* یک فضای مشترکِ صریح تعریف می‌شود که **هر دو طرف** با همان تبدیلِ یکسان
 * به آن برده می‌شوند. تقارن تضمین است چون تابع به میدان وابسته نیست.
 *
 *   فضا      معنا                                  استفاده
 *   ───────  ─────────────────────────────────────  ────────────────────────
 *   field    پروفایلِ اختصاصیِ هر میدان (C11)      مقایسهٔ هم‌میدانی
 *   scan     آنچه یک بارکدخوان resolve می‌کند      بارکد و هم‌ریشه‌هایش
 *   alnum    آنچه یک جست‌وجوی کد resolve می‌کند    کد و هم‌ریشه‌هایش
 *   text     فضای جست‌وجوی متنی (SearchKey)        متن ↔ متن
 *
 * سپس یک **جدولِ اعلانی** می‌گوید برای هر جفت‌میدان: آیا مقایسه واجدِ شرایط است؟
 * در کدام فضا؟ و نتیجهٔ آن در صورتِ برخورد چه تصمیمی می‌گیرد؟
 *
 * این جدول پاسخِ صریح به «آیا هر شباهتِ متنی تعارضِ سخت است؟» می‌دهد: **نه.**
 * جفت‌هایی مثلِ name↔barcode اصلاً «قابلِ مقایسه» نیستند و اگر تصادفاً در یک فضا
 * یکی شوند، نتیجه `NOT_COMPARABLE` است، نه `HARD_CONFLICT`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * اصولِ غیرقابلِ‌مذاکره
 * ─────────────────────────────────────────────────────────────────────────────
 *   ۱. **هیچ داده‌ای تغییر نمی‌کند** — فقط خواندن و ساختِ کلید.
 *   ۲. **هیچ کالایی ادغام، هیچ alias‌ای حذف، هیچ شناسه‌ای بازنویسی نمی‌شود.**
 *   ۳. **مرزِ شرکت مقدس است.** مقایسهٔ بین‌شرکتی هرگز مقدارِ نمایشیِ شرکتِ دیگر را
 *      برنمی‌گرداند و هرگز RLS را تضعیف نمی‌کند.
 *   ۴. **قطعیت.** همان ورودی ⇒ همان شناسه‌های پایدار، در هر ترتیبی.
 */

import {
  keyFor,
  type NormalizationProfileId,
  type ProfileFailure,
  type ProfileResult,
} from './product-identity-normalization.candidate';

/** نسخهٔ قراردادِ مقایسه. هر تغییرِ معنایی در جدول یا فضاها این را بالا می‌برد. */
export const COMPARISON_CONTRACT_VERSION = 'c13.1';

/** نسخهٔ پروفایل‌های نرمال‌سازی که این قرارداد بر آن سوار است (C11). */
export const UNDERLYING_NORMALIZATION_VERSION = 'c11.1';

// ---------------------------------------------------------------------------
// انواعِ پایه
// ---------------------------------------------------------------------------

export const IDENTITY_FIELDS = ['name', 'name_latin', 'alias', 'code', 'barcode'] as const;
export type IdentityField = (typeof IDENTITY_FIELDS)[number];

export const COMPARISON_SPACES = ['field', 'scan', 'alnum', 'text'] as const;
export type ComparisonSpaceId = (typeof COMPARISON_SPACES)[number];

/** واژگانِ تصمیم — دقیقاً پنج مقدارِ خواسته‌شده، نه بیشتر. */
export const DECISIONS = [
  'HARD_CONFLICT',
  'SOFT_CONFLICT',
  'MANUAL_REVIEW',
  'ALLOWED',
  'NOT_COMPARABLE',
] as const;
export type Decision = (typeof DECISIONS)[number];

export type Confidence = 'high' | 'medium' | 'low';
export type CollisionSeverity = 'hard' | 'soft' | 'review' | 'none';

/** میدان ← پروفایل. یک‌به‌یک و صریح؛ همان نگاشتِ C11/C12. */
export const FIELD_TO_PROFILE: Readonly<Record<IdentityField, NormalizationProfileId>> = Object.freeze({
  name: 'ProductName',
  name_latin: 'ProductNameLatin',
  alias: 'ProductAlias',
  code: 'ProductCode',
  barcode: 'Barcode',
});

/** یک ردیفِ هویتی. `domain_id` اختیاری است و پیش‌فرضش `company_id` است. */
export interface IdentityRow {
  readonly entity_id: string;
  readonly company_id: string;
  /** دامنهٔ کسب‌وکار درونِ شرکت (اختیاری). پیش‌فرض: `company_id` */
  readonly domain_id?: string;
  readonly field: IdentityField;
  /** مقدارِ اصلی که کاربر می‌بیند — **هرگز بازنویسی نمی‌شود** */
  readonly display_value: string;
  /** مقدارِ نرمال‌شدهٔ **فعلیِ** ذخیره‌شده (alias_norm / barcode / code خام) */
  readonly stored_normalized: string;
  readonly source_ref: string;
}

// ---------------------------------------------------------------------------
// فضاهای مقایسه — تقارنِ کامل (تابع به میدان وابسته نیست)
// ---------------------------------------------------------------------------

export interface SpaceResult {
  readonly ok: boolean;
  readonly key: string | null;
  readonly reason: string | null;
}

const SPACE_FAIL = (reason: string): SpaceResult => ({ ok: false, key: null, reason });

/**
 * جداکننده‌های «قالب‌بندی»: فاصله‌ها، نشانه‌گذاری و نمادهای رایج.
 *
 * این‌ها در بارکد/کد صرفاً نمایشی‌اند و هویتِ شناسه را نمی‌سازند. کاراکترهای واقعاً
 * بیگانه (CJK، ایموجی) **حذف نمی‌شوند** — با `invalid_character` صریحاً رد می‌شوند
 * تا هرگز سکوت نکنیم.
 *
 * ⚠️ درسِ گرفته‌شده: نسخهٔ اول یک بازهٔ کاراکتریِ تودرتو در کلاس داشت که ترتیبِ
 * جایگزینی را در فراخوانیِ مکرر غیرقطعی می‌کرد. اکنون کلاس ساده و صریح است و
 * تستِ «همان ورودی ⇒ همان خروجی» آن را قفل می‌کند.
 */
const SEPARATOR_RE = /[\s\u200B_.\-\/\\|:;,+=*#!?@$%^&~`'"()[\]{}<>]+/g;

/** ارقامِ فارسی/عربی → لاتین، با **حفظِ** صفرِ ابتدایی */
function foldDigitsKeepZeros(s: string): string {
  return s
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/**
 * فضای **scan** — آن چیزی که یک بارکدخوان resolve می‌کند.
 *
 * NFKC → ارقامِ لاتین → حروفِ کوچک → **حذفِ همهٔ جداکننده‌ها**.
 * صفرِ ابتدایی **هرگز** حذف نمی‌شود (پیش‌فرضِ محافظه‌کارانهٔ C11، تصمیمِ باز D-C11-1).
 *
 * ⚠️ ترتیب مهم است: اول جداکننده‌ها حذف، بعد خالی‌بودن سنجیده می‌شود. اگر برعکس
 * بود، ورودیِ صرفاً جداکننده مثلِ «!!!» پیامِ گمراه‌کنندهٔ «کاراکترِ نامعتبر»
 * می‌گرفت به جایِ «خالی پس از نرمال‌سازی».
 */
export function scanSpace(input: string): SpaceResult {
  const base = foldDigitsKeepZeros(String(input).normalize('NFKC')).toLowerCase();
  const key = base.replace(SEPARATOR_RE, '');
  if (key.length === 0) return SPACE_FAIL('empty_after_normalization');
  if (key.length > 128) return SPACE_FAIL('too_long');
  if (!/^[a-z0-9\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+$/.test(key)) {
    return SPACE_FAIL('invalid_character');
  }
  return { ok: true, key, reason: null };
}

/**
 * فضای **alnum** — آن چیزی که یک جست‌وجوی «کدِ کالا» resolve می‌کند.
 *
 * تفاوتِ عمدی با `scan`: فاصلهٔ **درونی** حفظ می‌شود (به فاصلهٔ تک تبدیل می‌شود)
 * ولی نشانه‌گذاریِ قالب‌بندی حذف می‌شود. یعنی `AB-12` ≡ `AB 12` ولی `AB12` جدا است.
 * دلیل: در کدِ کالا فاصله اغلب جداکنندهٔ معنادار است، در بارکد نیست.
 */
export function alnumSpace(input: string): SpaceResult {
  const base = foldDigitsKeepZeros(String(input).normalize('NFKC')).toLowerCase();
  const key = base
    .replace(/[_.\-\/\\|:;,+=*#!?@$%^&~`'"()[\]{}<>]+/g, ' ')
    .replace(/[\s\u200B]+/g, ' ')
    .trim();
  if (key.length === 0) return SPACE_FAIL('empty_after_normalization');
  if (key.length > 128) return SPACE_FAIL('too_long');
  if (!/^[a-z0-9\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF ]+$/.test(key)) {
    return SPACE_FAIL('invalid_character');
  }
  return { ok: true, key, reason: null };
}

/**
 * فضای **text** — فضای جست‌وجوی متنی؛ از `SearchKey` در C11 استفاده می‌کند.
 *
 * NFC، اعراب و تطویل حذف، ي/ك/ى/ة یکسان، نیم‌فاصله → فاصله، نشانه‌گذاری → جداکننده،
 * حروف کوچک. **آ/أ/إ عمداً متمایز می‌مانند** (D-C11-2 تصویب‌نشده است).
 */
export function textSpace(input: string): SpaceResult {
  const r = keyFor('SearchKey', input) as ProfileResult<string>;
  if (r.ok) return { ok: true, key: r.key, reason: null };
  const f = (r as { failure: ProfileFailure }).failure;
  return SPACE_FAIL(f?.code ?? 'unknown');
}

/**
 * فضای **field** — پروفایلِ اختصاصیِ میدان. فقط برای مقایسهٔ هم‌میدانی.
 * این‌جا — و فقط این‌جا — تبدیل به میدان وابسته است، چون معنای خودِ میدان باید حفظ شود.
 */
export function fieldSpace(field: IdentityField, input: string): SpaceResult {
  const r = keyFor(FIELD_TO_PROFILE[field], input) as ProfileResult<string>;
  if (r.ok) return { ok: true, key: r.key, reason: null };
  const f = (r as { failure: ProfileFailure }).failure;
  return SPACE_FAIL(f?.code ?? 'unknown');
}

/** کلیدِ یک مقدار در یک فضای مشخص */
export function comparisonKey(
  space: ComparisonSpaceId,
  field: IdentityField,
  input: string,
): SpaceResult {
  switch (space) {
    case 'field':
      return fieldSpace(field, input);
    case 'scan':
      return scanSpace(input);
    case 'alnum':
      return alnumSpace(input);
    case 'text':
      return textSpace(input);
    default:
      throw new Error(`unknown comparison space: ${String(space)}`);
  }
}

// ---------------------------------------------------------------------------
// قواعد — هم‌میدانی و بین‌میدانی
// ---------------------------------------------------------------------------

export interface ComparisonRule {
  readonly rule_id: string;
  readonly fields: readonly [IdentityField, IdentityField];
  readonly kind: 'same_field' | 'cross_field' | 'scope';
  readonly space: ComparisonSpaceId | null;
  readonly decision: Decision;
  readonly severity: CollisionSeverity;
  readonly confidence: Confidence;
  /** ۰ = کاملاً روشن · ۱ = کاملاً مبهم */
  readonly ambiguity: number;
  readonly explanation_fa: string;
  readonly recommended_resolution_fa: string;
  readonly requires_owner_approval: boolean;
  /** چرا این تصمیم گرفته شد — برای بازبینیِ مستقل */
  readonly rationale_fa: string;
  /** آیا همان کالا از تعارض مستثناست؟ */
  readonly same_entity_exempt: boolean;
}

/** کلیدِ متعارفِ یک جفت‌میدان، مستقل از ترتیب */
export function pairKey(a: IdentityField, b: IdentityField): string {
  return [a, b].sort().join('~');
}

const SAME_FIELD_RULES: readonly ComparisonRule[] = [
  {
    rule_id: 'C13-R-alias-same',
    fields: ['alias', 'alias'],
    kind: 'same_field',
    space: 'field',
    decision: 'HARD_CONFLICT',
    severity: 'hard',
    confidence: 'high',
    ambiguity: 0.05,
    explanation_fa:
      'یک نامِ جایگزین برای دو کالایِ متفاوت در همین شرکت به کار رفته است؛ جست‌وجوی مشتری دوپهلو می‌شود.',
    recommended_resolution_fa:
      'مالکِ داده باید تعیین کند این نام به کدام کالا تعلق دارد؛ سپس نامِ جایگزینِ اشتباه اصلاح شود. هیچ ادغامِ خودکاری مجاز نیست.',
    requires_owner_approval: false,
    rationale_fa:
      'alias در قراردادِ C11 برای یکتایی به کار می‌رود، پس تکرارِ آن در دو کالا نقضِ مستقیمِ هویت است.',
    same_entity_exempt: true,
  },
  {
    rule_id: 'C13-R-code-same',
    fields: ['code', 'code'],
    kind: 'same_field',
    space: 'field',
    decision: 'HARD_CONFLICT',
    severity: 'hard',
    confidence: 'high',
    ambiguity: 0.05,
    explanation_fa: 'دو کالا در یک شرکت کدِ یکسان دارند (پس از نرمال‌سازیِ قرارداد).',
    recommended_resolution_fa:
      'کدِ تکراری باید توسطِ مالکِ داده اصلاح شود؛ تا آن زمان ورودِ داده برای این شرکت باید هشدار بدهد.',
    requires_owner_approval: false,
    rationale_fa: 'کدِ کالا شناسهٔ اصلیِ عملیاتی است و تکرارش مرجعِ اشتباه می‌سازد.',
    same_entity_exempt: true,
  },
  {
    rule_id: 'C13-R-barcode-same',
    fields: ['barcode', 'barcode'],
    kind: 'same_field',
    space: 'field',
    decision: 'HARD_CONFLICT',
    severity: 'hard',
    confidence: 'high',
    ambiguity: 0.02,
    explanation_fa: 'دو کالا در یک شرکت بارکدِ یکسان دارند؛ اسکن قطعاً کالای اشتباه را برمی‌دارد.',
    recommended_resolution_fa:
      'بازبینیِ دستی و تفکیکِ دو بارکد؛ مالکِ داده تعیین می‌کند کدام بارکد معتبر است. ادغامِ خودکار ممنوع.',
    requires_owner_approval: false,
    rationale_fa:
      'بارکد یک شناسهٔ فیزیکیِ جهانی‌نماست؛ تکرارش خطای عملیاتیِ قطعی و غیرقابلِ چشم‌پوشی است.',
    same_entity_exempt: true,
  },
  {
    rule_id: 'C13-R-name-same',
    fields: ['name', 'name'],
    kind: 'same_field',
    space: 'field',
    decision: 'SOFT_CONFLICT',
    severity: 'soft',
    confidence: 'high',
    ambiguity: 0.4,
    explanation_fa:
      'دو کالا نامِ یکسان دارند. نام شناسهٔ یکتا نیست، ولی شباهتِ کامل معمولاً نشانهٔ رکوردِ تکراری است.',
    recommended_resolution_fa:
      'بازبینیِ دستی برای احتمالِ رکوردِ تکراری؛ اگر دو کالایِ واقعاً متفاوت‌اند، عمداً مجاز بماند.',
    requires_owner_approval: false,
    rationale_fa:
      'نامِ یکسان می‌تواند مشروع باشد (دو بسته‌بندیِ متفاوتِ یک محصول)، پس سخت‌کردنش هشدارِ کاذبِ انبوه می‌سازد.',
    same_entity_exempt: true,
  },
  {
    rule_id: 'C13-R-name_latin-same',
    fields: ['name_latin', 'name_latin'],
    kind: 'same_field',
    space: 'field',
    decision: 'SOFT_CONFLICT',
    severity: 'soft',
    confidence: 'high',
    ambiguity: 0.4,
    explanation_fa: 'دو کالا نامِ لاتینِ یکسان دارند.',
    recommended_resolution_fa:
      'بازبینیِ دستی؛ نامِ لاتین اغلب مترادف است و می‌تواند مبنایِ یکتایی نباشد.',
    requires_owner_approval: false,
    rationale_fa: 'همان استدلالِ name؛ نامِ لاتین حتی سست‌تر است.',
    same_entity_exempt: true,
  },
];

const CROSS_FIELD_RULES: readonly ComparisonRule[] = [
  // ── alias ↔ barcode: قلبِ CF-10 ─────────────────────────────────────────
  {
    rule_id: 'C13-R-alias~barcode',
    fields: ['alias', 'barcode'],
    kind: 'cross_field',
    space: 'scan',
    decision: 'HARD_CONFLICT',
    severity: 'hard',
    confidence: 'high',
    ambiguity: 0.03,
    explanation_fa:
      'نامِ جایگزینِ یک کالا در فضای اسکن با بارکدِ کالایِ دیگر یکی می‌شود. اسکن دو کالایِ متفاوت را برمی‌گرداند — همان ابهامی که امروز دیده نمی‌شود (CF-10).',
    recommended_resolution_fa:
      'بازبینیِ دستی: اگر مقدار واقعاً یک بارکد است، alias باید به میدانِ بارکد منتقل شود؛ اگر یک نامِ انسانی است، باید از فضای اسکن خارج بماند. حلِ خودکار ممنوع.',
    requires_owner_approval: true,
    rationale_fa:
      'هر دو میدان در عملیاتِ واقعی اسکن می‌شوند، پس اشتراکِ مقدار ابهامِ قطعیِ عملیاتی است. تصمیمِ نهاییِ «کدام میدان معتبر است» یک تصمیمِ کسب‌وکار است.',
    same_entity_exempt: true,
  },
  // ── alias ↔ code ────────────────────────────────────────────────────────
  {
    rule_id: 'C13-R-alias~code',
    fields: ['alias', 'code'],
    kind: 'cross_field',
    space: 'alnum',
    decision: 'HARD_CONFLICT',
    severity: 'hard',
    confidence: 'high',
    ambiguity: 0.08,
    explanation_fa:
      'نامِ جایگزینِ یک کالا در فضای کد با کدِ کالایِ دیگر یکی می‌شود؛ جست‌وجو با کد می‌تواند کالایِ اشتباه را برگرداند.',
    recommended_resolution_fa:
      'بازبینیِ دستی و اصلاحِ یکی از دو مقدار؛ تا زمانِ اصلاح، جست‌وجوی کد باید هشدارِ ابهام بدهد.',
    requires_owner_approval: true,
    rationale_fa:
      'کدِ کالا یک شناسهٔ مرجعِ عملیاتی است؛ تصاحبِ آن توسطِ یک نامِ جایگزین مرجع را مخدوش می‌کند.',
    same_entity_exempt: true,
  },
  // ── code ↔ barcode ──────────────────────────────────────────────────────
  {
    rule_id: 'C13-R-barcode~code',
    fields: ['barcode', 'code'],
    kind: 'cross_field',
    space: 'scan',
    decision: 'HARD_CONFLICT',
    severity: 'hard',
    confidence: 'high',
    ambiguity: 0.05,
    explanation_fa:
      'کدِ یک کالا با بارکدِ کالایِ دیگر در فضای اسکن یکی می‌شود؛ اسکن و جست‌وجوی کد نتایجِ متفاوت می‌دهند.',
    recommended_resolution_fa:
      'بازبینیِ دستی؛ اگر کد عمداً همان بارکد است باید به میدانِ بارکد منتقل شود.',
    requires_owner_approval: true,
    rationale_fa:
      'هر دو شناسهٔ عملیاتی‌اند و اشتراکشان بین دو کالا ابهامِ قطعی می‌سازد (اشتراک در همان کالا مجاز است).',
    same_entity_exempt: true,
  },
  // ── alias ↔ name ────────────────────────────────────────────────────────
  {
    rule_id: 'C13-R-alias~name',
    fields: ['alias', 'name'],
    kind: 'cross_field',
    space: 'text',
    decision: 'SOFT_CONFLICT',
    severity: 'soft',
    confidence: 'medium',
    ambiguity: 0.35,
    explanation_fa: 'نامِ جایگزینِ یک کالا با نامِ کالایِ دیگر یکی می‌شود.',
    recommended_resolution_fa:
      'بازبینیِ دستی؛ اگر نام کاملاً عمومی است (مثلِ «شیر») این وضعیت طبیعی و مجاز است و نباید اصلاح شود.',
    requires_owner_approval: false,
    rationale_fa:
      'نام‌ها عمداً می‌توانند عمومی و مشترک باشند؛ سخت‌کردنِ این جفت باعثِ هزاران هشدارِ کاذب می‌شد.',
    same_entity_exempt: true,
  },
  // ── alias ↔ name_latin ──────────────────────────────────────────────────
  {
    rule_id: 'C13-R-alias~name_latin',
    fields: ['alias', 'name_latin'],
    kind: 'cross_field',
    space: 'text',
    decision: 'SOFT_CONFLICT',
    severity: 'soft',
    confidence: 'medium',
    ambiguity: 0.3,
    explanation_fa: 'نامِ جایگزینِ یک کالا با نامِ لاتینِ کالایِ دیگر یکی می‌شود.',
    recommended_resolution_fa: 'بازبینیِ دستی؛ معمولاً نویسه‌گردانیِ ناهمگون است، نه تعارض.',
    requires_owner_approval: false,
    rationale_fa: 'هم‌ریشگیِ لاتین/فارسی رایج است و به‌تنهایی هویت را نقض نمی‌کند.',
    same_entity_exempt: true,
  },
  // ── name ↔ name_latin ───────────────────────────────────────────────────
  {
    rule_id: 'C13-R-name~name_latin',
    fields: ['name', 'name_latin'],
    kind: 'cross_field',
    space: 'text',
    decision: 'MANUAL_REVIEW',
    severity: 'review',
    confidence: 'low',
    ambiguity: 0.75,
    explanation_fa:
      'نامِ فارسیِ یک کالا با نامِ لاتینِ کالایِ دیگر یکی می‌شود. هم‌ارزیِ نویسه‌گردانیِ فارسی↔لاتین قابلِ اثباتِ خودکار نیست.',
    recommended_resolution_fa: 'بازبینیِ دستی با دانشِ زبانی؛ هیچ تصمیمِ خودکاری مجاز نیست.',
    requires_owner_approval: true,
    rationale_fa:
      'نویسه‌گردانی وابسته به سلیقه است («Coca Cola» / «کوکاکولا»)؛ یکسان‌شدنِ رشته‌ها شاهدِ هم‌هویتی نیست.',
    same_entity_exempt: true,
  },
  // ── name ↔ code ─────────────────────────────────────────────────────────
  {
    rule_id: 'C13-R-code~name',
    fields: ['code', 'name'],
    kind: 'cross_field',
    space: 'alnum',
    decision: 'MANUAL_REVIEW',
    severity: 'review',
    confidence: 'low',
    ambiguity: 0.7,
    explanation_fa:
      'نامِ یک کالا با کدِ کالایِ دیگر یکی می‌شود؛ جست‌وجو می‌تواند هر دو را برگرداند.',
    recommended_resolution_fa:
      'بازبینیِ دستی؛ اغلب کد از نام مشتق شده و این وضعیت بی‌ضرر است، ولی باید تأیید شود.',
    requires_owner_approval: false,
    rationale_fa:
      'اشتقاقِ کد از نام رواج دارد، لذا برخوردِ متنی به‌تنهایی دلیلِ تعارض نیست — اما نادیده‌گرفتنش هم درست نیست.',
    same_entity_exempt: true,
  },
  // ── name_latin ↔ code ───────────────────────────────────────────────────
  {
    rule_id: 'C13-R-code~name_latin',
    fields: ['code', 'name_latin'],
    kind: 'cross_field',
    space: 'alnum',
    decision: 'MANUAL_REVIEW',
    severity: 'review',
    confidence: 'low',
    ambiguity: 0.65,
    explanation_fa: 'نامِ لاتینِ یک کالا با کدِ کالایِ دیگر یکی می‌شود.',
    recommended_resolution_fa: 'بازبینیِ دستی؛ احتمالاً کد از نامِ لاتین مشتق شده است.',
    requires_owner_approval: false,
    rationale_fa: 'همان استدلالِ code↔name، با اطمینانِ کمتر.',
    same_entity_exempt: true,
  },
  // ── barcode ↔ name: عمداً «قابلِ مقایسه نیست» ────────────────────────────
  {
    rule_id: 'C13-R-barcode~name',
    fields: ['barcode', 'name'],
    kind: 'cross_field',
    space: 'scan',
    decision: 'NOT_COMPARABLE',
    severity: 'none',
    confidence: 'high',
    ambiguity: 0.95,
    explanation_fa:
      'نامِ کالا و بارکد دو جهانِ متفاوت‌اند: نام یک برچسبِ انسانی است و بارکد یک شناسهٔ ماشینی. یکسان‌شدنِ تصادفیِ رشته‌ها معنای هویتی ندارد و نباید تعارض شمرده شود.',
    recommended_resolution_fa:
      'اقدامی لازم نیست. این مورد عمداً «قابلِ مقایسه نیست» علامت می‌خورد تا در انبوهِ هشدارهای کاذب گم نشود.',
    requires_owner_approval: false,
    rationale_fa:
      'اگر این جفت را قابلِ مقایسه بدانیم، هر کالایی که نامش عددی باشد (مثلِ «۲۰۰») با هر بارکدی برخورد می‌سازد. این همان «هر شباهتِ متنی تعارض است» است که قرارداد آن را رد می‌کند.',
    same_entity_exempt: true,
  },
  // ── barcode ↔ name_latin ────────────────────────────────────────────────
  {
    rule_id: 'C13-R-barcode~name_latin',
    fields: ['barcode', 'name_latin'],
    kind: 'cross_field',
    space: 'scan',
    decision: 'NOT_COMPARABLE',
    severity: 'none',
    confidence: 'high',
    ambiguity: 0.95,
    explanation_fa: 'نامِ لاتین و بارکد قابلِ مقایسه نیستند (همان استدلالِ name↔barcode).',
    recommended_resolution_fa: 'اقدامی لازم نیست.',
    requires_owner_approval: false,
    rationale_fa: 'متنِ انسانی در برابرِ شناسهٔ ماشینی.',
    same_entity_exempt: true,
  },
];

/**
 * ⚠️ قواعدِ «بین‌شرکتی» و «بین‌دامنه» عمداً در جدولِ **جفت‌میدان** نیستند.
 *
 * درسِ گرفته‌شده: نسخهٔ اول این دو قاعده را با جفتِ `['alias','alias']` به‌عنوان
 * جای‌نگهدار ثبت می‌کرد — و چون کلیدِ جدول `pairKey` است، قاعدهٔ **واقعیِ** هم‌میدانیِ
 * alias را **بی‌صدا بازنویسی** می‌کرد. نتیجه: هیچ برخوردِ alias↔alias تولید نمی‌شد و
 * مدیرِ داده هرگز آن را نمی‌دید. قاعدهٔ درست: این‌ها قواعدِ **دامنه‌ای**‌اند، نه جفتی.
 */
export const CROSS_COMPANY_RULE: ComparisonRule = {
  rule_id: 'C13-R-cross-company',
  fields: ['alias', 'alias'],
  kind: 'scope',
  space: 'field',
  decision: 'ALLOWED',
  severity: 'none',
  confidence: 'high',
  ambiguity: 0,
  explanation_fa:
    'همین شناسه در شرکتِ دیگری هم وجود دارد. طبقِ مرزِ شرکت این وضعیت مجاز است و هیچ اطلاعاتی از شرکتِ دیگر افشا نمی‌شود.',
  recommended_resolution_fa:
    'اقدامی لازم نیست، مگر آنکه مالک قاعدهٔ سراسریِ مصوبی صادر کند (D-C13-1).',
  requires_owner_approval: true,
  rationale_fa:
    'شرکت‌ها مستقل‌اند؛ یکسان‌بودنِ نامِ کالا در دو شرکت تجاری طبیعی است. تعارض شمردنِ آن یعنی نقضِ مرزِ چندمستأجری.',
  same_entity_exempt: false,
};

export const CROSS_DOMAIN_RULE: ComparisonRule = {
  rule_id: 'C13-R-cross-domain',
  fields: ['alias', 'alias'],
  kind: 'scope',
  space: 'field',
  decision: 'MANUAL_REVIEW',
  severity: 'review',
  confidence: 'medium',
  ambiguity: 0.5,
  explanation_fa:
    'همین شناسه در دامنهٔ کسب‌وکارِ دیگری از همین شرکت وجود دارد؛ نیازمندِ بازبینیِ دستی است.',
  recommended_resolution_fa:
    'بازبینیِ دستی؛ اگر دو دامنه عمداً کالاهای هم‌نام دارند، مجاز اعلام شود.',
  requires_owner_approval: true,
  rationale_fa:
    'دامنه‌ها مرزِ امنیتی نیستند بلکه مرزِ سازمانی‌اند؛ هر دو طرف قابلِ مشاهده‌اند و تصمیمِ انسانی لازم است.',
  same_entity_exempt: false,
};

/** قاعدهٔ «تکرارِ همان کالا در همان میدان» — افزونگی، نه ابهام */
export const REDUNDANT_ROW_RULE: ComparisonRule = {
  rule_id: 'C13-R-redundant-row',
  fields: ['alias', 'alias'],
  kind: 'scope',
  space: 'field',
  decision: 'ALLOWED',
  severity: 'none',
  confidence: 'high',
  ambiguity: 0,
  explanation_fa:
    'همان کالا همین مقدار را بیش از یک‌بار در همین میدان دارد. این افزونگیِ ذخیره‌سازی است، نه ابهامِ هویتی بینِ دو کالا؛ لذا مجاز است.',
  recommended_resolution_fa:
    'پاک‌سازیِ ردیفِ تکراری اختیاری است؛ هیچ اقدامِ خودکاری مجاز نیست.',
  requires_owner_approval: false,
  rationale_fa:
    'اصلاحِ عمدیِ C12: C12 هر تجمعِ alias را hard می‌شمرد، حتی وقتی هر دو ردیف به یک کالا تعلق داشتند.',
  same_entity_exempt: false,
};

/** جدولِ جفت‌میدان — فقط قواعدِ هم‌میدانی و بین‌میدانی */
export const COMPARISON_RULES: ReadonlyMap<string, ComparisonRule> = new Map(
  [...SAME_FIELD_RULES, ...CROSS_FIELD_RULES].map((r) => [
    pairKey(r.fields[0], r.fields[1]),
    r,
  ]),
);

/** قاعدهٔ یک جفت‌میدان؛ `undefined` یعنی جفتی که قرارداد تعریف نکرده */
export function ruleFor(a: IdentityField, b: IdentityField): ComparisonRule | undefined {
  return COMPARISON_RULES.get(pairKey(a, b));
}

/** فهرستِ همهٔ جفت‌های تعریف‌شده — برای پوششِ تست */
export function allRulePairs(): readonly string[] {
  return [...COMPARISON_RULES.keys()].sort();
}

// ---------------------------------------------------------------------------
// کمک‌کارها
// ---------------------------------------------------------------------------

/** هشِ پایدار FNV-1a 32-bit — قطعی و بدونِ وابستگی */
export function stableHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * شناسهٔ پایدارِ نتیجه — از (قاعده، دامنه، کلیدِ فضا، امضای مرتب‌شدهٔ طرف‌ها).
 * مستقل از ترتیبِ ورودی و پایدار بینِ اجراها.
 */
export function resultId(
  ruleId: string,
  scopeId: string,
  spaceKey: string | null,
  parties: readonly { entity_id: string; field: IdentityField }[],
): string {
  const sig = parties
    .map((p) => `${p.entity_id}:${p.field}`)
    .sort()
    .join('|');
  return `C13-${stableHash(`${ruleId}\u0000${scopeId}\u0000${spaceKey ?? ''}\u0000${sig}`)}`;
}

/**
 * پوشاندنِ مقدار برای گزارشِ عمومی.
 * چند کاراکترِ ابتدا/انتها می‌ماند تا اپراتور بتواند تطبیق دهد، ولی مقدارِ کامل
 * هرگز در گزارش نمی‌آید.
 */
export function redactValue(value: string): string {
  const v = String(value);
  if (v.length === 0) return '';
  if (v.length <= 2) return '\u2022'.repeat(v.length);
  const keep = v.length >= 8 ? 2 : 1;
  return v.slice(0, keep) + '\u2022'.repeat(Math.min(v.length - keep * 2, 8)) + v.slice(-keep);
}

// ---------------------------------------------------------------------------
// موتورِ اصلی
// ---------------------------------------------------------------------------

export interface ResultParty {
  readonly entity_id: string;
  readonly company_id: string;
  readonly domain_id: string;
  readonly field: IdentityField;
  /** مقدارِ نمایشی؛ اگر پوشانده یا بین‌شرکتی باشد `null` است */
  readonly display_value: string | null;
  /** کلید در فضای اختصاصیِ میدان */
  readonly field_key: string | null;
  /** کلید در فضای مقایسه */
  readonly comparison_key: string | null;
  readonly source_ref: string;
  readonly redacted: boolean;
  /** دلیلِ نامعتبربودنِ پروفایلِ میدان (اگر بود) — هرگز نادیده گرفته نمی‌شود */
  readonly field_invalid_reason: string | null;
}

export interface CrossFieldResult {
  readonly collision_id: string;
  readonly decision: Decision;
  readonly rule_id: string;
  readonly contract_version: string;
  readonly normalization_version: string;
  readonly space: ComparisonSpaceId | null;
  readonly space_key: string | null;
  readonly fields: readonly IdentityField[];
  readonly scope: {
    readonly company_id: string;
    readonly domain_id: string;
    readonly crosses_company: boolean;
    readonly crosses_domain: boolean;
  };
  readonly confidence: Confidence;
  readonly ambiguity: number;
  readonly severity: CollisionSeverity;
  readonly parties: readonly ResultParty[];
  /** تعدادِ کلِ طرف‌ها پیش از سقفِ گزارش — برای شفافیت */
  readonly total_parties: number;
  readonly explanation_fa: string;
  readonly recommended_resolution_fa: string;
  readonly requires_owner_approval: boolean;
  readonly provenance: readonly string[];
  readonly visible_under_current_normalization: boolean;
}

export interface CrossFieldOptions {
  /** پوشاندنِ مقادیر در خروجی (پیش‌فرض `true` — گزارشِ عمومی) */
  readonly redactValues?: boolean;
  /** سقفِ طرف‌ها در هر گزارش (پیش‌فرض ۲۰) */
  readonly maxPartiesPerResult?: number;
  /** آیا نتایجِ NOT_COMPARABLE هم گزارش شوند؟ (پیش‌فرض `true`) */
  readonly reportNotComparable?: boolean;
  /** قاعدهٔ مصوبِ سراسری: آیا برخوردِ بین‌شرکتی تعارض است؟ (پیش‌فرض `false`) */
  readonly crossCompanyIsConflict?: boolean;
  /** فضاهای بین‌میدانی که اسکن می‌شوند */
  readonly spaces?: readonly ComparisonSpaceId[];
}

export interface CrossFieldSummary {
  readonly total: number;
  readonly by_decision: Readonly<Record<Decision, number>>;
  readonly by_rule: Readonly<Record<string, number>>;
  readonly by_field_pair: Readonly<Record<string, number>>;
  readonly by_company: Readonly<Record<string, number>>;
  readonly rows_in: number;
  readonly rows_comparable: number;
  readonly rows_invalid: number;
  readonly rows_invalid_in_comparison_space: number;
  /** جفت‌های خامی که با گروه‌بندی مهار شدند (نه تولیدِ O(n²)) */
  readonly raw_pairs_suppressed: number;
}

export interface CrossFieldAssessment {
  readonly contract_version: string;
  readonly normalization_version: string;
  readonly generated_at_iso: string;
  readonly options: {
    readonly redactValues: boolean;
    readonly crossCompanyIsConflict: boolean;
    readonly spaces: readonly ComparisonSpaceId[];
  };
  readonly results: readonly CrossFieldResult[];
  readonly summary: CrossFieldSummary;
  readonly newly_exposed: number;
  /** نتایجِ تکراریِ معنایی که در چند فضا کشف و حذف شدند */
  readonly duplicates_suppressed: number;
}

interface Prepared {
  readonly row: IdentityRow;
  readonly scopeId: string;
  readonly company_id: string;
  readonly domain_id: string;
  /** کلید در فضای اختصاصیِ میدان؛ `null` یعنی پروفایلِ میدان آن را نپذیرفت */
  readonly field_key: string | null;
  /** دلیلِ رد شدن توسطِ پروفایلِ میدان */
  readonly field_invalid_reason: string | null;
}

const CROSS_SPACES: readonly ComparisonSpaceId[] = ['scan', 'alnum', 'text'];

/**
 * ساختِ یک طرفِ نتیجه.
 *
 * ⚠️ قاعدهٔ امنیتی: در نمای بین‌شرکتی، طرفِ متعلق به شرکتِ دیگر کاملاً پوشانده
 * می‌شود و شناسه‌هایش هش می‌شوند. در نمای سراسری (`*`) ناظر هیچ شرکتی نیست، پس
 * **همهٔ** طرف‌ها بیگانه‌اند. این ماژول هیچ راهی برای افشای دادهٔ شرکتِ دیگر ندارد.
 */
function buildParty(
  m: Prepared,
  space: ComparisonSpaceId | null,
  scopeCompany: string,
  crossesCompany: boolean,
  redactValues: boolean,
): ResultParty {
  const hide = crossesCompany && (scopeCompany === '*' || m.company_id !== scopeCompany);
  const redacted = hide || redactValues;
  const ck =
    space !== null && space !== 'field'
      ? comparisonKey(space, m.row.field, m.row.display_value).key
      : m.field_key;
  return {
    entity_id: hide
      ? `\u2022\u2022\u2022:${stableHash(`${m.row.company_id}\u0000${m.row.entity_id}`)}`
      : m.row.entity_id,
    company_id: m.company_id,
    domain_id: m.domain_id,
    field: m.row.field,
    display_value: hide ? null : redacted ? redactValue(m.row.display_value) : m.row.display_value,
    field_key: hide ? null : redacted ? redactValue(m.field_key ?? '') : m.field_key,
    comparison_key: hide ? null : redacted ? (ck === null ? null : redactValue(ck)) : ck,
    source_ref: hide ? `\u2022\u2022\u2022:${stableHash(m.row.source_ref)}` : m.row.source_ref,
    redacted,
    field_invalid_reason: m.field_invalid_reason,
  };
}

/**
 * آیا این تجمع با نرمال‌سازیِ **فعلی** هم دیده می‌شود؟
 *
 * ملاک: برای مقایسهٔ هم‌میدانی، اگر همهٔ طرف‌ها مقدارِ ذخیره‌شده‌شان با کلیدِ فضا یکی
 * باشد، سامانهٔ امروز هم آن‌ها را یکسان می‌بیند. مقایسهٔ بین‌میدانی امروز **اصلاً
 * انجام نمی‌شود**، پس هر نتیجه‌ای از آن «تازه‌کشف» است.
 */
function visibleUnderLegacy(
  members: readonly Prepared[],
  spaceKey: string | null,
  space: ComparisonSpaceId | null,
): boolean {
  if (space !== 'field' || spaceKey === null) return false;
  return members.every((m) => m.row.stored_normalized === spaceKey);
}

/**
 * ارزیابیِ بین‌میدانی.
 *
 * الگوریتم (خطی جز مرتب‌سازیِ خروجی):
 *   ۱. هر ردیف یک‌بار آماده می‌شود (کلیدِ میدانی).
 *   ۲. برای هر فضا، گروه‌بندی بر اساس (دامنه، کلید) — یک گذر.
 *   ۳. درونِ هر گروه، اعضا به تفکیکِ میدان پارتیشن می‌شوند؛ برای هر جفت‌میدانِ
 *      حاضر **یک** نتیجه تولید می‌شود (نه یکی به‌ازایِ هر جفت ردیف) ⇒ خروجی به
 *      تعدادِ جفت‌میدان‌های موجود محدود است، نه O(n²).
 *   ۴. هم‌میدانی‌ها در فضای `field` جداگانه بررسی می‌شوند.
 *   ۵. برخوردِ بین‌شرکتی/بین‌دامنه در آخر با پوشاندنِ اجباری.
 */
export function assessCrossField(
  rows: readonly IdentityRow[],
  opts: CrossFieldOptions = {},
): CrossFieldAssessment {
  const redactValues = opts.redactValues !== false;
  const maxParties = Math.max(2, opts.maxPartiesPerResult ?? 20);
  const reportNotComparable = opts.reportNotComparable !== false;
  const crossCompanyIsConflict = opts.crossCompanyIsConflict === true;
  const spaces = (opts.spaces ?? CROSS_SPACES).filter((s) => s !== 'field');

  // ── ۱) آماده‌سازی ────────────────────────────────────────────────────────
  const prepared: Prepared[] = [];
  let fieldInvalid = 0;
  for (const row of rows) {
    if (!(IDENTITY_FIELDS as readonly string[]).includes(row.field)) {
      throw new Error(`unknown identity field: ${String(row.field)}`);
    }
    const domain = row.domain_id ?? row.company_id;
    const fk = fieldSpace(row.field, row.display_value);
    if (!fk.ok) fieldInvalid += 1;
    prepared.push({
      row,
      scopeId: `${row.company_id}\u0000${domain}`,
      company_id: row.company_id,
      domain_id: domain,
      field_key: fk.key,
      field_invalid_reason: fk.reason,
    });
  }

  const results: CrossFieldResult[] = [];
  let suppressed = 0;
  let invalidInSpace = 0;

  const partySig = (members: readonly Prepared[]): { entity_id: string; field: IdentityField }[] =>
    members.map((m) => ({ entity_id: m.row.entity_id, field: m.row.field }));

  const pushResult = (
    rule: ComparisonRule,
    scopeCompany: string,
    scopeDomain: string,
    spaceKey: string | null,
    space: ComparisonSpaceId | null,
    members: readonly Prepared[],
    crossesCompany: boolean,
    crossesDomain: boolean,
  ): void => {
    const byField = new Map<IdentityField, Prepared[]>();
    for (const m of members) {
      const arr = byField.get(m.row.field);
      if (arr) arr.push(m);
      else byField.set(m.row.field, [m]);
    }

    const sample = members
      .slice(0, maxParties)
      .map((m) => buildParty(m, space, scopeCompany, crossesCompany, redactValues));

    const escalated = rule.kind === 'scope' && crossesCompany && crossCompanyIsConflict;
    const decision: Decision = escalated ? 'HARD_CONFLICT' : rule.decision;

    results.push({
      collision_id: resultId(
        rule.rule_id,
        `${scopeCompany}\u0000${scopeDomain}`,
        spaceKey,
        partySig(members),
      ),
      decision,
      rule_id: rule.rule_id,
      contract_version: COMPARISON_CONTRACT_VERSION,
      normalization_version: UNDERLYING_NORMALIZATION_VERSION,
      space,
      space_key: spaceKey === null ? null : redactValues ? redactValue(spaceKey) : spaceKey,
      fields: [...byField.keys()].sort(),
      scope: {
        company_id: scopeCompany,
        domain_id: scopeDomain,
        crosses_company: crossesCompany,
        crosses_domain: crossesDomain,
      },
      confidence: rule.confidence,
      ambiguity: rule.ambiguity,
      severity: escalated ? 'hard' : rule.severity,
      parties: sample,
      total_parties: members.length,
      explanation_fa: escalated
        ? 'قاعدهٔ سراسریِ مصوب فعال است: همین شناسه در چند شرکت وجود دارد و تعارض شمرده می‌شود. اطلاعاتِ شرکتِ دیگر همچنان پوشانده است.'
        : rule.explanation_fa,
      recommended_resolution_fa: rule.recommended_resolution_fa,
      requires_owner_approval: rule.requires_owner_approval,
      // ⚠️ provenance هم باید پوشانده شود. کشف‌شده توسطِ آزمونِ خصمانهٔ نشت:
      // نسخهٔ اول `source_ref` خامِ شرکتِ دیگر را در provenance می‌گذاشت، در حالی
      // که در parties همان مقدار پوشانده شده بود. یعنی داده از دریچهٔ عقب بیرون
      // می‌رفت. اکنون هر دو مسیر از یک قاعده پیروی می‌کنند.
      provenance: members
        .slice(0, maxParties)
        .map((m) => {
          const hide = crossesCompany && (scopeCompany === '*' || m.company_id !== scopeCompany);
          return hide
            ? `\u2022\u2022\u2022:${stableHash(`${m.company_id}\u0000${m.domain_id}\u0000${m.row.source_ref}`)}#${m.row.field}@${space ?? 'field'}`
            : `${m.company_id}:${m.domain_id}:${m.row.source_ref}#${m.row.field}@${space ?? 'field'}`;
        }),
      visible_under_current_normalization: visibleUnderLegacy(members, spaceKey, space),
    });
  };

  // ── ۲) اسکنِ هر فضای بین‌میدانی ──────────────────────────────────────────
  for (const space of spaces) {
    const groups = new Map<string, Prepared[]>();
    for (const p of prepared) {
      // ⚠️ فقط نامعتبریِ **همین فضا** رد می‌کند، نه نامعتبریِ پروفایلِ میدان.
      // یک مقدار می‌تواند پروفایلِ میدانش را رد کند ولی در فضای اسکن هویتِ
      // معتبری بسازد (کشف‌شده در تست: کدِ «ZX 77»).
      const k = comparisonKey(space, p.row.field, p.row.display_value);
      if (!k.ok || !k.key) {
        invalidInSpace += 1;
        continue;
      }
      const gk = `${p.scopeId}\u0000${k.key}`;
      const arr = groups.get(gk);
      if (arr) arr.push(p);
      else groups.set(gk, [p]);
    }

    for (const [gk, group] of groups) {
      if (group.length < 2) continue;
      const byField = new Map<IdentityField, Prepared[]>();
      for (const m of group) {
        const arr = byField.get(m.row.field);
        if (arr) arr.push(m);
        else byField.set(m.row.field, [m]);
      }
      const fieldsHere = [...byField.keys()].sort();
      if (fieldsHere.length < 2) continue; // هم‌میدانی‌ها در فضای field بررسی می‌شوند

      // کلیدِ گروه مستقل از ترتیب است — همان کلیدی که گروه‌بندی رویش انجام شد
      const groupKey = gk.slice(gk.lastIndexOf('\u0000') + 1);

      for (let i = 0; i < fieldsHere.length; i += 1) {
        for (let j = i + 1; j < fieldsHere.length; j += 1) {
          const rule = ruleFor(fieldsHere[i], fieldsHere[j]);
          if (!rule) continue;
          // قاعده فقط در فضای خودش معتبر است
          if (rule.space !== space) continue;

          const members = [
            ...(byField.get(fieldsHere[i]) ?? []),
            ...(byField.get(fieldsHere[j]) ?? []),
          ];
          if (rule.same_entity_exempt) {
            const entities = new Set(members.map((m) => m.row.entity_id));
            if (entities.size < 2) continue;
          }
          if (rule.decision === 'NOT_COMPARABLE' && !reportNotComparable) continue;

          suppressed += (byField.get(fieldsHere[i]) ?? []).length * (byField.get(fieldsHere[j]) ?? []).length;

          pushResult(rule, group[0].company_id, group[0].domain_id, groupKey, space, members, false, false);
        }
      }
    }
  }

  // ── ۳) هم‌میدانی در فضای اختصاصیِ میدان ──────────────────────────────────
  const sameFieldGroups = new Map<string, Prepared[]>();
  for (const p of prepared) {
    if (p.field_key === null) continue;
    const gk = `${p.scopeId}\u0000${p.row.field}\u0000${p.field_key}`;
    const arr = sameFieldGroups.get(gk);
    if (arr) arr.push(p);
    else sameFieldGroups.set(gk, [p]);
  }

  for (const group of sameFieldGroups.values()) {
    if (group.length < 2) continue;
    const entities = new Set(group.map((m) => m.row.entity_id));

    // تکرارِ همان کالا در همان میدان ⇒ افزونگی، نه ابهام
    if (entities.size < 2) {
      pushResult(
        REDUNDANT_ROW_RULE,
        group[0].company_id,
        group[0].domain_id,
        group[0].field_key,
        'field',
        group,
        false,
        false,
      );
      continue;
    }

    const rule = ruleFor(group[0].row.field, group[0].row.field);
    if (!rule) continue;
    pushResult(rule, group[0].company_id, group[0].domain_id, group[0].field_key, 'field', group, false, false);
  }

  // ── ۴) بین‌شرکتی و بین‌دامنه ─────────────────────────────────────────────
  //
  // ⚠️ این بخش هرگز مقدارِ نمایشیِ شرکتِ دیگر را برنمی‌گرداند (buildParty).
  for (const space of ['field', ...spaces] as ComparisonSpaceId[]) {
    const groups = new Map<string, Prepared[]>();
    for (const p of prepared) {
      const k = comparisonKey(space, p.row.field, p.row.display_value);
      if (!k.ok || !k.key) continue;
      const arr = groups.get(k.key);
      if (arr) arr.push(p);
      else groups.set(k.key, [p]);
    }

    for (const [groupKey, group] of groups) {
      if (group.length < 2) continue;
      const companies = new Set(group.map((m) => m.company_id));
      const domains = new Set(group.map((m) => `${m.company_id}\u0000${m.domain_id}`));
      const crossesCompany = companies.size > 1;
      const crossesDomain = !crossesCompany && domains.size > 1;
      if (!crossesCompany && !crossesDomain) continue;

      const rule = crossesCompany ? CROSS_COMPANY_RULE : CROSS_DOMAIN_RULE;
      suppressed += (group.length * (group.length - 1)) / 2;

      // ⚠️ دامنهٔ مشترک باید **متعارف** باشد (مرتب‌شده)، نه `group[0].domain_id`.
      // اگر به ترتیبِ ورودی وابسته بود، با معکوس‌شدنِ ورودی شناسهٔ نتیجه عوض
      // می‌شد و دفتر غیرقطعی می‌گشت (کشف‌شده توسطِ تستِ ترتیب).
      const canonicalDomain = crossesDomain
        ? [...domains].map((d) => d.slice(d.indexOf('\u0000') + 1)).sort().join('|')
        : group[0].domain_id;

      pushResult(
        rule,
        crossesCompany ? '*' : group[0].company_id,
        crossesCompany ? '*' : canonicalDomain,
        groupKey,
        space,
        group,
        crossesCompany,
        crossesDomain,
      );
    }
  }

  // ── ۵) حذفِ تکرارِ معنایی و مرتب‌سازیِ قطعی ──────────────────────────────
  //
  // یک جفت می‌تواند در چند فضا هم‌زمان برخورد کند (مثلاً بارکدِ یکسان در دو شرکت
  // هم در فضای field و هم در scan یکی است). شناسهٔ نتیجه محتوایی است، پس این دو
  // شناسهٔ یکسان می‌گیرند؛ نگه‌داشتنِ هر دو «یگانگیِ شناسه» را نقض می‌کند.
  // یک برخوردِ **دامنه‌ای** (بین‌شرکتی/بین‌دامنه) ممکن است در چند فضا هم‌زمان
  // کشف شود (مثلاً بارکدِ یکسان هم در `field` و هم در `scan`). از دیدِ مالکِ داده
  // این **یک** تعارض است، نه دو تا. پس قواعدِ دامنه‌ای را بر اساسِ (قاعده، دامنه،
  // طرف‌ها) بدونِ فضا یکتا می‌کنیم. قواعدِ جفتی فضا را نگه می‌دارند چون فضا بخشی
  // از معنای آن‌هاست (مثلاً scan در برابر alnum).
  const seen = new Set<string>();
  const deduped: CrossFieldResult[] = [];
  for (const r of results) {
    const isScopeRule = r.rule_id === 'C13-R-cross-company' || r.rule_id === 'C13-R-cross-domain';
    const key = isScopeRule
      ? `${r.rule_id}\u0000${r.scope.company_id}\u0000${r.scope.domain_id}\u0000${r.parties
          .map((p) => `${p.entity_id}:${p.field}`)
          .sort()
          .join('|')}`
      : r.collision_id;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
  }
  const duplicatesSuppressed = results.length - deduped.length;

  deduped.sort((a, b) => (a.collision_id < b.collision_id ? -1 : a.collision_id > b.collision_id ? 1 : 0));

  const byDecision: Record<Decision, number> = {
    HARD_CONFLICT: 0,
    SOFT_CONFLICT: 0,
    MANUAL_REVIEW: 0,
    ALLOWED: 0,
    NOT_COMPARABLE: 0,
  };
  const byRule: Record<string, number> = {};
  const byPair: Record<string, number> = {};
  const byCompany: Record<string, number> = {};
  for (const r of deduped) {
    byDecision[r.decision] += 1;
    byRule[r.rule_id] = (byRule[r.rule_id] ?? 0) + 1;
    const pk = r.fields.length > 1 ? r.fields.join('~') : r.fields[0];
    byPair[pk] = (byPair[pk] ?? 0) + 1;
    byCompany[r.scope.company_id] = (byCompany[r.scope.company_id] ?? 0) + 1;
  }

  return {
    contract_version: COMPARISON_CONTRACT_VERSION,
    normalization_version: UNDERLYING_NORMALIZATION_VERSION,
    generated_at_iso: new Date(0).toISOString(),
    options: { redactValues, crossCompanyIsConflict, spaces },
    results: deduped,
    summary: {
      total: deduped.length,
      by_decision: byDecision,
      by_rule: byRule,
      by_field_pair: byPair,
      by_company: byCompany,
      rows_in: rows.length,
      rows_comparable: prepared.filter((p) => p.field_key !== null).length,
      rows_invalid: fieldInvalid,
      rows_invalid_in_comparison_space: invalidInSpace,
      raw_pairs_suppressed: suppressed,
    },
    newly_exposed: deduped.filter((r) => !r.visible_under_current_normalization).length,
    duplicates_suppressed: duplicatesSuppressed,
  };
}
