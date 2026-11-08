import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import {
  computeQuote,
  costBasisFor,
  evaluatePromotions,
  resolveLinePrice,
  resolveMarginPolicy,
  validatePromotionDefinition,
  PricingEngineError,
  type QuoteContext,
  type QuoteLineInput,
  type PromotionRow,
} from '../src/modules/pricing/pricing-engine';

/**
 * تست‌های واحدِ موتورِ قیمت/تشویق — بدونِ DB (CI job «unit»).
 *
 * تمرکز: قواعدِ قطعیِ اولویت، سطوحِ تعدادی، بسته‌بندی، مرزهای تاریخ، ترکیبِ تخفیف،
 * سقف‌ها، کفِ سود و رفتارِ fail-closed در تعریفِ تشویق. تست‌های رفتاریِ API در
 * `pricing-engine.api.test.ts` و `promotion-engine.api.test.ts` پوششِ DB/RLS را دارند.
 */

const COMPANY = '11111111-1111-4111-8111-111111111111';
const PRODUCT = '22222222-2222-4222-8222-222222222222';
const PRODUCT2 = '33333333-3333-4333-8333-333333333333';
const CUSTOMER = '44444444-4444-4444-8444-444444444444';
const CATEGORY = '55555555-5555-4555-8555-555555555555';
const PACK = '66666666-6666-4666-8666-666666666666';
const DOMAIN_AREA = '77777777-7777-4777-8777-777777777777';
const DOMAIN_CHANNEL = '88888888-8888-4888-8888-888888888888';

const product = (over: Partial<QuoteContext['products'][number]> = {}) => ({
  id: PRODUCT,
  code: 'P-1',
  name: 'کالای تست',
  status: 'active',
  category_id: CATEGORY,
  brand_id: null,
  tax_rate_pct: '9',
  min_order_qty: '0',
  vat_enabled: true,
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
  domain_ids: [DOMAIN_AREA, DOMAIN_CHANNEL],
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
    {
      id: 'list-domain',
      code: 'AREA',
      title: 'حوزه',
      kind: 'wholesale',
      priority: 200,
      domain_id: DOMAIN_AREA,
      is_default: false,
      is_active: true,
    },
    {
      id: 'list-other-domain',
      code: 'OTHER',
      title: 'قلمروی دیگر',
      kind: 'retail',
      priority: 300,
      domain_id: '99999999-9999-4999-8999-999999999999',
      is_default: false,
      is_active: true,
    },
  ],
  price_items: [
    {
      id: 'item-company',
      price_list_id: 'list-company',
      product_id: PRODUCT,
      packaging_id: null,
      price: '1000',
      min_qty: '0',
      max_qty: null,
      max_discount_pct: '10',
      valid_from: '2026-01-01',
      valid_to: null,
    },
    {
      id: 'item-domain',
      price_list_id: 'list-domain',
      product_id: PRODUCT,
      packaging_id: null,
      price: '900',
      min_qty: '0',
      max_qty: null,
      max_discount_pct: '10',
      valid_from: '2026-01-01',
      valid_to: null,
    },
    {
      id: 'item-other-domain',
      price_list_id: 'list-other-domain',
      product_id: PRODUCT,
      packaging_id: null,
      price: '1',
      min_qty: '0',
      max_qty: null,
      max_discount_pct: null,
      valid_from: '2026-01-01',
      valid_to: null,
    },
  ],
  customer_prices: [],
  products: [product(), product({ id: PRODUCT2, code: 'P-2', name: 'کالای دوم', tax_rate_pct: '0' })],
  packaging: [{ id: PACK, product_id: PRODUCT, factor_to_base: '12' }],
  costs: [
    { product_id: PRODUCT, avg_cost: '700', standard_cost: '750', last_purchase_cost: '720', qty_weight: '10' },
    { product_id: PRODUCT2, avg_cost: '100', standard_cost: null, last_purchase_cost: null, qty_weight: '5' },
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
  qty: 2,
  packaging_id: null,
  ...over,
});

