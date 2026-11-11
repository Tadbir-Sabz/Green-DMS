/**
 * قواعد خالص «ضمائم سازمانی» (TASK-PM-02-C3) — بدون DB، بدون MinIO، قابل آزمون واحد.
 *
 * مبنای مصوب (بدون اختراع معنای تازهٔ مالکیت):
 *   - `ATTACHMENT_OWNER_TYPES` در `attachments.dto.ts` و enum همنام در
 *     `packages/contracts/openapi.yaml` نُه نوع مالک را از پیش تعریف کردهاند.
 *   - `owner-scope.ts` (`ownerTenantSql`) برای هشتِ آن‌ها «زنجیرهٔ مالکیت
 *     راستیآزمایشدهٔ اجاره» در خود DB دارد؛ `other` عمداً fail-closed است.
 *   - مهاجرت ۰۰۳۵ `company_id` و مجوزهای `attachment.upload|view` و ۰۰۳۶/۰۰۴۱
 *     RLS + FORCE RLS روی `attachment` را برقرار کردهاند.
 *
 * C3 دقیقاً همان هفت نوع عملیاتیِ دارای زنجیرهٔ مالکیت را پشتیبانی میکند.
 * `product` عمداً خارج از این فهرست است: نمای محصولمحور C1 (قاعدهٔ تصویرِ
 * اصلی §B4، `/products/{id}/media`) مالکِ آن است و ساختن نمای دوم، تکرار همان
 * منطق کسبوکاری و دوگانگی رفتار ایجاد میکرد. `other` و هر نوع دیگری (مثل
 * `brand`، `product_category`، `warehouse`، `uom`) صریحاً رد میشوند: نه در enum
 * مصوباند و نه زنجیرهٔ مالکیت دارند؛ افزودنشان «اختراع نوع مالک تازه» است.
 *
 * هیچ `domain_id`، عضویت، وضعیت عرضه، `is_primary`، `sort_order`، سیاست حذف/
 * بایگانی/نگهداشت، مجوز یا نقش تازهای در این فایل تعریف نمیشود.
 */

/** انواع مالکِ عملیاتیِ مصوب و دارای زنجیرهٔ مالکیت راستیآزمایشده (C3). */
export const ENTITY_ATTACHMENT_OWNER_TYPES = [
  'invoice',
  'sales_order',
  'return_request',
  'stock_count',
  'receipt',
  'journal_entry',
  'pod',
] as const;
export type EntityAttachmentOwnerType = (typeof ENTITY_ATTACHMENT_OWNER_TYPES)[number];

/** برچسب فارسی هر موجودیت — UI نباید برچسب دیگری بسازد. */
export const ENTITY_ATTACHMENT_LABELS_FA: Readonly<Record<EntityAttachmentOwnerType, string>> =
  Object.freeze({
    invoice: 'فاکتور فروش',
    sales_order: 'سفارش فروش',
    return_request: 'درخواست مرجوعی',
    stock_count: 'سند انبارگردانی',
    receipt: 'رسید پرداخت',
    journal_entry: 'سند حسابداری',
    pod: 'مدرک تحویل',
  });

/** نشانی صفحهٔ مدیریت هر موجودیت (ناوبری شفاف از پنل ضمائم به رکورد مالک). */
export const ENTITY_ATTACHMENT_MODULE_PATHS: Readonly<Record<EntityAttachmentOwnerType, string>> =
  Object.freeze({
    invoice: '/invoices',
    sales_order: '/orders',
    return_request: '/returns',
    stock_count: '/stock-count',
    receipt: '/treasury',
    journal_entry: '/gl',
    pod: '/waybills',
  });

/**
 * فیلدهایی که کلاینت حق تعیینشان را ندارد. مالک و شرکت فقط از مسیر و نشست
 * سرور مشتق میشوند؛ ارسال هریک ۴۰۰ صریح میگیرد (نه حذف بیصدای whitelist).
 */
export const ENTITY_ATTACHMENT_CLIENT_OWNER_FIELDS = [
  'owner_type',
  'owner_id',
  'company_id',
  'tenant_id',
  'uploaded_by',
  'storage_key',
  'domain_id',
  'domain_status',
] as const;

export type EntityAttachmentKind = 'image' | 'document';

