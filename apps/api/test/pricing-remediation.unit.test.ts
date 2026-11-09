import { describe, expect, it } from 'vitest';
import {
  computeQuote,
  evaluateLineMargin,
  MARGIN_VIOLATION_CODES,
  MARGIN_STATUSES,
  PRICE_SCOPES,
  SKIP_REASONS,
  type MarginExceptionRow,
  type MarginPolicyRow,
  type QuoteContext,
  type QuoteLineInput,
  type PromotionRow,
} from '../src/modules/pricing/pricing-engine';

/**
 * TASK-24F — آزمون‌های بازگشتیِ یافته‌های حسابرسیِ مستقلِ TASK-24R (Agent-2).
 *
 * این فایل **بدونِ DB** اجرا می‌شود و هر بندِ آن به شناسهٔ یافته/بخشِ گزارش حسابرسی
 * نگاشت شده است تا شکستِ آینده دقیقاً همان یافته را دوباره باز کند:
 *   HIGH-4   : مبلغِ ثبت‌شدهٔ تشویق/هدیه = مبلغِ واقعاً تخصیص‌یافته (نه مزیتِ نظری)
 *   MEDIUM-1 : سقفِ granted_margin_pct، تطبیقِ policy/product/entity و فروشِ زیرِ بهای تمام‌شده
 *   HIGH-2   : سقفِ کلِ تخفیف از سیاستِ پایدار (نه پارامترِ درخواست)
 */

const COMPANY = '11111111-1111-4111-8111-111111111111';
const PRODUCT = '22222222-2222-4222-8222-222222222222';
const PRODUCT2 = '33333333-3333-4333-8333-333333333333';
const CUSTOMER = '44444444-4444-4444-8444-444444444444';
const CATEGORY = '55555555-5555-4555-8555-555555555555';
const DOMAIN = '77777777-7777-4777-8777-777777777777';

const product = (over: Partial<QuoteContext['products'][number]> = {}) => ({
  id: PRODUCT,
  code: 'P-1',
  name: 'کالای تست',
  status: 'active',
  category_id: CATEGORY,
  brand_id: null,
  tax_rate_pct: '0',
  min_order_qty: '0',
  vat_enabled: false,
  ...over,
});

const baseCtx = (over: Partial<QuoteContext> = {}): QuoteContext => ({
  pricing_date: '2026-03-15',
  customer: {
    id: CUSTOMER,
    channel: 'wholesale',
    price_list_id: null,
    settlement_term_ids: [],
    status: 'active',
  },
  domain_ids: [DOMAIN],
  price_lists: [
    {
      id: 'list-company',
      code: 'GEN',
      title: 'سراسری',
      kind: 'general',
      priority: 100,
      domain_id: null,
      is_default: true,
      is_active: true,
    },
  ],
  price_items: [
    {
      id: 'item-1',
      price_list_id: 'list-company',
      product_id: PRODUCT,
      packaging_id: null,
      price: '1000',
      min_qty: '0',
      max_qty: null,
      max_discount_pct: null,
      valid_from: '2026-01-01',
      valid_to: null,
    },
  ],
  customer_prices: [],
  products: [
    product(),
    product({ id: PRODUCT2, code: 'P-2', name: 'کالای دوم', tax_rate_pct: '0' }),
  ],
  packaging: [],
  costs: [
    { product_id: PRODUCT, avg_cost: '700', standard_cost: null, last_purchase_cost: null, qty_weight: '1' },
  ],
  margin_policies: [],
  margin_exceptions: [],
  promotions: [],
  coupons: [],
  usage: [],
  order_history: { total_orders: 0, first_order_at: null },
  reference_prices: { [PRODUCT2]: 500 },
  options: { apply_promotions: true },
  ...over,
});

const promo = (over: Partial<PromotionRow> & Pick<PromotionRow, 'id' | 'code' | 'kind'>): PromotionRow => ({
  title: over.code,
  priority: 100,
  allow_stacking: true,
  exclusive_group: null,
  max_discount_amount: null,
  max_discount_pct: null,
  max_per_customer_per_day: null,
  max_uses_total: null,
  max_uses_per_customer: null,
  requires_coupon: false,
  conditions: {},
  benefit: {},
  valid_from: '2026-01-01',
  valid_to: null,
  domain_id: null,
  ...over,
});