describe('U1 — اولویتِ منابعِ قیمت', () => {
  it('قیمتِ قلمرو بر لیستِ سراسری اولویت دارد', () => {
    const res = resolveLinePrice(baseCtx(), line(), 1);
    expect(res.unit_price).toBe('900.0000');
    expect(res.scope).toBe('domain');
    expect(res.price_list_code).toBe('AREA');
  });

  it('قیمتِ اختصاصیِ مشتری بر همهٔ لیست‌ها اولویت دارد', () => {
    const ctx = baseCtx({
      customer_prices: [
        {
          id: 'cp-1',
          customer_id: CUSTOMER,
          product_id: PRODUCT,
          packaging_id: null,
          price: '800',
          min_qty: '0',
          max_qty: null,
          max_discount_pct: null,
          valid_from: '2026-01-01',
          valid_to: null,
        },
      ],
    });
    const res = resolveLinePrice(ctx, line(), 1);
    expect(res.unit_price).toBe('800.0000');
    expect(res.source).toBe('customer_price');
  });

  it('لیستِ صریحِ درخواست بر قلمرو اولویت دارد', () => {
    const ctx = baseCtx({ options: { explicit_price_list_id: 'list-company', apply_promotions: true } });
    const res = resolveLinePrice(ctx, line(), 1);
    expect(res.unit_price).toBe('1000.0000');
    expect(res.scope).toBe('explicit_list');
  });

  it('لیستِ قلمروییِ مشتری‌ناوابسته (خارج از domain_ids) هرگز اعمال نمی‌شود', () => {
    const ctx = baseCtx({ domain_ids: [] });
    const res = resolveLinePrice(ctx, line(), 1);
    expect(res.unit_price).toBe('1000.0000'); // سراسری، نه ۱ ریالیِ قلمرویِ بیگانه
    expect(res.scope).toBe('company');
  });

  it('قیمتِ سطحِ بستهٔ همان بسته بر قیمتِ واحدِ پایه اولویت دارد', () => {
    const ctx = baseCtx({
      price_items: [
        ...baseCtx().price_items,
        {
          id: 'item-pack',
          price_list_id: 'list-domain',
          product_id: PRODUCT,
          packaging_id: PACK,
          price: '10000',
          min_qty: '0',
          max_qty: null,
          max_discount_pct: null,
          valid_from: '2026-01-01',
          valid_to: null,
        },
      ],
    });
    const res = resolveLinePrice(ctx, line({ packaging_id: PACK, qty: 1 }), 1);
    expect(res.unit_price).toBe('10000.0000');
    expect(res.packaging_id).toBe(PACK);
  });

  it('قیمتِ واحدِ پایه برای خطِ بسته در ضریبِ بسته ضرب می‌شود', () => {
    const res = resolveLinePrice(baseCtx(), line({ packaging_id: PACK, qty: 1 }), 1);
    expect(res.unit_price).toBe('10800.0000'); // 900 × 12
    expect(res.qty_for_tier).toBe(12);
  });

  it('ترتیبِ ورودیِ لیست‌ها/اقلام بر نتیجه اثر ندارد (قطعیت)', () => {
    const ctx = baseCtx();
    const shuffled = baseCtx({
      price_lists: [...ctx.price_lists].reverse(),
      price_items: [...ctx.price_items].reverse(),
    });
    expect(resolveLinePrice(shuffled, line(), 1).unit_price).toBe(resolveLinePrice(ctx, line(), 1).unit_price);
  });
});