/** همان `schemas.Attachment` + دستهبندی محاسبهشده در لحظهٔ خواندن (بدون ستون DB). */
export interface EntityAttachmentItem {
  id: string;
  owner_type: string;
  owner_id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  url: string;
  created_at: string;
  kind: EntityAttachmentKind;
  kind_label_fa: string;
}

/** نمای مشترک فهرست ضمائم یک موجودیت — یکسان برای همهٔ انواع واجدشرایط. */
export interface EntityAttachmentView {
  owner_type: EntityAttachmentOwnerType;
  owner_id: string;
  owner_label_fa: string;
  module_path: string;
  items: EntityAttachmentItem[];
  counts: { images: number; documents: number; total: number };
  note_fa: string;
  message_fa: string;
}

/** توضیح مصوب مرزها — UI دقیقاً همین را نشان میدهد (بدون کنترل حذف/اصلی). */
export const ENTITY_ATTACHMENT_NOTE_FA =
  'اسناد و تصاویر این رکورد صرفاً ضمیمهٔ همان موجودیت و شرکت شما هستند. ' +
  'حذف، بایگانی، انتخاب تصویر اصلی و سیاست نگهداشت در این نسخه تعریف نشدهاند.';
export const ENTITY_ATTACHMENT_MESSAGE_FA =
  'این نما هیچ هویت، عضویت، وضعیت یا دسترسپذیری دامنهای ایجاد نمیکند و ' +
  'هیچ ورودی دامنهای یا مالکیت ارسالی کلاینت را نمیپذیرد.';

const IMAGE_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export function isEntityAttachmentOwnerType(value: string): value is EntityAttachmentOwnerType {
  return (ENTITY_ATTACHMENT_OWNER_TYPES as readonly string[]).includes(value);
}

export function entityAttachmentKind(contentType: string): EntityAttachmentKind {
  return IMAGE_TYPES.has(String(contentType ?? '').toLowerCase()) ? 'image' : 'document';
}

export function entityAttachmentKindLabelFa(kind: EntityAttachmentKind): string {
  return kind === 'image' ? 'تصویر' : 'سند';
}

export function toEntityAttachmentItem(
  row: Omit<EntityAttachmentItem, 'kind' | 'kind_label_fa'>,
): EntityAttachmentItem {
  const kind = entityAttachmentKind(row.content_type);
  return { ...row, kind, kind_label_fa: entityAttachmentKindLabelFa(kind) };
}

/**
 * فیلدهای مالکیت/اجارهای/دامنهای که کلاینت سعی کرده در multipart تعیین کند.
 * بهجای حذف بیصدا، صریحاً ۴۰۰ داده میشوند.
 */
export function findEntityOwnerFields(body: unknown): string[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return [];
  const found = new Set<string>();
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (value === undefined) continue;
    const normalized = key.toLowerCase();
    if ((ENTITY_ATTACHMENT_CLIENT_OWNER_FIELDS as readonly string[]).includes(normalized)) {
      found.add(normalized);
    }
  }
  return [...found].sort();
}

/** هر فیلد متنی multipart جز `file` ممنوع است؛ قرارداد فقط فایل را میپذیرد. */
export function findUnsupportedBodyFields(body: unknown): string[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return [];
  const ownerFields: ReadonlySet<string> = new Set(ENTITY_ATTACHMENT_CLIENT_OWNER_FIELDS);
  return Object.keys(body as Record<string, unknown>)
    .filter((key) => key !== 'file' && !ownerFields.has(key.toLowerCase()))
    .sort();
}

/** نام موجودیت / مسیر / شمارشها — ساخت نمای یکسان، بدون منطق محصولمحور. */
export function buildEntityAttachmentView(
  ownerType: EntityAttachmentOwnerType,
  ownerId: string,
  rows: Omit<EntityAttachmentItem, 'kind' | 'kind_label_fa'>[],
): EntityAttachmentView {
  const items = rows.map(toEntityAttachmentItem);
  const images = items.filter((i) => i.kind === 'image').length;
  const documents = items.length - images;
  return {
    owner_type: ownerType,
    owner_id: ownerId,
    owner_label_fa: ENTITY_ATTACHMENT_LABELS_FA[ownerType],
    module_path: ENTITY_ATTACHMENT_MODULE_PATHS[ownerType],
    items,
    counts: { images, documents, total: items.length },
    note_fa: ENTITY_ATTACHMENT_NOTE_FA,
    message_fa: ENTITY_ATTACHMENT_MESSAGE_FA,
  };
}
