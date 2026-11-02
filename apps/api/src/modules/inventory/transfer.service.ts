import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { isUUID } from 'class-validator';
import type { CreateTransferDto, ListTransfersQueryDto } from './stock.dto';
import type { TransferLineRow, TransferRepository, TransferRow } from './transfer.repository';
import { TRANSFER_REPOSITORY } from './tokens';

const badRequest = (code: string, message_fa: string): BadRequestException =>
  new BadRequestException({ code, message_fa });

export interface TransferView {
  id: string;
  doc_number: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  status: string;
  lines?: { product_id: string; batch_id: string | null; qty: number }[];
}

const mapLine = (l: TransferLineRow) => ({ product_id: l.product_id, batch_id: l.batch_id, qty: l.qty });

@Injectable()
export class TransferService {
  constructor(@Inject(TRANSFER_REPOSITORY) private readonly repo: TransferRepository) {}

  private assertId(id: string): void {
    if (!isUUID(id, '4')) throw badRequest('invalid_id', 'شناسه ارسال‌شده معتبر نیست.');
  }

  async list(companyId: string, query: ListTransfersQueryDto): Promise<Page<TransferRow>> {
    const { items, nextCursor, hasMore } = await this.repo.list(companyId, query);
    return { items, next_cursor: nextCursor, has_more: hasMore };
  }

  async get(companyId: string, id: string): Promise<TransferView> {
    this.assertId(id);
    const row = await this.repo.findById(companyId, id);
    if (!row) throw new NotFoundException({ code: 'not_found', message_fa: 'انتقال یافت نشد' });
    const lines = await this.repo.findLines(id);
    return { ...row, lines: lines.map(mapLine) };
  }

  async create(companyId: string, dto: CreateTransferDto): Promise<TransferView> {
    if (dto.from_warehouse_id === dto.to_warehouse_id) {
      throw badRequest('same_warehouse', 'انبار مبدأ و مقصد نمی‌توانند یکسان باشند.');
    }
    if (!dto.lines?.length) {
      throw badRequest('lines_required', 'انتقال باید حداقل یک قلم کالا داشته باشد.');
    }
    const { valid } = await this.repo.warehousesValid(companyId, dto.from_warehouse_id, dto.to_warehouse_id);
    if (!valid) {
      throw badRequest('warehouse_not_found', 'انبار مبدأ یا مقصد در این شرکت یافت نشد.');
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
    const e = err as { code?: string; constraint?: string };
    if (e?.code === '23505') {
      return new BadRequestException({
        code: 'duplicate_line',
        message_fa: 'این کالا قبلاً در انتقال ثبت شده است.',
        details: { constraint: e.constraint },
      });
    }
    if (e?.code === '23514' && e.constraint === 'ck_stock_transfer_diff') {
      return badRequest('same_warehouse', 'انبار مبدأ و مقصد نمی‌توانند یکسان باشند.');
    }
    if (e?.code === '23514') {
      return badRequest('check_violation', 'مقدار ارسال‌شده برای یکی از فیلدها مجاز نیست.');
    }
    if (e?.code === '23503') {
      return badRequest('reference_invalid', 'یکی از ارجاع‌های ارسال‌شده معتبر نیست.');
    }
    return badRequest('transfer_save_failed', 'خطای غیرمنتظره در ثبت انتقال.');
  }
}
