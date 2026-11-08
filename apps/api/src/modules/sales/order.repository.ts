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
  tax_rate_pct: number;
  tax_amount: string;
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
    {
      product_id: string;
      packaging_id: string | null;
      qty: number;
      unit_price: string | null;
      discount_amount: string | null;
      tax_rate_pct: number;
      tax_amount: string | null;
      line_total: string | null;
    }[]
  > {
    const { rows } = await this.pool.query<{
      product_id: string;
      packaging_id: string | null;
      qty: number;
      unit_price: string;
      discount_amount: string;
      tax_rate_pct: number;
      tax_amount: string;
      line_total: string;
    }>(
      `select product_id, packaging_id, qty::float8 as qty,
              unit_price::text as unit_price, discount_amount::text as discount_amount,
              tax_rate_pct::float8 as tax_rate_pct, tax_amount::text as tax_amount,
              line_total::text as line_total
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

  /**
   * حل دسته‌ای ورودی‌های خطوط سفارش — جایگزین ۲ تا ۳ round-trip به‌ازای هر خط.
   * سه کوئری ثابت (فارغ از تعداد خطوط) همهٔ داده لازم را برمی‌گرداند:
   *   ۱) کدام کالاها در این شرکت وجود دارند (product_id → true)
   *   ۲) ضریب بسته‌بندی هر (product_id, packaging_id)
   *   ۳) قیمت فعال لیست برای هر product_id
   * بازگشت به‌صورت Set/Map تا computeLines بدون کوئری اضافی تصمیم بگیرد.
   */
  async resolveLineInputs(
    companyId: string,
    priceListId: string | null,
    productIds: readonly string[],
    packagingIds: readonly (readonly [string, string])[],
  ): Promise<{
    existingProducts: Set<string>;
    packagingFactors: Map<string, string>;
    prices: Map<string, string>;
    taxRates: Map<string, number>;
    vatEnabled: boolean;
  }> {
    const uniqProducts = [...new Set(productIds)];
    const existingProducts = new Set<string>();
    const packagingFactors = new Map<string, string>();
    const prices = new Map<string, string>();
    const taxRates = new Map<string, number>();
    if (uniqProducts.length === 0) return { existingProducts, packagingFactors, prices, taxRates, vatEnabled: false };

    const queries: Promise<unknown>[] = [];

    // محصول + نرخ مالیاتی آن (product.tax_code_id → tax_code.rate_pct؛ معاف → ۰)
    queries.push(
      this.pool
        .query<{ id: string; rate_pct: string; is_exempt: boolean }>(
          `select p.id, coalesce(tc.rate_pct, 0)::text as rate_pct, coalesce(tc.is_exempt, false) as is_exempt
             from product p
             left join tax_code tc on tc.id = p.tax_code_id
            where p.company_id = $1 and p.id = any($2::uuid[])`,
          [companyId, uniqProducts],
        )
        .then(({ rows }) => {
          for (const r of rows) {
            existingProducts.add(r.id);
            taxRates.set(r.id, r.is_exempt ? 0 : Number(r.rate_pct));
          }
        }),
    );

    // vat_enabled شرکت: اگر خاموش باشد، مالیات همه اقلام صفر است
    const vatEnabled = await this.pool
      .query<{ vat_enabled: boolean }>('select vat_enabled from company where id = $1', [companyId])
      .then(({ rows }) => rows[0]?.vat_enabled ?? false);

    if (packagingIds.length > 0) {
      // کلید map همان «product:packaging» است تا با یک lookup مقدار بخوانیم
      const pairs = [...new Set(packagingIds.map(([p, k]) => `${p}\u0000${k}`))];
      const pids = pairs.map((s) => s.split('\u0000')[0]);
      const kids = pairs.map((s) => s.split('\u0000')[1]);
      queries.push(
        this.pool
          .query<{ product_id: string; id: string; factor: string }>(
            `select product_id, id, factor_to_base::text as factor
               from product_packaging
              where product_id = any($1::uuid[]) and id = any($2::uuid[])`,
            [pids, kids],
          )
          .then(({ rows }) => {
            for (const r of rows) packagingFactors.set(`${r.product_id}\u0000${r.id}`, r.factor);
          }),
      );
    }

    if (priceListId) {
      queries.push(
        this.pool
          .query<{ product_id: string; price: string }>(
            `select distinct on (product_id) product_id, price::text as price
               from price_list_item
              where price_list_id = $1 and product_id = any($2::uuid[]) and valid @> current_date
              order by product_id`,
            [priceListId, uniqProducts],
          )
          .then(({ rows }) => {
            for (const r of rows) prices.set(r.product_id, r.price);
          }),
      );
    }

    await Promise.all(queries);
    return { existingProducts, packagingFactors, prices, taxRates, vatEnabled };
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

  /**
   * TASK-24X · A-1 — آیا برای این درخواست سفارشی وجود دارد؟
   *
   * دامنهٔ شرکت با join روی `customer_request → branch.company_id` اعمال می‌شود
   * (همان الگوی `requestExists`)، نه با یک `where` سراسری؛ بنابراین یک شناسهٔ
   * درخواستِ شرکتِ دیگر نمی‌تواند نتیجهٔ «یافت‌شد» جعلی بسازد.
   *
   * سفارش‌های **لغوشده** نادیده گرفته می‌شوند: لغو یک سند تجاری، درخواست را
   * برای تبدیلِ دوباره آزاد می‌کند (شمارهٔ سند و تاریخچه حفظ می‌شود).
   */
  async findOrderIdByRequestId(companyId: string, requestId: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ id: string }>(
      `select o.id
         from sales_order o
         join customer_request r on r.id = o.request_id
         join branch b on b.id = r.branch_id
        where o.request_id = $1 and b.company_id = $2
          and o.status not in ('cancelled', 'rejected')
        order by o.created_at
        limit 1`,
      [requestId, companyId],
    );
    return rows[0]?.id ?? null;
  }

  /** D5 — کدام‌یک از این SKUها بسته‌اند؟ (ممنوعیتِ سفارش/فروش تا P5) */
  async findBundleProductIds(productIds: string[]): Promise<string[]> {
    if (productIds.length === 0) return [];
    const { rows } = await this.pool.query<{ bundle_product_id: string }>(
      'select distinct bundle_product_id from product_bundle where bundle_product_id = any($1::uuid[])',
      [productIds],
    );
    return rows.map((r) => r.bundle_product_id);
  }

  /**
   * اعتبار در دسترس مشتری از v_customer_exposure (سقف + اعتبار موقت − بدهی).
   * اگر ردیف customer_credit نباشد، credit_limit=0 و available_credit منفی/صفر است؛
   * در آن صورت «بدون سقف» تلقی نمی‌شود — تصمیم با سرویس است.
   */
  async customerExposure(
    companyId: string,
    customerId: string,
  ): Promise<{ credit_limit: number; available_credit: number; total_due: number } | null> {
    const { rows } = await this.pool.query<{
      credit_limit: string;
      available_credit: string;
      total_due: string;
    }>(
      `select e.credit_limit::text as credit_limit,
              e.available_credit::text as available_credit,
              e.total_due::text as total_due
         from v_customer_exposure e
         join customer c on c.id = e.customer_id
         join branch b on b.id = c.branch_id
        where e.customer_id = $1 and b.company_id = $2`,
      [customerId, companyId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      credit_limit: Number(r.credit_limit),
      available_credit: Number(r.available_credit),
      total_due: Number(r.total_due),
    };
  }

  /**
   * موجودی در دسترس هر کالا (qty_on_hand − qty_reserved) جمع همه انبارهای شعبه‌های
   * شرکت، منهای رزروهای فعالِ منقضی‌نشده. برای بررسی کفایت موجودی هنگام ثبت سفارش.
   */
  async availableStock(
    companyId: string,
    productIds: readonly string[],
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    const uniq = [...new Set(productIds)];
    if (uniq.length === 0) return result;
    const { rows } = await this.pool.query<{ product_id: string; available: string }>(
      `select sb.product_id,
              (coalesce(sum(sb.qty_on_hand), 0) - coalesce(sum(sb.qty_reserved), 0))::text as available
         from stock_balance sb
         join warehouse w on w.id = sb.warehouse_id
         join branch b on b.id = w.branch_id
        where b.company_id = $1 and sb.product_id = any($2::uuid[])
        group by sb.product_id`,
      [companyId, uniq],
    );
    for (const r of rows) result.set(r.product_id, Number(r.available));
    return result;
  }

  /** ساخت سند با وضعیت draft (هدر + اقلام در یک تراکنش) */
  async insert(
    companyId: string,
    dto: CreateOrderDto,
    opts: {
      branchId: string;
      fiscalYear: number;
      docNumber: string;
      totals: ComputedTotals;
      lines: OrderLineValues[];
    },
  ): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const id = randomUUID();
      const docNumber = opts.docNumber;
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
      const tax = Number(line.tax_amount ?? 0);
      await client.query(
        `insert into sales_order_line
           (sales_order_id, line_no, product_id, packaging_id, qty, qty_base,
            unit_price, discount_amount, tax_rate_pct, tax_amount, line_total)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          orderId,
          line.line_no,
          line.product_id,
          line.packaging_id,
          line.qty,
          line.qty_base,
          line.unit_price,
          line.discount_amount,
          line.tax_rate_pct ?? 0,
          (Math.round(tax * 100) / 100).toFixed(2),
          // line_total = qty*unit_price - discount + tax (numeric(19,2))
          (Math.round((line.qty * Number(line.unit_price) - Number(line.discount_amount) + tax) * 100) / 100).toFixed(2),
        ],
      );
    }
  }
}
