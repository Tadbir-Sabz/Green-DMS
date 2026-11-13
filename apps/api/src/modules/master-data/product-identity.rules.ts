/**
 * TASK-PM-02-C7 — کاتالوگِ هویتِ کالا: نام‌های جایگزین (alias) و صفات (attribute).
 *
 * منبعِ حقیقت فقط ساختار و قواعدی است که پیش از C7 وجود داشته‌اند:
 *  - `migrations/0046_product_master.up.sql`:
 *      product_alias(id, company_id, product_id, alias, alias_norm,
 *                    kind ∈ {brand_slang, latin, code}, unique(product_id, alias_norm))
 *      product_attribute_def(company_id, code, title, kind ∈ {text, number, enum},
 *                            is_variant_axis, is_required, sort_order,
 *                            unique(company_id, code))
 *      product_attribute_enum_value(def_id, value, value_norm, unique(def_id, value_norm))
 *      product_attribute_value(product_id, def_id, value_text|value_num|value_enum،
 *                            unique(product_id, def_id)، ck ... kind = 1 مقدار)
 *  - `0047_product_master_rls.up.sql` RLS/FORCE RLS روی همین جدول‌ها.
 *  - `0060_product_catalog_history.up.sql` تاریخچهٔ تغییرناپذیر برای
 *    product_alias/product_attribute_def/product_attribute_enum_value/product_attribute_value.
 *  - `product-master.service.ts` (پیش از C7): نرمال‌سازی با `normalizeText`، رد alias
 *    هم‌ارز با بارکد/کد، یکتاییِ `(product_id, alias_norm)`، `is_required` در سطح شرکت،
 *    اعتبارسنجیِ kind/enum، امضای variant (M-3) و تغییرناپذیری پس از ارجاع عملیاتی،
 *    resolution اسکن (بارکد ← کد ← alias نوعِ code).
 *  - `product.repository.ts`: جست‌وجوی `q` روی code/name/name_latin/alias.
 *
 * هیچ دستهٔ alias، تاکسونومیِ صفت، نوع دادهٔ تازه، الزامِ تازه یا رفتار عملیاتیِ تازه‌ای
 * در C7 ساخته نمی‌شود. صفتِ صرفاً «توصیفی» هیچ اثر قیمت/موجودی/سند ندارد.
 */

export const PRODUCT_ALIAS_KINDS = ['brand_slang', 'latin', 'code'] as const;
export type ProductAliasKind = (typeof PRODUCT_ALIAS_KINDS)[number];

export const PRODUCT_ATTRIBUTE_KINDS = ['text', 'number', 'enum'] as const;
export type ProductAttributeKind = (typeof PRODUCT_ATTRIBUTE_KINDS)[number];

export type C7Support = 'IMPLEMENTABLE' | 'BLOCKED' | 'UNSUPPORTED';

export interface AliasKindSpec {
  kind: ProductAliasKind;
  label_fa: string;
  meaning_fa: string;
  /** آیا در resolution اسکن نقش دارد؟ فقط `code` — همان قاعدهٔ موجود H-1. */
  used_in_scan: boolean;
  support: C7Support;
  evidence: string;
}

export const PRODUCT_ALIAS_KIND_SPECS: readonly AliasKindSpec[] = Object.freeze([
  {
    kind: 'brand_slang',
    label_fa: 'نام عامیانه/برند',
    meaning_fa: 'نام رایج بازار یا برند که مشتری/اپراتور به‌جای نام رسمی به کار می‌برد.',
    used_in_scan: false,
    support: 'IMPLEMENTABLE',
    evidence: '0046 product_alias.kind check; product.repository.ts q-search over product_alias.alias',
  },
  {
    kind: 'latin',
    label_fa: 'نام لاتین',
    meaning_fa: 'معادل لاتین/بین‌المللی نام کالا برای جست‌وجو و مکاتبه.',
    used_in_scan: false,
    support: 'IMPLEMENTABLE',
    evidence: '0046 product_alias.kind check; normalizeText (NFC + digits + casefold)',
  },
  {
    kind: 'code',
    label_fa: 'کد جایگزین',
    meaning_fa: 'کد قدیمی/تأمین‌کننده؛ تنها نوعی که در resolution اسکن به‌عنوان fallback سوم استفاده می‌شود.',
    used_in_scan: true,
    support: 'IMPLEMENTABLE',
    evidence: 'product-master.service.ts scanResolve: barcode → product.code → alias kind=code',
  },
]);

