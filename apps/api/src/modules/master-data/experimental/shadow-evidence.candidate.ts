/**
 * TASK-PM-02-C13B — سازنده و اعتبارسنجِ «سندِ شواهدِ ارزیابیِ سایه» (Shadow Evidence) برای Track B.
 *
 * ⚠️ **آزمایشی و غیرفعال.** هیچ مسیرِ تولیدی این ماژول را import نمی‌کند.
 * هیچ اتصالِ پایگاه‌داده، پرس‌وجو، نوشتن یا مهاجرتی در این فایل وجود ندارد؛
 * این ماژول فقط از ردیف‌هایِ ازپیش‌خوانده‌شده (readonly export / fixture مصنوعی) استفاده می‌کند.
 *
 * ── قواعدی که این ماژول اِعمال می‌کند ─────────────────────────────────────────
 * 1. گزارشِ دادهٔ واقعی بدونِ `authorization` کامل **ساخته نمی‌شود** — پرتابِ
 *    `ShadowEvidenceAuthorizationError` پیش از هر محاسبه (درسِ C12/C13).
 * 2. در حالتِ `REAL_AUTHORIZED_REPLICA`: پوشانش اجباری است (`redactValues: true`)
 *    و `includeDisplayValues` پرتاب می‌کند.
 * 3. صفرِ یافته با دادهٔ ناقص خلط نمی‌شود: `ZERO_INPUT` / `INCOMPLETE_DATA` /
 *    `ZERO_FINDINGS_COMPLETE` / `FINDINGS_PRESENT` چهار حالتِ متمایزِ `verdict`.
 * 4. قطعیّت: همان ردیف‌ها + همان پارامترها (به‌جز `now`) ⇒ همان `evidence_fingerprint`.
 *    ترتیبِ ردیف‌ها در اثرِ انگشت اثر ندارد (موتور خود قطعی است؛ اینجا هم قفل می‌شود).
 * 5. synthetic هرگز با real خلط نمی‌شود: `data_classification` و
 *    `contains_organizational_data` همیشه صریح‌اند؛ نشانگرهایِ synthetic در حالتِ real
 *    به‌عنوان هشدارِ «provenanceِ ناسازگار» ثبت می‌شوند.
 */
import { createHash } from 'node:crypto';
import {
  IDENTITY_TYPES,
  assessCrossType,
  simulateFuturePolicies,
  analyzeScanResolution,
  CROSS_TYPE_CONTRACT_VERSION,
  UNDERLYING_COMPARISON_VERSION,
  UNDERLYING_NORMALIZATION_VERSION,
  type CrossTypeRow,
  type CrossTypeDecision,
} from './cross-type-collision.candidate';

export const SHADOW_EVIDENCE_SCHEMA_VERSION = 'c13b.1';
export const SHADOW_EVIDENCE_TASK = 'TASK-PM-02-C13B';
export const EXPECTED_IDENTITY_TYPES: readonly string[] = [...IDENTITY_TYPES];

export type ShadowDataClassification = 'SYNTHETIC' | 'REAL_AUTHORIZED_REPLICA';

export interface ShadowSourceSpec {
  /** برچسبِ ماتِ ردیف (هرگز اتصال‌رشته/رمزِ عبور/میزبانِ خام؛ فقط یک نامِ نمایشیِ مصوب) */
  readonly identity: string;
  readonly snapshotTsIso: string;
  readonly engineVersion?: string;
  readonly schemaMigration?: string;
  readonly migrationSource?: string;
  /** شمارشِ رکوردِ هر جدول روی خودِ replica پیش از export — کامل‌بودنِ export را می‌سنجد */
  readonly recordCounts?: Readonly<Record<string, number>>;
  readonly freshnessSeconds?: number;
  readonly provenance?: string;
  readonly ownerRef?: string;
}

export interface ShadowAuthorization {
  readonly ticketRef: string;
  readonly authorizedBy: string;
  readonly readOnlyAttestation: string;
  readonly isolationAttestation: string;
  readonly noSharedWritePathAttestation: string;
  readonly confidentialityAttestation: string;
}

