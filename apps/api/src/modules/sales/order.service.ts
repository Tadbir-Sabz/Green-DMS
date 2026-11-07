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
import type { PricingEngineService } from '../pricing/pricing-engine.service';
import type { QuoteResult } from '../pricing/pricing-engine';

const badRequest = (code: string, message_fa: string): BadRequestException =>
  new BadRequestException({ code, message_fa });

const notFound = (): NotFoundException =>
  new NotFoundException({ code: 'not_found', message_fa: 'سفارش یافت نشد' });

// منبعِ واحدِ گرد‌کردنِ مالی (TASK-24) — رفتارِ پیشین عیناً حفظ شده است
import { lineTax as computeLineTax, money } from '../../common/financial';

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
     * موتورِ قیمت (TASK-24) — فقط وقتی سند پرچمِ apply_pricing_engine را دارد.
     * پیش‌فرض خاموش است تا رفتارِ مالیِ موجود بی‌تغییر بماند (بازگشت‌پذیر و صریح).
     */
    @Inject(PRICING_ENGINE_SERVICE) private readonly pricing: PricingEngineService,
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

  async create(companyId: string, dto: CreateOrderDto, actorUserId: string | null = null): Promise<OrderView> {
    const pricing = await this.repo.getCustomerPricing(companyId, dto.customer_id);
    if (!pricing) throw badRequest('customer_not_found', 'مشتری انتخاب‌شده در این شرکت یافت نشد.');
    await this.validateReferences(companyId, dto);
    // ابتدا اقلام/جمع‌ها محاسبه می‌شود تا زمینهٔ ارزیابی قاعده و بررسی اعتبار/موجودی
    // مقادیر واقعی (subtotal/discount/grand_total) را داشته باشد.
    const engineQuote = dto.apply_pricing_engine ? await this.quoteViaEngine(companyId, dto) : null;
    const { lines, totals } = engineQuote
      ? this.mapEngineQuote(engineQuote)
      : await this.computeLines(companyId, dto, pricing.price_list_id);

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
    if (engineQuote) {
      // مصرفِ تشویق‌ها idempotent است: تکرارِ همان کلید ردیفِ تکراری نمی‌سازد.
      await this.pricing.commitUsage(companyId, {
        actor_user_id: actorUserId,
        entity_type: 'order',
        entity_id: id,
        customer_id: dto.customer_id,
        idempotency_key: dto.pricing_idempotency_key ?? `order:${id}`,
        quote: engineQuote,
      });
    }
    return this.get(companyId, id);
  }

  /**
   * قیمت‌گذاری از طریقِ موتورِ جدید (TASK-24) — فقط با پرچمِ صریحِ سند.
   * نقضِ کفِ سود ⇒ 409 با دلیلِ صریح (نیازمندِ استثنای تأییدشده).
   */
  private async quoteViaEngine(companyId: string, dto: CreateOrderDto): Promise<QuoteResult> {
    const quote = await this.pricing.quote(companyId, {
      customer_id: dto.customer_id,
      pricing_date: dto.order_date,
      price_list_id: dto.price_list_id ?? null,
      coupon_codes: dto.coupon_codes ?? [],
      idempotency_key: dto.pricing_idempotency_key ?? null,
      apply_promotions: true,
      // قیمتِ دستی همان رفتارِ پیشینِ سفارش است (unit_price روی قلم)؛ سقفِ تخفیف/کفِ سود
      // همچنان اعمال می‌شود و لازم نیست کاربر مجوزِ اضافی داشته باشد.
      allow_manual_price: true,
      lines: (dto.lines ?? []).map((l) => ({
        product_id: l.product_id,
        packaging_id: l.packaging_id ?? null,
        qty: l.qty,
        unit_price: l.unit_price ?? null,
        discount_amount: l.discount_amount ?? null,
      })),
    });
    if (quote.margin_violations.length > 0) {
      throw new ConflictException({
        code: 'margin_floor_violation',
        message_fa: quote.margin_violations[0].message_fa,
        details: { violations: quote.margin_violations },
      });
    }
    return quote;
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

  async update(companyId: string, id: string, dto: UpdateOrderDto, actorUserId: string | null = null): Promise<OrderView> {
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
    if (dto.lines) {
      const effective = { ...dto, customer_id: customerId } as CreateOrderDto;
      const engineQuote = effective.apply_pricing_engine ? await this.quoteViaEngine(companyId, effective) : null;
      const computed = engineQuote
        ? this.mapEngineQuote(engineQuote)
        : await this.computeLines(companyId, effective, dto.price_list_id ?? pricing.price_list_id);
      lines = computed.lines;
      totals = computed.totals;
      // اقلام تغییر کرده‌اند → ارزیابی قاعده و بررسی اعتبار/موجودی دوباره انجام می‌شود
      await this.evaluateOrderRules(
        companyId,
        { ...dto, customer_id: customerId } as CreateOrderDto,
        lines,
        totals,
      );
      await this.enforceCreditLimit(companyId, customerId, Number(totals.grand_total));
      await this.enforceStock(companyId, lines);
      void actorUserId;
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

  private async computeLines(
    companyId: string,
    dto: CreateOrderDto,
    priceListFallback: string | null,
  ): Promise<{ lines: OrderLineValues[]; totals: ComputedTotals }> {
    const lines: OrderLineValues[] = [];
    let subtotal = 0;
    let discountTotal = 0;
    let taxTotal = 0;
    let lineNo = 1;

    const dtoLines = dto.lines ?? [];
    const priceListId = dto.price_list_id ?? priceListFallback;
    // یک‌بار حل دسته‌ای همه ورودی‌ها (به‌جای ۲–۳ کوئری به‌ازای هر خط)
    const { existingProducts, packagingFactors, prices, taxRates, vatEnabled } =
      await this.repo.resolveLineInputs(
        companyId,
        priceListId,
        dtoLines.map((l) => l.product_id),
        dtoLines
          .filter((l) => l.packaging_id)
          .map((l) => [l.product_id, l.packaging_id as string] as const),
      );

    for (const line of dtoLines) {
      if (!existingProducts.has(line.product_id)) {
        throw badRequest('product_not_found', 'یکی از کالاهای انتخاب‌شده در این شرکت یافت نشد.');
      }
      let qtyBase = line.qty;
      if (line.packaging_id) {
        const factor = packagingFactors.get(`${line.product_id}\u0000${line.packaging_id}`);
        if (factor == null) {
          throw badRequest('packaging_not_found', 'بسته‌بندی انتخاب‌شده برای این کالا یافت نشد.');
        }
        qtyBase = line.qty * Number(factor);
      }

      let unitPrice: string;
      if (line.unit_price != null) {
        unitPrice = line.unit_price;
      } else {
        const priced = priceListId ? (prices.get(line.product_id) ?? null) : null;
        if (priced == null) {
          if (priceListId) {
            throw badRequest('price_missing', 'برای این کالا قیمت فعالی در لیست قیمت یافت نشد.');
          }
          unitPrice = '0';
        } else {
          unitPrice = priced;
        }
      }

      const discount = line.discount_amount ?? '0';
      if (Number(discount) < 0) {
        throw badRequest('invalid_discount', 'مبلغ تخفیف نمی‌تواند منفی باشد.');
      }
      // مالیات بر مبنای نرخ tax_code کالا، پس از کسر تخفیف، و فقط اگر vat شرکت فعال باشد
      const taxRate = vatEnabled ? (taxRates.get(line.product_id) ?? 0) : 0;
      const lineGross = line.qty * Number(unitPrice) - Number(discount);
      const lineTax = computeLineTax(lineGross, taxRate);
      subtotal += line.qty * Number(unitPrice);
      discountTotal += Number(discount);
      taxTotal += lineTax;
      lines.push({
        line_no: lineNo,
        product_id: line.product_id,
        packaging_id: line.packaging_id ?? null,
        qty: line.qty,
        qty_base: qtyBase,
        unit_price: unitPrice,
        discount_amount: discount,
        tax_rate_pct: taxRate,
        tax_amount: money(lineTax),
      });
      lineNo += 1;
    }

    const totals: ComputedTotals = {
      subtotal: money(subtotal),
      discount_total: money(discountTotal),
      tax_total: money(taxTotal),
      grand_total: money(subtotal - discountTotal + taxTotal),
    };
    return { lines, totals };
  }

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
