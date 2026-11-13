/**
 * ابزار مشترک ماژول کالا (Product Master) — استایل‌ها، برچسب‌ها و کمک‌تابع‌ها.
 * صفحات این ماژول (فهرست، ساخت، جزئیات، ورود گروهی) از همین‌جا می‌خوانند
 * تا ظاهر و رفتار «یک ماژولِ منسجم» بماند، نه مجموعه CRUD پراکنده.
 */
import type { components } from '@dms/api-client';

export type Product = components['schemas']['Product'];
export type ProductAlias = components['schemas']['ProductAlias'];
export type ProductBarcode = components['schemas']['ProductBarcode'];
export type ProductPackaging = components['schemas']['ProductPackaging'];
export type ProductAttributeDef = components['schemas']['ProductAttributeDef'];
export type ProductAttributeValue = components['schemas']['ProductAttributeValue'];
// TASK-PM-02-C6 — روابط کالا از قرارداد بازطراحی‌شدهٔ C6 تولید می‌شوند.
export type ProductRelationsOverview = components['schemas']['ProductRelationsOverview'];
export type ProductRelationItem = components['schemas']['ProductRelationItem'];
export type ProductRelationHistory = components['schemas']['ProductRelationHistory'];
export type ProductRelationGraph = components['schemas']['ProductRelationGraph'];
export type BundleComponent = components['schemas']['BundleComponent'];
export type ProductFamily = components['schemas']['ProductFamily'];
export type ScanResult = components['schemas']['ScanResult'];
export type DuplicateCheckResult = components['schemas']['DuplicateCheckResult'];
export type ImportValidationResult = components['schemas']['ImportValidationResult'];
export type ImportResult = components['schemas']['ImportResult'];
export type BulkMaintenanceFieldsResponse = components['schemas']['BulkMaintenanceFieldsResponse'];
export type BulkMaintenancePreviewRequest = components['schemas']['BulkMaintenancePreviewRequest'];
export type BulkMaintenancePreviewResponse = components['schemas']['BulkMaintenancePreviewResponse'];
export type BulkMaintenanceExecuteRequest = components['schemas']['BulkMaintenanceExecuteRequest'];
export type BulkMaintenanceOperationResult = components['schemas']['BulkMaintenanceOperationResult'];
export type BulkMaintenanceField = components['schemas']['BulkMaintenanceField'];
export type BulkMaintenanceDiff = components['schemas']['BulkMaintenanceDiff'];
export type BulkMaintenancePreviewItem = components['schemas']['BulkMaintenancePreviewItem'];
export type BulkMaintenanceOperationItem = components['schemas']['BulkMaintenanceOperationItem'];
export type BulkMaintenanceChanges = components['schemas']['BulkMaintenanceChanges'];
export type Category = components['schemas']['ProductCategory'];
export type Unit = components['schemas']['Unit'];
// TASK-PM-02-C2 — انواع تولیدشده از قرارداد مدیریت دادههای مرجع
export type Brand = components['schemas']['Brand'];
export type BrandDetail = components['schemas']['BrandDetail'];
export type UnitDetail = components['schemas']['UnitDetail'];
export type CategoryDetail = components['schemas']['CategoryDetail'];
export type ReferenceProduct = components['schemas']['ReferenceProduct'];
export type ReferenceAuditEvent = components['schemas']['ReferenceAuditEvent'];
export type ReferenceMutationResult = components['schemas']['ReferenceMutationResult'];

/** کلاس‌های ثابتِ فرم — هم‌سبک با صفحات موجود (RTL، تایپوگرافی فارسی) */
export const inputCls =
  'w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60';
export const selectCls = `${inputCls} cursor-pointer pe-8`;
export const btnPrimary =
  'rounded-lg bg-info px-4 py-2 text-sm font-medium text-on-info hover:bg-info disabled:opacity-50 focus-ring';
export const btnGhost =
  'rounded-lg border border-line-strong px-4 py-2 text-sm text-ink hover:bg-surface-hover disabled:opacity-50 focus-ring';
export const btnSmall =
  'rounded border border-line-strong px-2 py-1 text-xs text-ink hover:bg-surface disabled:opacity-50 focus-ring';
export const btnDangerSmall =
  'rounded border border-danger-line px-2 py-1 text-xs text-danger-ink hover:bg-danger-soft disabled:opacity-50 focus-ring';
export const panelCls = 'rounded-xl border border-line bg-surface p-4';
export const formPanelCls = 'rounded-xl border border-info-line bg-info-soft p-5';
export const errorCls = 'rounded-lg bg-danger-soft px-4 py-2 text-sm text-danger-ink';
export const okCls = 'rounded-lg bg-brand-soft px-4 py-2 text-sm text-success-ink';
export const warnCls = 'rounded-lg bg-warning-soft px-4 py-2 text-sm text-warning-ink';
export const tableWrapCls = 'overflow-x-auto rounded-xl border border-line bg-surface shadow-sm';
export const thCls = 'px-4 py-3 font-medium text-start text-ink-muted bg-surface-alt';
export const tdCls = 'px-4 py-3';

