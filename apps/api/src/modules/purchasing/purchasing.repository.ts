import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { Runner } from '../../common/transaction';
import { PG_POOL } from '../../database/database.module';
import type { DocNumberService } from '../../common/doc-number.service';
import { DOC_NUMBER_SERVICE } from '../../common/doc-number.service';
import type {
  CreatePaymentVoucherDto,
  CreatePurchaseOrderDto,
  CreateSupplierInvoiceDto,
  PaymentAllocationDto,
} from './purchasing.dto';

/** گردکردن مبلغ به ۲ رقم اعشار به‌صورت رشته (numeric(19,2)) */
const r2 = (n: number): string => (Math.round(n * 100) / 100).toFixed(2);
const encodeCursor = (v: string): string => Buffer.from(v, 'utf8').toString('base64url');
const decodeCursor = (cursor: string): string => Buffer.from(cursor, 'base64url').toString('utf8');

// ---------------- Row shapes (API) ----------------

export interface PurchaseOrderLineRow {
  line_no: number;
  product_id: string;
  qty: string;
  qty_received: string;
  unit_price: string;
  discount_amount: string;
  tax_amount: string;
  line_total: string;
}

export interface PurchaseOrderRow extends QueryResultRow {
  id: string;
  branch_id: string;
  doc_number: string;
  fiscal_year: number;
  supplier_id: string;
  warehouse_id: string;
  order_date: string;
  expected_date: string | null;
  currency: string;
  subtotal: string;
  discount_total: string;
  tax_total: string;
  grand_total: string;
  status: string;
  lines?: PurchaseOrderLineRow[];
}

export interface SupplierInvoiceLineRow {
  line_no: number;
  product_id: string;
  qty: string;
  unit_price: string;
  tax_amount: string;
  line_total: string;
}

export interface SupplierInvoiceRow extends QueryResultRow {
  id: string;
  branch_id: string;
  doc_number: string;
  internal_no: string;
  supplier_id: string;
  purchase_order_id: string | null;
  invoice_date: string;
  due_date: string | null;
  amount: string;
  tax_amount: string;
  status: string;
  match_status: string;
  lines?: SupplierInvoiceLineRow[];
}

export interface PaymentVoucherRow extends QueryResultRow {
  id: string;
  branch_id: string;
  doc_number: string;
  fiscal_year: number;
  supplier_id: string;
  payment_date: string;
  method_id: string;
  amount: string;
  status: string;
  allocations?: { supplier_invoice_id: string; amount: string }[];
}

/** ماندهٔ باز یک فاکتور تأمین‌کننده برای تخصیص پرداخت */
export interface SupplierInvoiceBalance {
  supplier_id: string;
  total: number;
  allocated: number;
  remaining: number;
  status: string;
}

const PO_COLUMNS = `po.id, po.branch_id, po.doc_number, po.fiscal_year, po.supplier_id, po.warehouse_id,
  po.order_date::text as order_date, po.expected_date::text as expected_date, po.currency,
  po.subtotal::text as subtotal, po.discount_total::text as discount_total,
  po.tax_total::text as tax_total, po.grand_total::text as grand_total, po.status, po.created_by`;

const SINV_COLUMNS = `si.id, si.branch_id, si.doc_number, si.internal_no, si.supplier_id,
  si.purchase_order_id, si.invoice_date::text as invoice_date, si.due_date::text as due_date,
  si.amount::text as amount, si.tax_amount::text as tax_amount, si.status, si.match_status`;

const PV_COLUMNS = `pv.id, pv.branch_id, pv.doc_number, pv.fiscal_year, pv.supplier_id,
  pv.payment_date::text as payment_date, pv.method_id, pv.amount::text as amount, pv.status`;

