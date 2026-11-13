/**
 * TASK-C13-EXECUTION-ENABLEMENT-01 — خط‌لولهٔ قطعیِ ارزیابیِ C13 (shadow assessment).
 *
 * ⚠️ **آزمایشی و غیردادنی.** هیچ مسیرِ تولیدی این ماژول را import نمی‌کند.
 *
 * شش مرحلهٔ صریح — هرکدام با ورودی/خروجیِ مشخص و رفتارِ شکستِ روشن:
 *
 *   Stage 1  INGEST           — دریافتِ ردیف‌ها (از آداپتورِ DB یا فایل/Fixture)
 *   Stage 2  VALIDATE INPUT   — شکل/نوعِ هویت/شرکت؛ ردیف‌های نامعتبر شمارش و کنار گذاشته می‌شوند
 *   Stage 3  GATE             — دروازهٔ منشأ: SYNTHETIC_FIXTURE / ISOLATED_RESTORED / AUTHORIZED_REPLICA
 *                               (REAL هرگز از synthetic؛ synthetic هرگز authorization — §۰ بستهٔ REV1)
 *   Stage 4  EXECUTE          — موتورِ c13xt.1 (assessCrossType + simulateFuturePolicies + analyzeScanResolution)
 *   Stage 5  VERIFY REPORT    — validateShadowEvidence + بازتولیدِ fingerprint (پایداریِ ورودی) +
 *                               تطبیقِ export با source.recordCounts/exportedCounts
 *   Stage 6  EMIT             — فقط پس از PASS همهٔ چک‌ها؛ گزارش + sidecarِ وارسی (machine-verifiable)
 *
 * شکست در هر مرحله ⇒ `AssessmentPipelineError` با نامِ مرحله و فهرستِ issues — هیچ فایلی emit نمی‌شود.
 */
import type {
  ShadowAuthorization,
  ShadowDataClassification,
  ShadowAssessmentMode,
  ShadowEvidenceReport,
  ShadowSourceSpec,
} from './shadow-evidence.candidate';
import {
  buildShadowEvidence,
  validateShadowEvidence,
  canonicalJson,
  sha256Hex,
} from './shadow-evidence.candidate';
import {
  IDENTITY_TYPES,
  type CrossTypeRow,
  type IdentityType,
} from './cross-type-collision.candidate';

/* ────────────────────────────────────────────────────────────────────────── */

export class AssessmentPipelineError extends Error {
  readonly stage: PipelineStage;
  readonly issues: readonly string[];
  constructor(stage: PipelineStage, issues: readonly string[]) {
    super(`شکست در مرحلهٔ ${stage}:\n- ${issues.join('\n- ')}`);
    this.name = 'AssessmentPipelineError';
    this.stage = stage;
    this.issues = issues;
  }
}

export type PipelineStage = 'INGEST' | 'VALIDATE_INPUT' | 'GATE' | 'EXECUTE' | 'VERIFY_REPORT' | 'EMIT';

export interface AssessmentInput {
  readonly rows: readonly CrossTypeRow[];
  readonly classification: ShadowDataClassification;
  /** تمایزِ منشأ — برای سه سناریوی Track B */
  readonly assessmentMode: ShadowAssessmentMode;
  readonly source: Omit<ShadowSourceSpec, 'assessmentMode'> & { readonly identity: string; readonly snapshotTsIso: string };
  readonly authorization?: ShadowAuthorization;
  /** شمارشِ exportشده به‌ازایِ هر جدول (از آداپتور) — برای تطبیقِ کامل‌بودن */
  readonly exportedCounts?: Readonly<Record<string, number>>;
  /** شمارشِ منبع (tenant-scoped) — برای وارسیِ export ⊆ source */
  readonly recordCounts?: Readonly<Record<string, number>>;
  /** آیا recordCounts زیرِ RLS با زمینهٔ tenant سنجیده شده؟ (adapter همیشه true می‌دهد) */
  readonly recordCountsTenantScoped?: boolean;
  readonly now?: () => Date;
}

