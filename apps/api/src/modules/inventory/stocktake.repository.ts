import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import type { CreateStockTakeDto, StockTakeLineDto, UpdateStockTakeDto } from './stock.dto';

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

export interface StockTakeRow extends QueryResultRow {
  id: string;
  branch_id: string;
  warehouse_id: string;
  status: string;
  row_version: number;
}

export interface StockTakeLineRow extends QueryResultRow {
  product_id: string;
  batch_id: string | null;
  qty_system: number;
  qty_counted: number | null;
  variance: number;
}

const encodeCursor = (id: string): string => Buffer.from(id, 'utf8').toString('base64url');
const decodeCursor = (cursor: string): string => Buffer.from(cursor, 'base64url').toString('utf8');

const COLUMNS = 'id, branch_id, warehouse_id, status, row_version';

@Injectable()
export class StocktakeRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list(
    companyId: string,
    query: { status?: string; cursor?: string; limit?: number },
  ): Promise<{ items: StockTakeRow[]; nextCursor: string | null; hasMore: boolean }> {
    const limit = query.limit ?? 50;
    const params: unknown[] = [companyId];
    const where: string[] = ['s.branch_id in (select id from branch where company_id = $1)'];

    if (query.status) {
      params.push(query.status);
      where.push(`s.status = $${params.length}`);
    }
    if (query.cursor) {
      params.push(decodeCursor(query.cursor));
      where.push(`s.id > $${params.length}`);
    }
    params.push(limit + 1);

    const { rows } = await this.pool.query<StockTakeRow>(
      `select ${COLUMNS} from stock_count s
        where ${where.join(' and ')}
        order by s.id
        limit $${params.length}`,
      params,
    );
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return { items: page, hasMore, nextCursor: hasMore && last ? encodeCursor(last.id) : null };
  }

  async findById(companyId: string, id: string): Promise<StockTakeRow | null> {
    const { rows } = await this.pool.query<StockTakeRow>(
      `select ${COLUMNS} from stock_count s
        where s.id = $1 and s.branch_id in (select id from branch where company_id = $2)`,
      [id, companyId],
    );
    return rows[0] ?? null;
  }

  async findLines(stockTakeId: string): Promise<StockTakeLineRow[]> {
    const { rows } = await this.pool.query<StockTakeLineRow>(
      `select product_id, batch_id,
              qty_system::float8 as qty_system,
              qty_counted::float8 as qty_counted,
              (coalesce(qty_counted, 0) - qty_system)::float8 as variance
         from stock_count_line
        where stock_count_id = $1
        order by product_id`,
      [stockTakeId],
    );
    return rows;
  }

  /** مانده فعلی سیستم برای یک کالا/بچ در انبار (مرجع شمارش) */
  private async systemQty(warehouseId: string, productId: string, batchId: string | null): Promise<number> {
    const { rows } = await this.pool.query<{ q: string }>(
      batchId
        ? `select qty_on_hand::text as q from stock_balance where warehouse_id = $1 and product_id = $2 and batch_id = $3`
        : `select qty_on_hand::text as q from stock_balance where warehouse_id = $1 and product_id = $2 and batch_id is null`,
      batchId ? [warehouseId, productId, batchId] : [warehouseId, productId],
    );
    return rows[0] ? Number(rows[0].q) : 0;
  }

  /** شعبهٔ انبار (برای سند)؛ null اگر انبار در شرکت نباشد */
  async resolveWarehouseBranch(companyId: string, warehouseId: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ branch_id: string }>(
      `select w.branch_id from warehouse w join branch b on b.id = w.branch_id
        where w.id = $1 and b.company_id = $2`,
      [warehouseId, companyId],
    );
    return rows[0]?.branch_id ?? null;
  }

  async insert(companyId: string, dto: CreateStockTakeDto, branchId: string): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const header = await client.query<{ id: string }>(
        `insert into stock_count (branch_id, warehouse_id, mode, status)
         values ($1, $2, 'full', 'draft') returning id`,
        [branchId, dto.warehouse_id],
      );
      const id = header.rows[0].id;

      for (const line of dto.lines ?? []) {
        const sys = await this.systemQty(dto.warehouse_id, line.product_id, line.batch_id ?? null);
        await client.query(
          `insert into stock_count_line (stock_count_id, product_id, batch_id, qty_system, qty_counted)
           values ($1, $2, $3, $4, $5)`,
          [id, line.product_id, line.batch_id ?? null, sys, line.counted_qty ?? null],
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

  /** ثبت/به‌روزرسانی شمارش اقلام (upsert با snapshot مانده سیستم) */
  async upsertLines(stockTakeId: string, warehouseId: string, lines: StockTakeLineDto[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      for (const line of lines) {
        const sys = await this.systemQty(warehouseId, line.product_id, line.batch_id ?? null);
        await client.query(
          `insert into stock_count_line (stock_count_id, product_id, batch_id, qty_system, qty_counted)
           values ($1, $2, $3, $4, $5)
           on conflict (stock_count_id, product_id, coalesce(batch_id, '${ZERO_UUID}'::uuid))
           do update set qty_counted = excluded.qty_counted`,
          [stockTakeId, line.product_id, line.batch_id ?? null, sys, line.counted_qty ?? null],
        );
      }
      await client.query('commit');
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * تغییر وضعیت سند (برای PATCH؛ از قید DDL عبور می‌کند).
   * فیلتر شرکت و قفل خوش‌بینانه هر دو در خود UPDATE هستند (فاز B):
   * - updated: اعمال شد
   * - stale: سند متعلق به شرکت است ولی نسخهٔ ارسالی ناهمخوان است → 409
   * - missing: سند در این شرکت نیست → 404
   */
  async updateStatus(
    companyId: string,
    id: string,
    status: string,
    expectedRowVersion?: number,
  ): Promise<'updated' | 'stale' | 'missing'> {
    const params: unknown[] = [id, companyId, status];
    let versionClause = '';
    if (expectedRowVersion !== undefined) {
      params.push(expectedRowVersion);
      versionClause = ` and row_version = $${params.length}`;
    }
    const { rowCount } = await this.pool.query(
      `update stock_count set status = $3, updated_at = now()
        where id = $1 and branch_id in (select id from branch where company_id = $2)${versionClause}`,
      params,
    );
    if ((rowCount ?? 0) > 0) return 'updated';

    // تفکیک «نبودِ سند» از «مغایرت نسخه» برای 404 در برابر 409
    const { rows } = await this.pool.query(
      `select 1 from stock_count
        where id = $1 and branch_id in (select id from branch where company_id = $2)`,
      [id, companyId],
    );
    return rows.length > 0 ? 'stale' : 'missing';
  }

  /**
   * اعمال مغایرت‌ها: هر قلم با counted متفاوت از system → inventory_txn (count_gain/count_loss)
   * + fn_apply_stock_txn، سپس وضعیت posted.
   * پیش‌نیاز: شرکت مالک، وضعیت قابل ارسال، حداقل یک قلم شمارش‌شده.
   */
  async submit(companyId: string, id: string, approverId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const header = await client.query<{ branch_id: string; warehouse_id: string; status: string }>(
        `select s.branch_id, s.warehouse_id, s.status from stock_count s
          where s.id = $1 and s.branch_id in (select id from branch where company_id = $2)
          for update`,
        [id, companyId],
      );
      if (header.rowCount === 0) throw Object.assign(new Error('not found'), { pgCode: 'no_data' });

      const lines = await client.query<{
        product_id: string;
        batch_id: string | null;
        qty_system: number;
        qty_counted: number | null;
      }>(
        `select product_id, batch_id, qty_system, qty_counted from stock_count_line where stock_count_id = $1`,
        [id],
      );

      const { branch_id: branchId, warehouse_id: warehouseId, status } = header.rows[0];
      if (status === 'posted' || status === 'voided') {
        throw Object.assign(new Error('bad state'), { pgCode: 'bad_state' });
      }
      const counted = lines.rows.filter((l) => l.qty_counted !== null);
      if (counted.length === 0) {
        throw Object.assign(new Error('no lines'), { pgCode: 'no_lines' });
      }

      for (const line of counted) {
        const variance = Number(line.qty_counted) - Number(line.qty_system);
        if (Math.abs(variance) < 1e-9) continue;
        const kind = variance > 0 ? 'count_gain' : 'count_loss';
        await client.query(
          `with ins as (
             insert into inventory_txn
               (branch_id, warehouse_id, product_id, batch_id, txn_kind, qty, unit_cost,
                source_type, source_id, source_line_id, occurred_at)
             values ($1, $2, $3, $4, $5, $6, 0, 'stock_count', $7, null, now())
             returning *
           )
           select fn_apply_stock_txn(ins) from ins`,
          [branchId, warehouseId, line.product_id, line.batch_id, kind, variance, id],
        );
      }

      await client.query(
        `update stock_count set status = 'posted', approved_by = $2, updated_at = now() where id = $1`,
        [id, approverId],
      );
      await client.query('commit');
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
