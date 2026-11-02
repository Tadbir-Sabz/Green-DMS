import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import type { CreateOrderDto, ListOrdersQueryDto, UpdateOrderDto } from './order.dto';

export interface OrderRow extends QueryResultRow {
  id: string;
  branch_id: string;
  doc_number: string;
  fiscal_year: number;
  customer_id: string;
  request_id: string | null;
  salesperson_id: string | null;
  tour_id: string | null;
  channel: string;
  order_date: string;
  delivery_date: string | null;
  price_list_id: string | null;
  subtotal: string;
  discount_total: string;
  tax_total: string;
  grand_total: string;
  settlement_term_id: string | null;
  status: string;
  approval_request_id: string | null;
  note: string | null;
  client_uuid: string | null;
  row_version: number;
}

export interface OrderLineValues {
  line_no: number;
  product_id: string;
  packaging_id: string | null;
  qty: number;
  qty_base: number;
  unit_price: string;
  discount_amount: string;
}

export interface CustomerPricing {
  branch_id: string;
  price_list_id: string | null;
}

export interface ComputedTotals {
  subtotal: string;
  discount_total: string;
  tax_total: string;
  grand_total: string;
}

const COLUMNS = `o.id as id, o.branch_id, o.doc_number, o.fiscal_year, o.customer_id, o.request_id, o.salesperson_id,
  o.tour_id, o.channel, o.order_date::text as order_date, o.delivery_date::text as delivery_date,
  o.price_list_id, o.subtotal::text as subtotal, o.discount_total::text as discount_total,
  o.tax_total::text as tax_total, o.grand_total::text as grand_total,
  o.settlement_term_id, o.status, o.approval_request_id, o.note, o.client_uuid, o.row_version`;

const encodeCursor = (id: string): string => Buffer.from(id, 'utf8').toString('base64url');
const decodeCursor = (cursor: string): string => Buffer.from(cursor, 'base64url').toString('utf8');

