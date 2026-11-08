import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { isUUID } from 'class-validator';
import type { CreateOrderDto, ListOrdersQueryDto, UpdateOrderDto } from './order.dto';
import type { OrderRepository, OrderRow } from './order.repository';
import { ORDER_REPOSITORY } from './tokens';
import { RULES_ENGINE_SERVICE } from '../rules-engine/rules-engine.tokens';
import type { RulesEngineService } from '../rules-engine/rules-engine.service';
import type { RuleContext, RuleEvaluation } from '../rules-engine/rules-engine.service';
import { DOC_NUMBER_SERVICE, persianYear } from '../../common/doc-number.service';
import type { DocNumberService } from '../../common/doc-number.service';
import { PRICING_ENGINE_SERVICE } from '../pricing/pricing.tokens';
import { OrderCreationLock } from './order-creation-lock';
import type { PricingEngineService } from '../pricing/pricing-engine.service';
import type { QuoteResult } from '../pricing/pricing-engine';
import type {
  OrderPricingPermissions,
  OrderQuoteResult,
} from '../pricing/pricing-engine.service';

/** پیش‌فرضِ امن: اگر کنترلر مجوزها را پاس نکند، هیچ عبوری مجاز نیست */
const DENY_ALL_PRICING: OrderPricingPermissions = {
  manual_price: false,
  discount_override: false,
  cross_domain_price_list: false,
  backdate: false,
};

const badRequest = (code: string, message_fa: string): BadRequestException =>
  new BadRequestException({ code, message_fa });

const notFound = (): NotFoundException =>
  new NotFoundException({ code: 'not_found', message_fa: 'سفارش یافت نشد' });

// منبعِ واحدِ گرد‌کردنِ مالی (TASK-24) — رفتارِ پیشین عیناً حفظ شده است
import { money } from '../../common/financial';

export interface OrderView extends OrderRow {
  lines?: {
    product_id: string;
    packaging_id: string | null;
    qty: number;
    unit_price: string | null;
    discount_amount: string | null;
    tax_rate_pct: number;
    tax_amount: string | null;
    line_total: string | null;
  }[];
}

interface OrderLineValues {
  line_no: number;
  product_id: string;
  packaging_id: string | null;
  qty: number;
  qty_base: number;
  unit_price: string;
  discount_amount: string;
  tax_rate_pct: number;
  tax_amount: string;
}

interface ComputedTotals {
  subtotal: string;
  discount_total: string;
  tax_total: string;
  grand_total: string;
}

@Injectable()
export class OrderService {
  constructor(
    @Inject(ORDER_REPOSITORY) private readonly repo: OrderRepository,
    @Inject(RULES_ENGINE_SERVICE) private readonly rules: RulesEngineService,
    @Inject(DOC_NUMBER_SERVICE) private readonly docNumbers: DocNumberService,
    /**
     * موتورِ قیمت — TASK-24F: مسیرِ یگانهٔ قیمت‌گذاریِ سفارش. هیچ پرچمِ کلاینتی
     * نمی‌تواند کنترل‌های کفِ سود/سقفِ تخفیف/مجوزِ قیمتِ دستی را خاموش کند.
     */
    @Inject(PRICING_ENGINE_SERVICE) private readonly pricing: PricingEngineService,
    /**
     * TASK-24X · A-1 — قفلِ مشترکِ ساختِ سفارش. هر مسیری که سفارشِ متصل به یک
     * درخواست می‌سازد (تبدیل یا `POST /orders` با `request_id`) باید از همین
     * سازوکار عبور کند تا «یک درخواست ⇒ یک سفارش» در همهٔ مسیرها تضمین شود.
     */
    private readonly creationLock: OrderCreationLock,
  ) {}

  private assertId(id: string): void {
    if (!isUUID(id, '4')) throw badRequest('invalid_id', 'شناسه سفارش ارسال‌شده معتبر نیست.');
  }

  async list(companyId: string, query: ListOrdersQueryDto): Promise<Page<OrderRow>> {
    const { items, nextCursor, hasMore } = await this.repo.list(companyId, query);
    return { items, next_cursor: nextCursor, has_more: hasMore };
  }

