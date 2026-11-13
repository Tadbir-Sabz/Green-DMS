/**
 * TASK-PM-02-C13 — اجراکنندهٔ «ارزیابیِ سایه‌ای» (Shadow Assessment Runner).
 *
 * ⚠️ **آزمایشی و غیرفعال.** هیچ مسیرِ تولیدی این ماژول را import نمی‌کند.
 *
 * این ماژول همان چیزی است که «قبل از هر مهاجرتِ برگشت‌ناپذیر» اجرا می‌شود: یک
 * گزارشِ قابلِ بازتولید که می‌گوید چه برخوردهایی وجود دارد، بدونِ آنکه یک ردیف
 * داده را تغییر دهد.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * اصلِ محوری: **دروازهٔ مجوز، نه یک مستند**
 * ─────────────────────────────────────────────────────────────────────────────
 * یک ارزیابی روی دادهٔ واقعی تنها وقتی مجاز است که **همهٔ** شروط زیر اثبات شوند.
 * اگر یکی نباشد، اجرا **رد می‌شود** — نه با هشدار، بلکه با خطای صریح.
 *
 * این دقیقاً همان درسی است که C12 گرفت: نقشِ `dms_readonly` فقط یک **نام** بود
 * (`rolconfig=NULL`)، نه یک تضمین. پس C13 «فقط-خواندنی بودن» را از رویِ **نام**
 * نمی‌پذیرد؛ شاهدِ اجرایی می‌خواهد.
 *
 * شش شرط (همان‌هایی که C12 نتوانست هیچ‌یک را اثبات کند):
 *   ۱. مجوزِ مالک با شناسهٔ سند
 *   ۲. منشأِ مستندِ داده
 *   ۳. ایزولاسیونِ اثبات‌شده
 *   ۴. نقشِ فقط-خواندنیِ **اجبارشده** (و شاهدِ اثبات)
 *   ۵. نبودِ مسیرِ نوشتنِ مشترک
 *   ۶. کنترلِ محرمانگی
 */

import {
  assessCrossField,
  COMPARISON_CONTRACT_VERSION,
  stableHash,
  type CrossFieldAssessment,
  type CrossFieldOptions,
  type IdentityRow,
} from './cross-field-identity.candidate';

// ---------------------------------------------------------------------------
// توصیفِ منبعِ داده
// ---------------------------------------------------------------------------

/**
 * اعلامِ صریحِ منبع. هیچ میدانی اختیاری نیست: اگر کسی نداند مجوز دارد یا نه،
 * نمی‌تواند منبع را بسازد.
 */
export interface DatasetSource {
  /** نوعِ منبع — تولیدی هرگز مجاز نیست */
  readonly kind: 'synthetic' | 'isolated-copy';
  /** شناسهٔ انسانیِ منبع (نامِ فایل، نامِ پایگاه، ...) */
  readonly identifier: string;
  /** آیا مالکِ داده **کتباً** مجوز داده است؟ */
  readonly owner_authorization: {
    readonly granted: boolean;
    /** شناسهٔ سند/بلیت — بدونِ آن، «مجوز» یک ادعا است */
    readonly document_ref: string | null;
    readonly granted_to: string | null;
  };
  /** منشأِ مستند: از کجا آمده و چه زمانی */
  readonly provenance: {
    readonly documented: boolean;
    readonly origin: string | null;
  };
  /** آیا ایزولاسیون **اثبات** شده است؟ */
  readonly isolation: {
    readonly proven: boolean;
    readonly method: string | null;
  };
  /**
   * نقشِ فقط-خواندنی.
   * `enforced` فقط وقتی true است که شاهدِ اجرایی داشته باشیم که نوشتن **رد می‌شود**.
   */
  readonly read_only_role: {
    readonly role_name: string | null;
    readonly enforced: boolean;
    /** شاهدِ اثبات — مثلاً پیامِ خطای ردِ نوشتن */
    readonly proof: string | null;
  };
  /** آیا مسیرِ نوشتنِ مشترک با تولید وجود دارد؟ */
  readonly shared_write_path: boolean;
  readonly confidentiality: {
    readonly controls_documented: boolean;
    readonly classification: 'synthetic' | 'internal' | 'confidential' | null;
  };
}

