/**
 * TASK-PM-02-C13XT — تشخیصِ برخوردِ بین‌نوعیِ هویتِ کالا (Cross-Type Collision Detection).
 *
 * ⚠️ **آزمایشی و غیرفعال.** هیچ مسیرِ تولیدی (runtime) این ماژول را import نمی‌کند.
 * تنها مصرف‌کنندگان: تست‌های `test/c13-cross-type*.test.ts` و، در آینده،
 * اجراکنندهٔ ارزیابیِ سایه (پس از دریافتِ مجوزِ شش‌شرطی). هیچ مهاجرت، قید،
 * ایندکسِ یکتا، RLS یا رفتارِ ورودِ داده‌ای توسطِ این ماژول ساخته نمی‌شود.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * مسئله‌ای که این ماژول حل می‌کند
 * ─────────────────────────────────────────────────────────────────────────────
 * C12 برخوردِ کلیدها را در «چهار میدان» (name/alias/code/barcode) سنجید؛ C13 آن را
 * با «فضای مقایسه» به جفت‌میدان‌ها تعمیم داد. ولی بازِ یک بُعد نبود:
 *
 *   **«نوعِ هویت» (identity type) با هم متفاوت است، حتی وقتی مقدار یکی است.**
 *
 * نوع‌هایِ هویتِ واقعی در این سامانه (تحقّقِ اثبات‌شده در مهاجرت‌ها ۰۰۰۵/۰۰۴۶):
 *
 *   product_code        product.code              کدِ کالا (SKU)          company (حساس به حروف در DB؛ نامحسوس در قراردادِ C11)
 *   product_name        product.name              نامِ فارسی               بدونِ قید
 *   product_name_latin  product.name_latin        نامِ لاتین               بدونِ قید
 *   family_code         product_family.code       کدِ خانوادهٔ محصول      company (uq_product_family_code)
 *   category_code       product_category.code     کدِ دستهٔ کالا            company (uq_product_category_code)
 *   variant_signature   product.variant_signature  امضای variant            company/family (uq_product_variant_signature)
 *   alias               product_alias.alias       نام جایگزین              (product_id, alias_norm) + رفتارِ لایهٔ سرویس (۴۰۹)
 *   barcode             product_barcode.barcode   بارکدِ اختصاصی           نوع‌محور: gs1_* جهانی · internal/other شرکتی
 *   packaging_barcode   product_packaging.barcode بارکدِ بسته‌بندی (قدیمی)  **جهانی** (uq_product_barcode روی همان جدول)
 *
 * شکاف‌هایی که این ماژول می‌بندد:
 *
 *   ۱. **برخوردِ بین‌نوعی**: همان مقدار زیرِ دو نوعِ متفاوت ثبت شده (مثلاً کدِ کالا
 *      «400111» برای کالای A و بارکدِ internal «400111» برای کالای B).
 *   ۲. **برخوردِ مخزن/نمایش**: یک مقدار در **دو مخزنِ موازی** ثبت شده —
 *      `product_packaging.barcode` (قدیمی) و `product_barcode.barcode` (کانونی) —
 *      و این دو لزوماً با هم سازگار نیستند (مهاجرتِ ۰۰۴۶ با `on conflict do nothing`
 *      بی‌صدا یکراست می‌شود).
 *   ۳. **برخوردِ نوع↔نوعِ بین‌شرکتیِ بارکد**: مقادیری که در هیچ قیدِ فعلی نمی‌گنجند
 *      (gs1_* جهانی نیستند فقط برای kinds خودشان؛ internal شرکتی است) —
 *      «کورِ قید»: سوراخِ واقعیِ امروز.
 *   ۴. **هم‌ارزیِ UPC-A ↔ EAN-13**: UPC-A (۱۲ رقم) همان EAN-13 با صفرِ ابتدایی است.
 *      اگر یکی در gs1_upc و دیگری در gs1_ean13 ثبت شود، هیچ قیدی آن‌ها را یکی نمی‌بیند.
 *   ۵. **بارکدهای نامعتبرِ gs1** (طول/رقمِ کنترلی): زیرِ «سیاستِ آینده» رد می‌شدند؛
 *      امروز ذخیره شده‌اند — باید **قابلِ شمارش و ردیابی** باشند، نه خاموش.
 *   ۶. **ابهامِ نگاشتِ اسکن**: مقدارِ واحد به چند کالای متفاوت resolve می‌شود؛
 *      کدامِ آن‌ها از مسیرِ اسکن «سایه می‌خورند».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * اصولِ غیرقابلِ‌مذاکره (ارث‌بری از C11/C12/C13)
 * ─────────────────────────────────────────────────────────────────────────────
 *   ۱. **هیچ داده‌ای تغییر نمی‌کند** — فقط خواندن و ساختِ کلید.
 *   ۲. **هیچ کالایی ادغام، هیچ شناسه‌ای بازنویسی نمی‌شود.**
 *   ۳. **مرزِ شرکت مقدس است.** برخوردِ بین‌شرکتی هرگز مقدارِ آن شرکت را لو نمی‌دهد؛
 *      گزارشِ بین‌شرکتی همیشه با مقدارِ `null` و منبع/شرکتِ هش‌شده است.
 *   ۴. **قطعیت.** همان ورودی ⇒ همان شناسه‌های پایدار، در هر ترتیبی.
 *   ۵. **تشخیص ≠ اجرا.** هیچ خروجیِ این ماژول به‌طورِ خودکار اعمال نمی‌شود؛
 *      هر `HARD_CONFLICT` یک توصیه برای انسان است.
 *   ۶. **دادهٔ ناقص/ناسازگار هرگز کرش نمی‌کند** — به `data_quality` می‌رود و
 *      از گروه‌بندی کنار گذاشته می‌شود.
 */

import {
  scanSpace,
  alnumSpace,
  textSpace,
  redactValue,
  stableHash,
  type SpaceResult,
} from './cross-field-identity.candidate';
import {
  keyFor,
  type NormalizationProfileId,
} from './product-identity-normalization.candidate';

/** نسخهٔ قراردادِ بین‌نوعی. هر تغییرِ معنایی در جدول/فضاها/سیاست‌ها این را بالا می‌برد. */
export const CROSS_TYPE_CONTRACT_VERSION = 'c13xt.1';
/** قراردادِ مقایسهٔ زمینه (C13) که این ماژول روی آن سوار است. */
export const UNDERLYING_COMPARISON_VERSION = 'c13.1';
/** قراردادِ نرمال‌سازی (C11) که قراردادِ مقایسه روی آن سوار است. */
export const UNDERLYING_NORMALIZATION_VERSION = 'c11.1';

// ---------------------------------------------------------------------------
// ۱) ثباتِ نوع‌های هویت (identity type registry)
// ---------------------------------------------------------------------------

export const IDENTITY_TYPES = [
  'product_code',
  'product_name',
  'product_name_latin',
  'family_code',
  'category_code',
  'variant_signature',
  'alias',
  'barcode',
  'packaging_barcode',
] as const;
export type IdentityType = (typeof IDENTITY_TYPES)[number];

export const ALIAS_KINDS = ['brand_slang', 'latin', 'code'] as const;
export type AliasKind = (typeof ALIAS_KINDS)[number];

export const BARCODE_KINDS = [
  'gs1_ean13',
  'gs1_ean8',
  'gs1_upc',
  'gs1_itf14',
  'internal',
  'other',
] as const;
export type BarcodeKind = (typeof BARCODE_KINDS)[number];

export const GS1_KINDS: readonly BarcodeKind[] = ['gs1_ean13', 'gs1_ean8', 'gs1_upc', 'gs1_itf14'];

export function isGs1Kind(kind: string | null | undefined): boolean {
  if (!kind) return false;
  return (GS1_KINDS as readonly string[]).includes(kind.toLowerCase());
}

export type EntityType = 'product' | 'product_family' | 'product_category' | 'product_packaging';

export interface IdentityTypeDescriptor {
  readonly type: IdentityType;
  readonly entity_type: EntityType;
  /** جدولِ مرجع در اسکیما — برای provenance قابلِ ردیابی */
  readonly table: string;
  readonly column: string;
  /** پروفایلِ C11 برای کلیدِ «خودِ میدان»؛ `'Exact'` یعنی بدونِ نرمال‌سازی (فقط NFC+trim) */
  readonly profile: NormalizationProfileId | 'Exact';
  /** قوی‌ترین قیدی که **امروز** میلادی‌سازی می‌شود — برای «visible_under_current_constraints» */
  readonly uniqueness_today_fa: string;
  /** آیا این نوع (در هر subtype) در دامنهٔ جهانی می‌زید؟ */
  readonly globally_scoped: boolean;
  /** نامِ ستونِ زیرنوع (kind) — یا null */
  readonly subtype_field: 'kind' | null;
  readonly allowed_subtypes: readonly string[] | null;
}

export const IDENTITY_TYPE_REGISTRY: Readonly<Record<IdentityType, IdentityTypeDescriptor>> =
  Object.freeze({
    product_code: {
      type: 'product_code',
      entity_type: 'product',
      table: 'product',
      column: 'code',
      profile: 'ProductCode',
      uniqueness_today_fa:
        'UNIQUE (company_id, code) حساس به حروف در DB؛ لایهٔ سرویس عملاً نامحسوس است (D-C11-3).',
      globally_scoped: false,
      subtype_field: null,
      allowed_subtypes: null,
    },
    product_name: {
      type: 'product_name',
      entity_type: 'product',
      table: 'product',
      column: 'name',
      profile: 'ProductName',
      uniqueness_today_fa: 'هیچ قیدِ یکتایی.',
      globally_scoped: false,
      subtype_field: null,
      allowed_subtypes: null,
    },
    product_name_latin: {
      type: 'product_name_latin',
      entity_type: 'product',
      table: 'product',
      column: 'name_latin',
      profile: 'ProductNameLatin',
      uniqueness_today_fa: 'هیچ قیدِ یکتایی.',
      globally_scoped: false,
      subtype_field: null,
      allowed_subtypes: null,
    },
    family_code: {
      type: 'family_code',
      entity_type: 'product_family',
      table: 'product_family',
      column: 'code',
      profile: 'ProductCode',
      uniqueness_today_fa: 'UNIQUE (company_id, code).',
      globally_scoped: false,
      subtype_field: null,
      allowed_subtypes: null,
    },
    category_code: {
      type: 'category_code',
      entity_type: 'product_category',
      table: 'product_category',
      column: 'code',
      profile: 'ProductCode',
      uniqueness_today_fa: 'UNIQUE (company_id, code).',
      globally_scoped: false,
      subtype_field: null,
      allowed_subtypes: null,
    },
    variant_signature: {
      type: 'variant_signature',
      entity_type: 'product',
      table: 'product',
      column: 'variant_signature',
      profile: 'Exact',
      uniqueness_today_fa: 'UNIQUE (family_id, variant_signature) فقط در همان خانواده؛ SKUهای بی‌خانواده خارج‌اند.',
      globally_scoped: false,
      subtype_field: null,
      allowed_subtypes: null,
    },
    alias: {
      type: 'alias',
      entity_type: 'product',
      table: 'product_alias',
      column: 'alias',
      profile: 'ProductAlias',
      uniqueness_today_fa:
        'UNIQUE (product_id, alias_norm)؛ لایهٔ سرویس برای همان شرکت ۴۰۹ می‌دهد (عملاً یکتای شرکتی در عملیاتِ افزودن).',
      globally_scoped: false,
      subtype_field: 'kind',
      allowed_subtypes: ALIAS_KINDS,
    },
    barcode: {
      type: 'barcode',
      entity_type: 'product',
      table: 'product_barcode',
      column: 'barcode',
      profile: 'Barcode',
      uniqueness_today_fa:
        'نوع‌محور — gs1_ean13/ean8/upc/itf14: یکتای جهانی (uq_product_barcode_gs1) · internal/other: یکتای شرکتی (uq_product_barcode_internal) · همیشه UNIQUE (product_id, barcode).',
      globally_scoped: false, // به subtype وابسته است — effectiveScope() تصمیم می‌گیرد
      subtype_field: 'kind',
      allowed_subtypes: BARCODE_KINDS,
    },
    packaging_barcode: {
      type: 'packaging_barcode',
      // entity_id این ردیف‌ها شناسهٔ **کالای مالکِ بسته‌بندی** است (نمایندهٔ محصول)، نه شناسهٔ خودِ ردیفِ بسته‌بندی.
      entity_type: 'product',
      table: 'product_packaging',
      column: 'barcode',
      profile: 'Barcode',
      uniqueness_today_fa:
        'بازنماییِ قدیمی — UNIQUE سراسری روی همان جدول (uq_product_barcode WHERE barcode IS NOT NULL).',
      globally_scoped: true,
      subtype_field: null,
      allowed_subtypes: null,
    },
  });

/** گفتگوی سازگاریِ معکوس: هر نوع ⇒ موجودیت/جدولِ آن — برای تحلیل و مستندسازی */
export function registryEntry(t: IdentityType): IdentityTypeDescriptor {
  const e = IDENTITY_TYPE_REGISTRY[t];
  if (!e) throw new Error(`unknown identity type: ${String(t)}`);
  return e;
}

// ---------------------------------------------------------------------------
// ۲) ردیفِ ورودی (از DB در تولید؛ از fixture ساختگی در تست)
// ---------------------------------------------------------------------------

export type RowEntityType = 'product' | 'product_family' | 'product_category';

export interface CrossTypeRow {
  readonly entity_id: string;
  /** نوعِ موجودیتِ مالکِ مقدار — برای تشخیصِ «همان‌موجودیت» بودن در جفت‌هایِ بین‌نوعی */
  readonly entity_type: RowEntityType;
  readonly company_id: string;
  /** دامنهٔ کسب‌وکار داخلِ شرکت؛ پیش‌فرض company_id */
  readonly domain_id?: string;
  readonly identity_type: IdentityType;
  /** زیرنوع (kind) برای alias و barcode؛ برای بقیه null/غایب */
  readonly subtype?: string | null;
  /** دستهٔ کالای مالک — برای حاشیه‌نویسی « across_categories » */
  readonly category_id?: string | null;
  /** خانوادهٔ مالک — برای variant_signature */
  readonly family_id?: string | null;
  /** مقدارِ نمایشی — هرگز بازنویسی نمی‌شود */
  readonly display_value: string;
  /** مقدارِ نرمال‌شدهٔ فعلیِ ذخیره‌شده — برای ردیابی، نه برای تصحیح */
  readonly stored_normalized: string;
  /** شناسهٔ ردیفِ منبع (مثلاً 'product_barcode:9f1…') */
  readonly source_ref: string;
}

