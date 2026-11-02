import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import type { ListApQueryDto, ListArQueryDto, ListTreasuryQueryDto } from './finance.dto';

/** ردیف سنی بدهکاری مشتری — مطابق schemas.ArAgingRow */
export interface ArAgingRow extends QueryResultRow {
  customer_id: string;
  customer_code: string;
  customer_name: string;
  total: string;
  current: string;
  d1_30: string;
  d31_60: string;
  d61_90: string;
  over_90: string;
}

/** یک خط صورتحساب دوره‌ای مشتری */
export interface StatementLine {
  at: string;
  doc_type: string;
  doc_number: string;
  debit: string;
  credit: string;
  balance: string;
}

/** مانده تأمین‌کننده — مطابق schemas.SupplierBalance */
export interface SupplierBalance extends QueryResultRow {
  supplier_person_id: string;
  supplier_name: string;
  total_payable: string;
  due_next: string | null;
}

/** موقعیت خزانه — مطابق schemas.TreasuryPosition */
export interface TreasuryPosition extends QueryResultRow {
  bank_account_id: string | null;
  title: string;
  balance_book: string;
  balance_actual: string | null;
  variance: string | null;
  as_of: string;
}

const encodeCursor = (v: string): string => Buffer.from(v, 'utf8').toString('base64url');
const decodeCursor = (cursor: string): string =>
  Buffer.from(cursor, 'base64url').toString('utf8');

/**
 * مدل‌های خواندنی مالی (AR/AP/Treasury) — SQL زنده روی جداول مهاجرت 0013..0015.
 * عمداً از mv_* خوانده نمی‌شود تا بدون وابستگی به REFRESH همیشه به‌روز باشد؛
 * منطق دقیقاً همان تعریف viewهای مهاجرت 0029 است.
 */