export const STATUS_LABEL: Record<string, string> = {
  active: 'فعال',
  blocked: 'مسدود',
  discontinued: 'متوقف',
};

export const DIST_LABEL: Record<string, string> = {
  cold: 'سرد',
  warm: 'گرم',
  both: 'سرد و گرم',
};

export const IMPORT_STATUS_LABEL: Record<string, string> = {
  processing: 'در حال پردازش',
  completed: 'پایان‌یافته',
  failed: 'ناموفق',
};

export const IMPORT_OUTCOME_LABEL: Record<string, string> = {
  committed: 'همهٔ دسته‌ها ثبت شدند',
  partial: 'برخی دسته‌ها ثبت و برخی برگشت خوردند',
  rolled_back: 'دسته‌ها برگشت خوردند',
  not_started: 'تراکنشی آغاز نشد',
  unknown: 'نتیجهٔ تراکنش نامشخص — بررسی اپراتور',
};

export const IMPORT_CATEGORY_LABEL: Record<string, string> = {
  none: 'بدون خطا',
  validation: 'اعتبارسنجی',
  business: 'قواعد کسب‌وکار',
  permission: 'مجوز',
  concurrency: 'همزمانی',
  infrastructure: 'زیرساخت',
};

export const IMPORT_BATCH_STATUS_LABEL: Record<string, string> = {
  committed: 'ثبت‌شده',
  rolled_back: 'برگشت‌خورده',
  rejected: 'پیش از تراکنش رد شد',
  failed: 'ناموفق',
};

export function importLabel(map: Record<string, string>, key?: string | null): string {
  if (!key) return '—';
  return map[key] ?? key;
}

export function importToneCls(value?: string | null): string {
  if (value === 'committed' || value === 'completed') return 'text-success-ink';
  if (value === 'partial' || value === 'processing') return 'text-warning-ink';
  if (value === 'unknown' || value === 'failed' || value === 'rolled_back') return 'text-danger-ink';
  return 'text-info-ink';
}

export const ALIAS_KIND_LABEL: Record<string, string> = {
  brand_slang: 'نامِ عامیانه/برند',
  latin: 'لاتین',
  code: 'کدِ جایگزین',
};

export const RELATION_KIND_LABEL: Record<string, string> = {
  substitute: 'جایگزین',
  complement: 'مکمل',
};

export const BARCODE_KIND_LABEL: Record<string, string> = {
  gs1_ean13: 'GS1 — EAN-13',
  gs1_ean8: 'GS1 — EAN-8',
  gs1_upc: 'GS1 — UPC',
  gs1_itf14: 'GS1 — ITF-14',
  internal: 'داخلی (شرکت)',
  other: 'سایر',
};

export const ATTR_KIND_LABEL: Record<string, string> = {
  text: 'متنی',
  number: 'عددی',
  enum: 'انتخابی',
};

export function statusBadgeCls(status: string): string {
  return `rounded-full px-2 py-0.5 text-xs ${
    status === 'active'
      ? 'bg-brand-soft text-success-ink'
      : status === 'blocked'
        ? 'bg-danger-soft text-danger-ink'
        : 'bg-surface-alt text-ink-muted'
  }`;
}

/** مقدارِ یک صفت را از ردیفِ مقدار استخراج می‌کند (فقط یکی از سه ستون پر است) */
export function attrDisplayValue(v: ProductAttributeValue): string {
  if (v.value_text != null && v.value_text !== '') return v.value_text;
  if (v.value_num != null) return String(v.value_num);
  if (v.value_enum != null && v.value_enum !== '') return v.value_enum;
  return '—';
}

/** خطای ساختاریافتهٔ API را به پیام فارسی تبدیل می‌کند */
export function faError(error: unknown): string {
  const e = errorBody(error);
  return e.message_fa ?? (typeof e.message === 'string' ? e.message : 'خطای ناشناخته رخ داد.');
}

/** بدنهٔ خطای API (برای تشخیصِ code مثل sensitive_change_requires_confirmation) */
export function errorBody(error: unknown): { code?: string; message_fa?: string; message?: string } {
  if (error && typeof error === 'object') {
    return error as { code?: string; message_fa?: string; message?: string };
  }
  return {};
}

/** دریافتِ برچسبِ فارسیِ خطا/هشدارِ گزارشِ import */
export type RowIssue = { row?: number; code?: string; message_fa?: string };
