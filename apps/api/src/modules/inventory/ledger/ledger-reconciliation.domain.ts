import { LEDGER_DOMAIN, UNPOSTED_TXN_KINDS } from './stock-movement';

/**
 * تطبیق فقط‌خواندنی مانده با دفتر (بدون اصلاح خودکار).
 *
 * قاعده‌ها:
 *   qty_on_hand : stock_balance.qty_on_hand  در برابر  Σ inventory_txn.qty  (به ازای انبار/کالا/بچ)
 *   qty_reserved: stock_balance.qty_reserved در برابر Σ stock_reservation.qty با status='active'
 *
 * طبقه‌بندی هر مغایرت:
 *   - historical_data_limitation: مانده بدون هیچ سابقهٔ دفتری (پیش از دفتر یا بدون حرکت افتتاحیه).
 *   - unsupported_movement_type : دفتر شامل نوع حرکتی است که هیچ مسیر ثبت برنامه ندارد
 *                                 و مغایرت ممکن است از همان حرکت‌های ثبت‌نشده باشد.
 *   - ledger_discrepancy         : مانده و دفتر اختلاف دارند و هیچ توضیح شناخته‌شده‌ای ندارند.
 *   - missing_reservation_functionality: qty_reserved هیچ مسیر نگه‌داری ندارد (چرخهٔ رزرو ناقص است).
 *
 * این فایل خالص است (بدون پایگاه‌داده) تا قواعد مستقل از SQL آزموده شوند.
 */

export const RECON_EPSILON = 0.00005; // یک‌دوم کوچک‌ترین واحد numeric(19,4)

export type ReconClassification =
  | 'ledger_discrepancy'
  | 'missing_reservation_functionality'
  | 'historical_data_limitation'
  | 'unsupported_movement_type';

export type ReconSeverity = 'critical' | 'high' | 'medium' | 'low';
export type ReconMetric = 'qty_on_hand' | 'qty_reserved';

export const RECON_CLASSIFICATIONS: readonly ReconClassification[] = [
  'ledger_discrepancy',
  'missing_reservation_functionality',
  'historical_data_limitation',
  'unsupported_movement_type',
];

export const RECON_SEVERITIES: readonly ReconSeverity[] = ['critical', 'high', 'medium', 'low'];

const UNPOSTED_SET: ReadonlySet<string> = new Set(UNPOSTED_TXN_KINDS);

/** یک کلید (شرکت، انبار، کالا، بچ) با تمام منابع تطبیق، همان‌طور که SQL برمی‌گرداند. */
export interface LedgerKeyRow {
  company_id: string;
  branch_id: string;
  warehouse_id: string;
  product_id: string;
  batch_id: string | null;
  /** Σ inventory_txn.qty برای کلید (۰ اگر سابقه‌ای نیست) — به‌صورت متن numeric */
  ledger_qty: string;
  ledger_txn_count: number;
  ledger_kinds: string[];
  /** null یعنی ردیف stock_balance وجود ندارد */
  recorded_qty_on_hand: string | null;
  recorded_qty_reserved: string | null;
  /** Σ stock_reservation.qty با status='active' */
  active_reservation_qty: string;
  active_reservation_count: number;
}

export interface ReconciliationFinding {
  companyId: string;
  domain: typeof LEDGER_DOMAIN;
  warehouseId: string;
  productId: string;
  batchId: string | null;
  metric: ReconMetric;
  referenceSource: 'inventory_txn' | 'stock_reservation';
  /** مرجع: برای qty_on_hand مجموع دفتر، برای qty_reserved مجموع رزروهای فعال */
  ledgerQty: number;
  recordedBalance: number;
  /** recordedBalance − ledgerQty */
  difference: number;
  classification: ReconClassification;
  severity: ReconSeverity;
  explanation: string;
}

const num = (v: string | null | undefined): number => (v === null || v === undefined ? 0 : Number(v));

