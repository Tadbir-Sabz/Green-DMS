import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { isUUID } from 'class-validator';
import type { OrderService, OrderView } from './order.service';
import { ORDER_SERVICE } from './tokens';
import type { CreateOrderDto } from './order.dto';
import type { CreateInvoiceDto, ListInvoicesQueryDto } from './invoice.dto';
import type { ConvertRequestDto, CreateRequestDto, ListRequestsQueryDto, UpdateRequestDto } from './request.dto';
import type { ListDeliveriesQueryDto, UpdateDeliveryDto } from './delivery.dto';
import type {
  DeliveryRow,
  InvoiceLineView,
  InvoiceRow,
  RequestLineView,
  RequestRow,
  SalesChainRepository,
} from './sales-chain.repository';
import {
  DELIVERY_REPOSITORY,
  INVOICE_REPOSITORY,
  REQUEST_REPOSITORY,
} from './tokens';
import { PRICING_ENGINE_SERVICE } from '../pricing/pricing.tokens';
import type { PricingEngineService, OrderPricingPermissions } from '../pricing/pricing-engine.service';
import { pricingContextUnavailable } from '../pricing/pricing-permissions';

const badRequest = (code: string, message_fa: string): BadRequestException =>
  new BadRequestException({ code, message_fa });

const conflict = (code: string, message_fa: string): ConflictException =>
  new ConflictException({ code, message_fa });

/**
 * سرویس زنجیرهٔ فروش (ماژول ۴): درخواست مشتری، فاکتور و تحویل.
 * - درخواست: ثبت آفلاین‌امن با client_uuid و تبدیل به سفارش فروش.
 * - فاکتور: صدور با شمارهٔ سند و ثبت بدهکاری مشتری در دفتر کل.
 * - تحویل: ثبت وضعیت و POD (امضا/عکس/گیرنده).
 */

// ============ Requests ============

export interface RequestView extends RequestRow {
  lines?: RequestLineView[];
}

@Injectable()
export class RequestService {
  constructor(
    @Inject(REQUEST_REPOSITORY) private readonly repo: SalesChainRepository,
    @Inject(ORDER_SERVICE) private readonly orders: OrderService,
    /** TASK-24W: ممیزیِ منبعِ تبدیل در همان دفترِ تغییرِ قیمت */
    @Inject(PRICING_ENGINE_SERVICE) private readonly pricing: PricingEngineService,
  ) {}

  private assertId(id: string): void {
    if (!isUUID(id, '4')) throw badRequest('invalid_id', 'شناسهٔ درخواست معتبر نیست.');
  }

  async list(companyId: string, query: ListRequestsQueryDto): Promise<Page<RequestRow>> {
    const { items, nextCursor, hasMore } = await this.repo.listRequests(companyId, query);
    return { items, next_cursor: nextCursor, has_more: hasMore };
  }

  async get(companyId: string, id: string): Promise<RequestView> {
    this.assertId(id);
    const row = await this.repo.findRequest(companyId, id);
    if (!row) throw new NotFoundException({ code: 'not_found', message_fa: 'درخواست یافت نشد' });
    const lines = await this.repo.findRequestLines(id);
    return { ...row, lines };
  }

  async create(companyId: string, dto: CreateRequestDto, userId: string): Promise<RequestView> {
    if (dto.client_uuid) {
      const existing = await this.repo.requestClientUuidExists(dto.client_uuid);
      if (existing) {
        throw conflict('duplicate_client', 'درخواستی با این شناسهٔ کلاینت پیش‌تر ثبت شده است.');
      }
    }
    const branchId = await this.repo.customerBranch(companyId, dto.customer_id);
    if (!branchId) throw badRequest('customer_not_found', 'مشتری انتخاب‌شده در این شرکت یافت نشد.');
    let id: string;
    try {
      id = await this.repo.insertRequest(dto, branchId, userId);
    } catch (err) {
      throw this.mapError(err);
    }
    return this.get(companyId, id);
  }

  async update(companyId: string, id: string, dto: UpdateRequestDto): Promise<RequestView> {
    this.assertId(id);
    const existing = await this.repo.findRequest(companyId, id);
    if (!existing) throw new NotFoundException({ code: 'not_found', message_fa: 'درخواست یافت نشد' });
    if (existing.status === 'converted') {
      throw conflict('already_converted', 'درخواست تبدیل‌شده قابل ویرایش نیست.');
    }
    try {
      await this.repo.updateRequest(companyId, id, dto);
    } catch (err) {
      throw this.mapError(err);
    }
    return this.get(companyId, id);
  }