/** دامنهٔ اثرِ یک ردیف — تصمیم‌گیری قطعی بر پایهٔ subtype برای بارکد */
export function effectiveScope(row: Pick<CrossTypeRow, 'identity_type' | 'subtype'>): 'global' | 'company' {
  if (row.identity_type === 'packaging_barcode') return 'global';
  if (row.identity_type === 'barcode' && isGs1Kind(row.subtype)) return 'global';
  return 'company';
}

// ---------------------------------------------------------------------------
// ۳) فضاهای مقایسه — فضای جدید `gs1` افزوده می‌شود؛ بقیه از C13 می‌آیند
// ---------------------------------------------------------------------------

const SPACE_FAIL = (reason: string): SpaceResult => ({ ok: false, key: null, reason });

/** ارقامِ فارسی/عربی → لاتین، با حفظِ صفرِ ابتدایی */
function foldDigitsKeepZeros(s: string): string {
  return s
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

/**
 * برگرداندنِ کلیدِ GS1 با تاکردنِ UPC-A → EAN-13.
 * «۰» ابتدایی به UPC اضافه می‌شود تا «012345678901» و «0012345678901» یکی شوند.
 * طولِ ۸/۱۲/۱۳/۱۴ به ترتیب EAN-8، UPC-A، EAN-13، ITF-14 (GTIN-14) است.
 */
export function foldUpcToEan(digits: string): string {
  if (/^\d{12}$/.test(digits)) return `0${digits}`;
  if (/^\d{11}$/.test(digits)) return `00${digits}`; // UPC-E فشرده‌شده نیست؛ فقط ۱۲ رقمی تا می‌شود
  return digits;
}

export interface Gs1SpaceResult extends SpaceResult {
  /** آیا تاکردنِ UPC→EAN اعمال شد؟ */
  readonly folded: boolean;
  /** فقط ارقام است؟ */
  readonly digits_only: boolean;
  readonly length: number;
}

/**
 * فضای **gs1** — آن چیزی که یک پایانهٔ GS1 resolve می‌کند.
 * NFKC → ارقامِ لاتین → حذفِ فاصله/خط‌تیره → فقط ارقام مجاز → تاکردنِ UPC→EAN.
 * طول اعتبارسنجی **نمی‌شود** (آن کارِ لایهٔ data-quality و سیاستِ آینده است)؛
 * این‌جا فقط کلیدِ مقایسه ساخته می‌شود تا گروه‌سازی قطعی بماند.
 */
export function gs1Space(input: string): Gs1SpaceResult {
  const base = foldDigitsKeepZeros(String(input).normalize('NFKC')).toLowerCase().replace(/[\s\u200B_.\-]+/g, '');
  if (base.length === 0) return { ok: false, key: null, reason: 'empty_after_normalization', folded: false, digits_only: true, length: 0 };
  if (base.length > 64) return { ok: false, key: null, reason: 'too_long', folded: false, digits_only: /^\d+$/.test(base), length: base.length };
  const digitsOnly = /^\d+$/.test(base);
  if (!digitsOnly) return { ok: false, key: null, reason: 'invalid_character', folded: false, digits_only: false, length: base.length };
  const foldedKey = foldUpcToEan(base);
  return { ok: true, key: foldedKey, reason: null, folded: foldedKey !== base, digits_only: true, length: base.length };
}

/**
 * فضای **exact** — بدونِ هیچ نرمال‌سازی‌ای جز NFC و trim.
 * فقط برای `variant_signature` که امضای قطعی و ساخته‌شده توسطِ سرویس است؛
 * نرمال‌سازیِ اضافه می‌تواند دو امضای واقعاً متفاوت را یکی کند.
 */
export function exactSpace(input: string): SpaceResult {
  const key = String(input).normalize('NFC').trim();
  if (key.length === 0) return SPACE_FAIL('empty_after_normalization');
  if (key.length > 512) return SPACE_FAIL('too_long');
  if (/[\u0000-\u001F\u007F]/.test(key)) return SPACE_FAIL('invalid_character');
  return { ok: true, key, reason: null };
}

/**
 * رقمِ کنترلیِ GS1 (GTIN mod-10) — برای policy `POL-GS1-CHECKDIGIT-01` و data-quality.
 * ورودی باید فقط ارقام و با طولِ ۸/۱۲/۱۳/۱۴ باشد؛ در غیر این‌صورت false.
 */
export function gs1CheckDigitOk(digits: string): boolean {
  if (!/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(digits)) return false;
  const check = Number(digits[digits.length - 1]);
  let sum = 0;
  for (let i = 0; i < digits.length - 1; i += 1) {
    const d = Number(digits[i]);
    const posFromRight = digits.length - 1 - i; // ۱-مبنا از راست برای ارقامِ داده
    sum += d * (posFromRight % 2 === 1 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === check;
}

/**
 * فضای **scan_pad** — مانند `scan` ولی با تاکردنِ UPC-A → EAN-13 برای کلیدهایِ
 * کاملاً رقمیِ ۱۲ رقمی. این‌جاست که هم‌ارزیِ «012345678901» (UPC) و «0012345678901»
 * (EAN-13) دیده می‌شود — بدونِ آنکه معنای فضای scan در قراردادِ c13.1 تغییر کند.
 */
export function scanPadSpace(input: string): SpaceResult {
  const res = scanSpace(input);
  if (!res.ok || !res.key) return res;
  const key = /^\d{12}$/.test(res.key) ? `0${res.key}` : res.key;
  return { ok: true, key, reason: null };
}

export type CrossTypeSpaceId = 'field' | 'scan' | 'scan_pad' | 'alnum' | 'text' | 'gs1' | 'exact';

/** کلیدِ یک ردیف در یک فضای مقایسه؛ `field` برای انواع به پروفایلِ خودشان نگاشت می‌شود */
export function crossTypeComparisonKey(
  space: CrossTypeSpaceId,
  row: CrossTypeRow,
): SpaceResult | Gs1SpaceResult {
  switch (space) {
    case 'field': {
      if (row.identity_type === 'variant_signature') return exactSpace(row.display_value);
      const profile = registryEntry(row.identity_type).profile as NormalizationProfileId;
      const r = keyFor(profile, row.display_value) as { ok: boolean; key?: string; failure?: { code: string } };
      if (r.ok === true) return { ok: true, key: r.key as string, reason: null };
      return SPACE_FAIL(r.failure?.code ?? 'unknown');
    }
    case 'scan':
      return scanSpace(row.display_value);
    case 'scan_pad':
      return scanPadSpace(row.display_value);
    case 'alnum':
      return alnumSpace(row.display_value);
    case 'text':
      return textSpace(row.display_value);
    case 'gs1':
      return gs1Space(row.display_value);
    case 'exact':
      return exactSpace(row.display_value);
    default:
      throw new Error(`unknown space: ${String(space)}`);
  }
}

// ---------------------------------------------------------------------------
// ۴) جدولِ اعلانیِ قواعد — ۴۵ جفت (۹ هم‌نوعی + ۳۶ بین‌نوعی)، هیچ جفتی تعریف‌نشده نمی‌ماند
// ---------------------------------------------------------------------------

export const CROSS_TYPE_DECISIONS = [
  'HARD_CONFLICT',
  'SOFT_CONFLICT',
  'MANUAL_REVIEW',
  'ALLOWED',
  'NOT_COMPARABLE',
] as const;
export type CrossTypeDecision = (typeof CROSS_TYPE_DECISIONS)[number];
export type CrossTypeSeverity = 'hard' | 'soft' | 'review' | 'none';

/** `company` = فقط درونِ شرکت گزارش می‌شود · `both` = شرکتی + بین‌شرکتی (با redaction) */
export type RuleScope = 'company' | 'both';

export interface CrossTypeRule {
  readonly rule_id: string;
  readonly types: readonly [IdentityType, IdentityType];
  readonly space: CrossTypeSpaceId;
  readonly scope: RuleScope;
  readonly decision: CrossTypeDecision;
  readonly severity: CrossTypeSeverity;
  readonly confidence: 'high' | 'medium' | 'low';
  /** ۰ = کاملاً روشن · ۱ = کاملاً مبهم */
  readonly ambiguity: number;
  readonly explanation_fa: string;
  readonly recommended_resolution_fa: string;
  readonly requires_owner_approval: boolean;
  readonly rationale_fa: string;
  /** آیا قید/رفتارِ فعلی این گروه را ناممکن می‌سازد؟ (yes) یا نه (no) */
  readonly visible_under_current_constraints: 'yes' | 'no' | 'conditional';
  /** سیاست‌هایِ آینده‌ای که این یافته را نقض می‌کنند (شناسهٔ POL-*) */
  readonly future_policy_ids: readonly string[];
}

/** کلیدِ متعارفِ یک جفت‌نوع، مستقل از ترتیب */
export function crossTypePairKey(a: IdentityType, b: IdentityType): string {
  return [a, b].sort().join('~');
}

const SAME = (t: IdentityType): readonly [IdentityType, IdentityType] => [t, t];
const XT = (a: IdentityType, b: IdentityType): readonly [IdentityType, IdentityType] => [a, b];

const HUMAN = 'بازبینیِ دستی توسطِ مالکِ داده؛ هیچ اقدامِ خودکاری مجاز نیست.';
const HUMAN_FIX_CODE = 'بازبینیِ دستی؛ اگر دو کالا عمداً شناسهٔ یکسان دارند، یکی باید تغییر کند — با تصمیمِ انسان، نه با اسکریپت.';
const FC = 'C13X — قراردادِ `c13xt.1`';

export const CROSS_TYPE_RULES: readonly CrossTypeRule[] = [
  // ── هم‌نوعی ──────────────────────────────────────────────────────────
  {
    rule_id: 'C13X-R-pc-pc', types: SAME('product_code'), space: 'field', scope: 'company',
    decision: 'HARD_CONFLICT', severity: 'hard', confidence: 'high', ambiguity: 0.05,
    explanation_fa: 'دو کالای متمایز در یک شرکت کدِ یکسان (پس از نرمال‌سازیِ نامحسوسِ C11) دارند؛ قیدِ DB حساس به حروف است و این جفت را نمی‌گیرد (D-C11-3).',
    recommended_resolution_fa: HUMAN_FIX_CODE, requires_owner_approval: true,
    rationale_fa: `${FC}: ناسازگاریِ واقعیِ امروز — بررسیِ اپلیکیشن نامحسوس، قیدِ دیتابیس حساس به حروف.`,
    visible_under_current_constraints: 'no', future_policy_ids: ['POL-CODE-CI-01'],
  },
  {
    rule_id: 'C13X-R-pn-pn', types: SAME('product_name'), space: 'field', scope: 'company',
    decision: 'SOFT_CONFLICT', severity: 'soft', confidence: 'medium', ambiguity: 0.4,
    explanation_fa: 'دو کالای متمایز نامِ فارسیِ یکسان دارند؛ نام می‌تواند مشروعاً مشترک باشد (مثلاً دو برند هم‌نام).',
    recommended_resolution_fa: 'هشدارِ نرم؛ خالی است. فقط اگر مسیرِ جست‌وجو/صورت‌حساب گیج می‌کند بررسی شود.',
    requires_owner_approval: false,
    rationale_fa: `${FC}: نام، شناسهٔ یکتا نیست و نباید باشد.`,
    visible_under_current_constraints: 'no', future_policy_ids: [],
  },
  {
    rule_id: 'C13X-R-pnl-pnl', types: SAME('product_name_latin'), space: 'field', scope: 'company',
    decision: 'SOFT_CONFLICT', severity: 'soft', confidence: 'medium', ambiguity: 0.4,
    explanation_fa: 'دو کالای متمایز نامِ لاتینِ یکسان دارند؛ همان منطقِ نامِ فارسی.',
    recommended_resolution_fa: 'هشدارِ نرم؛ بررسی فقط اگر جست‌وجوی لاتین مبهم می‌شود.',
    requires_owner_approval: false,
    rationale_fa: `${FC}: نام، شناسهٔ یکتا نیست.`,
    visible_under_current_constraints: 'no', future_policy_ids: [],
  },
  {
    rule_id: 'C13X-R-fc-fc', types: SAME('family_code'), space: 'field', scope: 'company',
    decision: 'MANUAL_REVIEW', severity: 'review', confidence: 'high', ambiguity: 0.1,
    explanation_fa: 'دو خانوادهٔ محصول در یک شرکت کدِ یکسان دارند؛ قیدِ UNIQUE (company_id, code) امروز این را ناممکن می‌سازد — پس یافتنِ آن یعنی drift داده یا حذفِ ایندکس.',
    recommended_resolution_fa: 'بررسیِ سلامتِ قید/ایندکس و دو خانواده؛ اصلاح فقط با تصمیمِ انسان.',
    requires_owner_approval: true,
    rationale_fa: `${FC}: یافتهٔ «ناممکن» نشانهٔ انحراف از قرارداد است، نه یکتاییِ معمولی.`,
    visible_under_current_constraints: 'yes', future_policy_ids: [],
  },
  {
    rule_id: 'C13X-R-cc-cc', types: SAME('category_code'), space: 'field', scope: 'company',
    decision: 'MANUAL_REVIEW', severity: 'review', confidence: 'high', ambiguity: 0.1,
    explanation_fa: 'دو دستهٔ کالا در یک شرکت کدِ یکسان دارند؛ قیدِ UNIQUE (company_id, code) امروز این را ناممکن می‌سازد — drift داده یا حذفِ ایندکس.',
    recommended_resolution_fa: 'بررسیِ سلامتِ قید/ایندکس و دو دسته؛ اصلاح فقط با تصمیمِ انسان.',
    requires_owner_approval: true,
    rationale_fa: `${FC}: یافتهٔ «ناممکن» نشانهٔ انحراف از قرارداد است.`,
    visible_under_current_constraints: 'yes', future_policy_ids: [],
  },
  {
    rule_id: 'C13X-R-vs-vs', types: SAME('variant_signature'), space: 'exact', scope: 'company',
    decision: 'MANUAL_REVIEW', severity: 'review', confidence: 'medium', ambiguity: 0.2,
    explanation_fa: 'دو کالا امضای variant یکسان دارند؛ قیدِ فعلی فقط در همان خانواده اعمال می‌شود — امضای یکسان در دو خانواده، ابهامِ variant بین‌خانواده‌ای می‌سازد.',
    recommended_resolution_fa: 'بازبینیِ دستی؛ اگر دو خانواده عمداً variantهای هم‌نام دارند مجاز اعلام شود.',
    requires_owner_approval: true,
    rationale_fa: `${FC}: امضا در دامنهٔ خانواده یکتاست، نه شرکتی.`,
    visible_under_current_constraints: 'conditional', future_policy_ids: [],
  },
  {
    rule_id: 'C13X-R-al-al', types: SAME('alias'), space: 'field', scope: 'company',
    decision: 'HARD_CONFLICT', severity: 'hard', confidence: 'high', ambiguity: 0.05,
    explanation_fa: 'یک نام جایگزین (پس از نرمال‌سازی) برای بیش از یک کالای متمایز در همین شرکت ثبت شده است؛ لایهٔ سرویس افزودنِ تازه را با ۴۰۹ رد می‌کند، پس این‌ها بدهیِ دادهٔ گذشته‌اند.',
    recommended_resolution_fa: HUMAN_FIX_CODE, requires_owner_approval: true,
    rationale_fa: `${FC}: رفتارِ اپلیکیشن سخت‌گیر است ولی دادهٔ تاریخی می‌تواند متناقض باشد.`,
    visible_under_current_constraints: 'no', future_policy_ids: ['POL-ALIAS-COMPANY-01'],
  },
  {
    rule_id: 'C13X-R-bc-bc', types: SAME('barcode'), space: 'scan_pad', scope: 'both',
    decision: 'HARD_CONFLICT', severity: 'hard', confidence: 'high', ambiguity: 0.05,
    explanation_fa: 'دو کالای متمایز بارکدِ یکسان (پس از حذفِ جداکننده‌ها) دارند. اگر همه gs1 باشند قیدِ جهانی باید جلویشان را گرفته باشد (drift داده)؛ اگر mixed/internal باشد هیچ قیدی این هم‌پوشانی را نمی‌گیرد — «کورِ قید».',
    recommended_resolution_fa: HUMAN_FIX_CODE, requires_owner_approval: true,
    rationale_fa: `${FC}: scan ambiguation + «کورِ قید» بین نوع‌های gs1 و internal/other.`,
    visible_under_current_constraints: 'conditional', future_policy_ids: ['POL-BARCODE-XKIND-01'],
  },
  {
    rule_id: 'C13X-R-pb-pb', types: SAME('packaging_barcode'), space: 'scan_pad', scope: 'both',
    decision: 'MANUAL_REVIEW', severity: 'review', confidence: 'high', ambiguity: 0.1,
    explanation_fa: 'دو ردیفِ بارکدِ بسته‌بندی (مخزنِ قدیمی) مقدارِ یکسان دارند؛ قیدِ uq_product_barcode روی همان جدول جهانی است — یافتنِ آن یعنی drift داده یا حذفِ ایندکس.',
    recommended_resolution_fa: 'بررسیِ سلامتِ ایندکس و دو ردیفِ بسته‌بندی؛ اصلاح فقط با تصمیمِ انسان.',
    requires_owner_approval: true,
    rationale_fa: `${FC}: یافتهٔ «ناممکن» نشانهٔ انحراف از قرارداد است.`,
    visible_under_current_constraints: 'yes', future_policy_ids: ['POL-PACKAGING-CANON-01'],
  },
  // ── بین‌نوعی: product_code ↔ … ───────────────────────────────────────
  {
    rule_id: 'C13X-R-pc-pn', types: XT('product_name', 'product_code'), space: 'alnum', scope: 'company',
    decision: 'MANUAL_REVIEW', severity: 'review', confidence: 'medium', ambiguity: 0.5,
    explanation_fa: 'کدِ کالا با نامِ کالای دیگری یکی است؛ اسکن/جست‌وجو می‌تواند بینِ «کد» و «نام» گیج شود.',
    recommended_resolution_fa: 'بازبینیِ دستی؛ اگر عمداً یکی‌اند مجاز اعلام شود.',
    requires_owner_approval: false, rationale_fa: `${FC}: هم‌سویی با قاعدهٔ code↔name در قراردادِ c13.1.`,
    visible_under_current_constraints: 'no', future_policy_ids: [],
  },
  {
    rule_id: 'C13X-R-pc-pnl', types: XT('product_code', 'product_name_latin'), space: 'alnum', scope: 'company',
    decision: 'MANUAL_REVIEW', severity: 'review', confidence: 'medium', ambiguity: 0.5,
    explanation_fa: 'کدِ کالا با نامِ لاتینِ کالای دیگری یکی است؛ همان ابهامِ code↔name در لایهٔ لاتین.',
    recommended_resolution_fa: 'بازبینیِ دستی؛ بررسیِ اینکه جست‌وجوی لاتین گیج نمی‌شود.',
    requires_owner_approval: false, rationale_fa: `${FC}: هم‌سویی با قراردادِ c13.1.`,
    visible_under_current_constraints: 'no', future_policy_ids: [],
  },
  {
    rule_id: 'C13X-R-pc-fc', types: XT('family_code', 'product_code'), space: 'alnum', scope: 'company',
    decision: 'MANUAL_REVIEW', severity: 'review', confidence: 'medium', ambiguity: 0.6,
    explanation_fa: 'کدِ کالا با کدِ خانوادهٔ محصول یکی است؛ دو نیم‌فضای نام‌گذاریِ کد در یک فضای جست‌وجوی مدیریتِ کاتالوگ قرار می‌گیرند.',
    recommended_resolution_fa: 'بازبینیِ دستی؛ تصمیمِ سیاستی لازم است: آیا پیشوند/فضای جدا برای کدِ خانواده اجباری شود؟',
    requires_owner_approval: true,
    rationale_fa: `${FC}: ابهامِ نام‌گذاری بینِ دو نوعِ «کد» — نیازمندِ تصمیمِ مالک، نه فقط بررسیِ فنی.`,
    visible_under_current_constraints: 'no', future_policy_ids: [],
  },
  {
    rule_id: 'C13X-R-pc-cc', types: XT('category_code', 'product_code'), space: 'alnum', scope: 'company',
    decision: 'MANUAL_REVIEW', severity: 'review', confidence: 'medium', ambiguity: 0.6,
    explanation_fa: 'کدِ کالا با کدِ دستهٔ کالا یکی است؛ در پنل‌های مدیریت که هر دو را می‌پذیرند، انتخاب می‌تواند اشتباه resolve شود.',
    recommended_resolution_fa: 'بازبینیِ دستی؛ جداسازیِ فضای نامِ کدهای دسته از کدهای کالا نیازمندِ تصمیمِ مالک است.',
    requires_owner_approval: true,
    rationale_fa: `${FC}: ابهامِ نام‌گذاری بینِ دو نوعِ «کد» در سطوحِ مختلفِ کاتالوگ.`,
    visible_under_current_constraints: 'no', future_policy_ids: [],
  },
  {
    rule_id: 'C13X-R-pc-vs', types: XT('product_code', 'variant_signature'), space: 'exact', scope: 'company',
    decision: 'NOT_COMPARABLE', severity: 'none', confidence: 'high', ambiguity: 0,
    explanation_fa: 'کدِ کالا و امضای variant دو معنای کاملاً متفاوت دارند؛ یکسان‌شدنِ ظاهری تعارض محسوب نمی‌شود.',
    recommended_resolution_fa: 'هیچ اقدامی لازم نیست.',
    requires_owner_approval: false,
    rationale_fa: `${FC}: هر شباهتِ متنی تعارض نیست (اصلِ c13.1 حفظ شد).`,
    visible_under_current_constraints: 'no', future_policy_ids: [],
  },
  {
    rule_id: 'C13X-R-pc-al', types: XT('alias', 'product_code'), space: 'alnum', scope: 'company',
    decision: 'HARD_CONFLICT', severity: 'hard', confidence: 'high', ambiguity: 0.1,
    explanation_fa: 'نام جایگزین با کدِ کالای دیگری یکسان است؛ اسکن/جست‌وجوی «کد» می‌تواند کالای اشتباه را resolve کند.',
    recommended_resolution_fa: HUMAN_FIX_CODE, requires_owner_approval: true,
    rationale_fa: `${FC}: هم‌سویی با alias↔code در قراردادِ c13.1 (HARD_CONFLICT).`,
    visible_under_current_constraints: 'no', future_policy_ids: [],
  },
  {
    rule_id: 'C13X-R-pc-bc', types: XT('barcode', 'product_code'), space: 'scan_pad', scope: 'both',
    decision: 'HARD_CONFLICT', severity: 'hard', confidence: 'high', ambiguity: 0.05,
    explanation_fa: 'کدِ یک کالا با بارکدِ کالای دیگر یکی است؛ در اسکن، بارکد همیشه بر کد اولویت دارد و کدِ آن کالا عملاً «سایه» می‌شود.',
    recommended_resolution_fa: HUMAN_FIX_CODE, requires_owner_approval: true,
    rationale_fa: `${FC}: هم‌سویی با barcode↔code در قراردادِ c13.1 + ترتیب اولویتِ scan (barcode→code→alias).`,
    visible_under_current_constraints: 'no', future_policy_ids: ['POL-BARCODE-XKIND-01'],
  },
  {
    rule_id: 'C13X-R-pc-pb', types: XT('packaging_barcode', 'product_code'), space: 'scan_pad', scope: 'both',
    decision: 'HARD_CONFLICT', severity: 'hard', confidence: 'high', ambiguity: 0.05,
    explanation_fa: 'بارکدِ بسته‌بندی (مخزنِ قدیمی) با کدِ کالایی دیگر یکی است؛ اسکن آن بارکد را به بسته‌بندیِ کالای دیگر resolve می‌کند و کد سایه می‌شود.',
    recommended_resolution_fa: HUMAN_FIX_CODE, requires_owner_approval: true,
    rationale_fa: `${FC}: barcode(legacy)↔code — بازنماییِ دیگر برای همان ابهام.`,
    visible_under_current_constraints: 'no', future_policy_ids: ['POL-PACKAGING-CANON-01'],
  },
  // ── بین‌نوعی: product_name ↔ … ───────────────────────────────────────
  {
    rule_id: 'C13X-R-pn-pnl', types: XT('product_name', 'product_name_latin'), space: 'text', scope: 'company',
    decision: 'MANUAL_REVIEW', severity: 'review', confidence: 'medium', ambiguity: 0.6,
    explanation_fa: 'نامِ فارسی و نامِ لاتین دقیقاً یکی هستند؛ معمولاً دو بازنماییِ مشروعِ همان کالا هستند، نه تعارض.',
    recommended_resolution_fa: 'بازبینیِ دستی؛ اگر یک کالا هر دو را دارد مجاز است.',
    requires_owner_approval: true,
    rationale_fa: `${FC}: هم‌سویی با name↔name_latin در قراردادِ c13.1 (MANUAL_REVIEW).`,
    visible_under_current_constraints: 'no', future_policy_ids: [],
  },
  {
    rule_id: 'C13X-R-pn-fc', types: XT('family_code', 'product_name'), space: 'alnum', scope: 'company',
    decision: 'MANUAL_REVIEW', severity: 'review', confidence: 'low', ambiguity: 0.6,
    explanation_fa: 'نامِ کالا با کدِ خانواده یکی است؛ در پنل‌هایی که هر دو را می‌پذیرند می‌تواند مبهم resolve شود.',
    recommended_resolution_fa: 'بازبینیِ دستی.',
    requires_owner_approval: false, rationale_fa: `${FC}: الگوی code↔name تعمیم‌یافته.`,
    visible_under_current_constraints: 'no', future_policy_ids: [],
  },
  {
    rule_id: 'C13X-R-pn-cc', types: XT('category_code', 'product_name'), space: 'alnum', scope: 'company',
    decision: 'MANUAL_REVIEW', severity: 'review', confidence: 'low', ambiguity: 0.6,
    explanation_fa: 'نامِ کالا با کدِ دسته یکی است؛ در پنل‌های مدیریت می‌تواند مبهم resolve شود.',
    recommended_resolution_fa: 'بازبینیِ دستی.',
    requires_owner_approval: false, rationale_fa: `${FC}: الگوی code↔name تعمیم‌یافته.`,
    visible_under_current_constraints: 'no', future_policy_ids: [],
  },
  {
    rule_id: 'C13X-R-pn-vs', types: XT('product_name', 'variant_signature'), space: 'exact', scope: 'company',
    decision: 'NOT_COMPARABLE', severity: 'none', confidence: 'high', ambiguity: 0,
    explanation_fa: 'نام و امضای variant دو معنای متفاوت دارند؛ یکسان‌شدن تعارض نیست.',
    recommended_resolution_fa: 'هیچ اقدامی لازم نیست.',
    requires_owner_approval: false, rationale_fa: `${FC}: اصلِ c13.1.`,
    visible_under_current_constraints: 'no', future_policy_ids: [],
  },
  {
    rule_id: 'C13X-R-pn-al', types: XT('alias', 'product_name'), space: 'text', scope: 'company',
    decision: 'SOFT_CONFLICT', severity: 'soft', confidence: 'high', ambiguity: 0.2,
    explanation_fa: 'نام جایگزین با نامِ کالای دیگری یکی است؛ نام می‌تواند مشروعاً مشترک باشد.',
    recommended_resolution_fa: 'هشدارِ نرم؛ بررسی فقط در ابهام.',
    requires_owner_approval: false,
    rationale_fa: `${FC}: هم‌سویی با alias↔name در قراردادِ c13.1 (SOFT_CONFLICT).`,
    visible_under_current_constraints: 'no', future_policy_ids: [],
  },
  {
    rule_id: 'C13X-R-pn-bc', types: XT('barcode', 'product_name'), space: 'scan_pad', scope: 'both',
    decision: 'NOT_COMPARABLE', severity: 'none', confidence: 'high', ambiguity: 0,
    explanation_fa: 'نامِ عددی و بارکد دو جهانِ متفاوت‌اند؛ یکسان‌شدن تعارض محسوب نمی‌شود.',
    recommended_resolution_fa: 'هیچ اقدامی لازم نیست.',
    requires_owner_approval: false,
    rationale_fa: `${FC}: هم‌سویی با barcode↔name = NOT_COMPARABLE در قراردادِ c13.1.`,
    visible_under_current_constraints: 'no', future_policy_ids: [],
  },
  {
    rule_id: 'C13X-R-pn-pb', types: XT('packaging_barcode', 'product_name'), space: 'scan_pad', scope: 'both',
    decision: 'NOT_COMPARABLE', severity: 'none', confidence: 'high', ambiguity: 0,
    explanation_fa: 'نامِ عددی و بارکدِ بسته‌بندی دو جهانِ متفاوت‌اند؛ یکسان‌شدن تعارض محسوب نمی‌شود.',
    recommended_resolution_fa: 'هیچ اقدامی لازم نیست.',
    requires_owner_approval: false, rationale_fa: `${FC}: اصلِ c13.1 (بارکد ↔ نام عددی).`,
    visible_under_current_constraints: 'no', future_policy_ids: [],
  },
  // ── بین‌نوعی: product_name_latin ↔ … ─────────────────────────────────
  {
    rule_id: 'C13X-R-pnl-fc', types: XT('family_code', 'product_name_latin'), space: 'alnum', scope: 'company',
    decision: 'MANUAL_REVIEW', severity: 'review', confidence: 'low', ambiguity: 0.6,
    explanation_fa: 'نامِ لاتین با کدِ خانواده یکی است؛ می‌تواند مبهم باشد.',
    recommended_resolution_fa: 'بازبینیِ دستی.',
    requires_owner_approval: false, rationale_fa: `${FC}: الگوی code↔name تعمیم‌یافته.`,
    visible_under_current_constraints: 'no', future_policy_ids: [],
  },
  {
    rule_id: 'C13X-R-pnl-cc', types: XT('category_code', 'product_name_latin'), space: 'alnum', scope: 'company',
    decision: 'MANUAL_REVIEW', severity: 'review', confidence: 'low', ambiguity: 0.6,
    explanation_fa: 'نامِ لاتین با کدِ دسته یکی است؛ می‌تواند مبهم باشد.',
    recommended_resolution_fa: 'بازبینیِ دستی.',
    requires_owner_approval: false, rationale_fa: `${FC}: الگوی code↔name تعمیم‌یافته.`,
    visible_under_current_constraints: 'no', future_policy_ids: [],
  },
  {
    rule_id: 'C13X-R-pnl-vs', types: XT('product_name_latin', 'variant_signature'), space: 'exact', scope: 'company',
    decision: 'NOT_COMPARABLE', severity: 'none', confidence: 'high', ambiguity: 0,
    explanation_fa: 'نامِ لاتین و امضای variant دو معنای متفاوت دارند.',
    recommended_resolution_fa: 'هیچ اقدامی لازم نیست.',
    requires_owner_approval: false, rationale_fa: `${FC}: اصلِ c13.1.`,
    visible_under_current_constraints: 'no', future_policy_ids: [],
  },
  {
    rule_id: 'C13X-R-pnl-al', types: XT('alias', 'product_name_latin'), space: 'text', scope: 'company',
    decision: 'SOFT_CONFLICT', severity: 'soft', confidence: 'high', ambiguity: 0.2,
    explanation_fa: 'نام جایگزین با نامِ لاتینِ کالای دیگری یکی است.',
    recommended_resolution_fa: 'هشدارِ نرم.',
    requires_owner_approval: false,
    rationale_fa: `${FC}: هم‌سویی با alias↔name_latin در قراردادِ c13.1 (SOFT_CONFLICT).`,
    visible_under_current_constraints: 'no', future_policy_ids: [],
  },
  {
    rule_id: 'C13X-R-pnl-bc', types: XT('barcode', 'product_name_latin'), space: 'scan_pad', scope: 'both',
    decision: 'NOT_COMPARABLE', severity: 'none', confidence: 'high', ambiguity: 0,
    explanation_fa: 'نامِ لاتینِ عددی و بارکد دو جهانِ متفاوت‌اند.',
    recommended_resolution_fa: 'هیچ اقدامی لازم نیست.',
    requires_owner_approval: false, rationale_fa: `${FC}: هم‌سویی با c13.1.`,
    visible_under_current_constraints: 'no', future_policy_ids: [],
  },
  {
    rule_id: 'C13X-R-pnl-pb', types: XT('packaging_barcode', 'product_name_latin'), space: 'scan_pad', scope: 'both',
    decision: 'NOT_COMPARABLE', severity: 'none', confidence: 'high', ambiguity: 0,
    explanation_fa: 'نامِ لاتینِ عددی و بارکدِ بسته‌بندی دو جهانِ متفاوت‌اند.',
    recommended_resolution_fa: 'هیچ اقدامی لازم نیست.',
    requires_owner_approval: false, rationale_fa: `${FC}: هم‌سویی با c13.1.`,
    visible_under_current_constraints: 'no', future_policy_ids: [],
  },
  // ── بین‌نوعی: family_code ↔ … ────────────────────────────────────────
  {
    rule_id: 'C13X-R-fc-cc', types: XT('category_code', 'family_code'), space: 'alnum', scope: 'company',
    decision: 'MANUAL_REVIEW', severity: 'review', confidence: 'medium', ambiguity: 0.6,
    explanation_fa: 'کدِ خانواده و کدِ دستهٔ کالا یکی‌اند؛ دو نیم‌فضای نام‌گذاریِ «کد» در سطوحِ مختلفِ کاتالوگ بر هم می‌افتند.',
    recommended_resolution_fa: 'بازبینیِ دستی؛ تصمیمِ سیاستی دربارهٔ پیشوند/فضای نامِ کدها لازم است.',
    requires_owner_approval: true,
    rationale_fa: `${FC}: ابهامِ نام‌گذاری بینِ دو نوعِ «کد» — نیازمندِ تصمیمِ مالک.`,
    visible_under_current_constraints: 'no', future_policy_ids: [],
  },
  {
    rule_id: 'C13X-R-fc-vs', types: XT('family_code', 'variant_signature'), space: 'exact', scope: 'company',
    decision: 'NOT_COMPARABLE', severity: 'none', confidence: 'high', ambiguity: 0,
    explanation_fa: 'کدِ خانواده و امضای variant دو معنای متفاوت دارند.',
    recommended_resolution_fa: 'هیچ اقدامی لازم نیست.',
    requires_owner_approval: false, rationale_fa: `${FC}: اصلِ c13.1.`,
    visible_under_current_constraints: 'no', future_policy_ids: [],
  },
  {
    rule_id: 'C13X-R-fc-al', types: XT('alias', 'family_code'), space: 'alnum', scope: 'company',
    decision: 'MANUAL_REVIEW', severity: 'review', confidence: 'low', ambiguity: 0.5,
    explanation_fa: 'نام جایگزین با کدِ خانواده یکی است؛ در پنل‌های مدیریت می‌تواند مبهم resolve شود.',
    recommended_resolution_fa: 'بازبینیِ دستی.',
    requires_owner_approval: false, rationale_fa: `${FC}: الگوی code↔alias تعمیم‌یافته به family_code.`,
    visible_under_current_constraints: 'no', future_policy_ids: [],
  },
  {
    rule_id: 'C13X-R-fc-bc', types: XT('barcode', 'family_code'), space: 'scan_pad', scope: 'both',
    decision: 'MANUAL_REVIEW', severity: 'review', confidence: 'low', ambiguity: 0.4,
    explanation_fa: 'کدِ خانواده با بارکد یکی است؛ مسیرِ اسکن خانواده را resolve نمی‌کند، ولی ابهامِ نام‌گذاری بینِ «کد» و «بارکد» واقعی است.',
    recommended_resolution_fa: 'بازبینیِ دستی؛ بررسیِ اینکه کدهای خانوادهٔ عددی ثبت نشوند (سیاست).',
    requires_owner_approval: false,
    rationale_fa: `${FC}: بارکد عددی است؛ کدِ خانوادهٔ عددی با بارکد برخورد می‌کند.`,
    visible_under_current_constraints: 'no', future_policy_ids: ['POL-BARCODE-XKIND-01'],
  },
  {
    rule_id: 'C13X-R-fc-pb', types: XT('family_code', 'packaging_barcode'), space: 'scan_pad', scope: 'both',
    decision: 'MANUAL_REVIEW', severity: 'review', confidence: 'low', ambiguity: 0.4,
    explanation_fa: 'کدِ خانواده با بارکدِ بسته‌بندی (مخزنِ قدیمی) یکی است.',
    recommended_resolution_fa: 'بازبینیِ دستی.',
    requires_owner_approval: false, rationale_fa: `${FC}: barcode(legacy)↔code تعمیم‌یافته.`,
    visible_under_current_constraints: 'no', future_policy_ids: ['POL-PACKAGING-CANON-01'],
  },
  // ── بین‌نوعی: category_code ↔ … ──────────────────────────────────────
  {
    rule_id: 'C13X-R-cc-vs', types: XT('category_code', 'variant_signature'), space: 'exact', scope: 'company',
    decision: 'NOT_COMPARABLE', severity: 'none', confidence: 'high', ambiguity: 0,
    explanation_fa: 'کدِ دسته و امضای variant دو معنای متفاوت دارند.',
    recommended_resolution_fa: 'هیچ اقدامی لازم نیست.',
    requires_owner_approval: false, rationale_fa: `${FC}: اصلِ c13.1.`,
    visible_under_current_constraints: 'no', future_policy_ids: [],
  },
  {
    rule_id: 'C13X-R-cc-al', types: XT('alias', 'category_code'), space: 'alnum', scope: 'company',
    decision: 'MANUAL_REVIEW', severity: 'review', confidence: 'low', ambiguity: 0.5,
    explanation_fa: 'نام جایگزین با کدِ دسته یکی است؛ در پنل‌های مدیریت می‌تواند مبهم resolve شود.',
    recommended_resolution_fa: 'بازبینیِ دستی.',
    requires_owner_approval: false, rationale_fa: `${FC}: الگوی code↔alias تعمیم‌یافته.`,
    visible_under_current_constraints: 'no', future_policy_ids: [],
  },
  {
    rule_id: 'C13X-R-cc-bc', types: XT('barcode', 'category_code'), space: 'scan_pad', scope: 'both',
    decision: 'MANUAL_REVIEW', severity: 'review', confidence: 'low', ambiguity: 0.4,
    explanation_fa: 'کدِ دسته با بارکد یکی است؛ ابهامِ نام‌گذاری بینِ «کد» و «بارکد».',
    recommended_resolution_fa: 'بازبینیِ دستی.',
    requires_owner_approval: false, rationale_fa: `${FC}: بارکد عددی است؛ کدِ دستهٔ عددی با بارکد برخورد می‌کند.`,
    visible_under_current_constraints: 'no', future_policy_ids: ['POL-BARCODE-XKIND-01'],
  },
  {
    rule_id: 'C13X-R-cc-pb', types: XT('category_code', 'packaging_barcode'), space: 'scan_pad', scope: 'both',
    decision: 'MANUAL_REVIEW', severity: 'review', confidence: 'low', ambiguity: 0.4,
    explanation_fa: 'کدِ دسته با بارکدِ بسته‌بندی (مخزنِ قدیمی) یکی است.',
    recommended_resolution_fa: 'بازبینیِ دستی.',
    requires_owner_approval: false, rationale_fa: `${FC}: barcode(legacy)↔code تعمیم‌یافته.`,
    visible_under_current_constraints: 'no', future_policy_ids: ['POL-PACKAGING-CANON-01'],
  },
  // ── بین‌نوعی: variant_signature ↔ … ──────────────────────────────────
  {
    rule_id: 'C13X-R-vs-al', types: XT('alias', 'variant_signature'), space: 'exact', scope: 'company',
    decision: 'NOT_COMPARABLE', severity: 'none', confidence: 'high', ambiguity: 0,
    explanation_fa: 'امضای variant (کامپوزیت) و نام جایگزین دو معنای متفاوت دارند.',
    recommended_resolution_fa: 'هیچ اقدامی لازم نیست.',
    requires_owner_approval: false, rationale_fa: `${FC}: اصلِ c13.1.`,
    visible_under_current_constraints: 'no', future_policy_ids: [],
  },
  {
    rule_id: 'C13X-R-vs-bc', types: XT('barcode', 'variant_signature'), space: 'exact', scope: 'both',
    decision: 'NOT_COMPARABLE', severity: 'none', confidence: 'high', ambiguity: 0,
    explanation_fa: 'امضای variant و بارکد دو معنای متفاوت دارند.',
    recommended_resolution_fa: 'هیچ اقدامی لازم نیست.',
    requires_owner_approval: false, rationale_fa: `${FC}: اصلِ c13.1.`,
    visible_under_current_constraints: 'no', future_policy_ids: [],
  },
  {
    rule_id: 'C13X-R-vs-pb', types: XT('packaging_barcode', 'variant_signature'), space: 'exact', scope: 'both',
    decision: 'NOT_COMPARABLE', severity: 'none', confidence: 'high', ambiguity: 0,
    explanation_fa: 'امضای variant و بارکدِ بسته‌بندی دو معنای متفاوت دارند.',
    recommended_resolution_fa: 'هیچ اقدامی لازم نیست.',
    requires_owner_approval: false, rationale_fa: `${FC}: اصلِ c13.1.`,
    visible_under_current_constraints: 'no', future_policy_ids: [],
  },
  // ── بین‌نوعی: alias ↔ barcode/packaging ─────────────────────────────
  {
    rule_id: 'C13X-R-al-bc', types: XT('alias', 'barcode'), space: 'scan_pad', scope: 'both',
    decision: 'HARD_CONFLICT', severity: 'hard', confidence: 'high', ambiguity: 0.05,
    explanation_fa: 'نام جایگزین با بارکد (پس از حذفِ جداکننده‌ها — همان چیزی که اسکن می‌بیند) یکی است؛ اسکن دوپهلو می‌شود (یافتهٔ CF-10 در C12).',
    recommended_resolution_fa: HUMAN_FIX_CODE, requires_owner_approval: true,
    rationale_fa: `${FC}: هم‌سویی با alias↔barcode در قراردادِ c13.1 پس از اصلاحِ CF-10.`,
    visible_under_current_constraints: 'no', future_policy_ids: ['POL-BARCODE-XKIND-01'],
  },
  {
    rule_id: 'C13X-R-al-pb', types: XT('alias', 'packaging_barcode'), space: 'scan_pad', scope: 'both',
    decision: 'HARD_CONFLICT', severity: 'hard', confidence: 'high', ambiguity: 0.05,
    explanation_fa: 'نام جایگزین با بارکدِ بسته‌بندی (مخزنِ قدیمی) یکی است؛ اسکن دوپهلو می‌شود.',
    recommended_resolution_fa: HUMAN_FIX_CODE, requires_owner_approval: true,
    rationale_fa: `${FC}: alias↔barcode با بازنماییِ قدیمی.`,
    visible_under_current_constraints: 'no', future_policy_ids: ['POL-PACKAGING-CANON-01'],
  },
  // ── بین‌نوعی: بارکدِ کانونی ↔ بارکدِ بسته‌بندی ──────────────────────
  {
    rule_id: 'C13X-R-bc-pb', types: XT('barcode', 'packaging_barcode'), space: 'scan_pad', scope: 'both',
    decision: 'HARD_CONFLICT', severity: 'hard', confidence: 'high', ambiguity: 0.1,
    explanation_fa: 'یک مقدار به‌طورِ هم‌زمان در دو مخزنِ موازیِ بارکد ثبت شده: مخزنِ قدیمی (product_packaging) و مخزنِ کانونی (product_barcode) — اگر مالک متفاوت باشد، هویتِ کالا غیرقابلِ resolve است؛ اگر همان کالا باشد، افزونگی/انحراف است که مهاجرتِ ۰۰۴۶ با on conflict do nothing بی‌صدا نادیده‌اش گرفت.',
    recommended_resolution_fa: HUMAN_FIX_CODE, requires_owner_approval: true,
    rationale_fa: `${FC}: برخوردِ بین‌بازنمایی — دقیق‌ترین نمودِ «cross-type» در این اسکیما.`,
    visible_under_current_constraints: 'conditional', future_policy_ids: ['POL-PACKAGING-CANON-01', 'POL-BARCODE-XKIND-01'],
  },
];

export const CROSS_TYPE_RULE_MAP: ReadonlyMap<string, CrossTypeRule> = new Map(
  CROSS_TYPE_RULES.map((r) => [crossTypePairKey(r.types[0], r.types[1]), r]),
);

/** قاعدهٔ یک جفت؛ `undefined` یعنی جفتی که قرارداد تعریف نکرده — که برای ۹ نوع نباید پیش بیاید */
export function crossTypeRuleFor(a: IdentityType, b: IdentityType): CrossTypeRule | undefined {
  return CROSS_TYPE_RULE_MAP.get(crossTypePairKey(a, b));
}

/** فهرستِ همهٔ جفت‌های تعریف‌شده — برای تستِ پوششِ صددرصدی */
export function allCrossTypeRulePairs(): readonly string[] {
  return [...CROSS_TYPE_RULE_MAP.keys()].sort();
}


// ---------------------------------------------------------------------------
// ۵) دادهٔ ناقص/ناسازگار — هرگز کرش نمی‌کند؛ به data-quality می‌رود
// ---------------------------------------------------------------------------

export interface DataQualityFinding {
  readonly check: string;
  /** شناسهٔ ردیفِ منبع؛ هرگز مقدارِ خامِ نمایشی حمل نمی‌کند */
  readonly source_ref: string;
  readonly identity_type: string;
  readonly entity_id: string | null;
  readonly company_id: string | null;
  readonly detail_fa: string;
}

export interface PreparedRow {
  readonly row: CrossTypeRow;
  readonly ownKey: string;
}

/** کلیدِ «خودِ میدان» با پروفایلِ ثبت‌شدهٔ نوع */
export function ownTypeKey(row: CrossTypeRow): SpaceResult {
  if (row.identity_type === 'variant_signature') return exactSpace(row.display_value);
  const profile = registryEntry(row.identity_type).profile as NormalizationProfileId;
  return keyFor(profile, row.display_value) as SpaceResult;
}

function fallbackRef(row: CrossTypeRow): string {
  return `row:${stableHash(`${row.entity_type}\u0000${row.entity_id}\u0000${row.identity_type}\u0000${row.display_value}`)}`;
}

function lower(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

/**
 * بررسیِ کیفیتِ ورودی. هیچ استثنایی به بیرون پرتاب نمی‌کند.
 * خروجی: ردیف‌های سالم برای گروه‌بندی + یافته‌های data-quality (مرتب‌شده).
 */
export function collectDataQuality(
  rows: readonly CrossTypeRow[],
): { valid: readonly PreparedRow[]; findings: readonly DataQualityFinding[]; duplicates_suppressed: number } {
  const findings: DataQualityFinding[] = [];
  const valid: PreparedRow[] = [];
  let duplicates = 0;

  const seenIdentical = new Set<string>();

  for (const row of rows) {
    const ref = row.source_ref && row.source_ref.trim() ? row.source_ref : fallbackRef(row);
    const push = (check: string, detail_fa: string, include = false) => {
      findings.push({
        check,
        source_ref: ref,
        identity_type: String(row.identity_type ?? 'unknown'),
        entity_id: row.entity_id ?? null,
        company_id: row.company_id ?? null,
        detail_fa,
      });
      return include;
    };

    if (!row.entity_id || !row.entity_id.trim()) { push('missing_entity_id', 'ردیف بدونِ entity_id — از گروه‌بندی کنار گذاشته شد.'); continue; }
    if (!row.company_id || !row.company_id.trim()) { push('missing_company_id', 'ردیف بدونِ company_id — مرزِ شرکت را نمی‌توان حفظ کرد؛ کنار گذاشته شد.'); continue; }
    if (!row.identity_type || !(IDENTITY_TYPES as readonly string[]).includes(row.identity_type)) {
      push('unknown_identity_type', `نوعِ هویتِ ناشناخته: «${String(row.identity_type)}» — کنار گذاشته شد.`);
      continue;
    }
    if (!row.display_value || !String(row.display_value).trim()) {
      push('empty_display_value', 'مقدارِ نمایشی خالی است — کنار گذاشته شد.');
      continue;
    }
    if (!row.source_ref || !row.source_ref.trim()) {
      push('missing_source_ref', 'شناسهٔ ردیفِ منبع غایب است؛ ارجاع جایگزین هشِ محتوا است.');
    }

    // ── subtypeها ──
    const reg = registryEntry(row.identity_type);
    if (reg.subtype_field === 'kind') {
      const st = row.subtype;
      const allowed = (reg.allowed_subtypes ?? []).map((x) => x);
      if (st === null || st === undefined || !String(st).trim()) {
        push('subtype_missing', 'ستونِ kind خالی است؛ ردیف کنار گذاشته شد (بدونِ نوع نمی‌توان دامنه/قید را سنجید).');
        continue;
      }
      const stNorm = lower(st);
      if (st !== stNorm) push('subtype_noncanonical', `kind «${String(st)}» حروفِ بزرگ/فاصله دارد؛ برای طبقه‌بندی کوچک‌سازی شد ولی دادهٔ خام حفظ است.`);
      if (!allowed.includes(stNorm)) push('subtype_unknown', `kind «${String(st)}» خارج از فهرستِ شناخته‌شده است؛ به‌عنوان «{internal/other}» رفتار می‌شود.`);
      // اعتبارِ ارقامِ gs1 (فقط وقتی gs1 تشخیص داده می‌شود)
      if (isGs1Kind(stNorm)) {
        const digits = foldDigitsKeepZeros(String(row.display_value).normalize('NFKC')).replace(/[\s\u200B_.\-]+/g, '');
        if (!/^\d+$/.test(digits)) {
          push('gs1_non_digit', 'kind از خانوادهٔ gs1 است ولی مقدار پس از حذفِ جداکننده‌ها فقط ارقام نیست.');
        } else {
          if (![8, 12, 13, 14].includes(digits.length)) {
            push('gs1_length_invalid', `طولِ GTIN نامعتبر است (${digits.length} رقم)؛ انتظار ۸/۱۲/۱۳/۱۴.`);
          } else if (!gs1CheckDigitOk(digits)) {
            push('gs1_check_digit_invalid', 'رقمِ کنترلیِ GTIN با الگوریتمِ mod-10 جور نیست.');
          }
        }
      }
    } else if (row.subtype) {
      push('subtype_unexpected', `نوعِ «${row.identity_type}» ستونِ kind ندارد ولی subtype=«${String(row.subtype)}» آمده است.`);
    }

    if (row.category_id && row.entity_type !== 'product') {
      push('category_on_non_product', 'category_id فقط برای کالاست؛ روی موجودیتِ غیرکالا معنا ندارد.');
    }

    // ── کلیدِ خودِ میدان ──
    const own = ownTypeKey(row);
    if (!own.ok || own.key === null) {
      push('profile_invalid', `کلیدِ خودِ میدان ساخته نشد (${own.reason ?? 'unknown'}) — ردیف از گروه‌بندی کنار گذاشته شد.`);
      continue;
    }
    if (!row.stored_normalized || !String(row.stored_normalized).trim()) {
      push('stored_normalized_missing', 'مقدارِ نرمال‌شدهٔ ذخیره‌شده خالی است؛ ردیابیِ drift ممکن نیست.');
    }

    // ── ردیفِ کاملاً یکسانِ تکراری ──
    const identicalKey = `${row.entity_type} ${row.entity_id}\u0000${row.company_id}\u0000${row.identity_type}\u0000${lower(row.subtype)}\u0000${row.display_value}\u0000${row.source_ref}`;
    if (seenIdentical.has(identicalKey)) {
      duplicates += 1;
      push('duplicate_row_suppressed', 'ردیفِ کاملاً یکسانِ تکراری — از گروه‌بندی کنار گذاشته شد (شمارش در duplicates_suppressed).');
      continue;
    }
    seenIdentical.add(identicalKey);

    valid.push({ row, ownKey: own.key });
  }

  findings.sort((a, b) =>
    a.check === b.check ? (a.source_ref < b.source_ref ? -1 : a.source_ref > b.source_ref ? 1 : 0)
      : a.check < b.check ? -1 : 1,
  );

  return { valid, findings, duplicates_suppressed: duplicates };
}

// ---------------------------------------------------------------------------
// ۶) موتورِ تشخیص — لانِ شرکتی + لانِ جهانی (با redaction) + قطعیت
// ---------------------------------------------------------------------------

export interface CrossTypeOptions {
  /** پوشاندنِ مقادیر در گزارشِ مالکیتیِ شرکت (پیش‌فرض true). گزارشِ بین‌شرکتی همیشه پوشانده است. */
  readonly redactValues?: boolean;
  /** سقفِ طرف‌ها در هر یافته (پیش‌فرض ۲۰) — جلوگیری از انفجارِ خروجی */
  readonly maxPartiesPerFinding?: number;
  /** آیا برخوردِ بین‌شرکتی «تعارض» شمرده شود؟ (پیش‌فرض false — فقط با مصوبهٔ مالک) */
  readonly crossCompanyIsConflict?: boolean;
  /** یافته‌های NOT_COMPARABLE هم گزارش شوند؟ (پیش‌فرض false) */
  readonly includeNotComparable?: boolean;
  /** یافته‌های ALLOWED (افزونگیِ همان‌موجودیت) هم گزارش شوند؟ (پیش‌فرض true) */
  readonly includeAllowed?: boolean;
  /** ساعتِ تزریق‌پذیر — برای تستِ قطعی */
  readonly now?: () => Date;
}

export interface CrossTypeParty {
  readonly entity_id: string;
  readonly entity_type: RowEntityType;
  readonly company_id: string;
  readonly domain_id: string;
  readonly identity_type: IdentityType;
  readonly subtype: string | null;
  readonly category_id: string | null;
  /** base = مخزنِ کانونی · packaging = مخزنِ قدیمیِ بسته‌بندی */
  readonly representation: 'base' | 'packaging';
  readonly display_value: string | null;
  readonly field_key: string | null;
  readonly comparison_key: string | null;
  readonly source_ref: string;
  readonly redacted: boolean;
}

export interface CrossTypeFinding {
  readonly collision_id: string;
  readonly rule_id: string;
  readonly contract_version: string;
  readonly underlying_comparison_version: string;
  readonly underlying_normalization_version: string;
  readonly space: CrossTypeSpaceId;
  readonly space_key: string | null;
  /** نوع‌هایی که در این یافته دخیل‌اند (مرتب‌شده، یکتا) */
  readonly types: readonly IdentityType[];
  readonly scope: {
    readonly company_id: string; // «*» = بین‌شرکتی
    readonly crosses_company: boolean;
    readonly crosses_domain: boolean;
    readonly effective_scope: 'company' | 'global';
  };
  /** آیا طرف‌ها در دسته‌هایِ کالای متفاوت‌اند؟ (حاشیه‌نویسی، نه شدت) */
  readonly across_categories: boolean;
  readonly decision: CrossTypeDecision;
  readonly severity: CrossTypeSeverity;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly ambiguity: number;
  readonly parties: readonly CrossTypeParty[];
  readonly total_parties: number;
  readonly explanation_fa: string;
  readonly recommended_resolution_fa: string;
  readonly requires_owner_approval: boolean;
  readonly provenance: readonly string[];
  readonly visible_under_current_constraints: 'yes' | 'no';
  readonly future_policy_ids: readonly string[];
}

/** شناسهٔ پایدارِ یافته — از (قاعده، دامنه، کلیدِ فضا، امضای مرتب‌شدهٔ طرف‌ها) */
export function crossTypeResultId(
  ruleId: string,
  scopeId: string,
  spaceKey: string | null,
  parties: readonly { entity_id: string; entity_type: string; identity_type: string }[],
): string {
  const sig = parties
    .map((p) => `${p.entity_type}:${p.entity_id}:${p.identity_type}`)
    .sort()
    .join('|');
  return `C13X-${stableHash(`${ruleId}\u0000${scopeId}\u0000${spaceKey ?? ''}\u0000${sig}`)}`;
}

function h8(s: string): string {
  return stableHash(s);
}

function visibilityFor(rule: CrossTypeRule, parties: readonly CrossTypeRow[]): 'yes' | 'no' {
  switch (rule.visible_under_current_constraints) {
    case 'yes':
      return 'yes';
    case 'no':
      return 'no';
    case 'conditional':
      switch (rule.rule_id) {
        case 'C13X-R-bc-bc':
          return parties.every((p) => p.identity_type === 'barcode' && isGs1Kind(lower(p.subtype))) ? 'yes' : 'no';
        case 'C13X-R-vs-vs': {
          const fams = new Set(parties.map((p) => p.family_id ?? null));
          return fams.size === 1 && !fams.has(null) ? 'yes' : 'no';
        }
        case 'C13X-R-bc-pb':
          return parties.every((p) => effectiveScope(p) === 'global') ? 'yes' : 'no';
        default:
          return 'no';
      }
    default:
      return 'no';
  }
}

function crossesCategories(parties: readonly CrossTypeRow[]): boolean {
  const cats = new Set(parties.map((p) => p.category_id).filter((x): x is string => typeof x === 'string' && x.length > 0));
  return cats.size > 1;
}

const GLOBAL_SCOPE_TYPES: readonly IdentityType[] = ['barcode', 'packaging_barcode'];

/** آیا این گروه در لانِ بین‌شرکتی گزارش شود؟ */
function globalLaneEligible(rule: CrossTypeRule, rows: readonly CrossTypeRow[], crossCompanyIsConflict: boolean): boolean {
  const companies = new Set(rows.map((r) => r.company_id));
  if (companies.size < 2) return false;
  if (crossCompanyIsConflict) return true;
  // پیش‌فرض: وقتی حداقل یک طرف در دامنهٔ جهانی زندگی می‌کند (gs1 / بارکدِ بسته‌بندی)،
  // هم‌پوشانی با دامنهٔ شرکتیِ طرفِ دیگر همان «کورِ قید» است و باید دیده شود.
  return rows.some((r) => effectiveScope(r) === 'global');
}

function emitFinding(
  rule: CrossTypeRule,
  scopeKey: string, // شرکت یا «*» برای بین‌شرکتی
  spaceKey: string,
  rows: readonly CrossTypeRow[],
  opts: CrossTypeOptions,
  globalLane: boolean,
): CrossTypeFinding | null {
  const includeNC = opts.includeNotComparable === true;
  if (rule.decision === 'NOT_COMPARABLE' && !includeNC) return null;

  const sameEntity = rows.every(
    (r) => r.entity_id === rows[0].entity_id && r.entity_type === rows[0].entity_type && r.company_id === rows[0].company_id,
  );

  let decision = rule.decision;
  let severity = rule.severity;
  let ambiguity = rule.ambiguity;
  let confidence = rule.confidence;
  if (sameEntity) {
    decision = 'ALLOWED';
    severity = 'none';
    ambiguity = 0;
    confidence = 'high';
  }
  if (decision === 'ALLOWED' && opts.includeAllowed === false) return null;

  const redact = globalLane || opts.redactValues !== false;
  const maxParties = opts.maxPartiesPerFinding ?? 20;
  const sortedRows = [...rows].sort((a, b) => (a.source_ref < b.source_ref ? -1 : a.source_ref > b.source_ref ? 1 : 0));
  const capped = sortedRows.slice(0, maxParties);
  const crossesCompany = new Set(rows.map((r) => r.company_id)).size > 1;
  const crossesDomain = new Set(rows.map((r) => r.domain_id ?? r.company_id)).size > 1;
  const acrossCats = crossesCategories(rows);
  const scopeId = globalLane ? '*' : scopeKey;

  const parties: CrossTypeParty[] = capped.map((r) => {
    const own = ownTypeKey(r);
    const cmp = crossTypeComparisonKey(rule.space, r);
    const display = globalLane
      ? null
      : opts.redactValues === false
        ? r.display_value
        : redactValue(r.display_value);
    return {
      entity_id: globalLane ? h8(r.entity_id).slice(0, 12) : r.entity_id,
      entity_type: r.entity_type,
      company_id: globalLane ? `company:${h8(r.company_id)}` : r.company_id,
      domain_id: globalLane ? '*' : r.domain_id ?? r.company_id,
      identity_type: r.identity_type,
      subtype: r.subtype ?? null,
      category_id: globalLane ? null : r.category_id ?? null,
      representation: r.identity_type === 'packaging_barcode' ? 'packaging' : 'base',
      display_value: display,
      field_key: own.ok ? own.key : null,
      comparison_key: cmp.ok && cmp.key ? cmp.key : null,
      source_ref: globalLane ? `ref:${h8(r.source_ref)}` : r.source_ref,
      redacted: redact,
    };
  });

  const provenance: string[] = capped.map((r) =>
    globalLane ? `ref:${h8(r.source_ref)}#${r.identity_type}` : `${r.source_ref}#${r.identity_type}`,
  );
  if (parties.some((p) => p.representation === 'packaging') && parties.some((p) => p.representation === 'base')) {
    provenance.push('representation:packaging(legacy)↔canonical(product_barcode)');
  }
  if (acrossCats) provenance.push('across_categories:true');
  const kinds = [...new Set(rows.map((r) => lower(r.subtype) || 'none'))].sort();
  if (kinds.length > 1) provenance.push(`kinds:${kinds.join('|')}`);
  if (crossesCompany) provenance.push('crosses_company:true');
  if (crossesDomain) provenance.push('crosses_domain:true');

  const types = [...new Set(rows.map((r) => r.identity_type))].sort() as IdentityType[];

  return {
    collision_id: crossTypeResultId(rule.rule_id, scopeId, spaceKey, rows),
    rule_id: rule.rule_id,
    contract_version: CROSS_TYPE_CONTRACT_VERSION,
    underlying_comparison_version: UNDERLYING_COMPARISON_VERSION,
    underlying_normalization_version: UNDERLYING_NORMALIZATION_VERSION,
    space: rule.space,
    space_key: spaceKey,
    types,
    scope: {
      company_id: scopeId,
      crosses_company: crossesCompany,
      crosses_domain: crossesDomain,
      effective_scope: globalLane ? 'global' : 'company',
    },
    across_categories: acrossCats,
    decision,
    severity,
    confidence,
    ambiguity,
    parties,
    total_parties: rows.length,
    explanation_fa: rule.explanation_fa,
    recommended_resolution_fa: rule.recommended_resolution_fa,
    requires_owner_approval: rule.requires_owner_approval,
    provenance,
    visible_under_current_constraints: visibilityFor(rule, rows),
    future_policy_ids: rule.future_policy_ids,
  };
}

function groupBySpaceKey(
  rows: readonly PreparedRow[],
  space: CrossTypeSpaceId,
): Map<string, CrossTypeRow[]> {
  const map = new Map<string, CrossTypeRow[]>();
  for (const p of rows) {
    const res = crossTypeComparisonKey(space, p.row);
    if (!res.ok || !res.key) continue; // کلیدِ فضا ساخته نشد ⇒ این مقایسه معتبر نیست؛ data-quality جداگانه گزارش می‌دهد
    const arr = map.get(res.key);
    if (arr) arr.push(p.row);
    else map.set(res.key, [p.row]);
  }
  return map;
}

const COMPANY_LANE_RULES = CROSS_TYPE_RULES.filter((r) => r.scope === 'company' || r.scope === 'both');
const GLOBAL_LANE_RULES = CROSS_TYPE_RULES.filter((r) => r.scope === 'both');

export interface CrossTypeSummary {
  readonly rows_in: number;
  readonly rows_valid: number;
  readonly rows_invalid: number;
  readonly duplicates_suppressed: number;
  readonly findings_total: number;
  readonly hard: number;
  readonly soft: number;
  readonly review: number;
  readonly allowed: number;
  readonly not_comparable: number;
  readonly by_rule: Readonly<Record<string, number>>;
  readonly by_type_pair: Readonly<Record<string, number>>;
  readonly by_company: Readonly<Record<string, number>>;
  readonly across_categories: number;
  readonly cross_company_findings: number;
}

/**
 * ارزیابیِ بین‌نوعی روی یک مجموعهٔ بسته از ردیف‌ها.
 * هیچ ورودی/خروجیِ بیرونی ندارد (نه DB، نه فایل، نه شبکه).
 * همان ورودی ⇒ همان خروجی (قطعیت) — با تزریقِ `now` در تست قفل می‌شود.
 */
export function assessCrossType(
  rows: readonly CrossTypeRow[],
  opts: CrossTypeOptions = {},
): CrossTypeAssessment {
  const now = opts.now ?? (() => new Date());
  const crossCompanyIsConflict = opts.crossCompanyIsConflict === true;

  const { valid, findings: dqFindings, duplicates_suppressed } = collectDataQuality(rows);

  const findings: CrossTypeFinding[] = [];

  // ── لانِ شرکتی ──
  const byCompany = new Map<string, PreparedRow[]>();
  for (const p of valid) {
    const arr = byCompany.get(p.row.company_id);
    if (arr) arr.push(p);
    else byCompany.set(p.row.company_id, [p]);
  }
  for (const [company, companyRows] of byCompany) {
    for (const rule of COMPANY_LANE_RULES) {
      const relevant = companyRows.filter((p) => rule.types.includes(p.row.identity_type));
      if (relevant.length < 2) continue;
      const groups = groupBySpaceKey(relevant, rule.space);
      for (const [key, groupRows] of groups) {
        if (groupRows.length < 2) continue;
        // دو ردیفی که هر دو به یک نوع و یک موجودیت و یک شرکت تعلق دارند و کلیدشان یکی است — خودبه‌خود sameEntity است و ALLOWED می‌شود.
        const f = emitFinding(rule, company, key, groupRows, opts, false);
        if (f) findings.push(f);
      }
    }
  }

  // ── لانِ بین‌شرکتی (فقط نوع‌های جهانی پیش‌فرض؛ بقیه با مصوبه) ──
  const globalPool = valid.filter((p) =>
    crossCompanyIsConflict || GLOBAL_SCOPE_TYPES.includes(p.row.identity_type),
  );
  if (globalPool.length >= 2) {
    for (const rule of GLOBAL_LANE_RULES) {
      const relevant = globalPool.filter((p) => rule.types.includes(p.row.identity_type));
      if (relevant.length < 2) continue;
      const groups = groupBySpaceKey(relevant, rule.space);
      for (const [key, groupRows] of groups) {
        if (groupRows.length < 2) continue;
        if (!globalLaneEligible(rule, groupRows, crossCompanyIsConflict)) continue;
        const f = emitFinding(rule, '*', key, groupRows, opts, true);
        if (f) findings.push(f);
      }
    }
  }

  // ── قطعیت: ترتیبِ مستقل از ورودی ──
  findings.sort((a, b) => (a.collision_id < b.collision_id ? -1 : a.collision_id > b.collision_id ? 1 : 0));

  const byRule: Record<string, number> = {};
  const byPair: Record<string, number> = {};
  const byComp: Record<string, number> = {};
  let hard = 0;
  let soft = 0;
  let review = 0;
  let allowed = 0;
  let nc = 0;
  let acrossCats = 0;
  let crossCompany = 0;
  for (const f of findings) {
    byRule[f.rule_id] = (byRule[f.rule_id] ?? 0) + 1;
    byPair[f.types.join('~')] = (byPair[f.types.join('~')] ?? 0) + 1;
    byComp[f.scope.company_id] = (byComp[f.scope.company_id] ?? 0) + 1;
    if (f.decision === 'HARD_CONFLICT') hard += 1;
    else if (f.decision === 'SOFT_CONFLICT') soft += 1;
    else if (f.decision === 'MANUAL_REVIEW') review += 1;
    else if (f.decision === 'ALLOWED') allowed += 1;
    else if (f.decision === 'NOT_COMPARABLE') nc += 1;
    if (f.across_categories) acrossCats += 1;
    if (f.scope.crosses_company) crossCompany += 1;
  }

  const byType: Record<string, number> = {};
  for (const p of valid) byType[p.row.identity_type] = (byType[p.row.identity_type] ?? 0) + 1;

  const fingerprintInput = JSON.stringify({
    v: CROSS_TYPE_CONTRACT_VERSION,
    findings: findings.map((f) => `${f.collision_id}:${f.decision}`),
    dq: dqFindings.length,
    rows_in: rows.length,
    rows_valid: valid.length,
  });
  const contentFingerprint = `fp-${stableHash(fingerprintInput)}${stableHash(`${fingerprintInput}\u0000c13xt`)}`;
  const generatedAt = now().toISOString();
  const reportFingerprint = `fp-${stableHash(`${contentFingerprint}\u0000${generatedAt}\u0000${findings.length}`)}`;

  return {
    contract_version: CROSS_TYPE_CONTRACT_VERSION,
    underlying_comparison_version: UNDERLYING_COMPARISON_VERSION,
    underlying_normalization_version: UNDERLYING_NORMALIZATION_VERSION,
    generated_at_iso: generatedAt,
    options_echo: {
      redactValues: opts.redactValues !== false,
      crossCompanyIsConflict,
      includeNotComparable: opts.includeNotComparable === true,
      includeAllowed: opts.includeAllowed !== false,
    },
    input: {
      rows_in: rows.length,
      rows_valid: valid.length,
      rows_invalid: rows.length - valid.length,
      duplicates_suppressed,
      by_type: byType,
    },
    findings,
    data_quality: dqFindings,
    summary: {
      rows_in: rows.length,
      rows_valid: valid.length,
      rows_invalid: rows.length - valid.length,
      duplicates_suppressed,
      findings_total: findings.length,
      hard,
      soft,
      review,
      allowed,
      not_comparable: nc,
      by_rule: byRule,
      by_type_pair: byPair,
      by_company: byComp,
      across_categories: acrossCats,
      cross_company_findings: crossCompany,
    },
    content_fingerprint: contentFingerprint,
    report_fingerprint: reportFingerprint,
  };
}


export interface CrossTypeAssessment {
  readonly contract_version: string;
  readonly underlying_comparison_version: string;
  readonly underlying_normalization_version: string;
  readonly generated_at_iso: string;
  readonly options_echo: {
    readonly redactValues: boolean;
    readonly crossCompanyIsConflict: boolean;
    readonly includeNotComparable: boolean;
    readonly includeAllowed: boolean;
  };
  readonly input: {
    readonly rows_in: number;
    readonly rows_valid: number;
    readonly rows_invalid: number;
    readonly duplicates_suppressed: number;
    readonly by_type: Readonly<Record<string, number>>;
  };
  readonly findings: readonly CrossTypeFinding[];
  readonly data_quality: readonly DataQualityFinding[];
  readonly summary: CrossTypeSummary;
  /** اثرِ انگشتِ محتوا — مستقل از زمان و ترتیب؛ دو اجرای یکسان ⇒ یک اثر */
  readonly content_fingerprint: string;
  /** اثرِ انگشتِ گزارش — شاملِ زمانِ تولید */
  readonly report_fingerprint: string;
}

// ---------------------------------------------------------------------------
// ۷) تحلیلِ ابهامِ اسکن — چه چیزی «سایه» می‌شود وقتی یک مقدار resolve می‌شود
// ---------------------------------------------------------------------------

export const SCAN_PRECEDENCE = ['barcode', 'code', 'alias_code'] as const;
export type ScanPrecedenceStep = (typeof SCAN_PRECEDENCE)[number];

export interface ScanShadowParty {
  readonly identity_type: IdentityType;
  readonly entity_id: string;
  readonly company_id: string;
  readonly display_value: string | null;
  readonly source_ref: string;
}

export interface ScanShadowFinding {
  readonly shadow_id: string;
  readonly contract_version: string;
  /** شرکتِ بیننده؛ «*» اگر یافته بین‌شرکتی باشد (همیشه پوشانده) */
  readonly company_id: string;
  readonly crosses_company: boolean;
  /** کلیدِ اسکن (scan space) */
  readonly scan_key: string;
  /** ترتیبِ اولویتِ اعمال‌شده */
  readonly precedence: readonly ScanPrecedenceStep[];
  /** مرحله‌ای که برنده شد */
  readonly resolved_by: ScanPrecedenceStep;
  /** کالای(های) resolveشده */
  readonly resolved_entities: readonly ScanShadowParty[];
  /** موجودیت‌هایی که از مسیرِ اسکن سایه شدند (هرگز resolve نمی‌شوند) */
  readonly shadowed: readonly ScanShadowParty[];
  readonly decision: 'MANUAL_REVIEW';
  readonly severity: 'review';
  readonly requires_owner_approval: false;
  readonly message_fa: string;
  readonly provenance: readonly string[];
}

/**
 * برای هر کلیدِ اسکن و هر شرکت: اگر هم‌زمان بارکد/کد/alias نوع code بماند،
 * کالایی که در مرحلهٔ دیرتر می‌آید از دیدِ اسکن «سایه» می‌شود.
 * این تحلیل توصیهٔ اجرا نیست — فقط ابهام را **مرئی** می‌کند.
 */
export function analyzeScanResolution(
  rows: readonly CrossTypeRow[],
  opts: Pick<CrossTypeOptions, 'redactValues' | 'now'> & { includeCrossCompanyFallback?: boolean } = {},
): readonly ScanShadowFinding[] {
  const redact = opts.redactValues !== false;
  const { valid } = collectDataQuality(rows);
  const out: ScanShadowFinding[] = [];

  const lane = (companyId: string | null) => {
    const scopeRows = valid.filter((p) => (companyId === null ? true : p.row.company_id === companyId));
    const byKey = new Map<string, CrossTypeRow[]>();
    for (const p of scopeRows) {
      const t = p.row.identity_type;
      const isBarcodeLane = t === 'barcode' || t === 'packaging_barcode';
      const isCodeLane = t === 'product_code';
      const isAliasCodeLane = t === 'alias' && lower(p.row.subtype) === 'code';
      if (!isBarcodeLane && !isCodeLane && !isAliasCodeLane) continue;
      const res = scanPadSpace(p.row.display_value);
      if (!res.ok || !res.key) continue;
      const arr = byKey.get(res.key);
      if (arr) arr.push(p.row);
      else byKey.set(res.key, [p.row]);
    }
    for (const [key, group] of byKey) {
      const barcodeRows = group.filter((r) => r.identity_type === 'barcode' || r.identity_type === 'packaging_barcode');
      const codeRows = group.filter((r) => r.identity_type === 'product_code');
      const aliasRows = group.filter((r) => r.identity_type === 'alias');
      const pick = (rs: CrossTypeRow[]) =>
        rs.map((r) => ({
          identity_type: r.identity_type,
          entity_id: r.entity_id,
          company_id: r.company_id,
          display_value: redact ? redactValue(r.display_value) : r.display_value,
          source_ref: r.source_ref,
        }));
      const bcEntities = new Set(barcodeRows.map((r) => `${r.entity_type}:${r.entity_id}`));
      const codeEntities = new Set(codeRows.map((r) => `${r.entity_type}:${r.entity_id}`));

      const emit = (resolvedBy: ScanPrecedenceStep, resolved: CrossTypeRow[], shadowedRows: CrossTypeRow[]) => {
        if (shadowedRows.length === 0) return;
        const crossesCompany = new Set([...resolved, ...shadowedRows].map((r) => r.company_id)).size > 1;
        const scopeId = companyId ?? '*';
        const idSeed = `${scopeId} ${key} ${resolvedBy} ${shadowedRows.map((r) => `${r.entity_type}:${r.entity_id}`).sort().join(',')}`;
        out.push({
          shadow_id: `C13XSH-${stableHash(idSeed)}`,
          contract_version: CROSS_TYPE_CONTRACT_VERSION,
          company_id: scopeId,
          crosses_company: crossesCompany,
          scan_key: key,
          precedence: SCAN_PRECEDENCE,
          resolved_by: resolvedBy,
          resolved_entities: pick(resolved),
          shadowed: pick(shadowedRows),
          decision: 'MANUAL_REVIEW',
          severity: 'review',
          requires_owner_approval: false,
          message_fa:
            resolvedBy === 'barcode'
              ? 'این مقدار هم بارکد کالایی است و هم کد/alias نوعِ code کالایی دیگر؛ از مسیرِ اسکن، بارکد برنده است و کدِ آن کالا resolve نمی‌شود.'
              : 'این مقدار هم کدِ کالایی است و هم alias نوعِ code کالایی دیگر؛ از مسیرِ اسکن، کد برنده است و alias آن کالا resolve نمی‌شود.',
          provenance: [
            ...resolved.map((r) => `${r.source_ref}#${r.identity_type}:won`),
            ...shadowedRows.map((r) => `${r.source_ref}#${r.identity_type}:shadowed`),
            `scan_key:${key}`,
          ],
        });
      };

      if (barcodeRows.length > 0) {
        const shadowed = [...codeRows, ...aliasRows].filter((r) => !bcEntities.has(`${r.entity_type}:${r.entity_id}`));
        emit('barcode', barcodeRows, shadowed);
      } else if (codeRows.length > 0) {
        const shadowed = aliasRows.filter((r) => !codeEntities.has(`${r.entity_type}:${r.entity_id}`));
        emit('code', codeRows, shadowed);
      }
    }
  };

  // هر شرکت جدا (مرزِ شرکت) — سپس در صورتِ درخواست، تحلیلِ fallback بین‌شرکتی
  const companies = [...new Set(valid.map((p) => p.row.company_id))].sort();
  for (const c of companies) lane(c);

  if (opts.includeCrossCompanyFallback !== false) {
    // fallback: اسکن در شرکت A هیچ نتیجه‌ای نمی‌دهد ولی gs1 در شرکت B وجود دارد — today's scan path does reach it.
    const gs1Rows = valid.filter((p) => p.row.identity_type === 'barcode' && isGs1Kind(lower(p.row.subtype)));
    const gs1ByKey = new Map<string, CrossTypeRow[]>();
    for (const p of gs1Rows) {
      const res = scanPadSpace(p.row.display_value);
      if (!res.ok || !res.key) continue;
      const arr = gs1ByKey.get(res.key);
      if (arr) arr.push(p.row);
      else gs1ByKey.set(res.key, [p.row]);
    }
    for (const [key, group] of gs1ByKey) {
      const owners = new Set(group.map((r) => r.company_id));
      for (const c of companies) {
        if (owners.has(c)) continue; // شرکتِ مالک fallback لازم ندارد
        // آیا در شرکتِ c هیچ matches وجود ندارد؟ (در غیر این‌صورت fallback فعال نمی‌شود)
        const ownAny = valid.some((p) => {
          if (p.row.company_id !== c) return false;
          const t = p.row.identity_type;
          if (!(t === 'barcode' || t === 'packaging_barcode' || t === 'product_code' || (t === 'alias' && lower(p.row.subtype) === 'code'))) return false;
          const res = scanPadSpace(p.row.display_value);
          return res.ok && res.key === key;
        });
        if (ownAny) continue;
        const crosses = true;
        out.push({
          shadow_id: `C13XSH-${stableHash(`fallback\u0000${c}\u0000${key}`)}`,
          contract_version: CROSS_TYPE_CONTRACT_VERSION,
          company_id: c,
          crosses_company: crosses,
          scan_key: key,
          precedence: SCAN_PRECEDENCE,
          resolved_by: 'barcode',
          resolved_entities: [],
          shadowed: group.map((r) => ({
            identity_type: r.identity_type,
            entity_id: h8(r.entity_id).slice(0, 12),
            company_id: `company:${h8(r.company_id)}`,
            display_value: null,
            source_ref: `ref:${h8(r.source_ref)}`,
          })),
          decision: 'MANUAL_REVIEW',
          severity: 'review',
          requires_owner_approval: false,
          message_fa:
            'اسکن در این شرکت خالی می‌ماند ولی همین مقدار در شرکتِ دیگری به‌عنوان gs1 ثبت شده است؛ مسیرِ اسکنِ فعلی به آن gs1 بین‌شرکتی می‌رسد (رفتارِ مستندِ امروز).',
          provenance: [...group.map((r) => `ref:${h8(r.source_ref)}#${r.identity_type}:gs1-global`), `scan_key:${key}`, `fallback_for:${h8(c)}`],
        });
      }
    }
  }

  out.sort((a, b) => (a.shadow_id < b.shadow_id ? -1 : a.shadow_id > b.shadow_id ? 1 : 0));
  return out;
}

// ---------------------------------------------------------------------------
// ۸) شبیه‌سازیِ «سیاست‌هایِ آیندهٔ یکتایی» — فقط گزارش، هرگز اجرا/اعمال
// ---------------------------------------------------------------------------

export interface PolicyProfile {
  readonly policy_id: string;
  readonly title_fa: string;
  /** تصمیمِ مالک که این سیاست زیرمجموعهٔ آن است */
  readonly decision_ref: string;
  readonly description_fa: string;
  readonly scope_fa: string;
  readonly space_fa: string;
  readonly rationale_fa: string;
}

export const FUTURE_POLICIES: readonly PolicyProfile[] = [
  {
    policy_id: 'POL-CODE-CI-01',
    title_fa: 'یکتاییِ نامحسوسِ کدِ کالا در سطح شرکت (طبق D-C11-3 گزینهٔ A)',
    decision_ref: 'D-C11-3',
    description_fa:
      'اگر قیدِ یکتاییِ کدِ کالا به‌صورت نامحسوس اعمال شود، کدام ردیف‌های موجود نقض می‌کنند؟',
    scope_fa: 'company',
    space_fa: 'field (ProductCode)',
    rationale_fa: 'ناسازگاریِ اندازه‌گیری‌شدهٔ امروز: DB حساس به حروف، لایهٔ اپلیکیشن نامحسوس.',
  },
  {
    policy_id: 'POL-ALIAS-COMPANY-01',
    title_fa: 'یکتاییِ alias_norm در سطح شرکت (سایه‌شاخص طبق D-C12-3)',
    decision_ref: 'D-C12-3',
    description_fa:
      'اگر alias_norm علاوه بر (product_id, alias_norm) در سطح شرکت یکتا شود، کدام ردیف‌های موجود نقض می‌کنند؟',
    scope_fa: 'company',
    space_fa: 'field (ProductAlias)',
    rationale_fa: 'لایهٔ سرویس افزودنِ تکراری را رد می‌کند ولی دادهٔ تاریخی ممکن است متناقض باشد.',
  },
  {
    policy_id: 'POL-BARCODE-XKIND-01',
    title_fa: 'فضای یکتای بارکد با دامنهٔ نوع‌محور برای همهٔ kindها (تصمیمِ بازِ D-C13X-1)',
    decision_ref: 'D-C13X-1',
    description_fa:
      'gs1_* → دامنهٔ جهانی؛ internal/other → دامنهٔ شرکت؛ packaging_barcode → جهانی — به‌علاوهٔ «رزروِ دوطرفه»: هیچ مقداری هم‌زمان در دامنهٔ جهانی و شرکتیِ همان یا شرکتِ دیگر مجاز نیست. کدام گروه‌ها نقض می‌کنند؟',
    scope_fa: 'گروه‌بندی واحد روی همهٔ بارکدها؛ دامنهٔ هر گروه بر پایهٔ اعضا (همه شرکتی و تک‌شرکتی ⇒ شرکت؛ در غیر این‌صورت «*» پوشانده)',
    space_fa: 'scan_pad (scan + تاکردنِ UPC→EAN)',
    rationale_fa: 'امروز هر kind قیدِ خودش را دارد و هیچ قیدی جفتِ (gs1, internal) را در یک شرکت/بینِ دو شرکت نمی‌گیرد — «کورِ قید».',
  },
  {
    policy_id: 'POL-UPC-EAN-PAD-01',
    title_fa: 'هم‌ارزیِ UPC-A و EAN-13 با صفرِ ابتدایی (تصمیمِ بازِ D-C13X-2)',
    decision_ref: 'D-C13X-2',
    description_fa:
      'UPC-A (۱۲ رقم) همان EAN-13 با صفرِ پیشوند است؛ اگر زیرِ یک سیاست یکسان شوند، کدام ردیف‌ها برخورد می‌کنند؟',
    scope_fa: 'scope-partitioned',
    space_fa: 'gs1',
    rationale_fa: 'GS1: UPC-A زیرمجموعهٔ EAN-13 است؛ امروز دو ردیفِ فیزیکیِ همان کالا می‌توانند با دو kind ثبت شوند.',
  },
  {
    policy_id: 'POL-GS1-CHECKDIGIT-01',
    title_fa: 'اجباری‌بودنِ رقمِ کنترلیِ GTIN برای kindهای gs1 (طبق D-C11-1 گزینهٔ B)',
    decision_ref: 'D-C11-1',
    description_fa:
      'اگر اعتبارسنجیِ mod-10 برای gs1_ean8/upc/ean13/itf14 اجباری شود، کدام ردیف‌های موجود رد می‌شوند؟',
    scope_fa: 'none (سطحِ ردیف)',
    space_fa: 'gs1',
    rationale_fa: 'رقمِ کنترلی امروز هیچ‌جا اعتبارسنجی نمی‌شود؛ ردیف‌های نامعتبر زیرِ هر سیاستِ آتی رد می‌شوند.',
  },
  {
    policy_id: 'POL-PACKAGING-CANON-01',
    title_fa: 'یکتایی/سازگاریِ بارکدِ بسته‌بندی در برابرِ مخزنِ کانونی (تصمیمِ بازِ D-C13X-3)',
    decision_ref: 'D-C13X-3',
    description_fa:
      'بارکدِ بسته‌بندی (قدیمی) برای همان کالا باید در مخزنِ کانونی (product_barcode) هم دیده شود؛ کدام ردیف‌ها این هم‌سویی را ندارند و کدام‌یک متناقض‌اند؟',
    scope_fa: 'company + global (gs1)',
    space_fa: 'scan_pad (scan + تاکردنِ UPC→EAN)',
    rationale_fa: 'مهاجرتِ ۰۰۴۶ با on conflict do nothing بی‌صدا یکراست می‌شود؛ drift بینِ دو مخزن امروز قابلِ مشاهده نیست.',
  },
] as const;

export const FUTURE_POLICY_IDS = FUTURE_POLICIES.map((p) => p.policy_id);

export interface PolicyFinding {
  readonly policy_id: string;
  readonly decision_ref: string;
  readonly collision_id: string;
  /** شرکت یا «*» برای دامنهٔ جهانی */
  readonly scope_company_id: string;
  readonly space_key: string | null;
  readonly check:
    | 'would_violate_unique'
    | 'cross_kind_group'
    | 'upc_ean_equivalence'
    | 'gs1_check_digit_invalid'
    | 'gs1_length_invalid'
    | 'missing_canonical_copy'
    | 'conflicting_canonical_copy';
  readonly explanation_fa: string;
  readonly parties: readonly CrossTypeParty[];
  readonly total_parties: number;
  readonly would_violate: true;
  readonly requires_owner_approval: true;
}

export interface PolicySimulationReport {
  readonly contract_version: string;
  readonly generated_at_iso: string;
  readonly policies: readonly {
    readonly policy_id: string;
    readonly decision_ref: string;
    readonly findings: number;
    readonly would_violate: boolean;
  }[];
  readonly findings: readonly PolicyFinding[];
  readonly content_fingerprint: string;
}

function policyParties(rows: readonly CrossTypeRow[], redact: boolean, globalLane: boolean): CrossTypeParty[] {
  return [...rows]
    .sort((a, b) => (a.source_ref < b.source_ref ? -1 : a.source_ref > b.source_ref ? 1 : 0))
    .map((r) => {
      const own = ownTypeKey(r);
      const display = globalLane ? null : redact ? redactValue(r.display_value) : r.display_value;
      return {
        entity_id: globalLane ? h8(r.entity_id).slice(0, 12) : r.entity_id,
        entity_type: r.entity_type,
        company_id: globalLane ? `company:${h8(r.company_id)}` : r.company_id,
        domain_id: globalLane ? '*' : r.domain_id ?? r.company_id,
        identity_type: r.identity_type,
        subtype: r.subtype ?? null,
        category_id: globalLane ? null : r.category_id ?? null,
        representation: r.identity_type === 'packaging_barcode' ? 'packaging' : 'base',
        display_value: display,
        field_key: own.ok ? own.key : null,
        comparison_key: null,
        source_ref: globalLane ? `ref:${h8(r.source_ref)}` : r.source_ref,
        redacted: globalLane || redact,
      };
    });
}

function entityBucket(r: CrossTypeRow): string {
  return `${r.entity_type}:${r.entity_id}`;
}

function kindClass(r: CrossTypeRow): string {
  if (r.identity_type === 'packaging_barcode') return 'packaging';
  const st = lower(r.subtype);
  if (isGs1Kind(st)) return 'gs1';
  return 'company-scope';
}

/**
 * دامنهٔ یک گروهِ سیاستی:
 *  - همهٔ طرف‌ها دامنهٔ شرکتی دارند و همان یک شرکت‌اند ⇒ همان شرکت (selective ignore: مجاز)
 *  - همهٔ طرف‌ها دامنهٔ شرکتی ولی شرکت‌های متفاوت ⇒ null (مجاز — چیزی برای این سیاست نیست)
 *  - حداقل یک طرف دامنهٔ جهانی دارد ⇒ «*» با partyهای پوشانده
 */
function policyGroupScope(
  parties: readonly CrossTypeRow[],
): { scopeId: string; globalLane: boolean } | null {
  const scopes = parties.map((r) => effectiveScope(r));
  const allCompanyScope = scopes.every((x) => x === 'company');
  const companies = new Set(parties.map((r) => r.company_id));
  if (allCompanyScope && companies.size === 1) {
    return { scopeId: parties[0].company_id, globalLane: false };
  }
  if (allCompanyScope) return null;
  return { scopeId: '*', globalLane: true };
}

/**
 * شبیه‌سازیِ سیاست‌هایِ آینده. خروجی فقط یک گزارش است؛ هیچ قیدی اعمال نمی‌شود.
 * قطعیت: مرتب‌سازیِ نهایی روی (policy_id, collision_id).
 */
export function simulateFuturePolicies(
  rows: readonly CrossTypeRow[],
  opts: Pick<CrossTypeOptions, 'redactValues' | 'now'> = {},
): PolicySimulationReport {
  const now = opts.now ?? (() => new Date());
  const redact = opts.redactValues !== false;
  const { valid } = collectDataQuality(rows);
  const findings: PolicyFinding[] = [];

  const push = (
    policy: PolicyProfile,
    check: PolicyFinding['check'],
    scopeCompanyId: string,
    spaceKey: string | null,
    groupRows: readonly CrossTypeRow[],
    explanation_fa: string,
    globalLane = false,
  ) => {
    const parties = policyParties(groupRows, redact, globalLane || scopeCompanyId === '*');
    const sig = [...groupRows].map(entityBucket).sort().join('|');
    findings.push({
      policy_id: policy.policy_id,
      decision_ref: policy.decision_ref,
      collision_id: `C13XPOL-${stableHash(`${policy.policy_id}\u0000${scopeCompanyId}\u0000${spaceKey ?? ''}\u0000${check}\u0000${sig}`)}`,
      scope_company_id: scopeCompanyId,
      space_key: spaceKey,
      check,
      explanation_fa,
      parties,
      total_parties: groupRows.length,
      would_violate: true,
      requires_owner_approval: true,
    });
  };

  // ── POL-CODE-CI-01 ── (per company, space field/ProductCode)
  {
    const p = FUTURE_POLICIES[0];
    const byCompany = new Map<string, PreparedRow[]>();
    for (const pr of valid) {
      if (pr.row.identity_type !== 'product_code') continue;
      const arr = byCompany.get(pr.row.company_id);
      if (arr) arr.push(pr);
      else byCompany.set(pr.row.company_id, [pr]);
    }
    for (const [company, list] of byCompany) {
      const groups = new Map<string, CrossTypeRow[]>();
      for (const pr of list) {
        const arr = groups.get(pr.ownKey);
        if (arr) arr.push(pr.row);
        else groups.set(pr.ownKey, [pr.row]);
      }
      for (const [key, g] of groups) {
        if (new Set(g.map(entityBucket)).size < 2) continue;
        push(p, 'would_violate_unique', company, key, g,
          'این کدها پس از نرمال‌سازیِ نامحسوس یکی می‌شوند؛ زیرِ قیدِ آتیِ نامحسوس، شرکت با نقضِ یکتاییِ کد مواجه می‌شود.');
      }
    }
  }

  // ── POL-ALIAS-COMPANY-01 ── (per company, space field/ProductAlias)
  {
    const p = FUTURE_POLICIES[1];
    const byCompany = new Map<string, PreparedRow[]>();
    for (const pr of valid) {
      if (pr.row.identity_type !== 'alias') continue;
      const arr = byCompany.get(pr.row.company_id);
      if (arr) arr.push(pr);
      else byCompany.set(pr.row.company_id, [pr]);
    }
    for (const [company, list] of byCompany) {
      const groups = new Map<string, CrossTypeRow[]>();
      for (const pr of list) {
        const arr = groups.get(pr.ownKey);
        if (arr) arr.push(pr.row);
        else groups.set(pr.ownKey, [pr.row]);
      }
      for (const [key, g] of groups) {
        if (new Set(g.map(entityBucket)).size < 2) continue;
        push(p, 'would_violate_unique', company, key, g,
          'این نام‌های جایگزین برای کالای متفاوت در یک شرکت ثبت شده‌اند؛ زیرِ یکتاییِ شرکتیِ آتی نقض می‌شوند.');
      }
    }
  }

  // ── POL-BARCODE-XKIND-01 ── (grouping واحد روی همهٔ بارکدها؛ دامنه per group)
  {
    const p = FUTURE_POLICIES[2];
    const bcRows = valid.filter((pr) => pr.row.identity_type === 'barcode' || pr.row.identity_type === 'packaging_barcode');
    const groups = groupBySpaceKey(bcRows, 'scan_pad');
    for (const [key, g] of groups) {
      if (new Set(g.map(entityBucket)).size < 2) continue;
      const classes = new Set(g.map(kindClass));
      const rawKinds = new Set(g.map((r) => lower(r.subtype) || 'packaging'));
      if (classes.size < 2 && rawKinds.size < 2) continue; // همان kind و همان دامنه — پوششِ قاعدهٔ هم‌نوعی
      const sc = policyGroupScope(g);
      if (!sc) continue;
      push(p, 'cross_kind_group', sc.scopeId, key, g,
        'این مقدار زیرِ دو kind/دامنهٔ ناهمسانِ بارکد ثبت شده است؛ هیچ قیدِ فعلی این هم‌پوشانی را نمی‌گیرد و زیرِ سیاستِ یکپارچهٔ آتی (رزروِ دوطرفهٔ دامنهٔ جهانی/شرکتی) نقض می‌شود.',
        sc.globalLane);
    }
  }

  // ── POL-UPC-EAN-PAD-01 ── (grouping واحد روی همهٔ بارکدها؛ دامنه per group)
  {
    const p = FUTURE_POLICIES[3];
    const bcRows = valid.filter((pr) => pr.row.identity_type === 'barcode' || pr.row.identity_type === 'packaging_barcode');
    const groups = new Map<string, { rows: CrossTypeRow[]; folded: boolean }>();
    for (const pr of bcRows) {
      const res = gs1Space(pr.row.display_value);
      if (!res.ok || !res.key) continue;
      const g = groups.get(res.key);
      if (g) {
        g.rows.push(pr.row);
        g.folded = g.folded || res.folded;
      } else {
        groups.set(res.key, { rows: [pr.row], folded: res.folded });
      }
    }
    for (const [key, g] of groups) {
      if (new Set(g.rows.map(entityBucket)).size < 2) continue;
      const kinds = new Set(g.rows.map((r) => lower(r.subtype) || 'packaging'));
      const upcEanMix = kinds.has('gs1_upc') && kinds.has('gs1_ean13');
      if (!g.folded && !upcEanMix) continue;
      const sc = policyGroupScope(g.rows);
      if (!sc) continue;
      push(p, 'upc_ean_equivalence', sc.scopeId, key, g.rows,
        'این مقادیر پس از تاکردنِ UPC-A→EAN-13 یکی می‌شوند؛ زیرِ سیاستِ هم‌ارزیِ آتی، یک بارکدِ فیزیکی به دو kind ثبت شده است.',
        sc.globalLane);
    }
  }

  // ── POL-GS1-CHECKDIGIT-01 ── (سطحِ ردیف)
  {
    const p = FUTURE_POLICIES[4];
    for (const pr of valid) {
      const r = pr.row;
      if (r.identity_type !== 'barcode') continue;
      const st = lower(r.subtype);
      if (!isGs1Kind(st)) continue;
      const digits = foldDigitsKeepZeros(String(r.display_value).normalize('NFKC')).replace(/[\s\u200B_.\-]+/g, '');
      if (!/^\d+$/.test(digits)) continue; // در data-quality گزارش شده
      if (![8, 12, 13, 14].includes(digits.length)) {
        push(p, 'gs1_length_invalid', r.company_id, digits, [r],
          `طولِ GTIN (${digits.length} رقم) نامعتبر است؛ زیرِ سیاستِ اجباریِ طول/کنترل رد می‌شود (D-C11-1).`);
        continue;
      }
      if (!gs1CheckDigitOk(digits)) {
        push(p, 'gs1_check_digit_invalid', r.company_id, digits, [r],
          'رقمِ کنترلیِ GTIN با الگوریتمِ mod-10 جور نیست؛ زیرِ سیاستِ اجباریِ رقمِ کنترلی رد می‌شود (D-C11-1).');
      }
    }
  }

  // ── POL-PACKAGING-CANON-01 ── (سازگاریِ دو مخزن)
  {
    const p = FUTURE_POLICIES[5];
    const pb = valid.filter((pr) => pr.row.identity_type === 'packaging_barcode');
    const bc = valid.filter((pr) => pr.row.identity_type === 'barcode');
    const bcKeyByProduct = new Map<string, Set<string>>();
    const bcByKey = new Map<string, CrossTypeRow[]>();
    const bcGs1Global = new Map<string, CrossTypeRow[]>();
    for (const pr of bc) {
      const res = scanPadSpace(pr.row.display_value);
      if (!res.ok || !res.key) continue;
      const pk = `${pr.row.company_id} ${entityBucket(pr.row)}`;
      const set = bcKeyByProduct.get(pk);
      if (set) set.add(res.key);
      else bcKeyByProduct.set(pk, new Set([res.key]));
      const arr = bcByKey.get(`${pr.row.company_id} ${res.key}`);
      if (arr) arr.push(pr.row);
      else bcByKey.set(`${pr.row.company_id} ${res.key}`, [pr.row]);
      if (isGs1Kind(lower(pr.row.subtype))) {
        const g = bcGs1Global.get(res.key);
        if (g) g.push(pr.row);
        else bcGs1Global.set(res.key, [pr.row]);
      }
    }
    for (const pr of pb) {
      const r = pr.row;
      const res = scanPadSpace(r.display_value);
      if (!res.ok || !res.key) continue;
      const pk = `${r.company_id} ${entityBucket(r)}`;
      if (!bcKeyByProduct.get(pk)?.has(res.key)) {
        push(p, 'missing_canonical_copy', r.company_id, res.key, [r],
          'این بارکدِ بسته‌بندی در مخزنِ کانونی (product_barcode) برای همان کالا دیده نمی‌شود؛ drift بینِ دو مخزن — زیرِ سیاستِ کانونی‌سازی، این ردیف باید بازبینی شود.');
      }
      const bcRows = bcByKey.get(`${r.company_id} ${res.key}`) ?? [];
      const others = bcRows.filter((b) => entityBucket(b) !== entityBucket(r));
      if (others.length > 0) {
        push(p, 'conflicting_canonical_copy', r.company_id, res.key, [r, ...others],
          'این بارکدِ بسته‌بندی به کالای دیگری در مخزنِ کانونی گره خورده است؛ یکی از دو نمایش اشتباه است.');
      } else {
        // ── مسیرِ بین‌شرکتی فقط وقتی مقدارِ pb یک GTIN معتبر باشد ──
        const digits = foldDigitsKeepZeros(String(r.display_value).normalize('NFKC')).replace(/[\s\u200B_.\-]+/g, '');
        if (/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(digits) && gs1CheckDigitOk(digits)) {
          const globalOthers = (bcGs1Global.get(res.key) ?? []).filter((b) => entityBucket(b) !== entityBucket(r));
          if (globalOthers.length > 0) {
            push(p, 'conflicting_canonical_copy', '*', res.key, [r, ...globalOthers],
              'این بارکدِ بسته‌بندی (GTIN معتبر) در شرکتِ دیگری به‌عنوان gs1 به کالای دیگری گره خورده است؛ دامنهٔ جهانیِ GS1 شکسته شده است.',
              true);
          }
        }
      }
    }
  }

  findings.sort((a, b) =>
    a.policy_id === b.policy_id
      ? a.collision_id < b.collision_id
        ? -1
        : a.collision_id > b.collision_id
          ? 1
          : 0
      : a.policy_id < b.policy_id
        ? -1
        : 1,
  );

  const policies = FUTURE_POLICIES.map((p) => {
    const n = findings.filter((f) => f.policy_id === p.policy_id).length;
    return { policy_id: p.policy_id, decision_ref: p.decision_ref, findings: n, would_violate: n > 0 };
  });

  const fingerprint = `fp-${stableHash(JSON.stringify(findings.map((f) => `${f.policy_id}:${f.collision_id}`)) )}`;

  return {
    contract_version: CROSS_TYPE_CONTRACT_VERSION,
    generated_at_iso: now().toISOString(),
    policies,
    findings,
    content_fingerprint: fingerprint,
  };
}