/**
 * repository ماژول خرید/AP (ماژول ۸، مهاجرت 0015) — خواندن و نوشتن سفارش خرید،
 * فاکتور تأمین‌کننده و سند پرداخت. نوشتن‌ها تراکنشی‌اند و دفتر بدهکاری
 * تأمین‌کننده (supplier_ledger_entry) را با قرارداد «بدهکار=افزایش بدهی،
 * بستانکار=کاهش بدهی» (قرینهٔ customer_ledger_entry) به‌روز می‌کنند.
 *
 * دامنهٔ شرکت از راه branch_id اعمال می‌شود (هیچ‌یک از این جداول company_id
 * ندارند): branch_id in (select id from branch where company_id = …).
 */
@Injectable()
export class PurchasingRepository {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(DOC_NUMBER_SERVICE) private readonly docNumbers: DocNumberService,
  ) {}

  // ---------------- reference validation ----------------

  async branchInCompany(companyId: string, branchId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      `select 1 from branch where id = $1 and company_id = $2`,
      [branchId, companyId],
    );
    return rows.length > 0;
  }

  async supplierInCompany(companyId: string, supplierId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      `select 1 from supplier where id = $1 and company_id = $2`,
      [supplierId, companyId],
    );
    return rows.length > 0;
  }

  async warehouseInBranch(branchId: string, warehouseId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      `select 1 from warehouse where id = $1 and branch_id = $2`,
      [warehouseId, branchId],
    );
    return rows.length > 0;
  }

  /** شناسهٔ محصولاتی که به این company تعلق ندارند (برای رد 400) */
  async missingProducts(companyId: string, productIds: string[]): Promise<string[]> {
    if (productIds.length === 0) return [];
    const { rows } = await this.pool.query<{ id: string }>(
      `select id::text from product where company_id = $1 and id = any($2::uuid[])`,
      [companyId, productIds],
    );
    const found = new Set(rows.map((r) => r.id));
    return productIds.filter((id) => !found.has(id));
  }

  async paymentMethodActive(methodId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      `select 1 from payment_method where id = $1 and is_active`,
      [methodId],
    );
    return rows.length > 0;
  }

  async purchaseOrderInCompany(
    companyId: string,
    purchaseOrderId: string,
  ): Promise<{ supplier_id: string } | null> {
    const { rows } = await this.pool.query<{ supplier_id: string }>(
      `select po.supplier_id from purchase_order po
        where po.id = $1 and po.branch_id in (select id from branch where company_id = $2)`,
      [purchaseOrderId, companyId],
    );
    return rows[0] ?? null;
  }

  /** ماندهٔ باز فاکتورهای تأمین‌کننده (کل − تخصیص‌شده در اسناد posted) */
  async supplierInvoiceBalances(
    companyId: string,
    invoiceIds: string[],
  ): Promise<Map<string, SupplierInvoiceBalance>> {
    const map = new Map<string, SupplierInvoiceBalance>();
    if (invoiceIds.length === 0) return map;
    const { rows } = await this.pool.query<{
      id: string;
      supplier_id: string;
      amount: string;
      tax_amount: string;
      status: string;
      allocated: string;
    }>(
      `select si.id, si.supplier_id, si.amount::text, si.tax_amount::text, si.status,
              coalesce((
                select sum(pa.amount)
                  from payment_allocation pa
                  join payment_voucher pv on pv.id = pa.payment_voucher_id
                 where pa.supplier_invoice_id = si.id and pv.status = 'posted'
              ), 0)::text as allocated
         from supplier_invoice si
        where si.id = any($1::uuid[])
          and si.branch_id in (select id from branch where company_id = $2)`,
      [invoiceIds, companyId],
    );
    for (const r of rows) {
      const total = Number(r.amount) + Number(r.tax_amount);
      const allocated = Number(r.allocated);
      map.set(r.id, {
        supplier_id: r.supplier_id,
        total,
        allocated,
        remaining: Math.max(total - allocated, 0),
        status: r.status,
      });
    }
    return map;
  }

  // ---------------- Purchase Order ----------------

  async listPurchaseOrders(
    companyId: string,
    query: { cursor?: string; limit?: number; supplier_id?: string; status?: string },
  ): Promise<{ items: PurchaseOrderRow[]; nextCursor: string | null; hasMore: boolean }> {
    const limit = query.limit ?? 50;
    const params: unknown[] = [companyId];
    const where: string[] = ['po.branch_id in (select id from branch where company_id = $1)'];
    if (query.supplier_id) {
      params.push(query.supplier_id);
      where.push(`po.supplier_id = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      where.push(`po.status = $${params.length}`);
    }
    if (query.cursor) {
      const raw = decodeCursor(query.cursor);
      const sep = raw.indexOf('|');
      if (sep > 0) {
        params.push(raw.slice(0, sep), raw.slice(sep + 1));
        where.push(`(po.doc_number, po.id) > ($${params.length - 1}, $${params.length}::uuid)`);
      }
    }
    params.push(limit + 1);
    const { rows } = await this.pool.query<PurchaseOrderRow>(
      `select ${PO_COLUMNS} from purchase_order po
        where ${where.join(' and ')}
        order by po.doc_number, po.id
        limit $${params.length}`,
      params,
    );
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page,
      hasMore,
      nextCursor: hasMore && last ? encodeCursor(`${last.doc_number}|${last.id}`) : null,
    };
  }

  async findPurchaseOrder(companyId: string, id: string): Promise<PurchaseOrderRow | null> {
    const { rows } = await this.pool.query<PurchaseOrderRow>(
      `select ${PO_COLUMNS} from purchase_order po
        where po.id = $1 and po.branch_id in (select id from branch where company_id = $2)`,
      [id, companyId],
    );
    const head = rows[0];
    if (!head) return null;
    head.lines = await this.findPurchaseOrderLines(id);
    return head;
  }

  private async findPurchaseOrderLines(poId: string): Promise<PurchaseOrderLineRow[]> {
    const { rows } = await this.pool.query<PurchaseOrderLineRow>(
      `select line_no, product_id, qty::text as qty, qty_received::text as qty_received,
              unit_price::text as unit_price, discount_amount::text as discount_amount,
              tax_amount::text as tax_amount, line_total::text as line_total
         from purchase_order_line
        where purchase_order_id = $1
        order by line_no`,
      [poId],
    );
    return rows.map((r) => ({ ...r, line_no: Number(r.line_no) }));
  }

  /** ثبت سفارش خرید پیش‌نویس + اقلام؛ جمع‌ها از اقلام محاسبه می‌شود (تراکنشی) */
  async insertPurchaseOrder(
    dto: CreatePurchaseOrderDto,
    createdBy: string | null = null,
  ): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const { doc_number, fiscal_year } = await this.docNumbers.next(dto.branch_id, 'purchase_order', {
        client,
      });
      const id = randomUUID();

      let subtotal = 0;
      let discountTotal = 0;
      let taxTotal = 0;
      const lineValues = dto.lines.map((l, i) => {
        const gross = Number(l.qty) * Number(l.unit_price);
        const discount = Number(l.discount_amount ?? 0);
        const tax = Number(l.tax_amount ?? 0);
        subtotal += gross;
        discountTotal += discount;
        taxTotal += tax;
        return {
          lineNo: i + 1,
          productId: l.product_id,
          qty: l.qty,
          unitPrice: l.unit_price,
          discount: r2(discount),
          tax: r2(tax),
          lineTotal: r2(gross - discount + tax),
        };
      });
      const subtotalR = r2(subtotal);
      const discountR = r2(discountTotal);
      const taxR = r2(taxTotal);
      // grand_total دقیقاً = subtotal − discount + tax (قید ck_purchase_order_total)
      const grandR = r2(Number(subtotalR) - Number(discountR) + Number(taxR));

      await client.query(
        `insert into purchase_order
           (id, branch_id, doc_number, fiscal_year, supplier_id, warehouse_id, order_date,
            expected_date, currency, subtotal, discount_total, tax_total, grand_total, status,
            created_by)
         values ($1,$2,$3,$4,$5,$6, coalesce($7::date, current_date), $8::date,
                 coalesce($9,'IRR'), $10,$11,$12,$13, 'draft', $14)`,
        [
          id,
          dto.branch_id,
          doc_number,
          fiscal_year,
          dto.supplier_id,
          dto.warehouse_id,
          dto.order_date ?? null,
          dto.expected_date ?? null,
          dto.currency ?? null,
          subtotalR,
          discountR,
          taxR,
          grandR,
          createdBy,
        ],
      );

      for (const l of lineValues) {
        await client.query(
          `insert into purchase_order_line
             (purchase_order_id, line_no, product_id, qty, unit_price, discount_amount, tax_amount, line_total)
           values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [id, l.lineNo, l.productId, l.qty, l.unitPrice, l.discount, l.tax, l.lineTotal],
        );
      }

      await client.query('commit');
      return id;
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** تأیید سفارش خرید — فقط draft → approved */
  async approvePurchaseOrder(
    companyId: string,
    id: string,
    client?: Runner,
  ): Promise<PurchaseOrderRow | null> {
    const { rows } = await (client ?? this.pool).query<PurchaseOrderRow>(
      `update purchase_order set status = 'approved'
        where id = $1 and status = 'draft'
          and branch_id in (select id from branch where company_id = $2)
        returning ${PO_COLUMNS.replace(/po\./g, '')}`,
      [id, companyId],
    );
    return rows[0] ?? null;
  }

  // ---------------- Supplier Invoice ----------------

  async listSupplierInvoices(
    companyId: string,
    query: { cursor?: string; limit?: number; supplier_id?: string; status?: string },
  ): Promise<{ items: SupplierInvoiceRow[]; nextCursor: string | null; hasMore: boolean }> {
    const limit = query.limit ?? 50;
    const params: unknown[] = [companyId];
    const where: string[] = ['si.branch_id in (select id from branch where company_id = $1)'];
    if (query.supplier_id) {
      params.push(query.supplier_id);
      where.push(`si.supplier_id = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      where.push(`si.status = $${params.length}`);
    }
    if (query.cursor) {
      const raw = decodeCursor(query.cursor);
      const sep = raw.indexOf('|');
      if (sep > 0) {
        params.push(raw.slice(0, sep), raw.slice(sep + 1));
        where.push(`(si.internal_no, si.id) > ($${params.length - 1}, $${params.length}::uuid)`);
      }
    }
    params.push(limit + 1);
    const { rows } = await this.pool.query<SupplierInvoiceRow>(
      `select ${SINV_COLUMNS} from supplier_invoice si
        where ${where.join(' and ')}
        order by si.internal_no, si.id
        limit $${params.length}`,
      params,
    );
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page,
      hasMore,
      nextCursor: hasMore && last ? encodeCursor(`${last.internal_no}|${last.id}`) : null,
    };
  }

  async findSupplierInvoice(companyId: string, id: string): Promise<SupplierInvoiceRow | null> {
    const { rows } = await this.pool.query<SupplierInvoiceRow>(
      `select ${SINV_COLUMNS} from supplier_invoice si
        where si.id = $1 and si.branch_id in (select id from branch where company_id = $2)`,
      [id, companyId],
    );
    const head = rows[0];
    if (!head) return null;
    head.lines = await this.findSupplierInvoiceLines(id);
    return head;
  }

  private async findSupplierInvoiceLines(siId: string): Promise<SupplierInvoiceLineRow[]> {
    const { rows } = await this.pool.query<SupplierInvoiceLineRow>(
      `select line_no, product_id, qty::text as qty, unit_price::text as unit_price,
              tax_amount::text as tax_amount, line_total::text as line_total
         from supplier_invoice_line
        where supplier_invoice_id = $1
        order by line_no`,
      [siId],
    );
    return rows.map((r) => ({ ...r, line_no: Number(r.line_no) }));
  }

  /** ثبت فاکتور تأمین‌کننده (پیش‌نویس) — internal_no شماره‌گذاری می‌شود (تراکنشی) */
  async insertSupplierInvoice(dto: CreateSupplierInvoiceDto): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const { doc_number } = await this.docNumbers.next(dto.branch_id, 'supplier_invoice', { client });
      const id = randomUUID();
      await client.query(
        `insert into supplier_invoice
           (id, branch_id, doc_number, internal_no, supplier_id, purchase_order_id,
            invoice_date, due_date, amount, tax_amount, status, match_status)
         values ($1,$2,$3,$4,$5,$6, coalesce($7::date, current_date), $8::date, $9,$10, 'draft','pending')`,
        [
          id,
          dto.branch_id,
          dto.doc_number,
          doc_number,
          dto.supplier_id,
          dto.purchase_order_id ?? null,
          dto.invoice_date ?? null,
          dto.due_date ?? null,
          dto.amount,
          dto.tax_amount ?? '0',
        ],
      );

      const lines = dto.lines ?? [];
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        const lineTotal = r2(Number(l.qty) * Number(l.unit_price) + Number(l.tax_amount ?? 0));
        await client.query(
          `insert into supplier_invoice_line
             (supplier_invoice_id, line_no, product_id, qty, unit_price, tax_amount, line_total)
           values ($1,$2,$3,$4,$5,$6,$7)`,
          [id, i + 1, l.product_id, l.qty, l.unit_price, l.tax_amount ?? '0', lineTotal],
        );
      }

      await client.query('commit');
      return id;
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * تأیید فاکتور تأمین‌کننده — draft/matched/mismatch → approved و ثبت دفتر
   * بدهکاری (debit = amount + tax). تراکنشی؛ ردیف به‌روزشده یا null.
   */
  async approveSupplierInvoice(
    companyId: string,
    id: string,
  ): Promise<SupplierInvoiceRow | null> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const upd = await client.query<SupplierInvoiceRow>(
        `update supplier_invoice set status = 'approved'
          where id = $1 and status in ('draft','matched','mismatch')
            and branch_id in (select id from branch where company_id = $2)
          returning ${SINV_COLUMNS.replace(/si\./g, '')}`,
        [id, companyId],
      );
      const head = upd.rows[0];
      if (!head) {
        await client.query('rollback');
        return null;
      }
      const debit = r2(Number(head.amount) + Number(head.tax_amount));
      await client.query(
        `insert into supplier_ledger_entry
           (branch_id, supplier_id, entry_date, doc_type, doc_id, debit, credit)
         values ($1,$2,$3::date,'supplier_invoice',$4,$5,0)`,
        [head.branch_id, head.supplier_id, head.invoice_date, id, debit],
      );
      await client.query('commit');
      head.lines = await this.findSupplierInvoiceLines(id);
      return head;
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------- Payment Voucher ----------------

  async listPaymentVouchers(
    companyId: string,
    query: { cursor?: string; limit?: number; supplier_id?: string; status?: string },
  ): Promise<{ items: PaymentVoucherRow[]; nextCursor: string | null; hasMore: boolean }> {
    const limit = query.limit ?? 50;
    const params: unknown[] = [companyId];
    const where: string[] = ['pv.branch_id in (select id from branch where company_id = $1)'];
    if (query.supplier_id) {
      params.push(query.supplier_id);
      where.push(`pv.supplier_id = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      where.push(`pv.status = $${params.length}`);
    }
    if (query.cursor) {
      const raw = decodeCursor(query.cursor);
      const sep = raw.indexOf('|');
      if (sep > 0) {
        params.push(raw.slice(0, sep), raw.slice(sep + 1));
        where.push(`(pv.doc_number, pv.id) > ($${params.length - 1}, $${params.length}::uuid)`);
      }
    }
    params.push(limit + 1);
    const { rows } = await this.pool.query<PaymentVoucherRow>(
      `select ${PV_COLUMNS} from payment_voucher pv
        where ${where.join(' and ')}
        order by pv.doc_number, pv.id
        limit $${params.length}`,
      params,
    );
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page,
      hasMore,
      nextCursor: hasMore && last ? encodeCursor(`${last.doc_number}|${last.id}`) : null,
    };
  }

  async findPaymentVoucher(companyId: string, id: string): Promise<PaymentVoucherRow | null> {
    const { rows } = await this.pool.query<PaymentVoucherRow>(
      `select ${PV_COLUMNS} from payment_voucher pv
        where pv.id = $1 and pv.branch_id in (select id from branch where company_id = $2)`,
      [id, companyId],
    );
    const head = rows[0];
    if (!head) return null;
    const alloc = await this.pool.query<{ supplier_invoice_id: string; amount: string }>(
      `select supplier_invoice_id, amount::text as amount from payment_allocation
        where payment_voucher_id = $1 order by supplier_invoice_id`,
      [id],
    );
    head.allocations = alloc.rows;
    return head;
  }

  /**
   * ثبت سند پرداخت (posted) + تخصیص‌ها + دفتر بدهکاری (credit) + به‌روزرسانی
   * وضعیت فاکتورهای تخصیص‌یافته — همه در یک تراکنش.
   */
  async insertPaymentVoucher(
    dto: CreatePaymentVoucherDto,
    allocations: PaymentAllocationDto[],
  ): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const { doc_number, fiscal_year } = await this.docNumbers.next(dto.branch_id, 'payment_voucher', {
        client,
      });
      const id = randomUUID();
      const paymentDate = dto.payment_date ?? null;
      await client.query(
        `insert into payment_voucher
           (id, branch_id, doc_number, fiscal_year, supplier_id, payment_date, method_id,
            amount, cash_box_id, bank_account_id, cheque_id, status)
         values ($1,$2,$3,$4,$5, coalesce($6::date, current_date), $7, $8, $9, $10, $11, 'posted')`,
        [
          id,
          dto.branch_id,
          doc_number,
          fiscal_year,
          dto.supplier_id,
          paymentDate,
          dto.method_id,
          dto.amount,
          dto.cash_box_id ?? null,
          dto.bank_account_id ?? null,
          dto.cheque_id ?? null,
        ],
      );

      const invoiceIds = new Set<string>();
      for (const a of allocations) {
        await client.query(
          `insert into payment_allocation (payment_voucher_id, supplier_invoice_id, amount)
           values ($1,$2,$3)`,
          [id, a.supplier_invoice_id, a.amount],
        );
        invoiceIds.add(a.supplier_invoice_id);
      }

      // دفتر بدهکاری تأمین‌کننده: پرداخت = credit (کاهش بدهی)
      await client.query(
        `insert into supplier_ledger_entry
           (branch_id, supplier_id, entry_date, doc_type, doc_id, debit, credit)
         values ($1,$2, coalesce($3::date, current_date),'payment_voucher',$4, 0, $5)`,
        [dto.branch_id, dto.supplier_id, paymentDate, id, dto.amount],
      );

      // به‌روزرسانی وضعیت فاکتورها بر اساس مجموع تخصیص‌های posted
      for (const invId of invoiceIds) {
        await client.query(
          `update supplier_invoice si set status = case
              when (
                select coalesce(sum(pa.amount),0)
                  from payment_allocation pa
                  join payment_voucher pv on pv.id = pa.payment_voucher_id
                 where pa.supplier_invoice_id = si.id and pv.status = 'posted'
              ) >= (si.amount + si.tax_amount) then 'paid'
              else 'partially_paid' end
            where si.id = $1 and si.status in ('approved','partially_paid')`,
          [invId],
        );
      }

      await client.query('commit');
      return id;
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
