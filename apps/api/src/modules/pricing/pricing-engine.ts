/**
 * موتورِ قیمت و تخفیف — منطقِ خالص (pure) و قابلِ آزمونِ واحد.
 *
 * این فایل هیچ دسترسیِ DB ندارد؛ همهٔ دادهٔ لازم به‌صورت ساختارهای آماده تزریق می‌شود.
 * سرویس/ریپازیتوری مسئولِ بارگیریِ داده و اعمالِ RLS است. مزیت: قواعدِ تجاری بدونِ
 * دیتابیس آزمون‌پذیر می‌شوند (تست‌های واحد در CI job «unit» سبز می‌شوند) و رفتار
 * غیرقطعی/وابسته به ترتیبِ کوئری امکانِ ورود به منطقِ تجاری را ندارد.
 *
 * اصلِ طراحی — «قیمتِ قلمرو هرگز قیمتِ مشتری را بازنویسی نمی‌کند»:
 *   اولویت‌ها صریح و عددی‌اند (PRICE_SCOPE_RANK) و در تست‌های رفتاری قفل شده‌اند.
 *   هیچ قاعدهٔ سراسری به‌صورتِ خاموش قیمتِ دامنه‌ای را عوض نمی‌کند؛ در صورتِ تعارض،
 *   انتخاب بر اساسِ کلیدِ مرتب‌سازیِ قطعی است و دلیلش در breakdown بازگردانده می‌شود.
 *
 * اصلِ طراحی — fail-closed در تشویق:
 *   هر کلیدِ ناشناخته در conditions/benefit باعث می‌شود تشویق «اعمال‌نشده» با دلیلِ
 *   صریح ثبت شود، نه اینکه نادیده گرفته شود. (جلوگیری از تخفیفِ ناخواسته با دادهٔ کهنه.)
 */

import { dec, discountPct, lineTax, marginPct, money, roundMoney2, roundPct2, unitPrice } from '../../common/financial';

// =====================================================================
// خطاها
// =====================================================================

export type PricingErrorCode =
  | 'price_missing'
  | 'product_not_found'
  | 'product_inactive'
  | 'packaging_not_found'
  | 'customer_inactive'
  | 'price_list_not_found'
  | 'invalid_qty'
  | 'discount_cap_exceeded'
  | 'manual_price_not_authorized'
  | 'margin_floor_violation'
  | 'margin_cost_unknown'
  | 'unsupported_condition'
  | 'coupon_invalid'
  | 'max_total_discount_exceeded';

export class PricingEngineError extends Error {
  constructor(
    readonly code: PricingErrorCode,
    readonly message_fa: string,
    readonly httpStatus: 400 | 403 | 409 | 422 = 400,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message_fa);
    this.name = 'PricingEngineError';
  }
}

// =====================================================================
// انواعِ دادهٔ ورودی (شکلِ ردیف‌های DB — رشته برای decimal)
// =====================================================================

export interface PriceListRow {
  id: string;
  code: string;
  title: string;
  kind: string;
  priority: number;
  domain_id: string | null;
  is_default: boolean;
  is_active: boolean;
}

export interface PriceItemRow {
  id: string;
  price_list_id: string;
  product_id: string;
  packaging_id: string | null;
  price: string;
  min_qty: string;
  max_qty: string | null;
  max_discount_pct: string | null;
  valid_from: string | null;
  valid_to: string | null;
}

export interface CustomerPriceRow {
  id: string;
  customer_id: string;
  product_id: string;
  packaging_id: string | null;
  price: string;
  min_qty: string;
  max_qty: string | null;
  max_discount_pct: string | null;
  valid_from: string | null;
  valid_to: string | null;
}

export interface ProductRow {
  id: string;
  code: string;
  name: string;
  status: string;
  category_id: string | null;
  brand_id: string | null;
  tax_rate_pct: string;
  min_order_qty: string;
  vat_enabled: boolean;
}

export interface PackagingRow {
  id: string;
  product_id: string;
  factor_to_base: string;
}

export interface CostRow {
  product_id: string;
  avg_cost: string;
  standard_cost: string | null;
  last_purchase_cost: string | null;
  qty_weight: string;
}

export interface MarginPolicyRow {
  id: string;
  domain_id: string | null;
  scope: 'company' | 'category' | 'product';
  category_id: string | null;
  product_id: string | null;
  cost_basis: 'avg_cost' | 'standard_cost' | 'last_purchase_cost';
  min_margin_pct: string;
  on_unknown_cost: 'block' | 'warn' | 'ignore';
  priority: number;
  valid_from: string | null;
  valid_to: string | null;
}

export interface MarginExceptionRow {
  id: string;
  product_id: string | null;
  customer_id: string | null;
  policy_id: string | null;
  entity_type: string;
  entity_id: string | null;
  granted_margin_pct: string | null;
  status: string;
  valid_until: string | null;
}

export interface PromotionRow {
  id: string;
  code: string;
  title: string;
  kind: PromotionKind;
  priority: number;
  allow_stacking: boolean;
  exclusive_group: string | null;
  max_discount_amount: string | null;
  max_discount_pct: string | null;
  max_per_customer_per_day: string | null;
  max_uses_total: number | null;
  max_uses_per_customer: number | null;
  requires_coupon: boolean;
  conditions: Record<string, unknown>;
  benefit: Record<string, unknown>;
  valid_from: string | null;
  valid_to: string | null;
  domain_id: string | null;
}

export interface CouponRow {
  id: string;
  promotion_id: string;
  code: string;
  customer_id: string | null;
  valid_from: string;
  valid_to: string | null;
  max_uses: number | null;
  max_uses_per_customer: number | null;
  used_total: number;
  used_by_customer: number;
  is_active: boolean;
}

export interface PromotionUsageRow {
  promotion_id: string;
  coupon_id: string | null;
  customer_id: string | null;
  day_amount: string;
  customer_total_amount: string;
  customer_uses: number;
  total_uses: number;
}

export type PromotionKind =
  | 'percent_line'
  | 'amount_line'
  | 'bundle'
  | 'buy_x_get_y'
  | 'gift_item'
  | 'cash_discount'
  | 'repeat_order'
  | 'coupon'
  | 'volume_tier';

export interface QuoteLineInput {
  product_id: string;
  packaging_id?: string | null;
  qty: number;
  /** قیمتِ دستی — فقط با مجوز/استثنای معتبر؛ در غیر این صورت خطا */
  unit_price?: string | null;
  /** تخفیفِ دستیِ پیش از تشویق‌ها (مبلغِ ثابت روی قلم) */
  discount_amount?: string | null;
}

export interface QuoteCustomer {
  id: string;
  channel: string;
  price_list_id: string | null;
  settlement_term_ids: string[];
  status: string;
}

export interface QuoteContext {
  pricing_date: string; // YYYY-MM-DD (تاریخی که قیمت‌ها با آن سنجیده می‌شوند)
  customer: QuoteCustomer | null;
  /** قلمروهای مؤثر بر مشتری، مرتب از خاص‌ترین به عام‌ترین */
  domain_ids: string[];
  price_lists: PriceListRow[];
  price_items: PriceItemRow[];
  customer_prices: CustomerPriceRow[];
  products: ProductRow[];
  packaging: PackagingRow[];
  costs: CostRow[];
  margin_policies: MarginPolicyRow[];
  margin_exceptions: MarginExceptionRow[];
  promotions: PromotionRow[];
  coupons: CouponRow[];
  usage: PromotionUsageRow[];
  order_history: { total_orders: number; first_order_at: string | null };
  /** قیمتِ مبنا برای ارزش‌گذاریِ هدیه/جایزه (کالاهایی که در سبد نیستند) */
  reference_prices: Record<string, number>;
  options?: QuoteOptions;
}

export interface QuoteOptions {
  explicit_price_list_id?: string | null;
  coupon_codes?: string[];
  max_total_discount_pct?: number | null;
  /** سقفِ پیش‌فرضِ تخفیفِ هر قلم وقتی منبعِ قیمت سقفِ خودش را ندارد (سیاستِ شرکت) */
  max_line_discount_pct?: number | null;
  apply_promotions?: boolean;
  /** اجازهٔ قیمتِ دستی (مجوز در لایهٔ سرویس بررسی می‌شود) */
  allow_manual_price?: boolean;
  /** اجازهٔ تخفیفِ دستیِ فراتر از سقفِ قلم (فقط با مجوز/استثنا) */
  allow_discount_override?: boolean;
  /**
   * TASK-24F: اجازهٔ فروشِ زیرِ بهای تمام‌شده. از سیاستِ پایدارِ شرکت
   * (`pricing_settings.allow_loss_making_sales`) پر می‌شود؛ پیش‌فرض `false` (fail-closed).
   */
  allow_loss_making?: boolean;
}

// =====================================================================
// انواعِ خروجی
// =====================================================================

export type PriceSource = 'customer_price' | 'price_list' | 'manual';

/**
 * منبعِ حقیقتِ مقادیرِ شمارشیِ موتور (TASK-24F · MEDIUM-3).
 * آرایه‌ها هم نوعِ TS را می‌سازند و هم `scripts/contract-drift.mjs` آن‌ها را با
 * enumهای `packages/contracts/openapi.yaml` مقایسه می‌کند تا واگراییِ قرارداد
 * (مثلِ `explicit_list` در برابرِ `requested_list`) دیگر بی‌صدا نماند.
 */
export const PRICE_SCOPES = ['customer', 'explicit_list', 'domain', 'company', 'manual'] as const;
export type PriceScope = (typeof PRICE_SCOPES)[number];

export const MARGIN_STATUSES = [
  'ok',
  'violation',
  'cost_unknown',
  'exception_applied',
  'no_policy',
] as const;
export type MarginStatus = (typeof MARGIN_STATUSES)[number];

export const SKIP_REASONS = [
  'not_applicable',
  'condition_unmatched',
  'unsupported_condition',
  'unsupported_benefit',
  'not_stackable',
  'exclusive_group_conflict',
  'blocked_by_non_stackable',
  'daily_cap_exceeded',
  'total_cap_exceeded',
  'customer_cap_exceeded',
  'coupon_required',
  'coupon_invalid',
  'zero_benefit',
] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

export const MARGIN_VIOLATION_CODES = [
  'margin_floor_violation',
  'margin_cost_unknown',
  'margin_loss_making',
] as const;

export interface PriceResolution {
  unit_price: string; // قیمتِ هر واحدِ خط (بسته یا پایه)
  unit_price_base: string; // قیمتِ هر واحدِ پایه
  source: PriceSource;
  scope: PriceScope;
  price_list_id: string | null;
  price_list_code: string | null;
  price_item_id: string | null;
  customer_price_id: string | null;
  packaging_id: string | null;
  tier: { min_qty: string; max_qty: string | null } | null;
  qty_for_tier: number;
  max_discount_pct: number | null;
  explanation_fa: string;
}

export interface AppliedPromotion {
  promotion_id: string;
  code: string;
  title: string;
  kind: PromotionKind;
  priority: number;
  amount: string;
  base_amount: string;
  allow_stacking: boolean;
  exclusive_group: string | null;
  coupon_code: string | null;
  coupon_id: string | null;
  explanation_fa: string;
}

