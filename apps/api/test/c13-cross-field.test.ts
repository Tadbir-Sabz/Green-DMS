/**
 * TASK-PM-02-C13 — تست‌های قراردادِ مقایسهٔ بین‌میدانی و موتورِ تصمیم.
 *
 * هر تست یک ادعای مشخص را اثبات می‌کند؛ هیچ تستی «آزمایشِ دود» نیست.
 */

import { describe, expect, it } from 'vitest';
import {
  assessCrossField,
  allRulePairs,
  comparisonKey,
  COMPARISON_CONTRACT_VERSION,
  COMPARISON_RULES,
  COMPARISON_SPACES,
  DECISIONS,
  fieldSpace,
  IDENTITY_FIELDS,
  pairKey,
  redactValue,
  resultId,
  ruleFor,
  scanSpace,
  alnumSpace,
  textSpace,
  UNDERLYING_NORMALIZATION_VERSION,
  type ComparisonRule,
  type Decision,
  type IdentityField,
  type IdentityRow,
} from '../src/modules/master-data/experimental/cross-field-identity.candidate';
import {
  CROSS_FIELD_FIXTURE,
  EMPTY_FIXTURE,
  SINGLE_FIXTURE,
  COMPANY_A,
  COMPANY_B,
  COMPANY_C,
  DOMAIN_A1,
  DOMAIN_A2,
  makeLargeCrossFieldFixture,
} from './fixtures/c13-cross-field-identities';

const assessment = assessCrossField(CROSS_FIELD_FIXTURE, { redactValues: false });
const findings = assessment.results.filter(
  (r) => r.decision === 'HARD_CONFLICT' || r.decision === 'SOFT_CONFLICT' || r.decision === 'MANUAL_REVIEW',
);

const byRule = (id: string) => assessment.results.filter((r) => r.rule_id === id);

