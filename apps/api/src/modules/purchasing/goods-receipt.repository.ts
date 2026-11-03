import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import type { DocNumberService } from '../../common/doc-number.service';
import { DOC_NUMBER_SERVICE } from '../../common/doc-number.service';
import type { CreateGoodsReceiptDto } from './goods-receipt.dto';

/** گردکردن مبلغ به ۲ رقم اعشار به‌صورت رشته (numeric(19,2)) */
const r2 = (n: number): string => (Math.round(n * 100) / 100).toFixed(2);
const encodeCursor = (v: string): string => Buffer.from(v, 'utf8').toString('base64url');
const decodeCursor = (cursor: string): string => Buffer.from(cursor, 'base64url').toString('utf8');

// ---------------- Row shapes (API) ----------------

export interface GoodsReceiptLineRow {
  id: string;
  product_id: string;
  batch_id: string | null;
  purchase_order_line_id: string | null;
  qty_received: string;
  qty_rejected: string;
  unit_cost: string;
}

export interface GoodsReceiptRow extends QueryResultRow {
  id: string;
  branch_id: string;
  doc_number: string;
  fiscal_year: number;
  supplier_id: string;
  warehouse_id: string;
  purchase_order_id: string | null;
  /** timestamptz خام — در مرز JSON به رشتهٔ ISO (date-time) تبدیل می‌شود */
  received_at: string;
  received_by: string | null;
  status: string;
  note: string | null;
  lines?: GoodsReceiptLineRow[];
}

export interface ValuationRow extends QueryResultRow {
  warehouse_id: string;
  product_id: string;
  method: string;
  avg_cost: string;
  qty_on_hand: string;
  value_on_hand: string;
  last_purchase_cost: string | null;
}

// received_at تimestamptz است و خام انتخاب می‌شود (بدون ::text) تا ajv format
// date-time روی رشتهٔ ISO پس از JSON درست اعتبارسنجی شود؛ بقیه uuid/text/smallint.
const GRN_COLUMNS = `gr.id, gr.branch_id, gr.doc_number, gr.fiscal_year, gr.supplier_id,
  gr.warehouse_id, gr.purchase_order_id, gr.received_at, gr.received_by, gr.status, gr.note`;

/**
 * repository رسید انبار خرید (GRN) و ارزش‌گذاری موجودی — ماژول ۸/۹ روی جداول
 * مهاجرت 0015 (goods_receipt/goods_receipt_line)، 0016 (product_cost/cost_layer)
 * و 0008 (inventory_txn/stock_balance + fn_apply_stock_txn).
 *
 * ثبت رسید (post) تراکنشی است و برای هر قلم: (۱) inventory_txn با txn_kind
 * «purchase_in» درج و fn_apply_stock_txn صدا زده می‌شود (qty_on_hand را بالا
 * می‌برد)؛ (۲) qty_on_hand_value در stock_balance به‌روز می‌شود (تابع آن را
 * دست نمی‌زند)؛ (۳) product_cost با میانگین متحرک upsert می‌شود؛ (۴) یک لایهٔ
 * بهای cost_layer درج می‌شود؛ (۵) در صورت اتصال به قلم سفارش خرید، qty_received
 * آن افزایش می‌یابد. دامنهٔ شرکت از راه branch_id اعمال می‌شود.
 */