export interface SkippedPromotion {
  promotion_id: string;
  code: string;
  kind: PromotionKind;
  reason: SkipReason;
  message_fa: string;
}

export interface GiftLine {
  promotion_id: string;
  promotion_code: string;
  product_id: string;
  qty: number;
  unit_price: string;
  value: string;
  /** هدیه به‌صورتِ تخفیفِ مالی معادلِ ارزش ثبت می‌شود (D5: بدونِ اثرِ انبار/سند) */
  valuation_source: 'basket' | 'reference_price' | 'unknown';
  /** خطوطی که این هدیه به آن‌ها تخصیص یافته (TASK-24F: انتسابِ صریح به‌جای حدسِ کدِ تشویق) */
  line_nos?: number[];
  /** اگر ارزشِ هدیه به ماندهٔ سبد محدود شد، مقدارِ نظریِ اولیه */
  requested_value?: string;
}

export interface LineMarginResult {
  cost_basis: 'avg_cost' | 'standard_cost' | 'last_purchase_cost' | 'none';
  cost_unit: string | null;
  cost_total: string | null;
  net_revenue: string;
  margin_pct: number | null;
  policy_id: string | null;
  required_margin_pct: number | null;
  status: MarginStatus;
  /** سقفِ تخفیفِ مؤثرِ منبعِ قیمت (برای کنترلِ تخفیف در لایهٔ سفارش) */
  exception_granted_margin_pct?: number | null;
  exception_id: string | null;
  message_fa: string | null;
}

export interface QuoteLineResult {
  line_no: number;
  product_id: string;
  product_code: string;
  product_name: string;
  packaging_id: string | null;
  packaging_title: string | null;
  packaging_factor: number;
  qty: number;
  qty_base: number;
  unit_price: string;
  gross: string;
  manual_discount: string;
  manual_discount_pct: number;
  pricing: PriceResolution;
  promotions: AppliedPromotion[];
  discount_total: string;
  net_ex_tax: string;
  tax_rate_pct: number;
  tax_amount: string;
  line_total: string;
  margin: LineMarginResult;
  gift_lines: GiftLine[];
}

export interface QuoteResult {
  pricing_date: string;
  currency: string;
  customer_id: string | null;
  domain_ids: string[];
  lines: QuoteLineResult[];
  subtotal: string;
  manual_discount_total: string;
  discount_total: string;
  tax_total: string;
  grand_total: string;
  cost_total: string;
  margin_pct: number | null;
  applied_promotions: AppliedPromotion[];
  skipped_promotions: SkippedPromotion[];
  gift_lines: GiftLine[];
  margin_violations: {
    product_id: string;
    margin_pct: number | null;
    required_margin_pct: number | null;
    policy_id: string | null;
    code: (typeof MARGIN_VIOLATION_CODES)[number];
    message_fa: string;
  }[];
  warnings: string[];
  approval_required: { required: boolean; reasons: string[] };
  explanation: string[];
}

// =====================================================================
// §1  اولویتِ منابعِ قیمت (قطعی و عددی)
// =====================================================================

/**
 * رتبهٔ دامنهٔ قیمت — عددِ کوچک‌تر = اولویتِ بالاتر.
 *   ۱) قیمتِ اختصاصیِ مشتری (approved یا legacy)
 *   ۲) لیستِ صریحِ درخواست (انتخابِ اپراتور)
 *   ۳) لیستِ قلمرو (کانال/حوزه/شعبه)
 *   ۴) لیستِ سراسریِ شرکت
 *   ۵) قیمتِ دستی (فقط با مجوز)
 */
export const PRICE_SCOPE_RANK: Record<PriceScope, number> = {
  customer: 1,
  explicit_list: 2,
  domain: 3,
  company: 4,
  manual: 5,
};

const inDateRange = (date: string, from: string | null, to: string | null): boolean => {
  // daterange: کرانِ پایین شامل، کرانِ بالا انحصاری — همان معنای `valid @> date`
  if (from != null && date < from) return false;
  if (to != null && date >= to) return false;
  return true;
};

interface Candidate {
  scope: PriceScope;
  scope_rank: number;
  /** رتبهٔ قلمرو (۰ = خاص‌ترین) — فقط برای لیست‌های قلمرویی */
  domain_rank: number;
  /** ۰ = قیمتِ همان بستهٔ خط، ۱ = قیمتِ واحدِ پایه (تبدیل با ضریب) */
  packaging_rank: number;
  list_priority: number;
  list_code: string;
  list_id: string | null;
  item_id: string | null;
  customer_price_id: string | null;
  price_list_code: string | null;
  packaging_id: string | null;
  price_unit_for_line: number;
  tier_min: number;
  tier_max: number | null;
  tier_min_raw: string;
  tier_max_raw: string | null;
  max_discount_pct: number | null;
  qty_for_tier: number;
  sort_key: string;
}

const qtyInTier = (qty: number, min: number, max: number | null): boolean =>
  qty >= min && (max == null || qty <= max);

/**
 * حلِ قیمتِ یک قلم — کاملاً قطعی.
 * ورودی: محصول/بسته/تعداد/تاریخ/لیست‌های واجدِ شرط.
 * خروجی: قیمتِ واحد + منبع + دلیلِ انتخاب (برای توضیح‌پذیریِ شبیه‌سازی).
 */
export function resolveLinePrice(
  ctx: QuoteContext,
  line: QuoteLineInput,
  lineNo: number,
): PriceResolution {
  const product = ctx.products.find((p) => p.id === line.product_id);
  if (!product) {
    throw new PricingEngineError('product_not_found', 'کالای انتخاب‌شده در این شرکت یافت نشد.', 400, {
      line_no: lineNo,
      product_id: line.product_id,
    });
  }
  if (product.status !== 'active') {
    throw new PricingEngineError('product_inactive', 'کالای انتخاب‌شده فعال نیست و قابلِ قیمت‌گذاری نیست.', 400, {
      line_no: lineNo,
      product_id: line.product_id,
      status: product.status,
    });
  }
  if (!Number.isFinite(line.qty) || line.qty <= 0) {
    throw new PricingEngineError('invalid_qty', 'تعدادِ هر قلم باید بزرگ‌تر از صفر باشد.', 400, {
      line_no: lineNo,
      qty: line.qty,
    });
  }

  let factor = 1;
  if (line.packaging_id) {
    const pk = ctx.packaging.find((p) => p.id === line.packaging_id && p.product_id === line.product_id);
    if (!pk) {
      throw new PricingEngineError('packaging_not_found', 'بسته‌بندی انتخاب‌شده برای این کالا یافت نشد.', 400, {
        line_no: lineNo,
        product_id: line.product_id,
        packaging_id: line.packaging_id,
      });
    }
    factor = dec(pk.factor_to_base);
  }
  const qtyBase = line.qty * factor;

  // ---- قیمتِ دستی ----
  if (line.unit_price != null) {
    if (!ctx.options?.allow_manual_price) {
      throw new PricingEngineError(
        'manual_price_not_authorized',
        'درجِ قیمتِ دستی برای این کاربر مجاز نیست؛ از موتورِ قیمت استفاده کنید.',
        403,
        { line_no: lineNo },
      );
    }
    const manual = dec(line.unit_price);
    return {
      unit_price: unitPrice(manual),
      unit_price_base: unitPrice(factor > 0 ? manual / factor : manual),
      source: 'manual',
      scope: 'manual',
      price_list_id: null,
      price_list_code: null,
      price_item_id: null,
      customer_price_id: null,
      packaging_id: line.packaging_id ?? null,
      tier: null,
      qty_for_tier: line.qty,
      max_discount_pct: null,
      explanation_fa: `قیمتِ دستی برای قلم ${lineNo} اعمال شد (با مجوز).`,
    };
  }

  const candidates: Candidate[] = [];

  // ---- ۱) قیمتِ اختصاصیِ مشتری ----
  if (ctx.customer) {
    for (const cp of ctx.customer_prices) {
      if (cp.customer_id !== ctx.customer.id || cp.product_id !== line.product_id) continue;
      if (!dateOk(ctx.pricing_date, cp.valid_from, cp.valid_to)) continue;
      const tierQty = packagingQtyFor(cp.packaging_id, line.packaging_id, line.qty, qtyBase);
      if (tierQty == null) continue; // بستهٔ دیگر
      if (!qtyInTier(tierQty, dec(cp.min_qty), cp.max_qty == null ? null : dec(cp.max_qty))) continue;
      const priceForLine =
        cp.packaging_id === (line.packaging_id ?? null) ? dec(cp.price) : dec(cp.price) * factor;
      candidates.push({
        scope: 'customer',
        scope_rank: PRICE_SCOPE_RANK.customer,
        domain_rank: 0,
        packaging_rank: cp.packaging_id != null && cp.packaging_id === (line.packaging_id ?? null) ? 0 : 1,
        list_priority: 0,
        list_code: '',
        list_id: null,
        item_id: null,
        customer_price_id: cp.id,
        price_list_code: null,
        packaging_id: cp.packaging_id,
        price_unit_for_line: priceForLine,
        tier_min: dec(cp.min_qty),
        tier_max: cp.max_qty == null ? null : dec(cp.max_qty),
        tier_min_raw: cp.min_qty,
        tier_max_raw: cp.max_qty,
        max_discount_pct: cp.max_discount_pct == null ? null : dec(cp.max_discount_pct),
        qty_for_tier: tierQty,
        sort_key: `1|${String(dec(cp.min_qty)).padStart(12, '0')}|${cp.id}`,
      });
    }
  }

  // ---- ۲..۴) لیست‌های قیمت ----
  const explicit = ctx.options?.explicit_price_list_id ?? null;
  const lists = ctx.price_lists.filter((l) => l.is_active);
  for (const list of lists) {
    let scope: PriceScope;
    if (explicit) {
      if (list.id !== explicit) continue;
      scope = 'explicit_list';
    } else if (list.domain_id) {
      if (!ctx.domain_ids.includes(list.domain_id)) continue;
      scope = 'domain';
    } else if (list.domain_id == null) {
      scope = 'company';
    } else {
      continue; // لیستِ قلمروی دیگر — هرگز به‌صورتِ خاموش اعمال نمی‌شود
    }

    const domainRank = list.domain_id ? ctx.domain_ids.indexOf(list.domain_id) : -1;
    for (const item of ctx.price_items) {
      if (item.price_list_id !== list.id || item.product_id !== line.product_id) continue;
      if (!dateOk(ctx.pricing_date, item.valid_from, item.valid_to)) continue;
      const tierQty = packagingQtyFor(item.packaging_id, line.packaging_id, line.qty, qtyBase);
      if (tierQty == null) continue;
      if (!qtyInTier(tierQty, dec(item.min_qty), item.max_qty == null ? null : dec(item.max_qty))) continue;
      const priceForLine =
        item.packaging_id === (line.packaging_id ?? null) ? dec(item.price) : dec(item.price) * factor;
      candidates.push({
        scope,
        scope_rank: PRICE_SCOPE_RANK[scope],
        domain_rank: scope === 'domain' ? domainRank : 0,
        packaging_rank: item.packaging_id != null && item.packaging_id === (line.packaging_id ?? null) ? 0 : 1,
        list_priority: list.priority,
        list_code: list.code,
        list_id: list.id,
        item_id: item.id,
        customer_price_id: null,
        price_list_code: list.code,
        packaging_id: item.packaging_id,
        price_unit_for_line: priceForLine,
        tier_min: dec(item.min_qty),
        tier_max: item.max_qty == null ? null : dec(item.max_qty),
        tier_min_raw: item.min_qty,
        tier_max_raw: item.max_qty,
        max_discount_pct: item.max_discount_pct == null ? null : dec(item.max_discount_pct),
        qty_for_tier: tierQty,
        sort_key: `${PRICE_SCOPE_RANK[scope]}|${String(dec(item.min_qty)).padStart(12, '0')}|${list.code}|${item.id}`,
      });
    }
  }

  if (candidates.length === 0) {
    throw new PricingEngineError(
      'price_missing',
      'برای این کالا قیمتِ فعالی در لیست‌های قیمتِ مجاز یافت نشد.',
      400,
      { line_no: lineNo, product_id: line.product_id, packaging_id: line.packaging_id ?? null, pricing_date: ctx.pricing_date },
    );
  }

  // ---- انتخابِ قطعی ----
  // (scope, min_qty نزولی) برای هر منبع؛ سپس اولویتِ لیست نزولی و کدِ لیست صعودی.
  // ترتیبِ انتخاب — ابتدا «کدام منبع/لیست»، سپس «کدام سطحِ تعداد در همان لیست»:
  //   ۱) رتبهٔ دامنه (مشتری > لیستِ صریح > قلمرو > سراسری)
  //   ۲) رتبهٔ قلمرو (قلمروِ خاص‌تر اول — ترتیبِ ctx.domain_ids)
  //   ۳) اولویتِ لیست (عددِ بزرگ‌تر اول)، ۴) کدِ لیست (صعودی)
  //   ۵) قیمتِ همان بستهٔ خط مقدم بر قیمتِ واحدِ پایه
  //   ۶) سطحِ تعدادی (min_qty بزرگ‌تر اول)، ۷) شناسهٔ ردیف (صعودی) برای قطعیتِ کامل
  candidates.sort((a, b) => {
    if (a.scope_rank !== b.scope_rank) return a.scope_rank - b.scope_rank;
    if (a.domain_rank !== b.domain_rank) return a.domain_rank - b.domain_rank;
    if (a.list_priority !== b.list_priority) return b.list_priority - a.list_priority;
    if (a.list_code !== b.list_code) return a.list_code < b.list_code ? -1 : 1;
    // قیمتِ همان بستهٔ خط بر قیمتِ واحدِ پایه اولویت دارد (تبدیل همیشه ممکن است)
    if (a.packaging_rank !== b.packaging_rank) return a.packaging_rank - b.packaging_rank;
    if (a.tier_min !== b.tier_min) return b.tier_min - a.tier_min;
    return a.sort_key < b.sort_key ? -1 : a.sort_key > b.sort_key ? 1 : 0;
  });
  const best = candidates[0];

  const source: PriceSource = best.scope === 'customer' ? 'customer_price' : 'price_list';
  const scopeFa: Record<PriceScope, string> = {
    customer: 'قیمتِ اختصاصیِ مشتری',
    explicit_list: 'لیستِ قیمتِ انتخاب‌شده',
    domain: 'لیستِ قیمتِ قلمرو',
    company: 'لیستِ قیمتِ سراسریِ شرکت',
    manual: 'قیمتِ دستی',
  };
  const tierFa =
    best.tier_min > 0 || best.tier_max != null
      ? ` (سطحِ تعدادی ${best.tier_min}${best.tier_max != null ? `–${best.tier_max}` : '+'})`
      : '';
  const packagingFa = best.packaging_id ? ' برای بستهٔ انتخابی' : ' بر مبنای واحدِ پایه';

  return {
    unit_price: unitPrice(best.price_unit_for_line),
    unit_price_base: unitPrice(factor > 0 ? best.price_unit_for_line / factor : best.price_unit_for_line),
    source,
    scope: best.scope,
    price_list_id: best.list_id,
    price_list_code: best.price_list_code,
    price_item_id: best.item_id,
    customer_price_id: best.customer_price_id,
    packaging_id: best.packaging_id,
    tier: best.tier_min_raw !== '0' || best.tier_max_raw != null
      ? { min_qty: best.tier_min_raw, max_qty: best.tier_max_raw }
      : null,
    qty_for_tier: best.qty_for_tier,
    max_discount_pct: best.max_discount_pct,
    explanation_fa: `${scopeFa[best.scope]}${best.price_list_code ? ` «${best.price_list_code}»` : ''}${packagingFa}${tierFa} انتخاب شد؛ ${candidates.length} گزینهٔ واجدِ شرط بررسی شد.`,
  };
}

