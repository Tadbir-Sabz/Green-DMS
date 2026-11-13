/**
 * TASK-PM-01D-M4 — Pure client helpers for controlled bulk maintenance.
 * The server owns the field whitelist and the preview; these helpers only
 * shape inputs, labels and safe submission conditions.
 */
import {
  DIST_LABEL,
  errorCls,
  okCls,
  panelCls,
  warnCls,
  type BulkMaintenanceChanges,
  type BulkMaintenanceField,
  type BulkMaintenanceOperationResult,
} from '../products-lib';

export const BULK_MAX_PRODUCTS = 100;
export const BULK_MAX_FIELDS = 9;

export const BULK_STATUS_LABEL: Record<string, string> = {
  preview_created: 'پیشنمایش ایجاد شد',
  preview_stale: 'پیشنمایش کهنه شد',
  preview_expired: 'پیشنمایش منقضی شد',
  accepted: 'اجرا پذیرفته شد',
  committed: 'همه تغییرات ثبت شدند',
  rejected: 'عملیات رد شد',
  unknown: 'نتیجه نامشخص — بررسی لازم است',
};

export const BULK_OUTCOME_LABEL: Record<string, string> = {
  not_started: 'تراکنشی آغاز نشد',
  committed: 'ثبت نهایی شد',
  rolled_back: 'تراکنش برگشت خورد',
  unknown: 'نتیجه نامشخص',
};

export const BULK_FAILURE_LABEL: Record<string, string> = {
  none: 'بدون خطا',
  validation: 'اعتبارسنجی',
  concurrency: 'همزمانی / کهنگی پیشنمایش',
  permission: 'مجوز',
  infrastructure: 'زیرساخت',
  stale: 'کهنگی یا انقضای پیشنمایش',
  unknown: 'نتیجه نامشخص',
};

export const BULK_REASON_LABEL: Record<string, string> = {
  preview_expired: 'پیشنمایش منقضی شد',
  preview_stale: 'پیشنمایش کهنه شد',
  version_conflict: 'تداخل نسخه کالا',
  no_eligible_products: 'هیچ کالای واجد تغییری نبود',
  ineligible_selection: 'یک یا چند کالا واجد شرایط نبودند',
  invalid_value: 'مقدار نامعتبر',
  invalid_reference: 'مرجع نامعتبر',
  protected_field: 'فیلد محافظتشده',
  unsupported_field: 'فیلد پشتیبانی نشده',
  transaction_rolled_back: 'تراکنش برگشت خورد',
  commit_outcome_unknown: 'نتیجه تراکنش نامشخص',
  commit_outcome_unproved: 'ثبت نهایی اثبات نشد',
  operation_not_found: 'عملیات یافت نشد',
  invalid_preview_token: 'نشانه پیشنمایش نامعتبر',
};

export const BULK_ITEM_STATUS_LABEL: Record<string, string> = {
  eligible: 'واجد تغییر',
  rejected: 'ردشده',
  updated: 'ثبت شد',
};

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function bulkStatusToneCls(status?: string | null): string {
  if (status === 'committed') return okCls;
  if (status === 'rejected' || status === 'unknown') return errorCls;
  if (
    status === 'accepted' ||
    status === 'preview_stale' ||
    status === 'preview_expired' ||
    status === 'preview_created'
  ) {
    return warnCls;
  }
  return panelCls;
}

export function bulkValueDisplay(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'بله' : 'خیر';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export function bulkEnumLabel(field: BulkMaintenanceField, value: string): string {
  if (field.key === 'distribution_kind') return DIST_LABEL[value] ?? value;
  return value;
}

export function bulkSelectionError(count: number): string | null {
  if (count < 1) return `حداقل یک کالا را انتخاب کنید.`;
  if (count > BULK_MAX_PRODUCTS) return `حداکثر ${BULK_MAX_PRODUCTS} کالا قابل انتخاب است.`;
  return null;
}

/**
 * Convert one raw form string into a protocol value. `undefined` means the
 * control is incomplete or invalid and the preview button must stay disabled.
 */
export function parseBulkFieldValue(
  field: BulkMaintenanceField,
  rawValue: string,
): BulkMaintenanceChanges[string] | undefined {
  const raw = (rawValue ?? '').trim();
  const maxLength = field.max_length ?? 255;
  switch (field.kind) {
    case 'text': {
      if (raw.length < 1 || raw.length > maxLength) return undefined;
      return raw;
    }
    case 'nullable_text': {
      if (raw.length === 0) return null;
      if (raw.length > maxLength) return undefined;
      return raw;
    }
    case 'uuid': {
      if (raw.length === 0) return null;
      return UUID_V4.test(raw) ? raw : undefined;
    }
    case 'number': {
      if (raw.length === 0) return undefined;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000) return undefined;
      return n;
    }
    case 'nullable_integer': {
      if (raw.length === 0) return null;
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 0 || n > 2_000_000_000) return undefined;
      return n;
    }
    case 'enum': {
      if (raw.length === 0) return undefined;
      return (field.enum_values ?? []).includes(raw) ? raw : undefined;
    }
    case 'boolean': {
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      return undefined;
    }
    default:
      return undefined;
  }
}

export interface BuildBulkChangesResult {
  changes?: BulkMaintenanceChanges;
  error_fa?: string;
}

/** Build a bounded, prototype-safe change object from server-listed fields. */
export function buildBulkChanges(
  fields: readonly BulkMaintenanceField[],
  selectedKeys: readonly string[],
  rawValues: Record<string, string>,
): BuildBulkChangesResult {
  const byKey = new Map(fields.map((field) => [field.key, field]));
  const changes: BulkMaintenanceChanges = {};
  for (const key of selectedKeys) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) {
      return { error_fa: 'فیلد انتخابشده مجاز نیست.' };
    }
    const field = byKey.get(key as BulkMaintenanceField['key']);
    if (!field) return { error_fa: 'فیلد انتخابشده در فهرست سرور وجود ندارد.' };
    const value = parseBulkFieldValue(field, rawValues[key] ?? '');
    if (value === undefined) return { error_fa: `مقدار «${field.label_fa}» معتبر نیست.` };
    changes[key] = value;
  }
  const count = Object.keys(changes).length;
  if (count < 1) return { error_fa: 'حداقل یک فیلد و مقدار معتبر انتخاب کنید.' };
  if (count > BULK_MAX_FIELDS) {
    return { error_fa: `حداکثر ${BULK_MAX_FIELDS} فیلد قابل تغییر است.` };
  }
  return { changes };
}

export function bulkPreviewExpired(expiresAt?: string | null): boolean {
  if (!expiresAt) return true;
  const t = new Date(expiresAt).getTime();
  return !Number.isFinite(t) || t <= Date.now();
}

export function bulkResultIsTerminal(
  result: BulkMaintenanceOperationResult | null,
): boolean {
  if (!result) return false;
  return ['committed', 'rejected', 'unknown', 'preview_expired', 'preview_stale'].includes(
    result.status,
  );
}

export function bulkOperationSummary(result: BulkMaintenanceOperationResult): string {
  const status = BULK_STATUS_LABEL[result.status] ?? result.status;
  const outcome = BULK_OUTCOME_LABEL[result.outcome] ?? result.outcome;
  return `${status} · ${outcome} · واجد ${result.eligible_count.toLocaleString('fa-IR')} · ثبتشده ${result.updated_count.toLocaleString('fa-IR')} · ردشده ${result.rejected_count.toLocaleString('fa-IR')}`;
}