const AUTHORIZATION_FIELDS: readonly (keyof ShadowAuthorization)[] = [
  'ticketRef',
  'authorizedBy',
  'readOnlyAttestation',
  'isolationAttestation',
  'noSharedWritePathAttestation',
  'confidentialityAttestation',
];

export interface ShadowEvidenceParams {
  readonly dataClassification: ShadowDataClassification;
  readonly assessmentId?: string;
  readonly source: ShadowSourceSpec;
  readonly authorization?: ShadowAuthorization;
  readonly executionDurationMs?: number;
  /** فقط برای synthetic؛ در حالتِ real پرتاب می‌کند */
  readonly includeDisplayValues?: boolean;
  readonly now?: () => Date;
}

export class ShadowEvidenceAuthorizationError extends Error {
  readonly missing: readonly string[];
  constructor(missing: readonly string[]) {
    super(
      `Shadow evidence refused to build a REAL_AUTHORIZED_REPLICA report: ` +
        `missing/empty authorization fields: ${missing.join(', ')}. ` +
        `No report was produced; no query was executed.`,
    );
    this.name = 'ShadowEvidenceAuthorizationError';
    this.missing = missing;
  }
}

export type ShadowOutcome =
  | 'ZERO_INPUT'
  | 'INCOMPLETE_DATA'
  | 'ZERO_FINDINGS_COMPLETE'
  | 'FINDINGS_PRESENT';

export interface ShadowEvidenceReport {
  readonly schema_version: string;
  readonly task: string;
  readonly evidence_kind: 'shadow_assessment';
  readonly data_classification: ShadowDataClassification;
  readonly synthetic: boolean;
  readonly contains_organizational_data: boolean;
  readonly redaction_enforced: boolean;
  readonly assessment_id: string;
  readonly generated_at_iso: string;
  /** شناسهٔ ارزیابی مشتق از اثرِ انگشتِ ورودی است؛ دو اجرای یکسان ⇒ یک شناسه */
  readonly source: {
    readonly kind: 'synthetic' | 'replica';
    readonly identity: string;
    readonly snapshot_ts_iso: string;
    readonly engine_version: string | null;
    readonly schema_migration: string | null;
    readonly migration_source: string | null;
    readonly record_counts: Readonly<Record<string, number>> | null;
    readonly freshness_seconds: number | null;
    readonly provenance: string | null;
    readonly owner_ref: string | null;
  };
  /** فقط در حالتِ real پر می‌شود؛ در synthetic مقدارِ null دارد (ادعای مجوز ساختگی نیست) */
  readonly authorization: Readonly<Record<keyof ShadowAuthorization, string>> | null;
  readonly completeness: {
    readonly rows_in: number;
    readonly rows_valid: number;
    readonly rows_invalid: number;
    readonly duplicates_suppressed: number;
    readonly by_type: Readonly<Record<string, number>>;
    readonly expected_identity_types: readonly string[];
    readonly present_identity_types: readonly string[];
    readonly missing_identity_types: readonly string[];
    readonly complete: boolean;
    readonly warnings_fa: readonly string[];
  };
  readonly observed: {
    readonly contract_version: string;
    readonly findings_total: number;
    readonly by_decision: Readonly<Record<string, number>>;
    readonly by_rule: Readonly<Record<string, number>>;
    readonly by_space: Readonly<Record<string, number>>;
    readonly by_type_pair: Readonly<Record<string, number>>;
    readonly by_company: Readonly<Record<string, number>>;
    readonly cross_company_findings: number;
    readonly data_quality_findings: number;
    readonly content_fingerprint: string;
  };
  /** شبیه‌سازیِ سیاست‌هایِ آینده — **فرضی**؛ هیچ‌چیز اعمال نمی‌شود و نیازمندِ تصمیمِ مالک است */
  readonly simulated_policies: {
    readonly note_fa: string;
    readonly would_block_on_today_data: boolean;
    readonly policies: readonly {
      readonly policy_id: string;
      readonly decision_ref: string;
      readonly findings: number;
      readonly would_violate: boolean;
    }[];
    readonly findings_total: number;
    readonly content_fingerprint: string;
  };
  readonly scan_resolution_shadow: {
    readonly shadow_findings: number;
    readonly shadowed_parties: number;
    readonly content_fingerprint: string | null;
  };
  readonly verdict: {
    readonly outcome: ShadowOutcome;
    readonly zero_findings_is_not_proof_of_absence: boolean;
    readonly real_data_status: 'ASSESSED' | 'UNVERIFIED — SYNTHETIC ONLY';
    readonly explanation_fa: string;
  };
  readonly execution: {
    readonly duration_ms: number | null;
    readonly runtime: { readonly node: string; readonly platform: string };
  };
  readonly reproducibility: {
    readonly contract_versions: {
      readonly cross_type: string;
      readonly underlying_comparison: string;
      readonly underlying_normalization: string;
    };
    readonly input_fingerprint: string;
    readonly evidence_fingerprint: string;
  };
}