const dateOk = (date: string, from: string | null, to: string | null): boolean =>
  inDateRange(date, from, to);

/**
 * تعدادِ قابلِ مقایسه با سطحِ یک ردیف.
 * - ردیفِ بستهٔ همان بستهٔ خط ⇒ تعداد به واحدِ بسته
 * - ردیفِ واحدِ پایه ⇒ تعداد به واحدِ پایه
 * - ردیفِ بستهٔ دیگر ⇒ null (قابلِ اعمال نیست)
 */
const packagingQtyFor = (
  itemPackaging: string | null,
  linePackaging: string | null | undefined,
  qty: number,
  qtyBase: number,
): number | null => {
  if (itemPackaging == null) return qtyBase;
  if (linePackaging != null && itemPackaging === linePackaging) return qty;
  return null;
};

// =====================================================================
// §2  موتورِ تشویق
// =====================================================================

const SUPPORTED_CONDITIONS = new Set([
  'product_ids',
  'category_ids',
  'brand_ids',
  'packaging_ids',
  'channel',
  'customer_ids',
  'settlement_term_ids',
  'min_qty',
  'min_amount',
  'days_of_week',
  'first_order_only',
  'tiers',
  'buy_x',
  'bundle',
  'repeat',
]);

const SUPPORTED_BENEFITS = new Set([
  'percent',
  'amount',
  'per',
  'max_amount',
  'gift',
  'free_qty',
  'get_product_id',
  'bundle_price',
  'tiers',
]);

interface PromotionLineState {
  line: QuoteLineResult;
  /** مبلغِ باقی‌ماندهٔ قلم پس از تخفیفِ دستی و تشویق‌های اعمال‌شده (بدونِ مالیات) */
  remaining: number;
}

