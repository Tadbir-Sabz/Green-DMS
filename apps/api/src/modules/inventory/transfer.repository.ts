import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import type { CreateTransferDto } from './stock.dto';

export interface TransferRow extends QueryResultRow {
  id: string;
  doc_number: string;
  from_warehouse_id: string;
  to_warehouse_id: string;
  status: string;
}

export interface TransferLineRow extends QueryResultRow {
  product_id: string;
  batch_id: string | null;
  qty: number;
}

const encodeCursor = (id: string): string => Buffer.from(id, 'utf8').toString('base64url');
const decodeCursor = (cursor: string): string => Buffer.from(cursor, 'base64url').toString('utf8');

const COLUMNS = 'id, doc_number, from_warehouse_id, to_warehouse_id, status';

@Injectable()
export class TransferRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list(
    companyId: string,
    query: { cursor?: string; limit?: number },
  ): Promise<{ items: TransferRow[]; nextCursor: string | null; hasMore: boolean }> {
    const limit = query.limit ?? 50;
    const params: unknown[] = [companyId];
    const where: string[] = ['t.branch_id in (select id from branch where company_id = $1)'];
    if (query.cursor) {
      params.push(decodeCursor(query.cursor));
      where.push(`t.id > $${params.length}`);
    }
    params.push(limit + 1);

    const { rows } = await this.pool.query<TransferRow>(
      `select ${COLUMNS} from stock_transfer t
        where ${where.join(' and ')}
        order by t.id
        limit $${params.length}`,
      params,
    );
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return { items: page, hasMore, nextCursor: hasMore && last ? encodeCursor(last.id) : null };
  }

  async findById(companyId: string, id: string): Promise<TransferRow | null> {
    const { rows } = await this.pool.query<TransferRow>(
      `select ${COLUMNS} from stock_transfer t
        where t.id = $1 and t.branch_id in (select id from branch where company_id = $2)`,
      [id, companyId],
    );
    return rows[0] ?? null;
  }

  async findLines(transferId: string): Promise<TransferLineRow[]> {
    const { rows } = await this.pool.query<TransferLineRow>(
      `select product_id, batch_id, qty::float8 as qty
         from stock_transfer_line
        where stock_transfer_id = $1
        order by product_id`,
      [transferId],
    );
    return rows;
  }

  /**
   * ثبت انتقال با وضعیت draft (header + خطوط در یک تراکنش).
   * شعبهٔ سند از انبار مبدأ گرفته می‌شود؛ doc_number از شناسهٔ سند ساخته می‌شود.
   */
  async insert(companyId: string, dto: CreateTransferDto): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const branch = await client.query<{ branch_id: string }>(
        `select w.branch_id from warehouse w join branch b on b.id = w.branch_id
          where w.id = $1 and b.company_id = $2`,
        [dto.from_warehouse_id, companyId],
      );
      if (branch.rowCount === 0) throw Object.assign(new Error('warehouse not found'), { pgCode: 'no_data' });

      const id = randomUUID();
      const docNumber = `TR-${id.slice(0, 8).toUpperCase()}`;
      await client.query(
        `insert into stock_transfer (id, branch_id, doc_number, from_warehouse_id, to_warehouse_id, status)
         values ($1, $2, $3, $4, $5, 'draft')`,
        [id, branch.rows[0].branch_id, docNumber, dto.from_warehouse_id, dto.to_warehouse_id],
      );
      for (const line of dto.lines ?? []) {
        await client.query(
          `insert into stock_transfer_line (stock_transfer_id, product_id, batch_id, qty, unit_cost)
           values ($1, $2, $3, $4, 0)`,
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

  /** اعتبارسنجی اینکه هر دو انبار متعلق به شرکت‌اند و متفاوت‌اند */
  async warehousesValid(companyId: string, fromId: string, toId: string): Promise<{ valid: boolean; same: boolean }> {
    const { rows } = await this.pool.query<{ id: string }>(
      `select w.id from warehouse w join branch b on b.id = w.branch_id
        where w.id = any($1::uuid[]) and b.company_id = $2`,
      [[fromId, toId], companyId],
    );
    return { valid: rows.length === 2, same: fromId === toId };
  }
}
