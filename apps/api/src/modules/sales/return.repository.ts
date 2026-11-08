import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import type { CreateReturnDto, ReceiveReturnDto } from './return.dto';

export interface ReturnRow extends QueryResultRow {
  id: string;
  doc_number: string;
  customer_id: string;
  invoice_id: string | null;
  tour_id: string | null;
  reason_code: string;
  status: string;
  credit_note_id: string | null;
  requested_at: string;
  approved_at: string | null;
  note: string | null;
  /** TASK-24Y — درخواست‌دهنده؛ مبنای جلوگیری از خودتأییدی */
  requested_by: string | null;
}

export interface ReturnLineRow extends QueryResultRow {
  product_id: string;
  batch_id: string | null;
  qty: number;
  qty_approved: number | null;
  unit_price: number;
  disposition: string;
}

const encodeCursor = (id: string): string => Buffer.from(id, 'utf8').toString('base64url');
const decodeCursor = (cursor: string): string => Buffer.from(cursor, 'base64url').toString('utf8');

const COLUMNS =
  'r.id, r.doc_number, r.customer_id, r.invoice_id, r.tour_id, r.reason_code, r.status, r.credit_note_id, r.requested_at, r.approved_at, r.note, r.requested_by';

@Injectable()
export class ReturnRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list(
    companyId: string,
    query: { cursor?: string; limit?: number; customer_id?: string; status?: string },
  ): Promise<{ items: ReturnRow[]; nextCursor: string | null; hasMore: boolean }> {
    const limit = query.limit ?? 50;
    const params: unknown[] = [companyId];
    const where: string[] = ['r.branch_id in (select id from branch where company_id = $1)'];
    if (query.customer_id) {
      params.push(query.customer_id);
      where.push(`r.customer_id = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      where.push(`r.status = $${params.length}`);
    }
    if (query.cursor) {
      params.push(decodeCursor(query.cursor));
      where.push(`r.id > $${params.length}`);
    }
    params.push(limit + 1);

    const { rows } = await this.pool.query<ReturnRow>(
      `select ${COLUMNS} from return_request r
        where ${where.join(' and ')}
        order by r.id
        limit $${params.length}`,
      params,
    );
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return { items: page, hasMore, nextCursor: hasMore && last ? encodeCursor(last.id) : null };
  }

  async findById(companyId: string, id: string): Promise<ReturnRow | null> {
    const { rows } = await this.pool.query<ReturnRow>(
      `select ${COLUMNS} from return_request r
        where r.id = $1 and r.branch_id in (select id from branch where company_id = $2)`,
      [id, companyId],
    );
    return rows[0] ?? null;
  }

  async findLines(returnId: string): Promise<ReturnLineRow[]> {
    const { rows } = await this.pool.query<ReturnLineRow>(
      `select product_id, batch_id, qty::float8 as qty, qty_approved::float8 as qty_approved,
              unit_price::float8 as unit_price, disposition
         from return_request_line
        where return_request_id = $1
        order by product_id`,
      [returnId],
    );
    return rows;
  }

  /** ثبت درخواست با وضعیت submitted (header + خطوط در یک تراکنش) */
  async insert(
    companyId: string,
    dto: CreateReturnDto,
    /**
     * TASK-24Y — درخواست‌دهنده. `return_request.requested_by` از ابتدا در جدول
     * بود ولی **هرگز پر نمی‌شد**؛ یعنی «تأییدکننده نباید درخواست‌دهنده باشد»
     * قابلِ اجرا نبود. ستونِ همیشه-null = کنترلِ ناموجود.
     */
    requestedBy: string | null = null,
  ): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');

      const branch = await client.query<{ branch_id: string }>(
        `select c.branch_id from customer c join branch b on b.id = c.branch_id
          where c.id = $1 and b.company_id = $2`,
        [dto.customer_id, companyId],
      );
      if (branch.rowCount === 0) throw Object.assign(new Error('customer not found'), { pgCode: 'no_data' });

      if (dto.invoice_id) {
        const inv = await client.query(
          `select i.id from invoice i join branch b on b.id = i.branch_id
            where i.id = $1 and b.company_id = $2`,
          [dto.invoice_id, companyId],
        );
        if (inv.rowCount === 0) throw Object.assign(new Error('invoice not found'), { pgCode: 'no_data' });
      }

      const id = randomUUID();
      const docNumber = `RT-${id.slice(0, 8).toUpperCase()}`;
      await client.query(
        `insert into return_request
           (id, branch_id, doc_number, customer_id, invoice_id, tour_id, reason_code, status, note,
            requested_by)
         values ($1, $2, $3, $4, $5, $6, $7, 'submitted', $8, $9)`,
        [
          id,
          branch.rows[0].branch_id,
          docNumber,
          dto.customer_id,
          dto.invoice_id ?? null,
          dto.tour_id ?? null,
          dto.reason_code,
          dto.note ?? null,
          requestedBy,
        ],
      );
      for (const line of dto.lines ?? []) {
        await client.query(
          `insert into return_request_line (return_request_id, product_id, batch_id, qty, unit_price, disposition)
           values ($1, $2, $3, $4, 0, 'restock')`,
          [id, line.product_id, line.batch_id ?? null, line.qty],
        );
      }
      await client.query('commit');
      return id;
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** تأیید: submitted → approved (به‌روزرسانی اتمیک با شرط وضعیت؛ false یعنی transition نامعتبر) */
  async approve(companyId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `update return_request set status = 'approved', approved_at = now()
        where id = $1
          and status = 'submitted'
          and branch_id in (select id from branch where company_id = $2)`,
      [id, companyId],
    );
    return (rowCount ?? 0) > 0;
  }

  /** دریافت: approved → posted با تعیین تکلیف هر قلم (qty_approved + disposition) */
  async receive(companyId: string, id: string, dto: ReceiveReturnDto): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const header = await client.query(
        `update return_request set status = 'posted'
          where id = $1
            and status in ('approved', 'partially_approved')
            and branch_id in (select id from branch where company_id = $2)
          returning id`,
        [id, companyId],
      );
      if (header.rowCount === 0) {
        await client.query('rollback');
        return false;
      }
      for (const line of dto.lines) {
        const updated = await client.query(
          `update return_request_line
             set qty_approved = $3, disposition = $4
            where return_request_id = $1 and product_id = $2`,
          [id, line.product_id, line.qty, line.disposition],
        );
        if (updated.rowCount === 0) {
          await client.query('rollback');
          return false;
        }
      }
      await client.query('commit');
      return true;
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
