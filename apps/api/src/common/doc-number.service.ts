import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

/**
 * شماره‌گذاری اسناد — منبع: مهاجرت 0002 (document_series/number_counter) و
 * تابع fn_next_doc_number. به‌جای الگوی قدیمی «SO-<uuid8>» که هم تصادفی بود و
 * هم قید یکتایی (branch_id, fiscal_year, doc_number) را نقض نمی‌کرد ولی خوانا
 * نبود، شماره از series شعبه و سال مالی گرفته می‌شود:  PREFIX-YYYY-000001.
 *
 * اگر series فعالی برای (branch, doc_kind, fiscal_year) تعریف نشده باشد، یک
 * series پیش‌فرض با prefix همان doc_kind ساخته می‌شود تا جریان سند هرگز به‌خاطر
 * نبودِ پیکربندی متوقف نشود (idempotent با on-conflict).
 */
export type DocKind =
  | 'sales_order'
  | 'waybill'
  | 'invoice'
  | 'credit_note'
  | 'return_request'
  | 'purchase_order'
  | 'goods_receipt'
  | 'supplier_invoice'
  | 'payment_voucher'
  | 'receipt'
  | 'journal'
  | 'stock_count'
  | 'stock_transfer'
  | 'tour_receipt';

/** prefix پیش‌فرض هر نوع سند وقتی series سفارشی تعریف نشده باشد */
const DEFAULT_PREFIX: Record<DocKind, string> = {
  sales_order: 'SO',
  waybill: 'WB',
  invoice: 'INV',
  credit_note: 'CN',
  return_request: 'RET',
  purchase_order: 'PO',
  goods_receipt: 'GRN',
  supplier_invoice: 'SINV',
  payment_voucher: 'PV',
  receipt: 'RCT',
  journal: 'JV',
  stock_count: 'SC',
  stock_transfer: 'TR',
  tour_receipt: 'TUR',
};

/** سال مالی جاری (شمسی) — مبنای period شماره‌گذاری */
export const persianYear = (when: Date = new Date()): number => {
  const parts = new Intl.DateTimeFormat('en-u-ca-persian', {
    year: 'numeric',
    timeZone: 'Asia/Tehran',
  }).formatToParts(when);
  return Number(parts.find((p) => p.type === 'year')?.value ?? 1400);
};

/** قالب شماره: PREFIX-YYYY-NNNNNN (شمارنده ۶ رقمی با صفرهای ابتدایی) */
const formatDocNumber = (prefix: string, year: number, seq: number): string =>
  `${prefix || 'DOC'}-${year}-${String(seq).padStart(6, '0')}`;

export interface DocNumberResult {
  doc_number: string;
  series_id: string;
  fiscal_year: number;
}

@Injectable()
export class DocNumberService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * گرفتن شماره بعدی سند. اگر `client` داده شود در همان تراکنش اجرا می‌شود
   * (شمارنده باید با خودِ insert اتمیک باشد تا دوباره شماره ندهد).
   */
  async next(
    branchId: string,
    kind: DocKind,
    opts: { fiscalYear?: number; client?: PoolClient } = {},
  ): Promise<DocNumberResult> {
    const fiscalYear = opts.fiscalYear ?? persianYear();
    const period = String(fiscalYear);
    const runner = opts.client ?? this.pool;

    // series فعال را پیدا کن؛ نبود → بساز (idempotent)
    let series = await runner.query<{ id: string; prefix: string }>(
      `select id, prefix from document_series
        where branch_id = $1 and doc_kind = $2 and fiscal_year = $3 and is_active
        order by prefix limit 1`,
      [branchId, kind, fiscalYear],
    );
    let seriesId = series.rows[0]?.id as string | undefined;
    let prefix = series.rows[0]?.prefix as string | undefined;

    if (!seriesId) {
      prefix = DEFAULT_PREFIX[kind];
      const created = await runner.query<{ id: string }>(
        `insert into document_series (branch_id, doc_kind, fiscal_year, prefix, is_active)
         values ($1, $2, $3, $4, true)
         on conflict (branch_id, doc_kind, fiscal_year)
         do update set is_active = true
         returning id`,
        [branchId, kind, fiscalYear, prefix],
      );
      seriesId = created.rows[0].id;
    }

    // fn_next_doc_number شمارنده را اتمیک بالا می‌برد (upsert روی period)
    const seq = await runner.query<{ n: string }>(
      `select fn_next_doc_number($1::uuid, $2)::text as n`,
      [seriesId, period],
    );
    const number = Number(seq.rows[0].n);
    return {
      doc_number: formatDocNumber(prefix ?? DEFAULT_PREFIX[kind], fiscalYear, number),
      series_id: seriesId,
      fiscal_year: fiscalYear,
    };
  }
}

/** توکن DI برای تزریق صریح (سازگار با esbuild بدون emitDecoratorMetadata) */
export const DOC_NUMBER_SERVICE = 'DOC_NUMBER_SERVICE';
