import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';

/** یک صورتحسابِ اشتراک (ledger) — بدونِ پرداخت، وضعیت فقط issued/void. */
export interface BillingInvoice {
  id: string;
  invoice_no: string;
  period_start: string;
  period_end: string;
  amount: string; // decimal string
  currency: string;
  status: 'issued' | 'void';
  notes: string | null;
  issued_at: string;
}

interface BillingInvoiceRow extends QueryResultRow, BillingInvoice {}

const COLS = `id, invoice_no,
       period_start::text as period_start,
       period_end::text   as period_end,
       amount::text       as amount,
       currency, status, notes,
       issued_at::text    as issued_at`;

/**
 * ریپازیتوریِ صورتحسابِ اشتراک — فقط خواندن، همیشه با company_id (جداسازیِ اجاره).
 * صدور/پرداختِ خودکار در دامنهٔ مصوب نیست (بدونِ درگاهِ پرداخت/اشتراکِ پولی).
 */
@Injectable()
export class BillingRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list(companyId: string): Promise<BillingInvoice[]> {
    const { rows } = await this.pool.query<BillingInvoiceRow>(
      `select ${COLS} from billing_invoice
        where company_id = $1
        order by issued_at desc, invoice_no desc
        limit 200`,
      [companyId],
    );
    return rows;
  }

  async get(companyId: string, id: string): Promise<BillingInvoice | null> {
    const { rows } = await this.pool.query<BillingInvoiceRow>(
      `select ${COLS} from billing_invoice where company_id = $1 and id = $2 limit 1`,
      [companyId, id],
    );
    return rows[0] ?? null;
  }
}