/** معنای هر نوع صفت — دقیقاً سه نوعِ موجود در قید ۰۰۴۶. */
export interface AttributeKindSpec {
  kind: ProductAttributeKind;
  label_fa: string;
  storage_column: 'value_text' | 'value_num' | 'value_enum';
  meaning_fa: string;
  support: C7Support;
  evidence: string;
}

export const PRODUCT_ATTRIBUTE_KIND_SPECS: readonly AttributeKindSpec[] = Object.freeze([
  {
    kind: 'text',
    label_fa: 'متنی',
    storage_column: 'value_text',
    meaning_fa: 'مقدار متنی آزاد؛ نرمال‌سازی (NFC، ارقام، فاصله) در سرور انجام می‌شود.',
    support: 'IMPLEMENTABLE',
    evidence: '0046 product_attribute_value.ck_product_attribute_value_kind',
  },
  {
    kind: 'number',
    label_fa: 'عددی',
    storage_column: 'value_num',
    meaning_fa: 'مقدار عددی با نمایش قطعی (`canonicalNumber`) در امضای variant.',
    support: 'IMPLEMENTABLE',
    evidence: '0046 numeric(19,4); product-normalize.ts canonicalNumber',
  },
  {
    kind: 'enum',
    label_fa: 'انتخابی',
    storage_column: 'value_enum',
    meaning_fa: 'فقط مقادیر مجازِ همان صفت (`product_attribute_enum_value`) پذیرفته می‌شود.',
    support: 'IMPLEMENTABLE',
    evidence: '0046 uq_product_attribute_enum_value; service enum validation (invalid_attribute_value)',
  },
]);

/**
 * سقف‌های فنی (نه قاعدهٔ کسب‌وکار): جلوگیری از پاسخ/پردازش بی‌کران.
 */
export const PRODUCT_ALIAS_MAX_LENGTH = 255;
export const PRODUCT_ALIAS_LIST_LIMIT = 200;
export const PRODUCT_ALIAS_MAX_PER_PRODUCT = 50;
export const PRODUCT_ATTRIBUTE_TITLE_MAX_LENGTH = 255;
export const PRODUCT_ATTRIBUTE_CODE_MAX_LENGTH = 64;
export const PRODUCT_ATTRIBUTE_ENUM_VALUE_MAX_LENGTH = 255;
export const PRODUCT_ATTRIBUTE_VALUE_TEXT_MAX_LENGTH = 2000;
export const PRODUCT_ATTRIBUTE_VALUES_MAX_ITEMS = 100;
export const PRODUCT_ATTRIBUTE_NUMERIC_MAX_ABS = 999999999999999.9999;
export const PRODUCT_ATTRIBUTE_HISTORY_LIMIT = 20;
export const PRODUCT_ATTRIBUTE_SORT_ORDER_MAX = 32767;

/** فیلدهای ممنوعِ کلاینت (مالکیت/هویت/مجوز/ممیزی/دامنه) — رد صریح، نه حذف بی‌صدا. */
export const C7_FORBIDDEN_CLIENT_FIELDS = [
  'company_id', 'tenant_id', 'tenant', 'owner_company_id', 'owner_tenant_sql',
  'actor_user_id', 'actor', 'created_by', 'updated_by', 'approved_by', 'user_id',
  'before_data', 'after_data', 'audit_id', 'audit_metadata', 'request_id',
  'permissions', 'permission_code', 'role_id', 'roles', 'access_level',
  'domain_id', 'domain_status', 'domain_context', 'available', 'is_available',
  'alias_norm', 'value_norm', 'variant_signature', 'row_version',
  'created_at', 'updated_at', 'deleted_at', 'id', 'x-domain-id',
] as const;