interface PromotionEvalState {
  lines: PromotionLineState[];
  applied: AppliedPromotion[];
  skipped: SkippedPromotion[];
  gifts: GiftLine[];
  remainingTotal: number;
  subtotal: number;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** مجموعِ ماندهٔ خطوطِ سبد (بعد از تخفیفِ دستی و تشویق‌های قبلی) */
const remainingOf = (state: PromotionEvalState): number =>
  roundMoney2(state.lines.reduce((s, l) => s + l.remaining, 0));
const asArrayOfStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

/** نوعِ تشویق به «مبنا» نگاشت می‌شود: قلم‌محور یا سندمحور */
const isLineScopedKind = (kind: PromotionKind): boolean =>
  kind === 'percent_line' ||
  kind === 'amount_line' ||
  kind === 'volume_tier' ||
  kind === 'bundle' ||
  kind === 'buy_x_get_y' ||
  kind === 'gift_item';

/**
 * ارزیابیِ همهٔ تشویق‌های واجدِ شرط با ترتیب و قواعدِ صریح:
 *   ۱) ترتیبِ اجرا: priority نزولی، سپس code صعودی (قطعیتِ کامل؛ مستقل از ترتیبِ کوئری)
 *   ۲) allow_stacking=false ⇒ پس از اعمال، هیچ تشویقِ دیگری اعمال نمی‌شود
 *   ۳) exclusive_group ⇒ حداکثر یک تشویق از هر گروه
 *   ۴) سقف‌ها: درصد/مبلغِ تشویق، سقفِ روزانهٔ مشتری، سقفِ مصرف، سقفِ کلِ سند
 */
export function evaluatePromotions(
  ctx: QuoteContext,
  state: PromotionEvalState,
  lineProductIds: string[],
): void {
  if (ctx.options?.apply_promotions === false) return;
  const couponCodes = (ctx.options?.coupon_codes ?? []).map((c) => c.trim().toUpperCase()).filter(Boolean);
  const usageByPromotion = new Map(ctx.usage.map((u) => [u.promotion_id, u]));
  const couponByCode = new Map(ctx.coupons.map((c) => [c.code.toUpperCase(), c]));

  const candidates = ctx.promotions
    .filter((p) => inDateRange(ctx.pricing_date, p.valid_from, p.valid_to))
    .filter((p) => p.domain_id == null || ctx.domain_ids.includes(p.domain_id))
    .sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      if (a.code !== b.code) return a.code < b.code ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

  const usedGroups = new Set<string>();
  let blockedByNonStackable = false;

  for (const promo of candidates) {
    const skip = (reason: SkippedPromotion['reason'], message_fa: string): void => {
      state.skipped.push({ promotion_id: promo.id, code: promo.code, kind: promo.kind, reason, message_fa });
    };

    if (blockedByNonStackable) {
      skip('blocked_by_non_stackable', 'پس از اعمالِ یک تشویقِ غیرقابلِ ترکیب، تشویق‌های بعدی اعمال نمی‌شوند.');
      continue;
    }
    if (promo.exclusive_group && usedGroups.has(promo.exclusive_group)) {
      skip('exclusive_group_conflict', `گروهِ انحصاری «${promo.exclusive_group}» قبلاً توسط تشویقِ دیگری مصرف شده است.`);
      continue;
    }

    const unknownCondition = Object.keys(promo.conditions ?? {}).find((k) => !SUPPORTED_CONDITIONS.has(k));
    if (unknownCondition) {
      skip('unsupported_condition', `شرطِ ناشناخته «${unknownCondition}» در تعریفِ تشویق؛ برای پیشگیری از تخفیفِ ناخواسته اعمال نشد.`);
      continue;
    }
    const unknownBenefit = Object.keys(promo.benefit ?? {}).find((k) => !SUPPORTED_BENEFITS.has(k));
    if (unknownBenefit) {
      skip('unsupported_benefit', `مزیتِ ناشناخته «${unknownBenefit}» در تعریفِ تشویق؛ برای پیشگیری از تخفیفِ ناخواسته اعمال نشد.`);
      continue;
    }

    // ---- کوپن ----
    let coupon: CouponRow | null = null;
    const needsCoupon = promo.requires_coupon || promo.kind === 'coupon';
    if (needsCoupon) {
      const matching = couponCodes
        .map((c) => couponByCode.get(c))
        .filter((c): c is CouponRow => Boolean(c) && c!.promotion_id === promo.id && c!.is_active);
      const valid = matching.find(
        (c) =>
          inDateRange(ctx.pricing_date, c.valid_from, c.valid_to) &&
          (c.customer_id == null || c.customer_id === ctx.customer?.id) &&
          (c.max_uses == null || c.used_total < c.max_uses) &&
          (c.max_uses_per_customer == null || c.used_by_customer < c.max_uses_per_customer),
      );
      if (!valid) {
        if (couponCodes.length === 0) {
          skip('coupon_required', 'این تشویق فقط با کوپنِ معتبر اجرا می‌شود و کوپنی ارائه نشده است.');
        } else {
          skip('coupon_invalid', 'کوپنِ ارائه‌شده برای این تشویق معتبر نیست، منقضی شده یا سقفِ مصرفش پر است.');
        }
        continue;
      }
      coupon = valid;
    }

    // ---- شرط‌ها ----
    const condition = matchConditions(ctx, promo, state, lineProductIds);
    if (!condition.matched) {
      skip(condition.reason ?? 'condition_unmatched', condition.message_fa);
      continue;
    }

    // ---- سقف‌های مصرف ----
    const usage = usageByPromotion.get(promo.id);
    if (promo.max_uses_total != null && (usage?.total_uses ?? 0) >= promo.max_uses_total) {
      skip('total_cap_exceeded', 'سقفِ کلِ مصرفِ این تشویق پر شده است.');
      continue;
    }
    if (promo.max_uses_per_customer != null && (usage?.customer_uses ?? 0) >= promo.max_uses_per_customer) {
      skip('customer_cap_exceeded', 'سقفِ مصرفِ این تشویق برای این مشتری پر شده است.');
      continue;
    }
    const dayUsed = dec(usage?.day_amount);
    const dayCap = promo.max_per_customer_per_day == null ? null : dec(promo.max_per_customer_per_day);

    // ---- محاسبهٔ مزیت ----
    const outcome = computeBenefit(ctx, promo, state, coupon, lineProductIds);
    if (outcome.amount <= 0) {
      skip('zero_benefit', outcome.message_fa || 'مزیتِ محاسبه‌شده صفر است؛ اعمال نشد.');
      continue;
    }
    let amount = outcome.amount;
    let baseAmount = outcome.base_amount;

    if (promo.max_discount_pct != null && baseAmount > 0) {
      const cap = roundMoney2((dec(promo.max_discount_pct) / 100) * baseAmount);
      if (amount > cap) {
        amount = cap;
        outcome.notes.push(`سقفِ درصدِ تشویق (${promo.max_discount_pct}%) اعمال شد.`);
      }
    }
    if (promo.max_discount_amount != null) {
      const cap = dec(promo.max_discount_amount);
      if (amount > cap) {
        amount = cap;
        outcome.notes.push(`سقفِ مبلغِ تشویق (${money(cap)}) اعمال شد.`);
      }
    }
    if (dayCap != null) {
      const remainingCap = roundMoney2(dayCap - dayUsed);
      if (remainingCap <= 0) {
        skip('daily_cap_exceeded', 'سقفِ تخفیفِ روزانهٔ این مشتری برای این تشویق پر شده است.');
        continue;
      }
      if (amount > remainingCap) {
        amount = remainingCap;
        outcome.notes.push('سقفِ روزانهٔ مشتری، مبلغِ این تشویق را محدود کرد.');
      }
    }
    // سقفِ کلِ سند (درخواست/سیاست)
    if (ctx.options?.max_total_discount_pct != null && state.subtotal > 0) {
      const maxTotal = roundMoney2((ctx.options.max_total_discount_pct / 100) * state.subtotal);
      const headroom = roundMoney2(maxTotal - state.applied.reduce((s, a) => s + dec(a.amount), 0));
      if (headroom <= 0) {
        skip('total_cap_exceeded', 'سقفِ کلِ تخفیفِ سند پر شده است؛ تشویقِ بعدی اعمال نشد.');
        continue;
      }
      if (amount > headroom) {
        amount = headroom;
        outcome.notes.push('سقفِ کلِ تخفیفِ سند، مبلغ را محدود کرد.');
      }
    }

    // ---- تخصیص به خطوط ----
    // TASK-24F · HIGH-4: مبلغی که در سند/دفترِ مصرف ثبت می‌شود باید «مبلغِ واقعاً
    // تخصیص‌یافته به خطوط» باشد، نه مزیتِ نظری (که می‌تواند از ماندهٔ سبد بیشتر باشد).
    const allocation = outcome.allocate(amount);
    let allocatedTotal = 0;
    const allocatedLineNos: number[] = [];
    for (const part of allocation) {
      const lineState = state.lines.find((l) => l.line.line_no === part.line_no);
      if (!lineState) continue;
      if (part.amount > lineState.remaining + 0.0001) part.amount = roundMoney2(lineState.remaining);
      if (part.amount <= 0) continue;
      lineState.remaining = roundMoney2(lineState.remaining - part.amount);
      allocatedTotal = roundMoney2(allocatedTotal + part.amount);
      allocatedLineNos.push(part.line_no);
      lineState.line.promotions.push({
        promotion_id: promo.id,
        code: promo.code,
        title: promo.title,
        kind: promo.kind,
        priority: promo.priority,
        amount: money(part.amount),
        base_amount: money(baseAmount),
        allow_stacking: promo.allow_stacking,
        exclusive_group: promo.exclusive_group,
        coupon_code: coupon?.code ?? null,
        coupon_id: coupon?.id ?? null,
        explanation_fa: outcome.message_fa,
      });
      lineState.line.discount_total = money(dec(lineState.line.discount_total) + part.amount);
    }

    // مبلغِ صفر تخصیصی ⇒ تشویق عملاً اعمال نشده (نه در دفترِ مصرف، نه در breakdown)
    if (allocatedTotal <= 0) {
      skip('zero_benefit', 'مزیتِ محاسبه‌شده پس از سقفِ خطوط صفر شد؛ اعمال نشد.');
      continue;
    }

    state.remainingTotal = roundMoney2(state.remainingTotal - allocatedTotal);
    state.applied.push({
      promotion_id: promo.id,
      code: promo.code,
      title: promo.title,
      kind: promo.kind,
      priority: promo.priority,
      amount: money(allocatedTotal),
      base_amount: money(baseAmount),
      allow_stacking: promo.allow_stacking,
      exclusive_group: promo.exclusive_group,
      coupon_code: coupon?.code ?? null,
      coupon_id: coupon?.id ?? null,
      explanation_fa: [outcome.message_fa, ...outcome.notes].filter(Boolean).join(' '),
    });
    if (outcome.gift_lines.length > 0) {
      state.gifts.push(
        ...outcome.gift_lines.map((gift) => attributeGift(gift, allocatedTotal, allocatedLineNos)),
      );
    }
    if (promo.exclusive_group) usedGroups.add(promo.exclusive_group);
    if (!promo.allow_stacking) blockedByNonStackable = true;
  }
}

/**
 * TASK-24F · HIGH-4: ارزشِ ثبت‌شدهٔ هدیه نمی‌تواند از مبلغی که واقعاً از سبد کسر شد
 * بیشتر باشد. مقدارِ فیزیکی (qty) هم با همان نسبت مقیاس می‌شود تا
 * `value = qty × unit_price` در دفترِ مصرف/تسویه خودسازگار بماند.
 */
function attributeGift(
  gift: GiftLine,
  allocatedTotal: number,
  lineNos: number[],
): GiftLine {
  // ارزشِ «درخواستی» = بزرگ‌ترین مقداری که تشویق ادعا کرده است (ارزشِ نظریِ هدیه یا
  // ارزشی که پیش‌تر به ماندهٔ سبد محدود شده بود) تا سقف‌های بعدی گم نشود.
  const ownValue = dec(gift.value);
  const priorRequested = gift.requested_value == null ? 0 : dec(gift.requested_value);
  const requestedValue = Math.max(ownValue, priorRequested);
  // هیچ‌گاه بیش از مبلغی که واقعاً از سبد کسر شد (allocatedTotal) ثبت نمی‌شود.
  const allowed = Math.max(0, Math.min(ownValue, allocatedTotal));
  const ratio = ownValue > 0 ? allowed / ownValue : 0;
  const unit = dec(gift.unit_price);
  const cappedQty = unit > 0 ? roundQty(allowed / unit) : roundQty(gift.qty * ratio);
  return {
    ...gift,
    qty: roundQty(Math.min(gift.qty, cappedQty)),
    value: money(allowed),
    requested_value: allowed < requestedValue ? money(requestedValue) : undefined,
    line_nos: lineNos,
  };
}

interface ConditionOutcome {
  matched: boolean;
  reason?: SkippedPromotion['reason'];
  message_fa: string;
}

function matchConditions(
  ctx: QuoteContext,
  promo: PromotionRow,
  state: PromotionEvalState,
  lineProductIds: string[],
): ConditionOutcome {
  const c = promo.conditions ?? {};
  const eligible = eligibleLines(ctx, c, state, lineProductIds);
  if (eligible.length === 0 && (isLineScopedKind(promo.kind) || c.product_ids || c.category_ids || c.brand_ids)) {
    return { matched: false, reason: 'condition_unmatched', message_fa: 'هیچ قلمِ واجدِ شرطی از نظرِ کالا/گروه برای این تشویق وجود ندارد.' };
  }

  if (c.channel) {
    const channels = asArrayOfStrings(c.channel);
    if (channels.length > 0 && (!ctx.customer || !channels.includes(ctx.customer.channel))) {
      return { matched: false, reason: 'condition_unmatched', message_fa: 'کانالِ مشتری با شرطِ تشویق نمی‌خواند.' };
    }
  }
  if (c.customer_ids) {
    const ids = asArrayOfStrings(c.customer_ids);
    if (ids.length > 0 && (!ctx.customer || !ids.includes(ctx.customer.id))) {
      return { matched: false, reason: 'condition_unmatched', message_fa: 'این تشویق برای مشتریِ انتخابی تعریف نشده است.' };
    }
  }
  if (c.settlement_term_ids) {
    const ids = asArrayOfStrings(c.settlement_term_ids);
    if (ids.length > 0 && !ids.some((id) => ctx.customer?.settlement_term_ids.includes(id))) {
      return { matched: false, reason: 'condition_unmatched', message_fa: 'شرطِ تسویهٔ تشویق با تسویهٔ مشتری نمی‌خواند.' };
    }
  }
  if (c.days_of_week) {
    const days = Array.isArray(c.days_of_week) ? c.days_of_week.filter(isNum) : [];
    if (days.length > 0) {
      const dow = new Date(`${ctx.pricing_date}T00:00:00Z`).getUTCDay();
      if (!days.includes(dow)) {
        return { matched: false, reason: 'condition_unmatched', message_fa: 'روزِ هفته با شرطِ تشویق نمی‌خواند.' };
      }
    }
  }
  if (c.first_order_only === true && ctx.order_history.total_orders > 0) {
    return { matched: false, reason: 'condition_unmatched', message_fa: 'این تشویق فقط برای نخستین سفارشِ مشتری است.' };
  }
  if (isNum(c.min_qty)) {
    const qtySum = eligible.reduce((s, l) => s + l.line.qty_base, 0);
    if (qtySum < c.min_qty) {
      return { matched: false, reason: 'condition_unmatched', message_fa: `حداقلِ تعدادِ شرط (${c.min_qty}) برآورده نشد.` };
    }
  }
  if (isNum(c.min_amount)) {
    const amount = eligible.reduce((s, l) => s + l.remaining, 0);
    if (amount < c.min_amount) {
      return { matched: false, reason: 'condition_unmatched', message_fa: `حداقلِ مبلغِ شرط (${money(c.min_amount)}) برآورده نشد.` };
    }
  }
  if (c.repeat) {
    const rep = c.repeat as Record<string, unknown>;
    if (!isNum(rep.min_orders)) {
      return { matched: false, reason: 'unsupported_condition', message_fa: 'شرطِ تکرارِ خرید بدونِ min_orders معتبر نیست.' };
    }
    if (ctx.order_history.total_orders < rep.min_orders) {
      return { matched: false, reason: 'condition_unmatched', message_fa: `این تشویق نیازمندِ حداقل ${rep.min_orders} سفارشِ قبلی است.` };
    }
    if (isNum(rep.within_days) && ctx.order_history.first_order_at) {
      // سابقهٔ خریدِ اخیر: بازهٔ مجاز بر مبنای آخرین سفارش در ریپازیتوری محاسبه می‌شود؛
      // این‌جا فقط تعدادِ سفارش‌ها سنجیده می‌شود (بدونِ تاریخِ مبهم).
      void rep.within_days;
    }
  }
  return { matched: true, message_fa: '' };
}

function eligibleLines(
  ctx: QuoteContext,
  conditions: Record<string, unknown>,
  state: PromotionEvalState,
  lineProductIds: string[],
): PromotionLineState[] {
  const productIds = asArrayOfStrings(conditions.product_ids);
  const categoryIds = asArrayOfStrings(conditions.category_ids);
  const brandIds = asArrayOfStrings(conditions.brand_ids);
  const packagingIds = asArrayOfStrings(conditions.packaging_ids);
  const hasProductFilter =
    productIds.length > 0 || categoryIds.length > 0 || brandIds.length > 0 || packagingIds.length > 0;

  return state.lines.filter((l) => {
    if (l.remaining <= 0) return false;
    const product = ctx.products.find((p) => p.id === l.line.product_id);
    if (!product) return false;
    if (!hasProductFilter) {
      // بدونِ فیلترِ کالا: همهٔ اقلام (اما لیستِ بی‌مرتبط با سبد هم رد نمی‌شود)
      return lineProductIds.includes(l.line.product_id);
    }
    if (productIds.length > 0 && !productIds.includes(l.line.product_id)) return false;
    if (categoryIds.length > 0 && !(product.category_id && categoryIds.includes(product.category_id))) return false;
    if (brandIds.length > 0 && !(product.brand_id && brandIds.includes(product.brand_id))) return false;
    if (packagingIds.length > 0 && !(l.line.packaging_id && packagingIds.includes(l.line.packaging_id))) return false;
    return true;
  });
}

interface BenefitOutcome {
  amount: number;
  base_amount: number;
  message_fa: string;
  notes: string[];
  gift_lines: GiftLine[];
  allocate: (amount: number) => { line_no: number; amount: number }[];
}

function computeBenefit(
  ctx: QuoteContext,
  promo: PromotionRow,
  state: PromotionEvalState,
  coupon: CouponRow | null,
  lineProductIds: string[],
): BenefitOutcome {
  const c = promo.conditions ?? {};
  const b = promo.benefit ?? {};
  const eligible = eligibleLines(ctx, c, state, lineProductIds);
  const eligibleTotal = roundMoney2(eligible.reduce((s, l) => s + l.remaining, 0));
  const allocProportional = (amount: number): { line_no: number; amount: number }[] => {
    const pool = isLineScopedKind(promo.kind) ? eligible : state.lines.filter((l) => l.remaining > 0);
    const total = roundMoney2(pool.reduce((s, l) => s + l.remaining, 0));
    if (total <= 0 || pool.length === 0) return [];
    const parts: { line_no: number; amount: number }[] = [];
    let assigned = 0;
    pool.forEach((l, idx) => {
      const isLast = idx === pool.length - 1;
      const part = isLast
        ? roundMoney2(amount - assigned)
        : roundMoney2((l.remaining / total) * amount);
      assigned = roundMoney2(assigned + part);
      parts.push({ line_no: l.line.line_no, amount: part });
    });
    return parts;
  };
  const noGift = { gift_lines: [] as GiftLine[], notes: [] as string[] };

  switch (promo.kind) {
    case 'percent_line': {
      const pct = isNum(b.percent) ? b.percent : null;
      if (pct == null || pct <= 0) {
        return { amount: 0, base_amount: 0, message_fa: 'درصدِ مزیت تعریف نشده است.', ...noGift, allocate: allocProportional };
      }
      const amount = roundMoney2((pct / 100) * eligibleTotal);
      return {
        amount,
        base_amount: eligibleTotal,
        message_fa: `${pct}% تخفیف روی ${eligible.length} قلمِ واجدِ شرط اعمال شد.`,
        ...noGift,
        allocate: allocProportional,
      };
    }
    case 'amount_line': {
      if (!isNum(b.amount) || b.amount <= 0) {
        return { amount: 0, base_amount: 0, message_fa: 'مبلغِ مزیت تعریف نشده است.', ...noGift, allocate: allocProportional };
      }
      const per = b.per === 'unit' || b.per === 'order' ? b.per : 'line';
      const unitAmount: number = b.amount;
      let amount = 0;
      if (per === 'order') amount = roundMoney2(unitAmount);
      else if (per === 'unit') {
        amount = roundMoney2(eligible.reduce((s, l) => s + unitAmount * l.line.qty, 0));
      } else amount = roundMoney2(unitAmount * eligible.length);
      const cap = eligibleTotal;
      const capped = Math.min(amount, cap);
      return {
        amount: capped,
        base_amount: Math.min(amount, cap) === cap ? Math.max(capped, 0) : cap,
        message_fa: `${money(unitAmount)} تخفیف به‌ازای هر ${per === 'unit' ? 'واحد' : per === 'order' ? 'سند' : 'قلم'} اعمال شد.`,
        gift_lines: [],
        notes: capped < amount ? ['مبلغِ تخفیف به مبلغِ اقلامِ واجدِ شرط محدود شد.'] : [],
        allocate: per === 'order' ? allocProportional : allocProportional,
      };
    }
    case 'volume_tier': {
      const tiers = Array.isArray(c.tiers) ? (c.tiers as Record<string, unknown>[]) : Array.isArray(b.tiers) ? (b.tiers as Record<string, unknown>[]) : [];
      if (tiers.length === 0) {
        return { amount: 0, base_amount: 0, message_fa: 'سطوحِ تعدادی تعریف نشده است.', ...noGift, allocate: allocProportional };
      }
      const qty = eligible.reduce((s, l) => s + l.line.qty_base, 0);
      const sorted = [...tiers]
        .filter((t) => isNum(t.min_qty))
        .sort((a, b2) => (b2.min_qty as number) - (a.min_qty as number));
      const tier = sorted.find((t) => qty >= (t.min_qty as number));
      if (!tier) {
        return {
          amount: 0,
          base_amount: eligibleTotal,
          message_fa: `تعدادِ ${qty} به هیچ سطحِ تخفیفی نمی‌رسد.`,
          ...noGift,
          allocate: allocProportional,
        };
      }
      let amount = 0;
      let desc = '';
      if (isNum(tier.percent)) {
        amount = roundMoney2((tier.percent / 100) * eligibleTotal);
        desc = `${tier.percent}% برای سطحِ ${tier.min_qty}`;
      } else if (isNum(tier.amount)) {
        amount = roundMoney2(Math.min(tier.amount, eligibleTotal));
        desc = `${money(tier.amount)} برای سطحِ ${tier.min_qty}`;
      } else {
        return { amount: 0, base_amount: eligibleTotal, message_fa: 'سطحِ تعدادیِ انتخاب‌شده مزیتِ معتبر ندارد.', ...noGift, allocate: allocProportional };
      }
      return {
        amount,
        base_amount: eligibleTotal,
        message_fa: `تخفیفِ پله‌ای ${desc} اعمال شد.`,
        ...noGift,
        allocate: allocProportional,
      };
    }
    case 'bundle': {
      const bundle = (c.bundle ?? {}) as Record<string, unknown>;
      const ids = asArrayOfStrings(bundle.product_ids);
      const qtyEach = isNum(bundle.qty_each) ? bundle.qty_each : 1;
      if (ids.length === 0) {
        return { amount: 0, base_amount: 0, message_fa: 'کالاهای بستهٔ تشویقی تعریف نشده است.', ...noGift, allocate: allocProportional };
      }
      const covered: PromotionLineState[] = [];
      for (const id of ids) {
        const line = state.lines.find((l) => l.line.product_id === id && l.line.qty_base >= qtyEach && l.remaining > 0);
        if (!line) {
          return {
            amount: 0,
            base_amount: 0,
            message_fa: 'همهٔ کالاهای بسته در سبد با تعدادِ لازم موجود نیستند.',
            ...noGift,
            allocate: allocProportional,
          };
        }
        covered.push(line);
      }
      const setValue = roundMoney2(covered.reduce((s, l) => s + l.remaining, 0));
      let amount = 0;
      if (isNum(b.bundle_price)) {
        amount = roundMoney2(Math.max(0, setValue - b.bundle_price));
      } else if (isNum(b.percent)) {
        amount = roundMoney2((b.percent / 100) * setValue);
      } else {
        return { amount: 0, base_amount: setValue, message_fa: 'قیمت یا درصدِ بستهٔ تشویقی تعریف نشده است.', ...noGift, allocate: allocProportional };
      }
      // D5: بسته فقط «کاتالوگی/مالی» است؛ هیچ تجزیهٔ سند/انبار در این موتور انجام نمی‌شود.
      return {
        amount,
        base_amount: setValue,
        message_fa: `بستهٔ تشویقی روی ${ids.length} کالا اعمال شد (فقط تعدیلِ مالی؛ بدونِ تجزیهٔ انبار — D5).`,
        gift_lines: [],
        notes: [],
        allocate: allocProportional,
      };
    }
    case 'buy_x_get_y': {
      const buyX = (c.buy_x ?? {}) as Record<string, unknown>;
      const buyProductId = typeof buyX.product_id === 'string' ? buyX.product_id : null;
      const buyQty = isNum(buyX.qty) ? buyX.qty : null;
      const freeQty = isNum(b.free_qty) ? b.free_qty : 1;
      if (!buyProductId || buyQty == null || buyQty <= 0) {
        return { amount: 0, base_amount: 0, message_fa: 'شرطِ خریدِ X (کالا/تعداد) تعریف نشده است.', ...noGift, allocate: allocProportional };
      }
      const buyer = state.lines.find((l) => l.line.product_id === buyProductId);
      if (!buyer || buyer.line.qty_base < buyQty) {
        return { amount: 0, base_amount: 0, message_fa: `حداقل ${buyQty} واحد از کالای شرط خریداری نشده است.`, ...noGift, allocate: allocProportional };
      }
      const sets = Math.floor(buyer.line.qty_base / buyQty);
      const getProductId = typeof b.get_product_id === 'string' ? b.get_product_id : buyProductId;
      const giftUnit = unitValueFor(ctx, getProductId, state);
      if (giftUnit == null) {
        return { amount: 0, base_amount: 0, message_fa: 'قیمتِ کالای جایزه برای ارزش‌گذاری یافت نشد.', gift_lines: [], notes: [], allocate: allocProportional };
      }
      const giftedUnits = roundQty(sets * freeQty);
      const theoretical = roundMoney2(giftedUnits * giftUnit);
      // TASK-24F · HIGH-4: ارزشِ جایزه به ماندهٔ واجدِ شرط (یا ماندهٔ سبد) محدود می‌شود.
      const capBase = eligibleTotal > 0 ? eligibleTotal : remainingOf(state);
      const value = roundMoney2(Math.min(theoretical, capBase));
      const appliedUnits = giftUnit > 0 ? roundQty(value / giftUnit) : giftedUnits;
      return {
        amount: value,
        base_amount: capBase,
        message_fa: `خریدِ ${buyQty} عدد ⇒ ${freeQty} عدد جایزه در هر دور (${sets} دور) اعمال شد.`,
        notes:
          value < theoretical
            ? ['ارزشِ جایزه به ماندهٔ سبد محدود شد (بخشِ غیرقابل‌تخصیص اعمال نشد).']
            : [],
        gift_lines: [
          {
            promotion_id: promo.id,
            promotion_code: promo.code,
            product_id: getProductId,
            qty: appliedUnits,
            unit_price: unitPrice(giftUnit),
            value: money(value),
            valuation_source: state.lines.some((l) => l.line.product_id === getProductId) ? 'basket' : 'reference_price',
            requested_value: value < theoretical ? money(theoretical) : undefined,
          },
        ],
        allocate: allocProportional,
      };
    }
    case 'gift_item': {
      const gift = (b.gift ?? {}) as Record<string, unknown>;
      const giftProductId = typeof gift.product_id === 'string' ? gift.product_id : null;
      const giftQty = isNum(gift.qty) ? gift.qty : 1;
      if (!giftProductId) {
        return { amount: 0, base_amount: 0, message_fa: 'کالای هدیه تعریف نشده است.', ...noGift, allocate: allocProportional };
      }
      const giftUnit = unitValueFor(ctx, giftProductId, state);
      if (giftUnit == null) {
        return { amount: 0, base_amount: 0, message_fa: 'قیمتِ کالای هدیه برای ارزش‌گذاری یافت نشد.', ...noGift, allocate: allocProportional };
      }
      let requested = roundMoney2(giftQty * giftUnit);
      if (isNum(b.max_amount)) requested = Math.min(requested, b.max_amount);
      // TASK-24F · HIGH-4: ارزشِ هدیه به ماندهٔ واجدِ شرط (یا ماندهٔ سبد) محدود می‌شود.
      const capBase = eligibleTotal > 0 ? eligibleTotal : remainingOf(state);
      const value = roundMoney2(Math.min(requested, capBase));
      const appliedQty = giftUnit > 0 ? roundQty(value / giftUnit) : giftQty;
      return {
        amount: value,
        base_amount: capBase,
        message_fa: `هدیهٔ ${appliedQty} عددی اعمال شد (معادلِ مالی؛ ثبتِ فیزیکیِ هدیه خارج از این موتور است).`,
        gift_lines: [
          {
            promotion_id: promo.id,
            promotion_code: promo.code,
            product_id: giftProductId,
            qty: appliedQty,
            unit_price: unitPrice(giftUnit),
            value: money(value),
            valuation_source: state.lines.some((l) => l.line.product_id === giftProductId) ? 'basket' : 'reference_price',
            requested_value: value < requested ? money(requested) : undefined,
          },
        ],
        notes:
          value < requested
            ? ['ارزشِ هدیه به ماندهٔ سبد محدود شد (بخشِ غیرقابل‌تخصیص اعمال نشد).']
            : [],
        allocate: allocProportional,
      };
    }
    case 'cash_discount': {
      const base = roundMoney2(state.lines.reduce((s, l) => s + l.remaining, 0));
      let amount = 0;
      let desc = '';
      if (isNum(b.percent)) {
        amount = roundMoney2((b.percent / 100) * base);
        desc = `${b.percent}%`;
      } else if (isNum(b.amount)) {
        amount = roundMoney2(Math.min(b.amount, base));
        desc = money(b.amount);
      } else {
        return { amount: 0, base_amount: base, message_fa: 'درصد/مبلغِ تخفیفِ نقدی تعریف نشده است.', ...noGift, allocate: allocProportional };
      }
      return {
        amount,
        base_amount: base,
        message_fa: `تخفیفِ نقدی ${desc} روی ماندهٔ سند اعمال شد.`,
        gift_lines: [],
        notes: [],
        allocate: allocProportional,
      };
    }
    case 'repeat_order': {
      const base = roundMoney2(state.lines.reduce((s, l) => s + l.remaining, 0));
      let amount = 0;
      let desc = '';
      if (isNum(b.percent)) {
        amount = roundMoney2((b.percent / 100) * base);
        desc = `${b.percent}%`;
      } else if (isNum(b.amount)) {
        amount = roundMoney2(Math.min(b.amount, base));
        desc = money(b.amount);
      } else {
        return { amount: 0, base_amount: base, message_fa: 'مزیتِ تشویقِ تکرارِ خرید تعریف نشده است.', ...noGift, allocate: allocProportional };
      }
      return {
        amount,
        base_amount: base,
        message_fa: `تخفیفِ تکرارِ خرید ${desc} با سابقهٔ ${ctx.order_history.total_orders} سفارش اعمال شد.`,
        gift_lines: [],
        notes: [],
        allocate: allocProportional,
      };
    }
    case 'coupon': {
      if (!coupon) {
        return { amount: 0, base_amount: 0, message_fa: 'کوپنِ معتبر ارائه نشده است.', ...noGift, allocate: allocProportional };
      }
      const base = roundMoney2(state.lines.reduce((s, l) => s + l.remaining, 0));
      let amount = 0;
      let desc = '';
      if (isNum(b.percent)) {
        amount = roundMoney2((b.percent / 100) * base);
        desc = `${b.percent}%`;
      } else if (isNum(b.amount)) {
        amount = roundMoney2(Math.min(b.amount, base));
        desc = money(b.amount);
      } else {
        return { amount: 0, base_amount: base, message_fa: 'مزیتِ کوپن تعریف نشده است.', ...noGift, allocate: allocProportional };
      }
      return {
        amount,
        base_amount: base,
        message_fa: `کوپنِ «${coupon.code}» با مزیت ${desc} اعمال شد.`,
        gift_lines: [],
        notes: [],
        allocate: allocProportional,
      };
    }
    default: {
      return {
        amount: 0,
        base_amount: 0,
        message_fa: 'نوعِ تشویق پشتیبانی نمی‌شود.',
        ...noGift,
        allocate: allocProportional,
      };
    }
  }
}

const roundQty = (n: number): number => Math.round(n * 10000) / 10000;

/** ارزشِ واحدِ کالا برای هدیه/جایزه: از سبد، وگرنه قیمتِ مرجعِ حل‌شده */
function unitValueFor(ctx: QuoteContext, productId: string, state: PromotionEvalState): number | null {
  const inBasket = state.lines.find((l) => l.line.product_id === productId);
  if (inBasket) {
    const qtyBase = inBasket.line.qty_base;
    return qtyBase > 0 ? dec(inBasket.line.unit_price) / (qtyBase / inBasket.line.qty) : dec(inBasket.line.unit_price);
  }
  const ref = ctx.reference_prices[productId];
  return typeof ref === 'number' && Number.isFinite(ref) && ref > 0 ? ref : null;
}

// =====================================================================
// §3  کفِ سود
// =====================================================================

export interface ResolvedMarginPolicy {
  policy: MarginPolicyRow;
  specificity: number;
  domain_specific: boolean;
}

/** انتخابِ قطعیِ سیاستِ کفِ سود: خاص‌ترین دامنه، سپس قلمرویی، سپس اولویت، سپس شناسه */
export function resolveMarginPolicy(
  ctx: QuoteContext,
  product: ProductRow | null,
): ResolvedMarginPolicy | null {
  const applicable = ctx.margin_policies.filter((p) => {
    if (!inDateRange(ctx.pricing_date, p.valid_from, p.valid_to)) return false;
    if (p.domain_id != null && !ctx.domain_ids.includes(p.domain_id)) return false;
    if (p.scope === 'product') return product != null && p.product_id === product.id;
    if (p.scope === 'category') return product != null && p.category_id != null && p.category_id === product.category_id;
    return true;
  });
  if (applicable.length === 0) return null;
  const scored = applicable.map((policy) => ({
    policy,
    specificity: policy.scope === 'product' ? 3 : policy.scope === 'category' ? 2 : 1,
    domain_specific: policy.domain_id != null,
  }));
  scored.sort((a, b) => {
    if (a.specificity !== b.specificity) return b.specificity - a.specificity;
    if (a.domain_specific !== b.domain_specific) return a.domain_specific ? -1 : 1;
    if (a.policy.priority !== b.policy.priority) return b.policy.priority - a.policy.priority;
    return a.policy.id < b.policy.id ? -1 : a.policy.id > b.policy.id ? 1 : 0;
  });
  return scored[0];
}

/** بهای تمام‌شدهٔ واحدِ پایه از ردیف‌های تجمیعیِ product_cost */
export function costBasisFor(
  ctx: QuoteContext,
  productId: string,
  basis: 'avg_cost' | 'standard_cost' | 'last_purchase_cost',
): number | null {
  const rows = ctx.costs.filter((c) => c.product_id === productId);
  if (rows.length === 0) return null;
  const weighted = rows.filter((r) => dec(r.qty_weight) > 0);
  const pick = (r: CostRow): number | null => {
    const v = r[basis];
    return v == null ? null : dec(v);
  };
  if (weighted.length > 0) {
    let num = 0;
    let den = 0;
    let found = false;
    for (const r of weighted) {
      const v = pick(r);
      const w = dec(r.qty_weight);
      if (v == null || w <= 0) continue;
      num += v * w;
      den += w;
      found = true;
    }
    if (found && den > 0) return roundMoney2((num / den) * 10000) / 10000;
  }
  // اگر انبارِ دارای موجودی نبود، از هر ردیفی که مقدار دارد استفاده می‌شود (قطعی: بیشینه)
  const values = rows.map(pick).filter((v): v is number => v != null);
  if (values.length === 0) return null;
  return Math.max(...values);
}

export interface MarginEvaluation {
  result: LineMarginResult;
  violation: QuoteResult['margin_violations'][number] | null;
}

export function evaluateLineMargin(
  ctx: QuoteContext,
  product: ProductRow | null,
  netRevenue: number,
  costTotal: number | null,
  policyRef: ResolvedMarginPolicy | null,
): MarginEvaluation {
  const policy = policyRef?.policy ?? null;
  if (!policy) {
    return {
      result: {
        cost_basis: 'none',
        cost_unit: null,
        cost_total: null,
        net_revenue: money(netRevenue),
        margin_pct: null,
        policy_id: null,
        required_margin_pct: null,
        status: 'no_policy',
        exception_id: null,
        message_fa: null,
      },
      violation: null,
    };
  }
  const cost = costTotal;
  const margin = cost == null ? null : marginPct(netRevenue, cost);
  const required = dec(policy.min_margin_pct);

  if (cost == null) {
    const status: LineMarginResult['status'] =
      policy.on_unknown_cost === 'block' ? 'cost_unknown' : policy.on_unknown_cost === 'warn' ? 'cost_unknown' : 'no_policy';
    const violation: MarginEvaluation['violation'] =
      policy.on_unknown_cost === 'ignore'
        ? null
        : {
            product_id: product?.id ?? '',
            margin_pct: null,
            required_margin_pct: required,
            policy_id: policy.id,
            code: 'margin_cost_unknown',
            message_fa:
              policy.on_unknown_cost === 'block'
                ? 'بهای تمام‌شدهٔ این کالا در دسترس نیست؛ مطابقِ سیاستِ کفِ سود، قیمت‌گذاری مسدود است.'
                : 'بهای تمام‌شدهٔ این کالا در دسترس نیست؛ حاشیهٔ سود قابلِ راستی‌آزمایی نیست (هشدار).',
          };
    return {
      result: {
        cost_basis: policy.cost_basis,
        cost_unit: null,
        cost_total: null,
        net_revenue: money(netRevenue),
        margin_pct: null,
        policy_id: policy.id,
        required_margin_pct: required,
        status,
        exception_id: null,
        message_fa: violation?.message_fa ?? null,
      },
      violation,
    };
  }

  const below = margin == null ? netRevenue <= 0 && cost > 0 : margin < required;
  if (!below) {
    return {
      result: {
        cost_basis: policy.cost_basis,
        cost_unit: null,
        cost_total: money(cost),
        net_revenue: money(netRevenue),
        margin_pct: margin,
        policy_id: policy.id,
        required_margin_pct: required,
        status: 'ok',
        exception_id: null,
        message_fa: null,
      },
      violation: null,
    };
  }

  const exception = findException(ctx, product?.id ?? null, policy.id, required, margin);
  if (exception) {
    return {
      result: {
        cost_basis: policy.cost_basis,
        cost_unit: null,
        cost_total: money(cost),
        net_revenue: money(netRevenue),
        margin_pct: margin,
        policy_id: policy.id,
        required_margin_pct: required,
        status: 'exception_applied',
        exception_id: exception.id,
        exception_granted_margin_pct:
          exception.granted_margin_pct == null ? null : dec(exception.granted_margin_pct),
        message_fa: `حاشیهٔ سود کمتر از کف است؛ استثنای تأییدشدهٔ ${exception.id} اعمال شد.`,
      },
      violation: null,
    };
  }

  const message = `حاشیهٔ سود ${margin == null ? 'تعریف‌نشده' : `${margin}%`} کمتر از کفِ ${required}% است.`;
  return {
    result: {
      cost_basis: policy.cost_basis,
      cost_unit: null,
      cost_total: money(cost),
      net_revenue: money(netRevenue),
      margin_pct: margin,
      policy_id: policy.id,
      required_margin_pct: required,
      status: 'violation',
      exception_id: null,
      message_fa: message,
    },
    violation: {
      product_id: product?.id ?? '',
      margin_pct: margin,
      required_margin_pct: required,
      policy_id: policy.id,
      code: 'margin_floor_violation',
      message_fa: message,
    },
  };
}

/**
 * TASK-24F · MEDIUM-1 — تطبیقِ استثنای کفِ سود (fail-closed).
 *
 * پیش از این هر استثنای `approved` (حتی سراسری و بی‌سقف) هر نقضی را مجاز می‌کرد و
 * `policy_id`/`entity_*` نادیده گرفته می‌شد. اکنون:
 *   • فقط استثنای **محدود به همان کالا** پذیرفته می‌شود (استثنای سراسری ⇒ هیچ).
 *   • استثنای مقید به سند/قلمِ خاص (`entity_type/entity_id`) در استعلامِ سبد اعمال
 *     نمی‌شود؛ فقط مسیرِ نوشتنِ همان قلم آن را مصرف می‌کند.
 *   • اگر استثنا `policy_id` دارد باید با سیاستِ حل‌شده یکی باشد.
 *   • `granted_margin_pct` سقفِ واقعیِ تخفیف است: حاشیهٔ محاسبه‌شده باید از آن
 *     کمتر نباشد وگرنه استثنا معتبر نیست (دیگر «۱۰٪ مجاز» یعنی «هر مبلغی مجاز»).
 */
export function exceptionPermits(
  exception: MarginExceptionRow,
  input: {
    productId: string | null;
    customerId: string | null;
    policyId: string | null;
    marginPct: number | null;
  },
): boolean {
  if (exception.status !== 'approved') return false;
  if (input.productId == null || exception.product_id == null) return false;
  if (exception.product_id !== input.productId) return false;
  if (exception.customer_id != null && exception.customer_id !== input.customerId) return false;
  if (exception.policy_id != null && input.policyId != null && exception.policy_id !== input.policyId) {
    return false;
  }
  if (exception.entity_id != null) return false;
  if (exception.granted_margin_pct == null || input.marginPct == null) return false;
  return input.marginPct >= dec(exception.granted_margin_pct) - 0.0001;
}

function findException(
  ctx: QuoteContext,
  productId: string | null,
  policyId: string,
  required: number,
  marginPct: number | null,
): MarginExceptionRow | null {
  const now = `${ctx.pricing_date}T23:59:59.999Z`;
  const candidates = ctx.margin_exceptions.filter(
    (e) =>
      e.status === 'approved' &&
      (e.valid_until == null || e.valid_until >= now) &&
      (e.customer_id == null || e.customer_id === ctx.customer?.id),
  );
  const allowed = candidates.filter((e) =>
    exceptionPermits(e, {
      productId,
      customerId: ctx.customer?.id ?? null,
      policyId,
      marginPct,
    }),
  );
  void required;
  return allowed[0] ?? null;
}

// =====================================================================
// §4  ساختِ سندِ قیمت (quote)
// =====================================================================

/**
 * محاسبهٔ کاملِ قیمتِ سبد — بدونِ هیچ نوشتن/جانبی‌اثر.
 * ترتیب: قیمت‌گذاریِ هر قلم → تخفیفِ دستی (با سقف) → تشویق‌ها → مالیات → حاشیهٔ سود.
 */
export function computeQuote(ctx: QuoteContext, lines: QuoteLineInput[]): QuoteResult {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new PricingEngineError('invalid_qty', 'سبدِ قیمت‌گذاری خالی است.', 400);
  }
  if (ctx.customer && ctx.customer.status !== 'active') {
    throw new PricingEngineError(
      'customer_inactive',
      'مشتریِ انتخاب‌شده فعال نیست؛ قیمت‌گذاری/فروش مجاز نیست.',
      409,
      { customer_id: ctx.customer.id, status: ctx.customer.status },
    );
  }

