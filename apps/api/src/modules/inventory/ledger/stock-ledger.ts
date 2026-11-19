import type { AuditService } from '../../../common/audit.service';
import type { Runner } from '../../../common/transaction';
import {
  buildStockMovementAudit,
  type PostedStockMovement,
  type StockMovement,
} from './stock-movement';

/**
 * ثبت یک حرکت موجودی: درج در دفتر + اعمال مانده + ممیزی، همه روی `client`.
 *
 * قرارداد اتمی‌بودن: این تابع هرگز commit/rollback نمی‌کند؛ فراخواننده باید آن را داخل
 * تراکنشی بگیرد که با هر استثنا rollback می‌شود. اگر ممیزی شکست بخورد
 * (AuditPartitionMissingError یا خطای دیگر)، استثنا پرتاب می‌شود و درج دفتر و تغییر مانده
 * همراه آن برگردانده می‌شوند — «حرکت بدون ممیزی» هرگز commit نمی‌شود.
 *
 * ترتیب:
 *   ۱) INSERT inventory_txn + fn_apply_stock_txn (قفل ردیفی stock_balance در همین دستور)
 *   ۲) خواندن مانده بعد از اعمال و محاسبهٔ مانده قبل = بعد − qty (همان قفل، بدون race)
 *   ۳) audit.recordRequired روی همان client
 */
export async function postStockMovement(
  client: Runner,
  audit: AuditService,
  m: StockMovement,
): Promise<PostedStockMovement> {
  const ins = await client.query<{ txn_id: string; occurred_at: Date }>(
    `with ins as (
       insert into inventory_txn
         (branch_id, warehouse_id, product_id, batch_id, txn_kind, qty, unit_cost,
          source_type, source_id, source_line_id, occurred_at, posted_by, client_uuid)
       values ($1, $2, $3, $4, $5, $6::numeric, $7::numeric, $8, $9, $10, now(), $11, $12)
       returning *
     )
     select ins.id::text as txn_id, ins.occurred_at, fn_apply_stock_txn(ins) as applied
       from ins`,
    [
      m.branchId,
      m.warehouseId,
      m.productId,
      m.batchId,
      m.txnKind,
      m.qty,
      m.unitCost,
      m.sourceType,
      m.sourceId,
      m.sourceLineId,
      m.actor.actorUserId,
      m.clientUuid ?? null,
    ],
  );
  const row = ins.rows[0];

  // زیرجستجوی بعد از درج در همان دستور دیده نمی‌شود؛ پس مانده را در دستور جدا می‌خوانیم.
  const bal = await client.query<{ after_qty: string; before_qty: string }>(
    `select qty_on_hand::text as after_qty,
            (qty_on_hand - $4::numeric)::text as before_qty
       from stock_balance
      where warehouse_id = $1 and product_id = $2 and batch_id is not distinct from $3`,
    [m.warehouseId, m.productId, m.batchId, m.qty],
  );
  if (bal.rowCount !== 1) {
    throw new Error('stock_balance row missing after ledger posting');
  }

  const posted: PostedStockMovement = {
    txnId: row.txn_id,
    occurredAt: row.occurred_at.toISOString(),
    beforeQty: bal.rows[0].before_qty,
    afterQty: bal.rows[0].after_qty,
  };

  await audit.recordRequired(buildStockMovementAudit(m, posted), client);
  return posted;
}
