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
  ArAgingRow,
  FinanceRepository,
  StatementLine,
  SupplierBalance,
  TreasuryPosition,
} from './finance.repository';
import type { FinanceWriteRepository, TreasuryCloseRow } from './finance-write.repository';
import {
  AR_REPOSITORY,
  AP_REPOSITORY,
  TREASURY_REPOSITORY,
  TREASURY_WRITE_REPOSITORY,
} from './tokens';
import type {
  ApproveTreasuryCloseDto,
  CreateTreasuryCloseDto,
  CustomerStatementQueryDto,
  ListApQueryDto,
  ListArQueryDto,
  ListTreasuryClosesQueryDto,
  ListTreasuryQueryDto,
} from './finance.dto';

const badId = (msg: string): NotFoundException =>
  new NotFoundException({ code: 'not_found', message_fa: msg });
const badRequest = (code: string, message_fa: string): BadRequestException =>
  new BadRequestException({ code, message_fa });
const conflict = (code: string, message_fa: string): ConflictException =>
  new ConflictException({ code, message_fa });

/** صورتحساب دوره‌ای مشتری — شکل schemas.CustomerStatement */
export interface CustomerStatementView {
  customer_id: string;
  from: string | null;
  to: string | null;
  opening_balance: string;
  closing_balance: string;
  lines: StatementLine[];
}

/**
 * حساب‌های دریافتنی (ماژول ۷) — تحلیل سنی بدهکاری و صورتحساب دوره‌ای.
 * خواندن با مجوز ar.ledger.view (در کنترلر).
 */
@Injectable()
export class ArService {
  constructor(@Inject(AR_REPOSITORY) private readonly repo: FinanceRepository) {}

  async aging(companyId: string, query: ListArQueryDto): Promise<Page<ArAgingRow>> {
    const { items, nextCursor, hasMore } = await this.repo.arAging(companyId, query);
    return { items, next_cursor: nextCursor, has_more: hasMore };
  }

  async statement(
    companyId: string,
    customerId: string,
    query: CustomerStatementQueryDto,
  ): Promise<CustomerStatementView> {
    if (!isUUID(customerId, '4')) throw badId('مشتری یافت نشد');
    const belongs = await this.repo.customerBelongsToCompany(companyId, customerId);
    if (!belongs) throw badId('مشتری یافت نشد');
    const s = await this.repo.customerStatement(customerId, query.from ?? null, query.to ?? null);
    return {
      customer_id: customerId,
      from: query.from ?? null,
      to: query.to ?? null,
      opening_balance: s.opening_balance,
      closing_balance: s.closing_balance,
      lines: s.lines,
    };
  }
}

/** حساب‌های پرداختنی (ماژول ۸) — مانده تأمین‌کنندگان */
@Injectable()
export class ApService {
  constructor(@Inject(AP_REPOSITORY) private readonly repo: FinanceRepository) {}

  async balances(companyId: string, query: ListApQueryDto): Promise<Page<SupplierBalance>> {
    const { items, nextCursor, hasMore } = await this.repo.apBalances(companyId, query);
    return { items, next_cursor: nextCursor, has_more: hasMore };
  }
}

/**
 * خزانه‌داری (ماژول ۱۰) — مانده صندوق/بانک و مغایرت (خواندن) به‌همراه بستن
 * روزانهٔ خزانه (نوشتن): ثبت شمارش و بستن یک شعبه برای یک تاریخ، و تأیید آن.
 * daily_treasury_close کلید branch_id دارد و (branch_id, close_date) یکتاست.
 */
@Injectable()
export class TreasuryService {
  constructor(
    @Inject(TREASURY_REPOSITORY) private readonly repo: FinanceRepository,
    @Inject(TREASURY_WRITE_REPOSITORY) private readonly write: FinanceWriteRepository,
  ) {}

  async positions(
    companyId: string,
    query: ListTreasuryQueryDto,
  ): Promise<{ items: TreasuryPosition[] }> {
    const items = await this.repo.treasuryPositions(companyId, query);
    return { items };
  }

  private assertId(id: string): void {
    if (!isUUID(id, '4')) throw badRequest('invalid_id', 'شناسهٔ بستن روزانه معتبر نیست.');
  }

  // ---------------- Daily close ----------------

  async listCloses(
    companyId: string,
    query: ListTreasuryClosesQueryDto,
  ): Promise<Page<TreasuryCloseRow>> {
    const { items, nextCursor, hasMore } = await this.write.listTreasuryCloses(companyId, query);
    return { items, next_cursor: nextCursor, has_more: hasMore };
  }

  async getClose(companyId: string, id: string): Promise<TreasuryCloseRow> {
    this.assertId(id);
    const row = await this.write.findTreasuryClose(companyId, id);
    if (!row) throw badId('بستن روزانه یافت نشد');
    return row;
  }

  async createClose(
    companyId: string,
    userId: string,
    dto: CreateTreasuryCloseDto,
  ): Promise<TreasuryCloseRow> {
    const branchOk = await this.write.branchBelongsToCompany(companyId, dto.branch_id);
    if (!branchOk) throw badRequest('branch_invalid', 'شعبهٔ بستن روزانه یافت نشد.');
    // مبالغ نباید منفی باشند (ستون‌ها check ندارند؛ پیام فارسی قرارداد)
    for (const [field, value] of [
      ['cash_expected', dto.cash_expected],
      ['cash_counted', dto.cash_counted],
      ['bank_balance', dto.bank_balance],
      ['cheque_in_hand_amount', dto.cheque_in_hand_amount],
    ] as const) {
      if (value != null && value !== '' && Number(value) < 0) {
        throw badRequest('invalid_amount', `مبلغ ${field} نمی‌تواند منفی باشد.`);
      }
    }
    let id: string;
    try {
      id = await this.write.insertTreasuryClose(companyId, userId, dto);
    } catch (err) {
      throw this.mapCloseError(err);
    }
    return this.getClose(companyId, id);
  }

  async approveClose(
    companyId: string,
    id: string,
    userId: string,
    dto: ApproveTreasuryCloseDto,
  ): Promise<TreasuryCloseRow> {
    this.assertId(id);
    const approved = await this.write.approveTreasuryClose(companyId, id, userId, dto);
    if (approved) return approved;
    const existing = await this.write.findTreasuryClose(companyId, id);
    if (!existing) throw badId('بستن روزانه یافت نشد');
    throw conflict('close_not_pending', 'این بستن روزانه پیش‌تر تأیید شده یا در وضعیت بسته نیست.');
  }

  private mapCloseError(err: unknown): Error {
    const e = err as { code?: string };
    if (e?.code === '23505') {
      return conflict('duplicate_close', 'برای این شعبه و تاریخ، بستن روزانه قبلاً ثبت شده است.');
    }
    if (e?.code === '23503') {
      return badRequest('branch_invalid', 'شعبهٔ بستن روزانه معتبر نیست.');
    }
    return badRequest('close_save_failed', 'خطای غیرمنتظره در ثبت بستن روزانه.');
  }
}
