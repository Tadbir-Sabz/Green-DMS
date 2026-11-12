import { createHash, timingSafeEqual } from 'node:crypto';
import { checkFileContent } from './content-type';
import { VERIFIABLE_MIME_TYPES } from './content-type';
import { ENTITY_ATTACHMENT_LABELS_FA, ENTITY_ATTACHMENT_MODULE_PATHS } from './entity-attachments.rules';

/**
 * قواعد خالص «مرکز انتقال ضمائم» (TASK-PM-02-C4) — بدون DB، بدون MinIO،
 * بدون وابستگی به Nest. منبع حقیقت همان enum مصوب `ATTACHMENT_OWNER_TYPES`
 * و زنجیرهٔ `ownerTenantSql` است؛ C4 فقط هشت نوع دارای مالکیت
 * راستیآزمایشپذیر را میپذیرد: هفت نوع لایهٔ C3 + `product` (نمای C1).
 *
 * مرزها: هیچ `other`، برند/دسته/انبار/واحد، `domain_id`، عضویت، انتساب،
 * تغییر شرکت، حذف/بایگانی/جایگزینی، مجوز/نقش/grant/مهاجرت تازهای تعریف
 * نمیشود. شناسههای مالک در بسته صرفاً «مرجع هدف» هستند و سرور آنها را در
 * مقابل رکوردهای همان شرکت راستیآزمایی میکند؛ `company_id` هرگز از کلاینت
 * پذیرفته نمیشود.
 */

/** هشت نوع مالک مصوب دارای زنجیرهٔ راستیآزمایشده (C1 + C3). */
export const TRANSFER_OWNER_TYPES = [
  'product',
  'invoice',
  'sales_order',
  'return_request',
  'stock_count',
  'journal_entry',
  'receipt',
  'pod',
] as const;
export type TransferOwnerType = (typeof TRANSFER_OWNER_TYPES)[number];

export const TRANSFER_OWNER_LABELS_FA: Readonly<Record<TransferOwnerType, string>> = Object.freeze({
  product: 'کالا',
  invoice: ENTITY_ATTACHMENT_LABELS_FA.invoice,
  sales_order: ENTITY_ATTACHMENT_LABELS_FA.sales_order,
  return_request: ENTITY_ATTACHMENT_LABELS_FA.return_request,
  stock_count: ENTITY_ATTACHMENT_LABELS_FA.stock_count,
  journal_entry: ENTITY_ATTACHMENT_LABELS_FA.journal_entry,
  receipt: ENTITY_ATTACHMENT_LABELS_FA.receipt,
  pod: ENTITY_ATTACHMENT_LABELS_FA.pod,
});

/** مسیرهای ناوبری مصوب؛ receipt/pod فقط بکند دارند و صفحهٔ اختصاصیای ندارند. */
export const TRANSFER_OWNER_MODULE_PATHS: Readonly<Record<TransferOwnerType, string>> = Object.freeze({
  product: '/products',
  invoice: ENTITY_ATTACHMENT_MODULE_PATHS.invoice,
  sales_order: ENTITY_ATTACHMENT_MODULE_PATHS.sales_order,
  return_request: ENTITY_ATTACHMENT_MODULE_PATHS.return_request,
  stock_count: ENTITY_ATTACHMENT_MODULE_PATHS.stock_count,
  journal_entry: ENTITY_ATTACHMENT_MODULE_PATHS.journal_entry,
  receipt: ENTITY_ATTACHMENT_MODULE_PATHS.receipt,
  pod: ENTITY_ATTACHMENT_MODULE_PATHS.pod,
});

export const TRANSFER_SCHEMA = 'green-dms.attachment-transfer/1';
export const TRANSFER_AUDIT_ENTITY_TYPE = 'attachment_transfer';
export const TRANSFER_APPROVAL_OPERATION = 'attachment.import.execute';
export const TRANSFER_PACKAGE_MIME = 'application/zip';
export const TRANSFER_PACKAGE_EXTENSION = 'zip';
export const TRANSFER_PREVIEW_TTL_MS = 15 * 60 * 1000;
export const TRANSFER_URL_TTL_SECONDS = 300;

/** سقفهای سختگیرانهٔ بسته — ضد بمب فشردهسازی و مصرف حافظه. */
export const TRANSFER_MAX_PACKAGE_BYTES = 32 * 1024 * 1024;
export const TRANSFER_MAX_UNCOMPRESSED_BYTES = 48 * 1024 * 1024;
export const TRANSFER_MAX_FILES = 200;
export const TRANSFER_MAX_SINGLE_FILE_BYTES = 8 * 1024 * 1024;
export const TRANSFER_MAX_MANIFEST_BYTES = 1024 * 1024;
export const TRANSFER_MAX_NAME_LENGTH = 200;
export const TRANSFER_MAX_COMPRESSION_RATIO = 100;
export const TRANSFER_MAX_OWNER_ROWS = 50;
export const TRANSFER_MAX_SELECTIONS = 50;