  async get(companyId: string, id: string): Promise<OrderView> {
    this.assertId(id);
    const row = await this.repo.findById(companyId, id);
    if (!row) throw notFound();
    const lines = await this.repo.findLines(id);
    return { ...row, lines };
  }

  async create(
    companyId: string,
    dto: CreateOrderDto,
    actorUserId: string | null = null,
    permissions: OrderPricingPermissions = DENY_ALL_PRICING,
  ): Promise<OrderView> {
    // TASK-24X · A-1 — شرطیِ‌سازیِ ساختِ سفارشِ متصل به درخواست.
    //
    // اگر `request_id` دارد، کلِ توالیِ ساخت (اعتبارسنجی، قیمت‌گذاری، شمارهٔ سند،
    // درج، مصرفِ تشویق، ممیزی) زیرِ قفلِ همان درخواست اجرا می‌شود. پیش از این،
    // این مسیر اصلاً قفل نداشت و می‌توانست در موازاتِ `convert()` سفارشِ دومی برای
    // همان درخواست بسازد. بدونِ `request_id` قفل لازم نیست (هیچ هویتِ مشترکی نیست).
    if (!dto.request_id) return this.createLocked(companyId, dto, actorUserId, permissions);
    return this.creationLock.withRequestLock(dto.request_id, () =>
      this.createLocked(companyId, dto, actorUserId, permissions),
    );
  }

  private async createLocked(
    companyId: string,
    dto: CreateOrderDto,
    actorUserId: string | null,
    permissions: OrderPricingPermissions,
  ): Promise<OrderView> {
    // TASK-24X · A-1 — نگهبانِ idempotency: اگر این درخواست **پیش‌تر** به سفارش
    // تبدیل شده باشد، ساختِ سفارشِ دوم مجاز نیست. این بررسی داخلِ قفل انجام
    // می‌شود، پس هیچ پنجرهٔ مسابقه‌ای باقی نمی‌ماند.
    if (dto.request_id) {
      const existingOrderId = await this.repo.findOrderIdByRequestId(companyId, dto.request_id);
      if (existingOrderId) {
        throw new ConflictException({
          code: 'request_already_converted',
          message_fa:
            'این درخواست پیش‌تر به سفارش تبدیل شده است؛ ساختِ سفارشِ دوباره برای یک درخواست مجاز نیست.',
          details: { request_id: dto.request_id, sales_order_id: existingOrderId },
        });
      }
    }
    const pricing = await this.repo.getCustomerPricing(companyId, dto.customer_id);
    if (!pricing) throw badRequest('customer_not_found', 'مشتری انتخاب‌شده در این شرکت یافت نشد.');
    await this.validateReferences(companyId, dto);

    // TASK-24F: مسیرِ یگانه — هر سفارش از موتورِ قیمت با کنترل‌های سرور-محور عبور می‌کند.
    const priced = await this.quoteViaEngine(companyId, dto, actorUserId, permissions);
    const { lines, totals } = this.mapEngineQuote(priced.quote);

    // ارزیابی واقعی موتور قوانین (before_save) روی زمینهٔ سفارش
    await this.evaluateOrderRules(companyId, dto, lines, totals);
    // بررسی سقف اعتبار و کفایت موجودی هنگام ثبت سفارش
    await this.enforceCreditLimit(companyId, dto.customer_id, Number(totals.grand_total));
    await this.enforceStock(companyId, lines);

    const fiscalYear = persianYear();
    // شماره سند از document_series/number_counter شعبه (به‌جای SO-<uuid8>)
    const { doc_number } = await this.docNumbers.next(pricing.branch_id, 'sales_order', {
      fiscalYear,
    });
    let id: string;
    try {
      id = await this.repo.insert(companyId, dto, {
        branchId: pricing.branch_id,
        fiscalYear,
        docNumber: doc_number,
        totals,
        lines,
      });
    } catch (err) {
      throw this.mapOrderError(err);
    }
    // مصرفِ تشویق‌ها idempotent است: تکرارِ همان کلید ردیفِ تکراری نمی‌سازد.
    await this.pricing.commitUsage(companyId, {
      actor_user_id: actorUserId,
      entity_type: 'order',
      entity_id: id,
      customer_id: dto.customer_id,
      idempotency_key: dto.pricing_idempotency_key ?? `order:${id}`,
      quote: priced.quote,
    });
    // ممیزیِ قیمتِ دستی/عبور از سقف — با actor، قیمتِ سیستمی، دلیل و سیاستِ مؤثر
    await this.auditPriceOverrides(companyId, id, dto, priced, actorUserId);
    return this.get(companyId, id);
  }

