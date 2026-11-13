/**
 * TASK-PM-02-C6 — کاتالوگِ مرکزیِ روابطِ کالا‑به‑کالا.
 *
 * منبعِ حقیقت فقط چیزهایی است که پیش از این تصویب/پیاده‌سازی شده‌اند:
 *  - مهاجرت `0046_product_master` جدولِ `product_relation` با
 *    `kind ∈ {substitute, complement}`، `priority smallint default 100`،
 *    `unique(product_id, related_id, kind)` و `check (product_id <> related_id)`.
 *  - مهاجرت `0047_product_master_rls` سیاستِ RLSِ هیبرید (شرکت + وجودِ هر دو کالا).
 *  - مهاجرت `0060` تاریخچهٔ تغییرناپذیر برای همین جدول.
 *  - `product-master.service.ts` پیش از C6: مجوز `master.product.update`،
 *    `self_relation`، `relation_cycle` (فقط برای `substitute`) و
 *    `duplicate_relation`؛ و `DELETE /product-relations/{id}`.
 *
 * هیچ نوعِ رابطه، جهت، کاردینالیتی یا اثرِ عملیاتیِ تازه‌ای در C6 ساخته نمی‌شود.
 * `product_bundle` (D5) یک مفهومِ جدا و **فقط کاتالوگی** است و در C6 تغییر نمی‌کند.
 */

export const PRODUCT_RELATION_KINDS = ['substitute', 'complement'] as const;
export type ProductRelationKind = (typeof PRODUCT_RELATION_KINDS)[number];

export type ProductRelationSupport = 'IMPLEMENTABLE' | 'BLOCKED' | 'UNSUPPORTED';

export interface ProductRelationKindSpec {
  kind: ProductRelationKind;
  label_fa: string;
  /** معنای کسب‌وکار دقیقاً همان چیزی که در مدلِ مصوب ۰۰۴۶ آمده است. */
  meaning_fa: string;
  direction: 'directed';
  support: ProductRelationSupport;
  /** آیا این نوع در `product_relation.kind` قیدِ DB دارد؟ */
  enum_constrained: true;
  /** اثرِ عملیاتی: هیچ‌کدام از دو نوع، رفتار فروش/موجودی/قیمت را تغییر نمی‌دهد. */
  operational_effect_fa: string;
  /**
   * قاعدهٔ حلقه: فقط `substitute` پیش از C6 در سرویس رد می‌شد و همان رفتار
   * عیناً حفظ می‌شود. برای `complement` هیچ قاعدهٔ مصوبی وجود ندارد؛ C6 قاعده
   * نمی‌سازد و آن را به‌عنوان تصمیمِ باز ثبت می‌کند.
   */
  cycle_policy: 'rejected_by_existing_rule' | 'no_approved_rule';
  evidence: string[];
}

export const PRODUCT_RELATION_KIND_SPECS: readonly ProductRelationKindSpec[] = Object.freeze([
  {
    kind: 'substitute',
    label_fa: 'جایگزین',
    meaning_fa:
      'کالای مقصد می‌تواند جایگزینِ کالای مبدأ در انتخابِ انسانی باشد؛ رابطه جهت‌دار از مبدأ به مقصد و فقط اطلاع‌رسان است.',
    direction: 'directed',
    support: 'IMPLEMENTABLE',
    enum_constrained: true,
    operational_effect_fa:
      'هیچ جایگزینیِ خودکار در سفارش/فاکتور/قیمت/موجودی انجام نمی‌شود؛ فقط نمایش و انتخابِ آگاهانهٔ اپراتور.',
    cycle_policy: 'rejected_by_existing_rule',
    evidence: [
      'migrations/0046_product_master.up.sql — product_relation.kind check (substitute/complement), unique(product_id, related_id, kind)',
      'migrations/0047_product_master_rls.up.sql — tenant RLS on product_relation',
      'apps/api/src/modules/master-data/product-master.service.ts — substitute cycle rejection (relation_cycle)',
      'docs/product-inventory/PRODUCT_MASTER_TARGET_DESIGN.md §A — جایگزین/مکمل با حلقهٔ substitute رد‌شده در service',
      'docs/product-inventory/TASK-PM-01_PRODUCT_MASTER_SPEC.md §1 — reuse existing 0046 relations; do not recreate',
    ],
  },
  {
    kind: 'complement',
    label_fa: 'مکمل',
    meaning_fa:
      'کالای مقصد معمولاً همراهِ کالای مبدأ عرضه/پیشنهاد می‌شود؛ رابطه جهت‌دار و فقط اطلاع‌رسان است.',
    direction: 'directed',
    support: 'IMPLEMENTABLE',
    enum_constrained: true,
    operational_effect_fa:
      'هیچ گسترشِ بسته، پیشنهادِ خودکار، تغییرِ قیمت یا حرکتِ موجودی از این رابطه ساخته نمی‌شود.',
    cycle_policy: 'no_approved_rule',
    evidence: [
      'migrations/0046_product_master.up.sql — same enum and shape',
      'migrations/0047_product_master_rls.up.sql — tenant RLS',
      'apps/api/src/modules/master-data/product-master.service.ts — no complement-specific restriction exists (preserved)',
    ],
  },
]);

