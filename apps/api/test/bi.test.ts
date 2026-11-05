import { describe, expect, it } from 'vitest';
import { classifyAbc } from '../src/modules/bi/bi.service';
import { divideFixed, formatFixed, ratioPct, toFixed } from '../src/modules/bi/decimal';

/**
 * تستِ تابعِ خالصِ طبقه‌بندی ABC (بدون DB). SQLِ BI در CI روی materialized viewهای
 * واقعی سنجیده می‌شود؛ اینجا منطقِ پارتو (مرزهای A/B/C بر اساسِ مجموعِ تجمعیِ *پیش از*
 * هر قلم)، گردکردنِ درصدها و نگهداریِ qty پوشش داده می‌شود.
 */

describe('classifyAbc — طبقه‌بندی پارتو', () => {
  it('A تا ۸۰٪، B تا ۹۵٪، C بقیه (بر پایهٔ مجموعِ تجمعیِ پیش از هر قلم)', () => {
    const rows = [
      { id: '1', code: 'C1', name: 'یک', revenue: 70 },
      { id: '2', code: 'C2', name: 'دو', revenue: 20 },
      { id: '3', code: 'C3', name: 'سه', revenue: 5 },
      { id: '4', code: 'C4', name: 'چهار', revenue: 5 },
    ];
    const { items, totalRevenue } = classifyAbc(rows);
    expect(totalRevenue).toBe(100);
    expect(items.map((i) => i.class)).toEqual(['A', 'A', 'B', 'C']);
    expect(items.map((i) => i.share_pct)).toEqual([70, 20, 5, 5]);
    expect(items.map((i) => i.cumulative_pct)).toEqual([70, 90, 95, 100]);
    expect(items[0].revenue).toBe('70.00');
  });

  it('یک قلمِ مسلط (۹۰٪) A می‌شود، نه B', () => {
    const { items } = classifyAbc([
      { id: '1', code: 'X', name: 'x', revenue: 90 },
      { id: '2', code: 'Y', name: 'y', revenue: 10 },
    ]);
    expect(items.map((i) => i.class)).toEqual(['A', 'B']);
  });

  it('آستانه‌های سفارشی رعایت می‌شوند', () => {
    const { items } = classifyAbc(
      [
        { id: '1', code: 'X', name: 'x', revenue: 50 },
        { id: '2', code: 'Y', name: 'y', revenue: 50 },
      ],
      40,
      70,
    );
    expect(items.map((i) => i.class)).toEqual(['A', 'B']);
  });

  it('درصدِ سهم به دو رقم گرد می‌شود', () => {
    const { items } = classifyAbc([
      { id: '1', code: 'X', name: 'x', revenue: 1 },
      { id: '2', code: 'Y', name: 'y', revenue: 2 },
    ]);
    // سهم‌ها: 33.33 و 66.67
    expect(items[0].share_pct).toBe(33.33);
    expect(items[1].share_pct).toBe(66.67);
  });

  it('ورودیِ خالی → خروجیِ خالی و مجموعِ صفر', () => {
    const { items, totalRevenue } = classifyAbc([]);
    expect(items).toEqual([]);
    expect(totalRevenue).toBe(0);
  });

  it('qty (برای کالاها) به‌صورت decimal string نگه داشته می‌شود', () => {
    const { items } = classifyAbc([{ id: '1', code: 'P', name: 'p', revenue: 100, qty: 25.5 }]);
    expect(items[0].qty).toBe('25.50');
  });
});

/* ------------------------------------------------------------------ *
 * دقتِ مالی (P1): حذفِ تبدیل‌هایِ ناامنِ float از محاسباتِ پولی.
 * مبالغِ پستگرس numeric هستند و به‌صورتِ متن می‌آیند؛ این تست‌ها اثبات می‌کنند
 * که جمع/سهم/گردکردن اکنون «دقیق» است و مبالغِ بزرگِ ریالی رقم از دست نمی‌دهند.
 * ------------------------------------------------------------------ */

