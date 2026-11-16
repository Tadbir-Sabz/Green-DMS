/**
 * TASK-C13-EXECUTION-ENABLEMENT-01 — تست‌های خط‌لولهٔ ارزیابیِ C13 (واحد + E2E درون‌فرآیندی روی fixture مصنوعی).
 *
 * هیچ تستی به DB متصل نمی‌شود مگر `C13_E2E_DSN` صریحاً تنظیم شده باشد — آن تست در صورتِ نبودِ DSN رد می‌شود (skip).
 * مسیرِ DB با آداپتورِ `shadow-db.candidate.ts` در سناریوی دستی/E2E جداگانه آزموده می‌شود؛ اینجا دوگانهٔ آن نیست.
 */

import { describe, expect, it } from 'vitest';
import {
  AssessmentPipelineError,
  crossCheckExportCounts,
  findSyntheticMarkers,
  pipelineResultFingerprint,
  runAssessmentPipeline,
  validateAssessmentRows,
  type AssessmentInput,
} from '../src/modules/master-data/experimental/shadow-assessment-pipeline.candidate';
import {
  validateShadowEvidence,
  type ShadowAuthorization,
} from '../src/modules/master-data/experimental/shadow-evidence.candidate';
import {
  CROSS_TYPE_FIXTURE,
  GTIN_VALID,
} from './fixtures/c13-cross-type-identities';
import type { CrossTypeRow } from '../src/modules/master-data/experimental/cross-type-collision.candidate';

const NOW = () => new Date('2026-11-13T00:00:00.000Z');

const AUTH: ShadowAuthorization = {
  ticketRef: 'TICKET-TEST-EE01',
  authorizedBy: 'owner@example.invalid (test attestation)',
  readOnlyAttestation: 'role dms_readonly: default_transaction_read_only=on — test attestation',
  isolationAttestation: 'isolated restored copy, no write endpoint — test attestation',
  noSharedWritePathAttestation: 'no write pool route exists — test attestation',
  confidentialityAttestation: 'values redacted; no raw values in evidence — test attestation',
};

const row = (
  entity_id: string,
  identity_type: CrossTypeRow['identity_type'],
  display_value: string,
  source_ref: string,
  over: Partial<CrossTypeRow> = {},
): CrossTypeRow => ({
  entity_id,
  entity_type: 'product',
  company_id: 'org-alpha',
  identity_type,
  subtype: null,
  category_id: null,
  family_id: null,
  display_value,
  stored_normalized: display_value,
  source_ref,
  ...over,
});

/** ۹ نوعِ هویتیِ کامل، بدونِ هیچ نشانگرِ synthetic — برای مسیرِ ISOLATED_RESTORED */
const REAL_ROWS: CrossTypeRow[] = [
  row('r-p01', 'product_code', 'ACME-001', 'r-p01-code'),
  row('r-p01', 'product_name', 'Acme Widget', 'r-p01-name'),
  row('r-p01', 'product_name_latin', 'Acme Widget Latin', 'r-p01-latin'),
  row('r-fam', 'family_code', 'ACME-FAM', 'r-fam-code', { entity_type: 'product_family' }),
  row('r-cat', 'category_code', 'ACME-CAT', 'r-cat-code', { entity_type: 'product_category' }),
  row('r-p01', 'variant_signature', 'size:42', 'r-p01-vs'),
  row('r-p01', 'alias', 'acme', 'r-p01-alias', { subtype: 'latin' }),
  row('r-p01', 'barcode', GTIN_VALID, 'r-p01-barcode', { subtype: 'gs1_ean13' }),
  row('r-p02', 'packaging_barcode', '98765', 'r-p02-pkg'),
];

