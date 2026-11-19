import type { AuditEntry } from '../../../common/audit.service';
import type { RequestMeta } from '../../../common/request-meta';

/**
 * مدل دامنهٔ حرکت موجودی (بدون وابستگی به پایگاه‌داده).
 *
 * منبع حقیقت برای انواع حرکت، CHECK ستون txn_kind در مهاجرت 0008 است (۱۶ مقدار).
 * POSTED_TXN_KINDS فقط آن زیرمجموعه‌ای است که یک مسیر ثبت در برنامه واقعاً می‌نویسد.
 * بقیه (sale_out، انتقال، ضایعات، وسیلهٔ نقلیه، امانی و …) هنوز مسیر ثبت ندارند و
 * مغایرت‌های مربوط به آن‌ها در گزارش تطبیق به‌عنوان unsupported_movement_type طبقه‌بندی می‌شوند.
 */
export const INVENTORY_TXN_KINDS = [
  'purchase_in',
  'sale_out',
  'sale_return_in',
  'purchase_return_out',
  'transfer_in',
  'transfer_out',
  'count_gain',
  'count_loss',
  'damage_out',
  'vehicle_load_out',
  'vehicle_load_in',
  'vehicle_return_in',
  'adjust_in',
  'adjust_out',
  'consignment_out',
  'consignment_in',
] as const;

export type InventoryTxnKind = (typeof INVENTORY_TXN_KINDS)[number];

export const POSTED_TXN_KINDS = [
  'purchase_in',
  'sale_return_in',
  'count_gain',
  'count_loss',
  'adjust_in',
  'adjust_out',
] as const;

export type PostedTxnKind = (typeof POSTED_TXN_KINDS)[number];

const POSTED_SET: ReadonlySet<string> = new Set(POSTED_TXN_KINDS);

/** انواع حرکتی که در ledger امکان ثبت دارند اما هیچ مسیر ثبت برنامه‌ای ندارند. */
export const UNPOSTED_TXN_KINDS: readonly InventoryTxnKind[] = INVENTORY_TXN_KINDS.filter(
  (k) => !POSTED_SET.has(k),
);

export const isPostedTxnKind = (kind: string): kind is PostedTxnKind => POSTED_SET.has(kind);

/** دامنهٔ ممیزی و گزارش تطبیق برای دفتر موجودی. */
export const LEDGER_DOMAIN = 'inventory' as const;

export type StockSourceType =
  | 'goods_receipt'
  | 'stock_adjustment'
  | 'stock_count'
  | 'return_request';

/** زمینهٔ عامل: چه کسی و از کدام درخواست، حرکت را ثبت کرد. */
export interface StockMovementActor {
  actorUserId: string | null;
  requestId: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

/** درخواست ثبت یک حرکت؛ qty علامت‌دار است (+ ورود، - خروج؛ صفر مجاز نیست). */
export interface StockMovement {
  companyId: string;
  branchId: string;
  warehouseId: string;
  productId: string;
  batchId: string | null;
  txnKind: PostedTxnKind;
  qty: number;
  unitCost: number;
  sourceType: StockSourceType;
  sourceId: string;
  sourceLineId: string | null;
  clientUuid?: string | null;
  actor: StockMovementActor;
}

/** نتیجهٔ ثبت: شناسهٔ سطر دفتر و مانده‌های قبل/بعد (به‌صورت رشتهٔ numeric، بدون خطای اعشار). */
export interface PostedStockMovement {
  txnId: string;
  occurredAt: string;
  beforeQty: string;
  afterQty: string;
}

export type StockDirection = 'in' | 'out';

export const directionOf = (qty: number): StockDirection => (qty > 0 ? 'in' : 'out');

/**
 * ساخت ورودی ممیزی برای یک حرکت ثبت‌شده.
 * - entity_type = inventory_txn؛ شناسهٔ سطر دفتر (bigint) در after_data است، زیرا
 *   audit_log.entity_id از نوع uuid است.
 * - before/after، مانده‌های قبل و بعد از همان حرکت هستند (از یک قفل ردیفی همان تراکنش).
 */
export function buildStockMovementAudit(m: StockMovement, posted: PostedStockMovement): AuditEntry {
  const payload = {
    domain: LEDGER_DOMAIN,
    company_id: m.companyId,
    branch_id: m.branchId,
    warehouse_id: m.warehouseId,
    product_id: m.productId,
    batch_id: m.batchId,
    inventory_txn_id: posted.txnId,
    txn_kind: m.txnKind,
    direction: directionOf(m.qty),
    qty: String(m.qty),
    unit_cost: String(m.unitCost),
    source_type: m.sourceType,
    source_id: m.sourceId,
    source_line_id: m.sourceLineId,
    occurred_at: posted.occurredAt,
  };
  return {
    companyId: m.companyId,
    actorUserId: m.actor.actorUserId,
    action: 'create',
    entityType: 'inventory_txn',
    entityId: null,
    before: { qty_on_hand: posted.beforeQty },
    after: { ...payload, qty_on_hand: posted.afterQty },
    requestId: m.actor.requestId,
    ip: m.actor.ip ?? null,
    userAgent: m.actor.userAgent ?? null,
  };
}

/** ساخت زمینهٔ عامل از کاربر نشست و متادیتای درخواست (کنترلرها از این استفاده می‌کنند). */
export const movementActor = (
  actorUserId: string | null,
  meta: RequestMeta | null | undefined,
): StockMovementActor => ({
  actorUserId,
  requestId: meta?.requestId ?? null,
  ip: meta?.ip ?? null,
  userAgent: meta?.userAgent ?? null,
});