  const explanation: string[] = [];
  const warnings: string[] = [];
  const violations: QuoteResult['margin_violations'] = [];
  let subtotal = 0;
  let manualDiscountTotal = 0;
  let taxTotal = 0;
  let costTotal = 0;
  let costKnownAll = true;

  const resultLines: QuoteLineResult[] = [];
  const states: PromotionLineState[] = [];

  const productMap = new Map(ctx.products.map((p) => [p.id, p]));

  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    const pricing = resolveLinePrice(ctx, line, lineNo);
    const product = productMap.get(line.product_id) ?? null;
    const factor = line.packaging_id
      ? dec(ctx.packaging.find((p) => p.id === line.packaging_id)?.factor_to_base ?? '1')
      : 1;
    const qtyBase = line.qty * factor;
    const gross = dec(pricing.unit_price) * line.qty;

    // ---- تخفیفِ دستی ----
    let manual = line.discount_amount == null ? 0 : dec(line.discount_amount);
    if (manual < 0) {
      throw new PricingEngineError('discount_cap_exceeded', 'مبلغِ تخفیف نمی‌تواند منفی باشد.', 400, { line_no: lineNo });
    }
    let manualPct = discountPct(manual, gross);
    const effectiveDiscountCap =
      pricing.max_discount_pct ?? ctx.options?.max_line_discount_pct ?? null;
    if (effectiveDiscountCap != null && manualPct > effectiveDiscountCap + 0.0001) {
      if (!ctx.options?.allow_discount_override) {
        throw new PricingEngineError(
          'discount_cap_exceeded',
          `تخفیفِ درخواستی (${manualPct}%) از سقفِ مجازِ این قلم (${effectiveDiscountCap}%) بیشتر است؛ نیازمندِ تأییدِ مجاز است.`,
          403,
          {
            line_no: lineNo,
            product_id: line.product_id,
            requested_pct: manualPct,
            max_discount_pct: effectiveDiscountCap,
            cap_source: pricing.max_discount_pct == null ? 'company_policy' : 'price_source',
          },
        );
      }
      warnings.push(`قلم ${lineNo}: تخفیفِ فراتر از سقف با مجوزِ صریح اعمال شد (${manualPct}% > ${effectiveDiscountCap}%).`);
    }
    if (manual > gross) {
      throw new PricingEngineError(
        'discount_cap_exceeded',
        'مبلغِ تخفیف از مبلغِ قلم بیشتر است.',
        400,
        { line_no: lineNo, discount: manual, gross },
      );
    }
    manualPct = discountPct(manual, gross);

