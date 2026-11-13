/**
 * قواعد خالص و بیدادهٔ «مدیریت دادههای مرجع» (TASK-PM-02-C2).
 *
 * این فایل هیچ وابستهای به pg/Nest/HTTP ندارد تا در تستهای DB-free قابل اثبات
 * باشد. فقط نامها/قالبها/مرزها را تعریف میکند؛ هیچ هویت، عضویت، وضعیت عرضه،
 * دامنه، مالکیت دامنهای یا قاعدهٔ تبدیل واحدی نمیسازد.
 *
 * مصوبات پشتیبان:
 *   - §A طراحی هدف: «گروه/برند موجود — بدون تغییر ساختار» (parent_id/cost_method).
 *   - §C: uom موجود + decimal_places؛ D3 مصوب: دقت تبدیل = چهار رقم اعشار.
 *   - §F: برند/گروه = RBAC عادی master.product.* + audit (فیلد حساس نیست).
 *   - 0005: uq_brand_name(company_id,name)، uq_product_category_code(company_id,code)،
 *           uom.code یکتای سراسری، ck decimal_places between 0 and 4.
 */

export const REFERENCE_ENTITY_TYPES = ['brand', 'uom', 'product_category'] as const;
export type ReferenceEntityType = (typeof REFERENCE_ENTITY_TYPES)[number];

/** کلیدهای مجاز query — هر کلید ناشناخته ۴۰۰ میگیرد، بیصدا حذف نمیشود. */
export const BRAND_LIST_QUERY_KEYS = ['q', 'is_active', 'limit', 'offset'] as const;
export const UNIT_LIST_QUERY_KEYS = ['q', 'is_active', 'limit', 'offset'] as const;
export const CATEGORY_LIST_QUERY_KEYS = ['q', 'is_active', 'parent_id', 'root', 'limit', 'offset'] as const;
export const HISTORY_QUERY_KEYS = ['entity_type', 'entity_id', 'limit', 'offset'] as const;

/** کلیدهای مجاز بدنهٔ نوشتن — فیلد ناشناخته پیش از ValidationPipe صریحاً ۴۰۰ میگیرد. */
export const BRAND_WRITABLE_KEYS = ['code', 'name', 'name_latin', 'is_active'] as const;
export const UNIT_WRITABLE_KEYS = ['code', 'title', 'symbol', 'title_latin', 'decimal_places', 'is_active'] as const;
export const CATEGORY_WRITABLE_KEYS = ['code', 'name', 'name_latin', 'parent_id', 'is_active'] as const;
export const CATEGORY_DELETE_QUERY_KEYS = ['reassign_to'] as const;

export const REFERENCE_MAX_LIMIT = 200;
export const REFERENCE_DEFAULT_LIMIT = 50;
export const REFERENCE_MAX_DEPTH = 12;

/** D3/0005: دقت مقدار چهار رقم اعشار است؛ qtyBase و factor_to_base دستنخوردهاند. */
export const UOM_DECIMAL_MIN = 0;
export const UOM_DECIMAL_MAX = 4;

export const MAX_CODE_LENGTH = 64;
export const MAX_UOM_CODE_LENGTH = 16;
export const MAX_NAME_LENGTH = 255;
export const MAX_SYMBOL_LENGTH = 16;

/** کدهای مرجع فقط حروف/اعداد لاتین و جداکنندههای محدود — بدون فاصله/متن فارسی. */
const BRAND_OR_CATEGORY_CODE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
/** کد واحد همسو با seed موجود (pcs, kg, ml, pm_piece) — حروف کوچک لاتین. */
const UOM_CODE = /^[a-z0-9][a-z0-9_-]*$/;

export type QueryValue = unknown;

/**
 * کلیدهای ناشناختهٔ query را برمیگرداند (مرتب، یکتا).
 * سرور هرگز پارامتر پشتیبانینشده را بیصدا دور نمیریزد: لایهٔ سرویس با
 * `unsupported_query_parameter` ۴۰۰ میدهد. این بررسی روی `req.query` خام
 * (پیش از ValidationPipe whitelist) انجام میشود.
 */
