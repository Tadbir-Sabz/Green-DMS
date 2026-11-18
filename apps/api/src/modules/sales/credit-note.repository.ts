import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import type { PoolClient } from 'pg';
import { PG_POOL } from '../../database/database.module';
import { DOC_NUMBER_SERVICE, persianYear, type DocNumberService } from '../../common/doc-number.service';
import { roundMoney2 } from '../../common/financial';
import { allocateRefundLine, settleCreditTotal, CreditNoteError } from './credit-note';

export interface CreditNoteSummaryRow extends QueryResultRow {
  id: string;
  doc_number: string;
  amount: string;
  status: string;
  issued_at: string;
}

export interface IssuedCreditNote {
  id: string;
  doc_number: string;
  amount: string;
  line_count: number;
}

export type IssueCreditNoteResult =
  | { ok: true; note: IssuedCreditNote }
  /** مرجوعی یافت نشد (یا متعلق به این شرکت نیست) */
  | { ok: false; reason: 'not_found' }
  /** وضعیت اجازهٔ صدور نمی‌دهد (posted نیست / قبلاً بستانکار شده) */
  | { ok: false; reason: 'not_posted'; status: string }
  | { ok: false; reason: 'already_credited'; credit_note_id: string };

/** خطای ارجاع — به 400 نگاشت می‌شود (در پیام فارسی) */
export class CreditNoteReferenceError extends Error {
  constructor(
    public readonly code:
      | 'credit_requires_invoice'
      | 'nothing_to_credit'
      | 'lines_missing_invoice_link'
      | 'invoice_line_not_found'
      | 'line_product_mismatch'
      | 'invoice_customer_mismatch',
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'CreditNoteReferenceError';
  }
}

const NUM = 1e-9;

/**
 * یادداشت بستانکار مرجوعی — صدور در یک تراکنش:
 *   قفلِ سندِ مرجوعی (FOR UPDATE) + قفلِ خطوط فاکتور (به ترتیبِ id) ⇒
 *   محاسبهٔ سهم هر قلم از line_total/tax_amount ذخیره‌شدهٔ فاکتور ⇒
 *   کنترل سقفِ سخت (grand_total − بستانکارهای posted قبلی) و سقفِ qty هر خط ⇒
 *   درج credit_note(posted) + credit_note_line + customer_ledger_entry (credit) +
 *   اتصال return_request.credit_note_id (شرطی؛ دوبار‌صدور غیرممکن).
 *   فاکتورِ posted UPDATE نمی‌شود (fn_immutable_after_post)؛ «بازگشت کامل/جزئی»
 *   از نمای v_invoice_return_summary (migration 0067، security_invoker) خوانده می‌شود.
 *
 * سندِ کلِ (GL/journal) ثبت نمی‌شود — قوانینِ خودکارِ ثبتِ حسابداری هنوز
 * مصوبهٔ مالک ندارند (OD-07)؛ این سرویس فقط دفترِ مشتری (AR) را می‌نویسد.
 * بهای تمام‌شدهٔ کالای برگشتی به این سند ربطی ندارد (OD-01).
 */
