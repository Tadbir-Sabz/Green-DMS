import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Page } from '@dms/contracts';
import type { CreateStockAdjustmentDto, ListStockQueryDto } from './stock.dto';
import type { StockAdjustmentView, StockBalanceRow, StockRepository } from './stock.repository';
import { STOCK_REPOSITORY } from './tokens';

const badRequest = (code: string, message_fa: string): BadRequestException =>
  new BadRequestException({ code, message_fa });

@Injectable()
export class StockService {
  constructor(@Inject(STOCK_REPOSITORY) private readonly repo: StockRepository) {}

  async list(companyId: string, query: ListStockQueryDto): Promise<Page<StockBalanceRow>> {
    const { items, nextCursor, hasMore } = await this.repo.list(companyId, query);
    return { items, next_cursor: nextCursor, has_more: hasMore };
  }

  async createAdjustment(companyId: string, dto: CreateStockAdjustmentDto): Promise<StockAdjustmentView> {
    if (dto.qty_delta === 0) {
      throw badRequest('invalid_qty_delta', 'مقدار اصلاحیه نمی‌تواند صفر باشد.');
    }
    let id: string;
    try {
      ({ id } = await this.repo.createAdjustment(companyId, dto));
    } catch (err) {
      throw this.mapDbError(err);
    }
    const view = await this.repo.findAdjustment(companyId, id);
    if (!view) throw new NotFoundException({ code: 'not_found', message_fa: 'اصلاحیه یافت نشد' });
    return view;
  }

  /**
   * خطای دیتابیس ← کد قرارداد.
   * انبار ناموجود → 400 (404 در قرارداد POST /stock/adjustments نیست).
   * ردِ موجودی منفیِ fn_apply_stock_txn (SQLSTATE 23514 بدون constraint) → 422 RuleRejected.
   */
  private mapDbError(err: unknown): Error {
    const e = err as { pgCode?: string; code?: string; constraint?: string; message?: string };
    if (e?.pgCode === 'no_data') {
      return badRequest('warehouse_not_found', 'انبار انتخاب‌شده در این شرکت یافت نشد.');
    }
    // client_uuid تکراری (پیش‌بررسی دفتر، یا نقض PK دفتر در رقابت هم‌زمان) →
    // 409 conflict مطابق قرارداد آفلاین (عملیات تکراری سند جدید نمی‌سازد).
    if (e?.pgCode === 'dup_client_uuid' || e?.code === '23505') {
      return new ConflictException({
        code: 'duplicate_client_uuid',
        message_fa: 'این عملیات با client_uuid یکسان پیش‌تر ثبت شده است.',
      });
    }
    if (e?.code === '23514' && !e.constraint) {
      // raise از fn_apply_stock_txn با errcode=check_violation (بدون constraint جدول)
      return new UnprocessableEntityException({
        code: 'negative_stock_forbidden',
        message_fa: e.message ?? 'انبار مقصد اجازه موجودی منفی ندارد.',
      });
    }
    if (e?.code === '23514') {
      return badRequest('check_violation', 'مقدار ارسال‌شده برای یکی از فیلدها مجاز نیست.');
    }
    if (e?.code === '23503') {
      return badRequest('reference_invalid', 'یکی از ارجاع‌های ارسال‌شده معتبر نیست.');
    }
    if (e?.code === '23502') {
      return badRequest('missing_field', 'یکی از فیلدهای الزامی وارد نشده است.');
    }
    return badRequest('adjustment_save_failed', 'خطای غیرمنتظره در ثبت اصلاحیه.');
  }
}