describe('دقتِ مالی — حسابِ اعشاریِ دقیق به‌جای float', () => {
  it('مبالغِ بزرگِ فراتر از ۲^۵۳ دقیق جمع می‌شوند (float رقم از دست می‌داد)', () => {
    const big = '9007199254740993'; // ۲^۵۳+۱ → در double به ۲^۵۳ گرد می‌شود
    const { items, totalRevenueText } = classifyAbc([
      { id: '1', code: 'A', name: 'a', revenue: big },
      { id: '2', code: 'B', name: 'b', revenue: big },
    ]);
    expect(totalRevenueText).toBe('18014398509481986.00');
    expect(items[0].revenue).toBe('9007199254740993.00');
    // شاهدِ اینکه مسیرِ Number() این دقت را از دست می‌داد:
    const viaFloat = (Number(big) + Number(big)).toFixed(2);
    expect(viaFloat).toBe('18014398509481984.00');
    expect(totalRevenueText).not.toBe(viaFloat);
  });

  it('جمعِ کسرها بدونِ خطایِ انباشتهٔ شناور', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      id: `${i}`, code: `c${i}`, name: `n${i}`, revenue: '0.1',
    }));
    expect(classifyAbc(rows).totalRevenueText).toBe('1.00');
  });

  it('رشتهٔ numeric با ۱۸ رقمِ صحیح و اعشار → بی‌از‌دست‌رفتنِ دقت', () => {
    const { items } = classifyAbc([
      { id: '1', code: 'x', name: 'x', revenue: '123456789012345678.99' },
    ]);
    expect(items[0].revenue).toBe('123456789012345678.99');
  });

  it('قاعدهٔ گردکردنِ «نیمه به بالا» روی مقدارِ دقیق حفظ می‌شود (۱۲٫۳۴۵٪ → ۱۲٫۳۵)', () => {
    const { items } = classifyAbc([
      { id: '1', code: 'a', name: 'a', revenue: '98.76' },
      { id: '2', code: 'b', name: 'b', revenue: '701.24' },
    ]);
    expect(items[0].share_pct).toBe(12.35);
    // ۷۰۱٫۲۴ از ۸۰۰ = «دقیقاً» ۸۷٫۶۵۵٪ → نیمه‌به‌بالا = ۸۷٫۶۶
    expect(items[1].share_pct).toBe(87.66);
    expect(items[0].cumulative_pct).toBe(12.35);
    expect(items[1].cumulative_pct).toBe(100);
    // مسیرِ floatِ پیشین هم برای همین ورودی‌ها ۱۲٫۳۵ و ۸۷٫۶۶ می‌داد؛ یعنی
    // «قاعدهٔ گردکردن» تغییر نکرده، فقط دیگر روی تقریبِ دودویی حساب نمی‌شود.
    const legacyRound = (n: number, d: number): number => {
      const f = 10 ** d;
      return Math.round((n + Number.EPSILON) * f) / f;
    };
    expect(legacyRound((98.76 / 800) * 100, 2)).toBe(items[0].share_pct);
    expect(legacyRound((701.24 / 800) * 100, 2)).toBe(items[1].share_pct);
  });

  it('درآمدِ منفی: در نمایش حفظ، در «کل» شمرده نمی‌شود (همان رفتارِ پیشین)', () => {
    const { items, totalRevenueText } = classifyAbc([
      { id: '1', code: 'a', name: 'a', revenue: '100' },
      { id: '2', code: 'b', name: 'b', revenue: '-25' },
    ]);
    expect(totalRevenueText).toBe('100.00');
    expect(items[1].revenue).toBe('-25.00');
    expect(items[1].share_pct).toBe(-25);
    expect(items[1].cumulative_pct).toBe(100);
    expect(items[1].class).toBe('C');
  });

  it('مقدارِ نامعتبر/تهی → صفرِ امن و بدونِ NaN در خروجی', () => {
    const { items, totalRevenueText } = classifyAbc([
      { id: '1', code: 'a', name: 'a', revenue: null as unknown as string },
      { id: '2', code: 'b', name: 'b', revenue: 'garbage' },
      { id: '3', code: 'c', name: 'c', revenue: '50' },
    ]);
    expect(totalRevenueText).toBe('50.00');
    expect(items[0].revenue).toBe('0.00');
    expect(items[1].revenue).toBe('0.00');
    for (const it of items) {
      expect(Number.isNaN(it.share_pct)).toBe(false);
      expect(Number.isNaN(it.cumulative_pct)).toBe(false);
    }
  });

  it('qty اعشاری به‌صورتِ دقیق قالب‌بندی می‌شود', () => {
    const { items } = classifyAbc([
      { id: '1', code: 'p', name: 'p', revenue: '100', qty: '1234.567' },
    ]);
    expect(items[0].qty).toBe('1234.57');
  });

  it('مجموعِ تجمعی با دادهٔ واقعیِ ریالیِ بزرگ دقیق می‌ماند', () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({
      id: `${i}`, code: `c${i}`, name: `n${i}`, revenue: `${1000000000000 + i}`,
    }));
    const { items, totalRevenueText } = classifyAbc(rows);
    expect(totalRevenueText).toBe('25000000000300.00');
    expect(items[items.length - 1].cumulative_pct).toBe(100);
  });
});