export function findProductRelationKind(kind: string): ProductRelationKindSpec | undefined {
  return PRODUCT_RELATION_KIND_SPECS.find((k) => k.kind === kind);
}

export function isProductRelationKind(kind: unknown): kind is ProductRelationKind {
  return typeof kind === 'string' && (PRODUCT_RELATION_KINDS as readonly string[]).includes(kind);
}

export const PRODUCT_RELATION_LABELS_FA: Readonly<Record<string, string>> = Object.freeze({
  substitute: 'جایگزین',
  complement: 'مکمل',
});

/** `priority` فقط ترتیبِ نمایش/پیشنهاد است؛ هیچ معنای مالی یا عملیاتی ندارد. */
export const PRODUCT_RELATION_PRIORITY_MIN = 0;
export const PRODUCT_RELATION_PRIORITY_MAX = 32767;
export const PRODUCT_RELATION_PRIORITY_DEFAULT = 100;

/** سقف‌های فنیِ پیمایشِ گراف (نگهبانِ فنی، نه قاعدهٔ کسب‌وکار). */
export const PRODUCT_RELATION_GRAPH_MAX_DEPTH = 3;
export const PRODUCT_RELATION_GRAPH_MAX_NODES = 100;
export const PRODUCT_RELATION_GRAPH_DEFAULT_DEPTH = 1;
export const PRODUCT_RELATION_LIST_MAX = 200;
export const PRODUCT_RELATION_HISTORY_LIMIT = 20;

/** فیلدهایی که تعیینشان با کلاینت نیست و پیش از whitelist صریحاً رد می‌شوند. */
export const PRODUCT_RELATION_FORBIDDEN_CLIENT_FIELDS = [
  'company_id', 'tenant_id', 'tenant', 'owner_company_id',
  'actor_user_id', 'actor', 'created_by', 'updated_by', 'approved_by',
  'audit_metadata', 'before_data', 'after_data', 'audit_id',
  'permissions', 'permission_code', 'role_id', 'roles',
  'domain_id', 'domain_status', 'domain_context', 'available',
  'source_status', 'from_status', 'reciprocal', 'inverse', 'auto_create_inverse',
  'created_at', 'updated_at', 'id', 'x-domain-id',
] as const;

export const PRODUCT_RELATION_CREATE_FIELDS = ['related_id', 'kind', 'priority', 'confirm_add'] as const;
export const PRODUCT_RELATION_UPDATE_FIELDS = ['priority'] as const;
export const PRODUCT_RELATION_LIST_QUERY_FIELDS = ['kind', 'direction', 'limit'] as const;
export const PRODUCT_RELATION_GRAPH_QUERY_FIELDS = ['depth', 'kind'] as const;

export const PRODUCT_RELATION_DIRECTIONS = ['outgoing', 'incoming', 'both'] as const;
export type ProductRelationDirection = (typeof PRODUCT_RELATION_DIRECTIONS)[number];

export function findProductRelationForbiddenFields(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const forbidden = new Set<string>(PRODUCT_RELATION_FORBIDDEN_CLIENT_FIELDS);
  return Object.keys(raw as Record<string, unknown>).filter((k) => forbidden.has(k)).sort();
}

export interface ProductRelationOwnerDecision {
  id: string;
  title_fa: string;
  status: 'BLOCKED' | 'UNRESOLVED';
  detail_fa: string;
}

