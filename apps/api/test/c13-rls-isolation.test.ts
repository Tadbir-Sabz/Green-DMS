/**
 * TASK-PM-02-C13 — آزمونِ جداسازیِ RLS و مرزِ دامنه/شرکت.
 *
 * ⚠️ این تست‌ها **DB-free** هستند: هیچ اتصالِ پایگاه‌داده‌ای برقرار نمی‌شود.
 * چیزی که اثبات می‌شود، **قراردادِ افشا**ی موتور است: حتی اگر لایهٔ داده اشتباهاً
 * ردیفِ شرکتِ دیگر را بدهد، این ماژول آن را افشا نمی‌کند.
 *
 * این «جانشینِ RLS» نیست. RLS واقعی در لایهٔ پایگاه‌داده است و C13 آن را تغییر
 * نداده است. این لایهٔ دومِ دفاعی است: **دفاع در عمق**.
 */

import { describe, expect, it } from 'vitest';
import {
  assessCrossField,
  CROSS_COMPANY_RULE,
  redactValue,
  stableHash,
  type IdentityRow,
} from '../src/modules/master-data/experimental/cross-field-identity.candidate';
import {
  CROSS_FIELD_FIXTURE,
  COMPANY_A,
  COMPANY_B,
  COMPANY_C,
  DOMAIN_A1,
  DOMAIN_A2,
} from './fixtures/c13-cross-field-identities';

const HIDDEN = /^\u2022\u2022\u2022:[0-9a-f]{8}$/;

describe('C13 / 17 — برخوردِ درون‌شرکتی', () => {
  const a = assessCrossField(CROSS_FIELD_FIXTURE, { redactValues: false });

  it('برخوردهای درون‌شرکتی همه در یک شرکت‌اند', () => {
    const local = a.results.filter((r) => !r.scope.crosses_company && !r.scope.crosses_domain);
    expect(local.length).toBeGreaterThan(0);
    for (const r of local) {
      const companies = new Set(r.parties.map((p) => p.company_id));
      expect(companies.size).toBe(1);
      expect(r.scope.company_id).toBe([...companies][0]);
    }
  });

  it('در برخوردِ درون‌شرکتی، مقدارِ نمایشی قابلِ مشاهده است (کاربرِ همان شرکت)', () => {
    const local = a.results.filter((r) => !r.scope.crosses_company && r.decision === 'HARD_CONFLICT');
    expect(local.length).toBeGreaterThan(0);
    for (const r of local) {
      for (const p of r.parties) expect(p.display_value).not.toBeNull();
    }
  });
});

describe('C13 / 18 — شناسهٔ یکسان در دو شرکت', () => {
  const a = assessCrossField(CROSS_FIELD_FIXTURE, { redactValues: false });
  const cross = a.results.filter((r) => r.rule_id === 'C13-R-cross-company');

  it('وجود دارد و به‌طور پیش‌فرض ALLOWED است', () => {
    expect(cross.length).toBeGreaterThan(0);
    for (const r of cross) expect(r.decision).toBe('ALLOWED');
  });

  it('🔒 هیچ مقدارِ نمایشی در نتیجهٔ بین‌شرکتی باقی نمی‌ماند', () => {
    for (const r of cross) {
      for (const p of r.parties) {
        expect(p.display_value).toBeNull();
        expect(p.field_key).toBeNull();
        expect(p.comparison_key).toBeNull();
        expect(p.entity_id).toMatch(HIDDEN);
        expect(p.source_ref).toMatch(HIDDEN);
      }
    }
  });

  it('🔒 هر دو شرکت درگیر، پوشانده شده‌اند (ناظر هیچ‌کدام نیست)', () => {
    const r = cross[0];
    const companies = new Set(r.parties.map((p) => p.company_id));
    expect(companies.has(COMPANY_B)).toBe(true);
    expect(companies.has(COMPANY_C)).toBe(true);
    // شرکت‌ها **افشا می‌شوند** (برای این‌که مالک بداند کدام شرکت‌ها درگیرند)
    // ولی هیچ مقدارِ کالایی از آن‌ها بیرون نمی‌رود.
    for (const p of r.parties) expect(p.display_value).toBeNull();
  });

  it('🔒 شناسهٔ هش‌شده پایدار است (برای تطبیق بینِ اجراها) ولی برگشت‌پذیر نیست', () => {
    const r = cross[0];
    const again = assessCrossField(CROSS_FIELD_FIXTURE, { redactValues: false })
      .results.filter((x) => x.rule_id === 'C13-R-cross-company')[0];
    expect(r.parties.map((p) => p.entity_id)).toEqual(again.parties.map((p) => p.entity_id));
    // هش ≠ شناسهٔ اصلی
    for (const p of r.parties) expect(p.entity_id).not.toBe(p.source_ref);
  });

  it('🔒 بیرون‌دادنِ مقدارِ خام با تغییرِ گزینه‌ها ممکن نیست', () => {
    // حتی با redactValues:false و crossCompanyIsConflict:true
    const strict = assessCrossField(CROSS_FIELD_FIXTURE, {
      redactValues: false,
      crossCompanyIsConflict: true,
    });
    for (const r of strict.results.filter((x) => x.scope.crosses_company)) {
      for (const p of r.parties) expect(p.display_value).toBeNull();
    }
  });

  it('قاعدهٔ بین‌شرکتی صریحاً «مجاز» است، نه «تعارض»', () => {
    expect(CROSS_COMPANY_RULE.decision).toBe('ALLOWED');
    expect(CROSS_COMPANY_RULE.requires_owner_approval).toBe(true);
    expect(CROSS_COMPANY_RULE.rationale_fa).toContain('چندمستأجری');
  });
});

