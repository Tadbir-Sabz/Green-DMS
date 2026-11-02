import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { isUUID } from 'class-validator';
import type { FinanceWriteRepository, PaymentRow } from './finance-write.repository';
import { PAYMENT_REPOSITORY } from './tokens';
import type { CreatePaymentDto, ListPaymentsQueryDto } from './finance.dto';

const badRequest = (code: string, message_fa: string): BadRequestException =>
  new BadRequestException({ code, message_fa });
/** 422 RuleRejected قرارداد — برای رد تخصیص بیش از مانده */
const unprocessable = (code: string, message_fa: string): UnprocessableEntityException =>
  new UnprocessableEntityException({ code, message_fa });
const notFound = (): NotFoundException =>
  new NotFoundException({ code: 'not_found', message_fa: 'رسید یافت نشد' });

/**
 * وصول مطالبات (ماژول ۷) — ثبت رسید و تخصیص به فاکتورها.
 * سقف تخصیص پیش از نوشتن بررسی می‌شود تا پیام فارسی قرارداد برگردد
 * (trigger fn_check_allocation لایهٔ دوم حفاظت است).
 */
@Injectable()
export class PaymentService {
  constructor(@Inject(PAYMENT_REPOSITORY) private readonly repo: FinanceWriteRepository) {}

  private assertId(id: string): void {
    if (!isUUID(id, '4')) throw badRequest('invalid_id', 'شناسه رسید معتبر نیست.');
  }

  async list(companyId: string, query: ListPaymentsQueryDto): Promise<Page<PaymentRow>> {
    const { items, nextCursor, hasMore } = await this.repo.listPayments(companyId, query);
    return { items, next_cursor: nextCursor, has_more: hasMore };
  }

  async get(companyId: string, id: string): Promise<PaymentRow> {
    this.assertId(id);
    const row = await this.repo.findPayment(companyId, id);
    if (!row) throw notFound();
    return row;
  }

  async create(companyId: string, dto: CreatePaymentDto): Promise<PaymentRow> {
    const amount = Number(dto.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw badRequest('invalid_amount', 'مبلغ وصول باید بزرگ‌تر از صفر باشد.');
    }
    const refs = await this.repo.resolvePaymentRefs(companyId, dto);
    if (!refs) {
      throw badRequest('reference_invalid', 'مشتری یا روش پرداخت یافت نشد.');
    }
    if (refs.requiresReference && !dto.reference?.trim()) {
      throw badRequest('reference_required', 'این روش پرداخت به شماره پیگیری نیاز دارد.');
    }

    const allocations = dto.allocations ?? [];
    if (allocations.length > 0) {
      const allocTotal = allocations.reduce((s, a) => s + Number(a.amount), 0);
      if (allocTotal > amount + 0.004) {
        throw unprocessable(
          'over_allocation',
          'جمع تخصیص‌ها از مبلغ رسید بیشتر است.',
        );
      }
      // مانده باز هر فاکتور — رد تخصیص بیش از مانده
      const balances = await this.repo.invoiceOpenBalances(allocations.map((a) => a.invoice_id));
      for (const a of allocations) {
        const bal = balances.get(a.invoice_id);
        if (!bal) {
          throw unprocessable('invoice_not_found', 'یکی از فاکتورهای تخصیص یافت نشد.');
        }
        if (Number(a.amount) > bal.open + 0.004) {
          throw unprocessable(
            'over_allocation',
            'مبلغ تخصیص از مانده باز فاکتور بیشتر است.',
          );
        }
      }
    }

    let id: string;
    try {
      id = await this.repo.insertPayment(dto, { branchId: refs.branchId }, allocations);
    } catch (err) {
      throw this.mapDbError(err);
    }
    return this.get(companyId, id);
  }

  private mapDbError(err: unknown): Error {
    const e = err as { code?: string; constraint?: string; message?: string };
    if (e?.code === '23505') {
      return badRequest('duplicate_receipt', 'رسیدی با این شماره قبلاً ثبت شده است.');
    }
    if (e?.code === '23514') {
      return unprocessable('over_allocation', 'مبلغ تخصیص از سقف مجاز بیشتر است.');
    }
    if (e?.code === 'P0001' || (e?.message ?? '').includes('بیشتر')) {
      // خطای trigger fn_check_allocation با پیام فارسی
      return unprocessable('over_allocation', e?.message ?? 'تخصیص از مانده بیشتر است.');
    }
    if (e?.code === '23503') {
      return badRequest('reference_invalid', 'یکی از ارجاع‌های رسید معتبر نیست.');
    }
    return badRequest('receipt_save_failed', 'خطای غیرمنتظره در ثبت رسید.');
  }
}
