import { describe, expect, it } from 'vitest';
import {
  allocateRefundLine,
  settleCreditTotal,
  CreditNoteError,
} from '../src/modules/sales/credit-note';

const line = (over: Partial<Parameters<typeof allocateRefundLine>[0]> = {}) =>
  allocateRefundLine({
    invoice_line_id: 'il-1',
    product_id: 'p-1',
    qty: 1,
    invoice_line: {
      id: 'il-1',
      qty: 10,
      unit_price: 100,
      line_total: 1000,
      tax_amount: 90,
    },
    already_credited_qty: 0,
    ...over,
  });

describe('credit-note · allocateRefundLine', () => {
  it('سهم کاملِ خط وقتی کلِ مقدار مرجوعی باشد = line_total همان خط (شامل تخفیف و مالیات)', () => {
    const r = line({ qty: 10 });
    expect(r.line_total).toBe(1000);
    expect(r.tax_amount).toBe(90);
  });

  it('سهم جزئی به‌تناسب — گرد به ۲ رقم (رفتار Math.round ریپازیتوری)', () => {
    const r = line({ qty: 3, invoice_line: { id: 'il-1', qty: 7, unit_price: 333.335, line_total: 2333.345, tax_amount: 210.001 } });
    // share = 3/7؛ line_total = 2333.345 * 3/7 = 999.99… → 1000.00? محاسبهٔ دقیق را قفل می‌کنیم
    expect(r.line_total).toBe(Math.round((2333.345 * (3 / 7)) * 100) / 100);
    expect(r.tax_amount).toBe(Math.round((210.001 * (3 / 7)) * 100) / 100);
  });

  it('مرجوعیِ بیشتر از باقی‌ماندهٔ خط فاکتور رد می‌شود (credit_exceeds_invoiced_qty)', () => {
    expect(() => line({ qty: 11 })).toThrowError(CreditNoteError);
    try {
      line({ qty: 6, already_credited_qty: 5 });
      expect.unreachable();
    } catch (e) {
      expect((e as CreditNoteError).code).toBe('credit_exceeds_invoiced_qty');
      expect((e as CreditNoteError).details).toMatchObject({
        invoice_line_id: 'il-1',
        already_credited_qty: 5,
        requested_qty: 6,
      });
    }
  });

  it('بستانکار قبلی دقیقاً از سقف کم می‌شود (مرجوعی‌های متعدد روی یک خط)', () => {
    const r = line({ qty: 4, already_credited_qty: 6 }); // 10 − 6 = 4 ⇒ مجاز
    expect(r.qty).toBe(4);
  });

  it('مقدار ۴ رقمیِ فاکتور حفظ می‌شود و بازگشت کاملِ 1.2345 رد نمی‌شود', () => {
    const full = line({
      qty: 1.2345,
      invoice_line: { id: 'il-1', qty: 1.2345, unit_price: 10, line_total: 12.35, tax_amount: 1.02 },
    });
    expect(full.qty).toBe(1.2345);
    expect(full.line_total).toBe(12.35);
    expect(() => line({
      qty: 1.2346,
      invoice_line: { id: 'il-1', qty: 1.2345, unit_price: 10, line_total: 12.35, tax_amount: 1.02 },
    })).toThrowError(CreditNoteError);
  });

  it('سه بازگشت جزئی 1/3 از 100.00 دقیقاً تمام مبلغ را تخصیص می‌دهد', () => {
    const allocations: number[] = [];
    let priorQty = 0;
    let priorAmount = 0;
    for (let i = 0; i < 3; i += 1) {
      const allocated = line({
        qty: 1,
        already_credited_qty: priorQty,
        already_credited_amount: priorAmount,
        invoice_line: { id: 'il-1', qty: 3, unit_price: 33.3333, line_total: 100, tax_amount: 9.99 },
      });
      allocations.push(allocated.line_total);
      priorQty += allocated.qty;
      priorAmount += allocated.line_total;
    }
    expect(allocations).toEqual([33.33, 33.34, 33.33]);
    expect(allocations.reduce((sum, amount) => sum + amount, 0)).toBe(100);
  });
});

describe('credit-note · settleCreditTotal', () => {
  const l = (line_total: number) => ({
    invoice_line_id: 'x',
    product_id: 'p',
    qty: 1,
    unit_price: 1,
    tax_amount: 0,
    line_total,
  });

  it('مجموع ≤ ماندهٔ مجاز ⇒ قبول با جمع دقیق', () => {
    const { total } = settleCreditTotal([l(100), l(50.25)], 200);
    expect(total).toBe(150.25);
  });

  it('مجموع > ماندهٔ مجاز ⇒ خطای credit_exceeds_invoice (fail-closed)', () => {
    try {
      settleCreditTotal([l(100), l(60)], 150);
      expect.unreachable();
    } catch (e) {
      expect((e as CreditNoteError).code).toBe('credit_exceeds_invoice');
      expect((e as CreditNoteError).details).toMatchObject({
        computed_total: '160.00',
        eligible_remaining: '150.00',
      });
    }
  });

  it('مجموع صفر ⇒ خطا (سند بستانکار با مبلغ صفر معنا ندارد)', () => {
    expect(() => settleCreditTotal([], 100)).toThrowError(CreditNoteError);
  });
});
