import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import type { DocNumberService } from '../../common/doc-number.service';
import { DOC_NUMBER_SERVICE } from '../../common/doc-number.service';
import { persianYear } from '../../common/doc-number.service';
import type { CreateInvoiceDto, InvoiceLineDto } from './invoice.dto';
import type { CreateRequestDto, RequestLineDto, UpdateRequestDto } from './request.dto';
import type { UpdateDeliveryDto } from './delivery.dto';

// ---------------- Rows (شکل قرارداد) ----------------

export interface RequestRow extends QueryResultRow {
  id: string;
  branch_id: string;
  customer_id: string;
  channel: string;
  requested_by: string | null;
  tour_id: string | null;
  request_date: string;
  requested_delivery_date: string | null;
  note: string | null;
  status: string;
  sales_order_id: string | null;
  client_uuid: string | null;
}

/** قلم درخواست برای نمایش — تمام فیلدهای اختیاری به‌صورت null */
export interface RequestLineView {
  product_id: string;
  packaging_id: string | null;
  qty: number;
  requested_price: string | null;
  note: string | null;
}

export interface InvoiceRow extends QueryResultRow {
  id: string;
  branch_id: string;
  doc_number: string;
  fiscal_year: number;
  customer_id: string;
  sales_order_id: string | null;
  waybill_id: string | null;
  invoice_date: string;
  due_date: string | null;
  subtotal: string | null;
  discount_total: string | null;
  tax_total: string | null;
  grand_total: string | null;
  paid_amount: string | null;
  status: string;
  return_status: string | null;
  moadian_status: string | null;
  lines?: InvoiceLineView[];
}

export interface InvoiceLineView {
  product_id: string;
  qty: number;
  unit_price: string | null;
  discount_amount: string | null;
  tax_amount: string | null;
  line_total: string | null;
}

export interface DeliveryRow extends QueryResultRow {
  id: string;
  branch_id: string;
  doc_number: string;
  waybill_id: string;
  tour_id: string | null;
  courier_staff_id: string | null;
  planned_date: string;
  status: string;
  delivered_at: string | null;
  failure_reason: string | null;
  receiver_name: string | null;
  signature_url: string | null;
  photo_url: string | null;
}

const encodeCursor = (v: string): string => Buffer.from(v, 'utf8').toString('base64url');
const decodeCursor = (cursor: string): string => Buffer.from(cursor, 'base64url').toString('utf8');

const REQUEST_COLUMNS = `r.id, r.branch_id, r.customer_id, r.channel, r.requested_by, r.tour_id,
  r.request_date::text as request_date, r.requested_delivery_date::text as requested_delivery_date,
  r.note, r.status, r.sales_order_id, r.client_uuid`;

const INVOICE_COLUMNS = `i.id, i.branch_id, i.doc_number, i.fiscal_year, i.customer_id,
  i.sales_order_id, i.waybill_id, i.invoice_date::text as invoice_date, i.due_date::text as due_date,
  i.subtotal::text as subtotal, i.discount_total::text as discount_total, i.tax_total::text as tax_total,
  i.grand_total::text as grand_total, i.paid_amount::text as paid_amount, i.status,
  i.return_status, i.moadian_status`;

const DELIVERY_COLUMNS = `d.id, d.branch_id, d.doc_number, d.waybill_id, d.tour_id, d.courier_staff_id,
  d.planned_date::text as planned_date, d.status, d.delivered_at, d.failure_reason, d.receiver_name,
  d.signature_url, d.photo_url`;

const DELIVERY_FROM = `from delivery d`;

/**
 * دسترسی دادهٔ زنجیرهٔ فروش (ماژول ۴): درخواست مشتری، فاکتور و تحویل.
 * همه کوئری‌ها از branch.company_id به شرکت نشست قفل می‌شوند.
 */