export const REQUIRED_CONDITIONS = [
  'owner_authorization',
  'documented_provenance',
  'proven_isolation',
  'enforced_read_only_role',
  'no_shared_write_path',
  'confidentiality_controls',
] as const;
export type RequiredCondition = (typeof REQUIRED_CONDITIONS)[number];

export interface GateVerdict {
  readonly allowed: boolean;
  /** `BLOCKED — REAL DATA IMPACT ASSESSMENT` یا `ALLOWED` */
  readonly verdict: 'ALLOWED' | 'BLOCKED — REAL DATA IMPACT ASSESSMENT';
  readonly kind: DatasetSource['kind'];
  readonly conditions: Readonly<Record<RequiredCondition, boolean>>;
  readonly failed: readonly RequiredCondition[];
  readonly reasons_fa: readonly string[];
}

const CONDITION_LABELS_FA: Record<RequiredCondition, string> = {
  owner_authorization: 'مجوزِ کتبیِ مالکِ داده (با شناسهٔ سند)',
  documented_provenance: 'منشأِ مستندِ داده',
  proven_isolation: 'ایزولاسیونِ اثبات‌شده',
  enforced_read_only_role: 'نقشِ فقط-خواندنیِ اجبارشده با شاهدِ اجرایی',
  no_shared_write_path: 'نبودِ مسیرِ نوشتنِ مشترک',
  confidentiality_controls: 'کنترلِ محرمانگی',
};

// ---------------------------------------------------------------------------
// دروازهٔ مجوز
// ---------------------------------------------------------------------------

/**
 * ارزیابیِ دروازه.
 *
 * منبعِ `synthetic` همیشه مجاز است (خطرِ دادهٔ واقعی ندارد) ولی همچنان باید
 * خودش را synthetic اعلام کند. منبعِ `isolated-copy` باید **هر شش** شرط را
 * اثبات کند؛ در غیرِ این صورت اجرا ممنوع است.
 */
export function evaluateGate(source: DatasetSource): GateVerdict {
  const conditions: Record<RequiredCondition, boolean> = {
    owner_authorization:
      source.owner_authorization.granted === true &&
      typeof source.owner_authorization.document_ref === 'string' &&
      source.owner_authorization.document_ref.trim().length > 0,
    documented_provenance:
      source.provenance.documented === true &&
      typeof source.provenance.origin === 'string' &&
      source.provenance.origin.trim().length > 0,
    proven_isolation:
      source.isolation.proven === true &&
      typeof source.isolation.method === 'string' &&
      source.isolation.method.trim().length > 0,
    enforced_read_only_role:
      source.read_only_role.enforced === true &&
      typeof source.read_only_role.role_name === 'string' &&
      source.read_only_role.role_name.trim().length > 0 &&
      typeof source.read_only_role.proof === 'string' &&
      source.read_only_role.proof.trim().length > 0,
    no_shared_write_path: source.shared_write_path === false,
    confidentiality_controls:
      source.confidentiality.controls_documented === true &&
      source.confidentiality.classification !== null,
  };

  if (source.kind === 'synthetic') {
    // دادهٔ ساختگی خطری برای دادهٔ واقعی ندارد؛ همهٔ شروط «برقرار» شمرده می‌شوند
    // ولی وضعیتِ منبع صریحاً synthetic می‌ماند تا هیچ‌کس آن را واقعی نخواند.
    return {
      allowed: true,
      verdict: 'ALLOWED',
      kind: 'synthetic',
      conditions,
      failed: [],
      reasons_fa: ['منبع synthetic است؛ هیچ دادهٔ سازمانی در خطر نیست.'],
    };
  }

  const failed = REQUIRED_CONDITIONS.filter((c) => !conditions[c]);
  return {
    allowed: failed.length === 0,
    verdict: failed.length === 0 ? 'ALLOWED' : 'BLOCKED — REAL DATA IMPACT ASSESSMENT',
    kind: source.kind,
    conditions,
    failed,
    reasons_fa: failed.map((c) => `${CONDITION_LABELS_FA[c]}: اثبات نشد.`),
  };
}