export const ALIAS_CREATE_FIELDS = ['alias', 'kind', 'confirm_add'] as const;
export const ALIAS_LIST_QUERY_FIELDS = ['kind', 'limit'] as const;

export const ATTRIBUTE_VALUE_SET_FIELDS = ['def_id', 'value_text', 'value_num', 'value_enum', 'clear', 'confirm_sensitive'] as const;
export const ATTRIBUTE_VALUE_ITEM_FIELDS = ['def_id', 'value_text', 'value_num', 'value_enum', 'clear'] as const;
export const ATTRIBUTE_VALUES_BODY_FIELDS = ['values', 'confirm_sensitive'] as const;
export const ATTRIBUTE_VALUES_QUERY_FIELDS = ['include_inactive'] as const;

export function findC7ForbiddenFields(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const forbidden = new Set<string>(C7_FORBIDDEN_CLIENT_FIELDS);
  return Object.keys(raw as Record<string, unknown>).filter((k) => forbidden.has(k)).sort();
}

export function findUnsupportedFields(
  raw: unknown,
  allowed: readonly string[],
): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const allowedSet = new Set<string>(allowed);
  return Object.keys(raw as Record<string, unknown>)
    .filter((k) => !allowedSet.has(k) && !(C7_FORBIDDEN_CLIENT_FIELDS as readonly string[]).includes(k))
    .sort();
}

export function isAliasKind(kind: unknown): kind is ProductAliasKind {
  return typeof kind === 'string' && (PRODUCT_ALIAS_KINDS as readonly string[]).includes(kind);
}

export function isAttributeKind(kind: unknown): kind is ProductAttributeKind {
  return typeof kind === 'string' && (PRODUCT_ATTRIBUTE_KINDS as readonly string[]).includes(kind);
}

export const ALIAS_KIND_LABELS_FA: Readonly<Record<string, string>> = Object.freeze({
  brand_slang: 'نام عامیانه/برند',
  latin: 'نام لاتین',
  code: 'کد جایگزین',
});

export const ATTRIBUTE_KIND_LABELS_FA: Readonly<Record<string, string>> = Object.freeze({
  text: 'متنی',
  number: 'عددی',
  enum: 'انتخابی',
});

export interface C7OwnerDecision {
  id: string;
  title_fa: string;
  status: 'BLOCKED' | 'UNRESOLVED';
  detail_fa: string;
}

/**
 * تصمیم‌های بازِ مالک — عمداً پیاده **نشده‌اند** و فقط شفاف گزارش می‌شوند.
 */
