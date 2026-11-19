import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { AUDIT_SERVICE, type AuditService } from '../../common/audit.service';
import type { Runner } from '../../common/transaction';
import { PG_POOL } from '../../database/database.module';
import { postStockMovement } from '../inventory/ledger/stock-ledger';
import type { StockMovementActor } from '../inventory/ledger/stock-movement';
import type { CreateReturnDto, ReceiveReturnDto } from './return.dto';
import {
  assertReceiveEligibility,
  planReturnPostings,
  type BranchWarehouseRow,
  type StoredReceiveLine,
} from './return-resolution';

export interface ReturnRow extends QueryResultRow {
  id: string;
  doc_number: string;
  customer_id: string;
  invoice_id: string | null;
  tour_id: string | null;
  reason_code: string;
  status: string;
  credit_note_id: string | null;
  requested_at: string;
  approved_at: string | null;
  note: string | null;
  /** TASK-24Y — درخواست‌دهنده؛ مبنای جلوگیری از خودتأییدی */
  requested_by: string | null;
  /** TASK-P4-FC — وضعیت صریحِ ارزش‌گذاری (migration 0067) */
  valuation_status: string;
}

export interface ReturnLineRow extends QueryResultRow {
  product_id: string;
  batch_id: string | null;
  qty: number;
  qty_approved: number | null;
  unit_price: number;
  disposition: string;
  /** TASK-P4-FC — پیوند به قلمِ فاکتورِ مبدأ (migration 0067)؛ null = بدون پیوند */
  invoice_line_id: string | null;
}

const encodeCursor = (id: string): string => Buffer.from(id, 'utf8').toString('base64url');
const decodeCursor = (cursor: string): string => Buffer.from(cursor, 'base64url').toString('utf8');

const COLUMNS =
  'r.id, r.doc_number, r.customer_id, r.invoice_id, r.tour_id, r.reason_code, r.status, r.credit_note_id, r.requested_at, r.approved_at, r.note, r.requested_by, r.valuation_status';