@Injectable()
export class SalesChainRepository {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(DOC_NUMBER_SERVICE) private readonly docNumbers: DocNumberService,
  ) {}

  // ============ Requests ============

  async listRequests(
    companyId: string,
    query: { cursor?: string; limit?: number; customer_id?: string; status?: string; channel?: string },
  ): Promise<{ items: RequestRow[]; nextCursor: string | null; hasMore: boolean }> {
    const limit = query.limit ?? 50;
    const params: unknown[] = [companyId];
    const where: string[] = ['b.company_id = $1'];
    if (query.customer_id) {
      params.push(query.customer_id);
      where.push(`r.customer_id = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      where.push(`r.status = $${params.length}`);
    }
    if (query.channel) {
      params.push(query.channel);
      where.push(`r.channel = $${params.length}`);
    }
    if (query.cursor) {
      params.push(decodeCursor(query.cursor));
      where.push(`r.id > $${params.length}::uuid`);
    }
    params.push(limit + 1);
    const { rows } = await this.pool.query<RequestRow>(
      `select ${REQUEST_COLUMNS} from customer_request r
         join branch b on b.id = r.branch_id
        where ${where.join(' and ')}
        order by r.id limit $${params.length}`,
      params,
    );
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return { items: page, hasMore, nextCursor: hasMore && last ? encodeCursor(last.id) : null };
  }

  async findRequest(companyId: string, id: string): Promise<RequestRow | null> {
    const { rows } = await this.pool.query<RequestRow>(
      `select ${REQUEST_COLUMNS} from customer_request r
         join branch b on b.id = r.branch_id
        where r.id = $1 and b.company_id = $2`,
      [id, companyId],
    );
    return rows[0] ?? null;
  }

  async requestClientUuidExists(clientUuid: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ id: string }>(
      'select id from customer_request where client_uuid = $1',
      [clientUuid],
    );
    return rows[0]?.id ?? null;
  }

  async customerBranch(companyId: string, customerId: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ branch_id: string }>(
      `select c.branch_id from customer c join branch b on b.id = c.branch_id
        where c.id = $1 and b.company_id = $2 and c.deleted_at is null`,
      [customerId, companyId],
    );
    return rows[0]?.branch_id ?? null;
  }

  async insertRequest(
    dto: CreateRequestDto,
    branchId: string,
    requestedBy: string,
  ): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const id = randomUUID();
      await client.query(
        `insert into customer_request
           (id, branch_id, customer_id, channel, requested_by, tour_id, request_date,
            requested_delivery_date, note, status, client_uuid)
         values ($1,$2,$3,$4,$5,$6, coalesce($7::date, current_date), $8::date, $9, 'submitted', $10)`,
        [
          id,
          branchId,
          dto.customer_id,
          dto.channel,
          dto.requested_by ?? requestedBy,
          dto.tour_id ?? null,
          dto.request_date ?? null,
          dto.requested_delivery_date ?? null,
          dto.note ?? null,
          dto.client_uuid ?? null,
        ],
      );
      await this.insertRequestLines(client, id, dto.lines ?? []);
      await client.query('commit');
      return id;
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  private async insertRequestLines(
    client: PoolClient,
    requestId: string,
    lines: RequestLineDto[],
  ): Promise<void> {
    for (const l of lines) {
      await client.query(
        `insert into customer_request_line
           (customer_request_id, product_id, packaging_id, qty, requested_price, note)
         values ($1,$2,$3,$4,$5,$6)`,
        [
          requestId,
          l.product_id,
          l.packaging_id ?? null,
          l.qty,
          l.requested_price ?? null,
          l.note ?? null,
        ],
      );
    }
  }

  async findRequestLines(requestId: string): Promise<RequestLineView[]> {
    const { rows } = await this.pool.query<{
      product_id: string;
      packaging_id: string | null;
      qty: string;
      requested_price: string | null;
      note: string | null;
    }>(
      `select product_id, packaging_id, qty::text as qty, requested_price::text as requested_price, note
         from customer_request_line where customer_request_id = $1 order by id`,
      [requestId],
    );
    return rows.map((r) => ({
      product_id: r.product_id,
      packaging_id: r.packaging_id,
      qty: Number(r.qty),
      requested_price: r.requested_price,
      note: r.note,
    }));
  }

  async updateRequest(companyId: string, id: string, dto: UpdateRequestDto): Promise<boolean> {
    const sets: string[] = [];
    const params: unknown[] = [id, companyId];
    const add = (fragment: string, value: unknown): void => {
      params.push(value);
      sets.push(fragment.replace('$?', `$${params.length}`));
    };
    if (dto.status !== undefined) add('status = $?', dto.status);
    if (dto.requested_delivery_date !== undefined) add('requested_delivery_date = $?::date', dto.requested_delivery_date);
    if (dto.note !== undefined) add('note = $?', dto.note);
    if (sets.length === 0) return true;
    const { rowCount } = await this.pool.query(
      `update customer_request set ${sets.join(', ')}, updated_at = now()
        where id = $1 and branch_id in (select id from branch where company_id = $2)`,
      params,
    );
    return (rowCount ?? 0) > 0;
  }

  /** درخواست را converted و sales_order_id را ست می‌کند */
  async markRequestConverted(requestId: string, salesOrderId: string): Promise<void> {
    await this.pool.query(
      `update customer_request set status = 'converted', sales_order_id = $2, updated_at = now()
        where id = $1`,
      [requestId, salesOrderId],
    );
  }

  // ============ Invoices ============

  async listInvoices(
    companyId: string,
    query: { cursor?: string; limit?: number; customer_id?: string; status?: string; moadian_status?: string },
  ): Promise<{ items: InvoiceRow[]; nextCursor: string | null; hasMore: boolean }> {
    const limit = query.limit ?? 50;
    const params: unknown[] = [companyId];
    const where: string[] = ['b.company_id = $1'];
    if (query.customer_id) {
      params.push(query.customer_id);
      where.push(`i.customer_id = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      where.push(`i.status = $${params.length}`);
    }
    if (query.moadian_status) {
      params.push(query.moadian_status);
      where.push(`i.moadian_status = $${params.length}`);
    }
    if (query.cursor) {
      params.push(decodeCursor(query.cursor));
      where.push(`i.doc_number > $${params.length}`);
    }
    params.push(limit + 1);
    const { rows } = await this.pool.query<InvoiceRow>(
      `select ${INVOICE_COLUMNS} from invoice i
         join branch b on b.id = i.branch_id
        where ${where.join(' and ')}
        order by i.doc_number limit $${params.length}`,
      params,
    );
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return { items: page, hasMore, nextCursor: hasMore && last ? encodeCursor(last.doc_number) : null };
  }

  async findInvoice(companyId: string, id: string): Promise<InvoiceRow | null> {
    const { rows } = await this.pool.query<InvoiceRow>(
      `select ${INVOICE_COLUMNS} from invoice i
         join branch b on b.id = i.branch_id
        where i.id = $1 and b.company_id = $2`,
      [id, companyId],
    );
    return rows[0] ?? null;
  }

  async findInvoiceLines(invoiceId: string): Promise<InvoiceLineView[]> {
    const { rows } = await this.pool.query<{
      product_id: string;
      qty: string;
      unit_price: string;
      discount_amount: string;
      tax_amount: string;
      line_total: string;
    }>(
      `select product_id, qty::text as qty, unit_price::text as unit_price,
              discount_amount::text as discount_amount, tax_amount::text as tax_amount,
              line_total::text as line_total
         from invoice_line where invoice_id = $1 order by line_no`,
      [invoiceId],
    );
    return rows.map((r) => ({
      product_id: r.product_id,
      qty: Number(r.qty),
      unit_price: r.unit_price,
      discount_amount: r.discount_amount,
      tax_amount: r.tax_amount,
      line_total: r.line_total,
    }));
  }

  /**
   * صدور فاکتور. شمارهٔ سند و series_id در همان تراکنش با docNumbers.next گرفته
   * می‌شود (اتمیکی شمارنده). جمع‌ها از اقلام محاسبه و قید ck_invoice_total
   * (grand = subtotal - discount + tax) رعایت می‌شود. سپس ردیف بدهکاری مشتری در
   * customer_ledger_entry ثبت می‌شود (فاکتور = debit).
   */
  async insertInvoice(
    dto: CreateInvoiceDto,
    lines: InvoiceLineDto[],
    opts: { branchId: string; createdBy: string | null },
  ): Promise<{ id: string; doc_number: string }> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const fiscalYear = persianYear(new Date(dto.invoice_date));
      const doc = await this.docNumbers.next(opts.branchId, 'invoice', {
        fiscalYear,
        client,
      });
      const id = randomUUID();

      // محاسبهٔ جمع‌ها از اقلام (گرد به ۲ رقم برای سازگاری با numeric(19,2))
      let subtotal = 0;
      let discount = 0;
      let tax = 0;
      const computed = lines.map((l, idx) => {
        const unitPrice = Number(l.unit_price);
        const disc = Number(l.discount_amount ?? 0);
        const taxRate = l.tax_rate_pct ?? 0;
        const gross = l.qty * unitPrice - disc;
        const lineTax = Math.round(gross * taxRate) / 100;
        const lineTotal = gross + lineTax;
        subtotal += gross;
        discount += disc;
        tax += lineTax;
        return {
          lineNo: idx + 1,
          product_id: l.product_id,
          batch_id: l.batch_id ?? null,
          qty: l.qty,
          unitPrice: unitPrice.toFixed(4),
          discount: disc.toFixed(2),
          taxRate,
          tax: lineTax.toFixed(2),
          lineTotal: lineTotal.toFixed(2),
        };
      });
      const grand = subtotal - discount + tax;

      await client.query(
        `insert into invoice
           (id, branch_id, doc_number, fiscal_year, series_id, customer_id, sales_order_id,
            waybill_id, invoice_date, due_date, subtotal, discount_total, tax_total,
            grand_total, status, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9::date,$10::date,$11,$12,$13,$14,'posted',$15)`,
        [
          id,
          opts.branchId,
          doc.doc_number,
          doc.fiscal_year,
          doc.series_id,
          dto.customer_id,
          dto.sales_order_id ?? null,
          dto.waybill_id ?? null,
          dto.invoice_date,
          dto.due_date ?? null,
          subtotal.toFixed(2),
          discount.toFixed(2),
          tax.toFixed(2),
          grand.toFixed(2),
          opts.createdBy,
        ],
      );
      for (const l of computed) {
        await client.query(
          `insert into invoice_line
             (invoice_id, line_no, product_id, batch_id, qty, unit_price, discount_amount,
              tax_rate_pct, tax_amount, line_total)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            id,
            l.lineNo,
            l.product_id,
            l.batch_id,
            l.qty,
            l.unitPrice,
            l.discount,
            l.taxRate,
            l.tax,
            l.lineTotal,
          ],
        );
      }
      // دفتر بدهکاری مشتری: فاکتور = debit (افزایش بدهی)
      await client.query(
        `insert into customer_ledger_entry
           (branch_id, customer_id, entry_date, doc_type, doc_id, description, debit, credit)
         values ($1,$2,$3::date,'invoice',$4,$5,$6,0)`,
        [
          opts.branchId,
          dto.customer_id,
          dto.invoice_date,
          id,
          `فاکتور ${doc.doc_number}`,
          grand.toFixed(2),
        ],
      );
      await client.query('commit');
      return { id, doc_number: doc.doc_number };
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ============ Deliveries ============

  async listDeliveries(
    companyId: string,
    query: { cursor?: string; limit?: number; tour_id?: string; status?: string },
  ): Promise<{ items: DeliveryRow[]; nextCursor: string | null; hasMore: boolean }> {
    const limit = query.limit ?? 50;
    const params: unknown[] = [companyId];
    const where: string[] = ['b.company_id = $1'];
    if (query.tour_id) {
      params.push(query.tour_id);
      where.push(`d.tour_id = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      where.push(`d.status = $${params.length}`);
    }
    if (query.cursor) {
      params.push(decodeCursor(query.cursor));
      where.push(`d.doc_number > $${params.length}`);
    }
    params.push(limit + 1);
    const { rows } = await this.pool.query<DeliveryRow>(
      `select ${DELIVERY_COLUMNS} ${DELIVERY_FROM}
         join branch b on b.id = d.branch_id
        where ${where.join(' and ')}
        order by d.doc_number limit $${params.length}`,
      params,
    );
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return { items: page, hasMore, nextCursor: hasMore && last ? encodeCursor(last.doc_number) : null };
  }

  async findDelivery(companyId: string, id: string): Promise<DeliveryRow | null> {
    const { rows } = await this.pool.query<DeliveryRow>(
      `select ${DELIVERY_COLUMNS} ${DELIVERY_FROM}
         join branch b on b.id = d.branch_id
        where d.id = $1 and b.company_id = $2`,
      [id, companyId],
    );
    return rows[0] ?? null;
  }

  async updateDelivery(companyId: string, id: string, dto: UpdateDeliveryDto): Promise<boolean> {
    const sets: string[] = [];
    const params: unknown[] = [id, companyId];
    const add = (fragment: string, value: unknown): void => {
      params.push(value);
      sets.push(fragment.replace('$?', `$${params.length}`));
    };
    if (dto.status !== undefined) add('status = $?', dto.status);
    if (dto.delivered_at !== undefined) add('delivered_at = $?', dto.delivered_at);
    if (dto.failure_reason !== undefined) add('failure_reason = $?', dto.failure_reason);
    if (dto.receiver_name !== undefined) add('receiver_name = $?', dto.receiver_name);
    if (dto.signature_url !== undefined) add('signature_url = $?', dto.signature_url);
    if (dto.photo_url !== undefined) add('photo_url = $?', dto.photo_url);
    if (sets.length === 0) return true;

    const { rowCount } = await this.pool.query(
      `update delivery set ${sets.join(', ')}
        where id = $1 and branch_id in (select id from branch where company_id = $2)`,
      params,
    );
    return (rowCount ?? 0) > 0;
  }
}