export function unknownQueryKeys(
  query: Record<string, QueryValue> | undefined | null,
  allowed: readonly string[],
): string[] {
  if (!query || typeof query !== 'object') return [];
  const allow = new Set<string>(allowed);
  return Object.keys(query)
    .filter((key) => !allow.has(key))
    .sort();
}

/** نرمالسازی نمایشی: trim + یکسانسازی ی/ك عربی + حذف فاصلههای اضافی. */
export function normalizeText(raw: string): string {
  return raw
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\s+/g, ' ')
    .trim();
}

export type CodeKind = 'brand' | 'category' | 'unit';

/** کد خام را نرمال و اعتبارسنجی میکند؛ null یعنی نامعتبر. */
export function normalizeReferenceCode(kind: CodeKind, raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  // کد واحد همسو با seed موجود کاملاً کوچک است؛ پذیرش Kg و تبدیل به kg
  // صرفاً نرمالسازی نمایشی است و قرارداد `uom.code` را تغییر نمیدهد.
  const code = kind === 'unit' ? trimmed.toLowerCase() : trimmed;
  if (code.length === 0) return null;
  const max = kind === 'unit' ? MAX_UOM_CODE_LENGTH : MAX_CODE_LENGTH;
  if (code.length > max) return null;
  const pattern = kind === 'unit' ? UOM_CODE : BRAND_OR_CATEGORY_CODE;
  if (!pattern.test(code)) return null;
  return code;
}

/** اعتبار `decimal_places` طبق قید موجود 0005 و مصوب D3 (۰..۴، عدد صحیح). */
export function isValidDecimalPlaces(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= UOM_DECIMAL_MIN &&
    value <= UOM_DECIMAL_MAX
  );
}

/**
 * آیا انتساب `parentId` به `categoryId` حلقه میسازد؟
 * `ancestorIdsOfParent` زنجیرهٔ والدهای والدِ پیشنهادی است (از recursive CTE).
 * حلقه وقتی است که خود دسته یا یکی از نوادگانش در آن زنجیره باشد؛ همچنین
 * خودارجاعی (`parentId === categoryId`) ممنوع است.
 */
export function wouldCreateCycle(
  categoryId: string,
  parentId: string | null | undefined,
  ancestorIdsOfParent: readonly string[],
): boolean {
  if (!parentId) return false;
  if (parentId === categoryId) return true;
  return ancestorIdsOfParent.includes(categoryId);
}

/** محدودیتهای صفحهبندی — اعداد نامعتبر به جای پرتاب، به محدودهٔ امن محدود میشوند. */
export function clampLimit(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return REFERENCE_DEFAULT_LIMIT;
  return Math.min(REFERENCE_MAX_LIMIT, Math.max(1, Math.floor(n)));
}

export function clampOffset(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

/**
 * تفسیر امن `is_active` از query (رشتهٔ 'true'/'false' یا بولین).
 * `undefined` یعنی مقدار نامعتبر (لایهٔ سرویس ۴۰۰ میدهد)؛ `null` یعنی بدون فیلتر.
 */
export function parseIsActive(raw: unknown): boolean | null | undefined {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'boolean') return raw;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return undefined; // علامت «مقدار نامعتبر» برای لایهٔ سرویس
}

export const REFERENCE_LABELS_FA: Record<ReferenceEntityType, string> = {
  brand: 'برند',
  uom: 'واحد اندازهگیری',
  product_category: 'دستهبندی کالا',
};

/** کد خطای پایدار و یکسان برای تکرار کد/نام در هر سه منبع. */
export const REFERENCE_DUPLICATE_CODES: Record<ReferenceEntityType, string> = {
  brand: 'duplicate_brand',
  uom: 'duplicate_unit',
  product_category: 'duplicate_category',
};

export const REFERENCE_IN_USE_CODES: Record<ReferenceEntityType, string> = {
  brand: 'brand_in_use',
  uom: 'unit_in_use',
  product_category: 'category_in_use',
};
