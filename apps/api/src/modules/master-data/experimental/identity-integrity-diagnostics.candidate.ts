/**
 * TASK-PM-02-C14-IDENTITY-INTEGRITY-02 — تشخیصِ یکپارچهٔ یکپارچگیِ هویت (diagnostics).
 *
 * ⚠️ **آزمایشی و غیرفعال (inert).** هیچ مسیرِ تولیدی (runtime) این ماژول را import
 * نمی‌کند؛ تنها مصرف‌کنندگان: `test/identity-integrity-diagnostics.test.ts` و
 * اجراکننده‌های ارزیابیِ سایهٔ مجاز. **تشخیص ≠ اجرا**: هیچ خروجی‌ای به‌طورِ خودکار
 * اعمال نمی‌شود؛ هر یافته فقط وصیت‌نامه‌ای برای انسان است.
 *
 * چه می‌کند: یافته‌های یکپارچه روی ردیف‌های هویتِ خام می‌سازد با پوشش‌دادنِ
 *   product.code (SKU) · product_alias (+kind) · product_barcode (همهٔ kinds) ·
 *   product_packaging.barcode (legacy) · product_name/product_name_latin · variant_signature
 * با استفاده از **موتورِ C13** (`assessCrossType` — c13xt.1 / c13.1 / c11.1) و نه
 * بازپیاده‌سازیِ آن. سه گذر:
 *   ۱. موتورِ بین‌نوعی (companion) — برای همهٔ نوع‌های هویتِ شناخته‌شده؛
 *   ۲. گذرِ «انحرافِ مخزنِ legacy↔کانونی» — مقایسهٔ مجموعهٔ مقادیرِ همان کالا/همان
 *      سطح بسته‌بندی (چیزی که گروه‌بندیِ مبتنی بر کلید نمی‌بیند)؛
 *   ۳. گذرِ «شبیه-GS1 زیرِ kind غیر gs1» — ارقامِ معتبرِ GTIN زیرِ internal/other.
 *
 * هر یافته شامل است: نوع‌های دخیل · قاعدهٔ مقایسه · رکوردهای منبع · کلیدِ نرمال‌شده ·
 * طبقه‌بندی · قطعیت و محدودیت‌ها · پرچمِ fixture ساختگی در برابر ردیفِ واقعی ·
 * وضعیتِ visible_under_current_constraints · نیاز به تأییدِ مالک.
 *
 * مرزهای تصویب (این ماژول هیچ‌کدام را تصویب نمی‌کند):
 *   D-C11-1 (check digit) · D-C11-3 (case) · D-C12-1 (cross-company) ·
 *   D-C13-1 (pair matrix) · POL-PACKAGING-CANON-01 · POL-BARCODE-XKIND-01
 */

import { createHash } from 'node:crypto';
import {
  assessCrossType,
  gs1CheckDigitOk,
  foldUpcToEan,
  CROSS_TYPE_CONTRACT_VERSION,
  type CrossTypeRow,
  type CrossTypeFinding,
  type CrossTypeOptions,
  type DataQualityFinding,
} from './cross-type-collision.candidate';
import { stableHash } from './cross-field-identity.candidate';

export const DIAGNOSTIC_CONTRACT_VERSION = 'cident.1';

export type Provenance =
  | 'SYNTHETIC_FIXTURE'
  | 'ISOLATED_RESTORED'
  | 'AUTHORIZED_REPLICA'
  | 'UNKNOWN';

export interface DiagnosticRow extends CrossTypeRow {
  /** پیوند سطح بسته‌بندی: null = سطح کالا؛ uuid = بسته‌بندی مشخص. (برای گذر drift لازم است) */
  readonly packaging_id?: string | null;
  /** provenance ردیف — تعیین می‌کند یافته «واقعی» است یا fixture */
  readonly provenance: Provenance;
}