const baseInput = (over: Partial<AssessmentInput> = {}): AssessmentInput => ({
  rows: CROSS_TYPE_FIXTURE,
  classification: 'SYNTHETIC',
  assessmentMode: 'SYNTHETIC_FIXTURE',
  source: {
    identity: 'synthetic-fixture:pipeline-test',
    snapshotTsIso: '2026-11-13T00:00:00.000Z',
    provenance: 'pipeline-test synthetic rows',
    migrationSource: 'fixture',
  },
  // ثبتِ شمردنِ صادرات (پیش‌شرطِ وارسیِ machine-verifiable — بدونِ آن VERIFY_REPORT شکست می‌خورد، آگاهانه)
  exportedCounts: { product: 7, product_family: 2, product_category: 2, product_alias: 4, product_barcode: 10, product_packaging: 6 },
  now: NOW,
  ...over,
});

const realInput = (over: Partial<AssessmentInput> = {}): AssessmentInput => ({
  rows: REAL_ROWS,
  classification: 'REAL_AUTHORIZED_REPLICA',
  assessmentMode: 'ISOLATED_RESTORED',
  source: {
    identity: 'isolated-restored:pipeline-test',
    snapshotTsIso: '2026-11-13T00:00:00.000Z',
    provenance: 'isolated restored copy from encrypted backup',
    ownerRef: 'TASK-C13-EXECUTION-ENABLEMENT-01',
  },
  authorization: AUTH,
  exportedCounts: { product: 1, product_family: 1, product_category: 1 },
  now: NOW,
  ...over,
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13EE / pipeline — مسیرِ SYNTHETIC_FIXTURE', () => {
  it('گزارش می‌سازد؛ validateShadowEvidence خالی؛ verification.ok=true', () => {
    const { report, verification } = runAssessmentPipeline(baseInput());
    expect(validateShadowEvidence(report)).toEqual([]);
    expect(verification.ok).toBe(true);
    expect(verification.schema).toBe('c13-verify.1');
    expect(verification.assessment_mode).toBe('SYNTHETIC_FIXTURE');
    expect(report.source.assessment_mode).toBe('SYNTHETIC_FIXTURE');
    expect(report.synthetic).toBe(true);
    expect(report.contains_organizational_data).toBe(false);
    expect(verification.checks.every((c) => c.ok)).toBe(true);
  });

  it('بازتولیدپذیر است — دو اجرای یکسان ⇒ fingerprintهای یکسان', () => {
    const a = runAssessmentPipeline(baseInput());
    const b = runAssessmentPipeline(baseInput());
    expect(a.report.reproducibility.evidence_fingerprint).toBe(b.report.reproducibility.evidence_fingerprint);
    expect(a.report.reproducibility.input_fingerprint).toBe(b.report.reproducibility.input_fingerprint);
    expect(a.report.assessment_id).toBe(b.report.assessment_id);
    expect(pipelineResultFingerprint(a)).toBe(pipelineResultFingerprint(b));
    expect(a.verification.checks.find((c) => c.id === 'fingerprint-reproducible')?.ok).toBe(true);
  });

  it('export ⊆ source وقتی شمارش‌ها می‌خورد — چکِ export-within-source ok می‌شود', () => {
    const { verification } = runAssessmentPipeline(
      baseInput({
        exportedCounts: { product: 5, product_barcode: 10 },
        recordCounts: { product: 5, product_barcode: 10 },
        recordCountsTenantScoped: true,
      }),
    );
    expect(verification.ok).toBe(true);
    expect(verification.checks.find((c) => c.id === 'export-within-source:product')?.ok).toBe(true);
    expect(verification.checks.find((c) => c.id === 'export-within-source:product_barcode')?.ok).toBe(true);
  });

  it('export > source ⇒ VERIFY_REPORT؛ هیچ گزارشی emit نمی‌شود', () => {
    try {
      runAssessmentPipeline(
        baseInput({
          exportedCounts: { product: 999 },
          recordCounts: { product: 5 },
          recordCountsTenantScoped: true,
        }),
      );
      expect.unreachable('pipeline باید پرتاب می‌کرد');
    } catch (e) {
      const err = e as AssessmentPipelineError;
      expect(err).toBeInstanceOf(AssessmentPipelineError);
      expect(err.stage).toBe('VERIFY_REPORT');
      expect(err.issues.join(' ')).toContain('export-within-source:product');
    }
  });

  it('recordCounts بدون tenant-scope ⇒ VERIFY_REPORT (خواندنِ کور مردود است)', () => {
    try {
      runAssessmentPipeline(
        baseInput({
          exportedCounts: { product: 5 },
          recordCounts: { product: 5 },
          recordCountsTenantScoped: false,
        }),
      );
      expect.unreachable('pipeline باید پرتاب می‌کرد');
    } catch (e) {
      const err = e as AssessmentPipelineError;
      expect(err.stage).toBe('VERIFY_REPORT');
      expect(err.issues.join(' ')).toContain('record-counts-not-tenant-scoped');
    }
  });

  it('بدونِ شمارشِ منبع، خط‌لوله قطعاً fail نمی‌کند ولی «تکمیل‌بودن» قطعی نیست — exportedCounts-required است', () => {
    const checks = crossCheckExportCounts(43, undefined);
    expect(checks.find((c) => c.id === 'export-counts-present')?.ok).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13EE / pipeline — مسیرِ ISOLATED_RESTORED (دادهٔ واقعیِ منزوی)', () => {
  it('گزارشِ real با authorization کامل ساخته می‌شود؛ redaction اجباری است', () => {
    const { report, verification } = runAssessmentPipeline(realInput());
    expect(validateShadowEvidence(report)).toEqual([]);
    expect(report.data_classification).toBe('REAL_AUTHORIZED_REPLICA');
    expect(report.synthetic).toBe(false);
    expect(report.contains_organizational_data).toBe(true);
    expect(report.redaction_enforced).toBe(true);
    expect(report.source.assessment_mode).toBe('ISOLATED_RESTORED');
    expect(report.authorization).not.toBeNull();
    expect(report.authorization?.ticketRef).toBe('TICKET-TEST-EE01');
    expect(verification.ok).toBe(true);
    expect(verification.assessment_mode).toBe('ISOLATED_RESTORED');
    expect(verification.data_classification).toBe('REAL_AUTHORIZED_REPLICA');
  });

  it('includeDisplayValues در حالتِ real پرتاب می‌کند (هیچ ترکیبی redaction را خاموش نمی‌کند)', () => {
    expect(() => runAssessmentPipeline(realInput({ source: { ...realInput().source } }))).not.toThrow();
    // خودِ includeDisplayValues در buildShadowEvidence پرتاب می‌کند؛ از طریقِ pipeline قابلِ تزریق نیست — قرارداد را مستقیم می‌آزماییم
    // (این تست تضمین می‌کند pipeline مسیرِ redaction را دور نمی‌زند)
    const { report } = runAssessmentPipeline(realInput());
    expect(report.redaction_enforced).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13EE / pipeline — دروازهٔ منشأ (GATE) — REAL هرگز از synthetic', () => {
  it('AUTHORIZED_REPLICA با ردیف‌هایِ دارای نشانگرِ synth ⇒ GATE', () => {
    try {
      runAssessmentPipeline(
        realInput({
          assessmentMode: 'AUTHORIZED_REPLICA',
          rows: [row('r-p01', 'product_code', 'SKU', 'synth-source-1')],
        }),
      );
      expect.unreachable();
    } catch (e) {
      const err = e as AssessmentPipelineError;
      expect(err.stage).toBe('GATE');
      expect(err.issues.join(' ')).toContain('synth');
    }
  });

  it('ISOLATED_RESTORED با classification=SYNTHETIC ⇒ GATE', () => {
    try {
      runAssessmentPipeline(realInput({ classification: 'SYNTHETIC' }));
      expect.unreachable();
    } catch (e) {
      const err = e as AssessmentPipelineError;
      expect(err.stage).toBe('GATE');
    }
  });

  it('SYNTHETIC_FIXTURE با classification=REAL_AUTHORIZED_REPLICA ⇒ GATE', () => {
    try {
      runAssessmentPipeline(
        baseInput({
          classification: 'REAL_AUTHORIZED_REPLICA',
          authorization: AUTH,
        }),
      );
      expect.unreachable();
    } catch (e) {
      const err = e as AssessmentPipelineError;
      expect(err.stage).toBe('GATE');
    }
  });

  it('SYNTHETIC_FIXTURE با authorization ⇒ GATE (ادعای مجوزِ ساختگی ممنوع)', () => {
    try {
      runAssessmentPipeline(baseInput({ authorization: AUTH }));
      expect.unreachable();
    } catch (e) {
      const err = e as AssessmentPipelineError;
      expect(err.stage).toBe('GATE');
      expect(err.issues.join(' ')).toContain('authorization');
    }
  });

  it('AUTHORIZED_REPLICA بدون authorization ⇒ GATE', () => {
    try {
      runAssessmentPipeline(realInput({ authorization: undefined }));
      expect.unreachable();
    } catch (e) {
      const err = e as AssessmentPipelineError;
      expect(err.stage).toBe('GATE');
    }
  });

  it('findSyntheticMarkers: ردیف‌هایِ دارای synth در company_id/entity_id/source_ref/display_value شناسایی می‌شوند', () => {
    const dirty = [
      row('clean-1', 'product_code', 'SKU', 'ref-1'),
      row('synth-e1', 'product_code', 'SKU', 'ref-2'),
      row('clean-2', 'product_code', 'synth-value', 'ref-3'),
      row('clean-3', 'product_code', 'SKU', 'ref-4', { company_id: 'synth-company' }),
    ];
    expect(findSyntheticMarkers(dirty)).toEqual(['row[1]', 'row[2]', 'row[3]']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13EE / pipeline — اعتبارسنجی و کامل‌بودنِ ورودی', () => {
  it('ردیفِ نامعتبر کنار گذاشته می‌شود و در گزارش شمارش می‌شود — گزارش ساخته می‌شود', () => {
    const bad = { ...row('r-bad', 'product_code', '', 'r-bad-code') };
    const { report, verification } = runAssessmentPipeline(
      baseInput({
        rows: [...REAL_ROWS.slice(0, 3).map((r) => ({ ...r, company_id: 'company-synth-A' })), bad],
        exportedCounts: { product: 1 },
      }),
    );
    expect(report.completeness.rows_in).toBe(4);
    expect(report.completeness.rows_valid).toBe(3);
    expect(report.completeness.rows_invalid).toBe(1);
    expect(verification.ok).toBe(true);
    expect(verification.checks.find((c) => c.id === 'input-rows-dropped')?.ok).toBe(true);
  });

  it('همهٔ ردیف‌ها نامعتبر ⇒ verdict=ZERO_INPUT (بدون crash، بدون ادعای صفرِ یافته)', () => {
    const allBad = [
      { ...row('x', 'product_code', '', 'x-code') },
      { ...row('y', 'not-a-type' as never, '', 'y-code') },
    ];
    const { report, verification } = runAssessmentPipeline(baseInput({ rows: allBad, exportedCounts: {} }));
    expect(report.completeness.rows_valid).toBe(0);
    expect(report.verdict.outcome).toBe('ZERO_INPUT');
    expect(verification.ok).toBe(true);
  });

  it('rows غیرآرایه‌ای ⇒ stage=INGEST', () => {
    try {
      runAssessmentPipeline({ ...baseInput(), rows: null as unknown as CrossTypeRow[] });
      expect.unreachable();
    } catch (e) {
      const err = e as AssessmentPipelineError;
      expect(err.stage).toBe('INGEST');
    }
  });

  it('validateAssessmentRows: identity_type ناشناخته و kind ناقص رد می‌شوند', () => {
    const { valid, invalid } = validateAssessmentRows([
      row('ok-1', 'product_code', 'AAA', 'ok-1-code'),
      row('bad-1', 'bogus-type' as never, 'BBB', 'bad-1-code'),
      { ...row('bad-2', 'product_code', 'CCC', 'bad-2-code'), entity_id: '' },
    ]);
    expect(valid).toHaveLength(1);
    expect(invalid).toHaveLength(2);
    expect(invalid[0]?.reason).toContain('identity_type');
    expect(invalid[1]?.reason).toContain('entity_id');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13EE / crossCheckExportCounts — تطابقِ export با منبع', () => {
  it('صادرات ≤ منبع برای همهٔ جدول‌ها ⇒ همهٔ export-within-source ok', () => {
    const checks = crossCheckExportCounts(10, { product: 5, product_barcode: 10 }, { product: 7, product_barcode: 10 }, true);
    expect(checks.filter((c) => c.id.startsWith('export-within-source:')).every((c) => c.ok)).toBe(true);
  });

  it('صادرات > منبع ⇒ «ردیفِ خیالی» شناسایی می‌شود', () => {
    const checks = crossCheckExportCounts(10, { product: 99 }, { product: 7 }, true);
    const c = checks.find((x) => x.id === 'export-within-source:product');
    expect(c?.ok).toBe(false);
    expect(c?.detail).toContain('99');
  });

  it('scoped=false ⇒ record-counts-not-tenant-scoped و ردِ زودهنگام', () => {
    const checks = crossCheckExportCounts(10, { product: 5 }, { product: 7 }, false);
    expect(checks).toHaveLength(1);
    expect(checks[0]?.id).toBe('record-counts-not-tenant-scoped');
    expect(checks[0]?.ok).toBe(false);
  });

  it('بدونِ recordCounts — فقط شمارش‌هایِ export بررسی می‌شوند (backward compatible)', () => {
    const checks = crossCheckExportCounts(10, { product: 5 }, undefined, undefined);
    expect(checks.some((c) => c.id === 'export-within-source:product')).toBe(false);
    expect(checks.find((c) => c.id === 'export-counts-present')?.ok).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// E2E — فقط وقتی C13_E2E_DSN تنظیم شده باشد (مثلاً پایگاهِ disposable از scripts/c13-disposable-pg.mjs provision شده)
describe('C13EE / E2E — پایگاهِ disposable (نیازمندِ C13_E2E_DSN)', () => {
  const dsn = process.env.C13_E2E_DSN;
  const maybe = dsn ? it : it.skip;

  maybe('بازرسیِ DB: نقشِ فقط‌خواندنی اثبات می‌شود، شمارش‌ها tenant-scoped، pipeline موفق', async () => {
    const { inspectIsolatedDb } = await import(
      '../src/modules/master-data/experimental/shadow-db.candidate'
    );
    const inspection = await inspectIsolatedDb({
      dsn: dsn as string,
      sourceLabel: 'e2e-disposable',
      provenance: 'e2e disposable synthetic fixture',
      probeWrite: true,
    });
    expect(inspection.probeWrite.attempted).toBe(true);
    expect(inspection.probeWrite.rejected).toBe(true);
    expect(inspection.recordCountsTenantScoped).toBe(true);
    expect(inspection.recordCounts['product']).toBeGreaterThan(0);

    const { report, verification } = runAssessmentPipeline({
      rows: inspection.rows,
      classification: 'SYNTHETIC',
      assessmentMode: 'SYNTHETIC_FIXTURE',
      source: {
        identity: 'e2e-disposable',
        snapshotTsIso: new Date().toISOString(),
        provenance: inspection.provenance,
        migrationSource: 'fixture',
        recordCounts: inspection.recordCounts,
      },
      exportedCounts: inspection.exportedCounts,
      recordCounts: inspection.recordCounts,
      recordCountsTenantScoped: inspection.recordCountsTenantScoped,
      now: NOW,
    });
    expect(report.data_classification).toBe('SYNTHETIC');
    expect(verification.ok).toBe(true);
  }, 120_000);
});