const line = (over: Partial<QuoteLineInput> = {}): QuoteLineInput => ({
  product_id: PRODUCT,
  qty: 1,
  packaging_id: null,
  ...over,
});

const companyPolicy = (over: Partial<MarginPolicyRow> = {}): MarginPolicyRow => ({
  id: 'pol-company',
  domain_id: null,
  scope: 'company',
  category_id: null,
  product_id: null,
  cost_basis: 'avg_cost',
  min_margin_pct: '40',
  on_unknown_cost: 'block',
  priority: 10,
  valid_from: '2026-01-01',
  valid_to: null,
  ...over,
});

const exception = (over: Partial<MarginExceptionRow> = {}): MarginExceptionRow => ({
  id: 'ex-1',
  product_id: PRODUCT,
  customer_id: null,
  policy_id: 'pol-company',
  entity_type: 'customer_price',
  entity_id: null,
  granted_margin_pct: '10',
  status: 'approved',
  valid_until: null,
  ...over,
});

const sum = (values: string[]): number =>
  Math.round(values.reduce((s, v) => s + Number(v), 0) * 100) / 100;

// =====================================================================
// HIGH-4 — یکپارچگیِ تخصیص و دفترِ مصرف
// =====================================================================
describe('T24F-H4 — مبلغِ تشویق = مبلغِ واقعاً تخصیص‌یافته', () => {
  it('هدیهٔ بزرگ‌تر از سبد: ارزش و تعداد هدیه به ماندهٔ سبد محدود می‌شود و دفتر/سند یکی است', () => {
    const q = computeQuote(
      baseCtx({
        promotions: [
          promo({
            id: 'p-gift',
            code: 'GIFT-BIG',
            kind: 'gift_item',
            benefit: { gift: { product_id: PRODUCT2, qty: 10 } },
          }),
        ],
      }),
      [line()],
    );

    expect(q.applied_promotions).toHaveLength(1);
    const applied = q.applied_promotions[0];
    // سبد ۱۰۰۰ (بدونِ مالیات)؛ ارزشِ نظری هدیه ۱۰×۵۰۰ = ۵۰۰۰
    expect(Number(applied.amount)).toBe(1000);
    expect(Number(q.discount_total)).toBe(1000);
    expect(sum(q.applied_promotions.map((a) => a.amount))).toBe(Number(q.discount_total));
    // ارزشِ هدیه هرگز از تخفیفِ واقعی بیشتر نیست و مقدارِ نظری جداگانه ثبت می‌شود
    expect(Number(q.gift_lines[0].value)).toBe(1000);
    expect(q.gift_lines[0].requested_value).toBe('5000.00');
    expect(q.gift_lines[0].qty).toBe(2); // 1000 / 500
    expect(q.gift_lines[0].line_nos).toEqual([1]);
    expect(Number(q.grand_total)).toBe(0);
  });

  it('buy_x_get_y با تعدادِ جایزهٔ بیش‌ازحد: مقدار و ارزش محدود می‌شوند (رفعِ ternery بی‌اثر)', () => {
    const q = computeQuote(
      baseCtx({
        promotions: [
          promo({
            id: 'p-bx',
            code: 'BXGY-BIG',
            kind: 'buy_x_get_y',
            conditions: { buy_x: { product_id: PRODUCT, qty: 1 } },
            benefit: { free_qty: 20, get_product_id: PRODUCT },
          }),
        ],
      }),
      [line()],
    );
    expect(Number(q.applied_promotions[0].amount)).toBe(1000);
    expect(Number(q.discount_total)).toBe(1000);
    expect(Number(q.gift_lines[0].value)).toBe(1000);
    expect(q.gift_lines[0].requested_value).toBe('20000.00');
    expect(q.gift_lines[0].qty).toBe(1); // 1000 / 1000
    expect(Number(q.grand_total)).toBe(0);
  });

  it('تخصیصِ جزئی روی چند قلم: جمعِ applied = discount_total و هیچ خطی منفی نمی‌شود', () => {
    const q = computeQuote(
      baseCtx({
        promotions: [
          promo({
            id: 'p-cash',
            code: 'CASH-HUGE',
            kind: 'cash_discount',
            priority: 500,
            benefit: { amount: 5000 },
          }),
        ],
      }),
      [line({ qty: 1 }), line({ qty: 2 })],
    );
    expect(Number(q.subtotal)).toBe(3000);
    expect(sum(q.applied_promotions.map((a) => a.amount))).toBe(3000);
    expect(Number(q.discount_total)).toBe(3000);
    for (const l of q.lines) {
      expect(Number(l.net_ex_tax)).toBe(0);
      expect(Number(l.discount_total)).toBeLessThanOrEqual(Number(l.gross));
    }
    expect(Number(q.grand_total)).toBe(0);
  });

  it('چند تشویقِ زنجیره‌ای: هیچ تشویقی بیش از ماندهٔ واقعی ثبت نمی‌شود', () => {
    const q = computeQuote(
      baseCtx({
        promotions: [
          promo({ id: 'p1', code: 'A-70', kind: 'cash_discount', priority: 500, benefit: { percent: 70 } }),
          promo({ id: 'p2', code: 'B-70', kind: 'cash_discount', priority: 400, benefit: { percent: 70 } }),
          promo({
            id: 'p3',
            code: 'C-GIFT',
            kind: 'gift_item',
            priority: 300,
            benefit: { gift: { product_id: PRODUCT2, qty: 5 } },
          }),
        ],
      }),
      [line()],
    );
    const appliedSum = sum(q.applied_promotions.map((a) => a.amount));
    expect(appliedSum).toBe(Number(q.discount_total));
    expect(appliedSum).toBeLessThanOrEqual(1000);
    expect(Number(q.grand_total)).toBeGreaterThanOrEqual(0);
    // آخرین تشویق پس از اتمامِ مانده نباید مبلغِ مثبت ثبت کند
    const last = q.applied_promotions[q.applied_promotions.length - 1];
    expect(Number(last.amount)).toBeLessThanOrEqual(300 + 0.001);
  });

  it('سقفِ مصرفِ روزانه بر مبنای مبلغِ واقعیِ تخصیص‌یافته اعمال می‌شود', () => {
    const q = computeQuote(
      baseCtx({
        usage: [
          {
            promotion_id: 'p-gift',
            total_uses: 0,
            customer_uses: 0,
            day_amount: '0',
            customer_id: CUSTOMER,
          } as unknown as QuoteContext['usage'][number],
        ],
        promotions: [
          promo({
            id: 'p-gift',
            code: 'GIFT-DAYCAP',
            kind: 'gift_item',
            max_per_customer_per_day: '500',
            benefit: { gift: { product_id: PRODUCT2, qty: 10 } },
          }),
        ],
      }),
      [line()],
    );
    // سقفِ روزانه ۵۰۰ است، پس نه ۵۰۰۰ (نظری) و نه ۱۰۰۰ (کلِ سبد) نباید ثبت شود
    expect(Number(q.applied_promotions[0].amount)).toBe(500);
    expect(Number(q.discount_total)).toBe(500);
    expect(Number(q.gift_lines[0].value)).toBe(500);
    expect(Number(q.gift_lines[0].value)).toBe(Number(q.applied_promotions[0].amount));
    expect(q.gift_lines[0].qty).toBe(1); // 500 / 500
    // ارزشِ ادعاییِ کمپین (۱۰×۵۰۰) برای ممیزی حفظ می‌شود، ولی اعمال/دفتر ۵۰۰ است
    expect(q.gift_lines[0].requested_value).toBe('5000.00');
  });
});