  /**
   * TASK-24F · HIGH-1/HIGH-2/HIGH-3 — قیمت‌گذاریِ اجباریِ سفارش.
   *
   * کنترل‌ها همه از سرویس/سیاستِ پایدار/مجوزهای نشست می‌آیند:
   *   • قیمتِ دستی بدونِ `pricing.manual_price.apply` ⇒ 403
   *   • تخفیفِ فراتر از سقف بدونِ `pricing.discount.override` ⇒ 403
   *   • لیستِ قیمتِ قلمرویِ دیگر بدونِ مجوز/دلیل ⇒ 403/400
   *   • تاریخِ گذشته بدونِ `pricing.backdate.apply` + دلیل ⇒ 403/400
   *   • نقضِ کفِ سود یا فروشِ زیرِ بهای تمام‌شده ⇒ 409
   */
  private async quoteViaEngine(
    companyId: string,
    dto: CreateOrderDto,
    actorUserId: string | null,
    permissions: OrderPricingPermissions,
  ): Promise<OrderQuoteResult> {
    const priced = await this.pricing.quoteForOrder(
      companyId,
      {
        customer_id: dto.customer_id,
        order_date: dto.order_date,
        price_list_id: dto.price_list_id ?? null,
        coupon_codes: dto.coupon_codes ?? [],
        idempotency_key: dto.pricing_idempotency_key ?? null,
        override_reason: dto.price_override_reason ?? null,
        lines: (dto.lines ?? []).map((l) => ({
          product_id: l.product_id,
          packaging_id: l.packaging_id ?? null,
          qty: l.qty,
          unit_price: l.unit_price ?? null,
          discount_amount: l.discount_amount ?? null,
        })),
      },
      permissions,
      actorUserId,
    );
    if (priced.quote.margin_violations.length > 0) {
      const first = priced.quote.margin_violations[0];
      throw new ConflictException({
        code: first.code === 'margin_loss_making' ? 'margin_loss_making' : 'margin_floor_violation',
        message_fa: first.message_fa,
        details: { violations: priced.quote.margin_violations },
      });
    }
    return priced;
  }

  /**
   * TASK-24F · HIGH-3 — دفترِ تغییرِ قیمت: actor، action، قیمتِ سیستمی، قیمتِ درخواستی،
   * دلیل، سیاستِ مؤثر و مقادیرِ نهایی. برای هر قلمِ دارای قیمتِ دستی یا تخفیفِ بیش از سقف.
   */
  private async auditPriceOverrides(
    companyId: string,
    orderId: string,
    dto: CreateOrderDto,
    priced: OrderQuoteResult,
    actorUserId: string | null,
    action: 'create' | 'update' = 'create',
  ): Promise<void> {
    const reason = (dto.price_override_reason ?? '').trim() || null;
    const dtoLines = dto.lines ?? [];
    for (const [idx, line] of priced.quote.lines.entries()) {
      const input = dtoLines[idx];
      const manual = input?.unit_price != null;
      const capped = Boolean(input?.discount_amount) && priced.quote.warnings.some((w) => w.startsWith(`قلم ${line.line_no}:`));
      if (!manual && !capped) continue;
      await this.pricing.logPriceChange({
        companyId,
        actorUserId,
        entityType: 'sales_order_line',
        entityId: orderId,
        action: manual ? `manual_price_${action}` : `discount_override_${action}`,
        before: {
          system_unit_price: manual ? (priced.system_unit_prices[idx] ?? null) : line.unit_price,
          max_discount_pct: line.pricing.max_discount_pct,
          line_no: line.line_no,
          product_id: line.product_id,
        },
        after: {
          unit_price: line.unit_price,
          discount_amount: line.discount_total,
          discount_pct: line.manual_discount_pct,
          reason,
          order_date: dto.order_date,
          pricing_date: priced.pricing_date,
          backdated: priced.backdated,
          policy: {
            max_total_discount_pct: priced.settings.max_total_discount_pct,
            max_line_discount_pct: priced.settings.max_line_discount_pct,
            allow_loss_making_sales: priced.settings.allow_loss_making_sales,
            apply_promotions_on_orders: priced.settings.apply_promotions_on_orders,
          },
          actor_user_id: actorUserId,
        },
      });
    }
  }