    const netBeforePromotions = roundMoney2(gross - manual);
    const taxRate = product?.vat_enabled ? dec(product.tax_rate_pct) : 0;

    const resultLine: QuoteLineResult = {
      line_no: lineNo,
      product_id: line.product_id,
      product_code: product?.code ?? '',
      product_name: product?.name ?? '',
      packaging_id: line.packaging_id ?? null,
      packaging_title: null,
      packaging_factor: factor,
      qty: line.qty,
      qty_base: roundQty(qtyBase),
      unit_price: pricing.unit_price,
      gross: money(gross),
      manual_discount: money(manual),
      manual_discount_pct: manualPct,
      pricing,
      promotions: [],
      discount_total: money(manual),
      net_ex_tax: money(netBeforePromotions),
      tax_rate_pct: taxRate,
      tax_amount: '0.00',
      line_total: '0.00',
      margin: {
        cost_basis: 'none',
        cost_unit: null,
        cost_total: null,
        net_revenue: money(netBeforePromotions),
        margin_pct: null,
        policy_id: null,
        required_margin_pct: null,
        status: 'no_policy',
        exception_id: null,
        message_fa: null,
      },
      gift_lines: [],
    };

    subtotal = roundMoney2(subtotal + gross);
    manualDiscountTotal = roundMoney2(manualDiscountTotal + manual);
    resultLines.push(resultLine);
    states.push({ line: resultLine, remaining: netBeforePromotions });
    explanation.push(
      `قلم ${lineNo} (${product?.code ?? line.product_id}): ${pricing.explanation_fa} قیمتِ واحد ${pricing.unit_price}`,
    );
  });

  const state: PromotionEvalState = {
    lines: states,
    applied: [],
    skipped: [],
    gifts: [],
    remainingTotal: roundMoney2(states.reduce((s, l) => s + l.remaining, 0)),
    subtotal: roundMoney2(subtotal),
  };

  evaluatePromotions(
    ctx,
    state,
    lines.map((l) => l.product_id),
  );

  // ---- مالیات، حاشیه و جمع‌ها ----
  let discountTotal = manualDiscountTotal;
  for (const st of states) {
    const line = st.line;
    const tax = lineTax(st.remaining, line.tax_rate_pct);
    const netAfterPromotions = roundMoney2(st.remaining);
    line.net_ex_tax = money(netAfterPromotions);
    line.tax_amount = money(tax);
    line.line_total = money(netAfterPromotions + tax);
    const promoDiscount = roundMoney2(dec(line.discount_total) - dec(line.manual_discount));
    discountTotal = roundMoney2(discountTotal + promoDiscount);
    taxTotal = roundMoney2(taxTotal + tax);
    line.gift_lines = state.gifts.filter(
      (g) => g.line_nos == null || g.line_nos.length === 0 || g.line_nos.includes(line.line_no),
    );

    // حاشیهٔ سود
    const product = productMap.get(line.product_id) ?? null;
    const policyRef = resolveMarginPolicy(ctx, product);
    const basis = policyRef?.policy.cost_basis ?? 'avg_cost';
    const costUnitBase = costBasisFor(ctx, line.product_id, basis);
    const lineCost = costUnitBase == null ? null : roundMoney2(costUnitBase * line.qty_base);
    const marginEval = evaluateLineMargin(ctx, product, netAfterPromotions, lineCost, policyRef);
    line.margin = marginEval.result;
    if (lineCost == null) costKnownAll = false;
    else costTotal = roundMoney2(costTotal + lineCost);
    if (marginEval.violation) violations.push(marginEval.violation);

    // TASK-24F · MEDIUM-1: فروشِ زیرِ بهای تمام‌شده فقط با سیاستِ صریحِ مجاز یا
    // استثنای محدود و تأییدشده مجاز است (حتی وقتی هیچ سیاستِ کفِ سودی تعریف نشده باشد).
    if (
      lineCost != null &&
      netAfterPromotions < lineCost &&
      line.margin.status !== 'exception_applied' &&
      ctx.options?.allow_loss_making !== true
    ) {
      const lossMargin = marginPct(netAfterPromotions, lineCost);
      const exception = findException(
        ctx,
        product?.id ?? null,
        policyRef?.policy.id ?? '',
        0,
        lossMargin,
      );
      if (exception) {
        line.margin = {
          ...line.margin,
          status: 'exception_applied',
          exception_id: exception.id,
          exception_granted_margin_pct:
            exception.granted_margin_pct == null ? null : dec(exception.granted_margin_pct),
          message_fa: `فروشِ زیرِ بهای تمام‌شده با استثنای تأییدشدهٔ ${exception.id} مجاز شد.`,
        };
      } else {
        const message = `فروشِ زیرِ بهای تمام‌شده (${lossMargin}%) بدونِ مجوزِ صریح مجاز نیست.`;
        violations.push({
          product_id: line.product_id,
          margin_pct: lossMargin,
          required_margin_pct: line.margin.required_margin_pct,
          policy_id: line.margin.policy_id,
          code: 'margin_loss_making',
          message_fa: message,
        });
        line.margin = { ...line.margin, status: 'violation', message_fa: message };
      }
    }

    if (policyRef) {
      explanation.push(
        `قلم ${line.line_no}: حاشیهٔ سود ${marginEval.result.margin_pct ?? 'نامشخص'}% در برابر کفِ ${marginEval.result.required_margin_pct}% (${marginEval.result.status}).`,
      );
    }
  }

  const grandTotal = roundMoney2(subtotal - discountTotal + taxTotal);
  const netRevenueTotal = roundMoney2(subtotal - discountTotal);
  const overallMargin = costKnownAll ? marginPct(netRevenueTotal, costTotal) : null;

  return {
    pricing_date: ctx.pricing_date,
    currency: 'IRR',
    customer_id: ctx.customer?.id ?? null,
    domain_ids: ctx.domain_ids,
    lines: resultLines,
    subtotal: money(subtotal),
    manual_discount_total: money(manualDiscountTotal),
    discount_total: money(discountTotal),
    tax_total: money(taxTotal),
    grand_total: money(grandTotal),
    cost_total: money(costTotal),
    margin_pct: overallMargin,
    applied_promotions: state.applied,
    skipped_promotions: state.skipped,
    gift_lines: state.gifts,
    margin_violations: violations,
    warnings,
    approval_required: {
      required: violations.length > 0,
      reasons: violations.map((v) => v.message_fa),
    },
    explanation,
  };
}

