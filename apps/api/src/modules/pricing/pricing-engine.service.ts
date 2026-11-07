import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { isUUID } from 'class-validator';
import { dec, money, roundPct4 } from '../../common/financial';
import type { PricingEngineRepository } from './pricing-engine.repository';
import {
  computeQuote,
  costBasisFor,
  evaluateLineMargin,
  exceptionPermits,
  resolveLinePrice,
  resolveMarginPolicy,
  validatePromotionDefinition,
  PricingEngineError,
  type QuoteContext,
  type QuoteLineInput,
  type QuoteResult,
} from './pricing-engine';
import type {
  CreateCouponDto,
  CreateCustomerPriceDto,
  CreateMarginExceptionDto,
  CreateMarginPolicyDto,
  CreatePricingDomainDto,
  DecideMarginExceptionDto,
  QuoteRequestDto,
  UpdateCustomerPriceDto,
  UpdateMarginPolicyDto,
  UpdatePricingDomainDto,
  UpdatePricingSettingsDto,
} from './pricing.dto';
import { PRICING_ENGINE_REPOSITORY } from './pricing.tokens';
import { RULES_ENGINE_SERVICE } from '../rules-engine/rules-engine.tokens';
import type { RulesEngineService } from '../rules-engine/rules-engine.service';

const badRequest = (code: string, message_fa: string, details?: Record<string, unknown>) =>
  new BadRequestException({ code, message_fa, ...(details ? { details } : {}) });
const conflict = (code: string, message_fa: string, details?: Record<string, unknown>) =>
  new ConflictException({ code, message_fa, ...(details ? { details } : {}) });

/** نگاشتِ خطای موتور (خالص) به پاسخِ HTTP — تنها نقطهٔ ترجمه */
export function rethrowEngineError(err: unknown): never {
  if (err instanceof PricingEngineError) {
    const body = { code: err.code, message_fa: err.message_fa, details: err.details };
    if (err.httpStatus === 403) throw new ForbiddenException(body);
    if (err.httpStatus === 409) throw new ConflictException(body);
    if (err.httpStatus === 422) throw new UnprocessableEntityException(body);
    throw new BadRequestException(body);
  }
  throw err;
}

const canonical = (value: unknown): string => {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          const val = (v as Record<string, unknown>)[key];
          if (val !== undefined) acc[key] = walk(val);
          return acc;
        }, {});
    }
    return v;
  };
  return JSON.stringify(walk(value));
};

/**
 * TASK-24F — سیاستِ پایدارِ قیمت‌گذاریِ شرکت (HIGH-2 / MEDIUM-1).
 * پیش‌فرض‌ها fail-closed هستند: اعمالِ خودکارِ تشویق روی سفارش خاموش، فروشِ زیرِ
 * بهای تمام‌شده ممنوع، و دلیلِ عبور از سقف الزامی است. سقف‌ها NULL = بدونِ سقف
 * (رفتارِ امروز) تا تصمیمِ تجاری بدونِ مصوبه اعمال نشود.
 */
export interface PricingSettings {
  apply_promotions_on_orders: boolean;
  max_total_discount_pct: number | null;
  max_line_discount_pct: number | null;
  allow_loss_making_sales: boolean;
  min_order_date_lookback_days: number | null;
  require_override_reason: boolean;
}

export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  apply_promotions_on_orders: false,
  max_total_discount_pct: null,
  max_line_discount_pct: null,
  allow_loss_making_sales: false,
  min_order_date_lookback_days: null,
  require_override_reason: true,
};

/** گزینه‌های اجرای ارزیابی — فقط از سرویس/مجوزها پر می‌شوند، نه از بدنهٔ درخواست */
export interface QuoteRunOptions {
  apply_promotions?: boolean;
  max_total_discount_pct?: number | null;
  max_line_discount_pct?: number | null;
  allow_manual_price?: boolean;
  allow_discount_override?: boolean;
  allow_loss_making?: boolean;
  allow_cross_domain_price_list?: boolean;
  cross_domain_reason?: string | null;
  actor_user_id?: string | null;
  /** عمرِ مجازِ بازپخشِ کشِ ارزیابی (ثانیه) — MEDIUM-5 */
  replay_ttl_seconds?: number;
}

/** مجوزهای مؤثرِ کاربر روی مسیرِ سفارش (از نشست، نه از بدنه) */
export interface OrderPricingPermissions {
  manual_price: boolean;
  discount_override: boolean;
  cross_domain_price_list: boolean;
  backdate: boolean;
}

export interface OrderQuoteResult {
  quote: QuoteResult;
  /** قیمتِ سیستمیِ هر قلم (برای ممیزیِ قیمتِ دستی)، هم‌ترتیب با خطوط */
  system_unit_prices: (string | null)[];
  settings: PricingSettings;
  /** تاریخِ مؤثرِ قیمت‌گذاری (اگر سفارش عقب‌گرد باشد = امروز) */
  pricing_date: string;
  backdated: boolean;
}

@Injectable()
export class PricingEngineService {
  constructor(
    @Inject(PRICING_ENGINE_REPOSITORY) private readonly repo: PricingEngineRepository,
    /**
     * موتورِ قواعد/تأیید — اختیاری و فقط پس از سبز شدنِ بستهٔ رفتاریِ G-03
     * (`rules-engine-behavior.test.ts`) استفاده می‌شود. اگر ماژول/زنجیره در دسترس
     * نباشد، کنترلِ دو‌شخصیِ اختصاصی (RBAC + constraint DB + audit) جایگزین است.
     */
    @Optional()
    @Inject(RULES_ENGINE_SERVICE)
    private readonly rules: RulesEngineService | null = null,
  ) {}

  private assertId(id: string, what: string): void {
    if (!isUUID(id, '4')) throw badRequest('invalid_id', `شناسهٔ ${what} معتبر نیست.`);
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /** تاریخِ امروز بر مبنای منطقهٔ زمانیِ کسب‌وکار (Asia/Tehran) — مرزِ «عقب‌گرد» */
  private todayTehran(): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tehran',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  private replayTtlSeconds(): number {
    const raw = Number(process.env.PRICING_REPLAY_TTL_SECONDS ?? '');
    return Number.isFinite(raw) && raw >= 0 ? raw : 300;
  }

  // =================================================================
  // §1  ساختِ زمینه و استعلامِ قیمت
  // =================================================================

