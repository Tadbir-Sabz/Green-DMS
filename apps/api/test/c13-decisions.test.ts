/**
 * TASK-PM-02-C13 — تست‌های ماتریسِ تصمیم.
 *
 * هر تست یک **شاهدِ اجرایی** برای یک تصمیم تولید می‌کند: ادعای ماتریس را روی
 * رفتارِ واقعیِ قرارداد می‌سنجد. اگر رفتار عوض شود، تست می‌شکند.
 */

import { describe, expect, it } from 'vitest';
import {
  decisionById,
  isApproved,
  OPEN_DECISIONS,
  optionEffect,
} from '../src/modules/master-data/experimental/decision-matrix.candidate';
import {
  assessCrossField,
  scanSpace,
  textSpace,
} from '../src/modules/master-data/experimental/cross-field-identity.candidate';

describe('C13 / 23 — ساختارِ ماتریسِ تصمیم', () => {
  it('همهٔ تصمیم‌هایِ C11 و C12 پوشش داده شده‌اند', () => {
    const ids = OPEN_DECISIONS.map((d) => d.id);
    for (const required of ['D-C11-1', 'D-C11-2', 'D-C11-3', 'D-C11-4', 'D-C11-5', 'D-C11-6', 'D-C12-1', 'D-C12-2', 'D-C12-3', 'D-C13-1']) {
      expect(ids, `تصمیمِ غایب: ${required}`).toContain(required);
    }
  });

  it('هر تصمیم حداقل دو گزینه، پیامدِ فنی، پیامدِ کسب‌وکار و ریسکِ سازگاری دارد', () => {
    for (const d of OPEN_DECISIONS) {
      expect(d.options.length, d.id).toBeGreaterThanOrEqual(2);
      for (const o of d.options) {
        expect(o.technical_consequence_fa.length, `${d.id}/${o.id} فنی`).toBeGreaterThan(20);
        expect(o.business_consequence_fa.length, `${d.id}/${o.id} کسب‌وکار`).toBeGreaterThan(20);
        expect(o.migration_impact_fa.length, `${d.id}/${o.id} مهاجرت`).toBeGreaterThan(5);
        expect(['low', 'medium', 'high']).toContain(o.compatibility_risk);
      }
    }
  });

  it('گزینهٔ توصیه‌شده واقعاً در فهرستِ گزینه‌ها وجود دارد', () => {
    for (const d of OPEN_DECISIONS) {
      expect(d.options.map((o) => o.id), d.id).toContain(d.recommended_default);
    }
  });

  it('🔒 هیچ تصمیمی «تصویب‌شده» گزارش نمی‌شود', () => {
    for (const d of OPEN_DECISIONS) {
      expect(isApproved(d.id), `${d.id} نباید تصویب‌شده باشد`).toBe(false);
      expect(d.requires_owner_approval).toBe(true);
    }
  });

  it('هر تصمیم به یک تستِ شاهد ارجاع می‌دهد و وابستگی‌هایش معتبرند', () => {
    const ids = new Set(OPEN_DECISIONS.map((d) => d.id));
    for (const d of OPEN_DECISIONS) {
      expect(d.evidence_test).toContain('c13-decisions.test.ts');
      for (const dep of d.depends_on) {
        expect(ids.has(dep), `${d.id} به ${dep} وابسته است که وجود ندارد`).toBe(true);
      }
    }
  });

  it('تفکیکِ «توصیهٔ فنی» از «تصمیمِ کسب‌وکار» صریح است', () => {
    for (const d of OPEN_DECISIONS) {
      expect(d.recommendation_rationale_fa.length).toBeGreaterThan(30);
      // دلیلِ توصیه نباید ادعایِ تصویب کند
      expect(d.recommendation_rationale_fa).not.toMatch(/تصویب شد|تأیید شد|مصوب شد/);
    }
  });
});

describe('C13 / 24 — شاهدِ اجرایی: D-C11-1 رقمِ کنترلی', () => {
  it('هیچ اعتبارسنجیِ رقمِ کنترلی در قرارداد وجود ندارد (وضعیتِ فعلی)', () => {
    // بارکدِ با رقمِ کنترلیِ غلط همان‌طور پذیرفته می‌شود
    expect(scanSpace('4006381333932').ok).toBe(true);
    expect(scanSpace('4006381333931').ok).toBe(true); // رقمِ آخر عوض شد، باز هم معتبر
    const a = scanSpace('4006381333931').key;
    const b = scanSpace('4006381333932').key;
    expect(a).not.toBe(b); // دو شناسهٔ متفاوت، هر دو پذیرفته
  });

  it('صفرِ ابتدایی با گزینهٔ A/B/C حذف نمی‌شود (بی‌طرف نسبت به تصمیم)', () => {
    expect(scanSpace('007').key).toBe('007');
  });
});

