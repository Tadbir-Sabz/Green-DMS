import { describe, expect, it } from 'vitest';
import {
  diagnoseIdentityIntegrity,
  diagnosticContentFingerprint,
  detectMisclassifiedGs1Like,
  detectPackagingCanonicalDrift,
  type DiagnosticRow,
  type Provenance,
} from '../src/modules/master-data/experimental/identity-integrity-diagnostics.candidate';

/**
 * TASK-PM-02-C14-IDENTITY-INTEGRITY-02 — تشخیصِ یکپارچهٔ یکپارچگیِ هویت.
 *
 * ⚠️ همه ردیف‌ها **۱۰۰٪ ساختگی** (SYNTHETIC_FIXTURE) هستند؛ هیچ دادهٔ واقعی.
 * هیچ یافته‌ای از این تست‌ها مجوز نیست — تشخیص ≠ اجرا.
 */

const A = 'company-synth-A';
const B = 'company-synth-B';

const GTIN_VALID = '4006381333931';
const GTIN_BAD_CHECK = '4006381333932';
const UPC_VALID = '036000291452';
const EAN13_OF_UPC = '0036000291452';
const GTIN8_VALID = '12345670';
const GTIN14_VALID = '12345678901231';

const row = (
  entity_id: string,
  company_id: string,
  identity_type: DiagnosticRow['identity_type'],
  display_value: string,
  source_ref: string,
  extra: Partial<DiagnosticRow> = {},
): DiagnosticRow => ({
  entity_id,
  entity_type: extra.entity_type ?? 'product',
  company_id,
  domain_id: extra.domain_id,
  identity_type,
  subtype: extra.subtype ?? null,
  category_id: extra.category_id ?? null,
  family_id: extra.family_id ?? null,
  display_value,
  stored_normalized: extra.stored_normalized ?? display_value,
  source_ref,
  packaging_id: extra.packaging_id ?? null,
  provenance: extra.provenance ?? 'SYNTHETIC_FIXTURE',
});

const byRule = (report: ReturnType<typeof diagnoseIdentityIntegrity>, ruleId: string) =>
  report.findings.filter((f) => f.rule_id === ruleId);
const byClassification = (report: ReturnType<typeof diagnoseIdentityIntegrity>, cls: string) =>
  report.findings.filter((f) => f.classification === cls);

describe('CIDENT — معادل‌نمایی و تکراری (GS1)', () => {
  it('UPC-A در برابر EAN-13ِ تاشده ⇒ equivalent_representation (نه خطا/نه تأیید)', () => {
    const report = diagnoseIdentityIntegrity([
      row('p-upc', A, 'barcode', UPC_VALID, 'r-upc', { subtype: 'gs1_upc' }),
      row('p-ean', A, 'barcode', EAN13_OF_UPC, 'r-ean', { subtype: 'gs1_ean13' }),
    ]);
    const hits = byClassification(report, 'equivalent_representation');
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits.some((f) => f.source_records.length === 2)).toBe(true);
    for (const f of hits) {
      expect(f.synthetic).toBe(true);
      expect(f.requires_owner_approval).toBe(true);
      expect(f.limitations).toContain('diagnostics_only_no_enforcement');
      expect(f.limitations).toContain('d_c11_1_open_gs1_check_digit_not_enforced');
    }
  });

  it('همان بارکدِ gs1 برای دو کالای متمایزِ یک شرکت ⇒ exact_duplicate', () => {
    const report = diagnoseIdentityIntegrity([
      row('p-1', A, 'barcode', GTIN_VALID, 'r-1', { subtype: 'gs1_ean13' }),
      row('p-2', A, 'barcode', GTIN_VALID, 'r-2', { subtype: 'gs1_ean13' }),
    ]);
    const hits = byClassification(report, 'exact_duplicate');
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits.some((f) => f.source_records.length === 2)).toBe(true);
  });

  it('همان کالا با دو ردیفِ alias یکسان ⇒ decision=ALLOWED (افزونگی، نه تعارض) ولی classification=exact_duplicate', () => {
    const report = diagnoseIdentityIntegrity([
      row('p-5', A, 'alias', 'my-brand', 'r-a1', { subtype: 'latin' }),
      row('p-5', A, 'alias', 'my-brand', 'r-a2', { subtype: 'latin' }),
    ]);
    const hits = byClassification(report, 'exact_duplicate');
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits.every((f) => f.decision === 'ALLOWED')).toBe(true);
    // نکته: موتور requires_owner_approvalِ قاعده را نگه می‌دارد (c13.1) — تشخیص تصمیم نمی‌گیرد
    expect(hits.every((f) => f.severity !== 'hard')).toBe(true);
  });
});

