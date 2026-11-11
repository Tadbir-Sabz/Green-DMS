import { BadRequestException } from '@nestjs/common';
import { parseCsv } from '../../common/csv';

/**
 * TASK-PM-02 — مرزِ جدایی «هویت مرکزی کالا» از «عضویت/دسترسپذیری دامنهای».
 *
 * قاعدهٔ مصوبِ مالک (TASK-PM-01 §2، §5 و PM-01D): یک کالا ممکن است در دامنهٔ A
 * فعال و در B غایب یا غیرقابلعرضه باشد؛ `product.status` یک چرخهٔ حیاتِ **مرکزی**
 * است و هیچگاه جایگزین دسترسپذیری دامنهای نیست. عضویت دامنهای نباید بیصدا به
 * عنوان ویژگی سراسری کالا نوشته یا خوانده شود.
 *
 * این فایل صرفاً یک نگهبانِ فنی و بیداده است. هیچ شناسهٔ دامنه، رجیستری، مجوز،
 * ماشین حالت عضویت، وضعیت عملیاتی یا مهاجرت تعریف نمیکند؛ تصمیمهای
 * PM-B1..PM-B8 بدون پاسخ باقی میمانند. نگهبان فقط جلوی «قاچاق» ویژگیهای
 * دامنهای به سطوح مرکزی (بدنهٔ JSON، query، سرستون CSV، هدر زمینهٔ دامنه)
 * را میگیرد تا بعداً لایهٔ عضویت به هویت سراسری چسبانده نشود.
 */

/** سقف اسکن برای جلوگیری از پردازش بیمورد بدنههای بزرگ (همسقف import §E). */
export const DOMAIN_BOUNDARY_MAX_CSV_CHARS = 1024 * 1024;
export const DOMAIN_BOUNDARY_MAX_DEPTH = 4;
export const DOMAIN_BOUNDARY_MAX_KEYS = 200;
export const DOMAIN_BOUNDARY_MAX_ARRAY_ITEMS = 100;
export const DOMAIN_BOUNDARY_MAX_REPORTED_FIELDS = 20;

export const DOMAIN_PROPERTY_REJECTED = 'domain_property_rejected' as const;
export const DOMAIN_CONTEXT_NOT_SUPPORTED = 'domain_context_not_supported' as const;

/** کلیدهایی که معنای دامنهای دارند و نباید در سطوح مرکزی پذیرفته شوند. */
export const DOMAIN_OWNED_TOKENS: readonly string[] = [
  // identity / membership
  'domain', 'domains', 'domain_id', 'domain_ids', 'domain_uuid',
  'operational_domain', 'operational_domain_id', 'operational_domains',
  'domain_code', 'domain_name', 'domain_label', 'domain_type',
  'product_domain', 'product_domain_id', 'product_domains',
  'domain_product', 'domain_products', 'domain_membership',
  'domain_memberships', 'product_domain_membership', 'membership',
  'memberships', 'membership_id', 'membership_status', 'membership_state',
  // lifecycle / activation / configuration
  'domain_status', 'domain_state', 'domain_lifecycle', 'domain_config',
  'domain_configuration', 'domain_settings', 'domain_enabled',
  'domain_disabled', 'domain_active', 'domain_activation',
  'domain_activation_status', 'domain_deactivation', 'domain_retired',
  'active_in_domain', 'is_active_in_domain', 'enabled_in_domain',
  // availability (never a global product property)
  'domain_availability', 'domain_available', 'domain_unavailable',
  'availability', 'available', 'is_available', 'unavailable',
  'available_in_domain', 'is_available_in_domain', 'availability_in_domain',
  'offered_in_domain', 'absent_from_domain', 'withdrawn_from_domain',
  'suspended_in_domain', 'local_availability', 'local_status',
  // authority / assignment
  'domain_authority', 'domain_actor', 'domain_assignment',
  'domain_user', 'domain_role', 'domain_permission', 'domain_scope_id',
  'x_domain_id', 'domain_header', 'domain_context',
  // Persian-first CSV headers / JSON keys
  'دامنه', 'دامنه_ها', 'دامنه_عملیاتی', 'کد_دامنه', 'شناسه_دامنه',
  'نام_دامنه', 'نوع_دامنه', 'وضعیت_دامنه', 'حالت_دامنه',
  'چرخه_حیات_دامنه', 'پیکربندی_دامنه', 'فعال_در_دامنه',
  'غیرفعال_در_دامنه', 'فعالسازی_دامنه', 'فعال_سازی_دامنه',
  'غیرفعالسازی_دامنه', 'بازنشستگی_دامنه', 'عضویت', 'عضویت_دامنه',
  'عضویت_ها', 'وضعیت_عضویت', 'حالت_عضویت', 'تاریخچه_عضویت',
  'دسترس_پذیری', 'دسترسپذیری', 'دسترسی', 'قابل_دسترس', 'قابل_عرضه', 'عرضه',
  'وضعیت_عرضه', 'دسترسپذیری_دامنه', 'عرضه_در_دامنه', 'عدم_عرضه',
  'غیرقابل_عرضه', 'غیرقابل_دسترس', 'غایب_در_دامنه', 'موجود_در_دامنه',
  'اختیار_دامنه', 'نقش_دامنه', 'کاربر_دامنه', 'انتساب_دامنه',
];

const DOMAIN_OWNED_TOKEN_SET = new Set(DOMAIN_OWNED_TOKENS);
/** همسنجی بدون زیرخط، تا `DomainID` و `domain_id` هر دو شناسایی شوند. */
const DOMAIN_OWNED_COMPACT_SET = new Set(
  DOMAIN_OWNED_TOKENS.map((token) => token.replace(/_/g, '')),
);