export type DiagnosticClassification =
  | 'exact_duplicate' // یکسان‌بودن کلیدِ مقایسه (هم‌موجودیت یا بین‌موجودیت)
  | 'equivalent_representation' // مقادیر خامِ متفاوت که روی یک کلید می‌افتند (UPC↔EAN-13، پیشوند صفر)
  | 'cross_type_collision' // نوع‌های هویت/kindهای متفاوت با کلیدِ یکسان (کد↔alias↔بارکد)
  | 'packaging_canonical_drift' // ناهماهنگی مخزن legacy ↔ کانونی برای همان کالا/بسته‌بندی
  | 'invalid_barcode' // gs1 با طول/رقم کنترلی نامعتبر — تشخیص، نه ردِ داده
  | 'misclassified_gs1_like' // ارقامِ معتبرِ GTIN زیرِ kind غیر gs1 (internal/other)
  | 'cross_company_allowed' // همان شناسه در شرکتِ دیگر — طبق مرز شرکت مجاز (پوشانده‌شده)
  | 'manual_review' // MANUAL_REVIEW/SOFT_CONFLICT موتور — تصمیمِ انسان
  | 'not_comparable'; // NOT_COMPARABLE موتور

export interface DiagnosticParty {
  readonly source_ref: string;
  readonly entity_type: string;
  readonly entity_id: string;
  readonly company_id: string;
  readonly identity_type: string;
  readonly subtype: string | null;
  readonly representation: 'base' | 'packaging';
  readonly packaging_id: string | null;
}

export interface DiagnosticFinding {
  readonly finding_id: string;
  readonly classification: DiagnosticClassification;
  readonly rule_id: string;
  readonly contract_version: string;
  readonly underlying_contract_version: string;
  readonly comparison_space: string | null;
  readonly normalized_comparison_value: string | null;
  readonly identity_types: readonly string[];
  readonly decision: string;
  readonly severity: string;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly requires_owner_approval: boolean;
  readonly visible_under_current_constraints: string;
  readonly source_records: readonly DiagnosticParty[];
  /** provenance مؤثر: اگر هر طرف fixture ساختگی باشد → true (واقعی نیست) */
  readonly synthetic: boolean;
  readonly provenance: Provenance;
  readonly crosses_company: boolean;
  readonly crosses_domain: boolean;
  readonly limitations: readonly string[];
  readonly explanation_fa: string;
}

export interface IdentityDiagnosticReport {
  readonly contract_version: string;
  readonly generated_at_iso: string;
  /** این گزارش صرفاً تشخیصی است و هیچ اجرایی را مجاز نمی‌کند. */
  readonly diagnostics_only: true;
  readonly provenance_effective: Provenance;
  readonly summary: {
    readonly total_findings: number;
    readonly by_classification: Readonly<Record<string, number>>;
    readonly rows_in: number;
    readonly rows_invalid: number;
    readonly engine_fingerprint: string;
  };
  readonly findings: readonly DiagnosticFinding[];
  /** یافته‌های کیفیتِ ردیفِ موتور (بدون طبقه‌بندیِ اجباری) — عیناً همان‌طور که هستند */
  readonly data_quality: readonly DataQualityFinding[];
  readonly limitations: readonly string[];
}

export const GLOBAL_LIMITATIONS: readonly string[] = Object.freeze([
  'diagnostics_only_no_enforcement',
  'values_redacted_when_cross_company_or_redaction_on',
  'd_c11_1_open_gs1_check_digit_not_enforced',
  'd_c11_3_open_product_code_case_policy',
  'd_c12_1_open_cross_company_policy_pending',
  'd_c13_1_open_pair_matrix_bounds',
  'provenance_marks_real_vs_synthetic',
  'cross_domain_verdicts_not_emitted_no_domain_membership_yet',
]);

// ---------------------------------------------------------------------------
// کمکی‌های داخلی
// ---------------------------------------------------------------------------

const BARCODE_TYPES = new Set(['barcode', 'packaging_barcode']);

function partyOf(row: DiagnosticRow): DiagnosticParty {
  return {
    source_ref: row.source_ref,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    company_id: row.company_id,
    identity_type: row.identity_type,
    subtype: row.subtype ?? null,
    representation: row.identity_type === 'packaging_barcode' ? 'packaging' : 'base',
    packaging_id: row.packaging_id ?? null,
  };
}

