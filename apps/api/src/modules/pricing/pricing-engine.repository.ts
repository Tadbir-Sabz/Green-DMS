import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../../database/database.module';
import type {
  CostRow,
  CouponRow,
  CustomerPriceRow,
  MarginExceptionRow,
  MarginPolicyRow,
  PackagingRow,
  PriceItemRow,
  PriceListRow,
  ProductRow,
  PromotionRow,
  PromotionUsageRow,
  QuoteCustomer,
} from './pricing-engine';

/**
 * دسترسیِ دادهٔ موتورِ قیمت/تخفیف.
 *
 * همهٔ کوئری‌ها صریحاً بر company_id فیلتر می‌کنند *و* RLS (مهاجرت 0041/0047/0049)
 * به‌صورتِ DB-enforced پشتِ همان فیلتر است؛ حالتِ «فراموشیِ فیلتر» به افشایِ
 * بین‌اجاره‌ای منجر نمی‌شود (fail-closed). ردیف‌های فرزند از طریقِ والدِ دیده‌شده
 * خوانده می‌شوند (promotion_coupon/promotion_redemption).
 */
export interface PricingSettingsRow {
  company_id: string;
  apply_promotions_on_orders: boolean;
  max_total_discount_pct: string | null;
  max_line_discount_pct: string | null;
  allow_loss_making_sales: boolean;
  min_order_date_lookback_days: number | null;
  require_override_reason: boolean;
  updated_by: string | null;
  updated_at: string;
  row_version: number;
}

