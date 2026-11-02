import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import type { CreateWaybillDto } from './waybill.dto';

export interface WaybillRow extends QueryResultRow {
  id: string;
  doc_number: string;
  fiscal_year: number;
  sales_order_id: string;
  customer_id: string;
  warehouse_id: string;
  issued_at: string;
  status: string;
  note: string | null;
}

export interface WaybillLineRow extends QueryResultRow {
  product_id: string;
  batch_id: string | null;
  qty: number;
}

const encodeCursor = (id: string): string => Buffer.from(id, 'utf8').toString('base64url');
const decodeCursor = (cursor: string): string => Buffer.from(cursor, 'base64url').toString('utf8');

const COLUMNS =
  'w.id, w.doc_number, w.fiscal_year, w.sales_order_id, w.customer_id, w.warehouse_id, w.issued_at, w.status, w.note';

@Injectable()
export class WaybillRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list(
    companyId: string,
    query: { cursor?: string; limit?: number; order_id?: string; status?: string },
  ): Promise<{ items: WaybillRow[]; nextCursor: string | null; hasMore: boolean }> {
    const limit = query.limit ?? 50;
    const params: unknown[] = [companyId];
    const where: string[] = ['w.branch_id in (select id from branch where company_id = $1)'];
    if (query.order_id) {
      params.push(query.order_id);
      where.push(`w.sales_order_id = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      where.push(`w.status = $${params.length}`);
    }
    if (query.cursor) {
      params.push(decodeCursor(query.cursor));
      where.push(`w.id > $${params.length}`);
    }
    params.push(limit + 1);

    const { rows } = await this.pool.query<WaybillRow>(
      `select ${COLUMNS} from waybill w
        where ${where.join(' and ')}
        order by w.id
        limit $${params.length}`,
      params,
    );
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return { items: page, hasMore, nextCursor: hasMore && last ? encodeCursor(last.id) : null };
  }

  async findById(companyId: string, id: string): Promise<WaybillRow | null> {
    const { rows } = await this.pool.query<WaybillRow>(
      `select ${COLUMNS} from waybill w
        where w.id = $1 and w.branch_id in (select id from branch where company_id = $2)`,
      [id, companyId],
    );
    return rows[0] ?? null;
  }

  async findLines(waybillId: string): Promise<WaybillLineRow[]> {
    const { rows } = await this.pool.query<WaybillLineRow>(
      `select product_id, batch_id, qty::float8 as qty
         from waybill_line
        where waybill_id = $1
        order by line_no`,
      [waybillId],
    );
    return rows;
  }

  /**
   * ثبت حواله با وضعیت draft (header + خطوط در یک تراکنش).
   * شعبهٔ سند از انبار گرفته می‌شود؛ مشتری اگر ارسال نشده از سفارش فروش می‌آید.
   */
  async insert(companyId: string, dto: CreateWaybillDto): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');

      // انبار و سفارش باید متعلق به همین شرکت باشند؛ شعبه از انبار می‌آید
      const ctx = await client.query<{ branch_id: string; order_customer_id: string }>(
        `select w.branch_id, coalesce(o.customer_id, '00000000-0000-4000-8000-000000000000') as order_customer_id
           from warehouse w
           join branch b on b.id = w.branch_id
           left join sales_order o on o.id = $2 and o.branch_id = w.branch_id
          where w.id = $1 and b.company_id = $3`,
        [dto.warehouse_id, dto.sales_order_id, companyId],
      );
      if (ctx.rowCount === 0) throw Object.assign(new Error('warehouse or order not found'), { pgCode: 'no_data' });
      if (ctx.rows[0].order_customer_id === '00000000-0000-4000-8000-000000000000') {
        throw Object.assign(new Error('sales order not found'), { pgCode: 'no_data' });
      }

      const customerId = dto.customer_id ?? ctx.rows[0].order_customer_id;
      // مشتری در صورت ارسال باید در همان شرکت باشد
      if (dto.customer_id) {
        const cust = await client.query(
          `select c.id from customer c join branch b on b.id = c.branch_id
            where c.id = $1 and b.company_id = $2`,
          [dto.customer_id, companyId],
        );
        if (cust.rowCount === 0) throw Object.assign(new Error('customer not found'), { pgCode: 'no_data' });
      }

      const id = randomUUID();
      const docNumber = `WB-${id.slice(0, 8).toUpperCase()}`;
      await client.query(
        `insert into waybill
           (id, branch_id, doc_number, fiscal_year, sales_order_id, customer_id, warehouse_id, status, note)
         values ($1, $2, $3, extract(year from now())::int, $4, $5, $6, 'draft', $7)`,
        [id, ctx.rows[0].branch_id, docNumber, dto.sales_order_id, customerId, dto.warehouse_id, dto.note ?? null],
      );
      let lineNo = 0;
      for (const line of dto.lines ?? []) {
        lineNo += 1;
        await client.query(
          `insert into waybill_line (waybill_id, line_no, product_id, batch_id, qty)
           values ($1, $2, $3, $4, $5)`,
          [id, lineNo, line.product_id, line.batch_id ?? null, line.qty],
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

  /** اعتبارسنجی اینکه کالاهای خطوط در همان شرکت فعال‌اند (برای خطای پیام‌رسان) */
  async productsValid(companyId: string, productIds: string[]): Promise<boolean> {
    if (productIds.length === 0) return true;
    const { rows } = await this.pool.query<{ id: string }>(
      `select p.id from product p
        where p.id = any($1::uuid[]) and p.company_id = $2 and p.status = 'active'`,
      [productIds, companyId],
    );
    return rows.length === productIds.length;
  }
}
