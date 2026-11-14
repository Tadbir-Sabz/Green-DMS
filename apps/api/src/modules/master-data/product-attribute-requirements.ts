/**
 * TASK-PM-02-C14-IMPLEMENTATION-01 — اعتبارسنجِ چرخهٔ حیاتِ صفات الزامی (D4)
 *
 * قراردادِ مشترک و «خالص» (بدون NestJS، بدون دیتابیس): تنها وضعیتِ نهاییِ پیشنهادی را
 * می‌گیرد و خطاهای پایدارِ field-addressable برمی‌گرداند؛ هرگز داده را persist نمی‌کند.
 *
 * مرزهای تصویب (TASK-PM-02-C14_IDENTITY_ATTRIBUTE_READINESS.md):
 * - دامنهٔ الزام (company-wide / category / family / mixed) تصمیمِ مالک است و هنوز
 *   مشخص نشده؛ این ماژول هیچ نگاشتِ دسته/خانواده→صفت را ابداع نمی‌کند.
 * - تنها دامنهٔ شواهدیافتهٔ شرکت (company-wide) در مسیرهای نوشتن اعمال می‌شود و آن هم
 *   فقط وقتی PRODUCT_ATTRIBUTE_LIFECYCLE_ENFORCEMENT === 'enforce' (پیش‌فرض: off).
 * - رفتار پیش‌فرضِ این ماژول و همهٔ فراخوان‌هایش «بدون تغییر» است تا تصویب مالک.
 * - صفاتِ الزامی در این قرارداد یعنی همان تعریف‌های is_required شرکت؛ caller
 *   دامنهٔ «کدام محصولات باید این صفت را داشته باشند» را تعیین می‌کند.
 *
 * ترتیب قطعی خروجی: (code، سپس id) — مستقل از ترتیب ورودی و از ترتیبِ نامشخصِ DB.
 */

export type AttributeOperation =
  | 'create'
  | 'update'
  | 'import'
  | 'category_change'
  | 'attribute_values';

/** دامنه‌های الزام — فقط «company» شواهدیافته/در حال اعمال است؛ بقیه منتظر تصمیمِ مالک. */
export type RequiredAttributeScope = 'company' | 'category' | 'family' | 'mixed';

export interface RequiredAttributeDefinition {
  id: string;
  code: string;
  title: string;
}

export interface MissingRequiredAttribute extends RequiredAttributeDefinition {
  /** مسیرِ پایدارِ field-addressable: attributes.<code> */
  field: string;
  /** پیامِ خوانا برای انسان (فارسی‌اول). */
  message_fa: string;
}

export interface RequiredAttributeCheck {
  ok: boolean;
  operation: AttributeOperation;
  missing: MissingRequiredAttribute[];
}

export const REQUIRED_ATTRIBUTE_MISSING_CODE = 'required_attribute_missing';

/** همان پیامِ قراردادِ قبلیِ مسیرِ ویرایشِ صفات. */
export function requiredAttributeMissingMessageFa(title: string): string {
  return `صفتِ «${title}» برای این کالا الزامی است.`;
}

/** ترتیب قطعی (code، سپس id)؛ ورودی دست‌نخورده می‌ماند. */
export function sortRequiredAttributes<T extends RequiredAttributeDefinition>(
  defs: readonly T[],
): T[] {
  return [...defs].sort((a, b) => {
    if (a.code === b.code) return a.id.localeCompare(b.id);
    return a.code.localeCompare(b.code);
  });
}

/**
 * صفات الزامیِ ارائه‌نشده را برمی‌گرداند.
 * @param defs تعریف‌های «قابل‌اعمال» (caller دامنه را تعیین می‌کند؛ این ماژول فیلتر
 *             is_required یا نگاشتِ دسته/خانواده را اعمال نمی‌کند).
 * @param presentDefIds مجموعه/آرایهٔ def_idهایی که در وضعیتِ نهایی مقدار دارند.
 */
export function findMissingRequiredAttributes(
  defs: readonly RequiredAttributeDefinition[],
  presentDefIds: ReadonlySet<string> | readonly string[],
): MissingRequiredAttribute[] {
  const present = presentDefIds instanceof Set ? presentDefIds : new Set(presentDefIds);
  return sortRequiredAttributes(defs.filter((d) => !present.has(d.id))).map((d) => ({
    id: d.id,
    code: d.code,
    title: d.title,
    field: `attributes.${d.code}`,
    message_fa: requiredAttributeMissingMessageFa(d.title),
  }));
}

/** اعتبارسنجیِ وضعیتِ نهایی — بدون persist؛ caller نتیجه را به استثنا/ردیف ترجمه می‌کند. */
export function validateRequiredAttributes(args: {
  defs: readonly RequiredAttributeDefinition[];
  presentDefIds: ReadonlySet<string> | readonly string[];
  operation: AttributeOperation;
}): RequiredAttributeCheck {
  const missing = findMissingRequiredAttributes(args.defs, args.presentDefIds);
  return { ok: missing.length === 0, operation: args.operation, missing };
}

/**
 * بدنهٔ استثنای required_attribute_missing.
 * details.def_id قراردادِ قبلی را حفظ می‌کند (اولین صفتِ گمشده به ترتیبِ قطعیِ
 * code/id) و details.missing فهرستِ کامل و field-addressable است (افزودنِ کلید،
 * سازگار با کلاینت‌های قبلی).
 */
export function requiredAttributeMissingExceptionBody(
  missing: readonly MissingRequiredAttribute[],
  operation: AttributeOperation,
): { code: string; message_fa: string; details: Record<string, unknown> } {
  const first = missing[0];
  if (!first) {
    throw new Error('requiredAttributeMissingExceptionBody requires at least one missing attribute');
  }
  return {
    code: REQUIRED_ATTRIBUTE_MISSING_CODE,
    message_fa: first.message_fa,
    details: {
      def_id: first.id,
      operation,
      missing: missing.map((m) => ({
        def_id: m.id,
        code: m.code,
        title: m.title,
        field: m.field,
        message_fa: m.message_fa,
      })),
    },
  };
}

export type LifecycleEnforcementMode = 'off' | 'enforce';

/**
 * مرزِ غیرفعالِ پیش‌فرض برای الزامِ صفات در مسیرهای lifecycle (ساخت/ویرایش با تغییر
 * دسته یا خانواده/ورودِ گروهی). فقط مقدارِ دقیقِ 'enforce' (بی‌بافت) فعال می‌کند؛
 * هر چیزِ دیگر — از جمله نبودِ متغیر — off است (fail-closed).
 *
 * یگانه دامنهٔ قابل‌اعمال: company-wide (همان معنای مسیرِ ویرایشِ صفات).
 * category/family/mixed تا تصویبِ مالک و بدون نگاشتِ صریح اعمال نمی‌شود.
 * معنا‌شناسیِ «کالأ ناقص چگونه ساخته شود» (draft؟) تصمیمِ مالک است (§4.4 سند آمادگی).
 */
export function readLifecycleEnforcementMode(
  env: NodeJS.ProcessEnv = process.env,
): LifecycleEnforcementMode {
  return (env.PRODUCT_ATTRIBUTE_LIFECYCLE_ENFORCEMENT ?? '').trim().toLowerCase() === 'enforce'
    ? 'enforce'
    : 'off';
}