export interface VerificationCheck {
  readonly id: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface AssessmentVerification {
  readonly schema: 'c13-verify.1';
  readonly ok: boolean;
  readonly assessment_mode: ShadowAssessmentMode;
  readonly data_classification: ShadowDataClassification;
  readonly input_fingerprint: string;
  readonly evidence_fingerprint: string;
  readonly reproducible: boolean;
  readonly exported_counts: Readonly<Record<string, number>> | null;
  readonly rows_in: number;
  readonly checks: readonly VerificationCheck[];
}

export interface AssessmentResult {
  readonly report: ShadowEvidenceReport;
  readonly verification: AssessmentVerification;
}

/* ── Stage 2 helpers ─────────────────────────────────────────────────────── */

const VALID_TYPES = new Set<string>(IDENTITY_TYPES as readonly string[]);
const REQUIRED_STRING_FIELDS = [
  'entity_id',
  'entity_type',
  'identity_type',
  'display_value',
  'source_ref',
  'company_id',
  'stored_normalized',
] as const;
const VALID_ENTITY_TYPES = new Set(['product', 'product_family', 'product_category']);

export interface InputValidationResult {
  readonly valid: readonly CrossTypeRow[];
  readonly invalid: readonly { index: number; reason: string }[];
}

export function validateAssessmentRows(rows: readonly CrossTypeRow[]): InputValidationResult {
  const valid: CrossTypeRow[] = [];
  const invalid: { index: number; reason: string }[] = [];
  rows.forEach((r, i) => {
    const reasons: string[] = [];
    if (!r || typeof r !== 'object') {
      invalid.push({ index: i, reason: 'ردیف ساختاریافته نیست' });
      return;
    }
    for (const f of REQUIRED_STRING_FIELDS) {
      const v = (r as unknown as Record<string, unknown>)[f];
      if (typeof v !== 'string' || v.trim().length === 0) reasons.push(`${f} خالی/غایب`);
    }
    if (r.entity_type && !VALID_ENTITY_TYPES.has(r.entity_type)) {
      reasons.push(`entity_type نامعتبر: ${String(r.entity_type)}`);
    }
    if (r.identity_type && !VALID_TYPES.has(r.identity_type)) {
      reasons.push(`identity_type نامعتبر: ${String(r.identity_type)}`);
    }
    if (reasons.length > 0) invalid.push({ index: i, reason: reasons.join('؛ ') });
    else valid.push(r);
  });
  return { valid, invalid };
}

/* ── Stage 3 helpers ─────────────────────────────────────────────────────── */

/** نشانگرِ synthetic — همان قاعدهٔ ماژولِ شواهد (تکرارِ آگاهانه؛ عملاً ثابت) */
const SYNTHETIC_MARKER = /synth/i;

export function findSyntheticMarkers(rows: readonly CrossTypeRow[]): string[] {
  const hits: string[] = [];
  rows.forEach((r, i) => {
    const fields = [r.company_id, r.entity_id, r.source_ref, r.display_value];
    if (fields.some((v) => typeof v === 'string' && SYNTHETIC_MARKER.test(v))) {
      hits.push(`row[${i}]`);
    }
  });
  return hits;
}

export function assertModeClassification(input: AssessmentInput): void {
  const { classification, assessmentMode, authorization } = input;
  const issues: string[] = [];

  if (assessmentMode === 'SYNTHETIC_FIXTURE') {
    if (classification !== 'SYNTHETIC') {
      issues.push('assessmentMode=SYNTHETIC_FIXTURE فقط با dataClassification=SYNTHETIC مجاز است؛ برچسبِ مصنوعی‌سازی قابلِ دورزدن نیست.');
    }
    if (authorization) {
      issues.push('گزارشِ synthetic نباید authorization داشته باشد — ادعای مجوزِ ساختگی ممنوع است.');
    }
  } else {
    // ISOLATED_RESTORED | AUTHORIZED_REPLICA — هر دو دادهٔ واقعیِ سازمان‌اند
    if (classification !== 'REAL_AUTHORIZED_REPLICA') {
      issues.push(`assessmentMode=${assessmentMode} فقط با dataClassification=REAL_AUTHORIZED_REPLICA مجاز است.`);
    }
    if (!authorization) {
      issues.push(`assessmentMode=${assessmentMode} بدونِ authorization ممکن نیست (readOnly/isolation/noSharedWritePath/confidentiality attestation).`);
    }
    const markers = findSyntheticMarkers(input.rows);
    if (markers.length > 0) {
      issues.push(
        `REAL هرگز از synthetic ساخته نمی‌شود — ${markers.length} ردیف نشانگرِ "synth" دارند (${markers.slice(0, 5).join(', ')}…). طبقه‌بندی را اصلاح کنید یا منبع را بازبینی کنید.`,
      );
    }
  }
  if (issues.length > 0) throw new AssessmentPipelineError('GATE', issues);
}

/* ── Stage 5 helpers ─────────────────────────────────────────────────────── */

export function crossCheckExportCounts(
  rowsIn: number,
  exportedCounts: Readonly<Record<string, number>> | undefined,
  recordCounts?: Readonly<Record<string, number>>,
  recordCountsScope?: boolean,
): VerificationCheck[] {
  const checks: VerificationCheck[] = [];
  const requiresTenantScoped = rowsIn >= 0 && recordCounts !== undefined;
  if (recordCountsScope !== true && requiresTenantScoped) {
    checks.push({
      id: 'record-counts-not-tenant-scoped',
      ok: false,
      detail: 'recordCounts زیرِ زمینهٔ tenant سنجیده نشده — تطبیقِ export ⊆ source نامعتبر است (از کورِ خواندن دست بردارید).',
    });
    return checks;
  }
  if (!exportedCounts) {
    checks.push({
      id: 'export-counts-present',
      ok: false,
      detail: 'exportedCounts ثبت نشده — کامل‌بودنِ export قابلِ وارسی نیست.',
    });
    return checks;
  }
  const sum = Object.values(exportedCounts).reduce((a, b) => a + b, 0);
  const approxRows = rowsIn; // هر منشأ حداقل یک ردیف می‌سازد (product ممکن است چند ردیف بسازد)
  checks.push({
    id: 'export-counts-present',
    ok: true,
    detail: `export از ${Object.keys(exportedCounts).length} منشأ ثبت شد`,
  });
  checks.push({
    id: 'exported-sources-vs-rows',
    ok: approxRows >= Object.values(exportedCounts).filter((n) => n > 0).length,
    detail: `rows_in=${approxRows} در برابرِ منشأهایِ ناصفر=${Object.values(exportedCounts).filter((n) => n > 0).length} (هر منشأ ≥۱ ردیف)`,
  });
  checks.push({
    id: 'exported-sum-consistent',
    ok: sum >= 0 && Number.isFinite(sum),
    detail: `مجموعِ شمارش‌ها=${sum}`,
  });
  if (recordCounts) {
    for (const [table, exported] of Object.entries(exportedCounts)) {
      const source = recordCounts[table];
      if (source === undefined) continue; // جدولِ شمارش‌نشده
      checks.push({
        id: `export-within-source:${table}`,
        ok: exported <= source,
        detail: `export=${exported} در برابرِ source=${source} ${exported <= source ? '(بازهٔ مجاز)' : ' — «ردیفِ خیالی»: export از منبع بیشتر است!'}`,
      });
    }
  }
  return checks;
}

/** ساختِ مجدد با همان ورودی و همان now — پایداریِ fingerprint را اثبات می‌کند */
function reproducibilityCheck(
  rows: readonly CrossTypeRow[],
  input: AssessmentInput,
  fingerprint: string,
  inputFingerprint: string,
): VerificationCheck {
  const rebuilt = buildShadowEvidence(rows, {
    dataClassification: input.classification,
    source: { ...input.source, assessmentMode: input.assessmentMode },
    authorization: input.authorization,
    now: input.now,
  });
  const ok =
    rebuilt.reproducibility.evidence_fingerprint === fingerprint &&
    rebuilt.reproducibility.input_fingerprint === inputFingerprint;
  return {
    id: 'fingerprint-reproducible',
    ok,
    detail: ok
      ? 'ساختِ مجدد با ورودیِ یکسان ⇒ fingerprintهای یکسان'
      : 'ساختِ مجدد fingerprint متفاوتی داد — غیرقطعیّت شاخنگانی است؛ گزارش را نپذیرید',
  };
}

/* ── خط‌لوله ─────────────────────────────────────────────────────────────── */

export function runAssessmentPipeline(input: AssessmentInput): AssessmentResult {
  // Stage 1 — INGEST
  if (!Array.isArray(input.rows)) {
    throw new AssessmentPipelineError('INGEST', ['rows باید یک آرایه باشد']);
  }
  // Stage 2 — VALIDATE INPUT
  const { valid, invalid } = validateAssessmentRows(input.rows);
  // Stage 3 — GATE (روی کلِ ورودی، پیش از هر محاسبه‌ای)
  assertModeClassification(input);
  // Stage 4 — EXECUTE
  let report: ShadowEvidenceReport;
  try {
    report = buildShadowEvidence(valid, {
      dataClassification: input.classification,
      source: { ...input.source, assessmentMode: input.assessmentMode },
      authorization: input.authorization,
      now: input.now,
    });
  } catch (err) {
    if (err instanceof AssessmentPipelineError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new AssessmentPipelineError('EXECUTE', [msg]);
  }

  // builder فقط ردیف‌هایِ معتبر را می‌بیند — rows_in/rows_invalid را با واقعیتِ ورودی هماهنگ می‌کنیم
  // (وگرنه گزارش ادعا می‌کرد «همهٔ ردیف‌ها معتبر بودند» در حالی که ردیف کنار گذاشته شده — نقضِ کامل‌بودنِ machine-verifiable)
  if (invalid.length > 0) {
    report = {
      ...report,
      completeness: {
        ...report.completeness,
        rows_in: report.completeness.rows_in + invalid.length,
        rows_invalid: invalid.length,
        warnings_fa: [
          ...report.completeness.warnings_fa,
          `${invalid.length} ردیف به‌دلیلِ خطای کنترلی/ساختاری کنار گذاشته شد (data_quality) — در fingerprintها محاسبه نمی‌شوند.`,
        ],
      },
    };
  }

  // Stage 5 — VERIFY REPORT
  const problems = validateShadowEvidence(report);
  const checks: VerificationCheck[] = [
    ...invalid.slice(0, 10).map(
      (x): VerificationCheck => ({
        id: 'input-row-dropped',
        ok: true,
        detail: `ردیف ${x.index}: ${x.reason} — کنار گذاشته شد`,
      }),
    ),
    ...(invalid.length > 0
      ? []
      : [{ id: 'input-all-valid', ok: true, detail: 'همهٔ ردیف‌ها معتبر بودند' }]),
    ...(invalid.length > 0
      ? [{ id: 'input-rows-dropped', ok: true, detail: `${invalid.length} ردیف نامعتبر کنار گذاشته شد (data_quality)` }]
      : []),
    ...crossCheckExportCounts(report.completeness.rows_in, input.exportedCounts, input.recordCounts, input.recordCountsTenantScoped),
    {
      id: 'report-validator',
      ok: problems.length === 0,
      detail: problems.length === 0 ? 'validateShadowEvidence: OK' : problems.join(' | '),
    },
    reproducibilityCheck(valid, input, report.reproducibility.evidence_fingerprint, report.reproducibility.input_fingerprint),
  ];
  const ok = checks.every((c) => c.ok);

  const verification: AssessmentVerification = {
    schema: 'c13-verify.1',
    ok,
    assessment_mode: input.assessmentMode,
    data_classification: input.classification,
    input_fingerprint: report.reproducibility.input_fingerprint,
    evidence_fingerprint: report.reproducibility.evidence_fingerprint,
    reproducible: checks.find((c) => c.id === 'fingerprint-reproducible')?.ok ?? false,
    exported_counts: input.exportedCounts ?? null,
    rows_in: report.completeness.rows_in,
    checks,
  };

  if (!ok) {
    // Stage 5 شکست — گزارش ساخته شد ولی «وارسی» نشد ⇒ هرگز emit نمی‌شود
    throw new AssessmentPipelineError(
      'VERIFY_REPORT',
      checks.filter((c) => !c.ok).map((c) => `${c.id}: ${c.detail}`),
    );
  }

  // Stage 6 — EMIT (همین‌جا: بازگرداندنِ گزارشِ وارسی‌شده)
  return { report, verification };
}

/** اثرِ انگشتِ مستقلِ محتوا برای کلِ نتیجهٔ خط‌لوله (شاملِ verification) */
export function pipelineResultFingerprint(result: AssessmentResult): string {
  return sha256Hex(
    canonicalJson({
      evidence_fingerprint: result.report.reproducibility.evidence_fingerprint,
      verification_ok: result.verification.ok,
      schema: result.verification.schema,
    }),
  );
}