@Injectable()
export class PricingEngineRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  // ---------------------------------------------------------------
  // مشتری و قلمرو
  // ---------------------------------------------------------------

  async loadCustomer(companyId: string, customerId: string): Promise<QuoteCustomer | null> {
    const { rows } = await this.pool.query<{
      id: string;
      channel: string;
      price_list_id: string | null;
      settlement_term_id: string | null;
      status: string;
      area_id: string | null;
      branch_id: string;
    }>(
      `select c.id, c.channel, c.price_list_id, c.settlement_term_id, c.status,
              c.area_id, c.branch_id
         from customer c
         join branch b on b.id = c.branch_id
        where c.id = $1 and b.company_id = $2`,
      [customerId, companyId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      channel: row.channel,
      price_list_id: row.price_list_id,
      settlement_term_ids: row.settlement_term_id ? [row.settlement_term_id] : [],
      status: row.status,
    };
  }

  /** شناسهٔ قلمروهای مؤثر بر مشتری — از خاص‌ترین (شعبه) به عام‌ترین (کانال) */
  async loadDomainIds(
    companyId: string,
    customer: QuoteCustomer | null,
    branchId: string | null,
    areaId: string | null,
  ): Promise<string[]> {
    if (!customer) return [];
    const { rows } = await this.pool.query<{ id: string; kind: string }>(
      `select d.id, d.kind
         from pricing_domain d
        where d.company_id = $1 and d.is_active
          and (
            (d.kind = 'branch'  and d.branch_id = $2)
            or (d.kind = 'area' and d.area_id = $3)
            or (d.kind = 'channel' and d.channel = $4)
          )`,
      [companyId, branchId, areaId, customer.channel],
    );
    const order: Record<string, number> = { branch: 0, area: 1, channel: 2 };
    return rows.sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9)).map((r) => r.id);
  }

  async loadCustomerBranchAndArea(
    customerId: string,
  ): Promise<{ branch_id: string; area_id: string | null } | null> {
    const { rows } = await this.pool.query<{ branch_id: string; area_id: string | null }>(
      'select branch_id, area_id from customer where id = $1',
      [customerId],
    );
    return rows[0] ?? null;
  }

  // ---------------------------------------------------------------
  // کالا، بسته‌بندی، مالیات، بهای تمام‌شده
  // ---------------------------------------------------------------

  async loadProducts(companyId: string, productIds: string[]): Promise<{ products: ProductRow[]; vatEnabled: boolean }> {
    if (productIds.length === 0) return { products: [], vatEnabled: false };
    const vat = await this.pool.query<{ vat_enabled: boolean }>(
      'select vat_enabled from company where id = $1',
      [companyId],
    );
    const vatEnabled = vat.rows[0]?.vat_enabled ?? false;
    const { rows } = await this.pool.query<{
      id: string;
      code: string;
      name: string;
      status: string;
      category_id: string | null;
      brand_id: string | null;
      rate_pct: string;
      min_order_qty: string;
    }>(
      `select p.id, p.code, p.name, p.status, p.category_id, p.brand_id,
              coalesce(tc.rate_pct, 0)::text as rate_pct, p.min_order_qty::text as min_order_qty
         from product p
         left join tax_code tc on tc.id = p.tax_code_id
        where p.company_id = $1 and p.id = any($2::uuid[]) and p.deleted_at is null`,
      [companyId, productIds],
    );
    return {
      vatEnabled,
      products: rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        status: r.status,
        category_id: r.category_id,
        brand_id: r.brand_id,
        tax_rate_pct: r.rate_pct,
        min_order_qty: r.min_order_qty,
        vat_enabled: vatEnabled,
      })),
    };
  }

  async loadPackaging(companyId: string, productIds: string[]): Promise<PackagingRow[]> {
    if (productIds.length === 0) return [];
    const { rows } = await this.pool.query<{ id: string; product_id: string; factor_to_base: string }>(
      `select pk.id, pk.product_id, pk.factor_to_base::text as factor_to_base
         from product_packaging pk
         join product p on p.id = pk.product_id
        where p.company_id = $1 and pk.product_id = any($2::uuid[])`,
      [companyId, productIds],
    );
    return rows;
  }

  /**
   * بهای تمام‌شده به تفکیکِ کالا — تجمیعِ وزن‌دار بر اساسِ موجودیِ هر انبار.
   * منبع: product_cost (مهاجرت 0016). هیچ محاسبهٔ تاریخی تغییر نمی‌کند؛ فقط خواندن.
   */
  async loadCosts(companyId: string, productIds: string[]): Promise<CostRow[]> {
    if (productIds.length === 0) return [];
    const { rows } = await this.pool.query<{
      product_id: string;
      avg_cost: string;
      standard_cost: string | null;
      last_purchase_cost: string | null;
      qty_weight: string;
    }>(
      `select pc.product_id,
              pc.avg_cost::text as avg_cost,
              pc.standard_cost::text as standard_cost,
              pc.last_purchase_cost::text as last_purchase_cost,
              greatest(pc.qty_on_hand, 0)::text as qty_weight
         from product_cost pc
         join product p on p.id = pc.product_id
         join warehouse w on w.id = pc.warehouse_id
         join branch b on b.id = w.branch_id
        where p.company_id = $1 and b.company_id = $1 and pc.product_id = any($2::uuid[])`,
      [companyId, productIds],
    );
    return rows;
  }

  // ---------------------------------------------------------------
  // لیست‌های قیمت و قیمتِ مشتری
  // ---------------------------------------------------------------

  async loadPriceLists(companyId: string): Promise<PriceListRow[]> {
    const { rows } = await this.pool.query<PriceListRow>(
      `select id, code, title, kind, priority, domain_id, is_default, is_active
         from price_list
        where company_id = $1 and is_active`,
      [companyId],
    );
    return rows;
  }

  async loadPriceItems(companyId: string, productIds: string[], priceListIds: string[]): Promise<PriceItemRow[]> {
    if (productIds.length === 0 || priceListIds.length === 0) return [];
    const { rows } = await this.pool.query<PriceItemRow>(
      `select i.id, i.price_list_id, i.product_id, i.packaging_id,
              i.price::text as price, i.min_qty::text as min_qty, i.max_qty::text as max_qty,
              i.max_discount_pct::text as max_discount_pct,
              lower(i.valid)::text as valid_from, upper(i.valid)::text as valid_to
         from price_list_item i
         join price_list l on l.id = i.price_list_id
        where l.company_id = $1
          and i.product_id = any($2::uuid[]) and i.price_list_id = any($3::uuid[])`,
      [companyId, productIds, priceListIds],
    );
    return rows;
  }

  async loadCustomerPrices(companyId: string, customerId: string, productIds: string[]): Promise<CustomerPriceRow[]> {
    if (productIds.length === 0) return [];
    const { rows } = await this.pool.query<CustomerPriceRow>(
      `select cp.id, cp.customer_id, cp.product_id, cp.packaging_id,
              cp.price::text as price, cp.min_qty::text as min_qty, cp.max_qty::text as max_qty,
              cp.max_discount_pct::text as max_discount_pct,
              lower(cp.valid)::text as valid_from, upper(cp.valid)::text as valid_to,
              cp.row_version
         from customer_price cp
         join customer c on c.id = cp.customer_id
         join branch b on b.id = c.branch_id
        where b.company_id = $1 and cp.customer_id = $2 and cp.product_id = any($3::uuid[])`,
      [companyId, customerId, productIds],
    );
    return rows;
  }

  // ---------------------------------------------------------------
  // تشویق/کوپن/مصرف/سابقه
  // ---------------------------------------------------------------

  async loadPromotions(companyId: string, domainIds: string[], date: string): Promise<PromotionRow[]> {
    const { rows } = await this.pool.query<PromotionRow>(
      `select id, code, title, kind, priority, allow_stacking, exclusive_group,
              max_discount_amount::text as max_discount_amount,
              max_discount_pct::text as max_discount_pct,
              max_per_customer_per_day::text as max_per_customer_per_day,
              max_uses_total, max_uses_per_customer, requires_coupon,
              conditions, benefit,
              lower(valid)::text as valid_from, upper(valid)::text as valid_to,
              domain_id
         from promotion
        where company_id = $1 and is_active
          and valid @> $2::date
          and (domain_id is null or domain_id = any($3::uuid[]))`,
      [companyId, date, domainIds],
    );
    return rows;
  }

  async loadCoupons(
    companyId: string,
    codes: string[],
    customerId: string | null,
    date: string,
  ): Promise<CouponRow[]> {
    if (codes.length === 0) return [];
    const upper = codes.map((c) => c.trim().toUpperCase());
    const { rows } = await this.pool.query<CouponRow>(
      `select c.id, c.promotion_id, c.code, c.customer_id,
              lower(c.valid)::text as valid_from, upper(c.valid)::text as valid_to,
              c.max_uses, c.max_uses_per_customer, c.is_active,
              coalesce((select count(*) from promotion_redemption r where r.coupon_id = c.id), 0)::int as used_total,
              coalesce((select count(*) from promotion_redemption r
                         where r.coupon_id = c.id and r.customer_id = $2), 0)::int as used_by_customer
         from promotion_coupon c
        where c.company_id = $1
          and upper(c.code) = any($3::text[])
          and c.is_active
          and c.valid @> $4::date
          and (c.customer_id is null or c.customer_id = $2)`,
      [companyId, customerId, upper, date],
    );
    return rows;
  }

  /** مصرفِ ثبت‌شده — مبنای سقفِ روزانه/مشتری/کل. */
  async loadPromotionUsage(
    companyId: string,
    promotionIds: string[],
    customerId: string | null,
    date: string,
  ): Promise<PromotionUsageRow[]> {
    if (promotionIds.length === 0) return [];
    const { rows } = await this.pool.query<PromotionUsageRow>(
      `select promotion_id,
              coalesce(sum(case when r.customer_id = $2 and r.redeemed_at >= $3::date
                                 and r.redeemed_at < ($3::date + 1) then r.discount_amount else 0 end), 0)::text as day_amount,
              coalesce(sum(case when r.customer_id = $2 then r.discount_amount else 0 end), 0)::text as customer_total_amount,
              coalesce(count(*) filter (where r.customer_id = $2), 0)::int as customer_uses,
              count(*)::int as total_uses
         from promotion_redemption r
        where r.company_id = $1 and r.promotion_id = any($4::uuid[])
        group by promotion_id`,
      [companyId, customerId, date, promotionIds],
    );
    return rows;
  }

  async loadOrderHistory(
    companyId: string,
    customerId: string | null,
  ): Promise<{ total_orders: number; first_order_at: string | null }> {
    if (!customerId) return { total_orders: 0, first_order_at: null };
    const { rows } = await this.pool.query<{ total_orders: number; first_order_at: string | null }>(
      `select count(*)::int as total_orders, min(so.created_at)::text as first_order_at
         from sales_order so
         join branch b on b.id = so.branch_id
        where b.company_id = $1 and so.customer_id = $2 and so.status <> 'cancelled'`,
      [companyId, customerId],
    );
    return rows[0] ?? { total_orders: 0, first_order_at: null };
  }

  // ---------------------------------------------------------------
  // کفِ سود
  // ---------------------------------------------------------------

  async loadMarginPolicies(companyId: string): Promise<MarginPolicyRow[]> {
    const { rows } = await this.pool.query<MarginPolicyRow>(
      `select id, domain_id, scope, category_id, product_id, cost_basis,
              min_margin_pct::text as min_margin_pct, on_unknown_cost, priority,
              lower(valid)::text as valid_from, upper(valid)::text as valid_to
         from margin_policy
        where company_id = $1 and is_active`,
      [companyId],
    );
    return rows;
  }

  async loadMarginExceptions(
    companyId: string,
    customerId: string | null,
    productIds: string[],
  ): Promise<MarginExceptionRow[]> {
    const { rows } = await this.pool.query<MarginExceptionRow>(
      `select id, product_id, customer_id, entity_type, entity_id, policy_id,
              granted_margin_pct::text as granted_margin_pct, status, valid_until::text as valid_until
         from margin_exception
        where company_id = $1 and status = 'approved'
          and (product_id is null or product_id = any($2::uuid[]))
          and (customer_id is null or customer_id = $3)`,
      [companyId, productIds, customerId],
    );
    return rows;
  }

  // ---------------------------------------------------------------
  // idempotency: کشِ ارزیابی + دفترِ مصرف
  // ---------------------------------------------------------------

  /**
   * TASK-24F · MEDIUM-5: عمرِ کشِ ارزیابی هم برگردانده می‌شود تا بازپخشِ قدیمی
   * (قیمتِ کهنه) به سفارشِ جدید تزریق نشود.
   */
  async findEvaluation(
    companyId: string,
    idempotencyKey: string,
  ): Promise<{ request_hash: string; result: unknown; age_seconds: number } | null> {
    const { rows } = await this.pool.query<{
      request_hash: string;
      result: unknown;
      age_seconds: number;
    }>(
      `select request_hash, result,
              greatest(0, extract(epoch from (now() - created_at)))::int as age_seconds
         from promotion_evaluation
        where company_id = $1 and idempotency_key = $2`,
      [companyId, idempotencyKey],
    );
    return rows[0] ?? null;
  }

  async saveEvaluation(
    companyId: string,
    idempotencyKey: string,
    requestHash: string,
    result: unknown,
  ): Promise<void> {
    await this.pool.query(
      `insert into promotion_evaluation (company_id, idempotency_key, request_hash, result)
       values ($1, $2, $3, $4::jsonb)
       on conflict (company_id, idempotency_key)
       do update set request_hash = excluded.request_hash,
                     result = excluded.result,
                     created_at = now()`,
      [companyId, idempotencyKey, requestHash, JSON.stringify(result)],
    );
  }

  /**
   * ثبتِ مصرفِ تشویق‌ها به‌صورتِ idempotent.
   * کلیدِ یکتا (company_id, idempotency_key, promotion_id) ⇒ تکرارِ همان درخواست
   * ردیفِ تکراری نمی‌سازد (اثباتِ «درخواستِ تکراری/بازپخش»).
   */
  async applyRedemptions(
    companyId: string,
    input: {
      idempotency_key: string;
      entity_type: string;
      entity_id: string | null;
      customer_id: string | null;
      actor_user_id: string | null;
      promotions: { promotion_id: string; coupon_id: string | null; amount: string }[];
    },
  ): Promise<{ inserted: number; skipped: number }> {
    const client = await this.pool.connect();
    let inserted = 0;
    let skipped = 0;
    try {
      await client.query('begin');
      for (const promo of input.promotions) {
        const res = await client.query(
          `insert into promotion_redemption
             (company_id, promotion_id, coupon_id, customer_id, entity_type, entity_id,
              idempotency_key, discount_amount, redeemed_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           on conflict (company_id, idempotency_key, promotion_id) do nothing`,
          [
            companyId,
            promo.promotion_id,
            promo.coupon_id,
            input.customer_id,
            input.entity_type,
            input.entity_id,
            input.idempotency_key,
            promo.amount,
            input.actor_user_id,
          ],
        );
        if (res.rowCount === 1) inserted += 1;
        else skipped += 1;
      }
      await client.query('commit');
      return { inserted, skipped };
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------
  // شبیه‌سازی و دفترِ تغییرِ قیمت (audit)
  // ---------------------------------------------------------------

  async logSimulation(
    companyId: string,
    actorUserId: string | null,
    request: unknown,
    result: unknown,
  ): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `insert into price_simulation_log (company_id, actor_user_id, request, result)
       values ($1, $2, $3::jsonb, $4::jsonb) returning id::text as id`,
      [companyId, actorUserId, JSON.stringify(request), JSON.stringify(result)],
    );
    return rows[0]?.id ?? '';
  }

  async logPriceChange(input: {
    company_id: string;
    entity_type: string;
    entity_id: string | null;
    action: string;
    before: unknown;
    after: unknown;
    actor_user_id: string | null;
    approval_request_id?: string | null;
  }): Promise<void> {
    await this.pool.query(
      `insert into price_change_log
         (company_id, entity_type, entity_id, action, before_data, after_data, actor_user_id, approval_request_id)
       values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8)`,
      [
        input.company_id,
        input.entity_type,
        input.entity_id,
        input.action,
        input.before == null ? null : JSON.stringify(input.before),
        input.after == null ? null : JSON.stringify(input.after),
        input.actor_user_id,
        input.approval_request_id ?? null,
      ],
    );
  }

  async listPriceChanges(companyId: string, entityType: string | null, limit: number): Promise<unknown[]> {
    const { rows } = await this.pool.query(
      `select id, entity_type, entity_id, action, before_data, after_data, actor_user_id, at
         from price_change_log
        where company_id = $1 and ($2::text is null or entity_type = $2)
        order by at desc, id desc
        limit $3`,
      [companyId, entityType, limit],
    );
    return rows;
  }

  // ---------------------------------------------------------------
  // قلمروها
  // ---------------------------------------------------------------

  async listDomains(companyId: string): Promise<unknown[]> {
    const { rows } = await this.pool.query(
      `select id, code, title, kind, channel, area_id, branch_id, priority, is_active
         from pricing_domain where company_id = $1 order by priority desc, code`,
      [companyId],
    );
    return rows;
  }

  async findDomain(companyId: string, id: string): Promise<unknown | null> {
    const { rows } = await this.pool.query(
      `select id, code, title, kind, channel, area_id, branch_id, priority, is_active
         from pricing_domain where company_id = $1 and id = $2`,
      [companyId, id],
    );
    return rows[0] ?? null;
  }

  async insertDomain(companyId: string, input: {
    code: string; title: string; kind: string; channel?: string | null;
    area_id?: string | null; branch_id?: string | null; priority?: number; is_active?: boolean;
  }): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `insert into pricing_domain (company_id, code, title, kind, channel, area_id, branch_id, priority, is_active)
       values ($1,$2,$3,$4,$5,$6,$7, coalesce($8,100), coalesce($9,true)) returning id`,
      [
        companyId, input.code, input.title, input.kind, input.channel ?? null,
        input.area_id ?? null, input.branch_id ?? null, input.priority ?? null, input.is_active ?? null,
      ],
    );
    return rows[0].id;
  }

  async updateDomain(companyId: string, id: string, input: Record<string, unknown>): Promise<boolean> {
    const sets: string[] = [];
    const params: unknown[] = [id, companyId];
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) continue;
      params.push(value);
      sets.push(`${key} = $${params.length}`);
    }
    if (sets.length === 0) return true;
    const { rowCount } = await this.pool.query(
      `update pricing_domain set ${sets.join(', ')}, updated_at = now() where id = $1 and company_id = $2`,
      params,
    );
    return (rowCount ?? 0) > 0;
  }

  // ---------------------------------------------------------------
  // سیاستِ کفِ سود — نوشتن
  // ---------------------------------------------------------------

  async listMarginPoliciesAdmin(companyId: string): Promise<unknown[]> {
    const { rows } = await this.pool.query(
      `select id, domain_id, scope, category_id, product_id, cost_basis,
              min_margin_pct::text as min_margin_pct, on_unknown_cost, priority, is_active,
              lower(valid)::text as valid_from, upper(valid)::text as valid_to
         from margin_policy where company_id = $1
        order by is_active desc, priority desc, scope`,
      [companyId],
    );
    return rows;
  }

  async insertMarginPolicy(companyId: string, input: {
    domain_id?: string | null; scope: string; category_id?: string | null; product_id?: string | null;
    cost_basis: string; min_margin_pct: string; on_unknown_cost: string;
    valid_from?: string | null; valid_to?: string | null; priority?: number; actor: string | null;
  }): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `insert into margin_policy
         (company_id, domain_id, scope, category_id, product_id, cost_basis, min_margin_pct,
          on_unknown_cost, valid, priority, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,
               daterange(coalesce($9::date, current_date), $10::date), coalesce($11,100), $12)
       returning id`,
      [
        companyId, input.domain_id ?? null, input.scope, input.category_id ?? null,
        input.product_id ?? null, input.cost_basis, input.min_margin_pct, input.on_unknown_cost,
        input.valid_from ?? null, input.valid_to ?? null, input.priority ?? null, input.actor,
      ],
    );
    return rows[0].id;
  }

  async updateMarginPolicy(companyId: string, id: string, input: Record<string, unknown>): Promise<boolean> {
    const sets: string[] = [];
    const params: unknown[] = [id, companyId];
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) continue;
      params.push(value);
      sets.push(`${key} = $${params.length}`);
    }
    if (sets.length === 0) return true;
    const { rowCount } = await this.pool.query(
      `update margin_policy set ${sets.join(', ')}, updated_at = now(), row_version = row_version + 1
        where id = $1 and company_id = $2`,
      params,
    );
    return (rowCount ?? 0) > 0;
  }

  async findMarginPolicy(companyId: string, id: string): Promise<Record<string, unknown> | null> {
    const { rows } = await this.pool.query(
      `select id, domain_id, scope, category_id, product_id, cost_basis,
              min_margin_pct::text as min_margin_pct, on_unknown_cost, priority, is_active
         from margin_policy where company_id = $1 and id = $2`,
      [companyId, id],
    );
    return (rows[0] as Record<string, unknown>) ?? null;
  }

  // ---------------------------------------------------------------
  // استثنای کفِ سود — درخواست/تصمیمِ شخصِ دوم
  // ---------------------------------------------------------------

  async insertMarginException(input: {
    company_id: string;
    policy_id: string | null;
    entity_type: string;
    entity_id: string | null;
    product_id: string | null;
    customer_id: string | null;
    required_margin_pct: number | null;
    effective_margin_pct: number | null;
    granted_margin_pct: number | null;
    reason: string;
    requested_by: string;
    valid_until: string | null;
    approval_request_id?: string | null;
  }): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `insert into margin_exception
         (company_id, policy_id, entity_type, entity_id, product_id, customer_id,
          required_margin_pct, effective_margin_pct, granted_margin_pct, reason,
          requested_by, valid_until, approval_request_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       returning id`,
      [
        input.company_id, input.policy_id, input.entity_type, input.entity_id,
        input.product_id, input.customer_id, input.required_margin_pct,
        input.effective_margin_pct, input.granted_margin_pct, input.reason,
        input.requested_by, input.valid_until, input.approval_request_id ?? null,
      ],
    );
    return rows[0].id;
  }

  /**
   * TASK-24Y · F-2 — ساختِ **اتمیکِ** درخواستِ تأیید و اتصالِ آن به استثنا.
   *
   * پیش از این، سرویس ابتدا استثنا را در تراکنشِ خودش commit می‌کرد و بعد درخواستِ
   * تأیید را در تراکنشِ دیگری می‌ساخت. اگر مرحلهٔ دوم شکست می‌خورد، یک ردیفِ
   * `margin_exception` با `approval_request_id = null` باقی می‌ماند و کاربر هم
   * `500` می‌گرفت (یافتهٔ F-2 حسابرسیِ مستقل).
   *
   * اکنون هر دو نوشتن در **یک تراکنش** انجام می‌شوند:
   *   ۱) درجِ استثنا
   *   ۲) درجِ `approval_request` (مرحلهٔ جاری همان‌جا محاسبه و set می‌شود)
   *   ۳) claim کردنِ شرطیِ استثنا — `where approval_request_id is null and status = 'pending'`
   *
   * اگر هر مرحله شکست بخورد، `rollback` هیچ ردیفی باقی نمی‌گذارد؛ هیچ ردیفِ یتیمی
   * ساخته نمی‌شود و خطای اصلی به لایهٔ سرویس می‌رسد تا به کدِ دامنه‌ای نگاشت شود.
   */
  async createMarginExceptionWithApproval(
    exception: {
      company_id: string;
      policy_id: string | null;
      entity_type: string;
      entity_id: string | null;
      product_id: string | null;
      customer_id: string | null;
      required_margin_pct: number | null;
      effective_margin_pct: number | null;
      granted_margin_pct: number | null;
      reason: string;
      requested_by: string;
      valid_until: string | null;
    },
    approval: {
      approval_chain_id: string;
      entity_type: string;
      amount: number | null;
      current_step: number;
    },
  ): Promise<{ exceptionId: string; approvalRequestId: string }> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');

      const ex = await client.query<{ id: string }>(
        `insert into margin_exception
           (company_id, policy_id, entity_type, entity_id, product_id, customer_id,
            required_margin_pct, effective_margin_pct, granted_margin_pct, reason,
            requested_by, valid_until, approval_request_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,null)
         returning id`,
        [
          exception.company_id, exception.policy_id, exception.entity_type,
          exception.entity_id, exception.product_id, exception.customer_id,
          exception.required_margin_pct, exception.effective_margin_pct,
          exception.granted_margin_pct, exception.reason,
          exception.requested_by, exception.valid_until,
        ],
      );
      const exceptionId = ex.rows[0].id;

      const ar = await client.query<{ id: string }>(
        `insert into approval_request
            (approval_chain_id, entity_type, entity_id, requested_by, amount, current_step, status)
         values ($1, $2, $3, $4, $5, $6, 'pending')
         returning id`,
        [
          approval.approval_chain_id,
          approval.entity_type,
          exceptionId,
          exception.requested_by,
          approval.amount,
          approval.current_step,
        ],
      );
      const approvalRequestId = ar.rows[0].id;

      // claimِ شرطی: اگر ردیف در همین تراکنش توسط کسِ دیگری گرفته شده باشد، شکست می‌خورد
      const linked = await client.query(
        `update margin_exception
            set approval_request_id = $2, updated_at = now()
          where id = $1 and company_id = $3
            and approval_request_id is null and status = 'pending'`,
        [exceptionId, approvalRequestId, exception.company_id],
      );
      if ((linked.rowCount ?? 0) !== 1) {
        throw new Error('margin_exception_link_failed');
      }

      await client.query('commit');
      return { exceptionId, approvalRequestId };
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async findMarginException(companyId: string, id: string): Promise<Record<string, unknown> | null> {
    const { rows } = await this.pool.query(
      `select id, policy_id, entity_type, entity_id, product_id, customer_id,
              required_margin_pct::text as required_margin_pct,
              effective_margin_pct::text as effective_margin_pct,
              granted_margin_pct::text as granted_margin_pct,
              reason, status, requested_by, decided_by, decided_at, decision_note,
              approval_request_id, valid_until::text as valid_until, created_at
         from margin_exception where company_id = $1 and id = $2`,
      [companyId, id],
    );
    return (rows[0] as Record<string, unknown>) ?? null;
  }

  async updateMarginExceptionApprovalRequest(
    companyId: string,
    id: string,
    requestId: string,
  ): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `update margin_exception set approval_request_id = $3, updated_at = now()
        where id = $1 and company_id = $2 and status = 'pending'`,
      [id, companyId, requestId],
    );
    return (rowCount ?? 0) > 0;
  }

  /**
   * TASK-24X · C-1 — رهاکردنِ استثنایی که گردشِ تأییدش ساخته/متصل نشد.
   *
   * وضعیت `cancelled` انتخاب شده (نه `rejected`) چون CHECKِ جدول
   * `(status in ('approved','rejected')) = (decided_by is not null)` است و اینجا
   * هنوز تصمیم‌گیرنده‌ای وجود ندارد؛ ضمن آنکه `cancelled` از `status='pending'`
   * خارج است، پس مسیرِ تأیید (`decideMarginException`) دیگر هرگز به آن نمی‌رسد و
   * `findException` هم فقط `approved` را اعمال می‌کند ⇒ هیچ اثرِ قیمتی ندارد.
   */
  async abandonMarginException(
    companyId: string,
    id: string,
    input: { note: string },
  ): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `update margin_exception
          set status = 'cancelled', decision_note = $3,
              updated_at = now(), row_version = row_version + 1
        where id = $1 and company_id = $2 and status = 'pending'`,
      [id, companyId, input.note],
    );
    return (rowCount ?? 0) > 0;
  }

  async listMarginExceptions(companyId: string, status: string | null, limit: number): Promise<unknown[]> {
    const { rows } = await this.pool.query(
      `select id, entity_type, entity_id, product_id, customer_id,
              required_margin_pct::text as required_margin_pct,
              effective_margin_pct::text as effective_margin_pct,
              granted_margin_pct::text as granted_margin_pct, reason, status,
              requested_by, decided_by, decided_at, valid_until::text as valid_until, created_at
         from margin_exception
        where company_id = $1 and ($2::text is null or status = $2)
        order by created_at desc limit $3`,
      [companyId, status, limit],
    );
    return rows;
  }

  /**
   * تصمیمِ شخصِ دوم — با قیدهای DB:
   *   - فقط وضعیتِ pending قابلِ تصمیم است (update شرطی = جلوگیری از تصمیمِ هم‌زمان)
   *   - decided_by <> requested_by در سطحِ constraint (ck_margin_exception_second_person)
   */
  async decideMarginException(input: {
    company_id: string;
    id: string;
    decided_by: string;
    status: 'approved' | 'rejected';
    note: string | null;
    granted_margin_pct: number | null;
  }): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `update margin_exception
          set status = $3, decided_by = $4, decided_at = now(), decision_note = $5,
              granted_margin_pct = coalesce($6, granted_margin_pct),
              updated_at = now(), row_version = row_version + 1
        where id = $1 and company_id = $2 and status = 'pending'
          and requested_by <> $4`,
      [input.id, input.company_id, input.status, input.decided_by, input.note, input.granted_margin_pct],
    );
    return (rowCount ?? 0) > 0;
  }

  // ---------------------------------------------------------------
  // قیمتِ مشتری — نوشتن
  // ---------------------------------------------------------------

  async listCustomerPrices(companyId: string, customerId: string | null, productId: string | null, limit: number): Promise<unknown[]> {
    const { rows } = await this.pool.query(
      `select cp.id, cp.customer_id, cp.product_id, cp.packaging_id,
              cp.price::text as price, cp.min_qty::text as min_qty, cp.max_qty::text as max_qty,
              cp.max_discount_pct::text as max_discount_pct, cp.approved_by,
              lower(cp.valid)::text as valid_from, upper(cp.valid)::text as valid_to,
              cp.note, cp.approval_request_id, cp.row_version
         from customer_price cp
         join customer c on c.id = cp.customer_id
         join branch b on b.id = c.branch_id
        where b.company_id = $1
          and ($2::uuid is null or cp.customer_id = $2)
          and ($3::uuid is null or cp.product_id = $3)
        order by cp.created_at desc, cp.id
        limit $4`,
      [companyId, customerId, productId, limit],
    );
    return rows;
  }

  async insertCustomerPrice(companyId: string, input: {
    customer_id: string; product_id: string; packaging_id?: string | null; price: string;
    min_qty?: string; max_qty?: string | null; max_discount_pct?: string | null;
    valid_from?: string | null; valid_to?: string | null;
    approved_by?: string | null; approval_request_id?: string | null; note?: string | null;
    created_by?: string | null;
  }): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `insert into customer_price
         (customer_id, product_id, packaging_id, price, min_qty, max_qty, max_discount_pct,
          valid, approved_by, approval_request_id, note, created_by)
       select $1, $2, $3, $4, coalesce($5,0), $6, $7,
              daterange(coalesce($8::date, current_date), $9::date), $10, $11, $12, $13
        where exists (
          select 1 from customer c join branch b on b.id = c.branch_id
           where c.id = $1 and b.company_id = $14
        )
        returning id`,
      [
        input.customer_id, input.product_id, input.packaging_id ?? null, input.price,
        input.min_qty ?? null, input.max_qty ?? null, input.max_discount_pct ?? null,
        input.valid_from ?? null, input.valid_to ?? null, input.approved_by ?? null,
        input.approval_request_id ?? null, input.note ?? null, input.created_by ?? null, companyId,
      ],
    );
    return rows[0]?.id ?? '';
  }

  async updateCustomerPrice(companyId: string, id: string, input: Record<string, unknown>): Promise<boolean> {
    const sets: string[] = [];
    const params: unknown[] = [id, companyId];
    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) continue;
      params.push(value);
      sets.push(`${key} = $${params.length}`);
    }
    if (sets.length === 0) return true;
    const { rowCount } = await this.pool.query(
      `update customer_price cp set ${sets.join(', ')}
        from customer c join branch b on b.id = c.branch_id
       where cp.id = $1 and cp.customer_id = c.id and b.company_id = $2`,
      params,
    );
    return (rowCount ?? 0) > 0;
  }

  /** به‌روزرسانیِ بازهٔ اعتبار با حفظ کرانِ دیگر (همان الگوی promotion) */
  async updateCustomerPriceRange(
    companyId: string,
    id: string,
    validFrom: string | null,
    validTo: string | null,
  ): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `update customer_price cp
          set valid = daterange(coalesce($3::date, lower(cp.valid)), coalesce($4::date, upper(cp.valid)))
         from customer c join branch b on b.id = c.branch_id
        where cp.id = $1 and cp.customer_id = c.id and b.company_id = $2`,
      [id, companyId, validFrom, validTo],
    );
    return (rowCount ?? 0) > 0;
  }

  async findCustomerPrice(companyId: string, id: string): Promise<Record<string, unknown> | null> {
    const { rows } = await this.pool.query(
      `select cp.id, cp.customer_id, cp.product_id, cp.packaging_id, cp.price::text as price,
              cp.min_qty::text as min_qty, cp.max_qty::text as max_qty,
              cp.max_discount_pct::text as max_discount_pct,
              lower(cp.valid)::text as valid_from, upper(cp.valid)::text as valid_to,
              cp.row_version
         from customer_price cp
         join customer c on c.id = cp.customer_id
         join branch b on b.id = c.branch_id
        where b.company_id = $1 and cp.id = $2`,
      [companyId, id],
    );
    return (rows[0] as Record<string, unknown>) ?? null;
  }

  // ---------------------------------------------------------------
  // کوپن
  // ---------------------------------------------------------------

  async listCoupons(companyId: string, promotionId: string | null, limit: number): Promise<unknown[]> {
    const { rows } = await this.pool.query(
      `select c.id, c.promotion_id, c.code, c.customer_id,
              lower(c.valid)::text as valid_from, upper(c.valid)::text as valid_to,
              c.max_uses, c.max_uses_per_customer, c.is_active
         from promotion_coupon c
        where c.company_id = $1 and ($2::uuid is null or c.promotion_id = $2)
        order by c.code limit $3`,
      [companyId, promotionId, limit],
    );
    return rows;
  }

  async insertCoupon(companyId: string, input: {
    promotion_id: string; code: string; customer_id?: string | null;
    valid_from?: string | null; valid_to?: string | null;
    max_uses?: number | null; max_uses_per_customer?: number | null;
  }): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `insert into promotion_coupon
         (company_id, promotion_id, code, customer_id, valid,
          max_uses, max_uses_per_customer)
       values ($1,$2,$3,$4, daterange(coalesce($5::date, current_date), $6::date), $7, $8)
       returning id`,
      [
        companyId, input.promotion_id, input.code.trim().toUpperCase(), input.customer_id ?? null,
        input.valid_from ?? null, input.valid_to ?? null, input.max_uses ?? null,
        input.max_uses_per_customer ?? null,
      ],
    );
    return rows[0].id;
  }

  async setCouponActive(companyId: string, id: string, active: boolean): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      'update promotion_coupon set is_active = $3 where id = $1 and company_id = $2',
      [id, companyId, active],
    );
    return (rowCount ?? 0) > 0;
  }

  /** آیا زنجیرهٔ تأییدِ فعالی برای این موجودیت هست؟ (برای اتصالِ اختیاری به موتورِ تایید) */
  async findApprovalChain(companyId: string, entity: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ id: string }>(
      `select id from approval_chain
        where company_id = $1 and entity = $2 and is_active
        order by code limit 1`,
      [companyId, entity],
    );
    return rows[0]?.id ?? null;
  }

  /**
   * TASK-24X · C-1 — زنجیرهٔ تأییدِ فعال به‌همراهِ **تعدادِ گام‌ها**.
   *
   * چرا جدا از `findApprovalChain`: برای fail-closed بودن باید بتوانیم سه حالت را
   * از هم تفکیک کنیم، چون پاسخِ درست برای هرکدام متفاوت است:
   *   • زنجیره‌ای تعریف نشده      (pending = خطای پیکربندی)
   *   • زنجیرهٔ تعریف‌شده ولی بی‌گام (پیکربندیِ ناقص — نباید «تأییدِ خودکار» شود)
   *   • زنجیرهٔ سالم              (مسیرِ عادی)
   * `null` یعنی «هیچ زنجیرهٔ فعالی نیست»؛ `steps: 0` یعنی «هست ولی ناقص است».
   */
  async findApprovalChainWithSteps(
    companyId: string,
    entity: string,
  ): Promise<{ id: string; steps: number } | null> {
    const { rows } = await this.pool.query<{ id: string; steps: number }>(
      `select c.id, count(s.id)::int as steps
         from approval_chain c
         left join approval_step_def s on s.approval_chain_id = c.id
        where c.company_id = $1 and c.entity = $2 and c.is_active
        group by c.id
        order by c.code limit 1`,
      [companyId, entity],
    );
    return rows[0] ?? null;
  }

  async productExists(companyId: string, productId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      'select 1 from product where id = $1 and company_id = $2 and deleted_at is null',
      [productId, companyId],
    );
    return rows.length > 0;
  }

  async customerExists(companyId: string, customerId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      `select 1 from customer c join branch b on b.id = c.branch_id
        where c.id = $1 and b.company_id = $2`,
      [customerId, companyId],
    );
    return rows.length > 0;
  }

  async packagingExists(companyId: string, productId: string, packagingId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      `select 1 from product_packaging pk join product p on p.id = pk.product_id
        where pk.id = $1 and pk.product_id = $2 and p.company_id = $3`,
      [packagingId, productId, companyId],
    );
    return rows.length > 0;
  }

  /** سیاست/استثنای معتبر برای بررسیِ نوشتنِ قیمت (پیش از ذخیره) */
  async loadPolicyBundle(companyId: string, customerId: string | null, productIds: string[]): Promise<{
    policies: MarginPolicyRow[];
    exceptions: MarginExceptionRow[];
    costs: CostRow[];
  }> {
    const [policies, exceptions, costs] = await Promise.all([
      this.loadMarginPolicies(companyId),
      customerId ? this.loadMarginExceptions(companyId, customerId, productIds) : Promise.resolve([]),
      this.loadCosts(companyId, productIds),
    ]);
    return { policies, exceptions, costs };
  }

  /** بررسیِ اتمیکِ هم‌زمانی: نسخهٔ ردیفِ قیمت برای تغییرِ هم‌زمان */
  // ---------------------------------------------------------------
  // سیاستِ پایدارِ قیمت‌گذاری (TASK-24F · HIGH-2)
  // ---------------------------------------------------------------

  async getPricingSettings(companyId: string): Promise<PricingSettingsRow | null> {
    const { rows } = await this.pool.query<PricingSettingsRow>(
      `select company_id, apply_promotions_on_orders, max_total_discount_pct,
              max_line_discount_pct, allow_loss_making_sales, min_order_date_lookback_days,
              require_override_reason, updated_by, updated_at, row_version
         from pricing_settings
        where company_id = $1`,
      [companyId],
    );
    return rows[0] ?? null;
  }

  /** upsertِ کامل (سرویس ابتدا مقدارِ فعلی/پیش‌فرض را merge می‌کند) */
  async upsertPricingSettings(
    companyId: string,
    input: {
      apply_promotions_on_orders: boolean;
      max_total_discount_pct: number | null;
      max_line_discount_pct: number | null;
      allow_loss_making_sales: boolean;
      min_order_date_lookback_days: number | null;
      require_override_reason: boolean;
      updated_by: string | null;
    },
  ): Promise<PricingSettingsRow> {
    const { rows } = await this.pool.query<PricingSettingsRow>(
      `insert into pricing_settings
         (company_id, apply_promotions_on_orders, max_total_discount_pct, max_line_discount_pct,
          allow_loss_making_sales, min_order_date_lookback_days, require_override_reason, updated_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (company_id) do update set
         apply_promotions_on_orders = excluded.apply_promotions_on_orders,
         max_total_discount_pct = excluded.max_total_discount_pct,
         max_line_discount_pct = excluded.max_line_discount_pct,
         allow_loss_making_sales = excluded.allow_loss_making_sales,
         min_order_date_lookback_days = excluded.min_order_date_lookback_days,
         require_override_reason = excluded.require_override_reason,
         updated_by = excluded.updated_by,
         updated_at = now(),
         row_version = pricing_settings.row_version + 1
       returning company_id, apply_promotions_on_orders, max_total_discount_pct,
                 max_line_discount_pct, allow_loss_making_sales, min_order_date_lookback_days,
                 require_override_reason, updated_by, updated_at, row_version`,
      [
        companyId,
        input.apply_promotions_on_orders,
        input.max_total_discount_pct,
        input.max_line_discount_pct,
        input.allow_loss_making_sales,
        input.min_order_date_lookback_days,
        input.require_override_reason,
        input.updated_by,
      ],
    );
    return rows[0];
  }

  async priceItemVersion(companyId: string, itemId: string): Promise<number | null> {
    const { rows } = await this.pool.query<{ row_version: number }>(
      `select i.row_version from price_list_item i
         join price_list l on l.id = i.price_list_id
        where i.id = $1 and l.company_id = $2`,
      [itemId, companyId],
    );
    return rows[0]?.row_version ?? null;
  }
}