describe('CIDENT — برخوردِ بین‌نوعی', () => {
  it('کدِ کالا در برابر بارکدِ internalِ کالای دیگر (qr9 ≡ QR-9 به‌لحاظ alnum) ⇒ cross_type_collision', () => {
    const report = diagnoseIdentityIntegrity([
      row('p-8', A, 'product_code', 'QR-9', 'r-pc'),
      row('p-9', A, 'barcode', 'qr9', 'r-bc', { subtype: 'internal' }),
    ]);
    const hits = byClassification(report, 'cross_type_collision');
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits.every((f) => f.identity_types.includes('barcode') || f.identity_types.includes('product_code'))).toBe(true);
  });
});

describe('CIDENT — انحرافِ legacy ↔ کنجالهٔ کانونی (packaging/canonical drift)', () => {
  it('همان کالا/بسته‌بندی با مقادیرِ متفاوت در دو مخزن ⇒ packaging_canonical_drift', () => {
    const report = diagnoseIdentityIntegrity([
      row('p-10', A, 'packaging_barcode', GTIN_VALID, 'pp-1', { packaging_id: 'pack-1' }),
      row('p-10', A, 'barcode', GTIN8_VALID, 'pb-1', { subtype: 'internal', packaging_id: 'pack-1' }),
    ]);
    const mine = report.findings.filter((f) => f.rule_id === 'CIDENT-R-packaging-canonical-drift');
    expect(mine).toHaveLength(1);
    expect(mine[0].classification).toBe('packaging_canonical_drift');
    expect(mine[0].source_records.map((p) => p.representation).sort()).toEqual(['base', 'packaging']);
    expect(mine[0].requires_owner_approval).toBe(true);
  });

  it('legacy بدونِ ردیفِ کانونی ⇒ drift با توضیحِ «هیچ ردیفِ متناظر»', () => {
    const report = diagnoseIdentityIntegrity([
      row('p-11', A, 'packaging_barcode', GTIN_VALID, 'pp-2', { packaging_id: 'pack-2' }),
    ]);
    const mine = report.findings.filter((f) => f.rule_id === 'CIDENT-R-packaging-canonical-drift');
    expect(mine).toHaveLength(1);
    expect(mine[0].explanation_fa).toContain('هیچ ردیفِ متناظرِ کانونی');
  });

  it('مجموعه‌های هم‌خوان ⇒ هیچ یافتهٔ drift (مسیرِ CIDENT)', () => {
    const report = diagnoseIdentityIntegrity([
      row('p-12', A, 'packaging_barcode', GTIN_VALID, 'pp-3', { packaging_id: 'pack-3' }),
      row('p-12', A, 'barcode', GTIN_VALID, 'pb-3', { subtype: 'other', packaging_id: 'pack-3' }),
    ]);
    expect(report.findings.filter((f) => f.rule_id === 'CIDENT-R-packaging-canonical-drift')).toHaveLength(0);
  });

  it('بارکدهای سطحِ کالا (packaging_id=null) برای drift جفت نمی‌شوند', () => {
    const report = diagnoseIdentityIntegrity([
      row('p-13', A, 'barcode', GTIN_VALID, 'pb-4', { subtype: 'internal', packaging_id: null }),
    ]);
    expect(report.findings.filter((f) => f.rule_id === 'CIDENT-R-packaging-canonical-drift')).toHaveLength(0);
  });

  it('detectPackagingCanonicalDrift روی fixture مستقیم قطعی است', () => {
    const rows = [
      row('p-20', A, 'packaging_barcode', GTIN_VALID, 'pp-5', { packaging_id: 'pack-5' }),
      row('p-20', A, 'barcode', GTIN14_VALID, 'pb-5', { subtype: 'gs1_itf14', packaging_id: 'pack-5' }),
    ];
    const drift = detectPackagingCanonicalDrift(rows);
    expect(drift).toHaveLength(1);
    expect(drift[0].finding_id.startsWith('CIDENT-DRIFT-')).toBe(true);
  });
});