// =====================================================================
// §5  اعتبارسنجیِ سیاست‌ها/تشویق‌ها در زمانِ نوشتن
// =====================================================================

/** کلیدهای مجازِ شرایط — برای اعتبارسنجیِ DTO و جلوگیری از ورودِ شرطِ ناشناخته */
export const PROMOTION_CONDITION_KEYS = [...SUPPORTED_CONDITIONS];
export const PROMOTION_BENEFIT_KEYS = [...SUPPORTED_BENEFITS];

export const PROMOTION_KINDS: PromotionKind[] = [
  'percent_line',
  'amount_line',
  'bundle',
  'buy_x_get_y',
  'gift_item',
  'cash_discount',
  'repeat_order',
  'coupon',
  'volume_tier',
];

/**
 * اعتبارسنجیِ ساختاریِ تعریفِ تشویق — پیام‌های فارسی و صریح.
 *
 * `requireComplete`:
 *  - true (پیش‌فرض): تعریف باید کامل باشد (برای UI/تعریفِ عملیاتی).
 *  - false: فقط کلیدهای ناشناخته رد می‌شوند؛ تعریفِ ناقص پذیرفته می‌شود ولی در
 *    ارزیابی با دلیلِ صریح `zero_benefit` اعمال نمی‌شود (سازگاریِ API با اسنادِ
 *    موجودی که از قبل بدونِ benefit ثبت شده‌اند و هرگز تخفیف نمی‌دهند).
 */
