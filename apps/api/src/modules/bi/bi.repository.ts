import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';

/**
 * منبعِ دادهٔ BI: materialized viewهای گزارش‌دهی (مهاجرت 0029) + جداول پایهٔ
 * فاکتور برای ABC. همهٔ کوئری‌ها با company_id محدود می‌شوند (جداسازی اجاره‌ها).
 * مبالغ به‌صورت ::text برگردانده می‌شوند (دقتِ numeric بدون خطای float) و در سرویس
 * برای نمایش/محاسبهٔ ABC به عدد تبدیل می‌شوند.
 */

export interface KpiRaw extends QueryResultRow {
  sales: string;
  collected: string;
  gross: string;
  ar_balance: string;
  ar_overdue: string;
  open_invoices: number;
  active_customers: number;
}

export interface AbcCustomerRaw extends QueryResultRow {
  id: string;
  code: string;
  name: string;
  revenue: string;
}

export interface AbcProductRaw extends QueryResultRow {
  id: string;
  code: string;
  name: string;
  revenue: string;
  qty: string;
}

const POSTED = `('posted', 'partially_paid', 'paid')`;

@Injectable()
export class BiRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** KPIهای کلان: فروش/وصولی N روز اخیر (mv_daily_sales) + ماندهٔ AR (mv_ar_aging). */
  async kpi(companyId: string, days: number): Promise<KpiRaw> {
    const sales = await this.pool.query<{ sales: string; collected: string; gross: string }>(
      `select
         coalesce(sum(net_sales), 0)::text       as sales,
         coalesce(sum(collected_amount), 0)::text as collected,
         coalesce(sum(gross_amount), 0)::text     as gross
       from mv_daily_sales
       where company_id = $1
         and sale_date >= current_date - ($2::int - 1)`,
      [companyId, days],
    );
    const ar = await this.pool.query<{
      ar_balance: string;
      ar_overdue: string;
      open_invoices: number;
      active_customers: number;
    }>(
      `select
         coalesce(sum(total_due), 0)::text as ar_balance,
         coalesce(sum(bucket_1_30 + bucket_31_60 + bucket_61_90 + bucket_over_90), 0)::text as ar_overdue,
         coalesce(sum(open_invoice_count), 0)::integer as open_invoices,
         count(distinct customer_id)::integer as active_customers
       from mv_ar_aging
       where company_id = $1`,
      [companyId],
    );
    return {
      sales: sales.rows[0]?.sales ?? '0',
      collected: sales.rows[0]?.collected ?? '0',
      gross: sales.rows[0]?.gross ?? '0',
      ar_balance: ar.rows[0]?.ar_balance ?? '0',
      ar_overdue: ar.rows[0]?.ar_overdue ?? '0',
      open_invoices: ar.rows[0]?.open_invoices ?? 0,
      active_customers: ar.rows[0]?.active_customers ?? 0,
    };
  }

  /** درآمد هر مشتری (برای ABC) — از فاکتورهای ثبت‌شده، به ترتیب نزولیِ درآمد. */
  async abcCustomers(companyId: string): Promise<AbcCustomerRaw[]> {
    const { rows } = await this.pool.query<AbcCustomerRaw>(
      `select c.id,
              c.code,
              coalesce(nullif(p.legal_name, ''), c.code) as name,
              sum(i.grand_total)::text as revenue
         from invoice i
         join branch b on b.id = i.branch_id
         join customer c on c.id = i.customer_id
         left join person p on p.id = c.person_id
        where b.company_id = $1
          and i.status in ${POSTED}
        group by c.id, c.code, p.legal_name
        order by sum(i.grand_total) desc`,
      [companyId],
    );
    return rows;
  }

  /** درآمد و مقدار هر کالا (برای ABC) — از قلم‌های فاکتور ثبت‌شده، نزولیِ درآمد. */
  async abcProducts(companyId: string): Promise<AbcProductRaw[]> {
    const { rows } = await this.pool.query<AbcProductRaw>(
      `select pr.id,
              pr.code,
              pr.name,
              sum(il.line_total)::text as revenue,
              sum(il.qty)::text        as qty
         from invoice_line il
         join invoice i on i.id = il.invoice_id
         join branch b on b.id = i.branch_id
         join product pr on pr.id = il.product_id
        where b.company_id = $1
          and i.status in ${POSTED}
        group by pr.id, pr.code, pr.name
        order by sum(il.line_total) desc`,
      [companyId],
    );
    return rows;
  }

  /** سریِ روزانهٔ فروشِ خالص برای پیش‌بینی (mv_daily_sales) — به ترتیبِ تاریخ. */
  async forecastHistory(
    companyId: string,
    days: number,
  ): Promise<{ day: string; net_sales: string }[]> {
    const { rows } = await this.pool.query<{ day: string; net_sales: string }>(
      `select sale_date::text       as day,
              sum(net_sales)::text as net_sales
         from mv_daily_sales
        where company_id = $1
          and sale_date >= current_date - ($2::int - 1)
        group by sale_date
        order by sale_date`,
      [companyId, days],
    );
    return rows;
  }
}
