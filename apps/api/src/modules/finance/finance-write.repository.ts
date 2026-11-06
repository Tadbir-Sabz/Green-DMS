import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import type { DocNumberService } from '../../common/doc-number.service';
import { DOC_NUMBER_SERVICE } from '../../common/doc-number.service';
import type {
  ApproveTreasuryCloseDto,
  CreateChequeDto,
  CreatePaymentDto,
  CreateTreasuryCloseDto,
  ReceiptAllocationDto,
  UpdateChequeDto,
} from './finance.dto';

/** ردیف چک — شکل API (schemas.Cheque) */
export interface ChequeRow extends QueryResultRow {
  id: string;
  direction: string;
  person_id: string | null;
  bank_account_id: string | null;
  amount: string;
  cheque_number: string | null;
  bank_name: string | null;
  due_date: string;
  status: string;
  cleared_at: string | null;
}

/** ردیف رسید — شکل API (schemas.PaymentReceipt) */
export interface PaymentRow extends QueryResultRow {
  id: string;
  doc_number: string;
  customer_id: string;
  method_id: string;
  amount: string;
  paid_at: string;
  pos_terminal_id: string | null;
  reference: string | null;
  tour_id: string | null;
  allocations?: { invoice_id: string; amount: string }[];
}

/** ردیف بستن روزانهٔ خزانه — شکل API (schemas.TreasuryClose) */
export interface TreasuryCloseRow extends QueryResultRow {
  id: string;
  branch_id: string;
  close_date: string;
  cash_expected: string;
  cash_counted: string;
  bank_balance: string;
  cheque_in_hand_amount: string;
  /** مغایرت صندوق = شمارش‌شده − مورد انتظار (محاسبهٔ سمت سرور) */
  cash_variance: string;
  status: string;
  note: string | null;
  closed_by: string | null;
  approved_by: string | null;
}

const encodeCursor = (v: string): string => Buffer.from(v, 'utf8').toString('base64url');
const decodeCursor = (cursor: string): string => Buffer.from(cursor, 'base64url').toString('utf8');

/** نگاشت وضعیت API ← وضعیت ذخیره‌شده در cheque (DDL مهاجرت 0013) */
const API_TO_DB_STATUS: Record<string, string> = {
  pending: 'in_hand',
  cleared: 'cleared',
  bounced: 'bounced',
  returned: 'returned',
};
/** نگاشت معکوس: وضعیت‌های میانی DB به pending API نگاشت می‌شوند */
const DB_TO_API_STATUS: Record<string, string> = {
  in_hand: 'pending',
  deposited: 'pending',
  settled: 'pending',
  cleared: 'cleared',
  bounced: 'bounced',
  returned: 'returned',
  cancelled: 'returned',
};

const mapChequeStatus = (db: string): string => DB_TO_API_STATUS[db] ?? 'pending';

/**
 * نوشتن چک و رسید وصول (ماژول ۷/۱۰). رسید در یک تراکنش: هدر + تخصیص‌ها +
 * به‌روزرسانی paid_amount فاکتورها + ثبت در دفتر بدهکاری مشتری (customer_ledger_entry).
 * trigger fn_check_allocation سقف تخصیص را کنترل می‌کند؛ اینجا هم پیش‌دستی بررسی
 * می‌شود تا پیام فارسی قرارداد (نه خطای خام DB) برگردد.
 */