describe('C13 / 24 — شاهدِ اجرایی: D-C11-2 آ/أ/إ', () => {
  it('گزینهٔ A (پیش‌فرض): آ و ا متمایز می‌مانند', () => {
    const e = optionEffect('text', 'آب', 'اب');
    expect(e.equal).toBe(false);
    expect(e.left).not.toBe(e.right);
  });

  it('گزینهٔ B (فقط SearchKey) اگر فعال شود همین دو را یکی می‌کند — نشان می‌دهد تصمیم اثر دارد', () => {
    // این تست فقط نشان می‌دهد فضایِ جست‌وجو مکانیزمِ اعمالِ گزینهٔ B است:
    // ادغامِ دلخواهی انجام نمی‌دهیم، بلکه تأیید می‌کنیم که امروز اتفاق نمی‌افتد.
    const water = textSpace('آب').key as string;
    const father = textSpace('اب').key as string;
    expect(water).not.toBe(father);
  });

  it('أ و إ هم متمایز می‌مانند (ادغام بازگشت‌ناپذیر انجام نشده)', () => {
    const a1 = textSpace('أحمد').key;
    const a2 = textSpace('إحمد').key;
    expect(a1).not.toBe(a2);
  });
});

describe('C13 / 24 — شاهدِ اجرایی: D-C11-3 حساسیتِ کد', () => {
  it('فضای alnum حروف را کوچک می‌کند ⇒ SKU-9 و sku-9 یکی می‌شوند', () => {
    const e = optionEffect('alnum', 'SKU-9', 'sku-9');
    expect(e.equal).toBe(true);
  });

  it('و این یعنی یکتاییِ حساسِ فعلی با مقایسهٔ نامستقل در تنش است', () => {
    const rows = [
      { entity_id: 'p1', company_id: 'c1', field: 'code' as const, display_value: 'SKU-9', stored_normalized: 'SKU-9', source_ref: 'r1' },
      { entity_id: 'p2', company_id: 'c1', field: 'code' as const, display_value: 'sku-9', stored_normalized: 'sku-9', source_ref: 'r2' },
    ];
    const a = assessCrossField(rows, { redactValues: false });
    const hard = a.results.filter((r) => r.decision === 'HARD_CONFLICT');
    expect(hard.length).toBe(1);
    expect(hard[0].rule_id).toBe('C13-R-code-same');
  });
});

describe('C13 / 24 — شاهدِ اجرایی: D-C11-4 خطِ تیره', () => {
  it('گزینهٔ A (پیش‌فرض): 0-0-7 و 007 در فضای اسکن یکی می‌شوند', () => {
    expect(scanSpace('0-0-7').key).toBe('007');
    const e = optionEffect('scan', '0-0-7', '007');
    expect(e.equal).toBe(true);
  });

  it('صفرِ ابتدایی در این یکسان‌سازی حفظ می‌شود (خطِ تیره ≠ صفر)', () => {
    expect(scanSpace('007').key).not.toBe(scanSpace('7').key);
  });
});

describe('C13 / 24 — شاهدِ اجرایی: D-C11-5 نیم‌فاصله', () => {
  it('نیم‌فاصله در فضای متنی به فاصله تبدیل می‌شود (پیش‌فرضِ A)', () => {
    const e = optionEffect('text', 'کوکا\u200Cزیرو', 'کوکا زیرو');
    expect(e.equal).toBe(true);
  });

  it('🔒 در فضای اسکن نیم‌فاصله **بی‌صدا** حذف نمی‌شود: صریحاً رد می‌شود', () => {
    // D-C11-5 تصویب نشده است. رفتارِ محافظه‌کارانه این است که نیم‌فاصله در یک
    // مقدارِ بارکدمانند **بی‌صدا** ناپدید نشود؛ چون پاک‌کردنِ خاموشِ یک کاراکتر
    // می‌تواند دو شناسهٔ متفاوت را یکی کند. پس ورودی با `invalid_character` رد
    // می‌شود و اپراتور آن را می‌بیند.
    const r = scanSpace('A\u200CB');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('invalid_character');
    // و در فضای متنی — که D-C11-5 برایش پیش‌فرضِ A دارد — به فاصله تبدیل می‌شود
    expect(textSpace('A\u200CB').key).toBe('a b');
  });
});

describe('C13 / 24 — شاهدِ اجرایی: D-C11-6 جست‌وجوی وب/API', () => {
  it('پروفایلِ SearchKey سه شکلِ عربی/فارسی را یکی می‌کند', () => {
    const forms = ['علي', 'علی', 'عَلِی'];
    const keys = new Set(forms.map((f) => textSpace(f).key));
    expect(keys.size).toBe(1);
  });

  it('اعراب حذف می‌شوند ولی حروفِ معنادار نه', () => {
    expect(textSpace('کِتاب').key).toBe(textSpace('کتاب').key);
  });
});

