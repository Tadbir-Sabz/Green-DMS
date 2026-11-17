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
  | 'quarantine_warehouse_missing'
  | 'lines_required'
  | 'duplicate_line'
  | 'line_not_found'
  | 'line_already_resolved'
  | 'incomplete_lines'
  | 'qty_exceeds_requested'
  | 'invalid_qty'
  | 'nothing_to_receive'
  | 'duplicate_stored_lines';

export class ResolutionPlanError extends Error {
  readonly code: ResolutionErrorCode;
  readonly httpStatus: 400 | 409;
  /** دادهٔ تکمیلیِ پایدار برای مصرفِ برنامه‌ای (مثلاً فهرست کالاهای پوشش‌داده‌نشده) */
  readonly details?: Record<string, unknown>;

  constructor(code: ResolutionErrorCode, message_fa: string, httpStatus: 400 | 409, details?: Record<string, unknown>) {
    super(message_fa);
    this.name = 'ResolutionPlanError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

/** برگرداندن شناسه‌های تکراری (مرتب، بدونِ کپی) — مبنای بستنِ خطای تکرار */
export function findDuplicateIds(ids: readonly string[]): string[] {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, n]) => n > 1)
    .map(([id]) => id)
    .sort();
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

// ---------- اعتبارسنجی کامل پوشش خطوط در receive (TASK-P4-R-HARDEN) ----------

/** خط ذخیره‌شدهٔ مرجوعی — زیرمجموعهٔ انتخابی از return_request_line */
export interface StoredReceiveLine {
  product_id: string;
  qty: number;
  qty_approved: number | null;
}

/** خط ارسال‌شده برای receive (فقط فیلدهای لازم برای اعتبارسنجی) */
export interface SubmittedReceiveLine {
  product_id: string;
  qty: number;
}

/**
 * بررسی لایه‌ایِ receive پیش از هر نوشتن:
 *  1. فهرست ارسالی خالی ⇒ lines_required (۴۰۰)
 *  2. شناسهٔ تکراری در فهرست ارسالی ⇒ duplicate_line (۴۰۰) — یک خط ذخیره‌شده
 *     هرگز دو posting نمی‌سازد
 *  3. تکراری بودن در دادهٔ ذخیره‌شده (دو ردیف با یک product_id) ⇒
 *     duplicate_stored_lines (۴۰۹، fail-closed) — مسیرِ داده‌ای خراب، نه خطای کاربر
 *  4. قلم ارسالیِ خارج از خطوط ذخیره‌شده ⇒ line_not_found (۴۰۰)
 *  5. هیچ خط فعّالی نمانده (همه qty_approved دارند) ⇒ nothing_to_receive (۴۰۹)
 *  6. قلم ارسالی‌ای که قبلاً تعیین تکلیف شده ⇒ line_already_resolved (۴۰۰)
 *  7. پوشش ناقصِ خطوط فعّال ⇒ incomplete_lines (۴۰۰، با missing_product_ids) —
 *     مرجوعیِ «نصفه» هرگز posted نمی‌شود
 *  8. qty ≤ ۰ یا بزرگ‌تر از مقدار ذخیره‌شده ⇒ invalid_qty / qty_exceeds_requested (۴۰۰)
 *
 * «فعّال» یعنی qty_approved IS NULL؛ این همان چرخهٔ partially_approved است:
 * receive فقط خطوطِ حل‌نشده را می‌بندد و باید همهٔ آن‌ها را بپوشاند.
 */
export function assertReceiveEligibility(
  storedLines: readonly StoredReceiveLine[],
  submitted: readonly SubmittedReceiveLine[],
): void {
  if (submitted.length === 0) {
    throw new ResolutionPlanError('lines_required', 'دریافت مرجوعی باید تکلیف حداقل یک قلم را مشخص کند.', 400);
  }

  const submittedDups = findDuplicateIds(submitted.map((l) => l.product_id));
  if (submittedDups.length > 0) {
    throw new ResolutionPlanError(
      'duplicate_line',
      'هر کالا فقط یک‌بار در فهرست دریافت می‌تواند بیاید؛ کالای تکراری رد شد.',
      400,
      { product_ids: submittedDups },
    );
  }

  const storedDups = findDuplicateIds(storedLines.map((l) => l.product_id));
  if (storedDups.length > 0) {
    throw new ResolutionPlanError(
      'duplicate_stored_lines',
      'این درخواست مرجوعی بیش از یک خط برای یک کالا دارد؛ تا دادهٔ ذخیره‌شده اصلاح نشود دریافت انجام نمی‌شود.',
      409,
      { product_ids: storedDups },
    );
  }

  const byProduct = new Map(storedLines.map((l) => [l.product_id, l] as const));
  for (const l of submitted) {
    if (!byProduct.has(l.product_id)) {
      throw new ResolutionPlanError(
        'line_not_found',
        'یکی از کالاهای ارسالی در این مرجوعی ثبت نشده است.',
        400,
        { product_id: l.product_id },
      );
    }
  }

  const eligible = storedLines.filter((l) => l.qty_approved === null);
  if (eligible.length === 0) {
    throw new ResolutionPlanError(
      'nothing_to_receive',
      'همهٔ خطوط این مرجوعی پیشتر تعیین تکلیف شده‌اند؛ چیزی برای دریافت باقی نمانده است.',
      409,
    );
  }

  const eligibleIds = new Set(eligible.map((l) => l.product_id));
  for (const l of submitted) {
    if (!eligibleIds.has(l.product_id)) {
      throw new ResolutionPlanError(
        'line_already_resolved',
        'این قلم پیشتر تعیین تکلیف شده است؛ دریافت دوبارهٔ آن مجاز نیست.',
        400,
        { product_id: l.product_id },
      );
    }
  }

  const submittedIds = new Set(submitted.map((l) => l.product_id));
  const missing = eligible.map((l) => l.product_id).filter((id) => !submittedIds.has(id));
  if (missing.length > 0) {
    throw new ResolutionPlanError(
      'incomplete_lines',
      'همهٔ خطوط فعّالِ مرجوعی باید در دریافت پوشش داده شوند؛ دریافت نصفه ثبت نمی‌شود.',
      400,
      { missing_product_ids: missing },
    );
  }

  for (const l of submitted) {
    const stored = byProduct.get(l.product_id) as StoredReceiveLine;
    if (!(l.qty > 0)) {
      throw new ResolutionPlanError(
        'invalid_qty',
        'مقدار دریافت باید بزرگ‌تر از صفر باشد.',
        400,
        { product_id: l.product_id },
      );
    }
    if (l.qty > stored.qty) {
      throw new ResolutionPlanError(
        'qty_exceeds_requested',
        'مقدار دریافت از مقدار ثبت‌شده در درخواست مرجوعی بیشتر است.',
        400,
        { product_id: l.product_id, requested: stored.qty, submitted: l.qty },
      );
    }
  }
}

export function planReturnPostings(input: ResolutionInput): PlannedPosting[] {
  // لایهٔ تدافعی: خطوط ورودی تکراری هرگز دو posting برای یک خط نمی‌سازند
  const dups = findDuplicateIds(input.lines.map((l) => l.product_id));
  if (dups.length > 0) {
    throw new ResolutionPlanError(
      'duplicate_line',
      'هر کالا فقط یک‌بار در فهرست دریافت می‌تواند بیاید؛ کالای تکراری رد شد.',
      400,
      { product_ids: dups },
    );
  }
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