  /** نگاشتِ خروجیِ موتور به ساختارِ خطوط/جمع‌های سفارش (بدونِ تغییرِ قراردادِ API) */
  private mapEngineQuote(quote: QuoteResult): { lines: OrderLineValues[]; totals: ComputedTotals } {
    const lines: OrderLineValues[] = quote.lines.map((l) => ({
      line_no: l.line_no,
      product_id: l.product_id,
      packaging_id: l.packaging_id,
      qty: l.qty,
      qty_base: l.qty_base,
      unit_price: l.unit_price,
      discount_amount: l.discount_total,
      tax_rate_pct: l.tax_rate_pct,
      tax_amount: l.tax_amount,
    }));
    return {
      lines,
      totals: {
        subtotal: quote.subtotal,
        discount_total: quote.discount_total,
        tax_total: quote.tax_total,
        grand_total: quote.grand_total,
      },
    };
  }

  /**
   * ارزیابی واقعی قواعد sales_order/before_save با موتور قوانین.
   * زمینه شامل جمع‌ها، بیشترین درصد تخفیف قلم و تعداد اقلام است تا شروط عددی
   * (مثل discount_pct > X یا grand_total > Y) واقعاً ارزیابی شوند.
   * - block → 400 rule_blocked با پیام فارسی قاعده
   * - require_approval → 409 (سفارش باید به صف تأیید برود)
   * - warn/notify → در پاسخ لاگ می‌شود ولی جریان را متوقف نمی‌کند
   */
  async evaluateOrderRules(
    companyId: string,
    dto: CreateOrderDto,
    lines: OrderLineValues[],
    totals: ComputedTotals,
  ): Promise<RuleEvaluation> {
    const subtotal = Number(totals.subtotal);
    const maxDiscountPct = lines.reduce((max, l) => {
      const gross = l.qty * Number(l.unit_price);
      const pct = gross > 0 ? (Number(l.discount_amount) / gross) * 100 : 0;
      return Math.max(max, pct);
    }, 0);
    const context: RuleContext = {
      customer_id: dto.customer_id,
      channel: dto.channel ?? 'field',
      line_count: lines.length,
      subtotal,
      discount_total: Number(totals.discount_total),
      tax_total: Number(totals.tax_total),
      grand_total: Number(totals.grand_total),
      discount_pct: Math.round(maxDiscountPct * 100) / 100,
    };
    const evaluation = await this.rules.evaluate(companyId, 'sales_order', 'before_save', context);
    if (evaluation.blocked) {
      throw badRequest('rule_blocked', evaluation.blocked.message_fa);
    }
    if (evaluation.requireApproval) {
      throw new ConflictException({
        code: 'require_approval',
        message_fa: evaluation.requireApproval.message_fa,
      });
    }
    return evaluation;
  }

  /**
   * بررسی سقف اعتبار: فقط وقتی customer_credit با credit_limit>0 پیکربندی شده باشد.
   * اگر مبلغ سفارش از اعتبار در دسترس بیشتر شود → 409 credit_limit_exceeded
   * (نیازمند تأیید اعتبار با مجوز ar.credit.approve).
   */
  private async enforceCreditLimit(
    companyId: string,
    customerId: string,
    orderTotal: number,
  ): Promise<void> {
    const exposure = await this.repo.customerExposure(companyId, customerId);
    // نبودِ ردیف یا credit_limit=0 → سقف اعتباری پیکربندی نشده؛ سخت‌گیری نمی‌کنیم
    if (!exposure || exposure.credit_limit <= 0) return;
    if (orderTotal > exposure.available_credit) {
      throw new ConflictException({
        code: 'credit_limit_exceeded',
        message_fa: 'مبلغ سفارش از اعتبار در دسترس مشتری بیشتر است؛ نیازمند تأیید اعتبار است.',
        details: {
          order_total: money(orderTotal),
          available_credit: money(exposure.available_credit),
          credit_limit: money(exposure.credit_limit),
          total_due: money(exposure.total_due),
        },
      });
    }
  }