@Injectable()
export class OrderRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list(companyId: string, query: ListOrdersQueryDto): Promise<{
    items: OrderRow[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const limit = query.limit ?? 50;
    const params: unknown[] = [companyId];
    const where: string[] = ['b.company_id = $1'];
    if (query.customer_id) {
      params.push(query.customer_id);
      where.push(`o.customer_id = $${params.length}`);
    }
    if (query.tour_id) {
      params.push(query.tour_id);
      where.push(`o.tour_id = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      where.push(`o.status = $${params.length}`);
    }
    if (query.order_date) {
      params.push(query.order_date);
      where.push(`o.order_date = $${params.length}::date`);
    }
    if (query.cursor) {
      params.push(decodeCursor(query.cursor));
      where.push(`o.id > $${params.length}`);
    }
    params.push(limit + 1);
    const { rows } = await this.pool.query<OrderRow>(
      `select ${COLUMNS}
         from sales_order o
         join branch b on b.id = o.branch_id
        where ${where.join(' and ')}
        order by o.id
        limit $${params.length}`,
      params,
    );
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return { items: page, hasMore, nextCursor: hasMore && last ? encodeCursor(last.id) : null };
  }

  async findById(companyId: string, id: string): Promise<OrderRow | null> {
    const { rows } = await this.pool.query<OrderRow>(
      `select ${COLUMNS}
         from sales_order o
         join branch b on b.id = o.branch_id
        where o.id = $1 and b.company_id = $2`,
      [id, companyId],
    );
    return rows[0] ?? null;
  }

  async findLines(orderId: string): Promise<
    { product_id: string; packaging_id: string | null; qty: number; unit_price: string | null; discount_amount: string | null }[]
  > {
    const { rows } = await this.pool.query<{
      product_id: string;
      packaging_id: string | null;
      qty: number;
      unit_price: string;
      discount_amount: string;
    }>(
      `select product_id, packaging_id, qty::float8 as qty,
              unit_price::text as unit_price, discount_amount::text as discount_amount
         from sales_order_line
        where sales_order_id = $1
        order by line_no`,
      [orderId],
    );
    return rows;
  }

  /** مشتری برای شعبه و لیست قیمت پیش‌فرض */
  async getCustomerPricing(companyId: string, customerId: string): Promise<CustomerPricing | null> {
    const { rows } = await this.pool.query<{ branch_id: string; price_list_id: string | null }>(
      `select c.branch_id, c.price_list_id
         from customer c
         join branch b on b.id = c.branch_id
        where c.id = $1 and b.company_id = $2 and c.deleted_at is null`,
      [customerId, companyId],
    );
    return rows[0] ?? null;
  }

  async productExists(companyId: string, productId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      'select 1 from product where id = $1 and company_id = $2',
      [productId, companyId],
    );
    return rows.length > 0;
  }

  /** ضریب بسته‌بندی به واحد پایه؛ null وقتی packaging متعلق به کالا نیست */
  async packagingFactor(productId: string, packagingId: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ factor: string }>(
      'select factor_to_base::text as factor from product_packaging where id = $1 and product_id = $2',
      [packagingId, productId],
    );
    return rows[0]?.factor ?? null;
  }

  /** قیمت فعال از لیست قیمت برای کالا (قید انحصاری بازه، حداکثر یک ردیف) */
  async priceListPrice(priceListId: string, productId: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ price: string }>(
      `select price::text as price from price_list_item
        where price_list_id = $1 and product_id = $2 and valid @> current_date`,
      [priceListId, productId],
    );
    return rows[0]?.price ?? null;
  }

  async priceListExists(companyId: string, priceListId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      'select 1 from price_list where id = $1 and company_id = $2',
      [priceListId, companyId],
    );
    return rows.length > 0;
  }

  async settlementTermExists(companyId: string, termId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      'select 1 from settlement_term where id = $1 and company_id = $2',
      [termId, companyId],
    );
    return rows.length > 0;
  }

  async staffExists(companyId: string, staffId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      `select 1 from staff s join branch b on b.id = s.branch_id where s.id = $1 and b.company_id = $2`,
      [staffId, companyId],
    );
    return rows.length > 0;
  }

  async requestExists(companyId: string, requestId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      `select 1 from customer_request r join branch b on b.id = r.branch_id
        where r.id = $1 and b.company_id = $2`,
      [requestId, companyId],
    );
    return rows.length > 0;
  }

  /** ساخت سند با وضعیت draft (هدر + اقلام در یک تراکنش) */
  async insert(
    companyId: string,
    dto: CreateOrderDto,
    opts: { branchId: string; fiscalYear: number; totals: ComputedTotals; lines: OrderLineValues[] },
  ): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const id = randomUUID();
      const docNumber = `SO-${id.slice(0, 8).toUpperCase()}`;
      await client.query(
        `insert into sales_order
           (id, branch_id, doc_number, fiscal_year, customer_id, request_id, salesperson_id,
            tour_id, channel, order_date, delivery_date, price_list_id,
            subtotal, discount_total, tax_total, grand_total,
            settlement_term_id, note, client_uuid)
         values ($1, $2, $3, $4, $5, $6, $7,
                 $8, coalesce($9,'field'), $10::date, $11::date, $12,
                 $13, $14, $15, $16,
                 $17, $18, $19)`,
        [
          id,
          opts.branchId,
          docNumber,
          opts.fiscalYear,
          dto.customer_id,
          dto.request_id ?? null,
          dto.salesperson_id ?? null,
          dto.tour_id ?? null,
          dto.channel ?? null,
          dto.order_date,
          dto.delivery_date ?? null,
          dto.price_list_id ?? null,
          opts.totals.subtotal,
          opts.totals.discount_total,
          opts.totals.tax_total,
          opts.totals.grand_total,
          dto.settlement_term_id ?? null,
          dto.note ?? null,
          dto.client_uuid ?? null,
        ],
      );
      await this.insertLines(client, id, opts.lines);
      await client.query('commit');
      return id;
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** ویرایش فقط وقتی status = draft است (قید condition در خود SQL) */
  async update(
    companyId: string,
    id: string,
    dto: UpdateOrderDto,
    opts: { totals: ComputedTotals; lines: OrderLineValues[] },
  ): Promise<string | null> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const sets: string[] = [];
      const params: unknown[] = [id, companyId];
      const add = (fragment: string, value: unknown): void => {
        params.push(value);
        sets.push(fragment.replace('$?', `$${params.length}`));
      };
      if (dto.customer_id !== undefined) add('customer_id = $?', dto.customer_id);
      if (dto.request_id !== undefined) add('request_id = $?', dto.request_id);
      if (dto.salesperson_id !== undefined) add('salesperson_id = $?', dto.salesperson_id);
      if (dto.tour_id !== undefined) add('tour_id = $?', dto.tour_id);
      if (dto.channel !== undefined) add('channel = $?', dto.channel);
      if (dto.order_date !== undefined) add('order_date = $?::date', dto.order_date);
      if (dto.delivery_date !== undefined) add('delivery_date = $?::date', dto.delivery_date);
      if (dto.price_list_id !== undefined) add('price_list_id = $?', dto.price_list_id);
      if (dto.settlement_term_id !== undefined) add('settlement_term_id = $?', dto.settlement_term_id);
      if (dto.note !== undefined) add('note = $?', dto.note);
      if (dto.client_uuid !== undefined) add('client_uuid = $?', dto.client_uuid);
      // مبالغ همیشه از اقلام تازه محاسبه می‌شوند
      add('subtotal = $?', opts.totals.subtotal);
      add('discount_total = $?', opts.totals.discount_total);
      add('tax_total = $?', opts.totals.tax_total);
      add('grand_total = $?', opts.totals.grand_total);

      // قفل خوش‌بینانه: نسخهٔ ارسالی باید با سرور یکی باشد
      if (dto.row_version !== undefined) params.push(dto.row_version);
      const versionClause =
        dto.row_version !== undefined ? ` and row_version = $${params.length}` : '';

      const owned = await client.query(
        `update sales_order set ${sets.join(', ')}
          where id = $1 and exists (
            select 1 from branch b where b.id = sales_order.branch_id and b.company_id = $2)
            and status = 'draft'${versionClause}
          returning id`,
        params,
      );
      if (owned.rowCount === 0) {
        await client.query('rollback');
        return null;
      }
      if (dto.lines) {
        await client.query('delete from sales_order_line where sales_order_id = $1', [id]);
        await this.insertLines(client, id, opts.lines);
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

  /** تأیید: فقط از draft/pending_approval به approved */
  async approve(companyId: string, id: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ id: string }>(
      `update sales_order set status = 'approved'
        where id = $1 and status in ('draft', 'pending_approval') and exists (
          select 1 from branch b where b.id = sales_order.branch_id and b.company_id = $2)
        returning id`,
      [id, companyId],
    );
    return rows[0]?.id ?? null;
  }

  private async insertLines(client: PoolClient, orderId: string, lines: OrderLineValues[]): Promise<void> {
    for (const line of lines) {
      await client.query(
        `insert into sales_order_line
           (sales_order_id, line_no, product_id, packaging_id, qty, qty_base,
            unit_price, discount_amount, line_total)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          orderId,
          line.line_no,
          line.product_id,
          line.packaging_id,
          line.qty,
          line.qty_base,
          line.unit_price,
          line.discount_amount,
          // line_total در DDL numeric(19,2) است (بدون tax در سطح قلم)
          (Math.round((line.qty * Number(line.unit_price) - Number(line.discount_amount)) * 100) / 100).toFixed(2),
        ],
      );
    }
  }
}
