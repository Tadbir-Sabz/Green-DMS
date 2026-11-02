import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import type { CreateStockAdjustmentDto, ListStockQueryDto } from './stock.dto';

export interface StockBalanceRow extends QueryResultRow {
  warehouse_id: string;
  product_id: string;
  batch_id: string | null;
  qty_on_hand: number;
  qty_reserved: number;
  qty_available: number;
  qty_on_hand_value: string | null;
  updated_at: Date;
}

export interface ListStockResult {
  items: StockBalanceRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

const encodeCursor = (parts: string[]): string => Buffer.from(parts.join('|'), 'utf8').toString('base64url');
const decodeCursor = (cursor: string): string[] => Buffer.from(cursor, 'base64url').toString('utf8').split('|');

/**
 * خواندن مانده موجودی + اعمال اصلاحیه.
 * scope شرکت از warehouse → branch → company؛ کوئری‌های نوشتن داخل تراکنش اندام‌وار
 * (header → line → inventory_txn + fn_apply_stock_txn) تا در صورت رد قید، همه برگردد.
 */
@Injectable()
export class StockRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list(companyId: string, query: ListStockQueryDto): Promise<ListStockResult> {
    const limit = query.limit ?? 50;
    const params: unknown[] = [companyId];
    const where: string[] = ['b.company_id = $1'];

    if (query.warehouse_id) {
      params.push(query.warehouse_id);
      where.push(`sb.warehouse_id = $${params.length}`);
    }
    if (query.product_id) {
      params.push(query.product_id);
      where.push(`sb.product_id = $${params.length}`);
    }
    if (query.batch_id) {
      params.push(query.batch_id);
      where.push(`sb.batch_id = $${params.length}`);
    }

    // کرسر ترکیبی روی سه ستون کلید (بچ null با رشته خالی نرمال می‌شود)
    if (query.cursor) {
      const [wh, pr, ba] = decodeCursor(query.cursor);
      params.push(wh, pr, ba);
      const n = params.length;
      where.push(`(sb.warehouse_id, sb.product_id, coalesce(sb.batch_id::text, '')) > ($${n - 2}, $${n - 1}, $${n})`);
    }
    params.push(limit + 1);

    const { rows } = await this.pool.query<StockBalanceRow>(
      `select sb.warehouse_id, sb.product_id, sb.batch_id,
              sb.qty_on_hand::float8 as qty_on_hand,
              sb.qty_reserved::float8 as qty_reserved,
              (sb.qty_on_hand - sb.qty_reserved)::float8 as qty_available,
              sb.qty_on_hand_value::text as qty_on_hand_value,
              sb.updated_at
         from stock_balance sb
         join warehouse w on w.id = sb.warehouse_id
         join branch b on b.id = w.branch_id
        where ${where.join(' and ')}
        order by sb.warehouse_id, sb.product_id, coalesce(sb.batch_id::text, '')
        limit $${params.length}`,
      params,
    );

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page,
      hasMore,
      nextCursor: hasMore && last
        ? encodeCursor([last.warehouse_id, last.product_id, last.batch_id ?? ''])
        : null,
    };
  }

  /**
   * ایجاد اصلاحیه: header + line + inventory_txn و اعمال مانده با fn_apply_stock_txn.
   * اگر مانده منفی شود و allow_negative خاموش باشد، تابع با check_violation بالا می‌آید.
   * برگردانده شناسه header است؛ خواندن نهایی در سرویس انجام می‌شود.
   */
  async createAdjustment(companyId: string, dto: CreateStockAdjustmentDto): Promise<{ id: string; branchId: string }> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');

      // scope: انبار باید متعلق به شرکت باشد و branch آن را برداریم
      const wh = await client.query<{ branch_id: string }>(
        `select w.branch_id from warehouse w join branch b on b.id = w.branch_id
          where w.id = $1 and b.company_id = $2`,
        [dto.warehouse_id, companyId],
      );
      if (wh.rowCount === 0) throw Object.assign(new Error('warehouse not found'), { pgCode: 'no_data' });
      const branchId = wh.rows[0].branch_id;

      const docNumber = dto.reason_code === 'count_fix' ? null : null; // شماره سند اختیاری
      const header = await client.query<{ id: string }>(
        `insert into stock_adjustment (branch_id, warehouse_id, doc_number, reason_code, status, note)
         values ($1, $2, $3, $4, 'posted', $5) returning id`,
        [branchId, dto.warehouse_id, docNumber, dto.reason_code, dto.note ?? null],
      );
      const headerId = header.rows[0].id;

      const line = await client.query<{ id: string }>(
        `insert into stock_adjustment_line (stock_adjustment_id, product_id, batch_id, qty, unit_cost)
         values ($1, $2, $3, $4, 0) returning id`,
        [headerId, dto.product_id, dto.batch_id ?? null, dto.qty_delta],
      );
      const lineId = line.rows[0].id;

      const txnKind = dto.qty_delta > 0 ? 'adjust_in' : 'adjust_out';
      // اعمال مانده در همین statement (insert txn + فراخوانی fn_apply_stock_txn روی ردیف درج‌شده)
      await client.query(
        `with ins as (
           insert into inventory_txn
             (branch_id, warehouse_id, product_id, batch_id, txn_kind, qty, unit_cost,
              source_type, source_id, source_line_id, occurred_at)
           values ($1, $2, $3, $4, $5, $6, 0, 'stock_adjustment', $7, $8, now())
           returning *
         )
         select fn_apply_stock_txn(ins) from ins`,
        [branchId, dto.warehouse_id, dto.product_id, dto.batch_id ?? null, txnKind, dto.qty_delta, headerId, lineId],
      );

      await client.query('commit');
      return { id: headerId, branchId };
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** خواندن اصلاحیه برای پاسخ (نمای تخت) */
  async findAdjustment(companyId: string, id: string): Promise<StockAdjustmentView | null> {
    const { rows } = await this.pool.query<StockAdjustmentView & QueryResultRow>(
      `select a.warehouse_id, l.product_id, l.batch_id, l.qty::float8 as qty_delta,
              a.reason_code, a.note
         from stock_adjustment a
         join stock_adjustment_line l on l.stock_adjustment_id = a.id
         join branch b on b.id = a.branch_id
        where a.id = $1 and b.company_id = $2`,
      [id, companyId],
    );
    return rows[0] ?? null;
  }
}

export interface StockAdjustmentView extends QueryResultRow {
  warehouse_id: string;
  product_id: string;
  batch_id: string | null;
  qty_delta: number;
  reason_code: string;
  note: string | null;
}
