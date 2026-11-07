import { describe, expect, it } from 'vitest';
import {
  dec,
  discountPct,
  lineTax,
  marginPct,
  money,
  roundMoney2,
  roundPct4,
  unitPrice,
} from '../src/common/financial';

/**
 * قراردادِ گرد‌کردنِ مالی — «حفظِ عینِ رفتارِ موجود» (نیازمندیِ ۱۳ TASK-24).
 *
 * این تست‌ها عمداً رفتارِ نامتقارنِ Math.round برای مقادیرِ منفی را قفل می‌کنند.
 * اگر روزی کسی «اصلاح» به half-away-from-zero را اعمال کند، این تست شکسته می‌شود و
 * باید تصمیمِ کسب‌وکار + بازآزمونِ اسنادِ تاریخی گرفته شود — نه تغییرِ خاموش.
 */
describe('F1 — money() برای مبالغِ مثبت', () => {
  it('گرد‌کردن به ۲ رقم با نیمه‌ها به سمت +∞', () => {
    // مقادیرِ ۰٫۱۲۵/۱٫۳۷۵ در نمایشِ دودویی دقیق‌اند ⇒ قراردادِ نیمه‌به‌بالا قطعی است
    expect(money(0.125)).toBe('0.13');
    expect(money(1.375)).toBe('1.38');
    expect(money(1.004)).toBe('1.00');
    expect(money(2.5)).toBe('2.50');
    expect(money(0)).toBe('0.00');
    expect(money(1234.567)).toBe('1234.57');
  });

  it('رفتارِ float حفظ می‌شود (1.005 ⇒ 1.00) — تغییرش اسنادِ تاریخی را جابه‌جا می‌کند', () => {
    // 1.005 در IEEE754 کمی کمتر از 1.005 است ⇒ ×۱۰۰ < 100.5 ⇒ گرد به پایین
    expect(money(1.005)).toBe('1.00');
    expect(money(1.015)).toBe('1.01');
  });
});

describe('F2 — money() برای مبالغِ منفی (رفتارِ حفظ‌شده)', () => {
  it('نیمه‌های منفی به سمت +∞ گرد می‌شوند (Math.round)', () => {
    expect(money(-1.005)).toBe('-1.00');
    expect(money(-1.015)).toBe('-1.01');
    expect(money(-2.5)).toBe('-2.50');
    expect(money(-0.001)).toBe('0.00');
    expect(money(-1234.565)).toBe('-1234.56');
  });

  it('roundMoney2 همان قرارداد را به عدد برمی‌گرداند', () => {
    expect(roundMoney2(-0.125)).toBe(-0.12);
    expect(roundMoney2(0.125)).toBe(0.13);
    expect(roundMoney2(-0.004)).toBe(-0);
  });
});

describe('F3 — مالیاتِ قراردادی', () => {
  it('Math.round(gross × rate)/100 — نه گرد‌کردنِ ریالِ صحیح', () => {
    expect(lineTax(1620, 9)).toBe(145.8);
    expect(lineTax(1000, 9)).toBe(90);
    expect(lineTax(0, 9)).toBe(0);
    expect(lineTax(1000, 0)).toBe(0);
    expect(lineTax(1000, -5)).toBe(0);
  });

  it('مبلغِ منفی (مرجوعی/اصلاحیه) با همان قاعده', () => {
    expect(lineTax(-1000, 9)).toBe(-90);
    expect(lineTax(-1620, 9)).toBe(-145.8);
    expect(lineTax(-0.5, 9)).toBe(-0.04); // Math.round(-4.5) = -4 ⇒ ‎-0.04
  });
});

describe('F4 — قیمتِ واحد و درصدها', () => {
  it('unitPrice چهار رقم اعشار', () => {
    expect(unitPrice(1000)).toBe('1000.0000');
    expect(unitPrice(1234.56789)).toBe('1234.5679');
    expect(unitPrice(0.00004)).toBe('0.0000');
  });

  it('roundPct4/roundPct2/discountPct', () => {
    expect(roundPct4(22.222222)).toBe(22.2222);
    expect(discountPct(180, 1800)).toBe(10);
    expect(discountPct(1, 0)).toBe(0);
    expect(discountPct(-10, 100)).toBe(-10);
  });

  it('dec() ورودی‌های null/رشته/عدد را ایمن می‌کند', () => {
    expect(dec(null)).toBe(0);
    expect(dec(undefined)).toBe(0);
    expect(dec('')).toBe(0);
    expect(dec('12.3400')).toBe(12.34);
    expect(dec('abc' as unknown as string)).toBe(0);
  });
});

describe('F5 — درصدِ حاشیهٔ سود', () => {
  it('معادلهٔ (درآمد − بهای تمام‌شده)/درآمد', () => {
    expect(marginPct(1000, 700)).toBe(30);
    expect(marginPct(900, 700)).toBe(22.2222);
    expect(marginPct(1000, 1000)).toBe(0);
    expect(marginPct(1000, 1200)).toBe(-20);
  });

  it('درآمدِ صفر ⇒ درصد تعریف‌نشده (null) نه صفر/بی‌نهایت', () => {
    expect(marginPct(0, 100)).toBeNull();
    expect(marginPct(0, 0)).toBeNull();
  });
});