@Injectable()
export class CreditNoteRepository {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(DOC_NUMBER_SERVICE) private readonly docNumbers: DocNumberService,
  ) {}

  /** خلاصهٔ یادداشت بستانکارِ متصل به یک مرجوعی (برای نمایش در API) — null اگر نشده */
  async findSummaryByReturnId(returnId: string): Promise<CreditNoteSummaryRow | null> {
    const { rows } = await this.pool.query<CreditNoteSummaryRow>(
      `select cn.id, cn.doc_number, cn.amount::text as amount, cn.status,
              cn.issued_at::text as issued_at
         from credit_note cn
         join return_request r on r.credit_note_id = cn.id
        where r.id = $1`,
      [returnId],
    );
    return rows[0] ?? null;
  }

  async issueCreditNote(
    companyId: string,
    returnId: string,
  ): Promise<IssueCreditNoteResult> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');

      // (۱) قفل سرخط مرجوعی — مبنای idempotency (credit_note_id شرطی در انتهای tx)
      const head = await client.query<{
        id: string;
        branch_id: string;
        customer_id: string;
        invoice_id: string | null;
        status: string;
        credit_note_id: string | null;
        doc_number: string;
      } & QueryResultRow>(
        `select r.id, r.branch_id, r.customer_id, r.invoice_id, r.status, r.credit_note_id, r.doc_number
           from return_request r
           join branch b on b.id = r.branch_id
          where r.id = $1 and b.company_id = $2
          for update of r`,
        [returnId, companyId],
      );
      if (head.rowCount === 0) {
        await client.query('rollback');
        return { ok: false, reason: 'not_found' };
      }
      const h = head.rows[0];
      if (h.status !== 'posted') {
        await client.query('rollback');
        return { ok: false, reason: 'not_posted', status: h.status };
      }
      if (h.credit_note_id) {
        await client.query('rollback');
        return { ok: false, reason: 'already_credited', credit_note_id: h.credit_note_id };
      }
      if (!h.invoice_id) {
        throw new CreditNoteReferenceError(
          'credit_requires_invoice',
          'صدور یادداشت بستانکار فقط برای مرجوعیِ متصل به فاکتور ممکن است.',
        );
      }
      const invoiceId = h.invoice_id;

      // (۲) خطوط دریافتی (qty_approved ثبت شده) با پیوندشان به خطوط فاکتور
      const rl = await client.query<{
        product_id: string;
        qty: number;
        invoice_line_id: string | null;
      } & QueryResultRow>(
        `select product_id, qty_approved::float8 as qty, invoice_line_id
           from return_request_line
          where return_request_id = $1 and qty_approved is not null and qty_approved > 0`,
        [returnId],
      );
      if (rl.rowCount === 0) {
        throw new CreditNoteReferenceError(
          'nothing_to_credit',
          'هیچ قلمِ دریافتیِ قابلِ بستانکار روی این مرجوعی ثبت نشده است.',
        );
      }
      const missing = rl.rows.filter((r) => !r.invoice_line_id).map((r) => r.product_id);
      if (missing.length > 0) {
        throw new CreditNoteReferenceError(
          'lines_missing_invoice_link',
          'برخی قلم‌های این مرجوعی به خطِ فاکتور متصل نیستند؛ صدور بستانکار ممکن نیست.',
          { product_ids: missing },
        );
      }

      // (۳) قفلِ فاکتور + خطوط آن (ترتیبِ id ⇒ بدون بن‌بست)
      const inv = await client.query<{
        id: string;
        grand_total: string;
        customer_id: string;
        status: string;
      } & QueryResultRow>(
        `select i.id, i.grand_total::text as grand_total, i.customer_id, i.status
           from invoice i
           join branch b on b.id = i.branch_id
          where i.id = $1 and b.company_id = $2
          for update of i`,
        [invoiceId, companyId],
      );
      if (inv.rowCount === 0) {
        throw new CreditNoteReferenceError('invoice_line_not_found', 'فاکتورِ متصل یافت نشد.', {
          invoice_id: invoiceId,
        });
      }
      const invoice = inv.rows[0];
      if (invoice.customer_id !== h.customer_id) {
        throw new CreditNoteReferenceError(
          'invoice_customer_mismatch',
          'فاکتورِ متصل متعلق به مشتریِ این مرجوعی نیست.',
        );
      }

      const lineIds = [...new Set(rl.rows.map((r) => r.invoice_line_id as string))];
      const ilRows = await client.query<{
        id: string;
        product_id: string;
        qty: number;
        unit_price: number;
        line_total: string;
        tax_amount: string;
      } & QueryResultRow>(
        `select id, product_id, qty::float8 as qty, unit_price::float8 as unit_price,
                line_total::text as line_total, tax_amount::text as tax_amount
           from invoice_line
          where id = any($1::uuid[])
          order by id
          for update`,
        [lineIds],
      );
      const byId = new Map(ilRows.rows.map((r) => [r.id, r]));
      if (byId.size !== lineIds.length) {
        throw new CreditNoteReferenceError('invoice_line_not_found', 'یکی از خطوط فاکتور یافت نشد.', {
          invoice_line_ids: lineIds.filter((id) => !byId.has(id)),
        });
      }

      // (۴) سقفِ قبلیِ بستانکار (اسناد posted) هر خط + کل فاکتور
      const prior = await client.query<{ invoice_line_id: string; qty: number } & QueryResultRow>(
        `select cnl.invoice_line_id, coalesce(sum(cnl.qty), 0)::float8 as qty
           from credit_note_line cnl
           join credit_note cn on cn.id = cnl.credit_note_id
          where cn.invoice_id = $1 and cn.status = 'posted' and cnl.invoice_line_id is not null
          group by cnl.invoice_line_id`,
        [invoiceId],
      );
      const priorQty = new Map(prior.rows.map((r) => [r.invoice_line_id, r.qty]));
      const priorTotalRow = await client.query<{ total: string } & QueryResultRow>(
        `select coalesce(sum(amount), 0)::text as total
           from credit_note
          where invoice_id = $1 and status = 'posted'`,
        [invoiceId],
      );
      const priorTotal = Number(priorTotalRow.rows[0]?.total ?? '0');

      // (۵) محاسبه — به‌تناسب از مقادیر ذخیره‌شدهٔ فاکتور (credit-note.ts)
      const lines = rl.rows.map((r) => {
        const il = byId.get(r.invoice_line_id as string)!;
        if (il.product_id !== r.product_id) {
          throw new CreditNoteReferenceError(
            'line_product_mismatch',
            'کالای قلمِ مرجوعی با خطِ فاکتورِ متصل یکسان نیست.',
            { invoice_line_id: il.id, invoice_product_id: il.product_id, product_id: r.product_id },
          );
        }
        return allocateRefundLine({
          invoice_line_id: il.id,
          product_id: r.product_id,
          qty: r.qty,
          invoice_line: {
            id: il.id,
            qty: il.qty,
            unit_price: il.unit_price,
            line_total: Number(il.line_total),
            tax_amount: Number(il.tax_amount),
          },
          already_credited_qty: priorQty.get(il.id) ?? 0,
        });
      });
      const eligible = roundMoney2(Number(invoice.grand_total) - priorTotal);
      const { total } = settleCreditTotal(lines, eligible);

      // (۶) درج سند بستانکار — شماره از series اختصاصی credit_note
      const doc = await this.docNumbers.next(h.branch_id, 'credit_note', {
        fiscalYear: persianYear(),
        client,
      });
      const noteId = randomUUID();
      await client.query(
        `insert into credit_note
           (id, branch_id, doc_number, fiscal_year, invoice_id, customer_id,
            reason_code, amount, status, issued_at)
         values ($1, $2, $3, $4, $5, $6, 'sales_return', $7, 'posted', now())`,
        [noteId, h.branch_id, doc.doc_number, doc.fiscal_year, invoiceId, h.customer_id, total.toFixed(2)],
      );
      for (const l of lines) {
        await client.query(
          `insert into credit_note_line
             (credit_note_id, invoice_line_id, product_id, qty, unit_price, tax_amount, line_total)
           values ($1, $2, $3, $4, $5, $6, $7)`,
          [
            noteId,
            l.invoice_line_id,
            l.product_id,
            l.qty,
            l.unit_price.toFixed(4),
            l.tax_amount.toFixed(2),
            l.line_total.toFixed(2),
          ],
        );
      }

      // (۷) دفتر بدهکاری مشتری: بستانکار = credit (کاهش بدهی)
      await client.query(
        `insert into customer_ledger_entry
           (branch_id, customer_id, entry_date, doc_type, doc_id, description, debit, credit)
         values ($1, $2, current_date, 'credit_note', $3, $4, 0, $5)`,
        [h.branch_id, h.customer_id, noteId, `یادداشت بستانکار مرجوعی ${doc.doc_number}`, total.toFixed(2)],
      );

      // (۸) اتصال شرطی — دوبار‌صدور حتی در رقابت غیرممکن است
      const linked = await client.query(
        `update return_request
            set credit_note_id = $2
          where id = $1 and credit_note_id is null
          returning id`,
        [returnId, noteId],
      );
      if (linked.rowCount !== 1) {
        throw new CreditNoteError('credit_exceeds_invoice', 'این مرجوعی هم‌زمان بستانکار شده است.', {
          return_id: returnId,
        });
      }

      await client.query('commit');
      return {
        ok: true,
        note: {
          id: noteId,
          doc_number: doc.doc_number,
          amount: total.toFixed(2),
          line_count: lines.length,
        },
      };
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