@Injectable()
export class FinanceWriteRepository {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(DOC_NUMBER_SERVICE) private readonly docNumbers: DocNumberService,
  ) {}

  // ---------------- Cheques ----------------

  async listCheques(
    companyId: string,
    query: {
      cursor?: string;
      limit?: number;
      direction?: string;
      status?: string;
      due_from?: string;
      due_to?: string;
    },
  ): Promise<{ items: ChequeRow[]; nextCursor: string | null; hasMore: boolean }> {
    const limit = query.limit ?? 50;
    const params: unknown[] = [companyId];
    const where: string[] = ['ch.branch_id in (select id from branch where company_id = $1)'];
    if (query.direction) {
      params.push(query.direction);
      where.push(`ch.direction = $${params.length}`);
    }
    if (query.status) {
      // وضعیت API به مجموعه وضعیت‌های DB نگاشت می‌شود
      const dbStatuses = Object.entries(DB_TO_API_STATUS)
        .filter(([, api]) => api === query.status)
        .map(([db]) => db);
      params.push(dbStatuses);
      where.push(`ch.status = any($${params.length})`);
    }
    if (query.due_from) {
      params.push(query.due_from);
      where.push(`ch.due_date >= $${params.length}::date`);
    }
    if (query.due_to) {
      params.push(query.due_to);
      where.push(`ch.due_date <= $${params.length}::date`);
    }
    if (query.cursor) {
      params.push(decodeCursor(query.cursor));
      where.push(`ch.serial_no > $${params.length}`);
    }
    params.push(limit + 1);
    const limitParam = `$${params.length}`;

    const { rows } = await this.pool.query<ChequeRow & { cursor_key: string }>(
      `select ch.id,
              ch.direction,
              coalesce(cu.person_id, su.person_id)  as person_id,
              ch.bank_account_id,
              ch.amount::text                        as amount,
              ch.serial_no                           as cheque_number,
              ch.bank_name                           as bank_name,
              ch.due_date::text                      as due_date,
              ch.clearance_date                        as cleared_at,
              ch.serial_no                           as cursor_key,
              ch.status                              as db_status
         from cheque ch
         left join customer cu on cu.id = ch.customer_id
         left join supplier su on su.id = ch.supplier_id
        where ${where.join(' and ')}
        order by ch.serial_no
        limit ${limitParam}`,
      params,
    );

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const items = page.map((r) => this.shapeCheque(r));
    return {
      items,
      hasMore,
      nextCursor: hasMore && last ? encodeCursor(last.cursor_key) : null,
    };
  }

  private shapeCheque(r: ChequeRow & { db_status?: string; cursor_key?: string }): ChequeRow {
    const { db_status, cursor_key: _k, ...rest } = r as ChequeRow & {
      db_status?: string;
      cursor_key?: string;
    };
    return {
      ...rest,
      status: mapChequeStatus((db_status ?? r.status) as string),
    };
  }

  async findCheque(companyId: string, id: string): Promise<ChequeRow | null> {
    const { rows } = await this.pool.query<ChequeRow & { db_status: string }>(
      `select ch.id, ch.direction,
              coalesce(cu.person_id, su.person_id) as person_id,
              ch.bank_account_id, ch.amount::text as amount,
              ch.serial_no as cheque_number, ch.bank_name as bank_name,
              ch.due_date::text as due_date, ch.clearance_date as cleared_at,
              ch.status as db_status
         from cheque ch
         left join customer cu on cu.id = ch.customer_id
         left join supplier su on su.id = ch.supplier_id
        where ch.id = $1
          and ch.branch_id in (select id from branch where company_id = $2)`,
      [id, companyId],
    );
    return rows[0] ? this.shapeCheque(rows[0]) : null;
  }

  /** شعبه + طرف (customer/supplier) برای ثبت چک؛ null یعنی ارجاع نامعتبر */
  async resolveChequeParty(
    companyId: string,
    dto: CreateChequeDto,
  ): Promise<{ branchId: string; customerId: string | null; supplierId: string | null } | null> {
    if (dto.direction === 'received') {
      if (!dto.person_id) return null;
      const { rows } = await this.pool.query<{ id: string; branch_id: string }>(
        `select c.id, c.branch_id from customer c join branch b on b.id = c.branch_id
          where c.person_id = $1 and b.company_id = $2 and c.deleted_at is null limit 1`,
        [dto.person_id, companyId],
      );
      return rows[0] ? { branchId: rows[0].branch_id, customerId: rows[0].id, supplierId: null } : null;
    }
    if (!dto.person_id) return null;
    const { rows } = await this.pool.query<{ id: string; branch_id: string }>(
      `select s.id, br.id as branch_id
         from supplier s
         join company co on co.id = s.company_id
         cross join lateral (
           select id from branch where company_id = co.id and is_active order by code limit 1
         ) br
        where s.person_id = $1 and co.id = $2 limit 1`,
      [dto.person_id, companyId],
    );
    return rows[0] ? { branchId: rows[0].branch_id, customerId: null, supplierId: rows[0].id } : null;
  }

  async insertCheque(
    dto: CreateChequeDto,
    party: { branchId: string; customerId: string | null; supplierId: string | null },
  ): Promise<string> {
    const id = randomUUID();
    const serial = dto.cheque_number?.trim() || id.slice(0, 8).toUpperCase();
    await this.pool.query(
      `insert into cheque
         (id, branch_id, direction, serial_no, bank_name, amount, due_date,
          customer_id, supplier_id, bank_account_id, status)
       values ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10, $11)`,
      [
        id,
        party.branchId,
        dto.direction,
        serial,
        dto.bank_name?.trim() || 'نامشخص',
        dto.amount,
        dto.due_date,
        party.customerId,
        party.supplierId,
        dto.bank_account_id ?? null,
        API_TO_DB_STATUS[dto.status ?? 'pending'] ?? 'in_hand',
      ],
    );
    return id;
  }

  async updateCheque(
    companyId: string,
    id: string,
    dto: UpdateChequeDto,
  ): Promise<boolean> {
    const sets: string[] = [];
    const params: unknown[] = [id, companyId];
    const add = (fragment: string, value: unknown): void => {
      params.push(value);
      sets.push(fragment.replace('$?', `$${params.length}`));
    };
    if (dto.status !== undefined) add('status = $?', API_TO_DB_STATUS[dto.status] ?? 'in_hand');
    if (dto.cleared_at !== undefined) add('clearance_date = $?::date', dto.cleared_at);
    if (dto.cheque_number !== undefined) add('serial_no = $?', dto.cheque_number);
    if (dto.bank_account_id !== undefined) add('bank_account_id = $?', dto.bank_account_id);
    if (sets.length === 0) return true;
    const { rows } = await this.pool.query<{ id: string }>(
      `update cheque set ${sets.join(', ')}
        where id = $1 and branch_id in (select id from branch where company_id = $2)
        returning id`,
      params,
    );
    return rows.length > 0;
  }

  // ---------------- Payments (AR receipts) ----------------

  async listPayments(
    companyId: string,
    query: { cursor?: string; limit?: number; customer_id?: string; kind?: string },
  ): Promise<{ items: PaymentRow[]; nextCursor: string | null; hasMore: boolean }> {
    const limit = query.limit ?? 50;
    const params: unknown[] = [companyId];
    const where: string[] = ['pr.branch_id in (select id from branch where company_id = $1)'];
    if (query.customer_id) {
      params.push(query.customer_id);
      where.push(`pr.customer_id = $${params.length}`);
    }
    if (query.kind) {
      params.push(query.kind);
      where.push(`pm.kind = $${params.length}`);
    }
    if (query.cursor) {
      params.push(decodeCursor(query.cursor));
      where.push(`pr.doc_number > $${params.length}`);
    }
    params.push(limit + 1);
    const limitParam = `$${params.length}`;

    const { rows } = await this.pool.query<PaymentRow & { cursor_key: string }>(
      `select pr.id, pr.doc_number, pr.customer_id,
              pr.payment_method_id as method_id, pr.amount::text as amount,
              pr.created_at as paid_at, pr.psp_transaction_id as pos_terminal_id,
              pr.reference_no as reference, pr.tour_settlement_id as tour_id,
              pr.doc_number as cursor_key
         from payment_receipt pr
         join payment_method pm on pm.id = pr.payment_method_id
        where ${where.join(' and ')}
        order by pr.doc_number
        limit ${limitParam}`,
      params,
    );

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const items = page.map(({ cursor_key: _k, ...rest }) => rest as PaymentRow);
    return {
      items,
      hasMore,
      nextCursor: hasMore && last ? encodeCursor(last.cursor_key) : null,
    };
  }

  async findPayment(companyId: string, id: string): Promise<PaymentRow | null> {
    const { rows } = await this.pool.query<PaymentRow>(
      `select pr.id, pr.doc_number, pr.customer_id,
              pr.payment_method_id as method_id, pr.amount::text as amount,
              pr.created_at as paid_at, pr.psp_transaction_id as pos_terminal_id,
              pr.reference_no as reference, pr.tour_settlement_id as tour_id
         from payment_receipt pr
        where pr.id = $1
          and pr.branch_id in (select id from branch where company_id = $2)`,
      [id, companyId],
    );
    const row = rows[0];
    if (!row) return null;
    row.allocations = await this.findAllocations(id);
    return row;
  }

  private async findAllocations(
    receiptId: string,
  ): Promise<{ invoice_id: string; amount: string }[]> {
    const { rows } = await this.pool.query<{ invoice_id: string; amount: string }>(
      `select invoice_id, amount::text as amount from receipt_allocation
        where receipt_id = $1 order by invoice_id`,
      [receiptId],
    );
    return rows;
  }

  /** مشتری + شعبه + method معتبر؛ null یعنی ارجاع نامعتبر */
  async resolvePaymentRefs(
    companyId: string,
    dto: CreatePaymentDto,
  ): Promise<{ branchId: string; methodKind: string; requiresReference: boolean } | null> {
    const { rows } = await this.pool.query<{ branch_id: string }>(
      `select c.branch_id from customer c join branch b on b.id = c.branch_id
        where c.id = $1 and b.company_id = $2 and c.deleted_at is null limit 1`,
      [dto.customer_id, companyId],
    );
    if (!rows[0]) return null;
    const method = await this.pool.query<{ kind: string; requires_reference: boolean }>(
      `select kind, requires_reference from payment_method where id = $1 and is_active`,
      [dto.method_id],
    );
    if (!method.rows[0]) return null;
    return {
      branchId: rows[0].branch_id,
      methodKind: method.rows[0].kind,
      requiresReference: method.rows[0].requires_reference,
    };
  }

  /** مانده باز هر فاکتور (grand_total − paid − credit_noteهای posted) */
  async invoiceOpenBalances(
    invoiceIds: string[],
  ): Promise<Map<string, { branchId: string; open: number; paid: number; total: number }>> {
    const map = new Map<string, { branchId: string; open: number; paid: number; total: number }>();
    if (invoiceIds.length === 0) return map;
    const { rows } = await this.pool.query<{
      id: string;
      branch_id: string;
      grand_total: string;
      paid_amount: string;
      credit: string;
    }>(
      `select i.id, i.branch_id, i.grand_total::text, i.paid_amount::text,
              coalesce(cn.credit_total, 0)::text as credit
         from invoice i
         left join (
           select invoice_id, sum(amount) as credit_total from credit_note
            where status = 'posted' group by 1
         ) cn on cn.invoice_id = i.id
        where i.id = any($1::uuid[])`,
      [invoiceIds],
    );
    for (const r of rows) {
      const total = Number(r.grand_total);
      const paid = Number(r.paid_amount);
      const credit = Number(r.credit);
      map.set(r.id, {
        branchId: r.branch_id,
        total,
        paid,
        open: Math.max(total - paid - credit, 0),
      });
    }
    return map;
  }

  /**
   * ثبت رسید + تخصیص‌ها + اثر روی فاکتور و دفتر مشتری — همه در یک تراکنش.
   * client از بیرون گرفته می‌شود تا شماره سند و insert اتمیک باشند.
   */
  async insertPayment(
    dto: CreatePaymentDto,
    refs: { branchId: string },
    allocations: ReceiptAllocationDto[],
  ): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const fiscalYear = new Date().getFullYear();
      const { doc_number, fiscal_year } = await this.docNumbers.next(
        refs.branchId,
        'receipt',
        { client },
      );
      const id = randomUUID();
      const amount = Number(dto.amount);
      const allocTotal = allocations.reduce((s, a) => s + Number(a.amount), 0);
      const status =
        allocations.length === 0
          ? 'posted'
          : allocTotal >= amount - 0.004
            ? 'allocated'
            : 'partially_allocated';

      // مقصد رسید: method نقد/چک → cash_box یا bank؛ برای سادگی bank_account از dto
      await client.query(
        `insert into payment_receipt
           (id, branch_id, doc_number, fiscal_year, customer_id, payment_method_id,
            amount, allocated_amount, bank_account_id, reference_no, status)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          id,
          refs.branchId,
          doc_number,
          fiscal_year,
          dto.customer_id,
          dto.method_id,
          dto.amount,
          allocTotal.toFixed(2),
          dto.pos_terminal_id ?? null,
          dto.reference ?? null,
          status,
        ],
      );

      // تخصیص‌ها + به‌روزرسانی paid_amount/وضعیت هر فاکتور.
      // مرتب‌سازی بر پایهٔ invoice_id تا قفل‌های «for update» تریگر fn_check_allocation
      // (مهاجرت 0034) در همهٔ تراکنش‌ها با ترتیبِ یکسان گرفته شوند و دو رسیدِ هم‌زمان روی
      // مجموعهٔ مشترکی از فاکتورها به بن‌بست (deadlock) نرسند. عملیات هر فاکتور جابه‌جایی‌پذیر
      // است، پس این صرفاً یک بازمرتب‌سازی بدون تغییرِ رفتار است.
      const orderedAllocations = [...allocations].sort((x, y) =>
        x.invoice_id < y.invoice_id ? -1 : x.invoice_id > y.invoice_id ? 1 : 0,
      );
      for (const a of orderedAllocations) {
        await client.query(
          `insert into receipt_allocation (receipt_id, invoice_id, amount)
           values ($1, $2, $3)`,
          [id, a.invoice_id, a.amount],
        );
        await client.query(
          `update invoice
              set paid_amount = paid_amount + $2::numeric,
                  status = case
                    when paid_amount + $2::numeric >= grand_total then 'paid'
                    else 'partially_paid' end
            where id = $1`,
          [a.invoice_id, a.amount],
        );
      }

      // دفتر بدهکاری مشتری: وصول = credit (کاهش بدهی)
      await client.query(
        `insert into customer_ledger_entry
           (branch_id, customer_id, entry_date, doc_type, doc_id, description, debit, credit)
         values ($1, $2, current_date, 'receipt', $3, $4, 0, $5)`,
        [refs.branchId, dto.customer_id, id, `رسید وصول ${doc_number}`, dto.amount],
      );

      await client.query('commit');
      return id;
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------- Treasury daily close ----------------

  /** شعبه باید به این شرکت تعلق داشته باشد (daily_treasury_close کلید branch_id دارد) */
  async branchBelongsToCompany(companyId: string, branchId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      `select 1 from branch where id = $1 and company_id = $2`,
      [branchId, companyId],
    );
    return rows.length > 0;
  }

  private readonly closeSelect = `
    select id, branch_id, close_date::text as close_date,
           cash_expected::text, cash_counted::text, bank_balance::text,
           cheque_in_hand_amount::text,
           (cash_counted - cash_expected)::text as cash_variance,
           status, note, closed_by, approved_by
      from daily_treasury_close`;

  async listTreasuryCloses(
    companyId: string,
    query: {
      cursor?: string;
      limit?: number;
      branch_id?: string;
      status?: string;
      from?: string;
      to?: string;
    },
  ): Promise<{ items: TreasuryCloseRow[]; nextCursor: string | null; hasMore: boolean }> {
    const limit = query.limit ?? 50;
    const params: unknown[] = [companyId];
    const where: string[] = ['branch_id in (select id from branch where company_id = $1)'];
    if (query.branch_id) {
      params.push(query.branch_id);
      where.push(`branch_id = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      where.push(`status = $${params.length}`);
    }
    if (query.from) {
      params.push(query.from);
      where.push(`close_date >= $${params.length}::date`);
    }
    if (query.to) {
      params.push(query.to);
      where.push(`close_date <= $${params.length}::date`);
    }
    // cursor مرکب: «close_date|id» — keyset با ترتیب (close_date desc, id desc)
    if (query.cursor) {
      const raw = decodeCursor(query.cursor);
      const sep = raw.indexOf('|');
      if (sep > 0) {
        params.push(raw.slice(0, sep), raw.slice(sep + 1));
        where.push(`(close_date, id) < ($${params.length - 1}::date, $${params.length}::uuid)`);
      }
    }
    params.push(limit + 1);
    const limitParam = `$${params.length}`;

    const { rows } = await this.pool.query<TreasuryCloseRow>(
      `${this.closeSelect}
        where ${where.join(' and ')}
        order by close_date desc, id desc
        limit ${limitParam}`,
      params,
    );
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page,
      hasMore,
      nextCursor: hasMore && last ? encodeCursor(`${last.close_date}|${last.id}`) : null,
    };
  }

  async findTreasuryClose(companyId: string, id: string): Promise<TreasuryCloseRow | null> {
    const { rows } = await this.pool.query<TreasuryCloseRow>(
      `${this.closeSelect}
        where id = $1 and branch_id in (select id from branch where company_id = $2)`,
      [id, companyId],
    );
    return rows[0] ?? null;
  }

  /** ثبت و بستن روزانه (status='closed') — uq(branch_id, close_date) در mapDbError */
  async insertTreasuryClose(
    companyId: string,
    userId: string,
    dto: CreateTreasuryCloseDto,
  ): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `insert into daily_treasury_close
         (branch_id, close_date, cash_expected, cash_counted, bank_balance,
          cheque_in_hand_amount, status, closed_by, note)
       values ($1, $2::date, $3, $4, $5, $6, 'closed', $7, $8)
       returning id`,
      [
        dto.branch_id,
        dto.close_date,
        dto.cash_expected ?? '0',
        dto.cash_counted ?? '0',
        dto.bank_balance ?? '0',
        dto.cheque_in_hand_amount ?? '0',
        userId,
        dto.note ?? null,
      ],
    );
    return rows[0].id;
  }

  /**
   * تأیید بستن روزانه — فقط از وضعیت 'closed' به 'approved'.
   * ردیف به‌روزشده را برمی‌گرداند یا null (یافت نشد / در وضعیت بسته نبود).
   */
  async approveTreasuryClose(
    companyId: string,
    id: string,
    userId: string,
    dto: ApproveTreasuryCloseDto,
  ): Promise<TreasuryCloseRow | null> {
    const { rows } = await this.pool.query<TreasuryCloseRow>(
      `update daily_treasury_close
          set status = 'approved', approved_by = $3, note = coalesce($4, note)
        where id = $1 and status = 'closed'
          and branch_id in (select id from branch where company_id = $2)
        returning id, branch_id, close_date::text as close_date,
          cash_expected::text, cash_counted::text, bank_balance::text,
          cheque_in_hand_amount::text,
          (cash_counted - cash_expected)::text as cash_variance,
          status, note, closed_by, approved_by`,
      [id, companyId, userId, dto.note ?? null],
    );
    return rows[0] ?? null;
  }
}