/**
 * تصمیم‌های بازِ مالک. این‌ها عمداً **پیاده نشده‌اند**؛ فقط در پاسخ/UI به‌عنوان
 * «قابل استفاده نیست» گزارش می‌شوند تا هیچ کنترلِ جعلی ساخته نشود.
 */
export const PRODUCT_RELATION_OWNER_DECISIONS_FA: readonly ProductRelationOwnerDecision[] = Object.freeze([
  {
    id: 'C6-D1',
    title_fa: 'جایگزینیِ خودکار در سفارش/فاکتور',
    status: 'BLOCKED',
    detail_fa:
      'استفادهٔ عملیاتی از «جایگزین» (انتخاب خودکار، backorder، تغییرِ سند موجود) در F-06 و P3 است و تصویبِ مالک لازم دارد؛ C6 فقط رابطه را نمایش می‌دهد.',
  },
  {
    id: 'C6-D2',
    title_fa: 'رابطهٔ متقابل و متقارن',
    status: 'UNRESOLVED',
    detail_fa:
      'هیچ قاعدهٔ مصوبی نمی‌گوید افزودن A→B باید B→A را خودکار بسازد. C6 متقارن‌سازیِ خودکار انجام نمی‌دهد و رابطهٔ متقابل فقط با ثبتِ صریحِ مستقل ممکن است.',
  },
  {
    id: 'C6-D3',
    title_fa: 'حلقه در روابط «مکمل»',
    status: 'UNRESOLVED',
    detail_fa:
      'قاعدهٔ حلقه فقط برای «جایگزین» وجود دارد و همان حفظ شده است؛ برای «مکمل» سند مصوبی نیست و C6 سیاستی اختراع نکرد.',
  },
  {
    id: 'C6-D4',
    title_fa: 'کاردینالیتی و الزامِ حداقل/حداکثر',
    status: 'UNRESOLVED',
    detail_fa:
      'هیچ قاعدهٔ مصوبی برای «حداقل یک جایگزین»، «حداکثر N مکمل» یا الزامِ وجودِ رابطه نیست؛ C6 سقفِ فنیِ نمایش/پیمایش دارد، نه قاعدهٔ کسب‌وکار.',
  },
  {
    id: 'C6-D5',
    title_fa: 'شرکت‌پذیریِ وضعیت‌های غیرفعال',
    status: 'UNRESOLVED',
    detail_fa:
      'سند مصوبی وجود ندارد که کالای blocked/discontinued را از داشتن رابطه منع کند؛ C6 وضعیت را نمایش می‌دهد و هشدار می‌دهد ولی رابطه را مسدود نمی‌کند.',
  },
  {
    id: 'C6-D6',
    title_fa: 'گسترشِ عملیاتیِ بسته (D5)',
    status: 'BLOCKED',
    detail_fa:
      'semantics عملیاتیِ bundle (expansion/رزرو/تحویل/COGS) منحصراً P5 است؛ C6 هیچ ترکیبِ بسته یا رابطهٔ کالا را در سند عملیاتی باز نمی‌کند.',
  },
]);

export const PRODUCT_RELATION_DOWNSTREAM_NOTES_FA: readonly string[] = Object.freeze([
  'رابطه اطلاعاتی است: انتخابِ کالا در سفارش/فاکتور/بارنامه هرگز به‌طور خودکار عوض نمی‌شود.',
  'قیمت‌گذاری، موجودی، COGS و بسته‌بندی از این جدول خوانده نمی‌شوند؛ هیچ محاسبه‌ای تغییر نمی‌کند.',
  'وضعیت مرکزی کالا (active/blocked/discontinued) با افزودن یا حذفِ رابطه تغییر نمی‌کند و برعکس.',
  'دسترس‌پذیری دامنه‌ای از این رابطه ساخته نمی‌شود؛ PM-B1..PM-B8 همچنان BLOCKED است.',
]);

/** رابطه با کالایی که فعالِ مرکزی نیست: فقط هشدارِ اطلاع‌رسان، بدون مسدودسازی. */
export function productRelationStatusWarningFa(status: string): string | null {
  if (status === 'active') return null;
  if (status === 'blocked') return 'کالای مرتبط در وضعیت «مسدود» است؛ رابطه حفظ می‌شود ولی استفادهٔ عملیاتی مجاز نیست.';
  if (status === 'discontinued') return 'کالای مرتبط «متوقف» است؛ رابطه فقط برای تاریخچه/بازبینی نمایش داده می‌شود.';
  return null;
}
