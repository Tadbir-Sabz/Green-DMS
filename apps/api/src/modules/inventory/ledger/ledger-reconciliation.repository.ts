import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../../database/database.module';
import type { LedgerKeyRow } from './ledger-reconciliation.domain';

/**
 * خواندن فقط‌خواندنی برای تطبیق دفتر و مانده.
 *
 * - تراکنش `read only` است: هر نوشتنی در PostgreSQL رد می‌شود (تضمین پایگاه‌داده).
 * - محدودهٔ شرکت صریحاً از branch.company_id گرفته می‌شود. RLS هم اعمال می‌شود، اما
 *   اتصالِ ابرکاربر آن را دور می‌زند؛ پس فیلتر صریح، مرز مستاجر را مستقل از نقش نگه می‌دارد.
 * - کلید ترکیبی (انبار، کالا، بچ) از سه منبع با FULL-JOIN منطقی (UNION کلیدها) ساخته می‌شود تا
 *   کلیدهایی که فقط در یکی از منابع هستند (مثلاً دفتر بدون مانده) هم دیده شوند.
 */
@Injectable()
export class LedgerReconciliationRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async collectKeys(companyId: string, warehouseId: string | null): Promise<LedgerKeyRow[]> {
    const client = await this.pool.connect();
    try {
      await client.query('begin read only');
      const { rows } = await client.query<LedgerKeyRowDb>(RECONCILIATION_SQL, [companyId, warehouseId]);
      await client.query('commit');
      return rows.map(toKeyRow);
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}

interface LedgerKeyRowDb extends QueryResultRow {
  company_id: string;
  branch_id: string;
  warehouse_id: string;
  product_id: string;
  batch_id: string | null;
  ledger_qty: string;
  ledger_txn_count: number;
  ledger_kinds: string[];
  recorded_qty_on_hand: string | null;
  recorded_qty_reserved: string | null;
  active_reservation_qty: string;
  active_reservation_count: number;
}

const toKeyRow = (r: LedgerKeyRowDb): LedgerKeyRow => ({
  company_id: r.company_id,
  branch_id: r.branch_id,
  warehouse_id: r.warehouse_id,
  product_id: r.product_id,
  batch_id: r.batch_id,
  ledger_qty: r.ledger_qty,
  ledger_txn_count: Number(r.ledger_txn_count),
  ledger_kinds: r.ledger_kinds ?? [],
  recorded_qty_on_hand: r.recorded_qty_on_hand,
  recorded_qty_reserved: r.recorded_qty_reserved,
  active_reservation_qty: r.active_reservation_qty,
  active_reservation_count: Number(r.active_reservation_count),
});

/**
 * $1 = company_id، $2 = warehouse_id یا NULL (همهٔ انبارهای شرکت).
 * کلید بچ در مقایسه با coalesce(batch_id::text,'') نرمال می‌شود تا NULL با NULL برابر باشد.
 */
const RECONCILIATION_SQL = `
with scope as (
  select w.id as warehouse_id, w.branch_id, b.company_id
    from warehouse w
    join branch b on b.id = w.branch_id
   where b.company_id = $1
     and ($2::uuid is null or w.id = $2::uuid)
),
ledger as (
  select t.warehouse_id, t.product_id, coalesce(t.batch_id::text, '') as batch_key,
         sum(t.qty) as ledger_qty,
         count(*)::int as txn_count,
         array_agg(distinct t.txn_kind) as kinds
    from inventory_txn t
    join scope s on s.warehouse_id = t.warehouse_id
   group by t.warehouse_id, t.product_id, coalesce(t.batch_id::text, '')
),
balance as (
  select sb.warehouse_id, sb.product_id, coalesce(sb.batch_id::text, '') as batch_key,
         sb.qty_on_hand, sb.qty_reserved
    from stock_balance sb
    join scope s on s.warehouse_id = sb.warehouse_id
),
reserved as (
  select r.warehouse_id, r.product_id, coalesce(r.batch_id::text, '') as batch_key,
         sum(r.qty) as active_qty,
         count(*)::int as active_count
    from stock_reservation r
    join scope s on s.warehouse_id = r.warehouse_id
   where r.status = 'active'
   group by r.warehouse_id, r.product_id, coalesce(r.batch_id::text, '')
),
keys as (
  select warehouse_id, product_id, batch_key from ledger
  union
  select warehouse_id, product_id, batch_key from balance
  union
  select warehouse_id, product_id, batch_key from reserved
)
select s.company_id,
       s.branch_id,
       k.warehouse_id,
       k.product_id,
       nullif(k.batch_key, '')::uuid as batch_id,
       coalesce(l.ledger_qty, 0)::text as ledger_qty,
       coalesce(l.txn_count, 0) as ledger_txn_count,
       coalesce(l.kinds, '{}'::text[]) as ledger_kinds,
       b.qty_on_hand::text as recorded_qty_on_hand,
       b.qty_reserved::text as recorded_qty_reserved,
       coalesce(r.active_qty, 0)::text as active_reservation_qty,
       coalesce(r.active_count, 0) as active_reservation_count
  from keys k
  join scope s on s.warehouse_id = k.warehouse_id
  left join ledger l
         on l.warehouse_id = k.warehouse_id and l.product_id = k.product_id and l.batch_key = k.batch_key
  left join balance b
         on b.warehouse_id = k.warehouse_id and b.product_id = k.product_id and b.batch_key = k.batch_key
  left join reserved r
         on r.warehouse_id = k.warehouse_id and r.product_id = k.product_id and r.batch_key = k.batch_key
 order by k.warehouse_id, k.product_id, k.batch_key`;