function provenanceEffective(rows: readonly DiagnosticRow[]): Provenance {
  if (rows.length === 0) return 'UNKNOWN';
  const kinds = new Set(rows.map((r) => r.provenance));
  if (kinds.size === 1) return rows[0].provenance;
  return 'UNKNOWN'; // ترکیبِ provenance — هرگز «واقعی» اعلام نمی‌شود
}

function findingSynthetic(parties: readonly DiagnosticRow[]): boolean {
  return parties.some((r) => r.provenance === 'SYNTHETIC_FIXTURE');
}

function limitationsFor(f: CrossTypeFinding | null, synthetic: boolean, crossesDomain: boolean): string[] {
  const out = ['diagnostics_only_no_enforcement'];
  if (synthetic) out.push('contains_synthetic_fixture_rows');
  if (crossesDomain) out.push('cross_domain_undecided_no_domain_registry_yet');
  if (f?.scope.crosses_company) out.push('cross_company_values_redacted');
  if (f) {
    if (!f.visible_under_current_constraints || f.visible_under_current_constraints === 'no') {
      out.push('not_visible_under_current_constraints');
    }
    if (f.requires_owner_approval) out.push('requires_owner_approval');
    if (f.types.includes('product_code')) out.push('d_c11_3_open_product_code_case_policy');
    if (f.types.some((t) => BARCODE_TYPES.has(t))) out.push('d_c11_1_open_gs1_check_digit_not_enforced');
  }
  return out;
}

/** تفکیکِ قطعیِ طبقه‌بندی — ترتیب شرط‌ها معنادار است و در تست‌ها قفل می‌شود. */
export function classifyCrossTypeFinding(
  f: CrossTypeFinding,
  rowsByRef: ReadonlyMap<string, DiagnosticRow>,
): DiagnosticClassification {
  const crossesCompany = f.scope.crosses_company;
  const types = f.types;

  // مرزِ دامنه: تا رجیستریِ دامنه نیست هرگز ALLOWED/قطعی اعلام نمی‌شود.
  const partyDomains = new Set(
    f.parties
      .map((p) => rowsByRef.get(p.source_ref)?.domain_id)
      .filter((d): d is string => typeof d === 'string' && d.length > 0),
  );
  if (partyDomains.size > 1) return 'manual_review';

  if (f.decision === 'NOT_COMPARABLE') return 'not_comparable';
  if (f.decision === 'ALLOWED') {
    return crossesCompany ? 'cross_company_allowed' : 'exact_duplicate';
  }
  if (f.decision === 'MANUAL_REVIEW' || f.decision === 'SOFT_CONFLICT') return 'manual_review';

  // HARD_CONFLICT و پایین‌تر:
  const hasBarcode = types.some((t) => BARCODE_TYPES.has(t));
  const hasPackagingBarcode = types.includes('packaging_barcode');
  const hasCanonicalBarcode = types.includes('barcode');

  // بین‌شرکتی: حتی HARD را هم به «بازبینی انسان» می‌فرستیم — مرز شرکت مقدس است و
  // D-C12-1 تصمیمِ باز است؛ هرگز مقدارِ شرکتِ دیگر افشا/ادغام نمی‌شود.
  if (crossesCompany) return 'manual_review';

  if (hasPackagingBarcode && hasCanonicalBarcode) return 'packaging_canonical_drift';

  const sameType = types.length === 1;
  if (sameType) {
    if (BARCODE_TYPES.has(types[0])) {
      // مقادیر خام متفاوت ولی کلید یکی (scan_pad/gs1): هم‌ارزی نمایش
      const raw = new Set(f.parties.map((p) => p.display_value ?? ''));
      if (raw.size > 1) return 'equivalent_representation';
      return 'exact_duplicate';
    }
    return 'exact_duplicate';
  }
  if (hasBarcode) return 'cross_type_collision';
  return 'cross_type_collision';
}

