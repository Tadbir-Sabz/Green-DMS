/**
 * TASK-PM-02-C13XT — تست‌های شبیه‌سازیِ «سیاست‌هایِ آیندهٔ یکتایی» + ماتریسِ تصمیم.
 *
 * این شبیه‌سازی فقط **گزارش** می‌سازد؛ هیچ قیدی اعمال نمی‌شود. هیچ دادهٔ واقعی استفاده نمی‌شود.
 */
import { describe, it, expect } from 'vitest';
import {
  FUTURE_POLICIES,
  FUTURE_POLICY_IDS,
  simulateFuturePolicies,
  type CrossTypeRow,
} from '../src/modules/master-data/experimental/cross-type-collision.candidate';
import {
  CROSS_TYPE_FIXTURE,
  CROSS_TYPE_ROW,
  COMPANY_A,
  COMPANY_B,
  GTIN_VALID,
  GTIN_BAD_CHECK,
  UPC_VALID,
  EAN13_OF_UPC,
  GTIN8_VALID,
} from './fixtures/c13-cross-type-identities';
import {
  OPEN_DECISIONS,
  decisionById,
  isApproved,
} from '../src/modules/master-data/experimental/decision-matrix.candidate';

const NOW = () => new Date('2026-11-13T00:00:00.000Z');
const opts = { now: NOW };

function simulate(rows: readonly CrossTypeRow[], o: Parameters<typeof simulateFuturePolicies>[1] = {}) {
  return simulateFuturePolicies(rows, { ...opts, ...o });
}

function byPolicy(report: ReturnType<typeof simulate>, id: string) {
  return report.findings.filter((f) => f.policy_id === id);
}