/**
 * نرمالسازی قطعی نام کلید/سرستون: camelCase←snake_case، حذف اعراب/جهتنماها،
 * یکسانسازی ی/ي و ک/ك، فاصله/خطتیره←زیرخط. فقط نام بررسی میشود، نه مقدار؛
 * بنابراین نام کالای «شیر دامنهدار» هرگز رد نمیشود.
 */
export function normalizeDomainToken(raw: string): string {
  return raw
    .replace(/^\uFEFF/, '')
    .replace(/[\u064B-\u0652\u0670\u200C\u200D\u200E\u200F]/g, '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ة/g, 'ه')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .trim()
    .replace(/[\s\-./]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function isDomainOwnedToken(raw: string): boolean {
  const token = normalizeDomainToken(raw);
  return (
    DOMAIN_OWNED_TOKEN_SET.has(token) ||
    DOMAIN_OWNED_COMPACT_SET.has(token.replace(/_/g, ''))
  );
}

export interface DomainBoundaryScanResult {
  /** نامهای اصلی (بدون نرمالسازی)، یکتا و مرتب؛ حداکثر ۲۰ مورد. */
  fields: string[];
  /** آیا به سقف اسکن رسیدیم؟ (fail-closed: همان یافتهها رد میشوند) */
  bounded: boolean;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** اسکن فقط کلیدهای اشیاء/آرایهها — مقدارها هرگز معنی دامنهای نمیسازند. */
export function findDomainOwnedKeys(value: unknown): DomainBoundaryScanResult {
  const found = new Set<string>();
  let bounded = false;
  let visited = 0;

  const walk = (node: unknown, depth: number): void => {
    if (depth > DOMAIN_BOUNDARY_MAX_DEPTH) {
      bounded = true;
      return;
    }
    if (Array.isArray(node)) {
      if (node.length > DOMAIN_BOUNDARY_MAX_ARRAY_ITEMS) bounded = true;
      for (const item of node.slice(0, DOMAIN_BOUNDARY_MAX_ARRAY_ITEMS)) walk(item, depth + 1);
      return;
    }
    if (!isPlainObject(node)) return;
    const keys = Object.keys(node);
    if (keys.length > DOMAIN_BOUNDARY_MAX_KEYS) bounded = true;
    for (const key of keys.slice(0, DOMAIN_BOUNDARY_MAX_KEYS)) {
      visited += 1;
      if (visited > DOMAIN_BOUNDARY_MAX_KEYS) {
        bounded = true;
        return;
      }
      if (isDomainOwnedToken(key)) found.add(key);
      const child = node[key];
      if (isPlainObject(child) || Array.isArray(child)) walk(child, depth + 1);
    }
  };

  walk(value, 0);
  return {
    fields: [...found].sort().slice(0, DOMAIN_BOUNDARY_MAX_REPORTED_FIELDS),
    bounded,
  };
}

/** فقط ردیف سرستون CSV بررسی میشود؛ سلولهای داده میتوانند واژهٔ «دامنه» داشته باشند. */
export function findDomainOwnedCsvHeaders(csvText: string): DomainBoundaryScanResult {
  if (typeof csvText !== 'string' || csvText.length === 0) {
    return { fields: [], bounded: false };
  }
  const bounded = csvText.length > DOMAIN_BOUNDARY_MAX_CSV_CHARS;
  const sample = bounded ? csvText.slice(0, DOMAIN_BOUNDARY_MAX_CSV_CHARS) : csvText;
  let headerRow: string[] = [];
  try {
    headerRow = parseCsv(sample)[0] ?? [];
  } catch {
    // تجزیهٔ ناموفق ⇒ بدون حدس، import خودش خطای قالب میدهد.
    return { fields: [], bounded };
  }
  const found = new Set<string>();
  for (const header of headerRow) {
    if (typeof header === 'string' && isDomainOwnedToken(header)) found.add(header.trim());
  }
  return {
    fields: [...found].sort().slice(0, DOMAIN_BOUNDARY_MAX_REPORTED_FIELDS),
    bounded: bounded || found.size > DOMAIN_BOUNDARY_MAX_REPORTED_FIELDS,
  };
}

/** خطای واحد و پایدار برای همهٔ سطوح مرکزی (قرارداد Error: code + message_fa + details). */
export function domainBoundaryError(input: {
  code: typeof DOMAIN_PROPERTY_REJECTED | typeof DOMAIN_CONTEXT_NOT_SUPPORTED;
  surface: string;
  fields: readonly string[];
  source: 'body' | 'query' | 'csv_header' | 'x-domain-id';
}): BadRequestException {
  const decisionDocument =
    'docs/product-inventory/TASK-PM-01B_DOMAIN_OWNER_DECISIONS.md';
  const message_fa =
    input.code === DOMAIN_PROPERTY_REJECTED
      ? 'ویژگی عضویت یا دسترسپذیری دامنهای نمیتواند بهعنوان ویژگی سراسری کالا ارسال شود. ' +
        'تا تصویب هویت دامنه، هیچ مقدار دامنهای در کاتالوگ مرکزی ذخیره نمیشود.'
      : 'زمینهٔ دامنه روی عملیات کاتالوگ مرکزی پذیرفته نیست. ' +
        'وضعیت فعال مرکزی بهمعنای عرضه در دامنه نیست و شناسهٔ ارسالی مشتری اثبات هویت دامنه محسوب نمیشود.';
  return new BadRequestException({
    code: input.code,
    message_fa,
    details: {
      surface: input.surface,
      source: input.source,
      fields: [...input.fields],
      decision_document: decisionDocument,
      owner_decisions: ['PM-B1', 'PM-B2', 'PM-B4', 'PM-B5'],
    },
  });
}
