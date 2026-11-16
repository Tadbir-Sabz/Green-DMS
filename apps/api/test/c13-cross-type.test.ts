/**
 * TASK-PM-02-C13XT — تست‌های اصلیِ تشخیصِ برخوردِ بین‌نوعیِ هویت.
 *
 * این تست‌ها **DB ندارند** و هیچ دادهٔ واقعی استفاده نمی‌کنند.
 */
import { describe, it, expect } from 'vitest';
import {
  IDENTITY_TYPES,
  IDENTITY_TYPE_REGISTRY,
  CROSS_TYPE_RULES,
  CROSS_TYPE_RULE_MAP,
  CROSS_TYPE_CONTRACT_VERSION,
  UNDERLYING_COMPARISON_VERSION,
  UNDERLYING_NORMALIZATION_VERSION,
  allCrossTypeRulePairs,
  assessCrossType,
  analyzeScanResolution,
  simulateFuturePolicies,
  crossTypePairKey,
  crossTypeRuleFor,
  gs1CheckDigitOk,
  gs1Space,
  exactSpace,
  effectiveScope,
  isGs1Kind,
  foldUpcToEan,
  type CrossTypeRow,
  type CrossTypeFinding,
} from '../src/modules/master-data/experimental/cross-type-collision.candidate';
import {
  COMPANY_A,
  COMPANY_B,
  COMPANY_C,
  CAT_1,
  CAT_2,
  CROSS_TYPE_FIXTURE,
  CROSS_TYPE_ROW,
  GTIN_VALID,
  GTIN_BAD_CHECK,
  GTIN8_VALID,
  GTIN14_VALID,
  UPC_VALID,
  EAN13_OF_UPC,
  generateSyntheticCrossTypeRows,
} from './fixtures/c13-cross-type-identities';

const NOW = () => new Date('2026-11-13T00:00:00.000Z');
const opts = { now: NOW };

function assess(rows: readonly CrossTypeRow[], o: Parameters<typeof assessCrossType>[1] = {}) {
  return assessCrossType(rows, { ...opts, ...o });
}

function byRule(assessment: ReturnType<typeof assess>, ruleId: string): CrossTypeFinding[] {
  return assessment.findings.filter((f) => f.rule_id === ruleId);
}

function shuffled<T>(arr: readonly T[], seed = 99): T[] {
  const a = [...arr];
  let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i -= 1) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ═══════════════════════════════════════════════════════════════════════════