describe('U2 — سطوحِ تعدادی و مرزهای تاریخ', () => {
  it('بالاترین سطحِ واجدِ شرط انتخاب می‌شود', () => {
    const ctx = baseCtx({
      price_items: baseCtx().price_items.map((i) =>
        i.id === 'item-domain' ? { ...i, min_qty: '0', price: '900' } : i,
      ),
      customer_prices: [],
    });
    ctx.price_items.push({
      id: 'tier-10',
      price_list_id: 'list-domain',
      product_id: PRODUCT,
      packaging_id: null,
      price: '850',
      min_qty: '10',
      max_qty: null,
      max_discount_pct: null,
      valid_from: '2026-01-01',
      valid_to: null,
    });
    expect(resolveLinePrice(ctx, line({ qty: 9 }), 1).unit_price).toBe('900.0000');
    expect(resolveLinePrice(ctx, line({ qty: 10 }), 1).unit_price).toBe('850.0000');
  });

  it('سطحِ با سقفِ تعداد فقط در بازهٔ خودش اعمال می‌شود', () => {
    const ctx = baseCtx({
      price_items: [
        ...baseCtx().price_items,
        {
          id: 'tier-bounded',
          price_list_id: 'list-domain',
          product_id: PRODUCT,
          packaging_id: null,
          price: '800',
          min_qty: '5',
          max_qty: '20',
          max_discount_pct: null,
          valid_from: '2026-01-01',
          valid_to: null,
        },
      ],
    });
    expect(resolveLinePrice(ctx, line({ qty: 20 }), 1).unit_price).toBe('800.0000');
    expect(resolveLinePrice(ctx, line({ qty: 21 }), 1).unit_price).toBe('900.0000');
  });

  it('valid_from شامل و valid_to انحصاری است (مرزِ روز)', () => {
    const make = (from: string | null, to: string | null, price: string) =>
      baseCtx({
        price_items: [
          {
            id: 'dated',
            price_list_id: 'list-company',
            product_id: PRODUCT,
            packaging_id: null,
            price,
            min_qty: '0',
            max_qty: null,
            max_discount_pct: null,
            valid_from: from,
            valid_to: to,
          },
        ],
        price_lists: [baseCtx().price_lists[0]],
      });
    // کرانِ پایین شامل: 2026-03-15 در بازهٔ [03-15, 04-01) است
    expect(resolveLinePrice(make('2026-03-15', '2026-04-01', '111'), line(), 1).unit_price).toBe('111.0000');
    // کرانِ بالای انحصاری: همان روزِ پایان دیگر معتبر نیست
    expect(() => resolveLinePrice(make('2026-01-01', '2026-03-15', '333'), line(), 1)).toThrow(PricingEngineError);
    // آغازِ آینده معتبر نیست
    expect(() => resolveLinePrice(make('2026-03-16', null, '222'), line(), 1)).toThrow(PricingEngineError);
  });
});

describe('U3 — اعتبارسنجیِ خطوط و تخفیف', () => {
  it('قیمتِ دستی بدونِ مجوز رد می‌شود', () => {
    expect(() => resolveLinePrice(baseCtx(), line({ unit_price: '500' }), 1)).toThrow(/قیمتِ دستی/);
  });

  it('قیمتِ دستی با مجوز پذیرفته و علامت‌گذاری می‌شود', () => {
    const ctx = baseCtx({ options: { apply_promotions: true, allow_manual_price: true } });
    const res = resolveLinePrice(ctx, line({ unit_price: '500' }), 1);
    expect(res.source).toBe('manual');
    expect(res.unit_price).toBe('500.0000');
  });

  it('تخفیفِ فراتر از سقفِ قلم رد می‌شود و با مجوزِ صریح هشدار می‌دهد', () => {
    expect(() =>
      computeQuote(baseCtx(), [line({ discount_amount: '250' })]), // 250/1800 = 13.9% > 10%
    ).toThrow(/سقفِ مجاز/);
    const ok = computeQuote(baseCtx({ options: { apply_promotions: true, allow_discount_override: true } }), [
      line({ discount_amount: '250' }),
    ]);
    expect(ok.warnings.length).toBe(1);
    expect(ok.discount_total).toBe('250.00');
  });

  it('کالای غیرفعال یا ناموجود قابلِ قیمت‌گذاری نیست', () => {
    const ctx = baseCtx({ products: [product({ status: 'blocked' })] });
    expect(() => resolveLinePrice(ctx, line(), 1)).toThrow(/فعال نیست/);
    expect(() => resolveLinePrice(baseCtx(), line({ product_id: PRODUCT2, packaging_id: PACK }), 1)).toThrow(/بسته‌بندی/);
  });
});