@Injectable()
export class FinanceRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  // ---------------- AR: تحلیل سنی بدهکاری مشتریان ----------------

  async arAging(
    companyId: string,
    query: ListArQueryDto,
  ): Promise<{ items: ArAgingRow[]; nextCursor: string | null; hasMore: boolean }> {
    const limit = query.limit ?? 50;
    const params: unknown[] = [companyId];
    const filters: string[] = ['b.company_id = $1'];

    // as_of مبنای محاسبه روزهای سررسید؛ پیش‌فرض امروز
    const asOf = query.as_of ?? null;
    params.push(asOf);
    const asOfParam = `$${params.length}`;

    if (query.branch_id) {
      params.push(query.branch_id);
      filters.push(`i.branch_id = $${params.length}`);
    }
    if (query.cursor) {
      params.push(decodeCursor(query.cursor));
      filters.push(`c.code > $${params.length}`);
    }
    params.push(limit + 1);
    const limitParam = `$${params.length}`;

    const { rows } = await this.pool.query<ArAgingRow & { code_key: string }>(
      `with bal as (
         select i.branch_id,
                i.customer_id,
                greatest(i.grand_total - i.paid_amount - coalesce(cn.credit_total, 0), 0) as balance,
                (coalesce(${asOfParam}::date, current_date)
                   - coalesce(i.due_date, i.invoice_date))::integer as overdue_days
           from invoice i
           join branch b on b.id = i.branch_id
           left join (
             select cn.invoice_id, sum(cn.amount) as credit_total
               from credit_note cn
              where cn.status = 'posted'
              group by 1
           ) cn on cn.invoice_id = i.id
          where i.status in ('posted','partially_paid')
            and (${filters.join(' and ')})
            and i.invoice_date <= coalesce(${asOfParam}::date, current_date)
       ),
       aged as (
         select customer_id,
                sum(case when overdue_days <= 0              then balance else 0 end) as current_amount,
                sum(case when overdue_days between 1  and 30 then balance else 0 end) as bucket_1_30,
                sum(case when overdue_days between 31 and 60 then balance else 0 end) as bucket_31_60,
                sum(case when overdue_days between 61 and 90 then balance else 0 end) as bucket_61_90,
                sum(case when overdue_days > 90              then balance else 0 end) as bucket_over_90,
                sum(balance) as total_due
           from bal
          group by customer_id
         having sum(balance) > 0.004
       )
       select a.customer_id,
              c.code                          as customer_code,
              c.code                          as code_key,
              coalesce(nullif(p.legal_name, ''),
                       nullif(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), ''),
                       c.code)                as customer_name,
              a.total_due::text               as total,
              a.current_amount::text          as current,
              a.bucket_1_30::text             as d1_30,
              a.bucket_31_60::text            as d31_60,
              a.bucket_61_90::text            as d61_90,
              a.bucket_over_90::text          as over_90
         from aged a
         join customer c on c.id = a.customer_id
         left join person p on p.id = c.person_id
        order by c.code
        limit ${limitParam}`,
      params,
    );

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page.map(({ code_key: _k, ...rest }) => rest as ArAgingRow),
      hasMore,
      nextCursor: hasMore && last ? encodeCursor(last.code_key) : null,
    };
  }

  /** آیا مشتری به این شرکت تعلق دارد (برای 404 در statement) */
  async customerBelongsToCompany(companyId: string, customerId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      `select 1 from customer c join branch b on b.id = c.branch_id
        where c.id = $1 and b.company_id = $2 and c.deleted_at is null`,
      [customerId, companyId],
    );
    return rows.length > 0;
  }

  /**
   * صورتحساب دوره‌ای — از customer_ledger_entry با ماندهٔ گردان.
   * opening = جمع (debit-credit) پیش از `from`؛ خطوط بین from و to؛ closing = opening + جمع بازه.
   */
  async customerStatement(
    customerId: string,
    from: string | null,
    to: string | null,
  ): Promise<{ opening_balance: string; closing_balance: string; lines: StatementLine[] }> {
    const opening = await this.pool.query<{ opening: string }>(
      `select coalesce(sum(debit - credit), 0)::text as opening
         from customer_ledger_entry
        where customer_id = $1 and ($2::date is null or entry_date < $2::date)`,
      [customerId, from],
    );
    const openingBalance = Number(opening.rows[0]?.opening ?? '0');

    const { rows } = await this.pool.query<{
      at: string;
      doc_type: string;
      doc_id: string;
      debit: string;
      credit: string;
    }>(
      `select e.created_at as at, e.doc_type, e.doc_id, e.debit::text, e.credit::text
         from customer_ledger_entry e
        where e.customer_id = $1
          and ($2::date is null or e.entry_date >= $2::date)
          and ($3::date is null or e.entry_date <= $3::date)
        order by e.entry_date, e.id`,
      [customerId, from, to],
    );

    // شماره سند از جدول مبدأ هر doc_type خوانده می‌شود (invoice/credit_note/receipt)
    const docNumbers = await this.resolveDocNumbers(
      rows.map((r) => ({ doc_type: r.doc_type, doc_id: r.doc_id })),
    );

    let running = openingBalance;
    const lines: StatementLine[] = rows.map((r) => {
      running += Number(r.debit) - Number(r.credit);
      return {
        at: r.at,
        doc_type: r.doc_type,
        doc_number: docNumbers.get(`${r.doc_type}:${r.doc_id}`) ?? '',
        debit: r.debit,
        credit: r.credit,
        balance: running.toFixed(2),
      };
    });

    return {
      opening_balance: openingBalance.toFixed(2),
      closing_balance: running.toFixed(2),
      lines,
    };
  }

  /** شماره سند هر ردیف دفتر — join روی جدول مبدأ بر اساس doc_type */
  private async resolveDocNumbers(
    entries: { doc_type: string; doc_id: string }[],
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (entries.length === 0) return map;
    const byType = new Map<string, string[]>();
    for (const e of entries) {
      const arr = byType.get(e.doc_type) ?? [];
      arr.push(e.doc_id);
      byType.set(e.doc_type, arr);
    }
    const tableOf: Record<string, string> = {
      invoice: 'invoice',
      credit_note: 'credit_note',
      receipt: 'payment_receipt',
    };
    const queries = [...byType.entries()].map(async ([docType, ids]) => {
      const table = tableOf[docType];
      if (!table) return;
      const { rows } = await this.pool.query<{ id: string; doc_number: string }>(
        `select id, doc_number from ${table} where id = any($1::uuid[])`,
        [ids],
      );
      for (const r of rows) map.set(`${docType}:${r.id}`, r.doc_number);
    });
    await Promise.all(queries);
    return map;
  }

  // ---------------- AP: مانده تأمین‌کنندگان ----------------

  async apBalances(
    companyId: string,
    query: ListApQueryDto,
  ): Promise<{ items: SupplierBalance[]; nextCursor: string | null; hasMore: boolean }> {
    const limit = query.limit ?? 50;
    const params: unknown[] = [companyId];
    const filters: string[] = ['s.company_id = $1'];
    if (query.supplier_person_id) {
      params.push(query.supplier_person_id);
      filters.push(`s.person_id = $${params.length}`);
    }
    if (query.cursor) {
      params.push(decodeCursor(query.cursor));
      filters.push(`s.code > $${params.length}`);
    }
    params.push(limit + 1);
    const limitParam = `$${params.length}`;

    const { rows } = await this.pool.query<SupplierBalance & { code_key: string }>(
      `select s.person_id                    as supplier_person_id,
              s.code                          as code_key,
              coalesce(nullif(p.legal_name, ''),
                       nullif(trim(coalesce(p.first_name,'') || ' ' || coalesce(p.last_name,'')), ''),
                       s.code)                as supplier_name,
              coalesce(led.payable, 0)::text  as total_payable,
              nxt.due_next                    as due_next
         from supplier s
         join person p on p.id = s.person_id
         left join (
           select supplier_id, sum(debit - credit) as payable
             from supplier_ledger_entry
            group by supplier_id
         ) led on led.supplier_id = s.id
         left join lateral (
           select min(si.due_date)::text as due_next
             from supplier_invoice si
            where si.supplier_id = s.id
              and si.status in ('draft','matched','approved','partially_paid')
              and si.due_date is not null
         ) nxt on true
        where ${filters.join(' and ')}
        order by s.code
        limit ${limitParam}`,
      params,
    );

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page.map(({ code_key: _k, ...rest }) => rest as SupplierBalance),
      hasMore,
      nextCursor: hasMore && last ? encodeCursor(last.code_key) : null,
    };
  }

  // ---------------- Treasury: موقعیت صندوق/بانک ----------------

  async treasuryPositions(
    companyId: string,
    query: ListTreasuryQueryDto,
  ): Promise<TreasuryPosition[]> {
    const asOf = query.as_of ?? null;
    const params: unknown[] = [companyId, asOf];
    const asOfParam = '$2';
    const bankFilter: string[] = [];
    if (query.bank_account_id) {
      params.push(query.bank_account_id);
      bankFilter.push(`ba.id = $${params.length}`);
    }
    const bankWhere = bankFilter.length ? `and (${bankFilter.join(' and ')})` : '';

    // مانده دفتری بانک = افتتاحیه + وصولی‌های posted به آن بانک − پرداخت‌های posted از آن
    const banks = await this.pool.query<TreasuryPosition>(
      `select ba.id                                   as bank_account_id,
              ba.title                                as title,
              (ba.opening_balance
                 + coalesce(rc.sum, 0)
                 - coalesce(pv.sum, 0))::text         as balance_book,
              st.closing_balance::text                as balance_actual,
              (st.closing_balance
                 - (ba.opening_balance + coalesce(rc.sum,0) - coalesce(pv.sum,0)))::text as variance,
              coalesce(${asOfParam}::date, current_date)::text as as_of
         from bank_account ba
         join branch b on b.id = ba.branch_id
         left join (
           select bank_account_id, sum(amount) as sum
             from payment_receipt
            where status in ('posted','allocated','partially_allocated')
              and ($2::date is null or receipt_date <= $2::date)
            group by bank_account_id
         ) rc on rc.bank_account_id = ba.id
         left join (
           select bank_account_id, sum(amount) as sum
             from payment_voucher
            where status = 'posted'
              and ($2::date is null or payment_date <= $2::date)
            group by bank_account_id
         ) pv on pv.bank_account_id = ba.id
         left join lateral (
           select closing_balance from bank_statement bs
            where bs.bank_account_id = ba.id
              and ($2::date is null or bs.period_end <= $2::date)
            order by bs.period_end desc limit 1
         ) st on true
        where b.company_id = $1 and ba.is_active ${bankWhere}
        order by ba.title`,
      params,
    );

    // صندوق‌ها: مانده از cash_txn (in − out)
    const cashBoxes = await this.pool.query<TreasuryPosition>(
      `select null::uuid                              as bank_account_id,
              cb.title                                as title,
              coalesce(tx.sum, 0)::text               as balance_book,
              null::text                              as balance_actual,
              null::text                              as variance,
              coalesce(${asOfParam}::date, current_date)::text as as_of
         from cash_box cb
         join branch b on b.id = cb.branch_id
         left join (
           select cash_box_id,
                  sum(case when direction = 'in' then amount else -amount end) as sum
             from cash_txn
            where ($2::date is null or occurred_at::date <= $2::date)
            group by cash_box_id
         ) tx on tx.cash_box_id = cb.id
        where b.company_id = $1 and cb.is_active
        order by cb.title`,
      params,
    );

    return [...banks.rows, ...cashBoxes.rows];
  }
}
