import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { isUUID } from 'class-validator';
import type { ChequeRow, FinanceWriteRepository } from './finance-write.repository';
import { CHEQUE_REPOSITORY } from './tokens';
import type { CreateChequeDto, ListChequesQueryDto, UpdateChequeDto } from './finance.dto';

const badRequest = (code: string, message_fa: string): BadRequestException =>
  new BadRequestException({ code, message_fa });
const notFound = (): NotFoundException =>
  new NotFoundException({ code: 'not_found', message_fa: 'چک یافت نشد' });

/**
 * چک‌های دریافتی/صادری (ماژول ۱۰) — ثبت، فهرست سررسیدها و تعیین تکلیف.
 * طرف چک (مشتری/تأمین‌کننده) از person_id قرارداد resolving می‌شود.
 */
@Injectable()
export class ChequeService {
  constructor(@Inject(CHEQUE_REPOSITORY) private readonly repo: FinanceWriteRepository) {}

  private assertId(id: string): void {
    if (!isUUID(id, '4')) throw badRequest('invalid_id', 'شناسه چک معتبر نیست.');
  }

  async list(companyId: string, query: ListChequesQueryDto): Promise<Page<ChequeRow>> {
    const { items, nextCursor, hasMore } = await this.repo.listCheques(companyId, query);
    return { items, next_cursor: nextCursor, has_more: hasMore };
  }

  async get(companyId: string, id: string): Promise<ChequeRow> {
    this.assertId(id);
    const row = await this.repo.findCheque(companyId, id);
    if (!row) throw notFound();
    return row;
  }

  async create(companyId: string, dto: CreateChequeDto): Promise<ChequeRow> {
    if (Number(dto.amount) <= 0) {
      throw badRequest('invalid_amount', 'مبلغ چک باید بزرگ‌تر از صفر باشد.');
    }
    const party = await this.repo.resolveChequeParty(companyId, dto);
    if (!party) {
      throw badRequest(
        'party_not_found',
        dto.direction === 'received'
          ? 'مشتریِ این چک در شرکت یافت نشد.'
          : 'تأمین‌کنندهٔ این چک در شرکت یافت نشد.',
      );
    }
    let id: string;
    try {
      id = await this.repo.insertCheque(dto, party);
    } catch (err) {
      throw this.mapDbError(err);
    }
    return this.get(companyId, id);
  }

  async update(companyId: string, id: string, dto: UpdateChequeDto): Promise<ChequeRow> {
    this.assertId(id);
    const existing = await this.repo.findCheque(companyId, id);
    if (!existing) throw notFound();
    try {
      await this.repo.updateCheque(companyId, id, dto);
    } catch (err) {
      throw this.mapDbError(err);
    }
    return this.get(companyId, id);
  }

  private mapDbError(err: unknown): Error {
    const e = err as { code?: string; constraint?: string };
    if (e?.code === '23505') {
      return badRequest('duplicate_cheque', 'چکی با این سریال و بانک قبلاً ثبت شده است.');
    }
    if (e?.code === '23514') {
      return badRequest('check_violation', 'مقدار ارسال‌شده برای چک مجاز نیست.');
    }
    if (e?.code === '23503') {
      return badRequest('reference_invalid', 'یکی از ارجاع‌های چک معتبر نیست.');
    }
    return badRequest('cheque_save_failed', 'خطای غیرمنتظره در ثبت چک.');
  }
}