/**
 * گذرِ انحرافِ legacy ↔ canonical برای همان کالا و همان سطح بسته‌بندی.
 * گروه‌بندیِ موتور (مبتنی بر کلید) این را نمی‌بیند چون کلیدها متفاوتی‌اند.
 */
export function detectPackagingCanonicalDrift(
  rows: readonly DiagnosticRow[],
): DiagnosticFinding[] {
  const groups = new Map<string, { legacy: DiagnosticRow[]; canonical: DiagnosticRow[] }>();
  for (const row of rows) {
    const legacy = row.identity_type === 'packaging_barcode';
    if (!legacy && !(row.identity_type === 'barcode' && row.packaging_id)) continue;
    const key = `${row.entity_id} ${row.packaging_id ?? '∅'}`;
    const g = groups.get(key) ?? { legacy: [], canonical: [] };
    if (legacy) g.legacy.push(row);
    else g.canonical.push(row);
    groups.set(key, g);
  }
  const out: DiagnosticFinding[] = [];
  for (const [key, g] of [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (g.legacy.length === 0) continue; // نبودنِ ردیف legacy مشکلی نیست (کانونی مسیرِ روبه‌جلو است)
    const norm = (r: DiagnosticRow): string =>
      foldUpcToEan(String(r.display_value).normalize('NFKC').replace(/[\s\u200B_.\-]+/g, '').toLowerCase());
    const legacySet = new Set(g.legacy.map(norm));
    const canonicalSet = new Set(g.canonical.map(norm));
    const same = legacySet.size === canonicalSet.size && [...legacySet].every((v) => canonicalSet.has(v));
    if (same) continue; // کپیِ تکراری ولی هم‌خوان — یافته‌ای نیست
    const synthetic = findingSynthetic([...g.legacy, ...g.canonical]);
    const parties = [...g.legacy, ...g.canonical].map(partyOf)
      .sort((a, b) => (a.source_ref < b.source_ref ? -1 : 1));
    const detail =
      canonicalSet.size === 0
        ? 'بارکدِ legacy برای این کالا/بسته‌بندی ثبت شده ولی هیچ ردیفِ متناظرِ کانونی (product_barcode) وجود ندارد.'
        : 'مجموعهٔ بارکدهای legacy با مجموعه‌ی کانونی برای همین کالا/بسته‌بندی فرق دارد (یا برعکس) — احتمالِ انحرافِ مخزن‌ها.';
    out.push({
      finding_id: `CIDENT-DRIFT-${stableHash(`${key} ${[...legacySet].sort().join('|')} ${[...canonicalSet].sort().join('|')}`)}`,
      classification: 'packaging_canonical_drift',
      rule_id: 'CIDENT-R-packaging-canonical-drift',
      contract_version: DIAGNOSTIC_CONTRACT_VERSION,
      underlying_contract_version: CROSS_TYPE_CONTRACT_VERSION,
      comparison_space: 'scan_pad',
      normalized_comparison_value: [...legacySet].sort()[0] ?? null,
      identity_types: ['barcode', 'packaging_barcode'],
      decision: 'MANUAL_REVIEW',
      severity: 'review',
      confidence: 'medium',
      requires_owner_approval: true,
      visible_under_current_constraints: 'yes',
      source_records: parties,
      synthetic,
      provenance: provenanceEffective([...g.legacy, ...g.canonical]),
      crosses_company: false,
      crosses_domain: false,
      limitations: limitationsFor(null, synthetic, false),
      explanation_fa: detail,
    });
  }
  return out;
}

/** ارقامِ معتبرِ GTIN (طول ۸/۱۲/۱۳/۱۴ + رقم کنترلی) زیرِ kind غیر gs1 — فقط تشخیص. */
export function detectMisclassifiedGs1Like(rows: readonly DiagnosticRow[]): DiagnosticFinding[] {
  const out: DiagnosticFinding[] = [];
  for (const row of rows) {
    if (row.identity_type !== 'barcode') continue;
    const kind = String(row.subtype ?? '').toLowerCase();
    if (kind !== 'internal' && kind !== 'other') continue;
    const digits = String(row.display_value).normalize('NFKC').replace(/[\s\u200B_.\-]+/g, '');
    if (!/^\d+$/.test(digits)) continue;
    if (![8, 12, 13, 14].includes(digits.length)) continue;
    if (!gs1CheckDigitOk(digits)) continue;
    out.push({
      finding_id: `CIDENT-GS1LIKE-${stableHash(`${row.company_id} ${row.source_ref} ${digits}`)}`,
      classification: 'misclassified_gs1_like',
      rule_id: 'CIDENT-R-misclassified-gs1-like',
      contract_version: DIAGNOSTIC_CONTRACT_VERSION,
      underlying_contract_version: CROSS_TYPE_CONTRACT_VERSION,
      comparison_space: 'gs1',
      normalized_comparison_value: foldUpcToEan(digits),
      identity_types: ['barcode'],
      decision: 'MANUAL_REVIEW',
      severity: 'review',
      confidence: 'high',
      requires_owner_approval: true,
      visible_under_current_constraints: 'yes',
      source_records: [partyOf(row)],
      synthetic: row.provenance === 'SYNTHETIC_FIXTURE',
      provenance: row.provenance,
      crosses_company: false,
      crosses_domain: false,
      limitations: ['diagnostics_only_no_enforcement', 'kind_is_business_classification', 'd_c11_1_open_gs1_check_digit_not_enforced'],
      explanation_fa: `این بارکد (${digits.length} رقم، رقم کنترلی معتبر) زیرِ kind=«${kind}» ذخیره شده ولی شکلِ GTIN دارد؛ اگر gs1 است، یکتاییِ جهانی برایش اعمال نمی‌شود.`,
    });
  }
  return out;
}

/** نگاشتِ یافتهٔ موتور به یافتهٔ تشخیصی — بدون هیچ تغییری در تصمیم/شدت موتور. */
function fromEngineFinding(
  f: CrossTypeFinding,
  rowsByRef: ReadonlyMap<string, DiagnosticRow>,
): DiagnosticFinding {
  const partyRows = f.parties
    .map((p) => rowsByRef.get(p.source_ref))
    .filter((r): r is DiagnosticRow => Boolean(r));
  const synthetic = partyRows.some((r) => r.provenance === 'SYNTHETIC_FIXTURE');
  const provenance = partyRows.length > 0 ? provenanceEffective(partyRows) : 'UNKNOWN';
  const parties = f.parties.map((p) => ({
    source_ref: p.source_ref,
    entity_type: p.entity_type,
    entity_id: p.entity_id,
    company_id: p.company_id,
    identity_type: p.identity_type,
    subtype: p.subtype ?? null,
    representation: p.representation,
    packaging_id: f.scope.crosses_company ? null : rowsByRef.get(p.source_ref)?.packaging_id ?? null,
  }));
  const partyDomains = new Set(
    partyRows.map((r) => r.domain_id).filter((d): d is string => typeof d === 'string' && d.length > 0),
  );
  const crossesDomain = partyDomains.size > 1 || f.scope.crosses_domain === true;
  return {
    finding_id: f.collision_id,
    classification: classifyCrossTypeFinding(f, rowsByRef),
    rule_id: f.rule_id,
    contract_version: DIAGNOSTIC_CONTRACT_VERSION,
    underlying_contract_version: f.underlying_comparison_version,
    comparison_space: f.space,
    normalized_comparison_value: f.scope.crosses_company ? null : f.space_key,
    identity_types: f.types,
    decision: f.decision,
    severity: f.severity,
    confidence: f.confidence,
    requires_owner_approval: f.requires_owner_approval,
    visible_under_current_constraints: f.visible_under_current_constraints,
    source_records: parties,
    synthetic,
    provenance,
    crosses_company: f.scope.crosses_company,
    crosses_domain: crossesDomain,
    limitations: limitationsFor(f, synthetic, crossesDomain),
    explanation_fa: f.explanation_fa,
  };
}

/** بسته‌بندی مؤثرِ provenance گزارش: اگر همه fixture باشند fixture؛ وگرنه ترکیبی/نامعلوم. */
export function diagnoseIdentityIntegrity(
  rows: readonly DiagnosticRow[],
  opts: CrossTypeOptions = {},
): IdentityDiagnosticReport {
  const rowsByRef = new Map<string, DiagnosticRow>();
  for (const row of rows) {
    if (!rowsByRef.has(row.source_ref)) rowsByRef.set(row.source_ref, row);
    // موتور C13 در لانِ بین‌شرکتی سورس‌رف را h8 می‌کند؛ با همین کلید وصل می‌کنیم
    // تا provenance/packaging_id بازیابی شود — مقادیر همچنان پوشانده می‌مانند.
    const hashed = `ref:${stableHash(row.source_ref)}`;
    if (!rowsByRef.has(hashed)) rowsByRef.set(hashed, row);
  }

  const engine = assessCrossType(rows, opts);

  const findings: DiagnosticFinding[] = engine.findings.map((f) => fromEngineFinding(f, rowsByRef));
  findings.push(...detectPackagingCanonicalDrift(rows));
  findings.push(...detectMisclassifiedGs1Like(rows));
  for (const dq of engine.data_quality) {
    if (dq.check.startsWith('gs1_')) {
      const refRow = rowsByRef.get(dq.source_ref);
      const synthetic = refRow?.provenance === 'SYNTHETIC_FIXTURE';
      findings.push({
        finding_id: `CIDENT-DQ-${stableHash(`${dq.check} ${dq.source_ref}`)}`,
        classification: 'invalid_barcode',
        rule_id: `CIDENT-R-dataquality-${dq.check}`,
        contract_version: DIAGNOSTIC_CONTRACT_VERSION,
        underlying_contract_version: CROSS_TYPE_CONTRACT_VERSION,
        comparison_space: 'gs1',
        normalized_comparison_value: null,
        identity_types: [String(dq.identity_type)],
        decision: 'MANUAL_REVIEW',
        severity: 'review',
        confidence: 'high',
        requires_owner_approval: false,
        visible_under_current_constraints: 'yes',
        source_records: refRow ? [partyOf(refRow)] : [],
        synthetic,
        provenance: refRow?.provenance ?? 'UNKNOWN',
        crosses_company: false,
        crosses_domain: false,
        limitations: ['diagnostics_only_no_enforcement', 'd_c11_1_open_gs1_check_digit_not_enforced', ...(synthetic ? ['contains_synthetic_fixture_rows'] : [])],
        explanation_fa: dq.detail_fa,
      });
    }
  }

  findings.sort((a, b) =>
    a.classification === b.classification
      ? a.finding_id.localeCompare(b.finding_id)
      : a.classification.localeCompare(b.classification),
  );

  const byClassification: Record<string, number> = {};
  for (const f of findings) byClassification[f.classification] = (byClassification[f.classification] ?? 0) + 1;

  return {
    contract_version: DIAGNOSTIC_CONTRACT_VERSION,
    generated_at_iso: new Date().toISOString(),
    diagnostics_only: true,
    provenance_effective: provenanceEffective(rows),
    summary: {
      total_findings: findings.length,
      by_classification: byClassification,
      rows_in: engine.input.rows_in,
      rows_invalid: engine.input.rows_invalid,
      engine_fingerprint: engine.content_fingerprint,
    },
    findings,
    data_quality: engine.data_quality,
    limitations: GLOBAL_LIMITATIONS,
  };
}

/** اثرِ انگشتِ مستقل از زمان برای report (برای تستِ قطعی‌بودن) */
export function diagnosticContentFingerprint(report: IdentityDiagnosticReport): string {
  const body = {
    v: report.contract_version,
    eng: report.summary.engine_fingerprint,
    findings: report.findings.map((f) => [f.finding_id, f.classification, f.decision, f.severity]),
  };
  return createHash('sha256').update(JSON.stringify(body), 'utf8').digest('hex');
}

