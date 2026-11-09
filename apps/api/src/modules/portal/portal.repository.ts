import { Inject, Injectable } from '@nestjs/common';
import { runAsJobTenant } from '../../database/job-context';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import type {
  PortalBalance,
  PortalIdentity,
  PortalInvoice,
  PortalMe,
  PortalOrder,
} from './portal.dto';

/**
 * منبعِ دادهٔ پورتال B2B. دو دسته کوئری:
 *  ۱) احرازِ هویت روی portal_user/portal_session (جدولِ جداگانه از app_user کارکنان).
 *  ۲) دادهٔ مشتری که «همیشه» با company_id (جداسازیِ اجاره) و customer_id (اسکوپِ
 *     حسابِ پورتال) فیلتر می‌شود تا یک مشتری هرگز دادهٔ دیگری را نبیند.
 * نکتهٔ RLS: اپ مالکِ جداول است و RLS را bypass می‌کند (هم‌راستا با 0036/0021)؛
 * اعمالِ واقعیِ جداسازی همین فیلترهای WHERE است. کوئریِ ورود (findByEmail) پیش از
 * شکل‌گیریِ زمینهٔ شرکت اجرا می‌شود و به‌همین دلیل به RLS تکیه نمی‌کند.
 */

export interface PortalUserRow extends QueryResultRow {
  id: string;
  company_id: string;
  customer_id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  is_active: boolean;
  failed_attempts: number;
  locked_until: string | null;
}

/** نشستِ به‌همراهِ وضعیتِ زندهٔ حساب (برای گارد). */
export interface PortalSessionJoinRow extends QueryResultRow {
  id: string;
  portal_user_id: string;
  company_id: string;
  customer_id: string;
  expires_at: string;
  revoked_at: string | null;
  is_active: boolean;
  locked_until: string | null;
}

export interface PortalRefreshRow extends QueryResultRow {
  id: string;
  portal_user_id: string;
  company_id: string;
  customer_id: string;
  email: string;
  revoked_at: string | null;
  expires_at: string;
}