export const C7_OWNER_DECISIONS_FA: readonly C7OwnerDecision[] = Object.freeze([
  {
    id: 'C7-D1',
    title_fa: 'یکتایی سراسری/شرکتیِ نام جایگزین',
    status: 'UNRESOLVED',
    detail_fa:
      'قید فعلی فقط `unique(product_id, alias_norm)` است و برخوردِ نام جایگزین با نام جایگزینِ کالای دیگر در DB یکتا نیست (فقط بررسی نرم در سرویس). قاعدهٔ یکتاییِ شرکتی/سراسری سند مصوب ندارد؛ C7 همان بررسیِ موجود را حفظ می‌کند و سیاست تازه‌ای نمی‌سازد.',
  },
  {
    id: 'C7-D2',
    title_fa: 'ویرایشِ نام جایگزین (UPDATE)',
    status: 'UNRESOLVED',
    detail_fa:
      'سرویس فعلی فقط افزودن/حذف دارد و سیاستِ «ویرایش مقدار» یا «نوع» سند مصوبی ندارد. C7 ویرایش نمی‌سازد؛ برای اصلاح، حذف و افزودنِ دوباره (با همان کنترل‌ها و ممیزی) مسیر موجود است.',
  },
  {
    id: 'C7-D3',
    title_fa: 'ادغام/جابه‌جایی نام جایگزین بین کالاها',
    status: 'BLOCKED',
    detail_fa:
      'انتقال یا ادغام نام جایگزین میان کالاها می‌تواند معنای اسکن/سند را تغییر دهد و سند مصوب ندارد؛ C7 هیچ ادغام یا انتقالی انجام نمی‌دهد.',
  },
  {
    id: 'C7-D4',
    title_fa: 'الزامِ صفت در سطح دسته/خانواده (Applicability)',
    status: 'UNRESOLVED',
    detail_fa:
      '`is_required` امروز در سطح کلِ شرکت اعمال می‌شود؛ الزامِ دسته‌محور یا ارث‌بریِ خانوادگی در مدل وجود ندارد و C7 آن را نمی‌سازد. پیامد فعلی: صفت الزامی برای همهٔ کالاهای شرکت الزامی است.',
  },
  {
    id: 'C7-D5',
    title_fa: 'تغییرِ امضا/normalization یا حذفِ امضای variant موجود',
    status: 'BLOCKED',
    detail_fa:
      'الگوریتم `sha256` قطعی و تغییرناپذیری پس از ارجاع عملیاتی (M-3) مصوب است؛ هر تغییر در فرمول یا بازنویسیِ امضاهای تاریخی Redesign می‌خواهد.',
  },
  {
    id: 'C7-D6',
    title_fa: 'صفات دامنه‌ای و دسترس‌پذیری دامنه',
    status: 'BLOCKED',
    detail_fa:
      'PM-B1..PM-B8 خارج از دامنه است؛ صفت/نام جایگزینِ دامنه‌ای ساخته نمی‌شود و `x-domain-id`/`domain_id` روی این سطح ۴۰۰ صریح می‌گیرد.',
  },
  {
    id: 'C7-D7',
    title_fa: 'استفادهٔ عملیاتی از صفت/نام جایگزین در قیمت، موجودی، سفارش',
    status: 'BLOCKED',
    detail_fa:
      'هیچ کدِ قیمت‌گذاری/موجودی/فروش در C7 تغییر نکرد؛ صفت توصیفی و نام جایگزین هیچ اثر عملیاتی ندارند مگر با تصویب صریح مالک.',
  },
]);

export const C7_DOWNSTREAM_NOTES_FA: readonly string[] = Object.freeze([
  'نام جایگزین و صفت، هویتِ کاتالوگی‌اند: کد اصلی کالا (`product.code`) هرگز تغییر نمی‌کند و هیچ سند تاریخی بازنویسی نمی‌شود.',
  'جست‌وجوی کالا و اسکن از قبل نام جایگزین را می‌بینند؛ C7 همان قرارداد را حفظ می‌کند و ترتیب resolution (بارکد ← کد ← alias نوع code) را تغییر نمی‌دهد.',
  'صفت «توصیفی» هیچ اثر قیمت/موجودی/COGS/سفارش ندارد؛ فقط امضای variant محورها (M-3) رفتار موجود را نگه می‌دارد.',
  'خروجی CSV محصول همان هدرهای موجود را دارد؛ نام جایگزین/صفات در آن flatten نمی‌شوند (رفتار قبلی).',
  'هیچ ادغام خودکار کالا، انتقالِ نام جایگزین یا یکسان‌سازیِ اجباری انجام نمی‌شود.',
]);

/** هشدارهای اطلاع‌رسان — بدون مسدودسازی. */
export function aliasKindWarningFa(kind: string): string | null {
  if (kind === 'code') {
    return 'این نام جایگزین در resolution اسکن (پس از بارکد و کد کالا) استفاده می‌شود؛ مقدار آن را با کدهای موجود هم‌ارز نکنید.';
  }
  return null;
}

export function attributeRequiredWarningFa(isRequired: boolean): string | null {
  return isRequired
    ? 'این صفت «الزامی» است و برای همهٔ کالاهای شرکت در ثبت بعدی الزامی می‌شود (دامنهٔ فعلی: کل شرکت).'
    : null;
}