// =====================================================================
// MEDIUM-1 — استثنا و کفِ سود
// =====================================================================
describe('T24F-M1 — استثنای کفِ سود محدود و مقید است', () => {
  const policy = companyPolicy();

  it('استثنا با granted ۱۰٪ حاشیهٔ ۰٪ را مجاز نمی‌کند (پیش‌تر مجاز می‌کرد)', () => {
    const ctx = baseCtx({
      margin_policies: [policy],
      margin_exceptions: [exception({ granted_margin_pct: '10' })],
    });
    // درآمد ۷۰۰ = بهای تمام‌شده ⇒ حاشیه ۰٪ < ۱۰٪ مجاز نیست
    const ev = evaluateLineMargin(ctx, product(), 700, 700, { policy } as never);
    expect(ev.result.status).toBe('violation');
    expect(ev.violation?.code).toBe('margin_floor_violation');
  });

  it('استثنا وقتی حاشیه از سقفِ اعطاشده بالاتر است اعمال می‌شود', () => {
    const ctx = baseCtx({
      margin_policies: [policy],
      margin_exceptions: [exception({ granted_margin_pct: '10' })],
    });
    // درآمد ۸۰۰ با بهای ۷۰۰ ⇒ حاشیه ۱۲.۵٪ ≥ ۱۰٪ (هر دو زیرِ کفِ ۴۰٪)
    const ev = evaluateLineMargin(ctx, product(), 800, 700, { policy } as never);
    expect(ev.result.status).toBe('exception_applied');
    expect(ev.result.exception_granted_margin_pct).toBe(10);
    expect(ev.violation).toBeNull();
  });

  it('استثنای سراسری (بدونِ کالا) دیگر کفِ سود را برای همه کالاها ساقط نمی‌کند', () => {
    const ctx = baseCtx({
      margin_policies: [policy],
      margin_exceptions: [exception({ product_id: null, granted_margin_pct: '0' })],
    });
    const ev = evaluateLineMargin(ctx, product(), 700, 700, { policy } as never);
    expect(ev.result.status).toBe('violation');
    expect(ev.result.exception_id).toBeNull();
  });

  it('استثنای سیاستِ دیگر (policy_id ناهمخوان) اعمال نمی‌شود', () => {
    const ctx = baseCtx({
      margin_policies: [policy],
      margin_exceptions: [exception({ policy_id: 'pol-other', granted_margin_pct: '0' })],
    });
    const ev = evaluateLineMargin(ctx, product(), 700, 700, { policy } as never);
    expect(ev.result.status).toBe('violation');
  });

  it('استثنای مقید به یک سندِ مشخص در استعلامِ سبد اعمال نمی‌شود', () => {
    const ctx = baseCtx({
      margin_policies: [policy],
      margin_exceptions: [
        exception({ entity_type: 'customer_price', entity_id: '99999999-9999-4999-8999-999999999999', granted_margin_pct: '0' }),
      ],
    });
    const ev = evaluateLineMargin(ctx, product(), 700, 700, { policy } as never);
    expect(ev.result.status).toBe('violation');
  });

  const lossBase = (over: Partial<QuoteContext> = {}) =>
    baseCtx({
      price_items: [
        {
          id: 'item-loss',
          price_list_id: 'list-company',
          product_id: PRODUCT,
          packaging_id: null,
          price: '600',
          min_qty: '0',
          max_qty: null,
          max_discount_pct: null,
          valid_from: '2026-01-01',
          valid_to: null,
        },
      ],
      ...over,
    });

  it('فروشِ زیرِ بهای تمام‌شده (حتی بدونِ سیاستِ کفِ سود) رد می‌شود', () => {
    const q = computeQuote(lossBase(), [line()]);
    // قیمتِ منبع ۶۰۰ < بهای ۷۰۰ و بدونِ سیاست/استثنا ⇒ نقضِ صریح
    const codes = q.margin_violations.map((v) => v.code);
    expect(codes).toContain('margin_loss_making');
    expect(q.lines[0].margin.status).toBe('violation');
    expect(Number(q.cost_total)).toBe(700);
  });

  it('فروشِ زیرِ بهای تمام‌شده با سیاستِ صریحِ مجاز عبور می‌کند', () => {
    const q = computeQuote(lossBase({ options: { apply_promotions: true, allow_loss_making: true } }), [
      line(),
    ]);
    expect(q.margin_violations.map((v) => v.code)).not.toContain('margin_loss_making');
  });

  it('فروشِ زیرِ بهای تمام‌شده با استثنای محدودِ همان کالا مجاز است', () => {
    const q = computeQuote(
      lossBase({
        margin_policies: [companyPolicy({ min_margin_pct: '40' })],
        margin_exceptions: [exception({ granted_margin_pct: '-20' })],
      }),
      [line()],
    );
    // حاشیه = (600-700)/600 ≈ -16.7٪ ≥ -20٪ ⇒ استثنا مجاز می‌داند
    expect(q.margin_violations).toHaveLength(0);
    expect(q.lines[0].margin.status).toBe('exception_applied');
  });
});

