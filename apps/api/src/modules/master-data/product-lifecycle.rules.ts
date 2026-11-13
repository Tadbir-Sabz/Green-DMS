/**
 * TASK-PM-02-C5 — مرجعِ واحدِ چرخهٔ حیات مرکزی کالا.
 *
 * وضعیتها از قید `0005`، مجوز/تأیید صریح D4، قفل خوشبینانه `0020` و تاریخچهٔ
 * تغییرناپذیر `0060` آمدهاند. تنها گذارهای شاهدپذیر `active↔blocked` هستند؛
 * `discontinued` یک مقدار موجود `product.status` است ولی **همهٔ گذارهای به/از آن
 * BLOCKED / NOT AUTHORIZED** میمانند تا تصویب مالک. معنای توقف، برگشتناپذیری،
 * دلیل، بایگانی، حذف، دسترسپذیری دامنهای و تأیید دونفره مصوب نشده و این فایل
 * هیچ ماشین حالت تازهای نمیسازد.
 */

export const PRODUCT_LIFECYCLE_STATUSES = ['active', 'blocked', 'discontinued'] as const;
export type ProductLifecycleStatus = (typeof PRODUCT_LIFECYCLE_STATUSES)[number];

/** تنها مقاصدی که شواهد D4 موجود از آنها پشتیبانی میکند. */
export const PRODUCT_LIFECYCLE_SUPPORTED_TARGETS = ['active', 'blocked'] as const;
export type ProductLifecycleSupportedTarget = (typeof PRODUCT_LIFECYCLE_SUPPORTED_TARGETS)[number];

/** `deleted_soft` یک مقدار `product.status` نیست؛ نمایانگر `deleted_at is not null` است. */
export type ProductLifecycleSourceState = ProductLifecycleStatus | 'deleted_soft';

/** کد خطای واحد برای گذارهای شامل «متوقف» که بدون تصویب مالک مسدوداند. */
export const PRODUCT_LIFECYCLE_TRANSITION_BLOCKED_CODE = 'lifecycle_transition_blocked';

export const PRODUCT_LIFECYCLE_STATE_LABELS_FA: Readonly<Record<ProductLifecycleSourceState, string>> = Object.freeze({
  active: 'فعال (مرکزی)',
  blocked: 'مسدود (مرکزی)',
  discontinued: 'متوقف (مرکزی)',
  deleted_soft: 'حذفشدۀ نرم (مرکزی)',
});

export interface ProductLifecycleTransitionRule {
  source_status: ProductLifecycleSourceState;
  target_status: ProductLifecycleStatus;
  supported: boolean;
  action_id: string;
  label_fa: string;
  reason_fa: string;
  validation_fa: string;
  authorization_fa: string;
  side_effects_fa: string[];
  dependent_modules_fa: string[];
  audit_fa: string;
  evidence: string[];
  test_coverage_fa: string[];
  decision_dependency_fa: string | null;
  rejection_code: string | null;
}

const D4_VALIDATION_FA =
  'هدف باید یکی از active/blocked/discontinued باشد؛ تغییر وضعیت حساس است و confirm_sensitive صریح، row_version جاری و قفل خوشبینانه لازم دارد. مقادیر شامل discontinued صریحاً BLOCKEDاند.';
const D4_AUTHORIZATION_FA =
  'نشست معتبر + master.product.update در مسیر + بازاعتبارسنجی CatalogAccess + master.product.status؛ شرکت فقط از نشست و RLS/FORCE RLS.';
const TRANSACTIONAL_AUDIT_FA =
  'بهروزرسانی محصول، تریگر تغییرناپذیر 0060 و audit_log.action=product_lifecycle.transition با هویت نشست در یک تراکنش commit/rollback میشوند؛ شکست ممیزی fail-closed است.';