describe('CIDENT — بارکد نامعتبر و شبیه-GS1 (فقط تشخیص)', () => {
  it('gs1_ean13 با رقم کنترلی غلط ⇒ invalid_barcode (بدون enforcement)', () => {
    const report = diagnoseIdentityIntegrity([
      row('p-bad', A, 'barcode', GTIN_BAD_CHECK, 'r-bad', { subtype: 'gs1_ean13' }),
    ]);
    const hits = byClassification(report, 'invalid_barcode');
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].decision).toBe('MANUAL_REVIEW');
    expect(hits[0].limitations).toContain('diagnostics_only_no_enforcement');
    expect(report.data_quality.some((d) => d.check === 'gs1_check_digit_invalid')).toBe(true);
  });

  it('GTIN معتبر زیرِ kind=internal ⇒ misclassified_gs1_like (فقط هشدارِ مالک)', () => {
    const report = diagnoseIdentityIntegrity([
      row('p-like', A, 'barcode', GTIN_VALID, 'r-like', { subtype: 'internal' }),
    ]);
    const hits = byClassification(report, 'misclassified_gs1_like');
    expect(hits).toHaveLength(1);
    expect(hits[0].normalized_comparison_value).toBe(GTIN_VALID);
    expect(hits[0].limitations).toContain('kind_is_business_classification');
    expect(detectMisclassifiedGs1Like([
      row('p-like2', A, 'barcode', GTIN_BAD_CHECK, 'r-like2', { subtype: 'internal' }),
    ])).toHaveLength(0);
  });

  it('GTIN-14 معتبر زیرِ kind=other ⇒ misclassified_gs1_like', () => {
    const hits = detectMisclassifiedGs1Like([
      row('p-14', A, 'barcode', GTIN14_VALID, 'r-14', { subtype: 'other' }),
    ]);
    expect(hits).toHaveLength(1);
    expect(hits[0].normalized_comparison_value).toBe(GTIN14_VALID);
  });
});

describe('CIDENT — مرزهای شرکت و دامنه', () => {
  it('همان gs1 در دو شرکت ⇒ یافتهٔ بین‌شرکتی با مقادیر پوشانده (redacted) — بدون ادغام/افشا', () => {
    const report = diagnoseIdentityIntegrity([
      row('pA', A, 'barcode', GTIN_VALID, 'r-xa', { subtype: 'gs1_ean13' }),
      row('pB', B, 'barcode', GTIN_VALID, 'r-xb', { subtype: 'gs1_ean13' }),
    ]);
    const cross = report.findings.filter((f) => f.crosses_company);
    expect(cross.length).toBeGreaterThanOrEqual(1);
    for (const f of cross) {
      expect(f.classification).toBe('manual_review'); // مرز شرکت؛ D-C12-1 باز
      for (const p of f.source_records) {
        void p;
      }
    }
    // هیچ مقدارِ نمایشی از شرکتِ دیگر نباید در حزفِ بحرانیِ گزارشِ بین‌شرکتی بماند:
    const serialized = JSON.stringify(report.findings.filter((f) => f.crosses_company));
    expect(serialized).not.toContain(GTIN_VALID);
  });

  it('alias با مقدارِ یکسان در دو شرکت ⇒ هیچ یافتهٔ بین‌شرکتی (مرز شرکت — نوع شرکتی)', () => {
    const report = diagnoseIdentityIntegrity([
      row('pA', A, 'alias', 'زعفران', 'r-al-a', { subtype: 'brand_slang' }),
      row('pB', B, 'alias', 'زعفران', 'r-al-b', { subtype: 'brand_slang' }),
    ]);
    expect(report.findings.filter((f) => f.crosses_company)).toHaveLength(0);
  });

  it('domain_id متفاوت در یک شرکت ⇒ classification=manual_review (هرگز ALLOWED/قطعی)', () => {
    const report = diagnoseIdentityIntegrity([
      row('pA', A, 'alias', 'زعفران', 'r-d-a', { subtype: 'brand_slang', domain_id: 'domain-A-retail' }),
      row('pB', A, 'alias', 'زعفران', 'r-d-b', { subtype: 'brand_slang', domain_id: 'domain-A-wholesale' }),
    ]);
    const domainHits = report.findings.filter((f) => f.crosses_domain);
    expect(domainHits.length).toBeGreaterThanOrEqual(1);
    expect(domainHits.every((f) => f.classification === 'manual_review')).toBe(true);
    expect(domainHits.every((f) => f.limitations.includes('cross_domain_undecided_no_domain_registry_yet'))).toBe(true);
  });

  it('ردیف‌های بدون domain_id بدون خطا پردازش می‌شوند', () => {
    const report = diagnoseIdentityIntegrity([
      row('pA', A, 'alias', 'زعفران', 'r-nd-a', { subtype: 'latin' }),
      row('pA', A, 'alias', 'زعفران', 'r-nd-b', { subtype: 'latin' }),
    ]);
    expect(report.findings.every((f) => f.crosses_domain === false)).toBe(true);
  });
});

