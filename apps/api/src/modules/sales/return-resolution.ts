/**
 * برنامه‌ریزیِ خالصِ تعیینِ تکلیفِ مرجوعی (بدونِ DB) — TASK-P4-R.
 *
 * منبعِ واحد برای «هر قلمِ مرجوعی در لحظهٔ receive کجا پُست می‌شود». مخزن این
 * تابع را داخلِ تراکنشِ receive صدا می‌زند تا تصمیم و اعمال، هم-اتمیک بمانند؛
 * تستِ unit آن را بدونِ دیتابیس اجرا می‌کند.
 *
 * قواعد:
 *  - disposition = restock  ⇒ حرکتِ `sale_return_in` به انبارِ restock.
 *    مقصد: `warehouse_id` صریحِ کلاینت (اگر داده و فعال و مالِ همین شعبه باشد)،
 *    و در غیرِ این صورت انبارِ فعّالِ kind='main' همین شعبه.
 *  - disposition = damaged  ⇒ حرکتِ `sale_return_in` به انبارِ قرنطینهٔ فعالِ
 *    همین شعبه (اول kind='quarantine' سپس kind='damaged')؛ اگر هیچ‌کدام نباشد
 *    خطای fail-closed پرتاب می‌شود و **هیچ چیزی پُست نمی‌شود**.
 *  - disposition = scrap و return_to_supplier ⇒ بدونِ حرکتِ موجودی؛ فقط
 *    رکوردِ تکلیف در خطوط مرجوعی ثبت می‌شود (کالا هرگز وارد قفسه نمی‌شود).
 *  - انبارِ صریح فقط برای restock اعمال می‌شود؛ کالای معیوب هرگز به مقصدِ
 *    فروش/دپو رد نمی‌شود.
 *  - نبودِ انبارِ پیش‌فرض (main یا قرنطینه) ⇒ خطای دارایِ code پایدار؛
 *    هیچ fallbackِ خاموشی به انبارهای دیگر وجود ندارد.
 */

export type ReturnDisposition = 'restock' | 'damaged' | 'scrap' | 'return_to_supplier';

export const RETURN_DISPOSITIONS: readonly ReturnDisposition[] = [
  'restock',
  'damaged',
  'scrap',
  'return_to_supplier',
] as const;

export interface ResolutionLineInput {
  product_id: string;
  batch_id: string | null;
  qty: number;
  disposition: ReturnDisposition;
}

export interface BranchWarehouseRow {
  id: string;
  kind: string;
  is_active: boolean;
  code: string;
}

export interface ResolutionInput {
  lines: ResolutionLineInput[];
  /** انبارِ مقصدِ صریح از کلاینت (فقط برای قلم‌های restock) */
  explicitWarehouseId?: string | null;
  /** انبارهای همان شعبهٔ سند (هر نوع/وضعیت) — planner فعال‌بودن را بررسی می‌کند */
  branchWarehouses: BranchWarehouseRow[];
}

export type ResolutionErrorCode =
  | 'warehouse_not_found'
  | 'warehouse_inactive'
  | 'restock_warehouse_missing'
  | 'quarantine_warehouse_missing';

export class ResolutionPlanError extends Error {
  readonly code: ResolutionErrorCode;
  readonly httpStatus: 400 | 409;

  constructor(code: ResolutionErrorCode, message_fa: string, httpStatus: 400 | 409) {
    super(message_fa);
    this.name = 'ResolutionPlanError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export interface PlannedPosting {
  product_id: string;
  batch_id: string | null;
  qty: number;
  txn_kind: 'sale_return_in';
  warehouse_id: string;
  disposition: Extract<ReturnDisposition, 'restock' | 'damaged'>;
}

const pickByKind = (warehouses: BranchWarehouseRow[], kind: string): string | null => {
  const candidates = warehouses
    .filter((w) => w.is_active && w.kind === kind)
    .sort((a, b) => a.code.localeCompare(b.code) || a.id.localeCompare(b.id));
  return candidates[0]?.id ?? null;
};

export function planReturnPostings(input: ResolutionInput): PlannedPosting[] {
  const explicit = input.explicitWarehouseId ?? null;

  let restockTarget: string | null = null;
  if (explicit) {
    const wh = input.branchWarehouses.find((w) => w.id === explicit);
    if (!wh) {
      throw new ResolutionPlanError(
        'warehouse_not_found',
        'انبارِ ارسالی در این شعبه یافت نشد (هر انبار فقط در حوزهٔ شعبهٔ خودش قابل استفاده است).',
        400,
      );
    }
    if (!wh.is_active) {
      throw new ResolutionPlanError(
        'warehouse_inactive',
        'انبارِ انتخاب‌شده غیرفعال است؛ کالای مرجوعی به آن پُست نمی‌شود.',
        400,
      );
    }
    restockTarget = wh.id;
  }

  const needsRestock = input.lines.some((l) => l.disposition === 'restock');
  const needsQuarantine = input.lines.some((l) => l.disposition === 'damaged');

  if (needsRestock && !restockTarget) {
    restockTarget = pickByKind(input.branchWarehouses, 'main');
    if (!restockTarget) {
      throw new ResolutionPlanError(
        'restock_warehouse_missing',
        'انبار اصلیِ فعالی برای این شعبه تعریف نشده است؛ دریافت مرجوعیِ قابلِ بازگشت انجام نشد.',
        409,
      );
    }
  }

  let quarantineTarget: string | null = null;
  if (needsQuarantine) {
    quarantineTarget =
      pickByKind(input.branchWarehouses, 'quarantine') ?? pickByKind(input.branchWarehouses, 'damaged');
    if (!quarantineTarget) {
      throw new ResolutionPlanError(
        'quarantine_warehouse_missing',
        'انبار قرنطینه/ناقصِ فعالی برای این شعبه تعریف نشده است؛ کالای معیوب بدونِ سلامت به انبار اصلی برنمی‌گردد. یک انبار با نوع quarantine یا damaged بسازید.',
        409,
      );
    }
  }

  const postings: PlannedPosting[] = [];
  for (const line of input.lines) {
    if (line.disposition === 'restock') {
      postings.push({
        product_id: line.product_id,
        batch_id: line.batch_id,
        qty: line.qty,
        txn_kind: 'sale_return_in',
        warehouse_id: restockTarget as string,
        disposition: 'restock',
      });
    } else if (line.disposition === 'damaged') {
      postings.push({
        product_id: line.product_id,
        batch_id: line.batch_id,
        qty: line.qty,
        txn_kind: 'sale_return_in',
        warehouse_id: quarantineTarget as string,
        disposition: 'damaged',
      });
    }
    // scrap و return_to_supplier: بدونِ حرکتِ موجودی — کالا هرگز وارد قفسه نمی‌شود.
  }
  return postings;
}