/** کمک: ارزیابیِ سبد بدونِ مالیات برای سادگیِ مقایسهٔ تخفیف */
const evaluate = (promotions: PromotionRow[], ctxOver: Partial<QuoteContext> = {}, lines = [line()]) => {
  const quote = computeQuote(baseCtx({ promotions, ...ctxOver }), lines);
  return quote;
};

describe('U4 — نُه نوعِ تشویق (معناشناسیِ اجرا)', () => {
  it('percent_line: درصد روی اقلامِ واجدِ شرط', () => {
    const q = evaluate([promo({ id: 'p1', code: 'P1', kind: 'percent_line', benefit: { percent: 10 } })]);
    expect(q.discount_total).toBe('180.00'); // 2×900 × 10%
  });

  it('amount_line: مبلغِ ثابت به‌ازای هر قلم با سقفِ مبلغِ قلم', () => {
    const q = evaluate([promo({ id: 'p2', code: 'P2', kind: 'amount_line', benefit: { amount: 500 } })]);
    expect(q.discount_total).toBe('500.00'); // یک قلم، سقفِ ۱۸۰۰
    const q2 = evaluate([promo({ id: 'p2', code: 'P2', kind: 'amount_line', benefit: { amount: 500 } })], {}, [
      line(),
      line(),
    ]);
    expect(q2.discount_total).toBe('1000.00');
  });

  it('volume_tier: سطح بر مبنای تعدادِ واحدِ پایه', () => {
    const q = evaluate([
      promo({
        id: 'p3',
        code: 'P3',
        kind: 'volume_tier',
        conditions: { tiers: [{ min_qty: 2, percent: 5 }, { min_qty: 10, percent: 12 }] },
      }),
    ]);
    expect(q.discount_total).toBe('90.00'); // 2 واحد → 5%
    const q2 = evaluate([
      promo({
        id: 'p3',
        code: 'P3',
        kind: 'volume_tier',
        conditions: { tiers: [{ min_qty: 2, percent: 5 }, { min_qty: 10, percent: 12 }] },
      }),
    ], {}, [line({ qty: 10 })]);
    expect(q2.discount_total).toBe('1080.00'); // 10×9×12%
  });

  it('bundle: قیمتِ ستِ بسته به‌جای جمعِ اقلام (بدونِ اثرِ انبار — D5)', () => {
    const q = evaluate(
      [
        promo({
          id: 'p4',
          code: 'P4',
          kind: 'bundle',
          conditions: { bundle: { product_ids: [PRODUCT, PRODUCT2] } },
          benefit: { bundle_price: 3000 },
        }),
      ],
      {
        price_items: [
          ...baseCtx().price_items,
          {
            id: 'item-p2',
            price_list_id: 'list-domain',
            product_id: PRODUCT2,
            packaging_id: null,
            price: '500',
            min_qty: '0',
            max_qty: null,
            max_discount_pct: null,
            valid_from: '2026-01-01',
            valid_to: null,
          },
        ],
      },
      [line(), line({ product_id: PRODUCT2, qty: 1 })],
    );
    // ست: 1800 + 500 = 2300 < 3000 ⇒ تخفیف صفر و تشویق با دلیلِ صریح اعمال نمی‌شود
    expect(q.discount_total).toBe('0.00');
    expect(q.skipped_promotions.map((s) => s.reason)).toContain('zero_benefit');
    const q2 = evaluate(
      [
        promo({
          id: 'p4',
          code: 'P4',
          kind: 'bundle',
          conditions: { bundle: { product_ids: [PRODUCT, PRODUCT2] } },
          benefit: { bundle_price: 2000 },
        }),
      ],
      {
        price_items: [
          ...baseCtx().price_items,
          {
            id: 'item-p2',
            price_list_id: 'list-domain',
            product_id: PRODUCT2,
            packaging_id: null,
            price: '500',
            min_qty: '0',
            max_qty: null,
            max_discount_pct: null,
            valid_from: '2026-01-01',
            valid_to: null,
          },
        ],
      },
      [line(), line({ product_id: PRODUCT2, qty: 1 })],
    );
    expect(q2.discount_total).toBe('300.00'); // 2300 − 2000
  });

  it('buy_x_get_y: تعدادِ جایزه = floor(خرید/شرط) × free_qty و ارزش‌گذاری با قیمتِ کالا', () => {
    const q = evaluate([
      promo({
        id: 'p5',
        code: 'P5',
        kind: 'buy_x_get_y',
        conditions: { buy_x: { product_id: PRODUCT, qty: 1 } },
        benefit: { free_qty: 1 },
      }),
    ], {}, [line({ qty: 3 })]);
    // 3 دور ⇒ 3 عدد جایزه × 900
    expect(q.discount_total).toBe('2700.00'); // سقفِ مبلغِ سبد: 2700 (کلِ سبد) — دقیقاً برابر
    expect(q.gift_lines[0].qty).toBe(3);
  });

  it('gift_item: هدیه با شرطِ حداقلِ مبلغ', () => {
    const q = evaluate([
      promo({
        id: 'p6',
        code: 'P6',
        kind: 'gift_item',
        conditions: { min_amount: 1000 },
        benefit: { gift: { product_id: PRODUCT2, qty: 2 } },
      }),
    ]);
    expect(q.discount_total).toBe('1000.00'); // 2 × 500 قیمتِ مرجع
    expect(q.gift_lines[0].product_id).toBe(PRODUCT2);
  });

  it('cash_discount: با شرطِ تسویه', () => {
    const withTerm = evaluate(
      [
        promo({
          id: 'p7',
          code: 'P7',
          kind: 'cash_discount',
          conditions: { settlement_term_ids: ['term-1'] },
          benefit: { percent: 5 },
        }),
      ],
      { customer: { ...baseCtx().customer!, settlement_term_ids: ['term-1'] } },
    );
    expect(withTerm.discount_total).toBe('90.00');
    const withoutTerm = evaluate([
      promo({
        id: 'p7',
        code: 'P7',
        kind: 'cash_discount',
        conditions: { settlement_term_ids: ['term-1'] },
        benefit: { percent: 5 },
      }),
    ]);
    expect(withoutTerm.discount_total).toBe('0.00');
  });

  it('repeat_order: نیازمندِ سابقهٔ سفارش', () => {
    const p = promo({
      id: 'p8',
      code: 'P8',
      kind: 'repeat_order',
      conditions: { repeat: { min_orders: 3 } },
      benefit: { percent: 4 },
    });
    expect(evaluate([p]).discount_total).toBe('0.00');
    expect(
      evaluate([p], { order_history: { total_orders: 3, first_order_at: '2026-01-01' } }).discount_total,
    ).toBe('72.00');
  });

  it('coupon: بدونِ کوپن اعمال نمی‌شود؛ با کوپنِ معتبر اعمال می‌شود', () => {
    const p = promo({ id: 'p9', code: 'P9', kind: 'coupon', benefit: { amount: 300 } });
    const coupon = {
      id: 'coupon-1',
      promotion_id: 'p9',
      code: 'WELCOME',
      customer_id: null,
      valid_from: '2026-01-01',
      valid_to: null,
      max_uses: null,
      max_uses_per_customer: null,
      used_total: 0,
      used_by_customer: 0,
      is_active: true,
    };
    expect(evaluate([p]).discount_total).toBe('0.00');
    expect(evaluate([p], { coupons: [coupon] }).skipped_promotions[0].reason).toBe('coupon_required');
    const q = evaluate([p], { coupons: [coupon], options: { apply_promotions: true, coupon_codes: ['welcome'] } });
    expect(q.discount_total).toBe('300.00');
    expect(q.applied_promotions[0].coupon_id).toBe('coupon-1');
  });
});