const EXISTING_DOWNSTREAM_FA = [
  'هیچ مسدودسازی تازهای روی سفارش، موجودی، فاکتور یا اسناد تاریخی اضافه نمیشود.',
  'قیمتگذاری و بارنامه دقیقاً همان قرائت وضعیت موجود را حفظ میکنند.',
  'تغییر وضعیت فعلی، snapshot یا ارجاع اسناد تأییدشده را بازنویسی نمیکند.',
];
const DEPENDENT_MODULES_FA = [
  'قیمت: resolveLinePrice برای status !== active خطای product_inactive میدهد (بدون تغییر).',
  'بارنامه: productsValid همچنان p.status = active را قید میزند (بدون تغییر).',
  'سفارش/خرید/موجودی/فاکتور/ضمائم: وجود، مالکیت شرکت و ارجاع تاریخی بررسی میشود؛ قید وضعیت تازهای نساختهایم.',
];
const BASE_EVIDENCE = [
  'migrations/0005_product_catalog.up.sql — product.status, row_version, deleted_at',
  'migrations/0020_optimistic_lock_triggers.up.sql — trg_touch / row_version',
  'migrations/0046_product_master.up.sql — permission master.product.status',
  'migrations/0060_product_catalog_history.up.sql — history trigger, RLS/FORCE RLS, actor_user_id',
  'apps/api/src/modules/master-data/product-sensitivity.ts — D4 status confirmation',
  'apps/api/src/modules/master-data/product.service.ts + product.repository.ts — existing generic status write',
  'apps/api/test/products.api.test.ts — active↔blocked with D4 confirmation',
  'docs/product-inventory/TASK-PM-01_PRODUCT_MASTER_SPEC.md — keep current status privilege/confirmation controls; owner approval for lifecycle/legacy edges',
  'docs/product-inventory/TASK-PM-02_OWNER_DECISION_REGISTER.md — discontinued transitions remain BLOCKED / NOT AUTHORIZED',
];
const DISCONTINUED_DECISION_FA =
  'همهٔ گذارهای به/از «متوقف» BLOCKED / NOT AUTHORIZEDاند. معنای عملیاتی «متوقف»، برگشتناپذیری، دلیل/مدت، اثر بر جریانهای درجریان، بایگانی/نگهداشت و نیاز به تأیید شخص دوم هنوز مصوب نشده است. C5 فقط وضعیت موجود را میخواند و همان کنترل D4 را یکپارچه میکند؛ سیاست تازهای اعمال نمیکند.';

const rule = (
  source_status: ProductLifecycleSourceState,
  target_status: ProductLifecycleStatus,
  action_id: string,
  label_fa: string,
  evidence: string[],
  test_coverage_fa: string[],
): ProductLifecycleTransitionRule => ({
  source_status,
  target_status,
  supported: true,
  action_id,
  label_fa,
  reason_fa: 'گذار شاهدپذیر active↔blocked تحت D4 و قفل خوشبینانه؛ هیچ معنای دامنهای، توقف، حذف یا بایگانی تازهای ایجاد نمیشود.',
  validation_fa: D4_VALIDATION_FA,
  authorization_fa: D4_AUTHORIZATION_FA,
  side_effects_fa: EXISTING_DOWNSTREAM_FA,
  dependent_modules_fa: DEPENDENT_MODULES_FA,
  audit_fa: TRANSACTIONAL_AUDIT_FA,
  evidence: [...BASE_EVIDENCE, ...evidence],
  test_coverage_fa,
  decision_dependency_fa: null,
  rejection_code: null,
});

const unsupported = (
  source_status: ProductLifecycleSourceState,
  target_status: ProductLifecycleStatus,
  reason_fa: string,
  rejection_code: string,
  evidence: string[],
  test_coverage_fa: string[],
  decision_dependency_fa: string | null,
): ProductLifecycleTransitionRule => ({
  source_status,
  target_status,
  supported: false,
  action_id: 'unsupported',
  label_fa: 'گذار پشتیبانینشده',
  reason_fa,
  validation_fa: 'مسیر اختصاصی چرخهٔ حیات و نگهبان واحد D4 درخواست را صریحاً رد میکنند؛ قرارداد عمومی PATCH نیز همان ماتریس را اعمال میکند و row_version بررسی نمیشود.',
  authorization_fa: 'هیچ مجوز تازهای تعریف نمیشود؛ master.product.status، نشست، RLS و DomainBoundaryGuard همچنان برقرارند.',
  side_effects_fa: ['هیچ ردیف محصول، ممیزی یا تاریخچهٔ تازهای نوشته نمیشود.'],
  dependent_modules_fa: ['قیمت، بارنامه، سفارش، موجودی، فاکتور و ضمائم بدون تغییر میمانند؛ اثر downstream اعمال نمیشود.'],
  audit_fa: 'برای خود گذار رویداد transition نوشته نمیشود؛ تاریخچهٔ تغییرناپذیر 0060 و audit_log تغییر نمیکنند.',
  evidence,
  test_coverage_fa,
  decision_dependency_fa,
  rejection_code,
});