  /**
   * TASK-24W · HIGH-1-R1 — تبدیلِ درخواست به سفارش با زمینهٔ کاملِ احراز هویت.
   *
   * پیش از این دور، `convert()` سفارش را با `orders.create(companyId, dto)` می‌ساخت؛
   * یعنی **بدونِ actor، بدونِ مجوز و بدونِ دلیل**. پیامدش این بود که هر درخواستِ
   * دارایِ `requested_price` (حتی برابر با قیمتِ سیستمی) با
   * `403 manual_price_not_authorized` رد می‌شد و رکوردِ ممیزی هم actor نداشت.
   *
   * رفتارِ فعلی (همه سرور-محور):
   *   ۱) actor از نشست می‌آید (`actorUserId`)، نه از بدنه؛ نبودش ⇒ fail-closed.
   *   ۲) مجوزها از `pricingPermissionsFromSession` می‌آیند؛ بدنهٔ درخواست هرگز.
   *   ۳) اگر قلمی `requested_price` دارد ⇒ `pricing.manual_price.apply` الزامی است.
   *   ۴) واگراییِ قیمتِ درخواستی از قیمتِ سیستمی (یا عبور از سقفِ تخفیف) ⇒ دلیلِ
   *      معنادار الزامی است (همان قاعدهٔ `POST /orders`، بدونِ مسیرِ جایگزین).
   *   ۵) سفارش از همان `orders.create` با همان کنترل‌های کفِ سود/سقف/قواعد/
   *      اعتبار/موجودی ساخته می‌شود (بدونِ تکرارِ منطق).
   *   ۶) دفترِ تغییرِ قیمت علاوه بر ردیف‌های سفارش، یک ردیفِ «منبعِ تبدیل» با
   *      `request_id`/`order_id`/actor/قیمتِ سیستمی/قیمتِ درخواستی/دلیل ثبت می‌کند.
   *   ۷) تبدیل اتمیک است: اگر در همین لحظه کسِ دیگری تبدیل کرده باشد، سفارشِ
   *      ساخته‌شده لغو نمی‌شود ولی درخواست «converted» نمی‌شود و خطای ۴۰۹ برمی‌گردد
   *      (بدونِ رکوردِ ممیزیِ تکراری برای تبدیلِ دوم).
   */
  async convert(
    companyId: string,
    id: string,
    actorUserId: string | null,
    permissions: OrderPricingPermissions,
    dto: ConvertRequestDto = {},
  ): Promise<OrderView> {
    this.assertId(id);
    if (!actorUserId) throw pricingContextUnavailable();
    // TASK-24W: تبدیلِ هم‌زمانِ یک درخواست سریال می‌شود؛ بازنده پیش از ساختِ
    // سفارش، وضعیتِ «converted» را می‌بیند ⇒ هیچ سفارشِ یتیمی ساخته نمی‌شود.
    return this.repo.withRequestConversionLock(id, () =>
      this.convertLocked(companyId, id, actorUserId, permissions, dto),
    );
  }

