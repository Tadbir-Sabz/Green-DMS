import { describe, expect, it } from 'vitest';
import {
  evaluateCreditGate,
  hasApprovableRestriction,
  hasHardRestriction,
  type CreditGateRow,
} from '../src/modules/sales/credit-policy';

/**
 * تست‌های واحد برای credit-policy.ts — منطقِ خالصِ دروازهٔ اعتبار (بدون DB).
 * این فایل در jobِ «unit» (بدون DATABASE_URL) اجرا می‌شود و باید بدونِ مهاجرت/اتصال کار کند.
 */

const baseRow = (over: Partial<CreditGateRow> = {}): CreditGateRow => ({
  customer_id: '11111111-1111-4111-8111-111111111111',
  branch_id: '22222222-2222-4222-8222-222222222222',
  status: 'active',
  segment_id: null,
  credit_limit: 0,
  extra_limit: 0,
  total_due: 0,
  committed_open_orders: 0,
  cheque_allowed: true,
  max_open_cheques: null,
  open_cheques_count: 0,
  open_cheques_amount: 0,
  block_on_overdue: false,
  max_overdue_days: 0,
  oldest_overdue_days: 0,
  overdue_invoice_count: 0,
  credit_hold: false,
  hold_reason: null,
  hold_set_at: null,
  ...over,
});

describe('دروازهٔ اعتبار — قواعد سخت', () => {
  it('مشتریِ غیرِفعال ⇒ customer_blocked (سخت، بدونِ مسیرِ استثنا)', () => {
    const r = evaluateCreditGate(baseRow({ status: 'blocked' }), 100);
    expect(r.restrictions.map((x) => x.code)).toContain('customer_blocked');
    const hard = r.restrictions.find((x) => x.code === 'customer_blocked');
    expect(hard?.approvable).toBe(false);
    expect(hasHardRestriction(r.restrictions)).toBe(true);
  });

  it('مسدودیِ اعتبار ⇒ credit_hold (سخت) حتی اگر سقف کافی باشد', () => {
    const r = evaluateCreditGate(
      baseRow({ credit_limit: 10_000_000, credit_hold: true, hold_reason: 'بدهی', hold_set_at: '2026-01-01T00:00:00Z' }),
      100,
    );
    expect(r.restrictions.map((x) => x.code)).toEqual(['credit_hold']);
    expect(hasHardRestriction(r.restrictions)).toBe(true);
    expect(hasApprovableRestriction(r.restrictions)).toBe(false);
  });

  it('نبودنِ ردیفِ customer_credit و credit_limit=0 ⇒ سقف اعمال نمی‌شود (رفتار تاریخی)', () => {
    const r = evaluateCreditGate(baseRow({ credit_limit: 0, total_due: 999_999 }), 10_000);
    expect(r.restrictions).toEqual([]);
  });
});

describe('دروازهٔ اعتبار — قواعد قابلِ استثنا', () => {
  it('سفارشِ فراتر از اعتبارِ در دسترس ⇒ credit_limit_exceeded (approvable)', () => {
    const r = evaluateCreditGate(
      baseRow({ credit_limit: 10_000, total_due: 5_000 }),
      6_000,
    );
    const ex = r.restrictions.find((x) => x.code === 'credit_limit_exceeded');
    expect(ex?.approvable).toBe(true);
    expect(r.available_for_order).toBe(5_000);
    expect(hasHardRestriction(r.restrictions)).toBe(false);
    expect(hasApprovableRestriction(r.restrictions)).toBe(true);
  });

  it('سفارش‌های متعهدشدهٔ باز از اعتبارِ در دسترس کسر می‌شوند', () => {
    const r = evaluateCreditGate(
      baseRow({ credit_limit: 10_000, total_due: 0, committed_open_orders: 9_500 }),
      600,
    );
    expect(r.available_for_order).toBe(500);
    expect(r.restrictions.map((x) => x.code)).toContain('credit_limit_exceeded');
  });

  it('extra_limitِ معتبر به سقف اضافه می‌شود', () => {
    const r = evaluateCreditGate(baseRow({ credit_limit: 10_000, extra_limit: 5_000 }), 14_000);
    expect(r.nominal_limit).toBe(15_000);
    expect(r.restrictions).toEqual([]);
  });

  it('extra_limit فقط وقتی نباشد که در دسترس نیست؛ محدودیت وقتی سقف صفر است بررسی نمی‌شود', () => {
    // credit_limit=0 یعنی سقف پیکربندی نشده ⇒ حتی با extra_limit سفارش رد نمی‌شود
    const r = evaluateCreditGate(baseRow({ credit_limit: 0, extra_limit: 100_000 }), 10_000);
    expect(r.restrictions).toEqual([]);
  });

  it('فاکتورِ معوق فراتر از مهلت ⇒ credit_overdue (approvable)', () => {
    const r = evaluateCreditGate(
      baseRow({
        block_on_overdue: true,
        max_overdue_days: 30,
        oldest_overdue_days: 45,
        overdue_invoice_count: 2,
      }),
      100,
    );
    const od = r.restrictions.find((x) => x.code === 'credit_overdue');
    expect(od?.approvable).toBe(true);
    expect(od?.details.oldest_overdue_days).toBe(45);
  });

  it('زیرِ مهلتِ معوقی ⇒ بدونِ محدودیت', () => {
    const r = evaluateCreditGate(
      baseRow({ block_on_overdue: true, max_overdue_days: 30, oldest_overdue_days: 10, overdue_invoice_count: 1 }),
      100,
    );
    expect(r.restrictions).toEqual([]);
  });

  it('مرزِ دقیقِ اعتبار: دقیقاً به اندازهٔ در دسترس خطا نمی‌دهد', () => {
    const r = evaluateCreditGate(baseRow({ credit_limit: 10_000, total_due: 5_000 }), 5_000);
    expect(r.restrictions).toEqual([]);
  });

  it('مانعِ سخت + مانعِ قابلِ استثنا با هم ⇒ سخت ارجح است', () => {
    const r = evaluateCreditGate(
      baseRow({ status: 'suspended', credit_limit: 10_000, total_due: 9_999.99 }),
      5_000,
    );
    const codes = r.restrictions.map((x) => x.code);
    expect(codes).toContain('customer_blocked');
    expect(codes).toContain('credit_limit_exceeded');
    expect(hasHardRestriction(r.restrictions)).toBe(true);
  });
});