export function validatePromotionDefinition(
  kind: PromotionKind,
  conditions: Record<string, unknown>,
  benefit: Record<string, unknown>,
  options: { requireComplete?: boolean } = {},
): string[] {
  const errors: string[] = [];
  for (const key of Object.keys(conditions ?? {})) {
    if (!SUPPORTED_CONDITIONS.has(key)) errors.push(`شرطِ «${key}» پشتیبانی نمی‌شود.`);
  }
  for (const key of Object.keys(benefit ?? {})) {
    if (!SUPPORTED_BENEFITS.has(key)) errors.push(`مزیتِ «${key}» پشتیبانی نمی‌شود.`);
  }
  if (options.requireComplete === false) return errors;
  const hasPercent = isNum(benefit.percent) && benefit.percent > 0;
  const hasAmount = isNum(benefit.amount) && benefit.amount > 0;
  switch (kind) {
    case 'percent_line':
      if (!hasPercent) errors.push('تشویقِ درصدیِ قلم نیازمندِ benefit.percent بزرگ‌تر از صفر است.');
      break;
    case 'amount_line':
      if (!hasAmount) errors.push('تشویقِ مبلغیِ قلم نیازمندِ benefit.amount بزرگ‌تر از صفر است.');
      break;
    case 'volume_tier': {
      const tiers = Array.isArray(conditions.tiers) ? conditions.tiers : Array.isArray(benefit.tiers) ? benefit.tiers : null;
      if (!tiers || tiers.length === 0) errors.push('تخفیفِ پله‌ای نیازمندِ فهرستِ tiers است.');
      else {
        for (const t of tiers as Record<string, unknown>[]) {
          if (!isNum(t.min_qty)) errors.push('هر سطح باید min_qty عددی داشته باشد.');
          if (!isNum(t.percent) && !isNum(t.amount)) errors.push('هر سطح باید percent یا amount داشته باشد.');
          if (t.percent != null && (!isNum(t.percent) || t.percent < 0 || t.percent > 100)) errors.push('درصدِ سطح باید بین ۰ و ۱۰۰ باشد.');
        }
      }
      break;
    }
    case 'bundle': {
      const bundle = (conditions.bundle ?? {}) as Record<string, unknown>;
      if (!Array.isArray(bundle.product_ids) || bundle.product_ids.length === 0) errors.push('بستهٔ تشویقی نیازمندِ فهرستِ کالاها است.');
      if (!isNum(benefit.bundle_price) && !isNum(benefit.percent)) errors.push('بستهٔ تشویقی نیازمندِ bundle_price یا percent است.');
      break;
    }
    case 'buy_x_get_y': {
      const buyX = (conditions.buy_x ?? {}) as Record<string, unknown>;
      if (typeof buyX.product_id !== 'string') errors.push('شرطِ خرید نیازمندِ buy_x.product_id است.');
      if (!isNum(buyX.qty) || buyX.qty <= 0) errors.push('شرطِ خرید نیازمندِ buy_x.qty بزرگ‌تر از صفر است.');
      if (benefit.free_qty != null && (!isNum(benefit.free_qty) || benefit.free_qty <= 0)) errors.push('تعدادِ جایزه باید بزرگ‌تر از صفر باشد.');
      break;
    }
    case 'gift_item': {
      const gift = (benefit.gift ?? {}) as Record<string, unknown>;
      if (typeof gift.product_id !== 'string') errors.push('هدیه نیازمندِ benefit.gift.product_id است.');
      if (!isNum(gift.qty) || gift.qty <= 0) errors.push('تعدادِ هدیه باید بزرگ‌تر از صفر باشد.');
      break;
    }
    case 'cash_discount':
    case 'coupon':
    case 'repeat_order':
      if (!hasPercent && !hasAmount) errors.push('این نوع تشویق نیازمندِ benefit.percent یا benefit.amount است.');
      if (kind === 'repeat_order') {
        const rep = (conditions.repeat ?? {}) as Record<string, unknown>;
        if (!isNum(rep.min_orders) || rep.min_orders < 1) errors.push('تشویقِ تکرارِ خرید نیازمندِ conditions.repeat.min_orders است.');
      }
      break;
    default:
      errors.push('نوعِ تشویق پشتیبانی نمی‌شود.');
  }
  if (isNum(benefit.percent) && (benefit.percent <= 0 || benefit.percent > 100)) {
    errors.push('درصدِ مزیت باید بین ۰ و ۱۰۰ باشد.');
  }
  return errors;
}