const MINIMAL = (over: Partial<CrossTypeRow> & Pick<CrossTypeRow, 'entity_id' | 'identity_type' | 'display_value' | 'source_ref'>): CrossTypeRow => ({
  entity_type: 'product',
  company_id: COMPANY_A,
  subtype: null,
  category_id: null,
  family_id: null,
  stored_normalized: over.display_value,
  ...over,
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13XT / POL-۰ — قراردادِ سیاست‌ها', () => {
  it('دقیقاً ۶ سیاستِ آینده تعریف شده است', () => {
    expect(FUTURE_POLICIES).toHaveLength(6);
    expect(FUTURE_POLICY_IDS).toEqual([
      'POL-CODE-CI-01',
      'POL-ALIAS-COMPANY-01',
      'POL-BARCODE-XKIND-01',
      'POL-UPC-EAN-PAD-01',
      'POL-GS1-CHECKDIGIT-01',
      'POL-PACKAGING-CANON-01',
    ]);
  });

  it('هر سیاست ارجاع به تصمیمِ مالک دارد', () => {
    for (const p of FUTURE_POLICIES) {
      expect(p.decision_ref.length).toBeGreaterThan(3);
      expect(p.title_fa.length).toBeGreaterThan(20);
      expect(p.description_fa.length).toBeGreaterThan(20);
      expect(p.rationale_fa.length).toBeGreaterThan(10);
    }
  });

  it('هیچ یافتهٔ سیاستی would_violate=false یا requires_owner_approval=false ندارد', () => {
    const report = simulate(CROSS_TYPE_FIXTURE);
    for (const f of report.findings) {
      expect(f.would_violate).toBe(true);
      expect(f.requires_owner_approval).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13XT / POL-۱ — POL-CODE-CI-01 (یکتاییِ نامحسوسِ کد، D-C11-3)', () => {
  it('SKU-9 و sku-9 دو کالای متمایز را زیرِ قیدِ آتی علامت می‌زند', () => {
    const report = simulate(CROSS_TYPE_FIXTURE);
    const hits = byPolicy(report, 'POL-CODE-CI-01');
    expect(hits.length).toBeGreaterThanOrEqual(1);
    const hit = hits.find((f) => f.space_key === 'sku-9')!;
    expect(hit.decision_ref).toBe('D-C11-3');
    expect(hit.parties.length).toBe(2);
  });

  it('همان کالا با دو نوشتارِ کد علامت نمی‌خورد (موجودیتِ یکسان)', () => {
    const rows: CrossTypeRow[] = [
      MINIMAL({ entity_id: 'SAME', identity_type: 'product_code', display_value: 'SKU-9', source_ref: 'same-1' }),
      MINIMAL({ entity_id: 'SAME', identity_type: 'product_code', display_value: 'sku-9', source_ref: 'same-2' }),
    ];
    const hits = byPolicy(simulate(rows), 'POL-CODE-CI-01');
    expect(hits).toHaveLength(0);
  });

  it('کدِ یکسان در دو شرکت نقضِ سیاست نیست (دامنهٔ شرکت)', () => {
    const rows: CrossTypeRow[] = [
      MINIMAL({ entity_id: 'A1', identity_type: 'product_code', display_value: 'X-1', source_ref: 'a1', company_id: COMPANY_A }),
      MINIMAL({ entity_id: 'B1', identity_type: 'product_code', display_value: 'x-1', source_ref: 'b1', company_id: COMPANY_B }),
    ];
    const hits = byPolicy(simulate(rows), 'POL-CODE-CI-01');
    expect(hits).toHaveLength(0);
  });

  it('کدهای واقعاً متمایز علامت نمی‌خورند', () => {
    const rows: CrossTypeRow[] = [
      MINIMAL({ entity_id: 'A1', identity_type: 'product_code', display_value: 'ALPHA-1', source_ref: 'a1' }),
      MINIMAL({ entity_id: 'A2', identity_type: 'product_code', display_value: 'BETA-1', source_ref: 'a2' }),
    ];
    expect(byPolicy(simulate(rows), 'POL-CODE-CI-01')).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13XT / POL-۲ — POL-ALIAS-COMPANY-01 (alias_norm شرکتی، D-C12-3)', () => {
  it('alias شرکتی برای دو کالای متمایز علامت می‌خورد', () => {
    const hits = byPolicy(simulate(CROSS_TYPE_FIXTURE), 'POL-ALIAS-COMPANY-01');
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].decision_ref).toBe('D-C12-3');
  });

  it('aliasهای همان کالا علامت نمی‌خورند', () => {
    const hits = byPolicy(simulate(CROSS_TYPE_FIXTURE), 'POL-ALIAS-COMPANY-01');
    for (const h of hits) {
      const buckets = new Set(h.parties.map((p) => p.entity_id));
      expect(buckets.size).toBeGreaterThan(1);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13XT / POL-۳ — POL-BARCODE-XKIND-01 (فضای یکپارچهٔ دامنه‌محور، D-C13X-1)', () => {
  it('UPC و EAN-13 هم‌ارزش (kindهای متفاوت) زیرِ کلاس‌های مختلف علامت می‌خورند', () => {
    const hits = byPolicy(simulate(CROSS_TYPE_FIXTURE), 'POL-BARCODE-XKIND-01');
    expect(hits.length).toBeGreaterThanOrEqual(1);
    const kinds = hits.flatMap((h) => h.parties.map((p) => p.subtype));
    expect(kinds).toContain('gs1_upc');
    expect(kinds).toContain('gs1_ean13');
    expect(hits[0].decision_ref).toBe('D-C13X-1');
  });

  it('دو gs1 هم‌kind تکراری زیرِ XKIND علامت نمی‌خورند (پوششِ قاعدهٔ هم‌نوعی)', () => {
    const rows: CrossTypeRow[] = [
      MINIMAL({ entity_id: 'G1', identity_type: 'barcode', display_value: GTIN_VALID, source_ref: 'g1', subtype: 'gs1_ean13' }),
      MINIMAL({ entity_id: 'G2', identity_type: 'barcode', display_value: GTIN_VALID, source_ref: 'g2', subtype: 'gs1_ean13' }),
    ];
    const hits = byPolicy(simulate(rows), 'POL-BARCODE-XKIND-01');
    expect(hits).toHaveLength(0);
  });

  it('internal شرکتی در دو شرکت علامت نمی‌خورد (دامنهٔ شرکتی از هم جدا است)', () => {
    const rows: CrossTypeRow[] = [
      MINIMAL({ entity_id: 'I1', identity_type: 'barcode', display_value: '777555', source_ref: 'i1', subtype: 'internal', company_id: COMPANY_A }),
      MINIMAL({ entity_id: 'I2', identity_type: 'barcode', display_value: '777555', source_ref: 'i2', subtype: 'internal', company_id: COMPANY_B }),
    ];
    expect(byPolicy(simulate(rows), 'POL-BARCODE-XKIND-01')).toHaveLength(0);
  });

  it('gs1 در یک شرکت و internal هم‌مقدار در همان شرکت علامت می‌خورد (کورِ قید)', () => {
    const rows: CrossTypeRow[] = [
      MINIMAL({ entity_id: 'G1', identity_type: 'barcode', display_value: GTIN8_VALID, source_ref: 'g1', subtype: 'gs1_ean8' }),
      MINIMAL({ entity_id: 'I1', identity_type: 'barcode', display_value: GTIN8_VALID, source_ref: 'i1', subtype: 'internal' }),
    ];
    // gs1 دامنهٔ جهانی دارد ⇒ در پارتیشنِ جهانی زوج می‌شوند؛ internal در پارتیشنِ B تنها می‌ماند ولی global کافی است
    const hits = byPolicy(simulate(rows), 'POL-BARCODE-XKIND-01');
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });

  it('بارکدِ بسته‌بندی در برابرِ gs1 در کلاس‌هایِ متفاوت علامت می‌خورد', () => {
    const rows: CrossTypeRow[] = [
      MINIMAL({ entity_id: 'P1', identity_type: 'packaging_barcode', display_value: GTIN_VALID, source_ref: 'p1' }),
      MINIMAL({ entity_id: 'G1', identity_type: 'barcode', display_value: GTIN_VALID, source_ref: 'g1', subtype: 'gs1_ean13' }),
    ];
    const hits = byPolicy(simulate(rows), 'POL-BARCODE-XKIND-01');
    expect(hits.length).toBeGreaterThanOrEqual(1);
    const classes = hits[0].parties.map((p) => p.subtype ?? 'packaging');
    expect(classes).toContain('packaging');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13XT / POL-۴ — POL-UPC-EAN-PAD-01 (هم‌ارزیِ UPC↔EAN، D-C13X-2)', () => {
  it('UPC و EAN-13 هم‌ارزش برای دو کالای متمایز علامت می‌خورد', () => {
    const rows: CrossTypeRow[] = [
      MINIMAL({ entity_id: 'U1', identity_type: 'barcode', display_value: UPC_VALID, source_ref: 'u1', subtype: 'gs1_upc' }),
      MINIMAL({ entity_id: 'E1', identity_type: 'barcode', display_value: EAN13_OF_UPC, source_ref: 'e1', subtype: 'gs1_ean13' }),
    ];
    const hits = byPolicy(simulate(rows), 'POL-UPC-EAN-PAD-01');
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].decision_ref).toBe('D-C13X-2');
    expect(hits[0].space_key).toBe(EAN13_OF_UPC);
  });

  it('دو UPC متفاوت علامت نمی‌خورند', () => {
    const rows: CrossTypeRow[] = [
      MINIMAL({ entity_id: 'U1', identity_type: 'barcode', display_value: '012345678905', source_ref: 'u1', subtype: 'gs1_upc' }),
      MINIMAL({ entity_id: 'U2', identity_type: 'barcode', display_value: '036000291452', source_ref: 'u2', subtype: 'gs1_upc' }),
    ];
    expect(byPolicy(simulate(rows), 'POL-UPC-EAN-PAD-01')).toHaveLength(0);
  });

  it('همان کالا با دو kind علامت نمی‌خورد (موجودیتِ یکسان)', () => {
    const rows: CrossTypeRow[] = [
      MINIMAL({ entity_id: 'SAME', identity_type: 'barcode', display_value: UPC_VALID, source_ref: 'u1', subtype: 'gs1_upc' }),
      MINIMAL({ entity_id: 'SAME', identity_type: 'barcode', display_value: EAN13_OF_UPC, source_ref: 'e1', subtype: 'gs1_ean13' }),
    ];
    expect(byPolicy(simulate(rows), 'POL-UPC-EAN-PAD-01')).toHaveLength(0);
  });

  it('internal زیرِ این سیاست علامت نمی‌خورد (رزروِ gs1 است)', () => {
    const rows: CrossTypeRow[] = [
      MINIMAL({ entity_id: 'I1', identity_type: 'barcode', display_value: '012345678901', source_ref: 'i1', subtype: 'internal' }),
      MINIMAL({ entity_id: 'E1', identity_type: 'barcode', display_value: '0012345678901', source_ref: 'e1', subtype: 'gs1_ean13' }),
    ];
    // این دو پس از تاکردن یکی می‌شوند ولی طرفِ internal رزروِ gs1 نقض می‌کند ⇒ باید دیده شود (به‌عنوان UPC/EAN معادل)
    const hits = byPolicy(simulate(rows), 'POL-UPC-EAN-PAD-01');
    expect(hits.length).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13XT / POL-۵ — POL-GS1-CHECKDIGIT-01 (رقمِ کنترلی GTIN، D-C11-1)', () => {
  it('رقمِ کنترلیِ غلط علامت می‌خورد', () => {
    const hits = byPolicy(simulate(CROSS_TYPE_FIXTURE), 'POL-GS1-CHECKDIGIT-01');
    expect(hits.some((h) => h.check === 'gs1_check_digit_invalid')).toBe(true);
    expect(hits.every((h) => h.decision_ref === 'D-C11-1')).toBe(true);
  });

  it('طولِ نامعتبر علامت می‌خورد', () => {
    const hits = byPolicy(simulate(CROSS_TYPE_FIXTURE), 'POL-GS1-CHECKDIGIT-01');
    expect(hits.some((h) => h.check === 'gs1_length_invalid')).toBe(true);
  });

  it('GTIN معتبر هیچ یافته‌ای نمی‌سازد — false-positive guard', () => {
    const rows: CrossTypeRow[] = [
      MINIMAL({ entity_id: 'G1', identity_type: 'barcode', display_value: GTIN_VALID, source_ref: 'g1', subtype: 'gs1_ean13' }),
      MINIMAL({ entity_id: 'G2', identity_type: 'barcode', display_value: '12345670', source_ref: 'g2', subtype: 'gs1_ean8' }),
      MINIMAL({ entity_id: 'G3', identity_type: 'barcode', display_value: '12345678901231', source_ref: 'g3', subtype: 'gs1_itf14' }),
    ];
    expect(byPolicy(simulate(rows), 'POL-GS1-CHECKDIGIT-01')).toHaveLength(0);
  });

  it('internal با رقم‌های یتیم علامت نمی‌خورد (فقط gs1)', () => {
    const rows: CrossTypeRow[] = [
      MINIMAL({ entity_id: 'I1', identity_type: 'barcode', display_value: GTIN_BAD_CHECK, source_ref: 'i1', subtype: 'internal' }),
    ];
    expect(byPolicy(simulate(rows), 'POL-GS1-CHECKDIGIT-01')).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13XT / POL-۶ — POL-PACKAGING-CANON-01 (سازگاریِ دو مخزن، D-C13X-3)', () => {
  it('بارکدِ بسته‌بندیِ بدونِ نسخهٔ کانونی علامت می‌خورد', () => {
    const hits = byPolicy(simulate(CROSS_TYPE_FIXTURE), 'POL-PACKAGING-CANON-01');
    const missing = hits.filter((h) => h.check === 'missing_canonical_copy');
    expect(missing.length).toBeGreaterThanOrEqual(3); // 910001 + 880001×۲
    expect(missing.every((h) => h.decision_ref === 'D-C13X-3')).toBe(true);
  });

  it('بارکدِ بسته‌بندی گره‌خورده به کالای دیگر علامت می‌خورد', () => {
    const hits = byPolicy(simulate(CROSS_TYPE_FIXTURE), 'POL-PACKAGING-CANON-01');
    expect(hits.some((h) => h.check === 'conflicting_canonical_copy')).toBe(true);
  });

  it('هم‌سوییِ کامل ⇒ هیچ یافته‌ای نیست', () => {
    const rows: CrossTypeRow[] = [
      MINIMAL({ entity_id: 'P1', identity_type: 'packaging_barcode', display_value: '7770002', source_ref: 'p1' }),
      MINIMAL({ entity_id: 'P1', identity_type: 'barcode', display_value: '7770002', source_ref: 'b1', subtype: 'internal' }),
    ];
    expect(byPolicy(simulate(rows), 'POL-PACKAGING-CANON-01')).toHaveLength(0);
  });

  it('GTIN معتبرِ بسته‌بندی گره‌خورده به gs1 در شرکتِ دیگر ⇒ conflicting با scope جهانی', () => {
    const rows: CrossTypeRow[] = [
      MINIMAL({ entity_id: 'P1', identity_type: 'packaging_barcode', display_value: GTIN_VALID, source_ref: 'p1', company_id: COMPANY_A }),
      MINIMAL({ entity_id: 'G1', identity_type: 'barcode', display_value: GTIN_VALID, source_ref: 'g1', subtype: 'gs1_ean13', company_id: COMPANY_B }),
    ];
    const hits = byPolicy(simulate(rows), 'POL-PACKAGING-CANON-01');
    const conflicting = hits.filter((h) => h.check === 'conflicting_canonical_copy');
    expect(conflicting.length).toBeGreaterThanOrEqual(1);
    expect(conflicting.some((h) => h.scope_company_id === '*')).toBe(true);
    for (const h of conflicting) {
      for (const p of h.parties) {
        if (h.scope_company_id === '*') expect(p.display_value).toBeNull();
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13XT / POL-۷ — گزارشِ تجمیعی و قطعیت', () => {
  it('گزارش همهٔ ۶ سیاست را با شمارش می‌آورد', () => {
    const report = simulate(CROSS_TYPE_FIXTURE);
    expect(report.policies).toHaveLength(6);
    for (const p of report.policies) {
      expect(p.findings).toBeGreaterThanOrEqual(0);
      expect(p.would_violate).toBe(p.findings > 0);
    }
    const total = report.policies.reduce((acc, p) => acc + p.findings, 0);
    expect(total).toBe(report.findings.length);
  });

  it('شبیه‌سازی قطعی است (دو اجرا، اثرِ انگشتِ یکسان)', () => {
    const r1 = simulate(CROSS_TYPE_FIXTURE);
    const r2 = simulate(CROSS_TYPE_FIXTURE);
    expect(r1.content_fingerprint).toBe(r2.content_fingerprint);
    expect(r1.findings.map((f) => f.collision_id)).toEqual(r2.findings.map((f) => f.collision_id));
  });

  it('مرتب‌سازیِ نهایی روی (policy_id, collision_id) است', () => {
    const report = simulate(CROSS_TYPE_FIXTURE);
    const keys = report.findings.map((f) => `${f.policy_id} ${f.collision_id}`);
    expect([...keys].sort()).toEqual(keys);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13XT / POL-۸ — ماتریسِ تصمیم D-C13X-1..3', () => {
  it('سه تصمیمِ بازِ جدید در ماتریس ثبت شده‌اند', () => {
    for (const id of ['D-C13X-1', 'D-C13X-2', 'D-C13X-3']) {
      const d = decisionById(id);
      expect(d, id).toBeDefined();
      expect(d!.options.length).toBeGreaterThanOrEqual(2);
      expect(d!.requires_owner_approval).toBe(true);
    }
  });

  it('🔒 هیچ‌یک از D-C13X تصویب نشده است', () => {
    for (const id of ['D-C13X-1', 'D-C13X-2', 'D-C13X-3']) {
      expect(isApproved(id)).toBe(false);
    }
  });

  it('recommended_default هر سه در فهرستِ گزینه‌هاست', () => {
    for (const id of ['D-C13X-1', 'D-C13X-2', 'D-C13X-3']) {
      const d = decisionById(id)!;
      expect(d.options.map((o) => o.id)).toContain(d.recommended_default);
    }
  });

  it('ارجاع‌های POL-* به decision_refهای واقعیِ ماتریس وصل‌اند', () => {
    for (const p of FUTURE_POLICIES) {
      expect(decisionById(p.decision_ref), `${p.policy_id} → ${p.decision_ref}`).toBeDefined();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13XT / POL-۹ — قطعیّتِ سیاست‌ها با جابه‌جاییِ ورودی', () => {
  it('جابه‌جاییِ ردیف‌های fixture اثرِ انگشتِ گزارش را عوض نمی‌کند', () => {
    const shuffled = [...CROSS_TYPE_FIXTURE];
    let s = 42 >>> 0;
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      const j = s % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const r1 = simulate(CROSS_TYPE_FIXTURE);
    const r2 = simulate(shuffled);
    expect(r1.content_fingerprint).toBe(r2.content_fingerprint);
    expect(r1.findings.map((f) => f.collision_id)).toEqual(r2.findings.map((f) => f.collision_id));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13XT / POL-۱۰ — گاردِ ایزولاسیون (کدِ آزمایشی نباید به تولید راه یابد)', () => {
  it('ماژول‌های c13xt فقط توسطِ ماژول‌های آزمایشی و تست‌ها import می‌شوند', async () => {
    const { execSync } = await import('node:child_process');
    const cmd =
      "grep -rEl \"from '[^']*(cross-type-collision|decision-matrix)\\.candidate'\" src test --include=*.ts || true";
    let out = '';
    try {
      out = execSync(cmd, { cwd: process.cwd(), encoding: 'utf8' });
    } catch {
      out = '';
    }
    const files = out
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean)
      .filter(
        (f) =>
          !/(cross-type-collision|decision-matrix|shadow-evidence|shadow-evidence-cli|shadow-db|shadow-assessment-pipeline|shadow-db-cli|identity-integrity-diagnostics|multilingual-normalize)\.candidate\.ts$/.test(
            f,
          ),
      );
    const forbidden = files.filter(
      (f) => !/^test\/(c13-.*\.test\.ts|fixtures\/c13-.*\.ts)$/.test(f),
    );
    expect(forbidden, `importِ غیرمجاز از کدِ آزمایشیِ C13: ${forbidden.join(', ')}`).toEqual([]);
  });

  it('هیچ فایلِ تولیدی به experimental/ وابسته نیست', async () => {
    const { execSync } = await import('node:child_process');
    const cmd = "grep -rEl \"from '[^']*experimental/\" src --include=*.ts || true";
    let out = '';
    try {
      out = execSync(cmd, { cwd: process.cwd(), encoding: 'utf8' });
    } catch {
      out = '';
    }
    const files = out
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean)
      .filter((f) => !f.startsWith('src/modules/master-data/experimental/'));
    expect(files, `فایلِ تولیدی که experimental را import می‌کند: ${files.join(', ')}`).toEqual([]);
  });
});