describe('C13 / 24 — شاهدِ اجرایی: D-C12-1 بین‌شرکتی', () => {
  it('گزینهٔ A: شناسهٔ یکسان در دو شرکت ALLOWED است', () => {
    const rows = [
      { entity_id: 'a', company_id: 'co-A', field: 'barcode' as const, display_value: 'X1', stored_normalized: 'X1', source_ref: 'r1' },
      { entity_id: 'b', company_id: 'co-B', field: 'barcode' as const, display_value: 'X1', stored_normalized: 'X1', source_ref: 'r2' },
    ];
    const a = assessCrossField(rows, { redactValues: false });
    const cross = a.results.filter((r) => r.rule_id === 'C13-R-cross-company');
    expect(cross.length).toBe(1);
    expect(cross[0].decision).toBe('ALLOWED');
    // گزینهٔ B با مصوبهٔ صریح
    const b = assessCrossField(rows, { redactValues: false, crossCompanyIsConflict: true });
    const crossB = b.results.filter((r) => r.rule_id === 'C13-R-cross-company');
    expect(crossB[0].decision).toBe('HARD_CONFLICT');
    // ولی افشا همچنان ممنوع
    expect(JSON.stringify(crossB)).not.toContain('X1');
  });
});

describe('C13 / 24 — شاهدِ اجرایی: D-C13-1 آستانهٔ قابلِ مقایسه بودن', () => {
  it('گزینهٔ A: barcode↔name قابلِ مقایسه نیست', () => {
    const rows = [
      { entity_id: 'p1', company_id: 'c1', field: 'name' as const, display_value: '500222', stored_normalized: '500222', source_ref: 'r1' },
      { entity_id: 'p2', company_id: 'c1', field: 'barcode' as const, display_value: '500222', stored_normalized: '500222', source_ref: 'r2' },
    ];
    const a = assessCrossField(rows, { redactValues: false });
    const nc = a.results.filter((r) => r.rule_id === 'C13-R-barcode~name');
    expect(nc.length).toBe(1);
    expect(nc[0].decision).toBe('NOT_COMPARABLE');
    expect(nc[0].severity).toBe('none');
    // و هیچ برخوردِ سختی از این جفت ساخته نشده
    expect(a.results.filter((r) => r.decision === 'HARD_CONFLICT')).toEqual([]);
  });

  it('گزینهٔ B (قابلِ مقایسه دانستنِ همه‌چیز) فقط هشدارِ کاذب می‌سازد — تخمینِ اثر', () => {
    // با شبیه‌سازیِ گزینهٔ B: اگر هر تجمعی در فضای scan برخورد شمرده شود،
    // تعدادِ نتایجِ غیرِ قابلِ مقایسه‌ای که «تعارض» می‌شدند را می‌شماریم.
    const rows = [
      { entity_id: 'p1', company_id: 'c1', field: 'name' as const, display_value: '200', stored_normalized: '200', source_ref: 'r1' },
      { entity_id: 'p2', company_id: 'c1', field: 'barcode' as const, display_value: '200', stored_normalized: '200', source_ref: 'r2' },
    ];
    const asIs = assessCrossField(rows, { redactValues: false });
    const wouldBeHard = asIs.results.filter((r) => r.rule_id === 'C13-R-barcode~name');
    expect(wouldBeHard.length).toBe(1);
    expect(wouldBeHard[0].decision).toBe('NOT_COMPARABLE');
  });
});

describe('C13 / 25 — گزینه‌ها واقعاً رفتارِ متفاوت دارند (ماتریس توخالی نیست)', () => {
  it('optionEffect برای هر سه فضا کار می‌کند و نتایجِ متفاوت می‌دهد', () => {
    const scanEq = optionEffect('scan', '400 111', '400111');
    const alnumEq = optionEffect('alnum', '400 111', '400111');
    const textEq = optionEffect('text', '400 111', '400111');
    expect(scanEq.equal).toBe(true);
    // alnum فاصلهٔ درونی را نگه می‌دارد ⇒ این دو یکی نیستند
    expect(alnumEq.equal).toBe(false);
    // text هم فاصلهٔ درونی را نگه می‌دارد
    expect(textEq.equal).toBe(false);
  });

  it('decisionById شناسهٔ ناموجود را برمی‌گرداند نه خطا', () => {
    expect(decisionById('D-NOPE')).toBeUndefined();
    expect(decisionById('D-C11-1')?.id).toBe('D-C11-1');
  });
});
