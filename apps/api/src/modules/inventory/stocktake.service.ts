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
  CreateStockTakeDto,
  ListStocktakesQueryDto,
  UpdateStockTakeDto,
} from './stock.dto';
import type { StockTakeLineRow, StockTakeRow, StocktakeRepository } from './stocktake.repository';
import { STOCKTAKE_REPOSITORY } from './tokens';

const badRequest = (code: string, message_fa: string): BadRequestException =>
  new BadRequestException({ code, message_fa });

export interface StockTakeView {
  id: string;
  branch_id: string;
  warehouse_id: string;
  status: string;
  /** قفل خوش‌بینانه — مقدار PATCH بعدی باید همین باشد */
  row_version: number;
  lines?: {
    product_id: string;
    batch_id: string | null;
    system_qty: number;
    counted_qty: number | null;
    variance_qty: number;
  }[];
}

const mapLine = (l: StockTakeLineRow) => ({
  product_id: l.product_id,
  batch_id: l.batch_id,
  system_qty: l.qty_system,
  counted_qty: l.qty_counted,
  variance_qty: l.variance,
});

@Injectable()
export class StocktakeService {
  constructor(@Inject(STOCKTAKE_REPOSITORY) private readonly repo: StocktakeRepository) {}

  private assertId(id: string): void {
    if (!isUUID(id, '4')) throw badRequest('invalid_id', 'شناسه ارسال‌شده معتبر نیست.');
  }

  async list(companyId: string, query: ListStocktakesQueryDto): Promise<Page<StockTakeView>> {
    const { items, nextCursor, hasMore } = await this.repo.list(companyId, query);
    return {
      items: items.map((r) => ({
        id: r.id,
        branch_id: r.branch_id,
        warehouse_id: r.warehouse_id,
        status: r.status,
        row_version: r.row_version,
      })),
      next_cursor: nextCursor,
      has_more: hasMore,
    };
  }

  async get(companyId: string, id: string): Promise<StockTakeView> {
    this.assertId(id);
    const row = await this.repo.findById(companyId, id);
    if (!row) throw new NotFoundException({ code: 'not_found', message_fa: 'سند انبارگردانی یافت نشد' });
    const lines = await this.repo.findLines(id);
    return {
      id: row.id,
      branch_id: row.branch_id,
      warehouse_id: row.warehouse_id,
      status: row.status,
      row_version: row.row_version,
      lines: lines.map(mapLine),
    };
  }

  async create(companyId: string, dto: CreateStockTakeDto): Promise<StockTakeView> {
    const branchId = await this.repo.resolveWarehouseBranch(companyId, dto.warehouse_id);
    if (!branchId) throw badRequest('warehouse_not_found', 'انبار انتخاب‌شده در این شرکت یافت نشد.');
    let id: string;
    try {
      id = await this.repo.insert(companyId, dto, branchId);
    } catch (err) {
      throw this.mapDbError(err);
    }
    return this.get(companyId, id);
  }

  async update(companyId: string, id: string, dto: UpdateStockTakeDto): Promise<StockTakeView> {
    this.assertId(id);
    const row = await this.repo.findById(companyId, id);
    if (!row) throw new NotFoundException({ code: 'not_found', message_fa: 'سند انبارگردانی یافت نشد' });
    if (row.status === 'posted' || row.status === 'voided') {
      throw new ConflictException({
        code: 'already_final',
        message_fa: 'سند نهایی‌شده قابل ویرایش نیست.',
      });
    }
    // قفل خوش‌بینانه: نسخهٔ ارسالی باید با سرور یکی باشد (بیرون از mapDbError
    // تا 409 با همان کد version_conflict بماند)
    if (dto.row_version !== undefined && row.row_version !== dto.row_version) {
      throw new ConflictException({
        code: 'version_conflict',
        message_fa: 'سند انبارگردانی هم‌زمان توسط کاربر دیگری تغییر کرده است؛ دوباره بارگیری کنید.',
      });
    }
    // به‌روزرسانی وضعیت با فیلتر شرکت و شرط نسخه در خود UPDATE
    if (dto.status) {
      const applied = await this.repo.updateStatus(companyId, id, dto.status, dto.row_version);
      if (applied === 'missing') {
        throw new NotFoundException({ code: 'not_found', message_fa: 'سند انبارگردانی یافت نشد' });
      }
      if (applied === 'stale') {
        throw new ConflictException({
          code: 'version_conflict',
          message_fa: 'سند انبارگردانی هم‌زمان توسط کاربر دیگری تغییر کرده است؛ دوباره بارگیری کنید.',
        });
      }
    }
    try {
      if (dto.lines?.length) await this.repo.upsertLines(id, row.warehouse_id, dto.lines);
    } catch (err) {
      throw this.mapDbError(err);
    }
    return this.get(companyId, id);
  }

  async submit(companyId: string, id: string, approverId: string): Promise<StockTakeView> {
    this.assertId(id);
    try {
      await this.repo.submit(companyId, id, approverId);
    } catch (err) {
      const e = err as { pgCode?: string; code?: string; constraint?: string; message?: string };
      if (e?.pgCode === 'no_data') {
        throw badRequest('not_found', 'سند انبارگردانی یافت نشد.');
      }
      if (e?.pgCode === 'bad_state') {
        throw new ConflictException({
          code: 'already_final',
          message_fa: 'این سند قبلاً نهایی شده است.',
        });
      }
      if (e?.pgCode === 'no_lines') {
        throw badRequest('no_counted_lines', 'هیچ قلمی شمارش نشده است؛ ابتدا شمارش اقلام را ثبت کنید.');
      }
      if (e?.code === '23514' && !e.constraint) {
        // ردِ موجودی منفیِ fn_apply_stock_txn
        throw new ConflictException({
          code: 'negative_stock_forbidden',
          message_fa: (e as { message?: string }).message ?? 'اعمال مغایرت به موجودی منفی می‌انجامد.',
        });
      }
      throw this.mapDbError(err);
    }
    return this.get(companyId, id);
  }

  private mapDbError(err: unknown): Error {
    const e = err as { code?: string; constraint?: string };
    if (e?.code === '23505') {
      return new ConflictException({
        code: 'duplicate_line',
        message_fa: 'این کالا قبلاً در سند شمارش شده است.',
        details: { constraint: e.constraint },
      });
    }
    if (e?.code === '23514') {
      return badRequest('check_violation', 'مقدار ارسال‌شده برای یکی از فیلدها مجاز نیست.');
    }
    if (e?.code === '23503') {
      return badRequest('reference_invalid', 'یکی از ارجاع‌های ارسال‌شده معتبر نیست.');
    }
    return badRequest('stocktake_save_failed', 'خطای غیرمنتظره در ذخیره سند انبارگردانی.');
  }
}
