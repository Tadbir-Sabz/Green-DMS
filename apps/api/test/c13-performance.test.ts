/**
 * TASK-PM-02-C13 — کارایی و اطمینان‌پذیری.
 *
 * اندازه‌های خواسته‌شده: ۱۰۰ · ۱٬۰۰۰ · ۵٬۰۰۰ · ۲۵٬۰۰۰ · ۱۰۰٬۰۰۰.
 *
 * ⚠️ این اعداد **درون‌حافظه‌ای و مصنوعی** روی همین sandbox هستند، **نه** بنچمارکِ
 * تولید. مقیاس‌پذیریِ واقعی به I/O، ایندکس و قفلِ PostgreSQL بستگی دارد.
 */

import { describe, expect, it } from 'vitest';
import {
  assessCrossField,
  type CrossFieldAssessment,
} from '../src/modules/master-data/experimental/cross-field-identity.candidate';
import { makeLargeCrossFieldFixture } from './fixtures/c13-cross-field-identities';

interface Measurement {
  rows: number;
  ms: number;
  results: number;
  hard: number;
  soft: number;
  review: number;
  allowed: number;
  notComparable: number;
  suppressedPairs: number;
  duplicatesSuppressed: number;
  heapDeltaMb: number;
  msPer1000: number;
}

function measure(rows: ReturnType<typeof makeLargeCrossFieldFixture>): Measurement {
  const before = process.memoryUsage().heapUsed;
  const t0 = performance.now();
  const a: CrossFieldAssessment = assessCrossField(rows, { redactValues: false });
  const ms = performance.now() - t0;
  const after = process.memoryUsage().heapUsed;
  return {
    rows: rows.length,
    ms: Math.round(ms),
    results: a.summary.total,
    hard: a.summary.by_decision.HARD_CONFLICT,
    soft: a.summary.by_decision.SOFT_CONFLICT,
    review: a.summary.by_decision.MANUAL_REVIEW,
    allowed: a.summary.by_decision.ALLOWED,
    notComparable: a.summary.by_decision.NOT_COMPARABLE,
    suppressedPairs: a.summary.raw_pairs_suppressed,
    duplicatesSuppressed: a.duplicates_suppressed,
    heapDeltaMb: Number(((after - before) / 1048576).toFixed(1)),
    msPer1000: Math.round((ms / rows.length) * 1000 * 100) / 100,
  };
}

describe('C13 / 16 — کارایی در اندازه‌های خواسته‌شده', () => {
  it('۱۰۰ · ۱٬۰۰۰ · ۵٬۰۰۰ · ۲۵٬۰۰۰ · ۱۰۰٬۰۰۰ هویت', () => {
    const sizes = [100, 1000, 5000, 25000, 100000];
    const out: Measurement[] = [];
    for (const n of sizes) {
      // n «هویت» ⇒ fixture سه‌ردیفی، پس تعدادِ ردیف‌ها ≈ 3n
      out.push(measure(makeLargeCrossFieldFixture(n)));
    }
    console.log('C13-PERF|' + JSON.stringify(out));

    // همه باید نتیجه بدهند، نه سقوط
    for (const m of out) {
      expect(m.rows).toBeGreaterThan(0);
      expect(m.results).toBeGreaterThan(0);
    }

    // مقیاسِ نزدیک به خطی: هزینهٔ هر ۱۰۰۰ ردیف نباید با بزرگ‌شدن منفجر شود.
    // آستانهٔ سخاوتمندانه چون sandbox مشترک است و GC مداخله می‌کند.
    const per1000 = out.map((m) => m.msPer1000);
    const worst = Math.max(...per1000);
    const best = Math.min(...per1000);
    expect(worst / best, `پراکندگیِ هزینهٔ هر ۱۰۰۰ ردیف: ${per1000.join(', ')}`).toBeLessThan(40);
  }, 300_000);

  it('گروه‌بندی، انفجارِ جفت‌ها را مهار می‌کند (نه O(n²) نتیجه)', () => {
    const rows = makeLargeCrossFieldFixture(5000);
    const a = assessCrossField(rows, { redactValues: false });
    // تعدادِ نتایج باید بسیار کمتر از تعدادِ جفت‌های ممکن باشد
    const n = rows.length;
    const possiblePairs = (n * (n - 1)) / 2;
    expect(a.summary.total).toBeLessThan(possiblePairs / 1000);
    // و شاهدِ مهارشدن ثبت شده است
    expect(a.summary.raw_pairs_suppressed).toBeGreaterThan(0);
  }, 300_000);

  it('هیچ نتیجهٔ تکراری باقی نمی‌ماند (حذفِ تکرارِ معنایی کار می‌کند)', () => {
    const rows = makeLargeCrossFieldFixture(3000);
    const a = assessCrossField(rows, { redactValues: false });
    const ids = a.results.map((r) => r.collision_id);
    expect(new Set(ids).size).toBe(ids.length);
  }, 300_000);

  it('قطعیت در اندازهٔ بزرگ: دو اجرا بایت‌به‌بایت یکسان', () => {
    const rows = makeLargeCrossFieldFixture(2000);
    const a = assessCrossField(rows, { redactValues: false });
    const b = assessCrossField(rows, { redactValues: false });
    expect(JSON.stringify(a.summary)).toBe(JSON.stringify(b.summary));
    expect(a.results.map((r) => r.collision_id)).toEqual(b.results.map((r) => r.collision_id));
  }, 300_000);

  it('قطعیت در برابرِ ترتیبِ ورودی، در اندازهٔ بزرگ', () => {
    const rows = makeLargeCrossFieldFixture(1000);
    const shuffled = [...rows].sort((x, y) => (x.source_ref < y.source_ref ? 1 : -1));
    const a = assessCrossField(rows, { redactValues: false });
    const b = assessCrossField(shuffled, { redactValues: false });
    expect(a.summary.by_decision).toEqual(b.summary.by_decision);
    expect([...a.results.map((r) => r.collision_id)].sort()).toEqual(
      [...b.results.map((r) => r.collision_id)].sort(),
    );
  }, 300_000);

  it('بازیابی از قطع: پردازشِ تکه‌تکه همان تجمعِ کامل را می‌دهد', () => {
    // شبیه‌سازیِ «قطعِ وسطِ کار»: مجموعه را به دو نیم می‌کنیم و جدا ارزیابی می‌کنیم.
    // برخوردهایی که هر دو طرفشان در یک نیمه‌اند باید هر بار پیدا شوند.
    const rows = makeLargeCrossFieldFixture(600);
    const full = assessCrossField(rows, { redactValues: false });
    const half = Math.floor(rows.length / 2);

    // هر برخوردِ کاملاً درونِ نیمهٔ اول باید در ارزیابیِ همان نیمه هم دیده شود
    const firstHalfKeys = new Set(rows.slice(0, half).map((r) => r.source_ref));
    const intraHalf = full.results.filter((r) =>
      r.parties.every((p) => firstHalfKeys.has(p.source_ref)),
    );
    const partial = assessCrossField(rows.slice(0, half), { redactValues: false });
    const partialIds = new Set(partial.results.map((r) => r.collision_id));

    let recovered = 0;
    for (const r of intraHalf) if (partialIds.has(r.collision_id)) recovered += 1;
    expect(intraHalf.length).toBeGreaterThan(0);
    expect(recovered).toBe(intraHalf.length);
  }, 300_000);
});