describe('decimal — واحدِ حسابِ مقیاس‌ثابتِ BigInt', () => {
  it('قاعدهٔ floor(x+0.5) را بازتولید می‌کند (سازگار با Math.round پیشین)', () => {
    expect(formatFixed(toFixed('0.125')!, 2)).toBe('0.13');
    expect(formatFixed(toFixed('-0.125')!, 2)).toBe('-0.12'); // نیمه به سمتِ +∞
    expect(formatFixed(toFixed('-0.001')!, 2)).toBe('0.00'); // بدونِ «-0.00»
    expect(formatFixed(toFixed('2.675')!, 2)).toBe('2.68'); // در float: ۲٫۶۷ می‌شد
  });

  it('ورودی‌هایِ numericِ پستگرس را درست تجزیه می‌کند', () => {
    expect(formatFixed(toFixed('1234567.89')!, 2)).toBe('1234567.89');
    expect(formatFixed(toFixed('.5')!, 2)).toBe('0.50');
    expect(formatFixed(toFixed('-0')!, 2)).toBe('0.00');
    expect(formatFixed(toFixed('7')!, 2)).toBe('7.00');
    expect(toFixed('abc')).toBeNull();
    expect(toFixed(Number.NaN)).toBeNull();
    expect(toFixed(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('تقسیم بر صفر: نرخ → null و درصد → ۰ (بدونِ NaN/Infinity)', () => {
    expect(divideFixed(toFixed('1')!, toFixed('0')!, 4)).toBeNull();
    expect(ratioPct(toFixed('1')!, toFixed('0')!, 2)).toBe(0);
    expect(divideFixed(toFixed('1234.5678')!, toFixed('2')!, 4)).toBe(617.2839);
  });

  it('اعدادِ JS هم پذیرفته می‌شوند (سازگاریِ فراخوان‌هایِ قدیمی)', () => {
    expect(formatFixed(toFixed(70)!, 2)).toBe('70.00');
    expect(formatFixed(toFixed(25.5)!, 2)).toBe('25.50');
  });
});

describe('سازگاریِ قاعدهٔ گردکردن با پیاده‌سازیِ پیشین (بدونِ تغییرِ خاموش)', () => {
  /** همان round() قدیمیِ bi.service برای مقایسهٔ مستقیم. */
  const legacy = (n: number, d: number): string => {
    const f = 10 ** d;
    return (Math.round((n + Number.EPSILON) * f) / f).toFixed(2);
  };

  it('برای همهٔ مرزهایِ نیمه، خروجیِ حسابِ دقیق با خروجیِ پیشین یکی است', () => {
    const ties = ['0.145', '0.125', '2.675', '1.005', '8.175', '0.045', '99.995', '1234.565'];
    for (const v of ties) {
      const exact = classifyAbc([{ id: '1', code: 'x', name: 'x', revenue: v }]).items[0].revenue;
      expect(exact, `revenue=${v}`).toBe(legacy(Number(v), 2));
    }
  });

  it('فرمتِ نمایشی همیشه دقیقاً دو رقمِ اعشار دارد (سازگاریِ API)', () => {
    for (const v of ['0', '5', '5.5', '1000000', '0.001']) {
      const s = classifyAbc([{ id: '1', code: 'x', name: 'x', revenue: v }]).items[0].revenue;
      expect(s).toMatch(/^-?\d+\.\d{2}$/);
    }
    expect(classifyAbc([]).totalRevenueText).toBe('0.00');
  });
});