describe('C13 / 19 — دامنهٔ کسب‌وکار (درونِ یک شرکت)', () => {
  const a = assessCrossField(CROSS_FIELD_FIXTURE, { redactValues: false });
  const dom = a.results.filter((r) => r.rule_id === 'C13-R-cross-domain');

  it('بین‌دامنه با شرکتِ یکسان ⇒ MANUAL_REVIEW، نه ALLOWED', () => {
    expect(dom.length).toBeGreaterThan(0);
    for (const r of dom) {
      expect(r.decision).toBe('MANUAL_REVIEW');
      expect(r.scope.crosses_company).toBe(false);
      expect(r.scope.crosses_domain).toBe(true);
    }
  });

  it('هر دو دامنه در دسترسِ همان شرکت‌اند ⇒ مقدار قابلِ مشاهده است', () => {
    for (const r of dom) {
      for (const p of r.parties) {
        expect(p.company_id).toBe(COMPANY_A);
        expect(p.display_value).not.toBeNull();
      }
    }
  });

  it('دامنه‌های درگیر واقعاً متمایزند', () => {
    const partyDomains = new Set(dom.flatMap((r) => r.parties.map((p) => p.domain_id)));
    expect(partyDomains.has(DOMAIN_A1)).toBe(true);
    expect(partyDomains.has(DOMAIN_A2)).toBe(true);
    expect(partyDomains.size).toBeGreaterThanOrEqual(2);
  });

  it('domain_id غایب ⇒ به company_id پیش‌فرض می‌شود (بدونِ تفکیکِ جعلی)', () => {
    const rows: IdentityRow[] = [
      { entity_id: 'e1', company_id: COMPANY_A, field: 'code', display_value: 'X1', stored_normalized: 'X1', source_ref: 's1' },
      { entity_id: 'e2', company_id: COMPANY_A, field: 'code', display_value: 'X1', stored_normalized: 'X1', source_ref: 's2' },
    ];
    const r = assessCrossField(rows, { redactValues: false });
    // همان دامنه ⇒ نه بین‌دامنه، بلکه هم‌میدانیِ عادی
    expect(r.results.some((x) => x.rule_id === 'C13-R-cross-domain')).toBe(false);
    expect(r.results.some((x) => x.rule_id === 'C13-R-code-same')).toBe(true);
  });
});

describe('C13 / 20 — مالکیتِ متفاوتِ کالا و تلاشِ مقایسهٔ غیرمجاز', () => {
  it('دو کالای هم‌نام در شرکت‌های مختلف هرگز برخوردِ درون‌شرکتی نمی‌سازند', () => {
    const rows: IdentityRow[] = [
      { entity_id: 'A1', company_id: COMPANY_A, field: 'alias', display_value: 'same name', stored_normalized: 'same name', source_ref: 'a' },
      { entity_id: 'B1', company_id: COMPANY_B, field: 'alias', display_value: 'same name', stored_normalized: 'same name', source_ref: 'b' },
    ];
    const r = assessCrossField(rows, { redactValues: false });
    const hard = r.results.filter((x) => x.decision === 'HARD_CONFLICT');
    expect(hard).toEqual([]);
    const cross = r.results.filter((x) => x.rule_id === 'C13-R-cross-company');
    expect(cross.length).toBe(1);
    expect(cross[0].decision).toBe('ALLOWED');
  });

  it('🔒 درخواست برای دیدنِ مقدارِ شرکتِ دیگر هیچ مسیری ندارد', () => {
    // تنها راهِ گرفتنِ مقدار، `parties[].display_value` است و در مسیرِ بین‌شرکتی
    // همیشه null است. هیچ گزینه‌ای برای خاموش‌کردنِ این رفتار وجود ندارد.
    const rows: IdentityRow[] = [
      { entity_id: 'A1', company_id: COMPANY_A, field: 'barcode', display_value: 'SECRET123', stored_normalized: 'SECRET123', source_ref: 'a' },
      { entity_id: 'B1', company_id: COMPANY_B, field: 'barcode', display_value: 'SECRET123', stored_normalized: 'SECRET123', source_ref: 'b' },
    ];
    for (const opts of [{}, { redactValues: false }, { crossCompanyIsConflict: true, redactValues: false }]) {
      const r = assessCrossField(rows, opts);
      const json = JSON.stringify(r.results);
      expect(json).not.toContain('SECRET123');
    }
  });

  it('مقدارِ پوشانده‌شده در گزارشِ عمومی شکلِ درست دارد', () => {
    expect(redactValue('Barcode400111')).toContain('\u2022');
    expect(redactValue('Barcode400111')).not.toContain('arcode400');
    expect(redactValue('x')).toBe('\u2022');
  });

  it('هشِ شناسه برای تطبیق کافی است ولی بازسازیِ شناسه را ممکن نمی‌کند', () => {
    const h1 = stableHash(`${COMPANY_B}\u0000B-p01`);
    const h2 = stableHash(`${COMPANY_B}\u0000B-p01`);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{8}$/);
    expect(h1).not.toContain('B-p01');
  });
});