  private async convertLocked(
    companyId: string,
    id: string,
    actorUserId: string,
    permissions: OrderPricingPermissions,
    dto: ConvertRequestDto,
  ): Promise<OrderView> {
    const req = await this.repo.findRequest(companyId, id);
    if (!req) throw new NotFoundException({ code: 'not_found', message_fa: 'درخواست یافت نشد' });
    if (req.status === 'converted') {
      throw conflict('already_converted', 'این درخواست پیش‌تر به سفارش تبدیل شده است.');
    }
    if (req.status !== 'submitted') {
      throw badRequest('not_submitted', 'فقط درخواست ثبت‌شده (submitted) قابل تبدیل است.');
    }
    const lines = await this.repo.findRequestLines(id);
    if (lines.length === 0) {
      throw badRequest('no_lines', 'درخواست بدون قلم کالا قابل تبدیل به سفارش نیست.');
    }

    // ۳) قیمتِ دستی همیشه نیازمندِ مجوزِ سرور-محور است
    const hasRequestedPrice = lines.some((l) => l.requested_price != null);
    if (hasRequestedPrice && !permissions.manual_price) {
      throw new ForbiddenException({
        code: 'manual_price_not_authorized',
        message_fa:
          'این درخواست قیمتِ درخواستیِ مشتری دارد؛ تبدیلِ آن نیازمندِ مجوزِ pricing.manual_price.apply است.',
        details: {
          request_id: id,
          lines_with_requested_price: lines.filter((l) => l.requested_price != null).length,
        },
      });
    }

    const reason = (dto.price_override_reason ?? '').trim() || null;
    const orderDto: CreateOrderDto = {
      customer_id: req.customer_id,
      order_date: new Date().toISOString().slice(0, 10),
      request_id: req.id,
      tour_id: req.tour_id ?? null,
      channel: req.channel,
      delivery_date: req.requested_delivery_date ?? null,
      note: dto.note ?? req.note ?? undefined,
      price_override_reason: reason ?? undefined,
      lines: lines.map((l) => ({
        product_id: l.product_id,
        qty: l.qty,
        packaging_id: l.packaging_id ?? null,
        unit_price: l.requested_price ?? null,
      })),
    };

    // ۵) همان مسیرِ یگانهٔ سفارش؛ actor و مجوزها منتقل می‌شوند (بدونِ کاهشِ کنترل)
    const order = await this.orders.create(companyId, orderDto, actorUserId, permissions);

    // ۷) اتمیک: فقط اگر هنوز submitted است
    const marked = await this.repo.markRequestConverted(req.id, order.id as string);
    if (!marked) {
      // مسابقهٔ هم‌زمان: سفارشِ دوم ساخته شد ولی درخواست قبلاً تبدیل شده بود.
      // سفارش را باطل نمی‌کنیم (سند ثبت شده)، ولی ممیزیِ منبع و پیوند را ثبت
      // نمی‌کنیم و خطای روشن برمی‌گردانیم تا کلاینت بداند تبدیل تکراری بوده است.
      throw conflict(
        'already_converted',
        'این درخواست هم‌زمان توسط کاربرِ دیگری تبدیل شد؛ سفارشِ ساخته‌شده را بررسی و در صورتِ نیاز لغو کنید.',
      );
    }

    // ۶) ممیزیِ منبعِ تبدیل (جدا از ممیزیِ قلم‌های سفارش در OrderService)
    await this.pricing.logPriceChange({
      companyId,
      actorUserId,
      entityType: 'customer_request',
      entityId: req.id,
      action: 'convert_to_order',
      before: {
        request_id: req.id,
        request_status: 'submitted',
        requested_by: req.requested_by,
        requested_prices: lines.map((l) => ({
          product_id: l.product_id,
          requested_price: l.requested_price ?? null,
        })),
      },
      after: {
        request_id: req.id,
        order_id: order.id,
        actor_user_id: actorUserId,
        reason,
        manual_price_used: hasRequestedPrice,
        permissions,
        priced_lines: (order.lines ?? []).map((l) => ({
          product_id: l.product_id,
          unit_price: l.unit_price,
          discount_amount: l.discount_amount,
        })),
      },
    });

    return order;
  }

  private mapError(err: unknown): never {
    const code = (err as { code?: string }).code;
    if (code === '23505') throw conflict('duplicate', 'رکورد تکراری است.');
    if (code === '23503') throw badRequest('invalid_reference', 'یکی از ارجاع‌ها معتبر نیست.');
    if (code === '23514' || code === 'P0001') throw badRequest('check_violation', 'مقدار ارسال‌شده مجاز نیست.');
    throw err as Error;
  }
}

// ============ Invoices ============

export interface InvoiceView extends InvoiceRow {
  lines?: InvoiceLineView[];
}

@Injectable()
export class InvoiceService {
  constructor(@Inject(INVOICE_REPOSITORY) private readonly repo: SalesChainRepository) {}

  private assertId(id: string): void {
    if (!isUUID(id, '4')) throw badRequest('invalid_id', 'شناسهٔ فاکتور معتبر نیست.');
  }

  async list(companyId: string, query: ListInvoicesQueryDto): Promise<Page<InvoiceRow>> {
    const { items, nextCursor, hasMore } = await this.repo.listInvoices(companyId, query);
    return { items, next_cursor: nextCursor, has_more: hasMore };
  }