describe('CIDENT — provenance و قطعی‌بودن', () => {
  it('fixture سنتtetیک ⇒ همهٔ یافته‌ها synthetic و provenance_effective=SYNTHETIC_FIXTURE', () => {
    const report = diagnoseIdentityIntegrity([
      row('p1', A, 'barcode', UPC_VALID, 'r-s1', { subtype: 'gs1_upc' }),
      row('p2', A, 'barcode', EAN13_OF_UPC, 'r-s2', { subtype: 'gs1_ean13' }),
    ]);
    expect(report.provenance_effective).toBe('SYNTHETIC_FIXTURE');
    expect(report.findings.length).toBeGreaterThanOrEqual(1);
    expect(report.findings.every((f) => f.synthetic)).toBe(true);
    expect(report.limitations).toContain('diagnostics_only_no_enforcement');
    expect(report.diagnostics_only).toBe(true);
  });

  it('ترکیبِ provenance ⇒ هرگز «واقعی» اعلام نمی‌شود (UNKNOWN)', () => {
    const mixed = diagnoseIdentityIntegrity([
      row('p1', A, 'barcode', UPC_VALID, 'r-m1', { subtype: 'gs1_upc', provenance: 'SYNTHETIC_FIXTURE' }),
      row('p2', A, 'barcode', EAN13_OF_UPC, 'r-m2', { subtype: 'gs1_ean13', provenance: 'AUTHORIZED_REPLICA' }),
    ]);
    expect(mixed.provenance_effective).toBe('UNKNOWN');
  });

  it('همان ورودی ⇒ همان finding_idها (مستقل از زمانِ اجرا)', () => {
    const input = () => [
      row('p1', A, 'barcode', UPC_VALID, 'r-d1', { subtype: 'gs1_upc' }),
      row('p2', A, 'barcode', EAN13_OF_UPC, 'r-d2', { subtype: 'gs1_ean13' }),
      row('p3', A, 'alias', 'زعفران', 'r-d3', { subtype: 'brand_slang' }),
      row('p4', A, 'alias', 'زعفران', 'r-d4', { subtype: 'brand_slang' }),
    ];
    const r1 = diagnoseIdentityIntegrity(input());
    const r2 = diagnoseIdentityIntegrity(input());
    expect(r1.findings.map((f) => f.finding_id)).toEqual(r2.findings.map((f) => f.finding_id));
    expect(diagnosticContentFingerprint(r1)).toBe(diagnosticContentFingerprint(r2));
  });

  it('ردیفِ بدون company_id از گروه‌بندی کنار گذاشته می‌شود و در rows_invalid شمارش می‌شود', () => {
    const broken = row('p-x', A, 'alias', 'x', 'r-x') as DiagnosticRow;
    const report = diagnoseIdentityIntegrity([
      { ...broken, company_id: '' },
      row('p-y', A, 'alias', 'y', 'r-y', { subtype: 'latin' }),
    ]);
    expect(report.summary.rows_invalid).toBeGreaterThanOrEqual(1);
    expect(report.data_quality.some((d) => d.check === 'missing_company_id')).toBe(true);
  });
});