const blockedDiscontinued = (
  source_status: ProductLifecycleSourceState,
  target_status: ProductLifecycleStatus,
  evidence: string[],
  test_coverage_fa: string[],
): ProductLifecycleTransitionRule => unsupported(
  source_status,
  target_status,
  'این گذار شامل وضعیت «متوقف» است؛ بدون تصویب مالک BLOCKED / NOT AUTHORIZED است و C5 معنای توقف، برگشتناپذیری، دلیل یا بایگانی آن را پیادهمسازی نمیکند.',
  PRODUCT_LIFECYCLE_TRANSITION_BLOCKED_CODE,
  [...BASE_EVIDENCE, ...evidence],
  test_coverage_fa,
  DISCONTINUED_DECISION_FA,
);

/**
 * ماتریس کامل ۳×۳ بهعلاوهٔ حالت حذف نرم. `supported=true` فقط یعنی همان
 * `active↔blocked` شاهدپذیر در سرویس موجود و D4 اجرا میشد؛ مالک ماشین حالت
 * تازهای مصوب نکرده است. پنج گذار شامل discontinued عمداً BLOCKEDاند.
 */
export const PRODUCT_LIFECYCLE_TRANSITIONS: readonly ProductLifecycleTransitionRule[] = Object.freeze([
  rule(
    'active', 'blocked', 'block', 'مسدود کردن کالا',
    [
      'apps/api/test/products.api.test.ts — active→blocked→active, confirmation and version conflict',
      'apps/api/test/product-master-core.test.ts — D4 confirmation and audit',
      'apps/api/test/product-domain-boundary.api.test.ts — blocked central status does not create domain availability',
    ],
    ['C5: valid transition, missing confirmation, status permission, stale version, transactional audit, cross-company isolation'],
  ),
  blockedDiscontinued(
    'active', 'discontinued',
    ['docs/product-inventory/TASK-PM-01_PRODUCT_MASTER_SPEC.md — discontinued/legacy lifecycle edges require owner approval'],
    ['C5: dedicated POST and generic PATCH reject active→discontinued with lifecycle_transition_blocked; zero writes'],
  ),
  unsupported(
    'active', 'active', 'وضعیت مبدأ و مقصد یکی است؛ گذار محسوب نمیشود و نباید رویداد/ممیزی بیدلیل بسازد.',
    'lifecycle_transition_unchanged',
    [...BASE_EVIDENCE, 'apps/api/src/modules/master-data/product-sensitivity.ts — only a changed status is a sensitive change'],
    ['C5: same-status request is rejected with 400 before any write'],
    null,
  ),
  rule(
    'blocked', 'active', 'activate', 'فعال کردن دوباره',
    [
      'apps/api/test/products.api.test.ts — explicit blocked→active with confirm_sensitive',
      'apps/api/src/modules/master-data/product-sensitivity.ts — §A privileged blocked→active under D4',
    ],
    ['C5: valid transition, missing status permission, stale version, transactional audit'],
  ),
  blockedDiscontinued(
    'blocked', 'discontinued',
    ['docs/product-inventory/TASK-PM-01_PRODUCT_MASTER_SPEC.md — discontinued/legacy lifecycle edges require owner approval'],
    ['C5: dedicated POST rejects blocked→discontinued with lifecycle_transition_blocked; zero writes'],
  ),
  unsupported(
    'blocked', 'blocked', 'وضعیت مبدأ و مقصد یکی است؛ گذار محسوب نمیشود.',
    'lifecycle_transition_unchanged',
    [...BASE_EVIDENCE, 'apps/api/src/modules/master-data/product-sensitivity.ts — only a changed status is a sensitive change'],
    ['C5: same-status policy matrix is exposed and tested'],
    null,
  ),
  blockedDiscontinued(
    'discontinued', 'active',
    ['docs/product-inventory/TASK-PM-01_PRODUCT_MASTER_SPEC.md — rollback from discontinued requires owner approval'],
    ['C5: legacy discontinued state is read-only; dedicated POST and generic PATCH reject rollback'],
  ),
  blockedDiscontinued(
    'discontinued', 'blocked',
    ['docs/product-inventory/TASK-PM-01_PRODUCT_MASTER_SPEC.md — discontinued/legacy lifecycle edges require owner approval'],
    ['C5: legacy discontinued state is read-only; dedicated POST rejects block_discontinued'],
  ),
  blockedDiscontinued(
    'discontinued', 'discontinued',
    ['docs/product-inventory/TASK-PM-01_PRODUCT_MASTER_SPEC.md — discontinued/legacy lifecycle edges require owner approval'],
    ['C5: same-state discontinued request is also BLOCKED; no no-op write or audit event'],
  ),
  ...PRODUCT_LIFECYCLE_STATUSES.map((target) =>
    unsupported(
      'deleted_soft', target,
      'حذف نرم با deleted_at مشخص میشود؛ هیچ API بازگردانی، بایگانی یا تغییر وضعیت آن مصوب/پیادهمسازی نشده است.',
      'product_not_found',
      [
        ...BASE_EVIDENCE,
        'migrations/0005_product_catalog.up.sql — deleted_at is separate from status',
        'apps/api/src/modules/master-data/product.repository.ts — findById/softDelete filter deleted_at is null',
        'docs/product-inventory/TASK-PM-01_PRODUCT_MASTER_SPEC.md — deletion/retention remains owner-gated',
      ],
      ['C5: soft-deleted product is not enumerable from lifecycle read; no undelete endpoint'],
      'بازگردانی/بایگانی/نگهداشت محصول حذفشده نیازمند تصویب مالک است؛ C5 چنین گذاری را BLOCKED نگه میدارد.',
    ),
  ),
]);