@Injectable()
export class GoodsReceiptRepository {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(DOC_NUMBER_SERVICE) private readonly docNumbers: DocNumberService,
  ) {}

  // ---------------- Goods Receipt (GRN) ----------------

  async listGoodsReceipts(
    companyId: string,
    query: {
      cursor?: string;
      limit?: number;
      supplier_id?: string;
      warehouse_id?: string;
      status?: string;
    },
  ): Promise<{ items: GoodsReceiptRow[]; nextCursor: string | null; hasMore: boolean }> {
    const limit = query.limit ?? 50;
    const params: unknown[] = [companyId];
    const where: string[] = ['gr.branch_id in (select id from branch where company_id = $1)'];
    if (query.supplier_id) {
      params.push(query.supplier_id);
      where.push(`gr.supplier_id = $${params.length}`);
    }
    if (query.warehouse_id) {
      params.push(query.warehouse_id);
      where.push(`gr.warehouse_id = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      where.push(`gr.status = $${params.length}`);
    }
    if (query.cursor) {
      const raw = decodeCursor(query.cursor);
      const sep = raw.indexOf('|');
      if (sep > 0) {
        params.push(raw.slice(0, sep), raw.slice(sep + 1));
        where.push(`(gr.doc_number, gr.id) > ($${params.length - 1}, $${params.length}::uuid)`);
      }
    }
    params.push(limit + 1);
    const { rows } = await this.pool.query<GoodsReceiptRow>(
      `select ${GRN_COLUMNS} from goods_receipt gr
        where ${where.join(' and ')}
        order by gr.doc_number, gr.id
        limit $${params.length}`,
      params,
    );
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page,
      hasMore,
      nextCursor: hasMore && last ? encodeCursor(`${last.doc_number}|${last.id}`) : null,
    };
  }

  async findGoodsReceipt(companyId: string, id: string): Promise<GoodsReceiptRow | null> {
    const { rows } = await this.pool.query<GoodsReceiptRow>(
      `select ${GRN_COLUMNS} from goods_receipt gr
        where gr.id = $1 and gr.branch_id in (select id from branch where company_id = $2)`,
      [id, companyId],
    );
    const head = rows[0];
    if (!head) return null;
    head.lines = await this.findGoodsReceiptLines(id);
    return head;
  }

  private async findGoodsReceiptLines(grnId: string): Promise<GoodsReceiptLineRow[]> {
    const { rows } = await this.pool.query<GoodsReceiptLineRow>(
      `select id, product_id, batch_id, purchase_order_line_id,
              qty_received::text as qty_received, qty_rejected::text as qty_rejected,
              unit_cost::text as unit_cost
         from goods_receipt_line
        where goods_receipt_id = $1
        order by id`,
      [grnId],
    );
    return rows;
  }

  /** ثبت رسید انبار پیش‌نویس + اقلام (doc_number از DocNumberService، پیشوند GRN) */
  async insertGoodsReceipt(dto: CreateGoodsReceiptDto): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const { doc_number, fiscal_year } = await this.docNumbers.next(dto.branch_id, 'goods_receipt', {
        client,
      });
      const id = randomUUID();
      await client.query(
        `insert into goods_receipt
           (id, branch_id, doc_number, fiscal_year, purchase_order_id, supplier_id,
            warehouse_id, status, note)
         values ($1,$2,$3,$4,$5,$6,$7,'draft',$8)`,
        [
          id,
          dto.branch_id,
          doc_number,
          fiscal_year,
          dto.purchase_order_id ?? null,
          dto.supplier_id,
          dto.warehouse_id,
          dto.note ?? null,
        ],
      );
      for (const l of dto.lines) {
        await client.query(
          `insert into goods_receipt_line
             (goods_receipt_id, purchase_order_line_id, product_id, batch_id,
              qty_received, qty_rejected, unit_cost)
           values ($1,$2,$3,$4,$5,$6,$7)`,
          [
            id,
            l.purchase_order_line_id ?? null,
            l.product_id,
            l.batch_id ?? null,
            l.qty_received,
            l.qty_rejected ?? 0,
            l.unit_cost,
          ],
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

  /**
   * ثبت قطعی رسید انبار (draft → posted) — تراکنشی. برای هر قلم با qty خالص
   * (> 0) یک inventory_txn «purchase_in» درج و fn_apply_stock_txn صدا زده
   * می‌شود، سپس qty_on_hand_value، product_cost (میانگین متحرک) و cost_layer
   * به‌روز/درج می‌شوند. اگر رسید یافت نشود یا draft نباشد null برمی‌گردد
   * (سرویس آن را به 404/409 نگاشت می‌کند).
   */
  async postGoodsReceipt(
    companyId: string,
    id: string,
    userId: string,
  ): Promise<GoodsReceiptRow | null> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');

      const head = await client.query<{
        branch_id: string;
        warehouse_id: string;
        status: string;
      }>(
        `select branch_id, warehouse_id, status from goods_receipt
          where id = $1 and branch_id in (select id from branch where company_id = $2)
          for update`,
        [id, companyId],
      );
      if (head.rowCount === 0 || head.rows[0].status !== 'draft') {
        await client.query('rollback');
        return null;
      }
      const h = head.rows[0];

      const lines = await client.query<{
        id: string;
        product_id: string;
        batch_id: string | null;
        purchase_order_line_id: string | null;
        qty_received: string;
        unit_cost: string;
      }>(
        `select id, product_id, batch_id, purchase_order_line_id,
                qty_received::text as qty_received, unit_cost::text as unit_cost
           from goods_receipt_line
          where goods_receipt_id = $1
          order by id`,
        [id],
      );

      for (const l of lines.rows) {
        const qtyIn = Number(l.qty_received);
        const unitCost = Number(l.unit_cost);
        if (!(qtyIn > 0)) continue;
        const lineValue = r2(qtyIn * unitCost);

        // (۱) inventory_txn + fn_apply_stock_txn → qty_on_hand بالا می‌رود؛ شناسهٔ
        //     تراکنش برای cost_layer برگردانده می‌شود.
        const txn = await client.query<{ txn_id: string }>(
          `with ins as (
             insert into inventory_txn
               (branch_id, warehouse_id, product_id, batch_id, txn_kind, qty, unit_cost,
                source_type, source_id, source_line_id, occurred_at, posted_by)
             values ($1,$2,$3,$4,'purchase_in',$5::numeric,$6::numeric,
                     'goods_receipt',$7,$8, now(), $9)
             returning *
           )
           select ins.id::text as txn_id, fn_apply_stock_txn(ins) as applied from ins`,
          [
            h.branch_id,
            h.warehouse_id,
            l.product_id,
            l.batch_id,
            qtyIn,
            unitCost,
            id,
            l.id,
            userId,
          ],
        );
        const txnId = txn.rows[0].txn_id;

        // (۲) بهاى موجودی — fn_apply_stock_txn فقط qty_on_hand را نگه می‌دارد.
        await client.query(
          `update stock_balance
              set qty_on_hand_value = round(qty_on_hand_value + $3::numeric, 2),
                  updated_at = now()
            where warehouse_id = $1 and product_id = $2
              and batch_id is not distinct from $4`,
          [h.warehouse_id, l.product_id, lineValue, l.batch_id],
        );

        // (۳) product_cost — میانگین متحرک: avg = ارزش کل / تعداد کل.
        await client.query(
          `insert into product_cost
             (product_id, warehouse_id, method, avg_cost, qty_on_hand, value_on_hand,
              last_purchase_cost, updated_at)
           values ($1,$2,'moving_avg',$3::numeric,$4::numeric,
                   round($4::numeric * $3::numeric, 2), $3::numeric, now())
           on conflict (product_id, warehouse_id) do update set
             qty_on_hand = product_cost.qty_on_hand + excluded.qty_on_hand,
             value_on_hand = round(product_cost.value_on_hand + excluded.value_on_hand, 2),
             avg_cost = case
               when (product_cost.qty_on_hand + excluded.qty_on_hand) > 0
                 then round((product_cost.value_on_hand + excluded.value_on_hand)
                            / (product_cost.qty_on_hand + excluded.qty_on_hand), 4)
                 else excluded.avg_cost end,
             last_purchase_cost = excluded.last_purchase_cost,
             updated_at = now()`,
          [l.product_id, h.warehouse_id, unitCost, qtyIn],
        );

        // (۴) لایهٔ بها (برای مصرف FIFO در آینده) — qty_remaining = qty_in.
        await client.query(
          `insert into cost_layer
             (product_id, warehouse_id, batch_id, received_at, inventory_txn_id,
              qty_in, qty_remaining, unit_cost)
           values ($1,$2,$3, now(), $4::bigint, $5::numeric, $5::numeric, $6::numeric)`,
          [l.product_id, h.warehouse_id, l.batch_id, txnId, qtyIn, unitCost],
        );

        // (۵) اتصال به سفارش خرید — qty_received قلم بالا می‌رود (قید <= qty).
        if (l.purchase_order_line_id) {
          await client.query(
            `update purchase_order_line
                set qty_received = qty_received + $2::numeric
              where id = $1`,
            [l.purchase_order_line_id, qtyIn],
          );
        }
      }

      const upd = await client.query<{ id: string }>(
        `update goods_receipt set status = 'posted', received_by = $2
          where id = $1 and status = 'draft'
          returning id`,
        [id, userId],
      );
      if (upd.rowCount === 0) {
        await client.query('rollback');
        return null;
      }

      await client.query('commit');
      return await this.findGoodsReceipt(companyId, id);
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------- Valuation ----------------

  /** ارزش موجودی (میانگین متحرک) به ازای انبار/کالا از product_cost — بدون صفحه‌بندی */
  async listValuation(
    companyId: string,
    query: { warehouse_id?: string; product_id?: string },
  ): Promise<{ items: ValuationRow[] }> {
    const params: unknown[] = [companyId];
    const where: string[] = ['w.branch_id in (select id from branch where company_id = $1)'];
    if (query.warehouse_id) {
      params.push(query.warehouse_id);
      where.push(`pc.warehouse_id = $${params.length}`);
    }
    if (query.product_id) {
      params.push(query.product_id);
      where.push(`pc.product_id = $${params.length}`);
    }
    const { rows } = await this.pool.query<ValuationRow>(
      `select pc.warehouse_id, pc.product_id, pc.method,
              pc.avg_cost::text as avg_cost, pc.qty_on_hand::text as qty_on_hand,
              pc.value_on_hand::text as value_on_hand,
              pc.last_purchase_cost::text as last_purchase_cost
         from product_cost pc
         join warehouse w on w.id = pc.warehouse_id
        where ${where.join(' and ')}
        order by pc.warehouse_id, pc.product_id`,
      params,
    );
    return { items: rows };
  }
}
