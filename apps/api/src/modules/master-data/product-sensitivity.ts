import { BadRequestException, ForbiddenException } from '@nestjs/common';

/**
 * ماتریسِ حساسیتِ سطحِ فیلد (D4 مصوب — §F طرحِ هدف):
 * «فیلدهای مالیاتی، وضعیت/توقف، واحدِ پایه، فاکتورِ تبدیل، اجزای bundle»
 * با enforcement در مرزِ نوشتنِ service/domain روی **همهٔ مسیرهای نوشتن**
 * (API عادی، packaging/uom، import/bulk، jobهای آتی).
 *
 * fallback پیش از G-03: RBAC + تأییدِ دومرحله‌ایِ صریح (confirm_sensitive) + audit.
 * هرگز با فقط مجوزِ عادی از کنترل رد نمی‌شود (M-5).
 */

/** فیلدهای حساسِ product — فارغ از مسیرِ نوشتن */
export const SENSITIVE_PRODUCT_FIELDS = [
  'tax_code_id',
  'status',
  'base_uom_id',
] as const;

export type SensitiveField =
  | (typeof SENSITIVE_PRODUCT_FIELDS)[number]
  | 'factor_to_base'
  | 'bundle_components';

export interface SensitiveChange {
  field: SensitiveField;
  before: unknown;
  after: unknown;
}

/**
 * تشخیصِ تغییراتِ حساس نسبت به وضعیتِ فعلی.
 * - `tax_code_id`: هر تغییر (شاملِ حذف/افزودن)
 * - `status`: هر گذارِ وضعیت (§A: blocked→active و بازگشت از discontinued ممتازند)
 * - `base_uom_id`: هر تغییر
 */
export function detectSensitiveProductChanges(
  before: { tax_code_id?: string | null; status?: string; base_uom_id?: string },
  after: { tax_code_id?: string | null; status?: string; base_uom_id?: string },
): SensitiveChange[] {
  const changes: SensitiveChange[] = [];
  if ('tax_code_id' in after && (after.tax_code_id ?? null) !== (before.tax_code_id ?? null)) {
    changes.push({ field: 'tax_code_id', before: before.tax_code_id ?? null, after: after.tax_code_id ?? null });
  }
  if ('status' in after && after.status !== undefined && after.status !== before.status) {
    changes.push({ field: 'status', before: before.status, after: after.status });
  }
  if ('base_uom_id' in after && after.base_uom_id !== undefined && after.base_uom_id !== before.base_uom_id) {
    changes.push({ field: 'base_uom_id', before: before.base_uom_id, after: after.base_uom_id });
  }
  return changes;
}

/**
 * نگهبانِ واحدِ D4 در مرزِ نوشتن.
 *
 * @param changes   تغییراتِ حساسِ شناسایی‌شده
 * @param confirm   پرچمِ تأییدِ صریحِ دومرحله‌ای (confirm_sensitive)
 * @param hasStatusPermission آیا کاربر مجوزِ ممتازِ `master.product.status` را دارد؟
 *                            (فقط برای گذارِ وضعیت لازم است — سایر فیلدها با RBAC عادی + confirm)
 * @param action    برچسبِ عملیات برای پیام/audit
 */
export function assertSensitiveConfirmed(
  changes: SensitiveChange[],
  confirm: boolean,
  hasStatusPermission: boolean,
  action = 'تغییر',
): void {
  if (changes.length === 0) return;

  const statusChanges = changes.filter((c) => c.field === 'status');
  const otherChanges = changes.filter((c) => c.field !== 'status');

  // گذارِ وضعیت: همیشه مجوزِ ممتازِ master.product.status (§A)
  if (statusChanges.length > 0 && !hasStatusPermission) {
    throw new ForbiddenException({
      code: 'status_change_forbidden',
      message_fa: 'تغییر وضعیت/توقف کالا نیازمند مجوزِ «تغییر وضعیت/توقف کالا» است.',
      details: { fields: statusChanges.map((c) => c.field) },
    });
  }

  if (!confirm) {
    throw new BadRequestException({
      code: 'sensitive_change_requires_confirmation',
      message_fa:
        `${action} شاملِ فیلدهای حساس است (مالیات، وضعیت/توقف، واحدِ پایه، فاکتورِ تبدیل، اجزای بسته). ` +
        'برای اعمال باید آن را به‌صورتِ صریح تأیید کنید (confirm_sensitive).',
      details: { fields: changes.map((c) => c.field) },
    });
  }
}

/** فیلترِ ستون‌های حساس برای ردیف‌های import پیش از G-03 (M-5) */
export function sensitiveImportColumns(): readonly string[] {
  return ['tax_code_id', 'tax_code', 'status', 'base_uom_id', 'base_uom_code', 'factor_to_base'];
}