@Injectable()
export class PortalRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  // ---------------- احرازِ هویت ----------------

  /**
   * جست‌وجویِ ورود با ایمیل — از راهِ تابعِ محدودِ `fn_portal_find_login`
   * (مهاجرت 0041) نه انتخابِ مستقیم از `portal_user`.
   *
   * چرا: ورودِ پرتال «پیش از» ست‌شدنِ زمینهٔ اجاره رخ می‌دهد. وقتی اتصالِ برنامه
   * نقشِ غیرابرکاربرِ `dms_app` باشد، RLS رویِ `portal_user` (سیاستِ
   * p_portal_user_tenant) هیچ ردیفی را پیش از اجاره نشان نمی‌دهد و عملاً هیچ کاربری
   * نمی‌تواند وارد شود. راه‌حلِ نادرست، دادنِ دسترسیِ نامحدود به جدول یا خاموش‌کردنِ
   * RLS بود؛ راه‌حلِ درست همین تابعِ `SECURITY DEFINER` با `search_path` ثابت،
   * `EXECUTE` فقط برایِ نقشِ برنامه، و کمینه‌دادهٔ خروجی است:
   *   * هیچ پارامترِ company_id نمی‌گیرد ⇒ فراخوان نمی‌تواند اجارهٔ دلخواه برگزیند،
   *   * فقط «یک» سطرِ متناظر با ایمیل برمی‌گرداند (ایندکسِ یکتا روی lower(email)
   *     ⇒ هویتِ مبهم ذاتاً ممکن نیست)،
   *   * پس از یافتن، زمینهٔ اجاره از همان سطر گرفته می‌شود و بقیهٔ نشست زیرِ RLS است.
   */
  async findByEmail(email: string): Promise<PortalUserRow | null> {
    const { rows } = await this.pool.query<PortalUserRow>(
      `select id, company_id, customer_id, email, password_hash, display_name,
              is_active, failed_attempts, locked_until
         from fn_portal_find_login($1)`,
      [email],
    );
    return rows[0] ?? null;
  }

  async findById(id: string, companyId?: string): Promise<PortalUserRow | null> {
    if (companyId) return runAsJobTenant(this.pool, companyId, () => this.findById(id));
    const { rows } = await this.pool.query<PortalUserRow>(
      `select id, company_id, customer_id, email, password_hash, display_name,
              is_active, failed_attempts, locked_until
         from portal_user
        where id = $1
        limit 1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async createPortalUser(p: {
    companyId: string;
    customerId: string;
    email: string;
    passwordHash: string;
    displayName: string | null;
  }): Promise<PortalIdentity> {
    const { rows } = await this.pool.query<{
      id: string;
      email: string;
      display_name: string | null;
      company_id: string;
      customer_id: string;
    }>(
      `insert into portal_user (company_id, customer_id, email, password_hash, display_name)
       values ($1, $2, $3, $4, $5)
       returning id, email, display_name, company_id, customer_id`,
      [p.companyId, p.customerId, p.email, p.passwordHash, p.displayName],
    );
    return rows[0];
  }

  async emailExists(email: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ n: number }>(
      `select count(*)::int as n from portal_user where lower(email) = lower($1)`,
      [email],
    );
    return (rows[0]?.n ?? 0) > 0;
  }

  /** اطمینان از اینکه customer متعلق به همان company است (جلوگیری از پروکسی‌دادنِ اجارهٔ دیگر). */
  async customerInCompany(companyId: string, customerId: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ n: number }>(
      `select count(*)::int as n
         from customer c join branch b on b.id = c.branch_id
        where b.company_id = $1 and c.id = $2`,
      [companyId, customerId],
    );
    return (rows[0]?.n ?? 0) > 0;
  }

  async createSession(p: {
    portalUserId: string;
    companyId: string;
    refreshHash: string;
    expiresAt: Date;
    userAgent: string | null;
    ip: string | null;
  }): Promise<string> {
    const { rows } = await runAsJobTenant(this.pool, p.companyId, () => this.pool.query<{ id: string }>(
      `insert into portal_session (portal_user_id, company_id, refresh_hash, expires_at, user_agent, ip)
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [p.portalUserId, p.companyId, p.refreshHash, p.expiresAt, p.userAgent, p.ip],
    ));
    return rows[0].id;
  }

  async findSessionById(sid: string, companyId?: string): Promise<PortalSessionJoinRow | null> {
    if (companyId) return runAsJobTenant(this.pool, companyId, () => this.findSessionById(sid));
    const { rows } = await this.pool.query<PortalSessionJoinRow>(
      `select s.id, s.portal_user_id, s.company_id, u.customer_id,
              s.expires_at, s.revoked_at, u.is_active, u.locked_until
         from portal_session s
         join portal_user u on u.id = s.portal_user_id
        where s.id = $1
        limit 1`,
      [sid],
    );
    return rows[0] ?? null;
  }

  async findSessionByRefreshHash(refreshHash: string): Promise<PortalRefreshRow | null> {
    const { rows } = await this.pool.query<PortalRefreshRow>(
      `select * from fn_portal_find_refresh($1)`, [refreshHash]);
    return rows[0] ?? null;
  }

  /**
   * باطل‌سازی اتمیِ نشست: شرط «revoked_at is null» در خودِ UPDATE باعث می‌شود از
   * میان چند درخواستِ هم‌زمانِ refresh با یک توکن، دقیقاً یکی rowCount=1 بگیرد و
   * بقیه ۰ — همان سیگنالی که سرویس برای تشخیصِ استفادهٔ مجدد لازم دارد.
   * @returns تعداد سطرِ واقعاً باطل‌شده (۰ یا ۱)
   */
  async revokeSession(sid: string, companyId?: string): Promise<number> {
    if (companyId) return runAsJobTenant(this.pool, companyId, () => this.revokeSession(sid));
    const result = await this.pool.query(
      `update portal_session set revoked_at = now() where id = $1 and revoked_at is null`,
      [sid],
    );
    return result.rowCount ?? 0;
  }

  async recordLoginSuccess(id: string, companyId?: string): Promise<void> {
    if (companyId) return runAsJobTenant(this.pool, companyId, () => this.recordLoginSuccess(id));
    await this.pool.query(
      `update portal_user
          set failed_attempts = 0, locked_until = null, last_login_at = now(), updated_at = now()
        where id = $1`,
      [id],
    );
  }

  async recordLoginFailure(id: string, lockedUntil: Date | null, companyId?: string): Promise<void> {
    if (companyId) return runAsJobTenant(this.pool, companyId, () => this.recordLoginFailure(id, lockedUntil));
    await this.pool.query(
      `update portal_user
          set failed_attempts = failed_attempts + 1,
              locked_until = coalesce($2, locked_until),
              updated_at = now()
        where id = $1`,
      [id, lockedUntil],
    );
  }

  // ---------------- دادهٔ مشتری (اسکوپ‌شده) ----------------

  async me(companyId: string, portalUserId: string): Promise<PortalMe | null> {
    const { rows } = await this.pool.query<{
      id: string;
      email: string;
      display_name: string | null;
      company_id: string;
      customer_id: string;
      customer_code: string;
      customer_name: string;
    }>(
      `select u.id, u.email, u.display_name, u.company_id, u.customer_id,
              c.code as customer_code,
              coalesce(nullif(p.legal_name, ''), c.code) as customer_name
         from portal_user u
         join customer c on c.id = u.customer_id
         join branch b   on b.id = c.branch_id
         left join person p on p.id = c.person_id
        where u.id = $1 and u.company_id = $2
        limit 1`,
      [portalUserId, companyId],
    );
    return rows[0] ?? null;
  }

  async invoices(companyId: string, customerId: string): Promise<PortalInvoice[]> {
    const { rows } = await this.pool.query<QueryResultRow & PortalInvoice>(
      `select i.id,
              i.doc_number,
              i.fiscal_year::int as fiscal_year,
              i.invoice_date::text as invoice_date,
              i.due_date::text as due_date,
              i.grand_total::text as grand_total,
              i.paid_amount::text as paid_amount,
              i.status
         from invoice i
         join branch b on b.id = i.branch_id
        where b.company_id = $1
          and i.customer_id = $2
          and i.status in ('posted', 'partially_paid', 'paid')
        order by i.invoice_date desc, i.doc_number desc
        limit 200`,
      [companyId, customerId],
    );
    return rows.map((r) => ({
      id: r.id,
      doc_number: r.doc_number,
      fiscal_year: r.fiscal_year,
      invoice_date: r.invoice_date,
      due_date: r.due_date,
      grand_total: r.grand_total,
      paid_amount: r.paid_amount,
      status: r.status,
    }));
  }

  async orders(companyId: string, customerId: string): Promise<PortalOrder[]> {
    const { rows } = await this.pool.query<QueryResultRow & PortalOrder>(
      `select o.id,
              o.doc_number,
              o.fiscal_year::int as fiscal_year,
              o.order_date::text as order_date,
              o.grand_total::text as grand_total,
              o.status
         from sales_order o
         join branch b on b.id = o.branch_id
        where b.company_id = $1
          and o.customer_id = $2
          and o.status <> 'draft'
        order by o.order_date desc, o.doc_number desc
        limit 200`,
      [companyId, customerId],
    );
    return rows.map((r) => ({
      id: r.id,
      doc_number: r.doc_number,
      fiscal_year: r.fiscal_year,
      order_date: r.order_date,
      grand_total: r.grand_total,
      status: r.status,
    }));
  }

  async balance(companyId: string, customerId: string): Promise<PortalBalance> {
    const { rows } = await this.pool.query<{
      outstanding: string;
      overdue: string;
      credit_limit: string | null;
      credit_available: string | null;
    }>(
      `select coalesce(sum(total_due), 0)::text as outstanding,
              coalesce(sum(bucket_1_30 + bucket_31_60 + bucket_61_90 + bucket_over_90), 0)::text as overdue,
              max(credit_limit)::text     as credit_limit,
              max(credit_available)::text as credit_available
         from mv_ar_aging
        where company_id = $1 and customer_id = $2`,
      [companyId, customerId],
    );
    const r = rows[0];
    return {
      outstanding: r?.outstanding ?? '0',
      overdue: r?.overdue ?? '0',
      credit_limit: r?.credit_limit ?? null,
      credit_available: r?.credit_available ?? null,
    };
  }
}