/** خروجی یک کلید: حداکثر دو مغایرت (یکی برای مانده، یکی برای رزرو). */
export function classifyLedgerKey(row: LedgerKeyRow): ReconciliationFinding[] {
  const findings: ReconciliationFinding[] = [];
  const base = {
    companyId: row.company_id,
    domain: LEDGER_DOMAIN,
    warehouseId: row.warehouse_id,
    productId: row.product_id,
    batchId: row.batch_id,
  } as const;

  // ---- qty_on_hand در برابر دفتر ----
  const ledger = num(row.ledger_qty);
  const recorded = num(row.recorded_qty_on_hand);
  const diff = recorded - ledger;
  if (Math.abs(diff) > RECON_EPSILON) {
    const unsupportedKinds = row.ledger_kinds.filter((k) => UNPOSTED_SET.has(k)).sort();
    let classification: ReconClassification;
    let severity: ReconSeverity;
    let explanation: string;

    if (row.ledger_txn_count === 0) {
      classification = 'historical_data_limitation';
      severity = 'medium';
      explanation =
        'stock_balance has a quantity with no inventory_txn history. The balance predates the ledger or was loaded without an opening-balance movement. Not auto-corrected: the opening-balance policy is an owner decision.';
    } else if (unsupportedKinds.length > 0) {
      classification = 'unsupported_movement_type';
      severity = 'high';
      explanation =
        `The ledger contains movement kinds with no application posting path (${unsupportedKinds.join(', ')}). ` +
        'The difference may come from unledgered movements of those kinds and cannot be attributed without the source document.';
    } else {
      classification = 'ledger_discrepancy';
      severity = recorded < 0 || Math.abs(diff) >= 1 ? 'critical' : 'high';
      explanation =
        row.recorded_qty_on_hand === null
          ? 'The ledger has movements for this key but no stock_balance row exists.'
          : 'stock_balance.qty_on_hand differs from the sum of inventory_txn.qty for this key. The balance changed without a matching ledger movement, or a ledger row was written without applying the balance.';
    }

    findings.push({
      ...base,
      metric: 'qty_on_hand',
      referenceSource: 'inventory_txn',
      ledgerQty: ledger,
      recordedBalance: recorded,
      difference: diff,
      classification,
      severity,
      explanation,
    });
  }

  // ---- qty_reserved در برابر رزروهای فعال ----
  const reservedRecorded = num(row.recorded_qty_reserved);
  const reservedRef = num(row.active_reservation_qty);
  const reservedDiff = reservedRecorded - reservedRef;
  if (Math.abs(reservedDiff) > RECON_EPSILON) {
    findings.push({
      ...base,
      metric: 'qty_reserved',
      referenceSource: 'stock_reservation',
      ledgerQty: reservedRef,
      recordedBalance: reservedRecorded,
      difference: reservedDiff,
      classification: 'missing_reservation_functionality',
      severity: 'medium',
      explanation:
        'stock_balance.qty_reserved does not match the sum of active stock_reservation rows. No application path maintains qty_reserved or creates and releases reservations yet, so this is a known gap in the reservation lifecycle.',
    });
  }

  return findings;
}

export interface ReconciliationSummary {
  byClassification: Record<ReconClassification, number>;
  bySeverity: Record<ReconSeverity, number>;
}

export function summarizeFindings(findings: readonly ReconciliationFinding[]): ReconciliationSummary {
  const byClassification = Object.fromEntries(
    RECON_CLASSIFICATIONS.map((c) => [c, 0]),
  ) as Record<ReconClassification, number>;
  const bySeverity = Object.fromEntries(RECON_SEVERITIES.map((s) => [s, 0])) as Record<
    ReconSeverity,
    number
  >;
  for (const f of findings) {
    byClassification[f.classification] += 1;
    bySeverity[f.severity] += 1;
  }
  return { byClassification, bySeverity };
}

/** ترتیب قطعی گزارش: شدت، سپس شرکت/انبار/کالا/بچ/متریک (برای مقایسهٔ تکرارپذیر). */
const SEVERITY_RANK: Record<ReconSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export function sortFindings(findings: readonly ReconciliationFinding[]): ReconciliationFinding[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.companyId.localeCompare(b.companyId) ||
      a.warehouseId.localeCompare(b.warehouseId) ||
      a.productId.localeCompare(b.productId) ||
      (a.batchId ?? '').localeCompare(b.batchId ?? '') ||
      a.metric.localeCompare(b.metric),
  );
}