// =====================================================================
// HIGH-2 — سقفِ کلِ تخفیف از سیاست، نه از درخواست
// =====================================================================
describe('T24F-H2 — سقفِ کلِ تخفیف از سیاستِ پایدار', () => {
  it('سقفِ سیاست (۵٪) تخفیفِ تشویق را محدود می‌کند', () => {
    const q = computeQuote(
      baseCtx({
        options: { apply_promotions: true, max_total_discount_pct: 5 },
        promotions: [promo({ id: 'p', code: 'P-40', kind: 'cash_discount', benefit: { percent: 40 } })],
      }),
      [line()],
    );
    expect(Number(q.discount_total)).toBe(50);
    expect(q.skipped_promotions.some((s) => s.reason === 'total_cap_exceeded') || Number(q.discount_total) <= 50).toBe(true);
  });

  it('سقفِ پیش‌فرضِ تخفیفِ قلم (سیاستِ شرکت) بدونِ مجوز، صریح و با سقفِ مؤثر خطا می‌دهد', () => {
    const ctx = (over: Partial<QuoteContext['options']> = {}) =>
      baseCtx({ options: { apply_promotions: true, max_line_discount_pct: 10, ...over } });
    // ۴۰٪ تخفیف روی قلم ⇒ بدونِ مجوزِ عبور، خطای صریح با سقفِ مؤثرِ سیاست (۱۰)
    try {
      computeQuote(ctx(), [line({ discount_amount: '400' })]);
      throw new Error('باید خطا می‌داد');
    } catch (e) {
      const err = e as { code?: string; message: string; details?: Record<string, unknown> };
      expect(err.code).toBe('discount_cap_exceeded');
      expect(err.message).toContain('10%');
      expect(err.details?.max_discount_pct).toBe(10);
      expect(err.details?.cap_source).toBe('company_policy');
    }
    // با مجوزِ صریح عبور می‌کند و هشدار ثبت می‌شود
    const ok = computeQuote(ctx({ allow_discount_override: true }), [line({ discount_amount: '400' })]);
    expect(Number(ok.discount_total)).toBe(400);
    expect(ok.warnings.some((w) => w.includes('10%'))).toBe(true);
  });
});

// =====================================================================
// MEDIUM-3 — enumهای منبعِ حقیقت (نگهبانِ قرارداد)
// =====================================================================
describe('T24F-M3 — enumهای موتور', () => {
  it('enumها یکتا و شاملِ مقادیرِ قرارداد هستند', () => {
    expect(new Set(PRICE_SCOPES).size).toBe(PRICE_SCOPES.length);
    expect(PRICE_SCOPES).toContain('explicit_list');
    expect(new Set(MARGIN_STATUSES).size).toBe(MARGIN_STATUSES.length);
    expect(MARGIN_STATUSES).toEqual(
      expect.arrayContaining(['ok', 'violation', 'cost_unknown', 'exception_applied', 'no_policy']),
    );
    expect(MARGIN_VIOLATION_CODES).toContain('margin_loss_making');
    expect(new Set(SKIP_REASONS).size).toBe(SKIP_REASONS.length);
  });
});