  /**
   * بررسی کفایت موجودی: فقط برای کالاهایی که در stock_balance ردیف دارند
   * (کالای بدون ردیف = موجودی‌اش ردیابی نمی‌شود → مسدود نمی‌کنیم).
   * موجودی در دسترس = qty_on_hand − qty_reserved در همه انبارهای شرکت.
   * کمبود → 409 insufficient_stock با فهرست کالاهای کوتاه.
   */
  private async enforceStock(companyId: string, lines: OrderLineValues[]): Promise<void> {
    if (lines.length === 0) return;
    const available = await this.repo.availableStock(
      companyId,
      lines.map((l) => l.product_id),
    );
    if (available.size === 0) return;
    // جمع نیاز هر کالا به واحد پایه (چند قلم برای یک کالا ممکن است)
    const needed = new Map<string, number>();
    for (const l of lines) {
      needed.set(l.product_id, (needed.get(l.product_id) ?? 0) + l.qty_base);
    }
    const shortages: { product_id: string; requested: number; available: number }[] = [];
    for (const [productId, qty] of needed) {
      if (!available.has(productId)) continue; // ردیابی نمی‌شود
      const avail = available.get(productId) ?? 0;
      if (qty > avail) shortages.push({ product_id: productId, requested: qty, available: avail });
    }
    if (shortages.length > 0) {
      throw new ConflictException({
        code: 'insufficient_stock',
        message_fa: 'موجودی کافی برای برخی کالاها در دسترس نیست.',
        details: { shortages },
      });
    }
  }

  async update(
    companyId: string,
    id: string,
    dto: UpdateOrderDto,
    actorUserId: string | null = null,
    permissions: OrderPricingPermissions = DENY_ALL_PRICING,
  ): Promise<OrderView> {
    this.assertId(id);
    const existing = await this.repo.findById(companyId, id);
    if (!existing) throw notFound();
    if (existing.status !== 'draft') {
      throw new ConflictException({
        code: 'not_editable',
        message_fa: 'سفارش پس از خروج از وضعیت پیش‌نویس قابل ویرایش نیست.',
      });
    }

    const customerId = dto.customer_id ?? existing.customer_id;
    const pricing = await this.repo.getCustomerPricing(companyId, customerId);
    if (!pricing) throw badRequest('customer_not_found', 'مشتری انتخاب‌شده در این شرکت یافت نشد.');
    await this.validateReferences(companyId, dto);

    let lines: OrderLineValues[] = [];
    let totals: ComputedTotals;
    let priced: OrderQuoteResult | null = null;
    if (dto.lines) {
      // TASK-24F: ویرایشِ اقلام هم از همان مسیرِ کنترل‌شدهٔ قیمت‌گذاری می‌گذرد
      const effective = {
        ...dto,
        customer_id: customerId,
        order_date: (dto.order_date ?? String(existing.order_date ?? '')).slice(0, 10),
      } as CreateOrderDto;
      priced = await this.quoteViaEngine(companyId, effective, actorUserId, permissions);
      const computed = this.mapEngineQuote(priced.quote);
      lines = computed.lines;
      totals = computed.totals;
      // اقلام تغییر کرده‌اند → ارزیابی قاعده و بررسی اعتبار/موجودی دوباره انجام می‌شود
      await this.evaluateOrderRules(companyId, effective, lines, totals);
      await this.enforceCreditLimit(companyId, customerId, Number(totals.grand_total));
      await this.enforceStock(companyId, lines);
    } else {
      totals = {
        subtotal: existing.subtotal,
        discount_total: existing.discount_total,
        tax_total: existing.tax_total,
        grand_total: existing.grand_total,
      };
    }

    try {
      const updated = await this.repo.update(companyId, id, dto, { totals, lines });
      if (!updated) {
        // سطر پیش‌تر یافت شده؛ نبودِ نتیجهٔ UPDATE یعنی مغایرت نسخه یا خروج از draft
        if (dto.row_version !== undefined) {
          throw new ConflictException({
            code: 'version_conflict',
            message_fa: 'سفارش هم‌زمان توسط کاربر دیگری تغییر کرده است؛ دوباره بارگیری کنید.',
          });
        }
        throw new ConflictException({
          code: 'not_editable',
          message_fa: 'سفارش پس از خروج از وضعیت پیش‌نویس قابل ویرایش نیست.',
        });
      }
    } catch (err) {
      if (err instanceof ConflictException) throw err;
      throw this.mapOrderError(err);
    }
    if (priced && dto.lines) {
      await this.auditPriceOverrides(
        companyId,
        id,
        {
          ...(dto as unknown as CreateOrderDto),
          customer_id: customerId,
          order_date: (dto.order_date ?? String(existing.order_date ?? '')).slice(0, 10),
        },
        priced,
        actorUserId,
        'update',
      );
    }
    return this.get(companyId, id);
  }