/** خطای صریحِ منبعِ غیرمجاز — هرگز به هشدار تنزل نمی‌کند */
export class UnauthorizedDatasetError extends Error {
  readonly gate: GateVerdict;

  constructor(gate: GateVerdict) {
    super(
      `C13 shadow assessment refused: ${gate.verdict}. ` +
        `Conditions not proven: ${gate.failed.join(', ') || 'none'}. ` +
        'No query was executed against this source.',
    );
    this.name = 'UnauthorizedDatasetError';
    this.gate = gate;
  }
}

// ---------------------------------------------------------------------------
// اجرای ارزیابی
// ---------------------------------------------------------------------------

export interface RunOptions extends CrossFieldOptions {
  /** برچسبِ نسخهٔ مجموعهٔ داده — برای مقایسهٔ اجراهای افزایشی */
  readonly dataset_version?: string;
  /** شناسهٔ اجرای قبلی برای ادامهٔ افزایشی */
  readonly resume_from?: string | null;
}

export interface ShadowAssessmentReport {
  readonly report_version: string;
  readonly contract_version: string;
  readonly run_id: string;
  readonly dataset: {
    readonly kind: DatasetSource['kind'];
    /**
     * شناسهٔ خامِ منبع — **فقط** برای منبعِ ساختگی.
     * برای منبعِ واقعی `null` است: نامِ replica/پایگاه خودش می‌تواند اطلاعاتِ
     * زیرساختی را افشا کند، پس فقط هش نگه داشته می‌شود.
     */
    readonly identifier: string | null;
    /** نسخهٔ **پوشانده‌شده** از شناسهٔ منبع — همیشه موجود */
    readonly identifier_hash: string;
    readonly version: string;
    readonly synthetic: boolean;
  };
  readonly gate: GateVerdict;
  /** هشدارهای کامل‌بودنِ داده — اگر مجموعه ناقص است، صریح گفته می‌شود */
  readonly completeness: {
    readonly complete: boolean;
    readonly rows: number;
    readonly companies: number;
    readonly fields_covered: readonly string[];
    readonly fields_missing: readonly string[];
    readonly warnings_fa: readonly string[];
  };
  readonly assessment: CrossFieldAssessment;
  readonly incremental: {
    readonly is_incremental: boolean;
    readonly resumed_from: string | null;
    readonly dataset_version: string;
  };
  /** اثرِ انگشتِ قطعیِ محتوا — تغییرِ داده باید این را عوض کند */
  readonly content_fingerprint: string;
  /** اثرِ انگشتِ گزارش — اثباتِ بازتولیدپذیری */
  readonly report_fingerprint: string;
}

const ALL_FIELDS = ['name', 'name_latin', 'alias', 'code', 'barcode'] as const;

/**
 * اجرای ارزیابیِ سایه‌ای.
 *
 * @throws UnauthorizedDatasetError اگر دروازه منبع را نپذیرد — پیش از هر کار روی داده.
 */