  async get(companyId: string, id: string): Promise<InvoiceView> {
    this.assertId(id);
    const row = await this.repo.findInvoice(companyId, id);
    if (!row) throw new NotFoundException({ code: 'not_found', message_fa: 'فاکتور یافت نشد' });
    const lines = await this.repo.findInvoiceLines(id);
    return { ...row, lines };
  }

  async create(companyId: string, dto: CreateInvoiceDto, userId: string): Promise<InvoiceView> {
    if (!dto.lines || dto.lines.length === 0) {
      throw badRequest('lines_required', 'فاکتور باید حداقل یک قلم کالا داشته باشد.');
    }
    // D5 (مصوبهٔ مالک): SKU بسته تا P5 نباید فاکتور شود
    const bundles = await this.repo.findBundleProductIds(dto.lines.map((l) => l.product_id));
    if (bundles.length > 0) {
      throw badRequest(
        'bundle_not_orderable',
        'فاکتور روی محصولِ «بسته» تا پیاده‌سازیِ کاملِ semantics عملیاتی در P5 مجاز نیست (مصوبهٔ D5).',
      );
    }
    const branchId = await this.repo.customerBranch(companyId, dto.customer_id);
    if (!branchId) throw badRequest('customer_not_found', 'مشتری انتخاب‌شده در این شرکت یافت نشد.');
    let id: string;
    try {
      const result = await this.repo.insertInvoice(dto, dto.lines, { branchId, createdBy: userId });
      id = result.id;
    } catch (err) {
      throw this.mapError(err);
    }
    return this.get(companyId, id);
  }

  private mapError(err: unknown): never {
    const code = (err as { code?: string }).code;
    if (code === '23505') throw conflict('duplicate_doc', 'شمارهٔ سند تکراری است.');
    if (code === '23503') throw badRequest('invalid_reference', 'یکی از ارجاع‌ها معتبر نیست.');
    if (code === '23514' || code === 'P0001') throw badRequest('check_violation', 'مقدار ارسال‌شده مجاز نیست (مثلاً جمع کل).');
    throw err as Error;
  }
}

// ============ Deliveries ============

@Injectable()
export class DeliveryService {
  constructor(@Inject(DELIVERY_REPOSITORY) private readonly repo: SalesChainRepository) {}

  private assertId(id: string): void {
    if (!isUUID(id, '4')) throw badRequest('invalid_id', 'شناسهٔ تحویل معتبر نیست.');
  }

  async list(companyId: string, query: ListDeliveriesQueryDto): Promise<Page<DeliveryRow>> {
    const { items, nextCursor, hasMore } = await this.repo.listDeliveries(companyId, query);
    return { items, next_cursor: nextCursor, has_more: hasMore };
  }

  async get(companyId: string, id: string): Promise<DeliveryRow> {
    this.assertId(id);
    const row = await this.repo.findDelivery(companyId, id);
    if (!row) throw new NotFoundException({ code: 'not_found', message_fa: 'تحویل یافت نشد' });
    return row;
  }

  async update(companyId: string, id: string, dto: UpdateDeliveryDto): Promise<DeliveryRow> {
    this.assertId(id);
    const existing = await this.repo.findDelivery(companyId, id);
    if (!existing) throw new NotFoundException({ code: 'not_found', message_fa: 'تحویل یافت نشد' });
    // تحویلِ ناموفق باید دلیل داشته باشد
    if (dto.status === 'failed' && !dto.failure_reason && !existing.failure_reason) {
      throw badRequest('failure_reason_required', 'ثبت تحویل ناموفق نیازمند دلیل است.');
    }
    // تحویل کامل/جزئی باید زمان تحویل داشته باشد
    if ((dto.status === 'delivered' || dto.status === 'partial') && !dto.delivered_at && !existing.delivered_at) {
      dto = { ...dto, delivered_at: new Date().toISOString() };
    }
    try {
      await this.repo.updateDelivery(companyId, id, dto);
    } catch (err) {
      throw this.mapError(err);
    }
    return this.get(companyId, id);
  }

  private mapError(err: unknown): never {
    const code = (err as { code?: string }).code;
    if (code === '23514' || code === 'P0001') throw badRequest('check_violation', 'مقدار ارسال‌شده مجاز نیست.');
    if (code === '23503') throw badRequest('invalid_reference', 'یکی از ارجاع‌ها معتبر نیست.');
    throw err as Error;
  }
}
