import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { isUUID } from 'class-validator';
import type { CreateWaybillDto, ListWaybillsQueryDto } from './waybill.dto';
import type { WaybillLineRow, WaybillRepository, WaybillRow } from './waybill.repository';
import { WAYBILL_REPOSITORY } from './tokens';

const badRequest = (code: string, message_fa: string): BadRequestException =>
  new BadRequestException({ code, message_fa });

export interface WaybillView {
  id: string;
  doc_number: string;
  fiscal_year: number;
  sales_order_id: string;
  customer_id: string;
  warehouse_id: string;
  issued_at: string;
  status: string;
  note: string | null;
  lines?: { product_id: string; batch_id: string | null; qty: number }[];
}

const mapLine = (l: WaybillLineRow) => ({ product_id: l.product_id, batch_id: l.batch_id, qty: l.qty });

@Injectable()
export class WaybillService {
  constructor(@Inject(WAYBILL_REPOSITORY) private readonly repo: WaybillRepository) {}

  private assertId(id: string): void {
    if (!isUUID(id, '4')) throw badRequest('invalid_id', 'شناسه ارسال‌شده معتبر نیست.');
  }

  async list(companyId: string, query: ListWaybillsQueryDto): Promise<Page<WaybillRow>> {
    const { items, nextCursor, hasMore } = await this.repo.list(companyId, query);
    return { items, next_cursor: nextCursor, has_more: hasMore };
  }

  async get(companyId: string, id: string): Promise<WaybillView> {
    this.assertId(id);
    const row = await this.repo.findById(companyId, id);
    if (!row) throw new NotFoundException({ code: 'not_found', message_fa: 'حواله یافت نشد' });
    const lines = await this.repo.findLines(id);
    return { ...row, lines: lines.map(mapLine) };
  }

  async create(companyId: string, dto: CreateWaybillDto): Promise<WaybillView> {
    if (dto.lines && dto.lines.length === 0) {
      throw badRequest('lines_required', 'حواله باید حداقل یک قلم کالا داشته باشد.');
    }
    const productIds = (dto.lines ?? []).map((l) => l.product_id);
    if (!(await this.repo.productsValid(companyId, productIds))) {
      throw badRequest('product_not_found', 'یکی از کالاهای ارسال‌شده در این شرکت یافت نشد.');
    }
    let id: string;
    try {
      id = await this.repo.insert(companyId, dto);
    } catch (err) {
      throw this.mapDbError(err);
    }
    return this.get(companyId, id);
  }

  private mapDbError(err: unknown): Error {
    const e = err as { code?: string; constraint?: string; message?: string };
    if (e?.message === 'warehouse or order not found') {
      return badRequest('warehouse_or_order_not_found', 'انبار یا سفارش فروش در این شرکت یافت نشد.');
    }
    if (e?.message === 'sales order not found') {
      return badRequest('sales_order_not_found', 'سفارش فروش ارسال‌شده یافت نشد.');
    }
    if (e?.message === 'customer not found') {
      return badRequest('customer_not_found', 'مشتری ارسال‌شده در این شرکت یافت نشد.');
    }
    if (e?.code === '23505') {
      return new BadRequestException({
        code: 'duplicate_doc',
        message_fa: 'شماره حواله در این شعبه و سال مالی تکراری است.',
        details: { constraint: e.constraint },
      });
    }
    if (e?.code === '23514') {
      return badRequest('check_violation', 'مقدار ارسال‌شده برای یکی از فیلدها مجاز نیست.');
    }
    if (e?.code === '23503') {
      return badRequest('reference_invalid', 'یکی از ارجاع‌های ارسال‌شده معتبر نیست.');
    }
    return badRequest('waybill_save_failed', 'خطای غیرمنتظره در ثبت حواله.');
  }
}