describe('U5 — ترکیب، انحصار و سقف‌ها', () => {
  it('تشویقِ غیرقابلِ ترکیب، بقیه را مسدود می‌کند (به ترتیبِ اولویت)', () => {
    const q = evaluate([
      promo({ id: 'a', code: 'A', kind: 'percent_line', priority: 200, allow_stacking: false, benefit: { percent: 10 } }),
      promo({ id: 'b', code: 'B', kind: 'percent_line', priority: 100, benefit: { percent: 5 } }),
    ]);
    expect(q.applied_promotions.map((p) => p.code)).toEqual(['A']);
    expect(q.skipped_promotions[0].reason).toBe('blocked_by_non_stackable');
  });

  it('گروهِ انحصاری: فقط یکی از دو تشویقِ هم‌گروه', () => {
    const q = evaluate([
      promo({ id: 'a', code: 'A', kind: 'percent_line', priority: 200, exclusive_group: 'G', benefit: { percent: 10 } }),
      promo({ id: 'b', code: 'B', kind: 'percent_line', priority: 100, exclusive_group: 'G', benefit: { percent: 20 } }),
    ]);
    expect(q.applied_promotions.map((p) => p.code)).toEqual(['A']);
    expect(q.skipped_promotions[0].reason).toBe('exclusive_group_conflict');
  });

  it('ترتیبِ اجرا: priority نزولی سپس کد صعودی (قطعی)', () => {
    const q = evaluate([
      promo({ id: 'a', code: 'B', kind: 'percent_line', priority: 100, benefit: { percent: 10 } }),
      promo({ id: 'b', code: 'A', kind: 'percent_line', priority: 100, benefit: { percent: 5 } }),
    ]);
    expect(q.applied_promotions.map((p) => p.code)).toEqual(['A', 'B']);
  });

  it('سقفِ درصد/مبلغ/روزانه/کلِ سند اعمال می‌شود', () => {
    const pctCap = evaluate([
      promo({ id: 'a', code: 'A', kind: 'percent_line', max_discount_pct: '3', benefit: { percent: 20 } }),
    ]);
    expect(pctCap.discount_total).toBe('54.00'); // 3% از 1800

    const amtCap = evaluate([
      promo({ id: 'a', code: 'A', kind: 'percent_line', max_discount_amount: '50', benefit: { percent: 20 } }),
    ]);
    expect(amtCap.discount_total).toBe('50.00');

    const dayCap = evaluate(
      [
        promo({
          id: 'a',
          code: 'A',
          kind: 'percent_line',
          max_per_customer_per_day: '100',
          benefit: { percent: 20 },
        }),
      ],
      {
        usage: [
          {
            promotion_id: 'a',
            coupon_id: null,
            customer_id: CUSTOMER,
            day_amount: '80',
            customer_total_amount: '80',
            customer_uses: 1,
            total_uses: 1,
          },
        ],
      },
    );
    expect(dayCap.discount_total).toBe('20.00'); // سقفِ باقی‌مانده = 20

    const totalCap = evaluate(
      [promo({ id: 'a', code: 'A', kind: 'percent_line', benefit: { percent: 20 } })],
      { options: { apply_promotions: true, max_total_discount_pct: 5 } },
    );
    expect(totalCap.discount_total).toBe('90.00'); // 5% از 1800
  });

  it('سقفِ مصرفِ کل/مشتری، تشویق را رد می‌کند', () => {
    const p = promo({ id: 'a', code: 'A', kind: 'percent_line', max_uses_total: 2, benefit: { percent: 10 } });
    const q = evaluate([p], {
      usage: [
        {
          promotion_id: 'a',
          coupon_id: null,
          customer_id: CUSTOMER,
          day_amount: '0',
          customer_total_amount: '0',
          customer_uses: 2,
          total_uses: 2,
        },
      ],
    });
    expect(q.discount_total).toBe('0.00');
    expect(q.skipped_promotions[0].reason).toBe('total_cap_exceeded');
  });

  it('شرط/مزیتِ ناشناخته ⇒ fail-closed با دلیلِ صریح', () => {
    const q = evaluate([promo({ id: 'a', code: 'A', kind: 'percent_line', conditions: { mystery: 1 }, benefit: { percent: 10 } })]);
    expect(q.discount_total).toBe('0.00');
    expect(q.skipped_promotions[0].reason).toBe('unsupported_condition');
    const q2 = evaluate([promo({ id: 'b', code: 'B', kind: 'percent_line', benefit: { percent: 10, turbolence: true } })]);
    expect(q2.skipped_promotions[0].reason).toBe('unsupported_benefit');
  });

  it('تشویقِ منقضی/آینده در تاریخِ ارزیابی اعمال نمی‌شود', () => {
    const q = evaluate([
      promo({ id: 'a', code: 'OLD', kind: 'percent_line', valid_from: '2025-01-01', valid_to: '2026-01-01', benefit: { percent: 10 } }),
      promo({ id: 'b', code: 'NEW', kind: 'percent_line', valid_from: '2026-06-01', benefit: { percent: 10 } }),
    ]);
    expect(q.applied_promotions).toHaveLength(0);
  });

  it('تشویقِ قلمروییِ خارج از دامنهٔ مشتری اعمال نمی‌شود', () => {
    const q = evaluate([
      promo({ id: 'a', code: 'FOREIGN', kind: 'percent_line', domain_id: '99999999-9999-4999-8999-999999999999', benefit: { percent: 10 } }),
    ]);
    expect(q.discount_total).toBe('0.00');
  });
});