/* ─────────────────────────────────────────────────────────────────────────
 * کمک‌ابزارهایِ قطعیت
 * ───────────────────────────────────────────────────────────────────────── */

/** JSON canonical با کلیدهایِ مرتب‌شده — پایه‌ای برای اثرِ انگشت */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

export function shortHash(input: string, len = 12): string {
  return sha256Hex(input).slice(0, len);
}

function hashRef(ref: string): string {
  return `ref:${shortHash(ref, 12)}`;
}

/* ─────────────────────────────────────────────────────────────────────────
 * هشدارهایِ provenance (سازگاریِ منبع)
 * ───────────────────────────────────────────────────────────────────────── */

const SYNTHETIC_MARKER = /synth/i;

export function collectProvenanceWarnings(
  rows: readonly CrossTypeRow[],
  classification: ShadowDataClassification,
): string[] {
  const warnings: string[] = [];

  // source_refِ خالی
  const emptyRef = rows.filter((r) => !r.source_ref || r.source_ref.trim().length === 0).length;
  if (emptyRef > 0) {
    warnings.push(`${emptyRef} ردیف بدونِ source_ref است؛ ردیابیِ یافته‌ها به منبع ممکن نیست.`);
  }

  // یک source_ref به چند موجودیتِ متفاوت
  const refToEntities = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.source_ref) continue;
    const bucket = `${r.entity_type}:${r.entity_id}`;
    const set = refToEntities.get(r.source_ref);
    if (set) set.add(bucket);
    else refToEntities.set(r.source_ref, new Set([bucket]));
  }
  const reused = [...refToEntities].filter(([, s]) => s.size > 1);
  if (reused.length > 0) {
    const example = hashRef(reused[0][0]);
    warnings.push(
      `source_refِ «${example}» (هش‌شده) به ${reused.length} موجودیتِ ناهمسان اشاره می‌کند؛ provenance ناسازگار است.`,
    );
  }

  // نشانگرهایِ synthetic در حالتِ real
  if (classification === 'REAL_AUTHORIZED_REPLICA') {
    const suspicious = rows.filter((r) =>
      [r.company_id, r.entity_id, r.source_ref, r.display_value].some(
        (v) => typeof v === 'string' && SYNTHETIC_MARKER.test(v),
      ),
    ).length;
    if (suspicious > 0) {
      warnings.push(
        `${suspicious} ردیف نشانگرِ "synth" در شناسه/شرکت/مقدار دارد؛ طبقه‌بندیِ REAL_AUTHORIZED_REPLICA با این ردیف‌ها ناسازگار است. منبع را بازبینی کنید.`,
      );
    }
  }
  return warnings;
}

/* ─────────────────────────────────────────────────────────────────────────
 * شمارش‌هایِ completeness
 * ───────────────────────────────────────────────────────────────────────── */

export interface CompletenessResult {
  readonly rows_in: number;
  readonly rows_valid: number;
  readonly rows_invalid: number;
  readonly duplicates_suppressed: number;
  readonly by_type: Readonly<Record<string, number>>;
  readonly present_identity_types: readonly string[];
  readonly missing_identity_types: readonly string[];
  readonly complete: boolean;
  readonly warnings_fa: readonly string[];
}