/** ورودیهایی که حق تعیینشان با کلاینت نیست (مالکیت/اجاره/دامنه/ممیزی/تأیید). */
export const TRANSFER_FORBIDDEN_CLIENT_FIELDS = [
  'company_id',
  'tenant_id',
  'domain_id',
  'domain_status',
  'domain_context',
  'available',
  'storage_key',
  'storage_url',
  'signed_url',
  'download_url',
  'uploaded_by',
  'created_by',
  'requested_by',
  'initiator_user_id',
  'approver_user_id',
  'approval_request_id',
  'approved_by',
  'role_id',
  'permission_code',
  'x-domain-id',
] as const;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const SHA256_RE = /^[0-9a-f]{64}$/i;
export const SAFE_PATH_RE = /^files\/[0-9]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp|pdf)$/i;
export const SAFE_FILE_NAME_RE = /^[^/\\\0\r\n\t]{1,200}$/u;

export interface TransferManifestFile {
  path: string;
  attachment_id: string;
  owner_type: TransferOwnerType;
  owner_id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  crc32: number;
  exported_at: string;
}

export interface TransferManifest {
  schema: typeof TRANSFER_SCHEMA;
  operation_id: string;
  created_at: string;
  entity_types: TransferOwnerType[];
  file_count: number;
  total_bytes: number;
  files: TransferManifestFile[];
}

export interface TransferChecksums {
  schema: typeof TRANSFER_SCHEMA;
  manifest_sha256: string;
  package_sha256: string;
  total_bytes: number;
  file_count: number;
}

export interface TransferFileInput {
  attachment_id: string;
  owner_type: TransferOwnerType;
  owner_id: string;
  file_name: string;
  content_type: string;
  bytes: Buffer;
}

export interface TransferMappingOverride {
  path: string;
  owner_id: string;
}

export type TransferItemStatus = 'accepted' | 'rejected' | 'duplicate' | 'unresolved';

export interface TransferPreviewItem {
  path: string;
  attachment_id: string;
  owner_type: TransferOwnerType;
  owner_id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  status: TransferItemStatus;
  reason_code: string;
  message_fa: string;
}

export interface TransferApprovalBindingInput {
  initiatorUserId: string;
  approverUserId: string | null;
  approvedPackageSha256: string | null;
  approvedMappingSha256: string | null;
  approvedPreviewSha256: string | null;
  currentPackageSha256: string;
  currentMappingSha256: string;
  currentPreviewSha256: string;
  approvedAt?: string | null;
  expiresAt?: string | null;
  now?: number;
}

export type TransferApprovalBindingResult =
  | { ok: true }
  | { ok: false; code: string; message_fa: string };

export class TransferPackageError extends Error {
  constructor(
    readonly code: string,
    readonly messageFa: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(messageFa);
    this.name = 'TransferPackageError';
  }
}