describe('U6 — کفِ سود', () => {
  const policy = {
    id: 'policy-1',
    domain_id: null,
    scope: 'company' as const,
    category_id: null,
    product_id: null,
    cost_basis: 'avg_cost' as const,
    min_margin_pct: '25',
    on_unknown_cost: 'block' as const,
    priority: 100,
    valid_from: '2026-01-01',
    valid_to: null,
  };

  it('حاشیهٔ بالای کف ⇒ بدونِ نقض', () => {
    const q = computeQuote(baseCtx({ margin_policies: [policy] }), [line()]);
    // قیمت 900، بهای 700 ⇒ 22.2% < 25% ⇒ نقض
    expect(q.margin_violations).toHaveLength(1);
    expect(q.approval_required.required).toBe(true);
    expect(q.margin_violations[0].code).toBe('margin_floor_violation');
  });

  it('سیاستِ گروه‌کالاییِ سخت‌گیرانه‌تر از سیاستِ شرکت اولویت دارد', () => {
    const strictCategory = { ...policy, id: 'policy-2', scope: 'category' as const, category_id: CATEGORY, min_margin_pct: '10' };
    const ctx = baseCtx({ margin_policies: [policy, strictCategory] });
    expect(resolveMarginPolicy(ctx, ctx.products[0])?.policy.id).toBe('policy-2');
    const q = computeQuote(ctx, [line()]);
    expect(q.margin_violations).toHaveLength(0); // 22.2% ≥ 10%
  });

  it('استثنای تأییدشده نقض را مجاز می‌کند و علامت می‌زند', () => {
    const q = computeQuote(
      baseCtx({
        margin_policies: [policy],
        margin_exceptions: [
          {
            id: 'ex-1',
            product_id: PRODUCT,
            customer_id: CUSTOMER,
            policy_id: policy.id,
            entity_type: 'price_list_item',
            entity_id: null,
            granted_margin_pct: '20',
            status: 'approved',
            valid_until: null,
          },
        ],
      }),
      [line()],
    );
    expect(q.margin_violations).toHaveLength(0);
    expect(q.lines[0].margin.status).toBe('exception_applied');
    expect(q.lines[0].margin.exception_id).toBe('ex-1');
  });

  it('بهای تمام‌شدهٔ نامعلوم: block ⇒ نقض، warn ⇒ نقض با پیام، ignore ⇒ بی‌اثر', () => {
    const noCost = baseCtx({ margin_policies: [policy], costs: [] });
    const blocked = computeQuote(noCost, [line()]);
    expect(blocked.margin_violations[0].code).toBe('margin_cost_unknown');
    const warn = computeQuote(
      baseCtx({ margin_policies: [{ ...policy, on_unknown_cost: 'warn' }], costs: [] }),
      [line()],
    );
    expect(warn.margin_violations[0].code).toBe('margin_cost_unknown');
    const ignored = computeQuote(
      baseCtx({ margin_policies: [{ ...policy, on_unknown_cost: 'ignore' }], costs: [] }),
      [line()],
    );
    expect(ignored.margin_violations).toHaveLength(0);
  });

  it('بهای تمام‌شدهٔ وزن‌دار بر اساسِ موجودیِ انبارها', () => {
    const ctx = baseCtx({
      costs: [
        { product_id: PRODUCT, avg_cost: '100', standard_cost: null, last_purchase_cost: null, qty_weight: '1' },
        { product_id: PRODUCT, avg_cost: '200', standard_cost: null, last_purchase_cost: null, qty_weight: '3' },
      ],
    });
    expect(costBasisFor(ctx, PRODUCT, 'avg_cost')).toBe(175);
  });
});