  async approve(companyId: string, id: string): Promise<OrderView> {
    this.assertId(id);
    const existing = await this.repo.findById(companyId, id);
    if (!existing) throw notFound();
    const approved = await this.repo.approve(companyId, id);
    if (!approved) {
      throw new ConflictException({
        code: 'not_approvable',
        message_fa: 'فقط سفارش پیش‌نویس یا در انتظار تأیید قابل تأیید است.',
      });
    }
    return this.get(companyId, id);
  }

  private async validateReferences(companyId: string, dto: CreateOrderDto | UpdateOrderDto): Promise<void> {
    // D5 (مصوبهٔ مالک): SKU بسته تا P5 نباید قابلِ سفارش/فروش باشد
    const lineProductIds = (dto.lines ?? []).map((l) => l.product_id).filter(Boolean);
    const bundles = await this.repo.findBundleProductIds(lineProductIds);
    if (bundles.length > 0) {
      throw badRequest(
        'bundle_not_orderable',
        'سفارش روی محصولِ «بسته» تا پیاده‌سازیِ کاملِ semantics عملیاتی در P5 مجاز نیست (مصوبهٔ D5).',
      );
    }
    if ((dto as any).request_id && !(await this.repo.requestExists(companyId, (dto as any).request_id))) {
      throw badRequest('request_not_found', 'درخواست انتخاب‌شده یافت نشد.');
    }
    if ((dto as any).salesperson_id && !(await this.repo.staffExists(companyId, (dto as any).salesperson_id))) {
      throw badRequest('salesperson_not_found', 'فروشندهٔ انتخاب‌شده یافت نشد.');
    }
    if (dto.price_list_id && !(await this.repo.priceListExists(companyId, dto.price_list_id))) {
      throw badRequest('price_list_not_found', 'لیست قیمت انتخاب‌شده یافت نشد.');
    }
    if ((dto as any).settlement_term_id && !(await this.repo.settlementTermExists(companyId, (dto as any).settlement_term_id))) {
      throw badRequest('settlement_term_not_found', 'شرایط تسویهٔ انتخاب‌شده یافت نشد.');
    }
  }

  // TASK-24F · HIGH-1: مسیرِ قدیمیِ محاسبهٔ قیمت (`computeLines`) حذف شد؛ هیچ سفارشی
  // بدونِ کنترلِ کفِ سود/سقفِ تخفیف/مجوزِ قیمتِ دستی ثبت نمی‌شود.

  private mapOrderError(err: unknown): Error {
    const e = err as { code?: string; constraint?: string };
    if (e?.code === '23505' && e.constraint === 'uq_sales_order_client') {
      return new ConflictException({
        code: 'duplicate_client',
        message_fa: 'سفارشی با این کلید همگام‌سازی قبلاً ثبت شده است.',
      });
    }
    if (e?.code === '23505' && e.constraint === 'uq_sales_order_doc') {
      return new ConflictException({
        code: 'duplicate_doc',
        message_fa: 'سند با این شماره در شعبه و سال مالی قبلاً ثبت شده است.',
      });
    }
    if (e?.code === '23503') {
      return badRequest('reference_invalid', 'یکی از ارجاع‌های ارسال‌شده معتبر نیست.');
    }
    if (e?.code === '23514') {
      return badRequest('check_violation', 'مقدار ارسال‌شده برای یکی از فیلدها مجاز نیست.');
    }
    return badRequest('order_save_failed', 'خطای غیرمنتظره در ذخیره سفارش.');
  }
}