  /** ساختِ زمینهٔ کاملِ موتور — همهٔ داده از شرکتِ جاری (RLS + فیلترِ صریح) */
  async buildContext(
    companyId: string,
    dto: QuoteRequestDto,
    opts: QuoteRunOptions = {},
  ): Promise<QuoteContext> {
    const pricingDate = (dto.pricing_date ?? this.today()).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pricingDate)) {
      throw badRequest('invalid_date', 'تاریخِ قیمت‌گذاری معتبر نیست (قالب: YYYY-MM-DD).');
    }
    const customer = dto.customer_id ? await this.repo.loadCustomer(companyId, dto.customer_id) : null;
    if (dto.customer_id && !customer) {
      throw badRequest('customer_not_found', 'مشتریِ انتخاب‌شده در این شرکت یافت نشد.');
    }

    const branchArea = customer ? await this.repo.loadCustomerBranchAndArea(customer.id) : null;
    const domainIds = customer
      ? await this.repo.loadDomainIds(companyId, customer, branchArea?.branch_id ?? null, branchArea?.area_id ?? null)
      : [];

    const promotions = await this.repo.loadPromotions(companyId, domainIds, pricingDate);
    const productIds = [
      ...new Set([
        ...dto.lines.map((l) => l.product_id),
        ...promotions.flatMap((p) => this.promotionProductRefs(p)),
      ]),
    ];

    const [productBundle, packaging, costs, priceLists, customerPrices, marginPolicies, marginExceptions, orderHistory] =
      await Promise.all([
        this.repo.loadProducts(companyId, productIds),
        this.repo.loadPackaging(companyId, productIds),
        this.repo.loadCosts(companyId, productIds),
        this.repo.loadPriceLists(companyId),
        customer ? this.repo.loadCustomerPrices(companyId, customer.id, productIds) : Promise.resolve([]),
        this.repo.loadMarginPolicies(companyId),
        this.repo.loadMarginExceptions(companyId, customer?.id ?? null, productIds),
        this.repo.loadOrderHistory(companyId, customer?.id ?? null),
      ]);

    let crossDomainUse: {
      price_list_id: string;
      price_list_domain_id: string | null;
      reason: string;
    } | null = null;
    const explicitListId = dto.price_list_id ?? customer?.price_list_id ?? null;
    if (explicitListId && !priceLists.some((l) => l.id === explicitListId)) {
      throw badRequest('price_list_not_found', 'لیستِ قیمتِ انتخاب‌شده در این شرکت فعال نیست یا یافت نشد.');
    }
    // TASK-24F · MEDIUM-2: لیستِ قیمتِ صریح باید با قلمروی عملیاتیِ مجازِ مشتری بخواند.
    if (explicitListId) {
      const list = priceLists.find((l) => l.id === explicitListId);
      const foreign = Boolean(list?.domain_id) && !domainIds.includes(list!.domain_id as string);
      if (foreign) {
        if (!opts.allow_cross_domain_price_list) {
          throw new ForbiddenException({
            code: 'price_list_domain_forbidden',
            message_fa:
              'لیستِ قیمتِ انتخاب‌شده به قلمروی دیگری تعلق دارد؛ استفاده از آن نیازمندِ مجوزِ صریحِ بین‌قلمرویی است.',
            details: {
              price_list_id: explicitListId,
              price_list_domain_id: list?.domain_id ?? null,
              allowed_domain_ids: domainIds,
              source: dto.price_list_id ? 'request' : 'customer_default',
            },
          });
        }
        if (!opts.cross_domain_reason || opts.cross_domain_reason.trim().length < 3) {
          throw badRequest(
            'cross_domain_reason_required',
            'برای استفاده از لیستِ قیمتِ قلمرویِ دیگر، ثبتِ دلیلِ صریح الزامی است.',
            { price_list_id: explicitListId },
          );
        }
        crossDomainUse = {
          price_list_id: explicitListId,
          price_list_domain_id: list?.domain_id ?? null,
          reason: opts.cross_domain_reason.trim(),
        };
        // ممیزیِ اجباریِ عبورِ بین‌قلمرویی (قبل از هر محاسبهٔ قیمت)
        await this.repo.logPriceChange({
          company_id: companyId,
          entity_type: 'price_list',
          entity_id: explicitListId,
          action: 'cross_domain_use',
          before: null,
          after: {
            ...crossDomainUse,
            customer_id: customer?.id ?? null,
            allowed_domain_ids: domainIds,
            actor_user_id: opts.actor_user_id ?? null,
          },
          actor_user_id: opts.actor_user_id ?? null,
        });
      }
    }
    const listIds = explicitListId
      ? [explicitListId]
      : priceLists.filter((l) => (l.domain_id ? domainIds.includes(l.domain_id) : true)).map((l) => l.id);
    const priceItems = await this.repo.loadPriceItems(companyId, productIds, listIds);

    const couponCodes = (dto.coupon_codes ?? []).map((c) => c.trim().toUpperCase()).filter(Boolean);
    const coupons = await this.repo.loadCoupons(companyId, couponCodes, customer?.id ?? null, pricingDate);
    const usage = await this.repo.loadPromotionUsage(
      companyId,
      promotions.map((p) => p.id),
      customer?.id ?? null,
      pricingDate,
    );

    const reference_prices: Record<string, number> = {};
    // ارزش‌گذاریِ هدیه/جایزه: قیمتِ مرجعِ همان کالا از مسیرِ عادیِ قیمت (بدونِ اثرِ سبد)
    for (const productId of productIds) {
      if (dto.lines.some((l) => l.product_id === productId)) continue;
      const line: QuoteLineInput = { product_id: productId, qty: 1, packaging_id: null };
      const probe: QuoteContext = {
        pricing_date: pricingDate,
        customer,
        domain_ids: domainIds,
        price_lists: priceLists,
        price_items: priceItems,
        customer_prices: customerPrices,
        products: productBundle.products,
        packaging,
        costs: [],
        margin_policies: [],
        margin_exceptions: [],
        promotions: [],
        coupons: [],
        usage: [],
        order_history: orderHistory,
        reference_prices: {},
        options: { explicit_price_list_id: explicitListId ?? undefined },
      };
      try {
        const resolution = resolveLinePrice(probe, line, 0);
        reference_prices[productId] = dec(resolution.unit_price_base);
      } catch {
        // قیمتِ مرجعِ موجود نیست ⇒ هدیه قابلِ ارزش‌گذاری نیست و تشویق با دلیلِ صریح رد می‌شود
      }
    }

    return {
      pricing_date: pricingDate,
      customer,
      domain_ids: domainIds,
      price_lists: priceLists,
      price_items: priceItems,
      customer_prices: customerPrices,
      products: productBundle.products,
      packaging,
      costs,
      margin_policies: marginPolicies,
      margin_exceptions: marginExceptions,
      promotions,
      coupons,
      usage,
      order_history: orderHistory,
      reference_prices,
      options: {
        explicit_price_list_id: explicitListId,
        coupon_codes: couponCodes,
        max_total_discount_pct: opts.max_total_discount_pct ?? null,
        max_line_discount_pct: opts.max_line_discount_pct ?? null,
        apply_promotions: opts.apply_promotions !== false,
        allow_manual_price: opts.allow_manual_price === true,
        allow_discount_override: opts.allow_discount_override === true,
        allow_loss_making: opts.allow_loss_making === true,
      },
    };
  }

  private promotionProductRefs(p: {
    conditions: Record<string, unknown>;
    benefit: Record<string, unknown>;
  }): string[] {
    const ids: string[] = [];
    const push = (v: unknown): void => {
      if (typeof v === 'string' && isUUID(v, '4')) ids.push(v);
      else if (Array.isArray(v)) v.forEach(push);
    };
    const c = p.conditions ?? {};
    const b = p.benefit ?? {};
    push(c.product_ids);
    push((c.buy_x as Record<string, unknown> | undefined)?.product_id);
    push((c.bundle as Record<string, unknown> | undefined)?.product_ids);
    push((b.gift as Record<string, unknown> | undefined)?.product_id);
    push(b.get_product_id);
    return ids;
  }

  /**
   * استعلامِ کاملِ قیمت (بدونِ نوشتنِ تراکنشِ کسب‌وکار).
   * اگر idempotency_key داده شود و پیش‌تر همین درخواست ارزیابی شده باشد، نتیجهٔ
   * ذخیره‌شده برگردانده می‌شود (بازپخشِ بی‌اثر)؛ در صورتِ تغییرِ بدنه با همان کلید
   * خطای 409 صریح داده می‌شود تا کلید اشتباهی مصرف نشود.
   */
  async quote(
    companyId: string,
    dto: QuoteRequestDto,
    opts: QuoteRunOptions = {},
  ): Promise<QuoteResult & { replayed?: boolean; idempotency_key?: string | null }> {
    const key = dto.idempotency_key ?? null;
    // TASK-24F · MEDIUM-5: کلیدِ بازپخش فقط برای «همان درخواست + همان گزینه‌های
    // سرور» و در بازهٔ عمرِ کوتاه معتبر است؛ قیمتِ کهنه به سفارشِ بعدی تزریق نمی‌شود.
    const ttl = opts.replay_ttl_seconds ?? this.replayTtlSeconds();
    if (key) {
      if (!/^[A-Za-z0-9_-]{8,128}$/.test(key)) {
        throw badRequest('invalid_idempotency_key', 'کلیدِ idempotency باید ۸ تا ۱۲۸ کاراکترِ مجاز باشد.');
      }
      const hash = createHash('sha256')
        .update(canonical({ dto, opts: this.cacheableOptions(opts) }))
        .digest('hex');
      const cached = await this.repo.findEvaluation(companyId, key);
      if (cached) {
        if (cached.request_hash !== hash) {
          throw conflict('idempotency_key_reuse', 'این کلیدِ idempotency با درخواستِ متفاوتی استفاده شده است.');
        }
        const cachedResult = cached.result as QuoteResult;
        const sameDate = cachedResult?.pricing_date === (dto.pricing_date ?? this.today()).slice(0, 10);
        if (cached.age_seconds <= ttl && sameDate) {
          return { ...cachedResult, replayed: true, idempotency_key: key };
        }
        // کهنه/تاریخِ متفاوت ⇒ محاسبهٔ دوباره و تازه‌سازیِ کش (نه بازپخش)
      }
    }

    const ctx = await this.buildContext(companyId, dto, opts);
    let result: QuoteResult;
    try {
      result = computeQuote(ctx, dto.lines);
    } catch (err) {
      rethrowEngineError(err);
    }

    if (key) {
      const hash = createHash('sha256')
        .update(canonical({ dto, opts: this.cacheableOptions(opts) }))
        .digest('hex');
      await this.repo.saveEvaluation(companyId, key, hash, result);
    }
    return { ...result, replayed: false, idempotency_key: key };
  }

  /** فقط گزینه‌های مؤثر در محاسبه (بدونِ actor/ttl) در هشِ بازپخش می‌آیند */
  private cacheableOptions(opts: QuoteRunOptions): Record<string, unknown> {
    return {
      apply_promotions: opts.apply_promotions !== false,
      max_total_discount_pct: opts.max_total_discount_pct ?? null,
      max_line_discount_pct: opts.max_line_discount_pct ?? null,
      allow_manual_price: opts.allow_manual_price === true,
      allow_discount_override: opts.allow_discount_override === true,
      allow_loss_making: opts.allow_loss_making === true,
      allow_cross_domain_price_list: opts.allow_cross_domain_price_list === true,
    };
  }

  // =================================================================
  // §1.1  سیاستِ پایدارِ قیمت‌گذاری (TASK-24F)
  // =================================================================

  async getSettings(companyId: string): Promise<PricingSettings> {
    const row = await this.repo.getPricingSettings(companyId);
    if (!row) return { ...DEFAULT_PRICING_SETTINGS };
    const num = (v: string | null): number | null => (v == null ? null : dec(v));
    return {
      apply_promotions_on_orders: row.apply_promotions_on_orders,
      max_total_discount_pct: num(row.max_total_discount_pct),
      max_line_discount_pct: num(row.max_line_discount_pct),
      allow_loss_making_sales: row.allow_loss_making_sales,
      min_order_date_lookback_days: row.min_order_date_lookback_days,
      require_override_reason: row.require_override_reason,
    };
  }

  async updateSettings(
    companyId: string,
    actor: string,
    dto: UpdatePricingSettingsDto,
  ): Promise<PricingSettings> {
    const before = await this.getSettings(companyId);
    const merged: PricingSettings = {
      apply_promotions_on_orders:
        dto.apply_promotions_on_orders ?? before.apply_promotions_on_orders,
      max_total_discount_pct:
        dto.max_total_discount_pct === undefined
          ? before.max_total_discount_pct
          : dto.max_total_discount_pct,
      max_line_discount_pct:
        dto.max_line_discount_pct === undefined
          ? before.max_line_discount_pct
          : dto.max_line_discount_pct,
      allow_loss_making_sales: dto.allow_loss_making_sales ?? before.allow_loss_making_sales,
      min_order_date_lookback_days:
        dto.min_order_date_lookback_days === undefined
          ? before.min_order_date_lookback_days
          : dto.min_order_date_lookback_days,
      require_override_reason: dto.require_override_reason ?? before.require_override_reason,
    };
    await this.repo.upsertPricingSettings(companyId, { ...merged, updated_by: actor });
    await this.repo.logPriceChange({
      company_id: companyId,
      entity_type: 'pricing_settings',
      entity_id: null,
      action: 'update',
      before,
      after: merged,
      actor_user_id: actor,
    });
    return merged;
  }

  /**
   * TASK-24F · HIGH-1/HIGH-2 — قیمت‌گذاریِ سفارش با کنترل‌های سرور-محور:
   *   • همیشه از موتور (بدونِ پرچمِ کلاینتی که کنترل‌ها را خاموش کند)
   *   • مجوزِ قیمتِ دستی/عبور از سقف از نشست می‌آید، نه از بدنه
   *   • سقفِ کلِ تخفیف و اعمالِ تشویق از `pricing_settings` می‌آید
   *   • تاریخِ گذشته: نتیجهٔ قیمت‌گذاری با «امروز» محاسبه می‌شود تا تخفیف/سیاستِ
   *     منقضی دوباره فعال نشود؛ خودِ سند تاریخِ گذشته را نگه می‌دارد (با مجوز+دلیل+audit)
   */
  async quoteForOrder(
    companyId: string,
    input: {
      customer_id: string;
      order_date: string;
      price_list_id?: string | null;
      coupon_codes?: string[];
      lines: QuoteLineInput[];
      idempotency_key?: string | null;
      override_reason?: string | null;
    },
    perm: OrderPricingPermissions,
    actorUserId: string | null,
  ): Promise<OrderQuoteResult> {
    const settings = await this.getSettings(companyId);
    const orderDate = (input.order_date ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(orderDate)) {
      throw badRequest('invalid_date', 'تاریخِ سفارش معتبر نیست (قالب: YYYY-MM-DD).');
    }
    const today = this.todayTehran();
    const backdated = orderDate < today;
    const reason = (input.override_reason ?? '').trim();

    if (backdated) {
      if (settings.min_order_date_lookback_days != null) {
        const limit = new Date(`${today}T00:00:00Z`);
        limit.setUTCDate(limit.getUTCDate() - settings.min_order_date_lookback_days);
        if (orderDate < limit.toISOString().slice(0, 10)) {
          throw new ForbiddenException({
            code: 'backdate_out_of_range',
            message_fa: `تاریخِ سفارش بیش از ${settings.min_order_date_lookback_days} روز عقب‌تر از امروز است و مجاز نیست.`,
            details: { order_date: orderDate, today, max_lookback_days: settings.min_order_date_lookback_days },
          });
        }
      }
      if (!perm.backdate) {
        throw new ForbiddenException({
          code: 'backdate_forbidden',
          message_fa:
            'ثبتِ سفارش با تاریخِ گذشته نیازمندِ مجوزِ pricing.backdate.apply است (برای جلوگیری از فعال‌سازیِ خاموشِ قیمت/تشویقِ منقضی).',
          details: { order_date: orderDate, today },
        });
      }
      if (reason.length < 3) {
        throw badRequest('override_reason_required', 'برای تاریخِ گذشته، ثبتِ دلیل الزامی است.', {
          order_date: orderDate,
        });
      }
    }

    const usesManualPrice = input.lines.some((l) => l.unit_price != null);

    const dto: QuoteRequestDto = {
      customer_id: input.customer_id,
      // قیمت‌گذاری همیشه با تاریخِ مؤثر (امروز برای عقب‌گرد) انجام می‌شود
      pricing_date: backdated ? today : orderDate,
      price_list_id: input.price_list_id ?? null,
      coupon_codes: input.coupon_codes ?? [],
      idempotency_key: input.idempotency_key ?? null,
      cross_domain_reason: reason || null,
      lines: input.lines.map((l) => ({
        product_id: l.product_id,
        qty: l.qty,
        packaging_id: l.packaging_id ?? null,
        unit_price: l.unit_price ?? null,
        discount_amount: l.discount_amount ?? null,
      })),
    } as QuoteRequestDto;

    const opts: QuoteRunOptions = {
      apply_promotions: settings.apply_promotions_on_orders,
      max_total_discount_pct: settings.max_total_discount_pct,
      max_line_discount_pct: settings.max_line_discount_pct,
      allow_loss_making: settings.allow_loss_making_sales,
      allow_manual_price: perm.manual_price,
      allow_discount_override: perm.discount_override,
      allow_cross_domain_price_list: perm.cross_domain_price_list,
      cross_domain_reason: reason || null,
      actor_user_id: actorUserId,
      // بازپخشِ قیمتِ ذخیره‌شده فقط برای همان سفارش (کلیدِ سفارش‌محور)
      replay_ttl_seconds: 0,
    };

    const quote = await this.quote(companyId, dto, opts);

    // قیمتِ سیستمیِ هر قلم برای ممیزیِ قیمتِ دستی (بدونِ قیمتِ دستی)
    let systemPrices: (string | null)[] = quote.lines.map(() => null);
    if (usesManualPrice) {
      try {
        const systemQuote = await this.quote(
          companyId,
          {
            ...dto,
            idempotency_key: null,
            lines: dto.lines.map((l) => ({ ...l, unit_price: null })),
          },
          { ...opts, allow_manual_price: false, allow_discount_override: false, replay_ttl_seconds: 0 },
        );
        systemPrices = systemQuote.lines.map((l) => l.unit_price);
      } catch {
        // قیمتِ سیستمی در دسترس نیست ⇒ در ممیزی null ثبت می‌شود (بدونِ شکستنِ سفارش)
      }
    }

    // دلیلِ اجباری: قیمتِ دستیِ متفاوت از قیمتِ سیستمی، یا تخفیفِ فراتر از سقف
    const manualDiverged = quote.lines.some((line, idx) => {
      const requested = dto.lines[idx]?.unit_price;
      if (requested == null) return false;
      const system = systemPrices[idx];
      return system == null || Math.abs(Number(requested) - Number(system)) > 0.005;
    });
    const overrodeCap = quote.warnings.some((w) => w.includes('فراتر از سقف'));
    if ((manualDiverged || overrodeCap) && settings.require_override_reason && reason.length < 3) {
      throw badRequest(
        'override_reason_required',
        'برای قیمتِ دستیِ متفاوت از قیمتِ سیستم یا تخفیفِ فراتر از سقف، ثبتِ دلیل الزامی است.',
        {
          reason: manualDiverged ? 'manual_price' : 'discount_override',
          system_unit_prices: systemPrices,
        },
      );
    }

    return {
      quote,
      system_unit_prices: systemPrices,
      settings,
      pricing_date: dto.pricing_date as string,
      backdated,
    };
  }

  /** شبیه‌سازی — همان استعلام + ثبتِ audit (فقط سبکِ ممیزی، نه سندِ کسب‌وکار) */
  async simulate(
    companyId: string,
    actorUserId: string | null,
    dto: QuoteRequestDto,
    opts: QuoteRunOptions = {},
  ): Promise<QuoteResult & { simulation_id: string | null }> {
    const result = await this.quote(companyId, dto, opts);
    let simulationId: string | null = null;
    if (dto.persist_audit !== false && result.replayed !== true) {
      simulationId = await this.repo.logSimulation(companyId, actorUserId, dto, {
        subtotal: result.subtotal,
        discount_total: result.discount_total,
        tax_total: result.tax_total,
        grand_total: result.grand_total,
        margin_pct: result.margin_pct,
        applied: result.applied_promotions.map((p) => ({
          code: p.code,
          amount: p.amount,
          gift_lines: result.gift_lines.filter((g) => g.promotion_code === p.code).length,
        })),
        violations: result.margin_violations.map((v) => v.code),
        /* TASK-24F: سیاست/مجوزهای مؤثر در همان ارزیابی، برای بازتولیدِ نتیجه */
        policy: this.cacheableOptions(opts),
      });
    }
    return { ...result, simulation_id: simulationId };
  }

  /**
   * ثبتِ مصرفِ تشویق‌ها پس از ایجادِ سند (فعلاً فقط سفارش، با پرچمِ صریح).
   * idempotent: تکرارِ همان کلید ردیفِ تکراری نمی‌سازد.
   */
  async commitUsage(
    companyId: string,
    input: {
      actor_user_id: string | null;
      entity_type?: string;
      entity_id: string | null;
      customer_id: string | null;
      idempotency_key: string;
      quote: QuoteResult;
    },
  ): Promise<{ inserted: number; skipped: number }> {
    const promotions = input.quote.applied_promotions
      .filter((p) => dec(p.amount) > 0)
      .map((p) => ({ promotion_id: p.promotion_id, coupon_id: p.coupon_id, amount: p.amount }));
    if (promotions.length === 0) return { inserted: 0, skipped: 0 };
    return this.repo.applyRedemptions(companyId, {
      idempotency_key: input.idempotency_key,
      entity_type: input.entity_type ?? 'order',
      entity_id: input.entity_id,
      customer_id: input.customer_id,
      actor_user_id: input.actor_user_id,
      promotions,
    });
  }

  // =================================================================
  // §2  قلمروها
  // =================================================================

  listDomains(companyId: string) {
    return this.repo.listDomains(companyId);
  }

  async createDomain(companyId: string, actor: string | null, dto: CreatePricingDomainDto) {
    if (dto.kind === 'channel' && !dto.channel) {
      throw badRequest('invalid_domain', 'برای قلمروِ کانالی، مقدارِ channel الزامی است.');
    }
    if (dto.kind === 'area' && !dto.area_id) {
      throw badRequest('invalid_domain', 'برای قلمروِ حوزه‌ای، area_id الزامی است.');
    }
    if (dto.kind === 'branch' && !dto.branch_id) {
      throw badRequest('invalid_domain', 'برای قلمروِ شعبه‌ای، branch_id الزامی است.');
    }
    try {
      const id = await this.repo.insertDomain(companyId, dto);
      await this.repo.logPriceChange({
        company_id: companyId,
        entity_type: 'pricing_domain',
        entity_id: id,
        action: 'create',
        before: null,
        after: dto,
        actor_user_id: actor,
      });
      return this.repo.findDomain(companyId, id);
    } catch (err) {
      const e = err as { code?: string; constraint?: string };
      if (e.code === '23505') throw conflict('duplicate_domain', 'این قلمرو یا کدِ آن قبلاً ثبت شده است.');
      if (e.code === '23503') throw badRequest('reference_invalid', 'ارجاعِ حوزه/شعبه معتبر نیست.');
      if (e.code === '23514') throw badRequest('invalid_domain', 'ترکیبِ نوع و هدفِ قلمرو معتبر نیست.');
      throw err;
    }
  }

  async updateDomain(companyId: string, actor: string | null, id: string, dto: UpdatePricingDomainDto) {
    this.assertId(id, 'قلمرو');
    const before = await this.repo.findDomain(companyId, id);
    if (!before) throw new NotFoundException({ code: 'not_found', message_fa: 'قلمرو یافت نشد.' });
    await this.repo.updateDomain(companyId, id, { ...dto });
    await this.repo.logPriceChange({
      company_id: companyId,
      entity_type: 'pricing_domain',
      entity_id: id,
      action: 'update',
      before,
      after: dto,
      actor_user_id: actor,
    });
    return this.repo.findDomain(companyId, id);
  }

  // =================================================================
  // §3  کفِ سود — سیاست‌ها و استثناها
  // =================================================================

  listMarginPolicies(companyId: string) {
    return this.repo.listMarginPoliciesAdmin(companyId);
  }

  async createMarginPolicy(companyId: string, actor: string | null, dto: CreateMarginPolicyDto) {
    if (dto.scope === 'product' && !dto.product_id) {
      throw badRequest('invalid_scope', 'سیاستِ کالایی نیازمندِ product_id است.');
    }
    if (dto.scope === 'category' && !dto.category_id) {
      throw badRequest('invalid_scope', 'سیاستِ گروه‌کالایی نیازمندِ category_id است.');
    }
    if (dto.product_id && !(await this.repo.productExists(companyId, dto.product_id))) {
      throw badRequest('product_not_found', 'کالای انتخاب‌شده در این شرکت یافت نشد.');
    }
    try {
      const id = await this.repo.insertMarginPolicy(companyId, {
        domain_id: dto.domain_id ?? null,
        scope: dto.scope,
        category_id: dto.category_id ?? null,
        product_id: dto.product_id ?? null,
        cost_basis: dto.cost_basis ?? 'avg_cost',
        min_margin_pct: dto.min_margin_pct,
        on_unknown_cost: dto.on_unknown_cost ?? 'block',
        valid_from: dto.valid_from ?? null,
        valid_to: dto.valid_to ?? null,
        priority: dto.priority ?? null,
        actor,
      });
      await this.repo.logPriceChange({
        company_id: companyId,
        entity_type: 'margin_policy',
        entity_id: id,
        action: 'create',
        before: null,
        after: dto,
        actor_user_id: actor,
      });
      return this.repo.findMarginPolicy(companyId, id);
    } catch (err) {
      const e = err as { code?: string; constraint?: string };
      if (e.code === '23P01') {
        throw conflict('overlapping_policy', 'سیاستِ کفِ سودِ هم‌پوشان برای همین دامنه قبلاً ثبت شده است.');
      }
      if (e.code === '23514') throw badRequest('invalid_scope', 'ترکیبِ دامنه/دستهٔ سیاست معتبر نیست.');
      throw err;
    }
  }

  async updateMarginPolicy(companyId: string, actor: string | null, id: string, dto: UpdateMarginPolicyDto) {
    this.assertId(id, 'سیاستِ کفِ سود');
    const before = await this.repo.findMarginPolicy(companyId, id);
    if (!before) throw new NotFoundException({ code: 'not_found', message_fa: 'سیاستِ کفِ سود یافت نشد.' });
    await this.repo.updateMarginPolicy(companyId, id, { ...dto });
    await this.repo.logPriceChange({
      company_id: companyId,
      entity_type: 'margin_policy',
      entity_id: id,
      action: 'update',
      before,
      after: dto,
      actor_user_id: actor,
    });
    return this.repo.findMarginPolicy(companyId, id);
  }

  listMarginExceptions(companyId: string, status: string | undefined, limit = 100) {
    return this.repo.listMarginExceptions(companyId, status ?? null, limit);
  }

  async createMarginException(companyId: string, actor: string, dto: CreateMarginExceptionDto) {
    if (dto.product_id && !(await this.repo.productExists(companyId, dto.product_id))) {
      throw badRequest('product_not_found', 'کالای انتخاب‌شده در این شرکت یافت نشد.');
    }
    if (dto.customer_id && !(await this.repo.customerExists(companyId, dto.customer_id))) {
      throw badRequest('customer_not_found', 'مشتریِ انتخاب‌شده در این شرکت یافت نشد.');
    }
    try {
      const id = await this.repo.insertMarginException({
        company_id: companyId,
        policy_id: dto.policy_id ?? null,
        entity_type: dto.entity_type,
        entity_id: dto.entity_id ?? null,
        product_id: dto.product_id ?? null,
        customer_id: dto.customer_id ?? null,
        required_margin_pct: dto.required_margin_pct ?? null,
        effective_margin_pct: dto.effective_margin_pct ?? null,
        granted_margin_pct: dto.granted_margin_pct ?? null,
        reason: dto.reason,
        requested_by: actor,
        valid_until: dto.valid_until ?? null,
      });
      // اتصال به موتورِ تأیید فقط اگر زنجیرهٔ فعالی برای این موجودیت تعریف شده باشد؛
      // وجودِ زنجیره یعنی گردشِ چندمرحله‌ای باید *قبل از* تأییدِ شخصِ دوم تکمیل شود.
      if (this.rules) {
        const chainId = await this.repo.findApprovalChain(companyId, 'pricing.margin_exception');
        if (chainId) {
          const requested = await this.rules.createApprovalRequest(companyId, {
            approval_chain_id: chainId,
            entity_type: 'pricing.margin_exception',
            entity_id: id,
            requested_by: actor,
            amount: dto.effective_margin_pct ?? null,
          });
          const requestId = (requested as { id?: string } | null)?.id;
          if (requestId) await this.repo.updateMarginExceptionApprovalRequest(companyId, id, requestId);
        }
      }
      await this.repo.logPriceChange({
        company_id: companyId,
        entity_type: 'margin_exception',
        entity_id: id,
        action: 'create',
        before: null,
        after: { ...dto, status: 'pending', requested_by: actor },
        actor_user_id: actor,
      });
      return this.repo.findMarginException(companyId, id);
    } catch (err) {
      const e = err as { code?: string; constraint?: string };
      if (e.code === '23505') {
        throw conflict('exception_already_open', 'برای این دامنه یک درخواستِ استثنای باز وجود دارد.');
      }
      if (e.code === '23514') throw badRequest('invalid_exception', 'داده‌های استثنا معتبر نیست.');
      throw err;
    }
  }

  /**
   * تصمیمِ شخصِ دوم — الزاماتِ سخت:
   *   ۱) مجوزِ pricing.margin.override (در کنترلر)
   *   ۲) تصمیم‌گیرنده ≠ درخواست‌دهنده (DB constraint + بررسیِ صریح این‌جا)
   *   ۳) فقط وضعیتِ pending
   *   ۴) اگر زنجیرهٔ تأییدِ موتورِ قواعد وصل شده باشد، آن درخواست باید approved باشد
   */
  async decideMarginException(
    companyId: string,
    actor: string,
    id: string,
    dto: DecideMarginExceptionDto,
  ) {
    this.assertId(id, 'استثنا');
    const existing = await this.repo.findMarginException(companyId, id);
    if (!existing) throw new NotFoundException({ code: 'not_found', message_fa: 'استثنا یافت نشد.' });
    if (existing.status !== 'pending') {
      throw conflict('not_pending', 'این درخواستِ استثنا قبلاً بسته شده است.');
    }
    if (existing.requested_by === actor) {
      throw new ForbiddenException({
        code: 'second_person_required',
        message_fa: 'تأییدِ استثنا باید توسط شخصِ دیگری غیر از درخواست‌دهنده انجام شود.',
      });
    }
    const approvalRequestId = existing.approval_request_id as string | null;
    if (approvalRequestId) {
      const request = this.rules
        ? await this.rules.getApprovalRequest(companyId, approvalRequestId)
        : null;
      if (!request || request.status !== 'approved') {
        throw conflict('approval_pending', 'گردشِ تأییدِ متصل به این استثنا هنوز تأیید نشده است.', {
          approval_request_id: approvalRequestId,
          status: request?.status ?? 'missing',
        });
      }
    }
    const ok = await this.repo.decideMarginException({
      company_id: companyId,
      id,
      decided_by: actor,
      status: dto.decision === 'approve' ? 'approved' : 'rejected',
      note: dto.note ?? null,
      granted_margin_pct: dto.granted_margin_pct ?? null,
    });
    if (!ok) {
      throw conflict(
        'decision_conflict',
        'تصمیمِ هم‌زمان یا تأییدِ خودکار رد شد؛ وضعیتِ استثنا را دوباره بارگیری کنید.',
      );
    }
    const after = await this.repo.findMarginException(companyId, id);
    await this.repo.logPriceChange({
      company_id: companyId,
      entity_type: 'margin_exception',
      entity_id: id,
      action: dto.decision === 'approve' ? 'approve' : 'reject',
      before: existing,
      after: { status: after?.status, decided_by: actor, note: dto.note ?? null },
      actor_user_id: actor,
      approval_request_id: approvalRequestId,
    });
    return after;
  }

  // =================================================================
  // §4  اعتبارسنجیِ کفِ سود در زمانِ نوشتنِ قیمت
  // =================================================================

  /**
   * بررسیِ کفِ سود برای یک قیمتِ در حالِ نوشتن (قبل از persist).
   * قیمت به واحدِ پایه سنجیده می‌شود (mf = ضریبِ بسته).
   * در صورتِ نقض و نبودِ استثنای معتبر ⇒ 409 با دلیلِ صریح.
   */
  async assertMarginForPriceWrite(input: {
    companyId: string;
    productId: string;
    packagingId: string | null;
    price: string;
    customerId: string | null;
    pricingDate: string;
    marginExceptionId?: string | null;
  }): Promise<{
    status: 'ok' | 'no_policy' | 'exception_applied';
    margin_pct: number | null;
    required_margin_pct: number | null;
    policy_id: string | null;
    exception_id: string | null;
    /**
     * TASK-24F · MEDIUM-1: تأییدکنندهٔ واقعیِ استثنا (`decided_by`)، هرگز نویسندهٔ قیمت نیست.
     * اگر استثنایی اعمال نشده باشد، NULL است (نوشتنِ عادی نیازی به تأیید ندارد).
     */
    approved_by: string | null;
    approval_request_id: string | null;
  }> {
    const [productBundle, packaging, costs, policies, exceptions] = await Promise.all([
      this.repo.loadProducts(input.companyId, [input.productId]),
      this.repo.loadPackaging(input.companyId, [input.productId]),
      this.repo.loadCosts(input.companyId, [input.productId]),
      this.repo.loadMarginPolicies(input.companyId),
      this.repo.loadMarginExceptions(input.companyId, input.customerId, [input.productId]),
    ]);
    const product = productBundle.products.find((p) => p.id === input.productId) ?? null;
    if (!product) throw badRequest('product_not_found', 'کالای انتخاب‌شده در این شرکت یافت نشد.');

    let factor = 1;
    if (input.packagingId) {
      const pk = packaging.find((p) => p.id === input.packagingId);
      if (!pk) throw badRequest('packaging_not_found', 'بسته‌بندیِ انتخاب‌شده برای این کالا یافت نشد.');
      factor = dec(pk.factor_to_base);
    }
    const priceBase = dec(input.price) / (factor > 0 ? factor : 1);

    const ctx = {
      pricing_date: input.pricingDate,
      customer: input.customerId
        ? { id: input.customerId, channel: '', price_list_id: null, settlement_term_ids: [], status: 'active' }
        : null,
      domain_ids: [] as string[],
      price_lists: [],
      price_items: [],
      customer_prices: [],
      products: [product],
      packaging,
      costs,
      margin_policies: policies,
      margin_exceptions: exceptions,
      promotions: [],
      coupons: [],
      usage: [],
      order_history: { total_orders: 0, first_order_at: null },
      reference_prices: {},
    } as QuoteContext;

    const policyRef = resolveMarginPolicy(ctx, product);
    const costUnit = policyRef ? costBasisFor(ctx, product.id, policyRef.policy.cost_basis) : null;
    const evaluation = evaluateLineMargin(ctx, product, priceBase, costUnit, policyRef);
    const details = {
      product_id: product.id,
      margin_pct: evaluation.result.margin_pct,
      required_margin_pct: evaluation.result.required_margin_pct,
      policy_id: evaluation.result.policy_id,
      cost_basis: evaluation.result.cost_basis,
      cost_unit: costUnit == null ? null : money(costUnit),
      candidate_price_base: money(priceBase),
    };
    if (evaluation.violation) {
      if (input.marginExceptionId) {
        const ex = await this.repo.findMarginException(input.companyId, input.marginExceptionId);
        /* TASK-24F · MEDIUM-1: همان قواعدِ سخت‌گیرانهٔ استعلام — کالای مشخص،
           سیاستِ منطبق، سقفِ granted_margin_pct و ردِ استثنای مقید به سندِ دیگر. */
        const valid =
          Boolean(ex) &&
          exceptionPermits(
            {
              id: String(ex!.id),
              product_id: (ex!.product_id as string | null) ?? null,
              customer_id: (ex!.customer_id as string | null) ?? null,
              policy_id: (ex!.policy_id as string | null) ?? null,
              entity_type: String(ex!.entity_type ?? ''),
              entity_id: (ex!.entity_id as string | null) ?? null,
              granted_margin_pct:
                ex!.granted_margin_pct == null ? null : String(ex!.granted_margin_pct),
              status: String(ex!.status ?? ''),
              valid_until: (ex!.valid_until as string | null) ?? null,
            },
            {
              productId: product.id,
              customerId: input.customerId,
              policyId: evaluation.result.policy_id,
              marginPct: evaluation.result.margin_pct,
            },
          ) &&
          (ex!.valid_until == null || String(ex!.valid_until) >= input.pricingDate);
        if (!valid) {
          throw new ForbiddenException({
            code: 'margin_exception_invalid',
            message_fa: 'استثنای کفِ سودِ ارجاع‌شده معتبر/تأییدشده نیست یا با این کالا/مشتری نمی‌خواند.',
            details: { ...details, margin_exception_id: input.marginExceptionId },
          });
        }
        return {
          status: 'exception_applied',
          margin_pct: evaluation.result.margin_pct,
          required_margin_pct: evaluation.result.required_margin_pct,
          policy_id: evaluation.result.policy_id,
          exception_id: input.marginExceptionId,
          // MEDIUM-1: نویسنده هرگز به‌عنوان تأییدکننده ثبت نمی‌شود
          approved_by: (ex!.decided_by as string | null) ?? null,
          approval_request_id: (ex!.approval_request_id as string | null) ?? null,
        };
      }
      throw conflict('margin_floor_violation', evaluation.violation.message_fa, {
        ...details,
        violation: evaluation.violation.code,
        requires: 'margin_exception',
      });
    }
    return {
      status: policyRef ? 'ok' : 'no_policy',
      margin_pct: evaluation.result.margin_pct,
      required_margin_pct: evaluation.result.required_margin_pct,
      policy_id: evaluation.result.policy_id,
      exception_id: null,
      approved_by: null,
      approval_request_id: null,
    };
  }

  async logPriceChange(input: {
    companyId: string;
    actorUserId: string | null;
    entityType: string;
    entityId: string | null;
    action: string;
    before: unknown;
    after: unknown;
    approvalRequestId?: string | null;
  }): Promise<void> {
    await this.repo.logPriceChange({
      company_id: input.companyId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      action: input.action,
      before: input.before,
      after: input.after,
      actor_user_id: input.actorUserId,
      approval_request_id: input.approvalRequestId ?? null,
    });
  }

  listPriceChanges(companyId: string, entityType: string | undefined, limit = 100) {
    return this.repo.listPriceChanges(companyId, entityType ?? null, limit);
  }

  // =================================================================
  // §5  قیمتِ مشتری
  // =================================================================

  listCustomerPrices(companyId: string, customerId: string | undefined, productId: string | undefined, limit = 100) {
    return this.repo.listCustomerPrices(companyId, customerId ?? null, productId ?? null, limit);
  }

  async createCustomerPrice(companyId: string, actor: string, dto: CreateCustomerPriceDto) {
    if (!(await this.repo.customerExists(companyId, dto.customer_id))) {
      throw badRequest('customer_not_found', 'مشتریِ انتخاب‌شده در این شرکت یافت نشد.');
    }
    if (!(await this.repo.productExists(companyId, dto.product_id))) {
      throw badRequest('product_not_found', 'کالای انتخاب‌شده در این شرکت یافت نشد.');
    }
    if (dto.packaging_id && !(await this.repo.packagingExists(companyId, dto.product_id, dto.packaging_id))) {
      throw badRequest('packaging_not_found', 'بسته‌بندیِ انتخاب‌شده برای این کالا یافت نشد.');
    }
    const margin = await this.assertMarginForPriceWrite({
      companyId,
      productId: dto.product_id,
      packagingId: dto.packaging_id ?? null,
      price: dto.price,
      customerId: dto.customer_id,
      pricingDate: (dto.valid_from ?? this.today()).slice(0, 10),
      marginExceptionId: dto.margin_exception_id ?? null,
    });
    try {
      const id = await this.repo.insertCustomerPrice(companyId, {
        customer_id: dto.customer_id,
        product_id: dto.product_id,
        packaging_id: dto.packaging_id ?? null,
        price: dto.price,
        min_qty: dto.min_qty ?? undefined,
        max_qty: dto.max_qty ?? null,
        max_discount_pct: dto.max_discount_pct ?? null,
        valid_from: dto.valid_from ?? null,
        valid_to: dto.valid_to ?? null,
        // MEDIUM-1: تأییدکننده = تصمیم‌گیرندهٔ استثنا (نه نویسندهٔ قیمت)
        approved_by: margin.status === 'exception_applied' ? margin.approved_by : null,
        approval_request_id:
          margin.status === 'exception_applied' ? margin.approval_request_id : null,
        note: dto.note ?? null,
        created_by: actor,
      });
      if (!id) throw badRequest('customer_not_found', 'مشتریِ انتخاب‌شده در این شرکت یافت نشد.');
      await this.repo.logPriceChange({
        company_id: companyId,
        entity_type: 'customer_price',
        entity_id: id,
        action: 'create',
        before: null,
        after: { ...dto, margin },
        actor_user_id: actor,
      });
      return this.repo.findCustomerPrice(companyId, id);
    } catch (err) {
      const e = err as { code?: string; constraint?: string };
      if (e.code === '23P01') {
        throw conflict('overlapping_price', 'برای این کالا/بسته در این بازهٔ زمانی قیمتِ اختصاصی ثبت شده است.');
      }
      if (e.code === '23514') throw badRequest('check_violation', 'مقدارِ یکی از فیلدها مجاز نیست.');
      if (e.code === '23503') throw badRequest('reference_invalid', 'ارجاعِ ارسال‌شده معتبر نیست.');
      throw err;
    }
  }

  async updateCustomerPrice(companyId: string, actor: string, id: string, dto: UpdateCustomerPriceDto) {
    this.assertId(id, 'قیمتِ مشتری');
    const before = await this.repo.findCustomerPrice(companyId, id);
    if (!before) throw new NotFoundException({ code: 'not_found', message_fa: 'قیمتِ اختصاصی یافت نشد.' });
    if (dto.row_version != null) {
      const currentVersion = Number((before as { row_version?: number }).row_version ?? 0);
      if (dto.row_version !== currentVersion) {
        throw conflict('version_conflict', 'قیمت هم‌زمان توسط کاربرِ دیگری تغییر کرده است؛ دوباره بارگیری کنید.');
      }
    }
    let margin: Awaited<ReturnType<PricingEngineService['assertMarginForPriceWrite']>> | null = null;
    if (dto.price != null) {
      margin = await this.assertMarginForPriceWrite({
        companyId,
        productId: String(before.product_id),
        packagingId: (before.packaging_id as string | null) ?? null,
        price: dto.price,
        customerId: String(before.customer_id),
        pricingDate: (dto.valid_from ?? this.today()).slice(0, 10),
        marginExceptionId: dto.margin_exception_id ?? null,
      });
    }
    const ok = await this.repo.updateCustomerPrice(companyId, id, {
      ...(dto.price !== undefined ? { price: dto.price } : {}),
      ...(dto.min_qty !== undefined ? { min_qty: dto.min_qty } : {}),
      ...(dto.max_qty !== undefined ? { max_qty: dto.max_qty } : {}),
      ...(dto.max_discount_pct !== undefined ? { max_discount_pct: dto.max_discount_pct } : {}),
      ...(dto.note !== undefined ? { note: dto.note } : {}),
      ...(margin && margin.status === 'exception_applied'
        ? { approved_by: margin.approved_by, approval_request_id: margin.approval_request_id }
        : {}),
    });
    if (!ok) throw new NotFoundException({ code: 'not_found', message_fa: 'قیمتِ اختصاصی یافت نشد.' });
    if (dto.valid_from !== undefined || dto.valid_to !== undefined) {
      await this.repo.updateCustomerPriceRange(companyId, id, dto.valid_from ?? null, dto.valid_to ?? null);
    }
    await this.repo.logPriceChange({
      company_id: companyId,
      entity_type: 'customer_price',
      entity_id: id,
      action: 'update',
      before,
      after: dto,
      actor_user_id: actor,
    });
    return this.repo.findCustomerPrice(companyId, id);
  }

  // =================================================================
  // §6  کوپن‌ها
  // =================================================================

  listCoupons(companyId: string, promotionId: string | undefined, limit = 100) {
    return this.repo.listCoupons(companyId, promotionId ?? null, limit);
  }

  async createCoupon(companyId: string, actor: string, promotionId: string, dto: CreateCouponDto) {
    this.assertId(promotionId, 'تشویق');
    try {
      const id = await this.repo.insertCoupon(companyId, { promotion_id: promotionId, ...dto });
      await this.repo.logPriceChange({
        company_id: companyId,
        entity_type: 'promotion_coupon',
        entity_id: id,
        action: 'create',
        before: null,
        after: { ...dto, promotion_id: promotionId },
        actor_user_id: actor,
      });
      const rows = (await this.repo.listCoupons(companyId, promotionId, 500)) as { id: string }[];
      return rows.find((r) => r.id === id) ?? { id };
    } catch (err) {
      const e = err as { code?: string };
      if (e.code === '23505') throw conflict('duplicate_code', 'این کدِ کوپن قبلاً ثبت شده است.');
      if (e.code === '23503') throw badRequest('promotion_not_found', 'تشویقِ انتخاب‌شده یافت نشد.');
      throw err;
    }
  }

  async setCouponActive(companyId: string, actor: string, id: string, active: boolean) {
    this.assertId(id, 'کوپن');
    const ok = await this.repo.setCouponActive(companyId, id, active);
    if (!ok) throw new NotFoundException({ code: 'not_found', message_fa: 'کوپن یافت نشد.' });
    await this.repo.logPriceChange({
      company_id: companyId,
      entity_type: 'promotion_coupon',
      entity_id: id,
      action: active ? 'activate' : 'deactivate',
      before: null,
      after: { is_active: active },
      actor_user_id: actor,
    });
    return { id, is_active: active };
  }

  // =================================================================
  // §7  اعتبارسنجیِ تعریفِ تشویق (پیش از ذخیره)
  // =================================================================

  validatePromotion(
    kind: string,
    conditions: Record<string, unknown> | undefined,
    benefit: Record<string, unknown> | undefined,
  ): void {
    // تعریفِ کامل فقط وقتی لازم است که کاربر خودش conditions/benefit فرستاده باشد؛
    // تعریفِ ناقصِ موجود در DB با دلیلِ صریح (zero_benefit) اجرا نمی‌شود و هرگز تخفیف نمی‌دهد.
    const errors = validatePromotionDefinition(
      kind as Parameters<typeof validatePromotionDefinition>[0],
      conditions ?? {},
      benefit ?? {},
      { requireComplete: conditions !== undefined && benefit !== undefined },
    );
    if (errors.length > 0) {
      throw new BadRequestException({
        code: 'invalid_promotion_definition',
        message_fa: 'تعریفِ تشویق کامل/معتبر نیست.',
        details: { errors },
      });
    }
  }

  /** درصدِ حاشیه برای گزارش — گرد به ۴ رقم (هم‌راستا با numeric(7,4)) */
  marginOf(netRevenue: number, cost: number): number | null {
    if (netRevenue === 0) return null;
    return roundPct4(((netRevenue - cost) / netRevenue) * 100);
  }
}