describe('U7 — مالیات، جمع‌ها و گرد‌کردن', () => {
  it('مالیات پس از تخفیف و با گرد‌کردنِ ریالِ صحیح', () => {
    const q = evaluate([promo({ id: 'a', code: 'A', kind: 'percent_line', benefit: { percent: 10 } })]);
    // مانده 1620، نرخ 9% ⇒ Math.round(1620×9)/100 = 145.80 (قراردادِ موجودِ سفارش)
    expect(q.tax_total).toBe('145.80');
    expect(q.grand_total).toBe('1765.80'); // 1800 − 180 + 145.80
  });

  it('مالیاتِ شرکتِ خاموش ⇒ صفر', () => {
    const q = computeQuote(baseCtx({ products: [product({ vat_enabled: false })] }), [line()]);
    expect(q.tax_total).toBe('0.00');
    expect(q.grand_total).toBe('1800.00');
  });

  it('جمع‌ها همیشه با اختلافِ تخفیف/مالیات می‌خوانند', () => {
    const q = evaluate([
      promo({ id: 'a', code: 'A', kind: 'percent_line', priority: 200, benefit: { percent: 7.5 } }),
      promo({ id: 'b', code: 'B', kind: 'amount_line', priority: 100, benefit: { amount: 33 } }),
    ]);
    expect(Number(q.grand_total)).toBeCloseTo(
      Number(q.subtotal) - Number(q.discount_total) + Number(q.tax_total),
      2,
    );
  });
});

describe('U8 — اعتبارسنجیِ تعریفِ تشویق و سبدِ خالی', () => {
  it('تعریفِ ناقص (با فرستادنِ conditions/benefit) رد می‌شود', () => {
    expect(validatePromotionDefinition('percent_line', {}, {})).not.toHaveLength(0);
    expect(validatePromotionDefinition('coupon', {}, { percent: 10 })).toHaveLength(0);
    expect(validatePromotionDefinition('percent_line', { mystery: true }, { percent: 10 })[0]).toMatch(/پشتیبانی/);
    expect(validatePromotionDefinition('percent_line', {}, {}, { requireComplete: false })).toHaveLength(0);
  });

  it('سبدِ خالی رد می‌شود', () => {
    expect(() => computeQuote(baseCtx(), [])).toThrow(/خالی/);
  });

  it('مشتریِ غیرفعال رد می‌شود', () => {
    expect(() =>
      computeQuote(baseCtx({ customer: { ...baseCtx().customer!, status: 'blocked' } }), [line()]),
    ).toThrow(/فعال نیست/);
  });
});
