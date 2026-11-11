/**
 * قواعدِ خالصِ «تصویر/سند کالا» (TASK-PM-02-C1) — بدون DB، بدون MinIO، قابلِ آزمون واحد.
 *
 * مبنایِ مصوب (بدون اختراع معنای تازه):
 *   - §A طراحی هدف: «بازاستفاده از attachment.owner_type='product' (زنجیرهٔ مالکیت موجود).
 *     قراردادِ تصویرِ اصلی = نخستین بر اساس created_at (بدونِ مهاجرت)؛ در صورتِ نیازِ UI،
 *     بعداً sort_order اضافه شود.»
 *   - §B4: «نخستینِ attachment بر اساسِ created_at = تصویرِ اصلی … تا آن زمان UI این رفتار
 *     را بهشکلِ «اصلی (خودکار)» نشان دهد.»
 *   - §F: تصویر با «RBAC عادی (master.product.*) + audit» اداره میشود.
 *
 * بنابراین در v1 هیچ ستون `is_primary` / `sort_order` / `domain_id` اضافه نمیشود؛
 * تصویرِ اصلی فقط «همان لحظهٔ خواندن» محاسبه میگردد. سند PDF نمیتواند تصویرِ اصلی
 * باشد (تفسیرِ محدودکنندهٔ همان قاعدهٔ «تصویرِ اصلی»، نه یک سیاست تازهٔ کسبوکار).
 * تساویِ `created_at` با `id` بهصورت قطعی شکسته میشود تا پاسخها وابسته به ترتیبِ
 * برگشتیِ pg نباشند.
 */

/** تنها نوعِ مالکِ مجاز در این ماژول — کلاینت هرگز آن را تعیین نمیکند. */
export const PRODUCT_MEDIA_OWNER_TYPE = 'product' as const;

/** انواعِ راستیآزماییشدهٔ تصویر (همخوان با allowlist سرویسِ ضمیمهها). */
export const PRODUCT_MEDIA_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

/** انواعِ سند (همخوان با allowlist سرویسِ ضمیمهها). */
export const PRODUCT_MEDIA_DOCUMENT_TYPES = ['application/pdf'] as const;

/** برچسبِ مصوب §B4 — UI باید دقیقاً همین را نشان دهد. */
export const PRODUCT_MEDIA_PRIMARY_LABEL_FA = 'اصلی (خودکار)';

/** شناسهٔ پایدارِ قاعدهٔ نسخهٔ ۱ (برای کلاینت/ممیزی، بدون ساختن وضعیت دامنهای). */
export const PRODUCT_MEDIA_PRIMARY_RULE = 'first_image_by_created_at' as const;

/** فیلدهایی که کلاینت حق تعیینشان را ندارد؛ مالکیت فقط از مسیر و نشست میآید. */
export const PRODUCT_MEDIA_CLIENT_OWNER_FIELDS = [
  'owner_type',
  'owner_id',
  'company_id',
  'uploaded_by',
  'storage_key',
] as const;

export type ProductMediaKind = 'image' | 'document';

/** همان schemas.Attachment + فیلدهای محصولمحورِ محاسبهشده در لحظهٔ خواندن. */
export interface ProductMediaAttachment {
  id: string;
  owner_type: string;
  owner_id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  url: string;
  created_at: string;
}

export interface ProductMediaItem extends ProductMediaAttachment {
  kind: ProductMediaKind;
  kind_label_fa: string;
  /** فقط برای نخستین تصویر true است؛ هیچ ستونی در DB ذخیره نمیشود. */
  is_primary: boolean;
  /** «اصلی (خودکار)» یا null — UI نباید برچسب دیگری بسازد. */
  primary_label_fa: string | null;
}

const IMAGE_TYPES: ReadonlySet<string> = new Set(PRODUCT_MEDIA_IMAGE_TYPES);

export function mediaKind(contentType: string): ProductMediaKind {
  return IMAGE_TYPES.has((contentType ?? '').toLowerCase()) ? 'image' : 'document';
}

export function mediaKindLabelFa(kind: ProductMediaKind): string {
  return kind === 'image' ? 'تصویر' : 'سند';
}

/** ترتیبِ قطعیِ «قدیمیترین اول» — مبنای تصویرِ اصلی (§B4). */
export function orderByCreatedAt<T extends { created_at: string; id: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const byTime = String(a.created_at).localeCompare(String(b.created_at));
    return byTime !== 0 ? byTime : String(a.id).localeCompare(String(b.id));
  });
}

/** نخستین «تصویر» بر اساس created_at؛ سندها هرگز اصلی نمیشوند. */
export function pickPrimaryImageId(rows: ProductMediaAttachment[]): string | null {
  const first = orderByCreatedAt(rows).find((r) => mediaKind(r.content_type) === 'image');
  return first?.id ?? null;
}

/** تبدیلِ فهرستِ ضمیمهها به نمای محصولمحور، با همان قاعدهٔ مصوب تصویرِ اصلی. */
export function toProductMediaItems(rows: ProductMediaAttachment[]): ProductMediaItem[] {
  const ordered = orderByCreatedAt(rows);
  const primaryId = pickPrimaryImageId(ordered);
  return ordered.map((row) => {
    const kind = mediaKind(row.content_type);
    const isPrimary = row.id === primaryId;
    return {
      ...row,
      kind,
      kind_label_fa: mediaKindLabelFa(kind),
      is_primary: isPrimary,
      primary_label_fa: isPrimary ? PRODUCT_MEDIA_PRIMARY_LABEL_FA : null,
    };
  });
}

/** تبدیلِ یک ضمیمهٔ تازهآپلودشده به همان شکل (برای پاسخ POST). */
export function toProductMediaItem(
  row: ProductMediaAttachment,
  primaryImageId: string | null,
): ProductMediaItem {
  const kind = mediaKind(row.content_type);
  const isPrimary = row.id === primaryImageId;
  return {
    ...row,
    kind,
    kind_label_fa: mediaKindLabelFa(kind),
    is_primary: isPrimary,
    primary_label_fa: isPrimary ? PRODUCT_MEDIA_PRIMARY_LABEL_FA : null,
  };
}

/**
 * فیلدهای مالکیت/اجارهای که کلاینت سعی کرده در multipart تعیین کند.
 * بهجای حذفِ بیصدای آنها (whitelist ValidationPipe) صریحاً ۴۰۰ داده میشود:
 * مالکِ ضمیمه فقط از `:id` و نشست سرور مشتق میگردد.
 */
export function findClientOwnerFields(body: unknown): string[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return [];
  const found = new Set<string>();
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (value === undefined) continue;
    const normalized = key.toLowerCase();
    if ((PRODUCT_MEDIA_CLIENT_OWNER_FIELDS as readonly string[]).includes(normalized)) {
      found.add(normalized);
    }
  }
  return [...found].sort();
}