export function findProductLifecycleTransition(
  source: string,
  target: string,
): ProductLifecycleTransitionRule | undefined {
  return PRODUCT_LIFECYCLE_TRANSITIONS.find(
    (r) => r.source_status === source && r.target_status === target,
  );
}

export function isSupportedCentralStatusChange(source: string, target: string): boolean {
  return findProductLifecycleTransition(source, target)?.supported === true;
}

/** فیلدهایی که حق تعیینشان با کلاینت نیست — قبل از whitelist بررسی میشوند. */
export const PRODUCT_LIFECYCLE_FORBIDDEN_CLIENT_FIELDS = [
  'company_id', 'tenant_id', 'tenant', 'owner_id', 'owner_company_id', 'owner_tenant_id',
  'created_by', 'updated_by', 'deleted_by', 'actor_user_id', 'actor', 'actor_id',
  'requested_by', 'initiator_user_id', 'approved_by', 'approver_user_id',
  'approval_request_id', 'bulk_operation_id', 'audit_id', 'audit_metadata',
  'permissions', 'permission_code', 'role_id', 'roles', 'is_admin',
  'domain_id', 'domain_status', 'domain_context', 'domain_availability', 'available',
  'status', 'source_status', 'from_status', 'action', 'action_id',
  'ip', 'user_agent', 'request_id', 'at', 'created_at', 'updated_at',
  'x-domain-id',
] as const;

export const PRODUCT_LIFECYCLE_TRANSITION_FIELDS = [
  'target_status', 'row_version', 'confirm_sensitive',
] as const;

export const PRODUCT_LIFECYCLE_READ_QUERY_FIELDS = ['before', 'limit'] as const;

export function findProductLifecycleForbiddenFields(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const keys = Object.keys(raw as Record<string, unknown>);
  const forbidden = new Set<string>(PRODUCT_LIFECYCLE_FORBIDDEN_CLIENT_FIELDS);
  return keys.filter((key) => forbidden.has(key)).sort();
}

export const PRODUCT_LIFECYCLE_DOWNSTREAM_NOTES_FA: readonly string[] = Object.freeze([
  'وضعیت مرکزی صرفاً هویت کاتالوگ است؛ فعال مرکزی بهمعنای عرضه در همهٔ دامنهها نیست.',
  'قیمتگذاری همچنان وضعیت غیرفعال را product_inactive گزارش میکند؛ سفارش/فاکتور/موجودی/خرید/ضمائم مسدودسازی تازهای نمیگیرند.',
  'اسناد و snapshotهای تاریخی با تغییر وضعیت فعلی بازنویسی نمیشوند.',
]);

export const PRODUCT_LIFECYCLE_OWNER_DECISIONS_FA: readonly string[] = Object.freeze([
  'همهٔ گذارهای active/blocked ↔ discontinued، معنای «متوقف»، برگشتناپذیری، دلیل/مدت، اثر بر عملیات درجریان، بایگانی/نگهداشت و نیاز به تأیید شخص دوم: BLOCKED / NOT AUTHORIZED تا تصویب مالک. وضعیت موجود discontinued فقط خواندنی است.',
  'اتصال تأیید دونفره G-03 و جایگزینی/تقویت D4: BLOCKED؛ confirm_sensitive شخص دوم نیست.',
  'چرخهٔ حیات و عضویت دامنهای PM-B1..PM-B8: BLOCKED؛ تغییر وضعیت مرکزی دسترسپذیری دامنه ایجاد نمیکند.',
  'حذف، بازگردانی، بایگانی و نگهداشت: BLOCKED؛ deleted_at فقط حذف نرم موجود است.',
  'active↔blocked صرفاً همان گذارهای شاهدپذیر موجود تحت D4اند، نه جدول قطعی و مصوب مالک برای همهٔ وضعیتها.',
]);
