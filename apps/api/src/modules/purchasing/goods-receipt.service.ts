import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { isUUID } from 'class-validator';
import type {
  GoodsReceiptRepository,
  GoodsReceiptRow,
  ValuationRow,
} from './goods-receipt.repository';
import type { PurchasingRepository } from './purchasing.repository';
import { GOODS_RECEIPT_REPOSITORY, PURCHASING_REPOSITORY } from './tokens';
import type {
  CreateGoodsReceiptDto,
  ListGoodsReceiptsQueryDto,
  ListValuationQueryDto,
} from './goods-receipt.dto';

const badRequest = (code: string, message_fa: string): BadRequestException =>
  new BadRequestException({ code, message_fa });
const notFound = (msg: string): NotFoundException =>
  new NotFoundException({ code: 'not_found', message_fa: msg });
const conflict = (code: string, message_fa: string): ConflictException =>
  new ConflictException({ code, message_fa });

const assertId = (id: string, label: string): void => {
  if (!isUUID(id, '4')) throw badRequest('invalid_id', `شناسهٔ ${label} معتبر نیست.`);
};
// بها: واحد اختیاری نیست (@IsNumberString() همیشه حاضر است)؛ این تنها مقدار
// منفی/غیرعددی را رد می‌کند (الگوی همان purchasing.service.ts).
const isMoney = (v: string | undefined): boolean => v == null || v === '' || Number(v) >= 0;

/**
 * سرویس رسید انبار خرید (GRN) — ماژول ۸. اعتبارسنجی ارجاع‌ها (شعبه/
 * تأمین‌کننده/انبار/کالا/سفارش خرید) از PurchasingRepository بازاستفاده می‌شود
 * و عملیات CRUD/ثبت از GoodsReceiptRepository. ثبت قطعی (post) عوارض انبار و
 * ارزش‌گذاری را در یک تراکنش اعمال می‌کند (نگاه به repository).
 */
@Injectable()
export class GoodsReceiptService {
  constructor(
    @Inject(PURCHASING_REPOSITORY) private readonly purchasing: PurchasingRepository,
    @Inject(GOODS_RECEIPT_REPOSITORY) private readonly repo: GoodsReceiptRepository,
  ) {}

  async list(
    companyId: string,
    query: ListGoodsReceiptsQueryDto,
  ): Promise<Page<GoodsReceiptRow>> {
    const { items, nextCursor, hasMore } = await this.repo.listGoodsReceipts(companyId, query);
    return { items, next_cursor: nextCursor, has_more: hasMore };
  }

  async get(companyId: string, id: string): Promise<GoodsReceiptRow> {
    assertId(id, 'رسید انبار');
    const row = await this.repo.findGoodsReceipt(companyId, id);
    if (!row) throw notFound('رسید انبار یافت نشد');
    return row;
  }

  async create(companyId: string, dto: CreateGoodsReceiptDto): Promise<GoodsReceiptRow> {
    if (!(await this.purchasing.branchInCompany(companyId, dto.branch_id))) {
      throw badRequest('branch_invalid', 'شعبهٔ رسید انبار یافت نشد.');
    }
    if (!(await this.purchasing.supplierInCompany(companyId, dto.supplier_id))) {
      throw badRequest('supplier_invalid', 'تأمین‌کنندهٔ رسید انبار یافت نشد.');
    }
    if (!(await this.purchasing.warehouseInBranch(dto.branch_id, dto.warehouse_id))) {
      throw badRequest('warehouse_invalid', 'انبار باید به همان شعبهٔ رسید تعلق داشته باشد.');
    }
    if (dto.purchase_order_id) {
      const po = await this.purchasing.purchaseOrderInCompany(companyId, dto.purchase_order_id);
      if (!po) throw badRequest('po_invalid', 'سفارش خرید رسید یافت نشد.');
      if (po.supplier_id !== dto.supplier_id) {
        throw badRequest('po_supplier_mismatch', 'تأمین‌کنندهٔ رسید با سفارش خرید هم‌خوانی ندارد.');
      }
    }
    for (const l of dto.lines) {
      if (!isMoney(l.unit_cost)) {
        throw badRequest('invalid_amount', 'بهای واحد قلم رسید باید عددی و نامنفی باشد.');
      }
    }
    const missing = await this.purchasing.missingProducts(
      companyId,
      dto.lines.map((l) => l.product_id),
    );
    if (missing.length > 0) {
      throw badRequest('product_invalid', 'یک یا چند کالای رسید در شرکت یافت نشد.');
    }
    let id: string;
    try {
      id = await this.repo.insertGoodsReceipt(dto);
    } catch (err) {
      throw this.mapDbError(err);
    }
    return this.get(companyId, id);
  }

  async post(companyId: string, id: string, userId: string): Promise<GoodsReceiptRow> {
    assertId(id, 'رسید انبار');
    let posted: GoodsReceiptRow | null;
    try {
      posted = await this.repo.postGoodsReceipt(companyId, id, userId);
    } catch (err) {
      throw this.mapDbError(err);
    }
    if (posted) return posted;
    const existing = await this.repo.findGoodsReceipt(companyId, id);
    if (!existing) throw notFound('رسید انبار یافت نشد');
    throw conflict('grn_not_draft', 'فقط رسید پیش‌نویس قابل ثبت قطعی است.');
  }

  private mapDbError(err: unknown): Error {
    const e = err as { code?: string };
    if (e?.code === '23505') {
      return conflict('duplicate_grn', 'رسید انباری با این شماره برای شعبه/سال ثبت شده است.');
    }
    if (e?.code === '23503') {
      return badRequest('reference_invalid', 'یکی از ارجاع‌های رسید انبار معتبر نیست.');
    }
    if (e?.code === '23514') {
      return badRequest(
        'check_violation',
        'قید پایگاه‌داده نقض شد (مثلاً مقدار دریافتی از سفارش خرید بیشتر است).',
      );
    }
    return err instanceof Error ? err : new Error('خطای ثبت رسید انبار');
  }
}

/**
 * سرویس ارزش‌گذاری موجودی — ماژول ۹. خواندن product_cost (میانگین متحرک) به
 * ازای انبار/کالا برای دامنهٔ شرکت. بدون صفحه‌بندی (همهٔ ردیف‌ها) مانند /treasury.
 */
@Injectable()
export class ValuationService {
  constructor(@Inject(GOODS_RECEIPT_REPOSITORY) private readonly repo: GoodsReceiptRepository) {}

  async list(companyId: string, query: ListValuationQueryDto): Promise<{ items: ValuationRow[] }> {
    return this.repo.listValuation(companyId, query);
  }
}