@Injectable()
export class ReturnRepository {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(AUDIT_SERVICE) private readonly audit: AuditService,
  ) {}

  async list(
    companyId: string,
    query: { cursor?: string; limit?: number; customer_id?: string; status?: string },
  ): Promise<{ items: ReturnRow[]; nextCursor: string | null; hasMore: boolean }> {
    const limit = query.limit ?? 50;
    const params: unknown[] = [companyId];
    const where: string[] = ['r.branch_id in (select id from branch where company_id = $1)'];
    if (query.customer_id) {
      params.push(query.customer_id);
      where.push(`r.customer_id = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      where.push(`r.status = $${params.length}`);
    }
    if (query.cursor) {
      params.push(decodeCursor(query.cursor));
      where.push(`r.id > $${params.length}`);
    }
    params.push(limit + 1);

    const { rows } = await this.pool.query<ReturnRow>(
      `select ${COLUMNS} from return_request r
        where ${where.join(' and ')}
        order by r.id
        limit $${params.length}`,
      params,
    );
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return { items: page, hasMore, nextCursor: hasMore && last ? encodeCursor(last.id) : null };
  }

  async findById(companyId: string, id: string): Promise<ReturnRow | null> {
    const { rows } = await this.pool.query<ReturnRow>(
      `select ${COLUMNS} from return_request r
        where r.id = $1 and r.branch_id in (select id from branch where company_id = $2)`,
      [id, companyId],
    );
    return rows[0] ?? null;
  }

  async findLines(returnId: string): Promise<ReturnLineRow[]> {
    const { rows } = await this.pool.query<ReturnLineRow>(
      `select product_id, batch_id, qty::float8 as qty, qty_approved::float8 as qty_approved,
              unit_price::float8 as unit_price, disposition, invoice_line_id
         from return_request_line
        where return_request_id = $1
        order by product_id`,
      [returnId],
    );
    return rows;
  }

  /** ثبت درخواست با وضعیت submitted (header + خطوط در یک تراکنش) */
  async insert(
    companyId: string,
    dto: CreateReturnDto,
    /**
     * TASK-24Y — درخواست‌دهنده. `return_request.requested_by` از ابتدا در جدول
     * بود ولی **هرگز پر نمی‌شد**؛ یعنی «تأییدکننده نباید درخواست‌دهنده باشد»
     * قابلِ اجرا نبود. ستونِ همیشه-null = کنترلِ ناموجود.
     */
    requestedBy: string | null = null,
  ): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');

      const branch = await client.query<{ branch_id: string }>(
        `select c.branch_id from customer c join branch b on b.id = c.branch_id
          where c.id = $1 and b.company_id = $2`,
        [dto.customer_id, companyId],
      );
      if (branch.rowCount === 0) throw Object.assign(new Error('customer not found'), { pgCode: 'no_data' });

      // TASK-P4-FC — پیوند قلم‌ها به خطوط فاکتور + سقفِ eligibility (quantity):
      // هر قلمی که invoice_line_id دارد باید به همان فاکتور تعلق داشته باشد و
      // جمعِ مرجوعی‌های ثبت‌شده روی آن خط (به استثنای ردشده‌ها) + این مقدار،
      // از مقدارِ فروخته‌شده بیشتر نشود. خطوط فاکتور با ترتیبِ id قفل می‌شوند.
      const linked = (dto.lines ?? []).filter((l) => l.invoice_line_id);
      let derivedInvoiceId: string | null = null;
      const eligibility = new Map<string, { sold: number; committed: number }>();
      if (linked.length > 0) {
        const lineIds = [...new Set(linked.map((l) => l.invoice_line_id as string))];
        const ilRows = await client.query<{
          id: string;
          invoice_id: string;
          product_id: string;
          qty: number;
          customer_id: string;
          invoice_status: string;
        }>(
          `select il.id, il.invoice_id, il.product_id, il.qty::float8 as qty, i.customer_id, i.status as invoice_status
             from invoice_line il
             join invoice i on i.id = il.invoice_id
             join branch b on b.id = i.branch_id
            where il.id = any($1::uuid[]) and b.company_id = $2
            order by il.id
            for update of i, il`,
          [lineIds, companyId],
        );
        if (ilRows.rowCount !== lineIds.length) {
          throw Object.assign(new Error('invoice line not found'), { pgCode: 'no_data' });
        }
        const invoiceIds = new Set(ilRows.rows.map((r) => r.invoice_id));
        if (invoiceIds.size !== 1) {
          throw Object.assign(new Error('invoice line invoice mismatch'), { pgCode: 'mixed_invoice' });
        }
        derivedInvoiceId = ilRows.rows[0].invoice_id;
        const ineligible = ilRows.rows.find((r) => !['posted', 'partially_paid', 'paid'].includes(r.invoice_status));
        if (ineligible) {
          throw Object.assign(new Error('invoice is not eligible for returns'), {
            pgCode: 'invoice_not_eligible',
            details: { invoice_id: ineligible.invoice_id, status: ineligible.invoice_status },
          });
        }
        if (dto.invoice_id && dto.invoice_id !== derivedInvoiceId) {
          throw Object.assign(new Error('invoice line invoice mismatch'), { pgCode: 'mixed_invoice' });
        }
        const invoiceCustomer = ilRows.rows[0].customer_id;
        if (invoiceCustomer !== dto.customer_id) {
          throw Object.assign(new Error('invoice customer mismatch'), { pgCode: 'invoice_customer' });
        }
        const committed = await client.query<{ invoice_line_id: string; qty: number }>(
          `select rl.invoice_line_id, coalesce(sum(rl.qty), 0)::float8 as qty
             from return_request_line rl
             join return_request r on r.id = rl.return_request_id
            where rl.invoice_line_id = any($1::uuid[])
              and r.status not in ('draft', 'rejected')
            group by rl.invoice_line_id`,
          [lineIds],
        );
        const committedById = new Map(committed.rows.map((r) => [r.invoice_line_id, r.qty]));
        for (const row of ilRows.rows) {
          eligibility.set(row.id, { sold: row.qty, committed: committedById.get(row.id) ?? 0 });
        }
        // تطابق کالا و سقف مقدار — پیش از هر نوشتنی
        const byId = new Map(ilRows.rows.map((r) => [r.id, r]));
        // مجموعِ درخواستِ همین سند به‌ازای هر خطِ فاکتور (ایحتیاطاً — dup product قبلاً رد می‌شود)
        const requestedPerLine = new Map<string, number>();
        for (const l of linked) {
          requestedPerLine.set(l.invoice_line_id as string, (requestedPerLine.get(l.invoice_line_id as string) ?? 0) + l.qty);
        }
        for (const l of linked) {
          const il = byId.get(l.invoice_line_id as string)!;
          if (il.product_id !== l.product_id) {
            throw Object.assign(new Error('invoice line product mismatch'), {
              pgCode: 'line_product',
              details: { invoice_line_id: il.id, invoice_product_id: il.product_id, product_id: l.product_id },
            });
          }
        }
        for (const [lineId, requested] of requestedPerLine) {
          const cap = eligibility.get(lineId)!;
          const next = cap.committed + requested;
          if (next - cap.sold > 1e-9) {
            throw Object.assign(new Error('qty exceeds invoiced'), {
              pgCode: 'qty_exceeds_invoiced',
              details: {
                invoice_line_id: lineId,
                sold_qty: cap.sold,
                already_returned_qty: cap.committed,
                requested_qty: requested,
              },
            });
          }
        }
      }

      if (dto.invoice_id) {
        const inv = await client.query<{ customer_id: string; status: string }>(
          `select i.id, i.customer_id, i.status from invoice i join branch b on b.id = i.branch_id
            where i.id = $1 and b.company_id = $2
            for update of i`,
          [dto.invoice_id, companyId],
        );
        if (inv.rowCount === 0) throw Object.assign(new Error('invoice not found'), { pgCode: 'no_data' });
        if (!['posted', 'partially_paid', 'paid'].includes(inv.rows[0].status)) {
          throw Object.assign(new Error('invoice is not eligible for returns'), {
            pgCode: 'invoice_not_eligible',
            details: { invoice_id: dto.invoice_id, status: inv.rows[0].status },
          });
        }
        if (inv.rows[0].customer_id !== dto.customer_id) {
          throw Object.assign(new Error('invoice customer mismatch'), { pgCode: 'invoice_customer' });
        }
      }

      const id = randomUUID();
      const docNumber = `RT-${id.slice(0, 8).toUpperCase()}`;
      // اگر فاکتور صریح داده نشده ولی خطوط به فاکتوری متصل‌اند، همان فاکتور ثبت می‌شود
      const effectiveInvoiceId = dto.invoice_id ?? derivedInvoiceId;
      await client.query(
        `insert into return_request
           (id, branch_id, doc_number, customer_id, invoice_id, tour_id, reason_code, status, note,
            requested_by)
         values ($1, $2, $3, $4, $5, $6, $7, 'submitted', $8, $9)`,
        [
          id,
          branch.rows[0].branch_id,
          docNumber,
          dto.customer_id,
          effectiveInvoiceId,
          dto.tour_id ?? null,
          dto.reason_code,
          dto.note ?? null,
          requestedBy,
        ],
      );
      for (const line of dto.lines ?? []) {
        await client.query(
          `insert into return_request_line (return_request_id, product_id, batch_id, qty, unit_price, disposition, invoice_line_id)
           values ($1, $2, $3, $4, 0, 'restock', $5)`,
          [id, line.product_id, line.batch_id ?? null, line.qty, line.invoice_line_id ?? null],
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

  /** تأیید: submitted → approved (به‌روزرسانی اتمیک با شرط وضعیت؛ false یعنی transition نامعتبر) */
  async approve(companyId: string, id: string, client?: Runner): Promise<boolean> {
    const { rowCount } = await (client ?? this.pool).query(
      `update return_request set status = 'approved', approved_at = now()
        where id = $1
          and status = 'submitted'
          and branch_id in (select id from branch where company_id = $2)`,
      [id, companyId],
    );
    return (rowCount ?? 0) > 0;
  }

  /**
   * دریافت: approved → posted با تعیین تکلیف هر قلم (qty_approved + disposition)
   * و — TASK-P4-R — پُستِ اتمیکِ آثارِ موجودی در همان تراکنش:
   *   restock ⇒ `sale_return_in` به انبارِ restock (مقصد صریح یا انبار اصلی شعبه)؛
   *   damaged ⇒ `sale_return_in` به انبار قرنطینه/ناقصِ شعبه (fail-closed)؛
   *   scrap / return_to_supplier ⇒ بدونِ حرکتِ موجودی.
   * هر خطا (از جمله ردّ plan) همه‌چیز را rollback می‌کند — کالا هرگز
   * «نصفه» پُست نمی‌شود. double-receive همچنان با شرط وضعیت null می‌شود.
   */
  async receive(
    companyId: string,
    id: string,
    dto: ReceiveReturnDto,
    actor: StockMovementActor,
  ): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const header = await client.query(
        `update return_request set status = 'posted'
          where id = $1
            and status in ('approved', 'partially_approved')
            and branch_id in (select id from branch where company_id = $2)
          returning id, branch_id`,
        [id, companyId],
      );
      if (header.rowCount === 0) {
        await client.query('rollback');
        return false;
      }
      const branchId = header.rows[0].branch_id as string;

      // انبارهای شعبه داخلِ تراکنش — plan روی snapshot هم‌تراز با همین tx است
      const whRows = await client.query<BranchWarehouseRow & QueryResultRow>(
        `select id, kind, is_active, code from warehouse where branch_id = $1`,
        [branchId],
      );
      const storedLines = await client.query<
        (StoredReceiveLine & { batch_id: string | null }) & QueryResultRow
      >(
        `select product_id, qty::float8 as qty, qty_approved::float8 as qty_approved, batch_id
           from return_request_line
          where return_request_id = $1`,
        [id],
      );
      const batchByProduct = new Map(storedLines.rows.map((r) => [r.product_id, r.batch_id]));

      // اعتبارسنجیِ کاملِ پوشش خطوط داخلِ همان تراکنش و پیش از هر نوشتنِ خط —
      // رد ⇒ rollback کامل (سرخط، خطوط و دفتر موجودی). هیچ «نصفه» posted نمی‌شود.
      assertReceiveEligibility(storedLines.rows, dto.lines);

      // تکلیف هر قلم قبل از هر نوشتنِ واگردنی برنامه‌ریزی می‌شود (خطا ⇒ rollback)
      const postings = planReturnPostings({
        lines: dto.lines.map((l) => ({
          product_id: l.product_id,
          batch_id: batchByProduct.get(l.product_id) ?? null,
          qty: l.qty,
          disposition: l.disposition,
        })),
        explicitWarehouseId: dto.warehouse_id ?? null,
        branchWarehouses: whRows.rows,
      });

      const lineIds = new Map<string, string>();
      for (const line of dto.lines) {
        // هر خط دقیقاً یک‌بار: qty_approved هنوز NULL است (eligibility بالا تضمین می‌کند)
        const updated = await client.query<{ id: string } & QueryResultRow>(
          `update return_request_line
             set qty_approved = $3, disposition = $4
            where return_request_id = $1 and product_id = $2 and qty_approved is null
            returning id`,
          [id, line.product_id, line.qty, line.disposition],
        );
        if (updated.rowCount !== 1) {
          await client.query('rollback');
          return false;
        }
        lineIds.set(line.product_id, updated.rows[0].id);
      }

      for (const posting of postings) {
        // unit_cost=0: بهای خرید مرجوعی در این فاز ثبت نمی‌شود (ثبت به‌عنوان «داده باز»
        // تصمیم حسابداری است، نه اصلاحیه)؛ کمبودِ هزینهٔ ناموجود را بهتر از بهای جعلی است.
        // حرکت دفتر + مانده + ممیزی در همین تراکنش (شکست ممیزی ⇒ rollback کامل).
        await postStockMovement(client, this.audit, {
          companyId,
          branchId,
          warehouseId: posting.warehouse_id,
          productId: posting.product_id,
          batchId: posting.batch_id,
          txnKind: posting.txn_kind,
          qty: posting.qty,
          unitCost: 0,
          sourceType: 'return_request',
          sourceId: id,
          sourceLineId: lineIds.get(posting.product_id) ?? null,
          clientUuid: null,
          actor,
        });
      }
      await client.query('commit');
      return true;
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
