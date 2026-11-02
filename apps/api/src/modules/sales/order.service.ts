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

const badRequest = (code: string, message_fa: string): BadRequestException =>
  new BadRequestException({ code, message_fa });

const notFound = (): NotFoundException =>
  new NotFoundException({ code: 'not_found', message_fa: 'سفارش یافت نشد' });

const persianYear = (): number => {
  const parts = new Intl.DateTimeFormat('en-u-ca-persian', {
    year: 'numeric',
    timeZone: 'Asia/Tehran',
  }).formatToParts(new Date());
  return Number(parts.find((p) => p.type === 'year')?.value);
};

const money = (n: number): string => (Math.round(n * 100) / 100).toFixed(2);

export interface OrderView extends OrderRow {
  lines?: { product_id: string; packaging_id: string | null; qty: number; unit_price: string | null; discount_amount: string | null }[];
}

interface OrderLineValues {
  line_no: number;
  product_id: string;
  packaging_id: string | null;
  qty: number;
  qty_base: number;
  unit_price: string;
  discount_amount: string;
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

  async create(companyId: string, dto: CreateOrderDto): Promise<OrderView> {
    const pricing = await this.repo.getCustomerPricing(companyId, dto.customer_id);
    if (!pricing) throw badRequest('customer_not_found', 'مشتری انتخاب‌شده در این شرکت یافت نشد.');
    await this.validateReferences(companyId, dto);
    await this.evaluateOrderRules(companyId, dto);
    const { lines, totals } = await this.computeLines(companyId, dto, pricing.price_list_id);
    let id: string;
    try {
      id = await this.repo.insert(companyId, dto, {
        branchId: pricing.branch_id,
        fiscalYear: persianYear(),
        totals,
        lines,
      });
    } catch (err) {
      throw this.mapOrderError(err);
    }
    return this.get(companyId, id);
  }

  async evaluateOrderRules(companyId: string, dto: CreateOrderDto): Promise<void> {
    const rules = await this.rules.listRules(companyId);
    const applicable = (rules as any[]).filter(
      (r: any) => r.entity === 'sales_order' && r.event === 'before_save' && r.status === 'active',
    );
    for (const rule of applicable) {
      if (rule.effect === 'block') {
        throw badRequest('rule_blocked', rule.message_fa);
      }
      if (rule.effect === 'require_approval') {
        throw new ConflictException({
          code: 'require_approval',
          message_fa: rule.message_fa,
        });
      }
    }
  }

  async update(companyId: string, id: string, dto: UpdateOrderDto): Promise<OrderView> {
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
      const computed = await this.computeLines(
        companyId,
        { ...dto, customer_id: customerId } as CreateOrderDto,
        dto.price_list_id ?? pricing.price_list_id,
      );
      lines = computed.lines;
      totals = computed.totals;
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
    let lineNo = 1;

    for (const line of dto.lines ?? []) {
      if (!(await this.repo.productExists(companyId, line.product_id))) {
        throw badRequest('product_not_found', 'یکی از کالاهای انتخاب‌شده در این شرکت یافت نشد.');
      }
      let qtyBase = line.qty;
      if (line.packaging_id) {
        const factor = await this.repo.packagingFactor(line.product_id, line.packaging_id);
        if (factor == null) {
          throw badRequest('packaging_not_found', 'بسته‌بندی انتخاب‌شده برای این کالا یافت نشد.');
        }
        qtyBase = line.qty * Number(factor);
      }

      let unitPrice: string;
      if (line.unit_price != null) {
        unitPrice = line.unit_price;
      } else {
        const priceListId = dto.price_list_id ?? priceListFallback;
        const priced = priceListId
          ? await this.repo.priceListPrice(priceListId, line.product_id)
          : null;
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
      subtotal += line.qty * Number(unitPrice);
      discountTotal += Number(discount);
      lines.push({
        line_no: lineNo,
        product_id: line.product_id,
        packaging_id: line.packaging_id ?? null,
        qty: line.qty,
        qty_base: qtyBase,
        unit_price: unitPrice,
        discount_amount: discount,
      });
      lineNo += 1;
    }

    const tax = 0;
    const totals: ComputedTotals = {
      subtotal: money(subtotal),
      discount_total: money(discountTotal),
      tax_total: money(tax),
      grand_total: money(subtotal - discountTotal + tax),
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
