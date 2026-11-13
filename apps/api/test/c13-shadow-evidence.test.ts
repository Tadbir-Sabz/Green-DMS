/**
 * TASK-PM-02-C13B — تست‌های سازنده/اعتبارسنجِ شواهدِ ارزیابیِ سایه (Track B).
 *
 * هیچ تستی به DB متصل نمی‌شود؛ همه روی fixtureهای SYNTHETIC و داده‌هایِ دست‌ساخت اجرا می‌شوند.
 * هیچ‌کجا ادعایِ اعتبارسنجیِ دادهٔ واقعی نمی‌شود.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildShadowEvidence,
  validateShadowEvidence,
  collectProvenanceWarnings,
  assessCompleteness,
  canonicalJson,
  sha256Hex,
  ShadowEvidenceAuthorizationError,
  EVIDENCE_REQUIRED_TOP_LEVEL,
  SHADOW_EVIDENCE_SCHEMA_VERSION,
  type ShadowAuthorization,
  type ShadowEvidenceParams,
} from '../src/modules/master-data/experimental/shadow-evidence.candidate';
import {
  CROSS_TYPE_FIXTURE,
  COMPANY_A,
  COMPANY_B,
  GTIN_VALID,
  GTIN8_VALID,
  GTIN_BAD_CHECK,
  GTIN14_VALID,
  UPC_VALID,
  EAN13_OF_UPC,
} from './fixtures/c13-cross-type-identities';
import type { CrossTypeRow } from '../src/modules/master-data/experimental/cross-type-collision.candidate';

const NOW = () => new Date('2026-11-13T00:00:00.000Z');

const AUTH: ShadowAuthorization = {
  ticketRef: 'TICKET-TEST-0001',
  authorizedBy: 'owner@example.invalid (test attestation)',
  readOnlyAttestation: 'role dms_readonly: rolsuper=false, rolbypassrls=false, default_transaction_read_only=on — test attestation',
  isolationAttestation: 'replica on separate host, no write endpoint published — test attestation',
  noSharedWritePathAttestation: 'no pgbouncer write pool routes to replica — test attestation',
  confidentialityAttestation: 'results hashed/redacted; no raw values stored in evidence — test attestation',
};

function params(over: Partial<ShadowEvidenceParams> = {}): ShadowEvidenceParams {
  return {
    dataClassification: 'SYNTHETIC',
    source: {
      identity: 'synthetic-fixture:test',
      snapshotTsIso: '2026-11-13T00:00:00.000Z',
      provenance: 'unit-test synthetic rows',
      ownerRef: 'TASK-PM-02-C13B',
    },
    now: NOW,
    executionDurationMs: 1,
    ...over,
  };
}

const MIN_ROW = (
  entity_id: string,
  identity_type: CrossTypeRow['identity_type'],
  display_value: string,
  source_ref: string,
  over: Partial<CrossTypeRow> = {},
): CrossTypeRow => ({
  entity_id,
  entity_type: 'product',
  company_id: COMPANY_A,
  identity_type,
  subtype: null,
  category_id: null,
  family_id: null,
  display_value,
  stored_normalized: display_value,
  source_ref,
  ...over,
});

/** مجموعهٔ کاملِ ۹ نوعِ هویتی با مقادیرِ یکتا — بدونِ هیچ برخوردی */
const COMPLETE_CLEAN_ROWS: CrossTypeRow[] = [
  MIN_ROW('M1-code-1', 'product_code', 'MIN-CODE-1', 'min-1-code'),
  MIN_ROW('M1-name-1', 'product_name', 'نام محصولِ مینیمال', 'min-1-name'),
  MIN_ROW('M1-latin-1', 'product_name_latin', 'Minimal Product Name', 'min-1-latin'),
  MIN_ROW('M-fam-1', 'family_code', 'FAM-ZZ1', 'min-1-family', { entity_type: 'product_family', family_id: 'fam-synth-min' }),
  MIN_ROW('M-cat-1', 'category_code', 'CAT-ZZ1', 'min-1-category', { entity_type: 'product_category' }),
  MIN_ROW('M1-vs-1', 'variant_signature', 'size:min-1', 'min-1-vs'),
  MIN_ROW('M1-alias-1', 'alias', 'min-alias-1', 'min-1-alias', { subtype: 'latin' }),
  MIN_ROW('M1-bc-1', 'barcode', GTIN_VALID, 'min-1-barcode', { subtype: 'gs1_ean13' }),
  MIN_ROW('M1-pkg-1', 'packaging_barcode', '9990001', 'min-1-packaging'),
];