export function isTransferOwnerType(value: unknown): value is TransferOwnerType {
  return typeof value === 'string' && (TRANSFER_OWNER_TYPES as readonly string[]).includes(value);
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function sha256Hex(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** مقایسهٔ طولثابت برای هشها و توکنها؛ جلوگیری از حملهٔ زمانسنجی. */
export function secureHexEqual(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string' || !SHA256_RE.test(a) || !SHA256_RE.test(b)) return false;
  const left = Buffer.from(a.toLowerCase(), 'utf8');
  const right = Buffer.from(b.toLowerCase(), 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

/** JSON قطعی با کلیدهای مرتبشده — هش بسته نباید به ترتیب سریالسازی وابسته باشد. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

export function manifestSha256(manifest: TransferManifest): string {
  return sha256Hex(Buffer.from(canonicalJson(manifest), 'utf8'));
}

/** هش کل بسته = manifest قطعی + محتوای هر فایل به ترتیب مسیر. */
export function packageSha256(manifest: TransferManifest, files: ReadonlyMap<string, Buffer>): string {
  const h = createHash('sha256');
  h.update('green-dms.attachment-transfer/package/v1\n', 'utf8');
  h.update(canonicalJson(manifest), 'utf8');
  const paths = [...files.keys()].sort();
  for (const path of paths) {
    const data = files.get(path)!;
    h.update('\u0000', 'utf8');
    h.update(path, 'utf8');
    h.update('\u0000', 'utf8');
    h.update(String(data.length), 'utf8');
    h.update('\u0000', 'utf8');
    h.update(data);
  }
  return h.digest('hex');
}

/** فیلد ممنوع حتی در اشیای تودرتو و آرایهها پیدا میشود (نه حذف بیصدا). */
export function findForbiddenClientFields(value: unknown, path = '', depth = 0): string[] {
  if (depth > 6 || value == null) return [];
  const forbidden = new Set<string>(TRANSFER_FORBIDDEN_CLIENT_FIELDS as readonly string[]);
  const found: string[] = [];
  if (Array.isArray(value)) {
    value.slice(0, 500).forEach((item, i) => {
      found.push(...findForbiddenClientFields(item, path ? `${path}[${i}]` : `[${i}]`, depth + 1));
    });
    return [...new Set(found)].sort();
  }
  if (typeof value !== 'object') return [];
  const obj = value as Record<string, unknown>;
  for (const key of Object.keys(obj).slice(0, 500)) {
    const here = path ? `${path}.${key}` : key;
    if (forbidden.has(key.toLowerCase())) found.push(here);
    found.push(...findForbiddenClientFields(obj[key], here, depth + 1));
  }
  return [...new Set(found)].sort();
}

export function safeExtensionFor(contentType: string): string | null {
  switch (String(contentType).toLowerCase()) {
    case 'image/jpeg': return 'jpg';
    case 'image/png': return 'png';
    case 'image/webp': return 'webp';
    case 'application/pdf': return 'pdf';
    default: return null;
  }
}

/** نام فایل اصلی فقط در manifest نگهداری میشود؛ مسیر ZIP همیشه سرورساخته است. */
export function buildSafePath(index: number, sha: string, contentType: string): string {
  const ext = safeExtensionFor(contentType);
  if (!ext) throw new TransferPackageError('unsupported_media_type', 'نوع فایل ضمیمه پشتیبانی نمیشود.');
  return `files/${String(index + 1).padStart(4, '0')}-${sha.slice(0, 12)}.${ext}`;
}

/** اعتبارسنجی محتوای واقعی، پسوند و سقف حجم؛ مستقل از ادعای کلاینت. */
export function validateTransferBytes(
  bytes: Buffer,
  contentType: string,
  fileName: string,
  expectedSha256?: string,
): void {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) {
    throw new TransferPackageError('empty_file', 'فایل ضمیمه خالی است.');
  }
  if (bytes.length > TRANSFER_MAX_SINGLE_FILE_BYTES) {
    throw new TransferPackageError('file_too_large', 'حجم فایل ضمیمه بیش از سقف مجاز است.');
  }
  if (!(VERIFIABLE_MIME_TYPES as readonly string[]).includes(String(contentType).toLowerCase())) {
    throw new TransferPackageError('unsupported_media_type', 'نوع فایل ضمیمه پشتیبانی نمیشود.');
  }
  if (!SAFE_FILE_NAME_RE.test(fileName)) {
    throw new TransferPackageError('unsafe_file_name', 'نام فایل ضمیمه نامعتبر یا حاوی مسیر است.');
  }
  const checked = checkFileContent(bytes, contentType, fileName);
  if (!checked.ok) {
    throw new TransferPackageError(
      checked.reason ?? 'content_type_mismatch',
      'محتوای بایتی فایل با نوع یا پسوند اعلامشده همخوانی ندارد.',
      { detected: checked.detected, expected_extensions: checked.expectedExtensions ?? null },
    );
  }
  if (expectedSha256 && !secureHexEqual(sha256Hex(bytes), expectedSha256)) {
    throw new TransferPackageError('checksum_mismatch', 'جمعکنترل فایل ضمیمه همخوانی ندارد.');
  }
}

/**
 * دروازهٔ تأیید دونفره: بدون تأییدکنندهٔ مستقل، با خودتأییدی، یا با تغییر
 * بسته/نگاشت/پیشنمایش پس از تأیید، هیچ اجرایی مجاز نیست. این قاعده صرفاً
 * بستن همان معماری مصوب است؛ مجوز، نقش یا گردش تازهای نمیسازد.
 */
export function validateTwoPersonApprovalBinding(input: TransferApprovalBindingInput): TransferApprovalBindingResult {
  if (!input.approverUserId || !input.approvedAt) {
    return { ok: false, code: 'approval_required', message_fa: 'تأیید مستقل شخص دوم ثبت نشده است.' };
  }
  if (input.approverUserId === input.initiatorUserId) {
    return { ok: false, code: 'self_approval_forbidden', message_fa: 'آغازکننده نمیتواند عملیات خود را تأیید کند.' };
  }
  const same =
    secureHexEqual(input.approvedPackageSha256, input.currentPackageSha256) &&
    secureHexEqual(input.approvedMappingSha256, input.currentMappingSha256) &&
    secureHexEqual(input.approvedPreviewSha256, input.currentPreviewSha256);
  if (!same) {
    return { ok: false, code: 'approval_invalidated', message_fa: 'بسته یا نگاشت پس از تأیید تغییر کرده است؛ پیشنمایش و تأیید تازه لازم است.' };
  }
  const now = input.now ?? Date.now();
  if (input.expiresAt && new Date(input.expiresAt).getTime() <= now) {
    return { ok: false, code: 'approval_expired', message_fa: 'مهلت تأیید پایان یافته است.' };
  }
  return { ok: true };
}

export const TRANSFER_NOTE_FA =
  'این مرکز فقط بستههای ضمائم را جابهجا میکند؛ هیچ کالا، دادهٔ مرجع، پیکربندی شرکت، ' +
  'مالکیت دامنهای، حذف، بایگانی یا جایگزینی خودکار ایجاد یا تغییر نمیدهد.';

export const TRANSFER_EXECUTION_BLOCKED_FA =
  'اجرای ورود ضمائم نیازمند گردش تأیید دونفرهٔ مصوب است. معماری فعلی برای این عملیات ' +
  'سیاست/اثرانگشت تأییدشدهای ندارد؛ پیشنمایش امن ارائه میشود و اجرا fail-closed باقی میماند.';