export function runShadowAssessment(
  rows: readonly IdentityRow[],
  source: DatasetSource,
  opts: RunOptions = {},
): ShadowAssessmentReport {
  // ⚠️ دروازه **اول** ارزیابی می‌شود. اگر رد شود، هیچ محاسبه‌ای روی داده انجام
  // نمی‌شود — نه حتی خواندنِ کاملِ مجموعه.
  const gate = evaluateGate(source);
  if (!gate.allowed) {
    throw new UnauthorizedDatasetError(gate);
  }

  const assessment = assessCrossField(rows, opts);

  // ── کامل‌بودنِ داده — صریح، نه خوش‌بینانه ────────────────────────────────
  const presentFields = new Set(rows.map((r) => r.field));
  const missing = ALL_FIELDS.filter((f) => !presentFields.has(f));
  const companies = new Set(rows.map((r) => r.company_id));
  const warnings: string[] = [];
  if (rows.length === 0) warnings.push('مجموعهٔ داده خالی است؛ هیچ برخوردی قابلِ ارزیابی نیست.');
  if (missing.length > 0) warnings.push(`میدان‌های غایب: ${missing.join(', ')} — پوشش ناقص است.`);
  if (companies.size === 0) warnings.push('هیچ شرکتی شناسایی نشد.');
  if (source.kind === 'synthetic') warnings.push('دادهٔ ساختگی است؛ نتایج به دادهٔ واقعی تعمیم‌پذیر نیست.');

  // ── اثرِ انگشتِ محتوا ────────────────────────────────────────────────────
  // ترتیب‌ناپذیر: ردیف‌ها به شکلِ متعارف مرتب و هش می‌شوند.
  const canonicalRows = rows
    .map((r) => `${r.company_id}|${r.domain_id ?? ''}|${r.entity_id}|${r.field}|${r.display_value}|${r.stored_normalized}|${r.source_ref}`)
    .sort()
    .join('\n');
  const contentFingerprint = `${stableHash(canonicalRows)}${stableHash(`${rows.length}:${companies.size}`)}`;

  const datasetVersion = opts.dataset_version ?? `fp-${contentFingerprint}`;
  const runId = `C13-RUN-${stableHash(`${datasetVersion}\u0000${contentFingerprint}\u0000${assessment.contract_version}`)}`;

  const reportFingerprint = stableHash(
    JSON.stringify({
      run_id: runId,
      contract: assessment.contract_version,
      summary: assessment.summary.by_decision,
      ids: assessment.results.map((r) => r.collision_id),
    }),
  );

  return {
    report_version: 'c13.1',
    contract_version: COMPARISON_CONTRACT_VERSION,
    run_id: runId,
    dataset: {
      kind: source.kind,
      identifier: source.kind === 'synthetic' ? source.identifier : null,
      identifier_hash: stableHash(source.identifier),
      version: datasetVersion,
      synthetic: source.kind === 'synthetic',
    },
    gate,
    completeness: {
      complete: missing.length === 0 && rows.length > 0,
      rows: rows.length,
      companies: companies.size,
      fields_covered: [...presentFields].sort(),
      fields_missing: missing,
      warnings_fa: warnings,
    },
    assessment,
    incremental: {
      is_incremental: opts.resume_from !== null && opts.resume_from !== undefined,
      resumed_from: opts.resume_from ?? null,
      dataset_version: datasetVersion,
    },
    content_fingerprint: contentFingerprint,
    report_fingerprint: reportFingerprint,
  };
}

/**
 * مقایسهٔ دو اجرا — برای اجرای افزایشی.
 *
 * می‌گوید کدام برخوردها تازه‌اند، کدام رفع شده‌اند و کدام پایدار مانده‌اند.
 */
export interface IncrementalDiff {
  readonly previous_run_id: string;
  readonly current_run_id: string;
  readonly unchanged: number;
  readonly added: readonly string[];
  readonly resolved: readonly string[];
  readonly changed_decision: readonly {
    readonly collision_id: string;
    readonly from: string;
    readonly to: string;
  }[];
}

export function diffAssessments(
  previous: ShadowAssessmentReport,
  current: ShadowAssessmentReport,
): IncrementalDiff {
  const prev = new Map(previous.assessment.results.map((r) => [r.collision_id, r.decision]));
  const curr = new Map(current.assessment.results.map((r) => [r.collision_id, r.decision]));

  const added: string[] = [];
  const resolved: string[] = [];
  const changed: { collision_id: string; from: string; to: string }[] = [];
  let unchanged = 0;

  for (const [id, decision] of curr) {
    const before = prev.get(id);
    if (before === undefined) added.push(id);
    else if (before !== decision) changed.push({ collision_id: id, from: before, to: decision });
    else unchanged += 1;
  }
  for (const id of prev.keys()) {
    if (!curr.has(id)) resolved.push(id);
  }

  return {
    previous_run_id: previous.run_id,
    current_run_id: current.run_id,
    unchanged,
    added: added.sort(),
    resolved: resolved.sort(),
    changed_decision: changed.sort((a, b) => (a.collision_id < b.collision_id ? -1 : 1)),
  };
}
