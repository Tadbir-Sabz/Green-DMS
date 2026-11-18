/**
 * یادداشت بستانکار مرجوعی (credit note) — محاسباتِ خالص و قابلِ تست.
 *
 * مبنای محاسبه (TASK-P4-FC): **به‌تناسب از مقادیرِ ذخیره‌شدهٔ خودِ فاکتور**
 * (هر خطِ فاکتور = منبع حقیقت قیمت/تخفیف/مالیات) — نه از `return_request_line.unit_price`
 * (که در حال حاضر برای مرجوعی‌ها صفر ثبت می‌شود) و نه از قیمتِ روز.
 *
 * برای هر قلمِ دریافتی:
 *   share      = qty_received / invoice_line.qty
 *   line_total = round2(invoice_line.line_total × share)   // شامل تخفیف و مالیاتِ خط
 *   tax_amount = round2(invoice_line.tax_amount × share)   // جزءِ مالیاتی همان سهم
 *   unit_price = invoice_line.unit_price                    // تصویرِ قیمتِ اصلی (traceability)
 *
 * گرد‌کردن: قراردادِ موجودِ ریپازیتوری (`roundMoney2` از common/financial) — Math.round به +∞
 * (نه half-away-from-zero)؛ منفی‌ها عمداً حفظ شده‌اند.
 *
 * سقفِ سخت: مجموعِ بستانکار این سند نباید از ماندهٔ مجازِ فاکتور
 *   eligible = grand_total − Σ(credit_noteهای posted قبلی همان فاکتور)
 * فراتر رود. فراتر رفتن ⇒ CreditNoteError('credit_exceeds_invoice') — fail-closed؛
 * یعنی روی فاکتورهایی که Σline_total آن‌ها به‌خاطر خطای دوگانه‌کسرِ تخفیف در مسیر
 * مستقیمِ POST /invoices از grand_total بزرگ‌تر است، بازپرداخت کامل رد می‌شود
 * (تصمیمِ مالک OD-08 در سند TASK-P4-FC).
 */
import { roundMoney2 } from '../../common/financial';

export type CreditNoteErrorCode =
  | 'credit_exceeds_invoice'
  | 'credit_exceeds_invoiced_qty';

export class CreditNoteError extends Error {
  constructor(
    public readonly code: CreditNoteErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'CreditNoteError';
  }
}

/** قلم محاسباتیِ یک خطِ بستانکار */
export interface CreditLineInput {
  /** شناسهٔ خط فاکتور — پیوند traceability به فاکتور و خط آن */
  invoice_line_id: string;
  product_id: string;
  /** مقدار دریافتیِ قابلِ بستانکار (qty_approved) */
  qty: number;
  invoice_line: {
    id: string;
    qty: number;
    unit_price: number;
    line_total: number;
    tax_amount: number;
  };
  /** مجموع مقدار قبلاً بستانکارشدهٔ این خطِ فاکتور (سندهای posted قبلی) */
  already_credited_qty: number;
}

export interface CreditLineResult {
  invoice_line_id: string;
  product_id: string;
  qty: number;
  unit_price: number;
  tax_amount: number;
  line_total: number;
}

const EPS = 1e-9;

/**
 * سهمِ یک خطِ دریافتی از همان خطِ فاکتور. خطا (qty نامعتبر/فراتر از باقی‌مانده)
 * throw می‌کند — تماس‌گیرنده باید پیش‌تر eligibility را بررسی کرده باشد.
 */
export const allocateRefundLine = (input: CreditLineInput): CreditLineResult => {
  const il = input.invoice_line;
  if (!(il.qty > 0)) {
    throw new CreditNoteError('credit_exceeds_invoiced_qty', 'مقدارِ خطِ فاکتور نامعتبر است.', {
      invoice_line_id: il.id,
      invoice_qty: il.qty,
    });
  }
  if (!(input.qty > 0)) {
    throw new CreditNoteError('credit_exceeds_invoiced_qty', 'مقدارِ دریافتیِ قلم نامعتبر است.', {
      invoice_line_id: il.id,
    });
  }
  const remaining = roundMoney2(il.qty - input.already_credited_qty);
  if (input.qty - remaining > EPS) {
    throw new CreditNoteError(
      'credit_exceeds_invoiced_qty',
      'مقدارِ بستانکار این قلم از باقی‌ماندهٔ قابلِ بستانکارِ خطِ فاکتور بیشتر است.',
      {
        invoice_line_id: il.id,
        invoice_qty: il.qty,
        already_credited_qty: input.already_credited_qty,
        requested_qty: input.qty,
      },
    );
  }
  const share = input.qty / il.qty;
  const lineTotal = roundMoney2(il.line_total * share);
  const taxAmount = roundMoney2(il.tax_amount * share);
  return {
    invoice_line_id: il.id,
    product_id: input.product_id,
    qty: input.qty,
    unit_price: il.unit_price,
    tax_amount: taxAmount,
    line_total: lineTotal,
  };
};

/** جمعِ کلِ بستانکار و کنترل سقفِ سختِ ماندهٔ فاکتور (fail-closed). */
export const settleCreditTotal = (
  lines: CreditLineResult[],
  eligibleRemaining: number,
): { total: number } => {
  const total = roundMoney2(lines.reduce((sum, l) => sum + l.line_total, 0));
  if (total - eligibleRemaining > 0.004) {
    throw new CreditNoteError(
      'credit_exceeds_invoice',
      'مبلغِ بستانکار از ماندهٔ مجازِ فاکتور (grand_total − یادداشت‌های بستانکارِ ثبت‌شده) بیشتر است.',
      { computed_total: total.toFixed(2), eligible_remaining: roundMoney2(eligibleRemaining).toFixed(2) },
    );
  }
  if (total <= 0) {
    throw new CreditNoteError('credit_exceeds_invoice', 'مبلغِ بستانکار باید بزرگ‌تر از صفر باشد.', {
      computed_total: total.toFixed(2),
    });
  }
  return { total };
};