export function assessCompleteness(
  rows: readonly CrossTypeRow[],
  rowsValid: number,
  rowsInvalid: number,
  duplicatesSuppressed: number,
  extraWarnings: readonly string[],
): CompletenessResult {
  const byType: Record<string, number> = {};
  for (const r of rows) byType[r.identity_type] = (byType[r.identity_type] ?? 0) + 1;
  const present = EXPECTED_IDENTITY_TYPES.filter((t) => (byType[t] ?? 0) > 0);
  const missing = EXPECTED_IDENTITY_TYPES.filter((t) => (byType[t] ?? 0) === 0);

  const warnings: string[] = [];
  if (rows.length === 0) {
    warnings.push(
      'هیچ ردیفی دریافت نشد؛ این با «دادهٔ کامل و بدونِ یافته» متفاوت است — تا زمانی که export تأیید نشده، شواهد نامعتبر است.',
    );
  }
  for (const t of missing) {
    warnings.push(
      `نوعِ «${t}» در snapshot غایب است — صفرِ یافته برای این نوع **مشاهده‌نشده** است، نه صفرِ واقعی.`,
    );
  }
  if (rowsInvalid > 0) {
    warnings.push(`${rowsInvalid} ردیف به‌دلیلِ خطای کنترلی/ساختاری کنار گذاشته شد (data_quality).`);
  }
  if (duplicatesSuppressed > 0) {
    warnings.push(`${duplicatesSuppressed} ردیفِ تکراریِ عیناً یکسان سرکوب شد.`);
  }
  warnings.push(...extraWarnings);

  return {
    rows_in: rows.length,
    rows_valid: rowsValid,
    rows_invalid: rowsInvalid,
    duplicates_suppressed: duplicatesSuppressed,
    by_type: byType,
    present_identity_types: present,
    missing_identity_types: missing,
    complete: rowsValid > 0 && missing.length === 0,
    warnings_fa: warnings,
  };
}

function byDecisionCount(decisions: readonly CrossTypeDecision[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of decisions) out[d] = (out[d] ?? 0) + 1;
  return out;
}