describe('C13 / 21 — نشتِ بین‌مستأجری: آزمونِ خصمانه', () => {
  it('با ۵۰ شرکتِ درهم‌تنیده هیچ نتیجه‌ای مقدارِ شرکتِ دیگر را لو نمی‌دهد', () => {
    const rows: IdentityRow[] = [];
    for (let i = 0; i < 50; i += 1) {
      rows.push({
        entity_id: `E${i}`,
        company_id: `co-${i}`,
        field: 'barcode',
        display_value: `LEAKTEST${i % 5}`,
        stored_normalized: `LEAKTEST${i % 5}`,
        source_ref: `ref-${i}`,
      });
    }
    const r = assessCrossField(rows, { redactValues: false });
    const json = JSON.stringify(r.results);
    // هیچ مقدارِ خامی از هیچ شرکتی نباید در خروجی باشد —
    // چون همهٔ برخوردها بین‌شرکتی‌اند
    for (let i = 0; i < 50; i += 1) {
      expect(json).not.toContain(`LEAKTEST${i % 5}`);
      expect(json).not.toContain(`ref-${i}`);
      expect(json).not.toContain(`E${i}"`);
    }
    // ولی برخوردها کشف شده‌اند
    expect(r.results.length).toBeGreaterThan(0);
    expect(r.summary.by_decision.ALLOWED).toBeGreaterThan(0);
  });

  it('آمیختهٔ درون‌شرکتی و بین‌شرکتی: فقط درون‌شرکتی مقدار نشان می‌دهد', () => {
    const rows: IdentityRow[] = [
      // درون‌شرکتی در A
      { entity_id: 'A1', company_id: COMPANY_A, field: 'alias', display_value: 'localdup', stored_normalized: 'localdup', source_ref: 'a1' },
      { entity_id: 'A2', company_id: COMPANY_A, field: 'alias', display_value: 'localdup', stored_normalized: 'localdup', source_ref: 'a2' },
      // بین‌شرکتی
      { entity_id: 'B1', company_id: COMPANY_B, field: 'alias', display_value: 'crossdup', stored_normalized: 'crossdup', source_ref: 'b1' },
      { entity_id: 'C1', company_id: COMPANY_C, field: 'alias', display_value: 'crossdup', stored_normalized: 'crossdup', source_ref: 'c1' },
    ];
    const r = assessCrossField(rows, { redactValues: false });
    const local = r.results.filter((x) => x.rule_id === 'C13-R-alias-same');
    const cross = r.results.filter((x) => x.rule_id === 'C13-R-cross-company');
    expect(local.length).toBe(1);
    expect(cross.length).toBe(1);
    // درون‌شرکتی: مقدار هست
    expect(local[0].parties.every((p) => p.display_value !== null)).toBe(true);
    // بین‌شرکتی: مقدار نیست
    expect(cross[0].parties.every((p) => p.display_value === null)).toBe(true);
    // و هیچ‌کدام به دیگری نشت نکرده
    expect(JSON.stringify(cross)).not.toContain('localdup');
  });

  it('پوشاندن، شناساییِ «کدام شرکت‌ها درگیرند» را از بین نمی‌برد', () => {
    const r = assessCrossField(CROSS_FIELD_FIXTURE, { redactValues: false });
    const cross = r.results.filter((x) => x.rule_id === 'C13-R-cross-company');
    for (const c of cross) {
      const companies = new Set(c.parties.map((p) => p.company_id));
      expect(companies.size).toBeGreaterThan(1);
    }
  });
});