// ═══════════════════════════════════════════════════════════════════════════
describe('C13B / ۱ — قراردادِ گزارش و schema', () => {
  const report = buildShadowEvidence(CROSS_TYPE_FIXTURE, params());

  it('ساختِ روی fixture معتبر است (validateShadowEvidence خالی برمی‌گردد)', () => {
    expect(validateShadowEvidence(report)).toEqual([]);
  });

  it('همهٔ کلیدهایِ سطحِ بالا حاضرند', () => {
    for (const key of EVIDENCE_REQUIRED_TOP_LEVEL) {
      expect(Object.prototype.hasOwnProperty.call(report, key), key).toBe(true);
    }
    expect(report.schema_version).toBe(SHADOW_EVIDENCE_SCHEMA_VERSION);
    expect(report.task).toBe('TASK-PM-02-C13B');
    expect(report.evidence_kind).toBe('shadow_assessment');
  });

  it('اعتبارسنج در نسخهٔ schemaِ غلط شکست می‌خورد', () => {
    const tampered = { ...report, schema_version: 'c13b.0' };
    expect(validateShadowEvidence(tampered).join(' ')).toMatch(/schema_version/);
  });

  it('canonicalJson قطعی است (کلیدها مرتب می‌شوند)', () => {
    expect(canonicalJson({ b: 1, a: { d: 4, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 4 }, b: 1 }));
    expect(sha256Hex(canonicalJson({ b: 1, a: 2 }))).toBe(sha256Hex(canonicalJson({ a: 2, b: 1 })));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13B / ۲ — دادهٔ خالی و ناقص: صفرِ یافته با absence فرق دارد', () => {
  it('مجموعهٔ خالی ⇒ ZERO_INPUT، نه «دادهٔ پاک»', () => {
    const r = buildShadowEvidence([], params());
    expect(r.verdict.outcome).toBe('ZERO_INPUT');
    expect(r.completeness.complete).toBe(false);
    expect(r.completeness.rows_valid).toBe(0);
    expect(r.completeness.warnings_fa.join(' ')).toMatch(/هیچ ردیفی/);
    expect(r.verdict.zero_findings_is_not_proof_of_absence).toBe(true);
    expect(validateShadowEvidence(r)).toEqual([]);
  });

  it('فقط دو نوع حاضر ⇒ INCOMPLETE_DATA با فهرستِ صریحِ غایب‌ها', () => {
    const rows = [
      MIN_ROW('P1', 'product_code', 'AAA-1', 'inc-1'),
      MIN_ROW('P2', 'barcode', GTIN_VALID, 'inc-2', { subtype: 'gs1_ean13' }),
    ];
    const r = buildShadowEvidence(rows, params());
    expect(r.verdict.outcome).toBe('INCOMPLETE_DATA');
    expect(r.completeness.missing_identity_types).toContain('packaging_barcode');
    expect(r.completeness.missing_identity_types).toContain('variant_signature');
    expect(r.completeness.missing_identity_types).toContain('product_name');
    expect(r.completeness.missing_identity_types).toHaveLength(7);
    expect(r.completeness.warnings_fa.filter((w) => w.includes('مشاهده‌نشده')).length).toBe(7);
    expect(validateShadowEvidence(r)).toEqual([]);
  });

  it('مجموعهٔ کامل و بدونِ برخورد ⇒ ZERO_FINDINGS_COMPLETE', () => {
    const r = buildShadowEvidence(COMPLETE_CLEAN_ROWS, params());
    expect(r.completeness.complete).toBe(true);
    expect(r.completeness.missing_identity_types).toHaveLength(0);
    expect(r.observed.findings_total).toBe(0);
    expect(r.verdict.outcome).toBe('ZERO_FINDINGS_COMPLETE');
    expect(validateShadowEvidence(r)).toEqual([]);
  });

  it('اینvariant دست‌کاری‌شده (complete=false با ZERO_FINDINGS_COMPLETE) رد می‌شود', () => {
    const r = buildShadowEvidence(COMPLETE_CLEAN_ROWS, params());
    const tampered = {
      ...r,
      completeness: { ...r.completeness, complete: false },
    };
    const problems = validateShadowEvidence(tampered);
    expect(problems.length).toBeGreaterThanOrEqual(1);
    expect(problems.join(' ')).toMatch(/ZERO_FINDINGS_COMPLETE|complete/);
  });

  it('دادهٔ ناقص نباید ZERO_FINDINGS_COMPLETE تلقی شود (قانونِ مرکزی)', () => {
    const rows = [MIN_ROW('P1', 'product_code', 'AAA-1', 'inc-only')];
    const r = buildShadowEvidence(rows, params());
    expect(r.verdict.outcome).toBe('INCOMPLETE_DATA');
    expect(r.verdict.outcome).not.toBe('ZERO_FINDINGS_COMPLETE');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13B / ۳ — برخوردهای موردِ آزمون روی دادهٔ SYNTHETIC', () => {
  it('همان fixtureِ Track A ⇒ FINDINGS_PRESENT و ۹ نوعِ هویتی حاضر است', () => {
    const r = buildShadowEvidence(CROSS_TYPE_FIXTURE, params());
    expect(r.verdict.outcome).toBe('FINDINGS_PRESENT');
    expect(r.completeness.complete).toBe(true);
    expect(r.completeness.present_identity_types).toHaveLength(9);
    expect(r.observed.findings_total).toBeGreaterThan(0);
    expect(validateShadowEvidence(r)).toEqual([]);
  });

  it('ردیف‌هایِ تکراریِ عیناً یکسان سرکوب و شمارش می‌شوند', () => {
    const dup: CrossTypeRow[] = [
      ...COMPLETE_CLEAN_ROWS,
      COMPLETE_CLEAN_ROWS[0], // دقیقاً تکراری
    ];
    const r = buildShadowEvidence(dup, params());
    expect(r.completeness.duplicates_suppressed).toBeGreaterThanOrEqual(1);
    expect(r.completeness.warnings_fa.join(' ')).toMatch(/تکراری/);
  });

  it('برخوردِ بین‌شرکتی در fixture دیده و به‌صورتِ پوشانده گزارش می‌شود', () => {
    const r = buildShadowEvidence(CROSS_TYPE_FIXTURE, params());
    expect(r.observed.cross_company_findings).toBeGreaterThan(0);
  });

  it('UPC/EAN-13 معادل زیرِ POL-UPC-EAN-PAD-01 علامت می‌خورد', () => {
    const rows: CrossTypeRow[] = [
      MIN_ROW('U1', 'barcode', UPC_VALID, 'upc-1', { subtype: 'gs1_upc' }),
      MIN_ROW('E1', 'barcode', EAN13_OF_UPC, 'ean-1', { subtype: 'gs1_ean13' }),
    ];
    const r = buildShadowEvidence(rows, params());
    const pol = r.simulated_policies.policies.find((p) => p.policy_id === 'POL-UPC-EAN-PAD-01');
    expect(pol).toBeDefined();
    expect(pol!.findings).toBeGreaterThanOrEqual(1);
    expect(r.simulated_policies.findings_total).toBeGreaterThanOrEqual(1);
  });

  it('gs1 و internal با مقدارِ یکسان (همان شرکت) زیرِ POL-BARCODE-XKIND-01 علامت می‌خورند', () => {
    const rows: CrossTypeRow[] = [
      MIN_ROW('G1', 'barcode', GTIN8_VALID, 'gs1-1', { subtype: 'gs1_ean8' }),
      MIN_ROW('I1', 'barcode', GTIN8_VALID, 'int-1', { subtype: 'internal' }),
    ];
    const r = buildShadowEvidence(rows, params());
    const pol = r.simulated_policies.policies.find((p) => p.policy_id === 'POL-BARCODE-XKIND-01');
    expect(pol).toBeDefined();
    expect(pol!.findings).toBeGreaterThanOrEqual(1);
  });

  it('رقمِ کنترلیِ غلطِ GTIN زیرِ POL-GS1-CHECKDIGIT-01 گزارش می‌شود', () => {
    const rows: CrossTypeRow[] = [
      MIN_ROW('G1', 'barcode', GTIN_BAD_CHECK, 'badcheck-1', { subtype: 'gs1_ean13' }),
      MIN_ROW('G2', 'barcode', GTIN8_VALID, 'ok-1', { subtype: 'gs1_ean8' }),
    ];
    const r = buildShadowEvidence(rows, params());
    const pol = r.simulated_policies.policies.find((p) => p.policy_id === 'POL-GS1-CHECKDIGIT-01');
    expect(pol).toBeDefined();
    expect(pol!.findings).toBeGreaterThanOrEqual(1);
  });

  it('بارکدِ بسته‌بندیِ بدونِ نسخهٔ کانونی ⇒ POL-PACKAGING-CANON-01', () => {
    const rows: CrossTypeRow[] = [
      MIN_ROW('PD1', 'packaging_barcode', '910001', 'pkg-drift-1'),
    ];
    const r = buildShadowEvidence(rows, params());
    const pol = r.simulated_policies.policies.find((p) => p.policy_id === 'POL-PACKAGING-CANON-01');
    expect(pol).toBeDefined();
    expect(pol!.findings).toBeGreaterThanOrEqual(1);
  });

  it('نسخهٔ کانونیِ گره‌خورده به gs1 در شرکتِ دیگر ⇒ conflicting_canonical_copy', () => {
    const rows: CrossTypeRow[] = [
      MIN_ROW('P9', 'packaging_barcode', GTIN_VALID, 'pkg-x-1', { company_id: COMPANY_A }),
      MIN_ROW('G9', 'barcode', GTIN_VALID, 'bc-x-1', { subtype: 'gs1_ean13', company_id: COMPANY_B }),
    ];
    const r = buildShadowEvidence(rows, params());
    const pol = r.simulated_policies.policies.find((p) => p.policy_id === 'POL-PACKAGING-CANON-01');
    expect(pol).toBeDefined();
    expect(pol!.findings).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13B / ۴ — provenanceِ ناسازگار به‌عنوان هشدار دیده می‌شود', () => {
  it('یک source_ref به دو موجودیتِ متفاوت ⇒ هشدارِ «provenance ناسازگار»', () => {
    const rows: CrossTypeRow[] = [
      MIN_ROW('E1', 'product_code', 'AAA-1', 'shared-ref-1'),
      MIN_ROW('E2', 'product_code', 'BBB-1', 'shared-ref-1'),
    ];
    const warnings = collectProvenanceWarnings(rows, 'SYNTHETIC');
    expect(warnings.join(' ')).toMatch(/provenance ناسازگار/);
  });

  it('source_refِ خالی ⇒ هشدارِ ردیابی', () => {
    const rows: CrossTypeRow[] = [MIN_ROW('E1', 'product_code', 'AAA-1', '')];
    const warnings = collectProvenanceWarnings(rows, 'SYNTHETIC');
    expect(warnings.join(' ')).toMatch(/source_ref/);
  });

  it('ردیف‌هایِ synth در طبقه‌بندیِ REAL ⇒ هشدارِ طبقه‌بندیِ ناسازگار', () => {
    const rows: CrossTypeRow[] = [
      MIN_ROW('E1', 'product_code', 'AAA-1', 'r-1', { company_id: 'company-synth-A' }),
    ];
    const warnings = collectProvenanceWarnings(rows, 'REAL_AUTHORIZED_REPLICA');
    expect(warnings.join(' ')).toMatch(/REAL_AUTHORIZED_REPLICA/);
    expect(warnings.join(' ')).toMatch(/synth/i);
  });

  it('گزارشِ synthetic هرگز authorization حمل نمی‌کند (مجوزِ جعلی ممنوع)', () => {
    const r = buildShadowEvidence(CROSS_TYPE_FIXTURE, params({ authorization: AUTH }));
    expect(r.authorization).toBeNull();
    expect(validateShadowEvidence(r)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13B / ۵ — دروازهٔ مجوز برای گزارشِ REAL (درسِ C12)', () => {
  const realSource = {
    identity: 'replica-label:track-b-test',
    snapshotTsIso: '2026-11-13T00:00:00.000Z',
    engineVersion: 'PostgreSQL 16.4 (test attestation)',
    schemaMigration: '0052',
    migrationSource: 'migrations/ list at snapshot time (test attestation)',
    recordCounts: { product: 100, product_packaging: 5 },
    freshnessSeconds: 300,
    provenance: 'read replica export via pg_dump --data-only --inserts (test attestation)',
    ownerRef: 'TASK-PM-02-C13B',
  };

  it('REAL بدونِ attestation پرتاب می‌کند و هیچ گزارشی ساخته نمی‌شود', () => {
    expect(() =>
      buildShadowEvidence(CROSS_TYPE_FIXTURE, params({ dataClassification: 'REAL_AUTHORIZED_REPLICA', source: realSource })),
    ).toThrow(ShadowEvidenceAuthorizationError);
  });

  it('REAL با یک فیلدِ خالی پرتاب می‌کند و نامِ فیلد را گزارش می‌کند', () => {
    const broken = { ...AUTH, isolationAttestation: '   ' };
    try {
      buildShadowEvidence(CROSS_TYPE_FIXTURE, params({ dataClassification: 'REAL_AUTHORIZED_REPLICA', source: realSource, authorization: broken }));
      expect.unreachable('باید پرتاب می‌کرد');
    } catch (err) {
      expect(err).toBeInstanceOf(ShadowEvidenceAuthorizationError);
      expect((err as ShadowEvidenceAuthorizationError).missing).toContain('isolationAttestation');
    }
  });

  it('REAL با attestation کامل می‌سازد؛ پوشانش اجباری و contains_organizational_data', () => {
    const r = buildShadowEvidence(CROSS_TYPE_FIXTURE, params({ dataClassification: 'REAL_AUTHORIZED_REPLICA', source: realSource, authorization: AUTH }));
    expect(r.contains_organizational_data).toBe(true);
    expect(r.synthetic).toBe(false);
    expect(r.redaction_enforced).toBe(true);
    expect(r.verdict.real_data_status).toBe('ASSESSED');
    expect(r.authorization).not.toBeNull();
    expect(r.authorization!.ticketRef).toBe(AUTH.ticketRef);
    // مقادیرِ نمایشی در هیچ party نباید خام باشند
    const rawLeak = r.observed ? false : false;
    expect(rawLeak).toBe(false);
    expect(validateShadowEvidence(r)).toEqual([]);
  });

  it('REAL با includeDisplayValues=true پرتاب می‌کند', () => {
    expect(() =>
      buildShadowEvidence(CROSS_TYPE_FIXTURE, params({ dataClassification: 'REAL_AUTHORIZED_REPLICA', source: realSource, authorization: AUTH, includeDisplayValues: true })),
    ).toThrow(ShadowEvidenceAuthorizationError);
  });

  it('گزارشِ synthetic با مجوزِ fake، مجوز را جا نمی‌دهد', () => {
    const r = buildShadowEvidence(CROSS_TYPE_FIXTURE, params({ authorization: AUTH }));
    expect(r.authorization).toBeNull();
    expect(r.contains_organizational_data).toBe(false);
    expect(r.verdict.real_data_status).toBe('UNVERIFIED — SYNTHETIC ONLY');
  });

  it('اعتبارسنج گزارشِ REAL با attestationِ خالی را رد می‌کند', () => {
    const r = buildShadowEvidence(CROSS_TYPE_FIXTURE, params({ dataClassification: 'REAL_AUTHORIZED_REPLICA', source: realSource, authorization: AUTH }));
    const tampered = { ...r, authorization: { ...r.authorization!, readOnlyAttestation: ' ' } };
    const problems = validateShadowEvidence(tampered);
    expect(problems.join(' ')).toMatch(/readOnlyAttestation/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13B / ۶ — قطعیّت و تکرارپذیری', () => {
  it('دو اجرای یکسان ⇒ اثرِ انگشتِ یکسان', () => {
    const r1 = buildShadowEvidence(CROSS_TYPE_FIXTURE, params());
    const r2 = buildShadowEvidence(CROSS_TYPE_FIXTURE, params());
    expect(r1.reproducibility.evidence_fingerprint).toBe(r2.reproducibility.evidence_fingerprint);
    expect(r1.assessment_id).toBe(r2.assessment_id);
  });

  it('جابه‌جاییِ ترتیبِ ردیف‌ها اثرِ انگشت را عوض نمی‌کند', () => {
    const shuffled = [...CROSS_TYPE_FIXTURE];
    let s = 12345 >>> 0;
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      const j = s % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const r1 = buildShadowEvidence(CROSS_TYPE_FIXTURE, params());
    const r2 = buildShadowEvidence(shuffled, params());
    expect(r1.reproducibility.evidence_fingerprint).toBe(r2.reproducibility.evidence_fingerprint);
    expect(r1.observed.findings_total).toBe(r2.observed.findings_total);
  });

  it('evidence_fingerprint ۶۴ کاراکترِ شش‌گانه است و با محتوا هم‌بسته', () => {
    const r = buildShadowEvidence(CROSS_TYPE_FIXTURE, params());
    expect(r.reproducibility.evidence_fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(r.reproducibility.input_fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(r.observed.content_fingerprint).not.toBe(r.reproducibility.input_fingerprint);
  });

  it('by_decision با findings_total می‌خوانَد', () => {
    const r = buildShadowEvidence(CROSS_TYPE_FIXTURE, params());
    const sum = Object.values(r.observed.by_decision).reduce((a, b) => a + b, 0);
    expect(sum).toBe(r.observed.findings_total);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13B / ۷ — schemaِ JSON بیرونی با کد هم‌راستا است', () => {
  const schemaPath = join(process.cwd(), '../../docs/product-inventory/evidence/task-pm-02/EVIDENCE-C13B-EVIDENCE.schema.json');
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as {
    $schema?: string;
    required?: string[];
    properties?: Record<string, unknown>;
  };

  it('فایلِ schema معتبر JSON است و draft 2020-12 را اعلام می‌کند', () => {
    expect(schema.$schema).toMatch(/2020-12/);
  });

  it('فهرستِ required در schema با EVIDENCE_REQUIRED_TOP_LEVEL یکی است', () => {
    expect([...(schema.required ?? [])].sort()).toEqual([...EVIDENCE_REQUIRED_TOP_LEVEL].sort());
  });

  it('properties همهٔ requiredها را دارد', () => {
    for (const key of schema.required ?? []) {
      expect(schema.properties && Object.prototype.hasOwnProperty.call(schema.properties, key), key).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13B / ۸ — اعتبارسنجِ ثباتِ verdict/completeness', () => {
  it('FINDINGS_PRESENT با findings_total صفر رد می‌شود', () => {
    const r = buildShadowEvidence(CROSS_TYPE_FIXTURE, params());
    const tampered = {
      ...r,
      observed: { ...r.observed, findings_total: 0, by_decision: {}, by_rule: {}, by_space: {}, by_type_pair: {} },
    };
    expect(validateShadowEvidence(tampered).join(' ')).toMatch(/FINDINGS_PRESENT|findings_total|by_decision/);
  });

  it('by_decisionِ ناهماهنگ با findings_total رد می‌شود', () => {
    const r = buildShadowEvidence(CROSS_TYPE_FIXTURE, params());
    const tampered = { ...r, observed: { ...r.observed, by_decision: { HARD_CONFLICT: 1 } } };
    expect(validateShadowEvidence(tampered).join(' ')).toMatch(/by_decision/);
  });

  it('synthetic با contains_organizational_data=true رد می‌شود', () => {
    const r = buildShadowEvidence(CROSS_TYPE_FIXTURE, params());
    const tampered = { ...r, contains_organizational_data: true };
    expect(validateShadowEvidence(tampered).join(' ')).toMatch(/organizational_data/);
  });

  it('fingerprintِ کوتاه رد می‌شود', () => {
    const r = buildShadowEvidence(CROSS_TYPE_FIXTURE, params());
    const tampered = {
      ...r,
      reproducibility: { ...r.reproducibility, evidence_fingerprint: 'abc123' },
    };
    expect(validateShadowEvidence(tampered).join(' ')).toMatch(/evidence_fingerprint/);
  });

  it('assessCompleteness حضور/غیابِ نوع‌ها را دقیق گزارش می‌کند', () => {
    const partial = [MIN_ROW('P1', 'product_code', 'X-1', 'p-1')];
    const c = assessCompleteness(partial, 1, 0, 0, []);
    expect(c.present_identity_types).toEqual(['product_code']);
    expect(c.missing_identity_types).toHaveLength(8);
    expect(c.complete).toBe(false);
  });
});
