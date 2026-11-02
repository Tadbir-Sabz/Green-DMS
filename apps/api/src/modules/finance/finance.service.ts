import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { isUUID } from 'class-validator';
import type {
  ArAgingRow,
  FinanceRepository,
  StatementLine,
  SupplierBalance,
  TreasuryPosition,
} from './finance.repository';
import { AR_REPOSITORY, AP_REPOSITORY, TREASURY_REPOSITORY } from './tokens';
import type { CustomerStatementQueryDto, ListApQueryDto, ListArQueryDto, ListTreasuryQueryDto } from './finance.dto';

const badId = (msg: string): NotFoundException =>
  new NotFoundException({ code: 'not_found', message_fa: msg });

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

/** خزانه‌داری (ماژول ۱۰) — مانده صندوق/بانک و مغایرت */
@Injectable()
export class TreasuryService {
  constructor(@Inject(TREASURY_REPOSITORY) private readonly repo: FinanceRepository) {}

  async positions(
    companyId: string,
    query: ListTreasuryQueryDto,
  ): Promise<{ items: TreasuryPosition[] }> {
    const items = await this.repo.treasuryPositions(companyId, query);
    return { items };
  }
}