function byKey(values: readonly (string | null)[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) {
    const k = v ?? '(none)';
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/* ─────────────────────────────────────────────────────────────────────────
 * ساختِ گزارشِ شواهد
 * ───────────────────────────────────────────────────────────────────────── */

function isNonEmpty(s: string | undefined): s is string {
  return typeof s === 'string' && s.trim().length > 0;
}

function requireRealAuthorization(
  classification: ShadowDataClassification,
  authorization: ShadowAuthorization | undefined,
): ShadowAuthorization | null {
  if (classification !== 'REAL_AUTHORIZED_REPLICA') return null;
  const missing = AUTHORIZATION_FIELDS.filter((f) => !isNonEmpty(authorization?.[f]));
  if (!authorization || missing.length > 0) {
    throw new ShadowEvidenceAuthorizationError(missing.length > 0 ? missing : [...AUTHORIZATION_FIELDS]);
  }
  return authorization;
}

export function buildShadowEvidence(
  rows: readonly CrossTypeRow[],
  params: ShadowEvidenceParams,
): ShadowEvidenceReport {
  const now = params.now ?? (() => new Date());
  const classification = params.dataClassification;
  if (classification !== 'SYNTHETIC' && classification !== 'REAL_AUTHORIZED_REPLICA') {
    throw new ShadowEvidenceAuthorizationError([`dataClassification ناشناخته: ${String(classification)}`]);
  }
  if (params.includeDisplayValues === true && classification === 'REAL_AUTHORIZED_REPLICA') {
    throw new ShadowEvidenceAuthorizationError(['includeDisplayValues برای REAL_AUTHORIZED_REPLICA مجاز نیست']);
  }
  const authorization = requireRealAuthorization(classification, params.authorization);
  const isReal = classification === 'REAL_AUTHORIZED_REPLICA';
  // در حالتِ real پوشانش اجباری است؛ هیچ ترکیبی آن را خاموش نمی‌کند.
  const redactValues = true;

  // ── خط لولهٔ محاسبه (همه محلی و قطعی) ────────────────────────────────────
  const assessment = assessCrossType(rows, {
    now,
    redactValues,
    includeNotComparable: true,
    includeAllowed: true,
  });
  const simulation = simulateFuturePolicies(rows, { now, redactValues: true });
  let scanFindings = 0;
  let shadowedParties = 0;
  let scanFingerprint: string | null = null;
  try {
    const scan = analyzeScanResolution(rows, { now, redactValues: true });
    scanFindings = scan.length;
    shadowedParties = scan.reduce((acc, f) => acc + f.shadowed.length, 0);
    scanFingerprint = sha256Hex(canonicalJson(scan.map((f) => f.shadow_id)));
  } catch {
    scanFindings = 0;
    shadowedParties = 0;
    scanFingerprint = null;
  }

  // ── completeness + provenance ─────────────────────────────────────────────
  const provenanceWarnings = collectProvenanceWarnings(rows, classification);
  const extra: string[] = [...provenanceWarnings];
  if (isReal) {
    if (params.source.freshnessSeconds === undefined) {
      extra.push('تازگیِ snapshot (freshness_seconds) اثبات نشده است.');
    }
    if (!params.source.recordCounts) {
      extra.push('شمارشِ رکوردِ مخزن روی replica ثبت نشده؛ کامل‌بودنِ export تأییدناپذیر است.');
    }
    if (!isNonEmpty(params.source.engineVersion)) {
      extra.push('نسخهٔ موتورِ پایگاه‌دادهٔ replica ثبت نشده است.');
    }
    if (!isNonEmpty(params.source.schemaMigration)) {
      extra.push('نسخهٔ مهاجرتِ اسکیما روی replica ثبت نشده است.');
    }
  }
  if (!isNonEmpty(params.source.snapshotTsIso) || Number.isNaN(Date.parse(params.source.snapshotTsIso))) {
    extra.push('snapshot_ts_iso نامعتبر یا خالی است؛ زمانِ snapshot قابلِ اتکا نیست.');
  }

  const completeness = assessCompleteness(
    rows,
    assessment.summary.rows_valid,
    assessment.summary.rows_invalid,
    assessment.summary.duplicates_suppressed,
    extra,
  );

  // ── verdict ───────────────────────────────────────────────────────────────
  let outcome: ShadowOutcome;
  if (assessment.summary.rows_valid === 0) outcome = 'ZERO_INPUT';
  else if (completeness.missing_identity_types.length > 0) outcome = 'INCOMPLETE_DATA';
  else if (assessment.summary.findings_total === 0) outcome = 'ZERO_FINDINGS_COMPLETE';
  else outcome = 'FINDINGS_PRESENT';

  const EXPLANATIONS: Record<ShadowOutcome, string> = {
    ZERO_INPUT:
      'هیچ داده‌ای برای تحلیل دریافت نشد یا همهٔ ردیف‌ها نامعتبر بودند؛ این حالت هیچ ادعایی دربارهٔ سلامتِ داده نمی‌کند.',
    INCOMPLETE_DATA:
      'بخشی از نوع‌هایِ هویت در snapshot غایب است؛ یافته‌هایِ آن نوع‌ها مشاهده‌نشده‌اند و صفرِ آن‌ها به‌معنایِ نبودِ تعارض نیست.',
    ZERO_FINDINGS_COMPLETE:
      'همهٔ نوع‌هایِ هویت حاضر بودند و هیچ یافته‌ای تولید نشد. این نتیجه فقط برای همین snapshot صادق است و مجوزِ تغییرِ هیچ قیدی نیست.',
    FINDINGS_PRESENT:
      'یافته‌هایی تولید شد؛ هرکدام فقط بر پایهٔ همین snapshot است و هیچ اقدامِ خودکاری روی داده اعمال نمی‌شود.',
  };

  const bySpace = byKey(assessment.findings.map((f) => f.space));
  const byDecision = byDecisionCount(assessment.findings.map((f) => f.decision));
  // اثرِ انگشتِ ورودی باید نسبت به ترتیبِ ردیف‌ها ثابت باشد: کلِ ردیف‌ها مرتب می‌شوند.
  const sortedRowsForFingerprint = [...rows].sort((a, b) => {
    const ka = canonicalJson(a);
    const kb = canonicalJson(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  const inputFingerprint = sha256Hex(canonicalJson(sortedRowsForFingerprint));
  const assessmentId = params.assessmentId ?? `C13B-${inputFingerprint.slice(0, 8)}`;

  const reportBase = {
    schema_version: SHADOW_EVIDENCE_SCHEMA_VERSION,
    task: SHADOW_EVIDENCE_TASK,
    evidence_kind: 'shadow_assessment' as const,
    data_classification: classification,
    synthetic: !isReal,
    contains_organizational_data: isReal,
    redaction_enforced: redactValues,
    assessment_id: assessmentId,
    generated_at_iso: now().toISOString(),
    source: {
      kind: isReal ? ('replica' as const) : ('synthetic' as const),
      identity: params.source.identity,
      snapshot_ts_iso: params.source.snapshotTsIso,
      engine_version: params.source.engineVersion ?? null,
      schema_migration: params.source.schemaMigration ?? null,
      migration_source: params.source.migrationSource ?? null,
      record_counts: params.source.recordCounts ?? null,
      freshness_seconds: params.source.freshnessSeconds ?? null,
      provenance: params.source.provenance ?? null,
      owner_ref: params.source.ownerRef ?? null,
    },
    authorization: authorization
      ? {
          ticketRef: authorization.ticketRef,
          authorizedBy: authorization.authorizedBy,
          readOnlyAttestation: authorization.readOnlyAttestation,
          isolationAttestation: authorization.isolationAttestation,
          noSharedWritePathAttestation: authorization.noSharedWritePathAttestation,
          confidentialityAttestation: authorization.confidentialityAttestation,
        }
      : null,
    completeness: {
      rows_in: completeness.rows_in,
      rows_valid: completeness.rows_valid,
      rows_invalid: completeness.rows_invalid,
      duplicates_suppressed: completeness.duplicates_suppressed,
      by_type: completeness.by_type,
      expected_identity_types: EXPECTED_IDENTITY_TYPES,
      present_identity_types: completeness.present_identity_types,
      missing_identity_types: completeness.missing_identity_types,
      complete: completeness.complete,
      warnings_fa: completeness.warnings_fa,
    },
    observed: {
      contract_version: assessment.contract_version,
      findings_total: assessment.summary.findings_total,
      by_decision: byDecision,
      by_rule: assessment.summary.by_rule,
      by_space: bySpace,
      by_type_pair: assessment.summary.by_type_pair,
      by_company: assessment.summary.by_company,
      cross_company_findings: assessment.summary.cross_company_findings,
      data_quality_findings: assessment.data_quality.length,
      content_fingerprint: assessment.content_fingerprint,
    },
    simulated_policies: {
      note_fa:
        'این بخش **فرضی** است: هیچ قیدی اعمال نمی‌شود و هر «نقض» نیازمندِ تصمیمِ صریحِ مالک (D-C13X-1..3) است. «would_violate» به‌معنایِ خطای سیستم نیست.',
      would_block_on_today_data: simulation.findings.length > 0,
      policies: simulation.policies.map((p) => ({
        policy_id: p.policy_id,
        decision_ref: p.decision_ref,
        findings: p.findings,
        would_violate: p.would_violate,
      })),
      findings_total: simulation.findings.length,
      content_fingerprint: simulation.content_fingerprint,
    },
    scan_resolution_shadow: {
      shadow_findings: scanFindings,
      shadowed_parties: shadowedParties,
      content_fingerprint: scanFingerprint,
    },
    verdict: {
      outcome,
      zero_findings_is_not_proof_of_absence: true,
      real_data_status: isReal ? ('ASSESSED' as const) : ('UNVERIFIED — SYNTHETIC ONLY' as const),
      explanation_fa: EXPLANATIONS[outcome],
    },
    execution: {
      duration_ms: params.executionDurationMs ?? null,
      runtime: { node: process.version, platform: process.platform },
    },
    reproducibility: {
      contract_versions: {
        cross_type: CROSS_TYPE_CONTRACT_VERSION,
        underlying_comparison: UNDERLYING_COMPARISON_VERSION,
        underlying_normalization: UNDERLYING_NORMALIZATION_VERSION,
      },
      input_fingerprint: inputFingerprint,
      evidence_fingerprint: '', // در ادامه پر می‌شود
    },
  };

  const evidenceFingerprint = sha256Hex(
    canonicalJson({ ...reportBase, generated_at_iso: null, execution: null, reproducibility: { ...reportBase.reproducibility, evidence_fingerprint: '' } }),
  );

  return {
    ...reportBase,
    reproducibility: { ...reportBase.reproducibility, evidence_fingerprint: evidenceFingerprint },
  };
}

/* ─────────────────────────────────────────────────────────────────────────
 * اعتبارسنجِ گزارشِ شواهد — پیش از «پذیرفتنِ» یک گزارش به‌عنوان شاهد اجرا می‌شود
 * ───────────────────────────────────────────────────────────────────────── */

export const EVIDENCE_REQUIRED_TOP_LEVEL: readonly string[] = [
  'schema_version',
  'task',
  'evidence_kind',
  'data_classification',
  'synthetic',
  'contains_organizational_data',
  'assessment_id',
  'generated_at_iso',
  'source',
  'completeness',
  'observed',
  'simulated_policies',
  'scan_resolution_shadow',
  'verdict',
  'execution',
  'reproducibility',
];

/**
 * قوانینِ ثباتِ گزارش. خروجی: فهرستِ تخلف‌ها (خالی = معتبر).
 * عمداً سخت‌گیرانه است: یک گزارشِ متناقض هرگز «شاهد» تلقی نمی‌شود.
 */
export function validateShadowEvidence(report: ShadowEvidenceReport): string[] {
  const problems: string[] = [];
  const need = (cond: boolean, msg: string) => {
    if (!cond) problems.push(msg);
  };

  for (const key of EVIDENCE_REQUIRED_TOP_LEVEL) {
    need(
      Object.prototype.hasOwnProperty.call(report, key),
      `کلیدِ «${key}» در گزارش غایب است`,
    );
  }
  if (problems.length > 0) return problems; // ساختار شکسته؛ ادامه بی‌معنی است

  need(report.schema_version === SHADOW_EVIDENCE_SCHEMA_VERSION, `schema_version باید «${SHADOW_EVIDENCE_SCHEMA_VERSION}» باشد`);
  need(report.task === SHADOW_EVIDENCE_TASK, `task باید «${SHADOW_EVIDENCE_TASK}» باشد`);
  need(report.evidence_kind === 'shadow_assessment', 'evidence_kind باید shadow_assessment باشد');

  const isReal = report.data_classification === 'REAL_AUTHORIZED_REPLICA';
  need(
    report.data_classification === 'SYNTHETIC' || isReal,
    'data_classification باید SYNTHETIC یا REAL_AUTHORIZED_REPLICA باشد',
  );
  need(report.synthetic === !isReal, 'synthetic باید دقیقاً معکوسِ طبقه‌بندیِ real باشد');
  need(report.contains_organizational_data === isReal, 'contains_organizational_data با طبقه‌بندی همخوانی ندارد');
  need(report.redaction_enforced === true, 'redaction_enforced باید true باشد (هیچ ترکیبی آن را خاموش نمی‌کند)');

  // real ⇒ مجوزِ کامل الزامی است؛ synthetic ⇒ مجوز نباید جعل شود
  if (isReal) {
    need(report.authorization !== null, 'گزارشِ real بدونِ authorization پذیرفته نمی‌شود');
    for (const [k, v] of Object.entries(report.authorization ?? {})) {
      need(typeof v === 'string' && v.trim().length > 0, `authorization.${k} خالی است`);
    }
  } else {
    need(report.authorization === null, 'گزارشِ synthetic نباید authorization داشته باشد (ادعای مجوزِ ساختگی ممنوع)');
  }

  // completeness و استثناهایش
  const c = report.completeness;
  need(c.present_identity_types.length + c.missing_identity_types.length === c.expected_identity_types.length,
    'present + missing باید همهٔ expected_identity_types را پوشش دهند');
  need(c.rows_in === c.rows_valid + c.rows_invalid || c.rows_invalid <= c.rows_in,
    'شمارشِ ردیف‌ها ناسازگار است');
  need(c.complete === (c.rows_valid > 0 && c.missing_identity_types.length === 0),
    'completeness.complete با rows_valid/missing همخوانی ندارد');

  // verdict — اصلِ مرکزی: صفرِ یافته با دادهٔ ناقص خلط نشود
  const v = report.verdict;
  need(v.zero_findings_is_not_proof_of_absence === true, 'zero_findings_is_not_proof_of_absence باید true باشد');
  switch (v.outcome) {
    case 'ZERO_INPUT':
      need(c.rows_valid === 0, 'ZERO_INPUT یعنی rows_valid == 0');
      break;
    case 'INCOMPLETE_DATA':
      need(c.missing_identity_types.length > 0, 'INCOMPLETE_DATA یعنی دست‌کم یک نوعِ هویتی غایب است');
      need(c.complete === false, 'INCOMPLETE_DATA باید complete == false داشته باشد');
      break;
    case 'ZERO_FINDINGS_COMPLETE':
      need(c.complete === true && c.rows_valid > 0, 'ZERO_FINDINGS_COMPLETE فقط با دادهٔ کامل مجاز است');
      need(report.observed.findings_total === 0, 'ZERO_FINDINGS_COMPLETE یعنی findings_total == 0');
      break;
    case 'FINDINGS_PRESENT':
      need(report.observed.findings_total > 0, 'FINDINGS_PRESENT یعنی findings_total > 0');
      break;
    default:
      problems.push(`verdict.outcome ناشناخته: ${String(v.outcome)}`);
  }
  if (!c.complete && v.outcome === 'ZERO_FINDINGS_COMPLETE') {
    problems.push('دادهٔ ناقص با ZERO_FINDINGS_COMPLETE گزارش شده — نقضِ صریحِ قاعدهٔ صفر/ناقص');
  }

  // observed با completeness هم‌راستا
  need(typeof report.observed.findings_total === 'number' && report.observed.findings_total >= 0,
    'observed.findings_total نامعتبر است');
  need(Object.values(report.observed.by_decision).reduce((a, b) => a + b, 0) === report.observed.findings_total,
    'observed.by_decision با findings_total نمی‌خواند');

  // simulated_policies باید فرضی بماند
  need(
    report.simulated_policies.note_fa.includes('تصمیمِ') || report.simulated_policies.note_fa.includes('فرضی'),
    'simulated_policies.note_fa باید صریح کند که بخشِ شبیه‌سازی فرضی است و نیازمندِ تصمیمِ مالک',
  );
  for (const p of report.simulated_policies.policies) {
    need(typeof p.decision_ref === 'string' && p.decision_ref.length > 0, `سیاستِ ${p.policy_id} بدونِ decision_ref است`);
    need(p.would_violate === (p.findings > 0), `سیاستِ ${p.policy_id}: would_violate با findings همخوانی ندارد`);
  }

  // reproducibility
  need(/^[0-9a-f]{64}$/.test(report.reproducibility.evidence_fingerprint), 'evidence_fingerprint باید sha256 شش‌گانهٔ ۶۴ کاراکتری باشد');
  need(/^[0-9a-f]{64}$/.test(report.reproducibility.input_fingerprint), 'input_fingerprint باید sha256 باشد');
  need(report.reproducibility.contract_versions.cross_type === CROSS_TYPE_CONTRACT_VERSION,
    'contract_versions.cross_type با نسخهٔ قراردادِ ماژول همخوانی ندارد');

  if (isReal) {
    need(report.verdict.real_data_status === 'ASSESSED', "real: verdict.real_data_status باید 'ASSESSED' باشد");
  } else {
    need(report.verdict.real_data_status === 'UNVERIFIED — SYNTHETIC ONLY', 'synthetic: real_data_status باید UNVERIFIED — SYNTHETIC ONLY باشد');
  }

  return problems;
}