// ═══════════════════════════════════════════════════════════════════════════
describe('C13 / 1 — قراردادِ مقایسه: ساختار و نسخه', () => {
  it('نسخه‌ها صریح و مستقل‌اند', () => {
    expect(COMPARISON_CONTRACT_VERSION).toBe('c13.1');
    expect(UNDERLYING_NORMALIZATION_VERSION).toBe('c11.1');
  });

  it('هر پنج میدانِ هویتی پوشش داده شده‌اند', () => {
    expect([...IDENTITY_FIELDS].sort()).toEqual(['alias', 'barcode', 'code', 'name', 'name_latin']);
  });

  it('دقیقاً پنج تصمیم وجود دارد — نه بیشتر', () => {
    expect([...DECISIONS]).toEqual([
      'HARD_CONFLICT', 'SOFT_CONFLICT', 'MANUAL_REVIEW', 'ALLOWED', 'NOT_COMPARABLE',
    ]);
  });

  it('هر ۱۰ جفتِ ممکنِ میدان یک قاعدهٔ اعلانی دارد (بدونِ جفتِ بی‌تصمیم)', () => {
    const pairs: string[] = [];
    for (let i = 0; i < IDENTITY_FIELDS.length; i += 1) {
      for (let j = i; j < IDENTITY_FIELDS.length; j += 1) {
        pairs.push(pairKey(IDENTITY_FIELDS[i], IDENTITY_FIELDS[j]));
      }
    }
    const declared = new Set(allRulePairs());
    const missing = pairs.filter((p) => !declared.has(p));
    expect(missing, `جفت‌های بدونِ قاعده: ${missing.join(', ')}`).toEqual([]);
    expect(pairs.length).toBe(15);
  });

  it('هر قاعده شناسهٔ یگانه، فضای مشخص و توضیحِ فارسی دارد', () => {
    const ids = new Set<string>();
    for (const rule of COMPARISON_RULES.values()) {
      expect(rule.rule_id).toMatch(/^C13-R-[a-z_~-]+$/);
      expect(ids.has(rule.rule_id), `شناسهٔ تکراری: ${rule.rule_id}`).toBe(false);
      ids.add(rule.rule_id);
      expect(rule.explanation_fa.length).toBeGreaterThan(10);
      expect(rule.recommended_resolution_fa.length).toBeGreaterThan(5);
      expect(rule.rationale_fa.length).toBeGreaterThan(10);
      expect(rule.ambiguity).toBeGreaterThanOrEqual(0);
      expect(rule.ambiguity).toBeLessThanOrEqual(1);
      if (rule.decision === 'NOT_COMPARABLE') expect(rule.severity).toBe('none');
      else expect(COMPARISON_SPACES).toContain(rule.space as string);
    }
    expect(ids.size).toBe(COMPARISON_RULES.size);
  });

  it('قاعدهٔ یک جفت مستقل از ترتیب است', () => {
    expect(ruleFor('alias', 'barcode')?.rule_id).toBe(ruleFor('barcode', 'alias')?.rule_id);
    expect(ruleFor('name', 'code')?.rule_id).toBe(ruleFor('code', 'name')?.rule_id);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13 / 2 — تقارنِ فضاهای مقایسه (پیش‌نیازِ هر مقایسهٔ معتبر)', () => {
  it('فضای scan به میدان وابسته نیست — هر دو طرف یک تبدیل می‌گیرند', () => {
    // همین تقارن است که CF-10 را حل می‌کند
    expect(scanSpace('400 111').key).toBe(scanSpace('400111').key);
    expect(scanSpace('400 111').key).toBe('400111');
  });

  it('فضای scan همهٔ جداکننده‌های قالب‌بندی را حذف می‌کند', () => {
    const forms = ['400-111', '400 111', '400_111', '400.111', '400/111', '  400111  ', '400\t111'];
    const keys = new Set(forms.map((f) => scanSpace(f).key));
    expect([...keys]).toEqual(['400111']);
  });

  it('فضای scan صفرِ ابتدایی را حفظ می‌کند (پیش‌فرضِ محافظه‌کارانهٔ C11)', () => {
    expect(scanSpace('007').key).toBe('007');
    expect(scanSpace('0-0-7').key).toBe('007');
    expect(scanSpace('007').key).not.toBe(scanSpace('7').key);
  });

  it('فضای scan ارقامِ فارسی/عربی را به لاتین تبدیل می‌کند', () => {
    expect(scanSpace('۴۰۰۱۱۱').key).toBe('400111');
    expect(scanSpace('٤٠٠١١١').key).toBe('400111');
  });

  it('فضای alnum فاصلهٔ درونی را حفظ می‌کند (برخلافِ scan) — تصمیمِ عمدی', () => {
    expect(alnumSpace('AB-12').key).toBe('ab 12');
    expect(alnumSpace('AB 12').key).toBe('ab 12');
    // در فضای scan این دو یکی می‌شوند، در alnum نه
    expect(scanSpace('AB-12').key).toBe('ab12');
    expect(alnumSpace('AB12').key).toBe('ab12');
    expect(alnumSpace('AB12').key).not.toBe(alnumSpace('AB 12').key);
  });

  it('فضای text از SearchKey استفاده می‌کند: ي/ك عربی یکسان می‌شوند', () => {
    expect(textSpace('پنير').key).toBe(textSpace('پنیر').key);
    expect(textSpace('كوكا').key).toBe(textSpace('کوکا').key);
  });

  it('فضای text آ/أ/إ را متمایز نگه می‌دارد (D-C11-2 — تصویب‌نشده، پس محافظه‌کارانه)', () => {
    const a = textSpace('آب').key;
    const b = textSpace('اب').key;
    expect(a).not.toBe(b);
  });

  it('فضای field به میدان وابسته است — و باید باشد', () => {
    // همان مقدار، دو میدان، دو کلید ⇒ چرا گروه‌بندیِ ساده شکست می‌خورد
    expect(fieldSpace('alias', '123 456').key).not.toBe(fieldSpace('barcode', '123 456').key);
  });

  it('ورودیِ نامعتبر کلید نمی‌سازد و دلیل می‌دهد', () => {
    const bad = scanSpace('!!!');
    expect(bad.ok).toBe(false);
    expect(bad.key).toBeNull();
    expect(bad.reason).toBe('empty_after_normalization');
    expect(scanSpace('').ok).toBe(false);
  });

  it('فضای ناشناخته خطا می‌دهد، نه رفتارِ خاموش', () => {
    expect(() => comparisonKey('nope' as never, 'alias', 'x')).toThrow(/unknown comparison space/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13 / 3 — CF-10: alias↔barcode با فاصله (قلبِ C13)', () => {
  it('برخورد را پیدا می‌کند، در حالی که کلیدهای میدانی متفاوت‌اند', () => {
    const aliasRow = CROSS_FIELD_FIXTURE.find((r) => r.source_ref === 'A-p01-alias') as IdentityRow;
    const barcodeRow = CROSS_FIELD_FIXTURE.find((r) => r.source_ref === 'A-p02-barcode') as IdentityRow;

    // پیش‌شرط: کلیدهای میدانی همان‌طور که C12 گفت متفاوت‌اند
    const ak = fieldSpace('alias', aliasRow.display_value).key;
    const bk = fieldSpace('barcode', barcodeRow.display_value).key;
    expect(ak).not.toBe(bk);

    // ولی در فضای scan یکی می‌شوند
    expect(scanSpace(aliasRow.display_value).key).toBe(scanSpace(barcodeRow.display_value).key);

    // و موتور آن را به‌عنوان HARD گزارش می‌کند
    const hit = byRule('C13-R-alias~barcode').filter(
      (r) => r.scope.company_id === COMPANY_A && r.decision === 'HARD_CONFLICT',
    );
    expect(hit.length).toBeGreaterThan(0);
  });

  it('نتیجهٔ CF-10 هر ده میدانِ اجباریِ گزارش را دارد', () => {
    const r = byRule('C13-R-alias~barcode').find((x) => x.decision === 'HARD_CONFLICT');
    expect(r).toBeDefined();
    // شناسهٔ پایدار · طرفین · میدان‌ها · شرکت/دامنه · مقادیر · کلیدها · قاعده/نسخه · توضیح · شدت · پیشنهاد · منبع
    expect(r?.collision_id).toMatch(/^C13-[0-9a-f]{8}$/);
    expect(r?.parties.length).toBeGreaterThanOrEqual(2);
    expect(new Set(r?.parties.map((p) => p.field)).size).toBe(2);
    expect(r?.scope.company_id).toBe(COMPANY_A);
    expect(r?.scope.domain_id).toBeTruthy();
    expect(r?.parties.every((p) => p.display_value !== null)).toBe(true);
    expect(r?.parties.every((p) => p.field_key !== null)).toBe(true);
    expect(r?.rule_id).toBe('C13-R-alias~barcode');
    expect(r?.contract_version).toBe(COMPARISON_CONTRACT_VERSION);
    expect(r?.normalization_version).toBe(UNDERLYING_NORMALIZATION_VERSION);
    expect(r?.explanation_fa.length).toBeGreaterThan(20);
    expect(r?.recommended_resolution_fa.length).toBeGreaterThan(10);
    expect(r?.space).toBe('scan');
    expect(r?.space_key).toBeTruthy();
    expect(r?.confidence).toBe('high');
    expect(r?.provenance.length).toBeGreaterThanOrEqual(2);
  });

  it('CF-10 با نرمال‌سازیِ امروز دیده نمی‌شود (تازه‌کشف)', () => {
    const r = byRule('C13-R-alias~barcode').find((x) => x.decision === 'HARD_CONFLICT');
    expect(r?.visible_under_current_normalization).toBe(false);
  });

  it('همان کالا: alias و barcode یکسان ⇒ مستثنا، نه تعارض', () => {
    const rows: IdentityRow[] = [
      { entity_id: 'S1', company_id: COMPANY_A, field: 'alias', display_value: '111 222', stored_normalized: '111 222', source_ref: 's1' },
      { entity_id: 'S1', company_id: COMPANY_A, field: 'barcode', display_value: '111222', stored_normalized: '111222', source_ref: 's2' },
    ];
    const a = assessCrossField(rows, { redactValues: false });
    const hard = a.results.filter((r) => r.decision === 'HARD_CONFLICT');
    expect(hard).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13 / 4 — پوششِ همهٔ جفت‌میدان‌های خواسته‌شده', () => {
  const cases: Array<{ name: string; rule: string; expect: Decision }> = [
    { name: 'Alias ↔ ProductName', rule: 'C13-R-alias~name', expect: 'SOFT_CONFLICT' },
    { name: 'Alias ↔ ProductCode', rule: 'C13-R-alias~code', expect: 'HARD_CONFLICT' },
    { name: 'Alias ↔ Barcode (CF-10)', rule: 'C13-R-alias~barcode', expect: 'HARD_CONFLICT' },
    { name: 'ProductName ↔ ProductCode', rule: 'C13-R-code~name', expect: 'MANUAL_REVIEW' },
    { name: 'ProductCode ↔ Barcode', rule: 'C13-R-barcode~code', expect: 'HARD_CONFLICT' },
    { name: 'ProductName ↔ Barcode', rule: 'C13-R-barcode~name', expect: 'NOT_COMPARABLE' },
    { name: 'Latin name ↔ alias', rule: 'C13-R-alias~name_latin', expect: 'SOFT_CONFLICT' },
  ];

  for (const c of cases) {
    it(`${c.name} → ${c.expect}`, () => {
      const hits = byRule(c.rule);
      const matched = hits.filter((r) => r.decision === c.expect);
      expect(matched.length, `هیچ نتیجه‌ای با تصمیم ${c.expect} برای ${c.rule}`).toBeGreaterThan(0);
    });
  }

  it('نامِ عددی در برابرِ بارکد ⇒ NOT_COMPARABLE (نه تعارضِ کاذب)', () => {
    const nc = byRule('C13-R-barcode~name').filter((r) => r.decision === 'NOT_COMPARABLE');
    expect(nc.length).toBeGreaterThan(0);
    // و هیچ‌یک از آن‌ها HARD نیست
    const hard = byRule('C13-R-barcode~name').filter((r) => r.decision === 'HARD_CONFLICT');
    expect(hard).toEqual([]);
  });

  it('هر تصمیمِ ممکن در fixture واقعاً تولید می‌شود', () => {
    const produced = new Set(assessment.results.map((r) => r.decision));
    const missing = DECISIONS.filter((d) => !produced.has(d));
    expect(missing, `تصمیم‌های بی‌شاهد: ${missing.join(', ')}`).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13 / 5 — «هر شباهتِ متنی تعارض نیست»', () => {
  it('جفت‌های غیرقابلِ مقایسه شدتِ none دارند، نه hard', () => {
    const nc = assessment.results.filter((r) => r.decision === 'NOT_COMPARABLE');
    expect(nc.length).toBeGreaterThan(0);
    for (const r of nc) {
      const rule = ruleFor(r.parties[0].field, r.parties[1].field) as ComparisonRule;
      expect(rule.severity).toBe('none');
    }
  });

  it('نام‌های یکسان ⇒ SOFT، هرگز HARD', () => {
    const nameHits = byRule('C13-R-name-same');
    expect(nameHits.length).toBeGreaterThan(0);
    for (const r of nameHits) expect(r.decision).toBe('SOFT_CONFLICT');
  });

  it('کد/بارکدِ یکسان ⇒ HARD', () => {
    expect(byRule('C13-R-code-same').every((r) => r.decision === 'HARD_CONFLICT')).toBe(true);
    expect(byRule('C13-R-barcode-same').every((r) => r.decision === 'HARD_CONFLICT')).toBe(true);
  });

  it('تصمیمِ سخت فقط برای جفت‌هایی است که قرارداد صریحاً سخت اعلام کرده', () => {
    const hardRules = new Set(
      [...COMPARISON_RULES.values()].filter((r) => r.decision === 'HARD_CONFLICT').map((r) => r.rule_id),
    );
    for (const r of assessment.results.filter((x) => x.decision === 'HARD_CONFLICT')) {
      // قاعدهٔ بین‌شرکتی فقط با مصوبه سخت می‌شود
      expect(hardRules.has(r.rule_id) || r.rule_id === 'C13-R-cross-company').toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13 / 6 — امنیتِ چندمستأجری و مرزِ شرکت', () => {
  it('برخوردِ بین‌شرکتی به‌طور پیش‌فرض ALLOWED است، نه تعارض', () => {
    const cross = byRule('C13-R-cross-company');
    expect(cross.length).toBeGreaterThan(0);
    for (const r of cross) expect(r.decision).toBe('ALLOWED');
    expect(assessment.options.crossCompanyIsConflict).toBe(false);
  });

  it('هیچ نتیجهٔ درون‌شرکتی دو شرکت را مخلوط نمی‌کند', () => {
    for (const r of assessment.results) {
      if (r.scope.crosses_company) continue;
      const companies = new Set(r.parties.map((p) => p.company_id));
      expect(companies.size, `نشتِ شرکت در ${r.collision_id}`).toBe(1);
    }
  });

  it('🔒 هیچ مقدارِ نمایشیِ شرکتِ دیگر در نتیجهٔ بین‌شرکتی افشا نمی‌شود', () => {
    const cross = byRule('C13-R-cross-company');
    expect(cross.length).toBeGreaterThan(0);
    for (const r of cross) {
      for (const p of r.parties) {
        // یا پوشانده است، یا متعلق به خودِ ناظر است
        const isForeign = p.company_id !== r.scope.company_id && r.scope.company_id !== '*';
        if (isForeign) expect(p.display_value).toBeNull();
      }
      // وقتی ناظر '*' است (مشاهدهٔ سراسری)، هیچ مقدارِ خامی نباید باشد
      if (r.scope.company_id === '*') {
        for (const p of r.parties) {
          expect(p.display_value).toBeNull();
          expect(p.field_key).toBeNull();
          expect(p.comparison_key).toBeNull();
        }
      }
    }
  });

  it('🔒 شناسهٔ کالای شرکتِ دیگر هش می‌شود، نه افشا', () => {
    const cross = byRule('C13-R-cross-company').find((r) => r.scope.company_id === '*');
    expect(cross).toBeDefined();
    const foreign = cross?.parties.filter((p) => p.company_id !== COMPANY_A) ?? [];
    for (const p of foreign) {
      expect(p.entity_id).toMatch(/^\u2022\u2022\u2022:[0-9a-f]{8}$/);
      expect(p.source_ref).toMatch(/^\u2022\u2022\u2022:[0-9a-f]{8}$/);
    }
  });

  it('بین‌شرکتی با مصوبهٔ صریح سخت می‌شود، ولی افشا همچنان ممنوع است', () => {
    const strict = assessCrossField(CROSS_FIELD_FIXTURE, {
      redactValues: false, crossCompanyIsConflict: true,
    });
    const cross = strict.results.filter((r) => r.rule_id === 'C13-R-cross-company');
    expect(cross.length).toBeGreaterThan(0);
    expect(cross.every((r) => r.decision === 'HARD_CONFLICT')).toBe(true);
    // حتی با مصوبه، دادهٔ شرکتِ دیگر بیرون نمی‌رود
    for (const r of cross) {
      for (const p of r.parties) {
        if (r.scope.company_id === '*' ) expect(p.display_value).toBeNull();
      }
    }
  });

  it('پوشاندن به‌طور پیش‌فرض روشن است', () => {
    expect(assessment.options.redactValues).toBe(false); // ما صریحاً خاموش کردیم
    const def = assessCrossField(CROSS_FIELD_FIXTURE);
    expect(def.options.redactValues).toBe(true);
    // یک نتیجهٔ درون‌شرکتی (نه بین‌شرکتی) که مقدارش واقعاً پوشانده شده است
    const local = def.results.find((r) => !r.scope.crosses_company && r.parties.length > 0);
    expect(local).toBeDefined();
    expect(local?.parties[0].redacted).toBe(true);
    expect(local?.parties[0].display_value).toContain('\u2022');
    // مقدارِ خامِ کامل هرگز نباید در خروجی باشد
    const raw = CROSS_FIELD_FIXTURE.find((r) => r.display_value.length > 4)?.display_value as string;
    expect(JSON.stringify(def.results)).not.toContain(raw);
  });

  it('redactValue مقدارِ خام را لو نمی‌دهد', () => {
    expect(redactValue('supersecretvalue')).not.toContain('upersecret');
    expect(redactValue('ab')).toBe('\u2022\u2022');
    expect(redactValue('')).toBe('');
  });

  it('برخوردِ بین‌دامنه در همان شرکت ⇒ MANUAL_REVIEW', () => {
    const d = byRule('C13-R-cross-domain');
    expect(d.length).toBeGreaterThan(0);
    for (const r of d) {
      expect(r.decision).toBe('MANUAL_REVIEW');
      expect(r.scope.company_id).toBe(COMPANY_A);
      expect(r.scope.crosses_domain).toBe(true);
      expect(r.scope.crosses_company).toBe(false);
    }
    // دامنهٔ scope متعارف است (مرتب‌شده) تا شناسه با ترتیبِ ورودی عوض نشود
    for (const r of d) expect(r.scope.domain_id).toBe([DOMAIN_A1, DOMAIN_A2].sort().join('|'));
    // و طرف‌ها واقعاً در دو دامنهٔ متفاوت‌اند
    const partyDomains = new Set(d.flatMap((r) => r.parties.map((p) => p.domain_id)));
    expect(partyDomains.has(DOMAIN_A1)).toBe(true);
    expect(partyDomains.has(DOMAIN_A2)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13 / 7 — قطعیت و شناسهٔ پایدار', () => {
  it('همان ورودی ⇒ همان خروجی، بایت‌به‌بایت', () => {
    const a = assessCrossField(CROSS_FIELD_FIXTURE, { redactValues: false });
    const b = assessCrossField(CROSS_FIELD_FIXTURE, { redactValues: false });
    expect(JSON.stringify(a.results)).toBe(JSON.stringify(b.results));
  });

  it('ترتیبِ ورودی شناسه‌ها را تغییر نمی‌دهد', () => {
    const shuffled = [...CROSS_FIELD_FIXTURE].reverse();
    const a = assessCrossField(CROSS_FIELD_FIXTURE, { redactValues: false });
    const b = assessCrossField(shuffled, { redactValues: false });
    expect([...a.results.map((r) => r.collision_id)].sort()).toEqual(
      [...b.results.map((r) => r.collision_id)].sort(),
    );
  });

  it('ترتیبِ ورودی تصمیم‌ها را تغییر نمی‌دهد', () => {
    const shuffled = [...CROSS_FIELD_FIXTURE].reverse();
    const a = assessCrossField(CROSS_FIELD_FIXTURE, { redactValues: false });
    const b = assessCrossField(shuffled, { redactValues: false });
    expect(a.summary.by_decision).toEqual(b.summary.by_decision);
    expect(a.summary.by_rule).toEqual(b.summary.by_rule);
  });

  it('resultId مستقل از ترتیبِ طرف‌هاست', () => {
    const a = resultId('C13-R-x', 'co', 'k', [
      { entity_id: 'e1', field: 'alias' }, { entity_id: 'e2', field: 'barcode' },
    ]);
    const b = resultId('C13-R-x', 'co', 'k', [
      { entity_id: 'e2', field: 'barcode' }, { entity_id: 'e1', field: 'alias' },
    ]);
    expect(a).toBe(b);
  });

  it('دامنه یا قاعدهٔ متفاوت ⇒ شناسهٔ متفاوت', () => {
    const base = resultId('C13-R-x', 'co', 'k', [{ entity_id: 'e1', field: 'alias' }]);
    expect(resultId('C13-R-y', 'co', 'k', [{ entity_id: 'e1', field: 'alias' }])).not.toBe(base);
    expect(resultId('C13-R-x', 'co2', 'k', [{ entity_id: 'e1', field: 'alias' }])).not.toBe(base);
    expect(resultId('C13-R-x', 'co', 'k2', [{ entity_id: 'e1', field: 'alias' }])).not.toBe(base);
  });

  it('همهٔ شناسه‌ها در یک ارزیابی یگانه‌اند', () => {
    const ids = assessment.results.map((r) => r.collision_id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13 / 8 — ابتکاری‌نبودنِ الگوریتم (مهارِ انفجارِ جفت‌ها)', () => {
  it('گروه‌بندی، جفت‌های خامِ ممکن را مهار می‌کند', () => {
    // ۲۰۰ کالا در یک شرکت، همه با بارکدِ یکسان در یک گروه:
    // اگر جفت‌به‌جفت می‌شد ۱۹٩٠٠ جفت ⇒ باید یک نتیجه داشته باشیم
    const rows: IdentityRow[] = [];
    for (let i = 0; i < 200; i += 1) {
      rows.push({
        entity_id: `E${i}`, company_id: COMPANY_A, field: 'barcode',
        display_value: `999${i}`, stored_normalized: `999${i}`, source_ref: `r${i}`,
      });
    }
    const a = assessCrossField(rows, { redactValues: false });
    // همه در یک گروهِ هم‌میدانی‌اند (کلیدهای متفاوت‌اند، پس گروه‌های تک‌نفره) —
    // مهم این است که تعداد نتایج با n خطی بماند، نه n²
    expect(a.results.length).toBeLessThan(10);
  });

  it('۲۰۰ ردیف با کلیدِ یکسان ⇒ یک نتیجه، نه ۱۹٩٠٠', () => {
    const rows: IdentityRow[] = [];
    for (let i = 0; i < 200; i += 1) {
      rows.push({
        entity_id: `E${i}`, company_id: COMPANY_A, field: 'barcode',
        display_value: '111', stored_normalized: '111', source_ref: `r${i}`,
      });
    }
    const a = assessCrossField(rows, { redactValues: false });
    const same = a.results.filter((r) => r.rule_id === 'C13-R-barcode-same');
    expect(same.length).toBe(1);
    expect(same[0].total_parties).toBe(200);
    // نمونه بریده شده ولی شمارشِ کامل گزارش می‌شود
    expect(same[0].parties.length).toBeLessThanOrEqual(20);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13 / 9 — مجموعه‌های مرزی', () => {
  it('مجموعهٔ خالی ⇒ صفر نتیجه', () => {
    const a = assessCrossField(EMPTY_FIXTURE);
    expect(a.results).toEqual([]);
    expect(a.summary.total).toBe(0);
    expect(a.summary.raw_pairs_suppressed).toBe(0);
  });

  it('یک ردیف ⇒ صفر نتیجه، صفر جفتِ مهارشده', () => {
    const a = assessCrossField(SINGLE_FIXTURE);
    expect(a.results).toEqual([]);
    expect(a.summary.rows_in).toBe(1);
    expect(a.summary.rows_invalid).toBe(0);
  });

  it('میدانِ ناشناخته خطا می‌دهد، نه سقوطِ خاموش', () => {
    expect(() =>
      assessCrossField([{ entity_id: 'x', company_id: 'c', field: 'nope' as never, display_value: 'v', stored_normalized: 'v', source_ref: 'r' }]),
    ).toThrow(/unknown identity field/);
  });

  it('ورودیِ نامعتبر شمرده می‌شود و برخورد نمی‌سازد', () => {
    expect(assessment.summary.rows_invalid).toBeGreaterThan(0);
    for (const r of assessment.results) {
      for (const p of r.parties) {
        expect(p.source_ref).not.toContain('A-p25-code');
      }
    }
  });

  it('حالتِ گزارشِ NOT_COMPARABLE را می‌توان خاموش کرد', () => {
    const on = assessCrossField(CROSS_FIELD_FIXTURE);
    const off = assessCrossField(CROSS_FIELD_FIXTURE, { reportNotComparable: false });
    expect(on.summary.by_decision.NOT_COMPARABLE).toBeGreaterThan(0);
    expect(off.summary.by_decision.NOT_COMPARABLE).toBe(0);
  });

  it('محدودکردنِ فضاها دامنهٔ بررسی را محدود می‌کند', () => {
    const onlyScan = assessCrossField(CROSS_FIELD_FIXTURE, { spaces: ['scan'], redactValues: false });
    const rules = new Set(onlyScan.results.map((r) => r.rule_id));
    expect(rules.has('C13-R-alias~barcode')).toBe(true);
    expect(rules.has('C13-R-alias~name')).toBe(false); // آن قاعده در فضای text است
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13 / 10 — بدونِ تغییرِ داده و بدونِ ادغام', () => {
  it('هیچ ردیفِ ورودی تغییر نمی‌کند', () => {
    const snapshot = JSON.stringify(CROSS_FIELD_FIXTURE);
    assessCrossField(CROSS_FIELD_FIXTURE, { redactValues: false });
    expect(JSON.stringify(CROSS_FIELD_FIXTURE)).toBe(snapshot);
  });

  it('هیچ توصیه‌ای «ادغام/حذفِ خودکار» را تجویز نمی‌کند', () => {
    // ⚠️ منطق: توصیه ممکن است واژهٔ «ادغامِ خودکار» را در **نفی** به کار ببرد
    // («ادغامِ خودکار مجاز نیست»). پس نباید روی وجودِ واژه سنجید، بلکه باید
    // سنجید که آیا جمله *تجویز* می‌کند. تجویز = فعلِ امری مثبت پیش از واژه.
    for (const r of assessment.results) {
      const text = r.recommended_resolution_fa;
      expect(text, `توصیهٔ خودکار در ${r.rule_id}`).not.toMatch(
        /(باید|می‌توان)\s+(خودکار\s+)?(ادغام|حذف)\s+شود/i,
      );
      // هر نتیجهٔ سخت باید به تصمیمِ انسانی ارجاع دهد
      if (r.decision === 'HARD_CONFLICT') {
        expect(text).toMatch(/بازبینی|مالک|دستی|اصلاح/);
      }
    }
  });

  it('همان کالا با alias تکراری ⇒ ALLOWED، نه تعارضِ سخت', () => {
    const redundant = byRule('C13-R-redundant-row');
    expect(redundant.length).toBeGreaterThan(0);
    for (const r of redundant) expect(r.decision).toBe('ALLOWED');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('C13 / 22 — گاردِ ایزولاسیون (کدِ آزمایشی نباید به تولید راه یابد)', () => {
  it('ماژول‌های C13 فقط توسطِ ماژول‌های آزمایشی و تست‌ها import می‌شوند', async () => {
    const { execSync } = await import('node:child_process');
    const cmd =
      "grep -rEl \"from '[^']*(cross-field-identity|shadow-assessment)\\\\.candidate'\" src test --include=*.ts || true";
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
          !/(cross-field-identity|shadow-assessment|decision-matrix|cross-type-collision|shadow-evidence|shadow-evidence-cli|identity-integrity-diagnostics|multilingual-normalize)\.candidate\.ts$/.test(f),
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