describe('C13XT / ۱ — ثباتِ نوع‌های هویت (registry)', () => {
  it('دقیقاً ۹ نوعِ هویتِ ثبت‌شده دارد', () => {
    expect(IDENTITY_TYPES).toHaveLength(9);
    expect(Object.keys(IDENTITY_TYPE_REGISTRY).sort()).toEqual([...IDENTITY_TYPES].sort());
  });

  it('هر نوع جدول/ستون/پروفایلِ مشخص دارد', () => {
    for (const t of IDENTITY_TYPES) {
      const d = IDENTITY_TYPE_REGISTRY[t];
      expect(d.table.length).toBeGreaterThan(3);
      expect(d.column.length).toBeGreaterThan(0);
      expect(d.uniqueness_today_fa.length).toBeGreaterThan(10);
    }
  });

  it('نقشهٔ نوع→موجودیت درست است (بسته‌بندی نمایندهٔ کالای مالک است)', () => {
    expect(IDENTITY_TYPE_REGISTRY.product_code.entity_type).toBe('product');
    expect(IDENTITY_TYPE_REGISTRY.family_code.entity_type).toBe('product_family');
    expect(IDENTITY_TYPE_REGISTRY.category_code.entity_type).toBe('product_category');
    expect(IDENTITY_TYPE_REGISTRY.packaging_barcode.entity_type).toBe('product');
    expect(IDENTITY_TYPE_REGISTRY.packaging_barcode.table).toBe('product_packaging');
  });

  it('دامنهٔ اثرِ بارکد به subtype وابسته است', () => {
    expect(effectiveScope({ identity_type: 'barcode', subtype: 'gs1_ean13' })).toBe('global');
    expect(effectiveScope({ identity_type: 'barcode', subtype: 'gs1_upc' })).toBe('global');
    expect(effectiveScope({ identity_type: 'barcode', subtype: 'internal' })).toBe('company');
    expect(effectiveScope({ identity_type: 'barcode', subtype: 'other' })).toBe('company');
    expect(effectiveScope({ identity_type: 'barcode', subtype: 'GS1_EAN13' })).toBe('global');
    expect(effectiveScope({ identity_type: 'barcode', subtype: null })).toBe('company');
    expect(effectiveScope({ identity_type: 'packaging_barcode', subtype: null })).toBe('global');
    expect(effectiveScope({ identity_type: 'product_code', subtype: null })).toBe('company');
  });

  it('isGs1Kind دامنهٔ نوع‌ها را کامل می‌شناسد', () => {
    for (const k of ['gs1_ean13', 'gs1_ean8', 'gs1_upc', 'gs1_itf14']) expect(isGs1Kind(k)).toBe(true);
    expect(isGs1Kind('internal')).toBe(false);
    expect(isGs1Kind('')).toBe(false);
    expect(isGs1Kind(null)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13XT / ۲ — فضاهای مقایسه', () => {
  it('gs1Space تاکردنِ UPC→EAN اعمال می‌کند', () => {
    const r = gs1Space(UPC_VALID);
    expect(r.ok).toBe(true);
    expect(r.folded).toBe(true);
    expect(r.key).toBe(EAN13_OF_UPC);
  });

  it('gs1Space ارقامِ فارسی را تا می‌کند و حروف را رد می‌کند', () => {
    expect(gs1Space('۴۰۰۶۳۸۱۳۳۳۹۳۱').ok).toBe(true);
    expect(gs1Space('ABC123').ok).toBe(false);
    expect(gs1Space('').ok).toBe(false);
  });

  it('gs1Space حذفِ جداکننده‌ها انجام می‌دهد ولی طول را اعتبارسنجی نمی‌کند', () => {
    expect(gs1Space('400-638 1333931').key).toBe(GTIN_VALID);
    expect(gs1Space('12345').ok).toBe(true); // طولِ غلط — خطای data-quality، نه شکستِ فضا
  });

  it('foldUpcToEan فقط ۱۲ رقمی را تا می‌کند', () => {
    expect(foldUpcToEan(UPC_VALID)).toBe(EAN13_OF_UPC);
    expect(foldUpcToEan('12345678')).toBe('12345678');
    expect(foldUpcToEan('12345678901234')).toBe('12345678901234');
  });

  it('exactSpace فقط NFC و trim می‌کند', () => {
    expect(exactSpace('  size:XL|color:red  ').key).toBe('size:XL|color:red');
    expect(exactSpace('  ').ok).toBe(false);
    expect(exactSpace('a\u0000b').ok).toBe(false);
  });

  it('gs1CheckDigitOk برای نمونه‌های شناخته‌شده', () => {
    expect(gs1CheckDigitOk(GTIN_VALID)).toBe(true);
    expect(gs1CheckDigitOk(GTIN8_VALID)).toBe(true);
    expect(gs1CheckDigitOk(GTIN14_VALID)).toBe(true);
    expect(gs1CheckDigitOk(UPC_VALID)).toBe(true);
    expect(gs1CheckDigitOk(EAN13_OF_UPC)).toBe(true);
    expect(gs1CheckDigitOk(GTIN_BAD_CHECK)).toBe(false);
    expect(gs1CheckDigitOk('123')).toBe(false);
    expect(gs1CheckDigitOk('abcdefghijklm')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13XT / ۳ — پوششِ صددرصدیِ جدولِ قواعد', () => {
  it('همهٔ ۴۵ جفت (۹ هم‌نوعی + ۳۶ بین‌نوعی) قاعده دارند', () => {
    expect(CROSS_TYPE_RULES).toHaveLength(45);
    expect(allCrossTypeRulePairs()).toHaveLength(45);
    for (let i = 0; i < IDENTITY_TYPES.length; i += 1) {
      for (let j = i; j < IDENTITY_TYPES.length; j += 1) {
        const a = IDENTITY_TYPES[i];
        const b = IDENTITY_TYPES[j];
        expect(crossTypeRuleFor(a, b), `قاعده برای ${a}~${b}`).toBeDefined();
        expect(crossTypeRuleFor(b, a), `ترتیبِ معکوس ${b}~${a}`).toBeDefined();
      }
    }
  });

  it('شناسه‌های قاعده یکتا هستند', () => {
    const ids = CROSS_TYPE_RULES.map((r) => r.rule_id);
    expect(new Set(ids).size).toBe(ids.length);
    const pairs = CROSS_TYPE_RULES.map((r) => crossTypePairKey(r.types[0], r.types[1]));
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it('هر قاعده فضای معتبر، تصمیم معتبر و توضیحِ کافی دارد', () => {
    for (const r of CROSS_TYPE_RULES) {
      expect(['field', 'scan', 'scan_pad', 'alnum', 'text', 'gs1', 'exact']).toContain(r.space);
      expect(['HARD_CONFLICT', 'SOFT_CONFLICT', 'MANUAL_REVIEW', 'ALLOWED', 'NOT_COMPARABLE']).toContain(r.decision);
      expect(['hard', 'soft', 'review', 'none']).toContain(r.severity);
      expect(r.explanation_fa.length).toBeGreaterThan(20);
      expect(r.recommended_resolution_fa.length).toBeGreaterThan(5);
      expect(r.rationale_fa.length).toBeGreaterThan(10);
      expect(r.ambiguity).toBeGreaterThanOrEqual(0);
      expect(r.ambiguity).toBeLessThanOrEqual(1);
    }
  });

  it('NOT_COMPARABLEها شدت none و عدمِ نیاز به تأییدِ مالک دارند', () => {
    for (const r of CROSS_TYPE_RULES.filter((x) => x.decision === 'NOT_COMPARABLE')) {
      expect(r.severity).toBe('none');
      expect(r.requires_owner_approval).toBe(false);
    }
  });

  it('قاعده‌های HARD همگی به تصمیمِ انسانی ارجاع می‌دهند (هیچ اصلاحِ خودکار)', () => {
    for (const r of CROSS_TYPE_RULES.filter((x) => x.decision === 'HARD_CONFLICT')) {
      expect(r.requires_owner_approval).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13XT / ۴ — یافته‌های پایه روی fixtureِ مستند', () => {
  const a = assess(CROSS_TYPE_FIXTURE);

  it('SKU-9 و sku-9 بین‌کالاها برخوردِ HARD می‌سازند و در قیدِ DB دیده نمی‌شوند', () => {
    const hits = byRule(a, 'C13X-R-pc-pc');
    expect(hits.length).toBeGreaterThanOrEqual(1);
    const h = hits.find((f) => f.space_key === 'sku-9');
    expect(h).toBeDefined();
    expect(h!.decision).toBe('HARD_CONFLICT');
    expect(h!.visible_under_current_constraints).toBe('no');
    expect(h!.future_policy_ids).toContain('POL-CODE-CI-01');
  });

  it('یافتهٔ pc-pc بین‌دسته‌ها across_categories = true است', () => {
    const h = byRule(a, 'C13X-R-pc-pc').find((f) => f.space_key === 'sku-9')!;
    expect(h.across_categories).toBe(true);
  });

  it('alias شرکتی برای دو کالای متمایز ⇒ HARD با ارجاع به سیاستِ آینده', () => {
    const hits = byRule(a, 'C13X-R-al-al');
    const hard = hits.filter((f) => f.decision === 'HARD_CONFLICT');
    expect(hard.length).toBeGreaterThanOrEqual(1);
    expect(hard.every((f) => f.future_policy_ids.includes('POL-ALIAS-COMPANY-01'))).toBe(true);
  });

  it('همان کالا با alias تکراری ⇒ ALLOWED نه تعارض', () => {
    const hits = byRule(a, 'C13X-R-al-al');
    const sameEntity = hits.filter((f) => f.parties.every((p) => p.source_ref.startsWith('XT-p05')));
    expect(sameEntity.length).toBe(1);
    expect(sameEntity[0].decision).toBe('ALLOWED');
    expect(sameEntity[0].severity).toBe('none');
  });

  it('alias «400 111» با barcode internal «400111» ⇒ HARD (اصلِ CF-10)', () => {
    const hits = byRule(a, 'C13X-R-al-bc').filter((f) => f.space_key === '400111');
    expect(hits.length).toBe(1);
    expect(hits[0].decision).toBe('HARD_CONFLICT');
  });

  it('alias «400 111» با بارکدِ بسته‌بندی «400111» ⇒ HARD (مخزنِ قدیمی)', () => {
    expect(byRule(a, 'C13X-R-al-pb').some((f) => f.space_key === '400111')).toBe(true);
  });

  it('کدِ کالا = بارکدِ کالای دیگر ⇒ HARD', () => {
    expect(byRule(a, 'C13X-R-pc-bc').some((f) => f.space_key === 'qr9')).toBe(true);
  });

  it('همان کالا: کد = بارکدِ خودش ⇒ ALLOWED', () => {
    const hits = byRule(a, 'C13X-R-pc-bc').filter((f) => f.space_key === '7770001');
    expect(hits.length).toBe(1);
    expect(hits[0].decision).toBe('ALLOWED');
  });

  it('کدِ کالا = بارکدِ بسته‌بندیِ کالای دیگر ⇒ HARD بین‌بازنمایی', () => {
    expect(byRule(a, 'C13X-R-pc-pb').some((f) => f.space_key === '33007')).toBe(true);
  });

  it('همان کالا: بارکدِ کانونی = بارکدِ بسته‌بندیِ خودش ⇒ ALLOWED با representation provenance', () => {
    const hits = byRule(a, 'C13X-R-bc-pb').filter((f) => f.space_key === '7770002');
    expect(hits.length).toBe(1);
    expect(hits[0].decision).toBe('ALLOWED');
    expect(hits[0].provenance.join(' ')).toContain('representation:packaging');
  });

  it('بارکدِ کانونی = بارکدِ بسته‌بندیِ کالای دیگر ⇒ HARD بین‌بازنمایی', () => {
    const hits = byRule(a, 'C13X-R-bc-pb').filter((f) => f.space_key === '400111');
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].decision).toBe('HARD_CONFLICT');
    expect(hits[0].provenance.join(' ')).toContain('representation:packaging');
  });

  it('gs1 معتبر برای دو کالای متمایز ⇒ HARD با visible_under_current_constraints=yes (drift)', () => {
    const hits = byRule(a, 'C13X-R-bc-bc').filter((f) => f.space_key === GTIN_VALID);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits.every((f) => f.visible_under_current_constraints === 'yes')).toBe(true);
  });

  it('دو خانواده با کدِ یکسان ⇒ MANUAL_REVIEW با visible=yes (drift قیدِ امروز)', () => {
    const hits = byRule(a, 'C13X-R-fc-fc').filter((f) => f.space_key === 'fam-100');
    expect(hits.length).toBe(1);
    expect(hits[0].decision).toBe('MANUAL_REVIEW');
    expect(hits[0].visible_under_current_constraints).toBe('yes');
  });

  it('کدِ کالا = کدِ خانواده ⇒ MANUAL_REVIEW نیازمندِ تصمیمِ مالک', () => {
    const hits = byRule(a, 'C13X-R-pc-fc').filter((f) => f.space_key === 'fam 9');
    expect(hits.length).toBe(1);
    expect(hits[0].requires_owner_approval).toBe(true);
  });

  it('کدِ کالا = کدِ دسته ⇒ MANUAL_REVIEW', () => {
    expect(byRule(a, 'C13X-R-pc-cc').some((f) => f.space_key === 'cat 7')).toBe(true);
  });

  it('کدِ خانواده = کدِ دسته ⇒ MANUAL_REVIEW', () => {
    expect(byRule(a, 'C13X-R-fc-cc').some((f) => f.space_key === '130')).toBe(true);
  });

  it('variant_signature یکسان در دو خانواده ⇒ MANUAL_REVIEW؛ در همان خانواده ⇒ visible=yes', () => {
    const cross = byRule(a, 'C13X-R-vs-vs');
    expect(cross.length).toBeGreaterThanOrEqual(2);
    const otherFamily = cross.find((f) => f.space_key === 'size:XL|color:red')!;
    const sameFamily = cross.find((f) => f.space_key === 'color:blue')!;
    expect(otherFamily.visible_under_current_constraints).toBe('no');
    expect(sameFamily.visible_under_current_constraints).toBe('yes');
  });

  it('UPC-A و EAN-13 هم‌ارزش ⇒ HARD در هر دو فضای scan و سیاست‌های UPC/XKIND', () => {
    const hits = byRule(a, 'C13X-R-bc-bc').filter((f) => f.space_key === EAN13_OF_UPC);
    expect(hits.length).toBe(1);
    expect(hits[0].decision).toBe('HARD_CONFLICT');
    expect(hits[0].visible_under_current_constraints).toBe('yes');
  });

  it('alias = بارکدِ internal ⇒ HARD', () => {
    expect(byRule(a, 'C13X-R-al-bc').some((f) => f.space_key === '1000')).toBe(true);
  });

  it('نامِ لاتین = کدِ کالا ⇒ MANUAL_REVIEW (alnum)', () => {
    expect(byRule(a, 'C13X-R-pc-pnl').some((f) => f.space_key === 'k 100')).toBe(true);
  });

  it('نامِ جایگزین با نامِ فارسی ⇒ SOFT', () => {
    const hits = byRule(a, 'C13X-R-pn-al');
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits.some((f) => f.decision === 'SOFT_CONFLICT')).toBe(true);
    expect(hits.every((f) => f.decision === 'SOFT_CONFLICT' || f.decision === 'ALLOWED')).toBe(true);
  });

  it('alias = family_code ⇒ MANUAL_REVIEW', () => {
    expect(byRule(a, 'C13X-R-fc-al').some((f) => f.space_key === 'fam 77')).toBe(true);
  });

  it('بین‌دامنه‌ای در همان شرکت با ALLOWED/REVIEW مخلوط نمی‌شود؛ crosses_domain ثبت می‌شود', () => {
    const hits = byRule(a, 'C13X-R-al-al').filter((f) => f.space_key === 'domain-shared');
    expect(hits.length).toBe(1);
    expect(hits[0].scope.crosses_domain).toBe(true);
    expect(hits[0].scope.crosses_company).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13XT / ۵ — مرزِ شرکت و دامنهٔ جهانی', () => {
  const a = assess(CROSS_TYPE_FIXTURE);

  it('کدِ یکسان در دو شرکت گزارش نمی‌شود (دامنهٔ شرکت)', () => {
    const hits = a.findings.filter((f) => f.parties.some((p) => p.source_ref === 'XT-p32-code'));
    expect(hits).toHaveLength(0);
  });

  it('بارکدِ internal هم‌مقدار در دو شرکت پیش‌فرض گزارش نمی‌شود', () => {
    const hits = a.findings.filter((f) => f.parties.some((p) => p.source_ref === 'XT-p34-barcode'));
    expect(hits).toHaveLength(0);
  });

  it('با crossCompanyIsConflict=true، جفتِ بین‌شرکتی گزارش می‌شود و پوشانده می‌ماند', () => {
    const withFlag = assess(CROSS_TYPE_FIXTURE, { crossCompanyIsConflict: true });
    const hits = withFlag.findings.filter((f) => f.parties.some((p) => f.scope.company_id === '*' && p.source_ref.startsWith('ref:')));
    expect(hits.length).toBeGreaterThan(0);
    for (const f of hits) {
      expect(f.scope.company_id).toBe('*');
      for (const p of f.parties) {
        expect(p.display_value).toBeNull();
        expect(p.redacted).toBe(true);
        expect(p.company_id.startsWith('company:')).toBe(true);
      }
    }
  });

  it('جفتِ gs1↔internal بین‌شرکتی «کورِ قید» است و حتی بدونِ مصوبه گزارش می‌شود — پوشانده', () => {
    // XT-p19 (A، internal، GTIN8_VALID) در برابرِ XT-p20 (B، gs1_ean8، همان مقدار)
    const hit = a.findings.find(
      (f) => f.rule_id === 'C13X-R-bc-bc' && f.scope.company_id === '*' && f.parties.length >= 2,
    );
    expect(hit).toBeDefined();
    expect(hit!.scope.crosses_company).toBe(true);
    for (const p of hit!.parties) {
      expect(p.display_value).toBeNull();
      expect(p.redacted).toBe(true);
    }
  });

  it('هیچ یافتهٔ بین‌شرکتی مقدارِ خام نمایش نمی‌دهد', () => {
    for (const f of a.findings.filter((x) => x.scope.company_id === '*')) {
      for (const p of f.parties) {
        expect(p.display_value).toBeNull();
        expect(p.source_ref.startsWith('ref:')).toBe(true);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13XT / ۶ — مقادیرِ کم‌اهمیت، false-positive و مرزها', () => {
  it('name عددی = barcode ⇒ NOT_COMPARABLE؛ پیش‌فرض گزارش نمی‌شود؛ با includeNotComparable گزارش می‌شود', () => {
    const def = assess(CROSS_TYPE_FIXTURE);
    expect(def.findings.some((f) => f.rule_id === 'C13X-R-pn-bc')).toBe(false);
    const withNC = assess(CROSS_TYPE_FIXTURE, { includeNotComparable: true });
    expect(withNC.findings.some((f) => f.rule_id === 'C13X-R-pn-bc')).toBe(true);
  });

  it('includeAllowed=false یافته‌های ALLOWED را حذف می‌کند', () => {
    const without = assess(CROSS_TYPE_FIXTURE, { includeAllowed: false });
    expect(without.findings.every((f) => f.decision !== 'ALLOWED')).toBe(true);
    const withDef = assess(CROSS_TYPE_FIXTURE);
    expect(withDef.findings.some((f) => f.decision === 'ALLOWED')).toBe(true);
  });

  it('دو ردیفِ pb روی دو کالای متمایز ⇒ MANUAL_REVIEW با visible=yes', () => {
    const hits = byRule(a2(), 'C13X-R-pb-pb').filter((f) => f.space_key === '880001');
    expect(hits.length).toBe(1);
    expect(hits[0].visible_under_current_constraints).toBe('yes');
    expect(hits[0].decision).toBe('MANUAL_REVIEW');
  });

  function a2() {
    return assess(CROSS_TYPE_FIXTURE);
  }

  it('GTINِ معتبر در دادهٔ امروز «یافته» نیست مگر واقعاً تکراری باشد — data-quality برای GTIN معتبر چیزی ثبت نمی‌کند', () => {
    const dq = assess(CROSS_TYPE_FIXTURE).data_quality.filter((d) => d.source_ref === 'XT-p17-barcode');
    expect(dq).toHaveLength(0);
  });

  it('رقمِ کنترلیِ غلط ⇒ GSQ data-quality و طولِ غلط ⇒ gs1_length_invalid', () => {
    const dq = assess(CROSS_TYPE_FIXTURE).data_quality;
    expect(dq.some((d) => d.check === 'gs1_check_digit_invalid' && d.source_ref === 'XT-p23-barcode')).toBe(true);
    expect(dq.some((d) => d.check === 'gs1_length_invalid' && d.source_ref === 'XT-p24-barcode')).toBe(true);
  });

  it('internal با حروف (INT-A1) معتبر است', () => {
    const dq = assess(CROSS_TYPE_FIXTURE).data_quality.filter((d) => d.source_ref === 'XT-p25-barcode');
    expect(dq).toHaveLength(0);
  });

  it('subtype با حروفِ بزرگ ⇒ subtype_noncanonical ولی ردیف کنار گذاشته نمی‌شود', () => {
    const dq = assess(CROSS_TYPE_FIXTURE).data_quality;
    expect(dq.some((d) => d.check === 'subtype_noncanonical' && d.source_ref === 'XT-p52-alias')).toBe(true);
    expect(assess(CROSS_TYPE_FIXTURE).input.by_type['alias']).toBeGreaterThan(0);
  });

  it('subtype خارج از فهرست ⇒ subtype_unknown و ردیف همچنان گروه‌بندی می‌شود (ایمن)', () => {
    const dq = assess(CROSS_TYPE_FIXTURE).data_quality;
    expect(dq.some((d) => d.check === 'subtype_unknown' && d.source_ref === 'XT-p53-barcode')).toBe(true);
  });

  it('ردیف‌های ناقص کرش نمی‌کنند و به data-quality می‌روند', () => {
    const a3 = assess(CROSS_TYPE_FIXTURE);
    const checks = a3.data_quality.map((d) => d.check);
    expect(checks).toContain('missing_entity_id');
    expect(checks).toContain('missing_company_id');
    expect(checks).toContain('empty_display_value');
    expect(checks).toContain('unknown_identity_type');
    expect(checks).toContain('missing_source_ref');
    expect(a3.input.rows_invalid).toBeGreaterThanOrEqual(4);
  });

  it('ردیفِ کاملاً یکسانِ تکراری شمارش و کنار گذاشته می‌شود', () => {
    const a4 = assess(CROSS_TYPE_FIXTURE);
    expect(a4.input.duplicates_suppressed).toBe(1);
    expect(a4.data_quality.some((d) => d.check === 'duplicate_row_suppressed')).toBe(true);
  });

  it('ورودیِ خالی ⇒ صفر یافته، صفر خطا', () => {
    const a5 = assess([]);
    expect(a5.findings).toHaveLength(0);
    expect(a5.data_quality).toHaveLength(0);
    expect(a5.summary.rows_in).toBe(0);
  });

  it('مقدارِ خام هرگز در provenance بین‌شرکتی دیده نمی‌شود', () => {
    for (const f of assess(CROSS_TYPE_FIXTURE).findings.filter((x) => x.scope.company_id === '*')) {
      expect(f.provenance.join(' ')).not.toContain(GTIN8_VALID);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13XT / ۷ — قطعیت، fingerprint و سقفِ طرف‌ها', () => {
  it('دو اجرای یکسان (با تزریقِ now) اثرِ انگشتِ یکسان می‌سازند', () => {
    const a1 = assess(CROSS_TYPE_FIXTURE);
    const a2 = assess(CROSS_TYPE_FIXTURE);
    expect(a1.content_fingerprint).toBe(a2.content_fingerprint);
    expect(a1.findings.map((f) => f.collision_id)).toEqual(a2.findings.map((f) => f.collision_id));
  });

  it('ترتیبِ ورودی هیچ اثری روی خروجی ندارد', () => {
    const base = assess(CROSS_TYPE_FIXTURE);
    for (const seed of [1, 7, 42, 123]) {
      const shuffled = assess(shuffledRows(CROSS_TYPE_FIXTURE, seed));
      expect(shuffled.content_fingerprint).toBe(base.content_fingerprint);
      expect(shuffled.findings.map((f) => f.collision_id)).toEqual(base.findings.map((f) => f.collision_id));
    }
  });

  function shuffledRows(rows: readonly CrossTypeRow[], seed: number): CrossTypeRow[] {
    const a = [...rows];
    let s = seed >>> 0;
    for (let i = a.length - 1; i > 0; i -= 1) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      const j = s % (i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  it('تغییرِ یک ردیف اثرِ انگشت را عوض می‌کند', () => {
    const a1 = assess(CROSS_TYPE_FIXTURE);
    const modified = CROSS_TYPE_FIXTURE.map((r) =>
      r.source_ref === 'XT-p01-code' ? { ...r, display_value: 'SKU-ALTERED' } : r,
    );
    const a2 = assess(modified);
    expect(a2.content_fingerprint).not.toBe(a1.content_fingerprint);
  });

  it('سقفِ طرف‌ها رعایت می‌شود و total_parties عددِ واقعی را نشان می‌دهد', () => {
    const rows: CrossTypeRow[] = Array.from({ length: 9 }, (_, i) =>
      CROSS_TYPE_ROW(`CAP-p${i}`, COMPANY_A, 'alias', 'CAP-SHARED', `cap-${i}`, { subtype: 'latin' }),
    );
    const a = assess(rows, { maxPartiesPerFinding: 3 });
    const hit = a.findings.find((f) => f.rule_id === 'C13X-R-al-al')!;
    expect(hit.total_parties).toBe(9);
    expect(hit.parties).toHaveLength(3);
  });

  it('شناسهٔ یافته‌ها پایدار و مستقل از ترتیب‌اند', () => {
    const a1 = assess(CROSS_TYPE_FIXTURE);
    const ids = a1.findings.map((f) => f.collision_id);
    expect(ids.every((id) => id.startsWith('C13X-'))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('options_echo آنچه واقعاً اعمال شده را نشان می‌دهد', () => {
    const a = assess(CROSS_TYPE_FIXTURE, { redactValues: false, includeNotComparable: true, includeAllowed: false, crossCompanyIsConflict: true });
    expect(a.options_echo).toEqual({
      redactValues: false,
      includeNotComparable: true,
      includeAllowed: false,
      crossCompanyIsConflict: true,
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13XT / ۸ — redaction و پوشاندن', () => {
  it('پیش‌فرض: مقدارِ نمایشی در گزارش ماسک می‌شود', () => {
    const a = assess(CROSS_TYPE_FIXTURE);
    const hit = a.findings.find((f) => f.rule_id === 'C13X-R-pc-pc')!;
    for (const p of hit.parties) {
      expect(p.redacted).toBe(true);
      expect(p.display_value).not.toBe('SKU-9');
      expect(p.display_value).not.toBe('sku-9');
      expect(p.display_value).toContain('•');
    }
  });

  it('redactValues=false: مقادیرِ شرکتِ خودی خام دیده می‌شوند', () => {
    const a = assess(CROSS_TYPE_FIXTURE, { redactValues: false });
    const hit = a.findings.find((f) => f.rule_id === 'C13X-R-pc-pc')!;
    const displays = hit.parties.map((p) => p.display_value).sort();
    expect(displays).toContain('SKU-9');
    expect(displays).toContain('sku-9');
  });

  it('redactValues=false هم مقادیرِ بین‌شرکتی را نمی‌گشاید', () => {
    const a = assess(CROSS_TYPE_FIXTURE, { redactValues: false, crossCompanyIsConflict: true });
    for (const f of a.findings.filter((x) => x.scope.company_id === '*')) {
      for (const p of f.parties) {
        expect(p.display_value).toBeNull();
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13XT / ۹ — ابهامِ اسکن و سایه‌شدن', () => {
  const shadows = analyzeScanResolution(CROSS_TYPE_FIXTURE, { now: NOW });

  it('key=60: بارکد بر کد اولویت دارد و کد سایه می‌شود', () => {
    const h = shadows.find((s) => s.scan_key === '60')!;
    expect(h.resolved_by).toBe('barcode');
    expect(h.shadowed.some((p) => p.source_ref === 'XT-p44-code')).toBe(true);
    expect(h.decision).toBe('MANUAL_REVIEW');
    expect(h.requires_owner_approval).toBe(false);
  });

  it('key=61: کد بر alias نوعِ code اولویت دارد و alias سایه می‌شود', () => {
    const h = shadows.find((s) => s.scan_key === '61')!;
    expect(h.resolved_by).toBe('code');
    expect(h.shadowed.some((p) => p.source_ref === 'XT-p46-alias')).toBe(true);
    expect(h.precedence).toEqual(['barcode', 'code', 'alias_code']);
  });

  it('شرکتِ خالی (C) با وجودِ gs1 در شرکتِ دیگر ⇒ fallback بین‌شرکتی گزارش می‌شود', () => {
    const c = shadows.filter((s) => s.company_id === COMPANY_C);
    expect(c.length).toBeGreaterThanOrEqual(1);
    const fb = c.find((s) => s.scan_key === '4000000000013')!;
    expect(fb.crosses_company).toBe(true);
    for (const p of fb.shadowed) {
      expect(p.display_value).toBeNull();
      expect(p.company_id.startsWith('company:')).toBe(true);
      expect(p.source_ref.startsWith('ref:')).toBe(true);
    }
  });

  it('precedence در همهٔ یافته‌ها [barcode, code, alias_code] است', () => {
    for (const s of shadows) expect(s.precedence).toEqual(['barcode', 'code', 'alias_code']);
  });

  it('همان‌موجودیت در دو مرحله سایه نمی‌شود (p10 کد=بارکدِ خودش)', () => {
    expect(shadows.some((s) => s.scan_key === '7770001')).toBe(false);
  });

  it('shadow_id یکتا و پایدار است', () => {
    const ids = shadows.map((s) => s.shadow_id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith('C13XSH-'))).toBe(true);
  });

  it('خروجی با reorderِ ورودی ثابت می‌ماند', () => {
    const again = analyzeScanResolution(shuffledRows(CROSS_TYPE_FIXTURE, 5), { now: NOW });
    expect(again.map((s) => s.shadow_id)).toEqual(shadows.map((s) => s.shadow_id));
  });

  function shuffledRows(rows: readonly CrossTypeRow[], seed: number): CrossTypeRow[] {
    const a = [...rows];
    let s = seed >>> 0;
    for (let i = a.length - 1; i > 0; i -= 1) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      const j = s % (i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13XT / ۱۰ — سکویی (مقیاسِ ترکیبی)', () => {
  const NOW = () => new Date('2026-11-13T00:00:00.000Z');

  it('۴۰٬۰۰۰ محصول در کمتر از ۱۰ ثانیه با حافظهٔ منطقی تحلیل می‌شود', () => {
    const rows = generateSyntheticCrossTypeRows(40000, 42, 2);
    const start = Date.now();
    const a = assessCrossType(rows, { now: NOW });
    const ms = Date.now() - start;
    // ۳۰ برابرِ حاشیه روی ماشینِ آزمون (~۱.۴ ثانیه اندازه‌گیری شد)
    expect(ms).toBeLessThan(10_000);
    expect(a.summary.findings_total).toBeGreaterThan(0);
    expect(Number.isFinite(a.summary.findings_total)).toBe(true);
  }, 30_000);

  it('شبیه‌سازیِ کاملِ سیاست‌ها در مقیاسِ ترکیبی قطعی می‌ماند', () => {
    const rows = generateSyntheticCrossTypeRows(10000, 7, 1);
    const r1 = simulateFuturePolicies(rows, { now: NOW });
    const r2 = simulateFuturePolicies(rows, { now: NOW });
    expect(r1.content_fingerprint).toBe(r2.content_fingerprint);
  }, 30_000);
});
