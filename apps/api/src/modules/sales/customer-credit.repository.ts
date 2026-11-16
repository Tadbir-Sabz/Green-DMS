import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../../database/database.module';
import { runner, type Runner } from '../../common/transaction';
import type { CreditGateRow } from './credit-policy';

/** قفلِ مشورتیِ سریال‌سازِ هم‌زمانیِ اعتبارِ یک مشتری (کلید تراکنشی) */
export const creditLockKey = (companyId: string, customerId: string): string =>
  `${companyId}:p3_credit:${customerId}`;

export interface CreditExposureDetail extends CreditGateRow {
  nominal_limit: number;
  available_credit: number;
  available_for_order: number;
  extra_limit_expires_on: string | null;
}

/**
 * دروازهٔ اعتبار — همهٔ ارجاع‌ها با `branch.company_id = $companyId` قفل می‌شوند
 * (نمایِ v_customer_exposure عمداً استفاده نمی‌شود: ستونِ status='active' در آن نما
 * ردیفِ مشتریِ مسدود را برمی‌گرداند — برای دروازه لازم است بدانیم مشتری *چرا* رد می‌شود).
 */
@Injectable()
export class CustomerCreditRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** قفل تراکنشی بر اساس مشتری؛ همهٔ مسیرهای دروازه (ثبت/تأیید/استثنا) همین را می‌گیرند */
  async lockCreditTx(client: Runner, companyId: string, customerId: string): Promise<void> {
    await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
      creditLockKey(companyId, customerId),
    ]);
  }

  /**
   * سطرهای خام دروازه — وجود مشتری در شرکت پیش‌شرط است (null یعنی مشتری نیست).
   * وقتی `client` داده شود همهٔ کوئری‌ها روی همان تراکنش اجرا می‌شوند.
   */
  async gateRow(
    companyId: string,
    customerId: string,
    excludeOrderId: string | null,
    client?: Runner,
  ): Promise<CreditGateRow | null> {
    const q = runner(this.pool, client);

    const head = await q.query<{
      id: string;
      branch_id: string;
      status: string;
      segment_id: string | null;
      credit_limit: string;
      extra_limit: string;
      extra_limit_expires_on: string | null;
      cheque_allowed: boolean;
      max_open_cheques: number | null;
      max_overdue_days: number | null;
      block_on_overdue: boolean | null;
      credit_hold: boolean | null;
      hold_reason: string | null;
      hold_set_at: string | null;
    }>(
      `select c.id, c.branch_id, c.status, c.segment_id,
              coalesce(cc.credit_limit, 0)::text            as credit_limit,
              case when cc.extra_limit_expires_on is null
                     or cc.extra_limit_expires_on >= current_date
                   then coalesce(cc.extra_limit, 0) else 0 end::text as extra_limit,
              cc.extra_limit_expires_on,
              coalesce(cc.cheque_allowed, true)             as cheque_allowed,
              cc.max_open_cheques,
              cc.max_overdue_days,
              cc.block_on_overdue,
              coalesce(cc.credit_hold, false)               as credit_hold,
              cc.hold_reason, cc.hold_set_at
         from customer c
         join branch b on b.id = c.branch_id
         left join customer_credit cc on cc.customer_id = c.id
        where c.id = $1 and b.company_id = $2 and c.deleted_at is null`,
      [customerId, companyId],
    );
    const h = head.rows[0];
    if (!h) return null;

    const openOrders = await q.query<{ committed: string }>(
      `select coalesce(sum(o.grand_total), 0)::text as committed
         from sales_order o
         join branch b on b.id = o.branch_id
        where o.customer_id = $1 and b.company_id = $2
          and o.status in ('approved', 'partially_delivered', 'delivered')
          and ($3::uuid is null or o.id <> $3::uuid)`,
      [customerId, companyId, excludeOrderId],
    );

    // ماندهٔ فاکتورهای باز پس از کسرِ credit_noteهای ثبت‌شده (همان معنای ar)
    const dues = await q.query<{ total_due: string; oldest_overdue_days: number; overdue_invoice_count: number }>(
      `with bal as (
         select i.id,
                greatest(i.grand_total - i.paid_amount
                         - coalesce(cn.credit_total, 0), 0) as balance,
                (current_date - coalesce(i.due_date, i.invoice_date))::integer as overdue_days
           from invoice i
           join branch b on b.id = i.branch_id
           left join (
             select cn2.invoice_id, sum(cn2.amount) as credit_total
               from credit_note cn2
              where cn2.status = 'posted'
              group by cn2.invoice_id
           ) cn on cn.invoice_id = i.id
          where i.status in ('posted', 'partially_paid')
            and i.customer_id = $1 and b.company_id = $2
            and i.invoice_date <= current_date
       )
       select coalesce(sum(balance), 0)::text as total_due,
              coalesce(max(case when overdue_days > 0 and balance > 0.004 then overdue_days end), 0)::integer as oldest_overdue_days,
              count(*) filter (where overdue_days > 0 and balance > 0.004)::integer as overdue_invoice_count
         from bal`,
      [customerId, companyId],
    );

    const cheques = await q.query<{ n: number; amount: string }>(
      `select count(*)::integer as n, coalesce(sum(ch.amount), 0)::text as amount
         from cheque ch
         join branch b on b.id = ch.branch_id
        where ch.customer_id = $1 and b.company_id = $2
          and ch.direction = 'received' and ch.status in ('in_hand', 'deposited')`,
      [customerId, companyId],
    );

    const d = dues.rows[0];
    const ch = cheques.rows[0];
    // نبودِ ردیفِ customer_credit یعنی «پیکربندی نشده»؛ block_on_overdue پیش‌فرضِ
    // ستون (true) فقط وقتی معنا دارد که خودِ ردیف وجود داشته باشد.
    const hasCreditRow = h.max_overdue_days !== null;
    return {
      customer_id: h.id,
      branch_id: h.branch_id,
      status: h.status,
      segment_id: h.segment_id,
      credit_limit: Number(h.credit_limit),
      extra_limit: Number(h.extra_limit),
      total_due: Number(d?.total_due ?? 0),
      committed_open_orders: Number(openOrders.rows[0]?.committed ?? 0),
      cheque_allowed: h.cheque_allowed,
      max_open_cheques: h.max_open_cheques,
      open_cheques_count: Number(ch?.n ?? 0),
      open_cheques_amount: Number(ch?.amount ?? 0),
      block_on_overdue: hasCreditRow ? (h.block_on_overdue ?? false) : false,
      max_overdue_days: h.max_overdue_days ?? 0,
      oldest_overdue_days: Number(d?.oldest_overdue_days ?? 0),
      overdue_invoice_count: Number(d?.overdue_invoice_count ?? 0),
      credit_hold: h.credit_hold ?? false,
      hold_reason: h.hold_reason,
      hold_set_at: h.hold_set_at ? new Date(h.hold_set_at).toISOString() : null,
    };
  }

  /** جزئیات کامل برای نمایش (اندپوینتِ GET /customers/{id}/credit) — همه‌چیز روی یک خواندن */
  async exposureDetail(
    companyId: string,
    customerId: string,
    excludeOrderId: string | null = null,
  ): Promise<CreditExposureDetail | null> {
    const row = await this.gateRow(companyId, customerId, excludeOrderId);
    if (!row) return null;
    // اسکوپ شرکت روی همان ردیف — customer_credit ستون company_id ندارد ولی gateRow
    // همین‌حالا مشتری را از‌روی branch قفل کرده است؛ اینجا فقط فیلد نمایش افزوده می‌شود.
    const extra = await this.pool.query<{ extra_limit_expires_on: string | null }>(
      `select cc.extra_limit_expires_on
         from customer_credit cc
         join customer c on c.id = cc.customer_id
         join branch b on b.id = c.branch_id
        where cc.customer_id = $1 and b.company_id = $2`,
      [customerId, companyId],
    );
    const nominal = row.credit_limit + row.extra_limit;
    const available = nominal - row.total_due;
    return {
      ...row,
      extra_limit_expires_on: extra.rows[0]?.extra_limit_expires_on ?? null,
      nominal_limit: Math.round(nominal * 100) / 100,
      available_credit: Math.round(available * 100) / 100,
      available_for_order: Math.round((available - row.committed_open_orders) * 100) / 100,
    };
  }

  /**
   * گذارِ مسدودیِ اعتبار — قبل/بعد در ممیزی توسط فراخوان ثبت می‌شود.
   * CHECK های ck_customer_credit_hold_* در مهاجرت 0066 سازگاریِ reason/set_at/set_by را اجبار می‌کنند.
   * reason = null ⇒ رفعِ مسدودی (فقط اگر مسدودی فعال باشد).
   */
  async setHold(
    client: Runner,
    companyId: string,
    customerId: string,
    hold: { reason: string | null; setBy: string },
  ): Promise<'set' | 'already' | 'not_found'> {
    const exists = await runner(this.pool, client).query(
      `select 1 from customer c join branch b on b.id = c.branch_id
        where c.id = $1 and b.company_id = $2 and c.deleted_at is null`,
      [customerId, companyId],
    );
    if (exists.rowCount === 0) return 'not_found';
    if (hold.reason !== null) {
      const r = await runner(this.pool, client).query(
        `insert into customer_credit (customer_id, credit_limit, block_on_overdue, max_overdue_days,
                                     credit_hold, hold_reason, hold_set_at, hold_set_by, updated_by)
              values ($1, 0, false, 0, true, $2, now(), $3, $3)
         on conflict (customer_id) do update
              set credit_hold = true, hold_reason = excluded.hold_reason,
                  hold_set_at = now(), hold_set_by = excluded.hold_set_by, updated_by = excluded.updated_by
            where customer_credit.credit_hold = false
         returning customer_id`,
        [customerId, hold.reason, hold.setBy],
      );
      return (r.rowCount ?? 0) > 0 ? 'set' : 'already';
    }
    const r = await runner(this.pool, client).query(
      `update customer_credit
          set credit_hold = false, hold_reason = null, hold_set_at = null, hold_set_by = null,
              updated_by = $2
        where customer_id = $1 and credit_hold = true
      returning customer_id`,
      [customerId, hold.setBy],
    );
    return (r.rowCount ?? 0) > 0 ? 'set' : 'already';
  }

  /** وضعیتِ چکِ سقف برای ثبتِ چکِ دریافتی (سقف تعداد چکِ باز و allowed) */
  async chequeQuota(
    companyId: string,
    customerId: string,
  ): Promise<{ cheque_allowed: boolean; max_open_cheques: number | null; open_cheques_count: number }> {
    const { rows } = await this.pool.query<{
      cheque_allowed: boolean | null;
      max_open_cheques: number | null;
      open_count: number;
    }>(
      `select cc.cheque_allowed, cc.max_open_cheques,
              coalesce((select count(*)::integer from cheque ch
                          join branch b2 on b2.id = ch.branch_id
                         where ch.customer_id = c.id and b2.company_id = $2
                           and ch.direction = 'received' and ch.status in ('in_hand','deposited')), 0) as open_count
         from customer c
         join branch b on b.id = c.branch_id
         left join customer_credit cc on cc.customer_id = c.id
        where c.id = $1 and b.company_id = $2 and c.deleted_at is null`,
      [customerId, companyId],
    );
    const r = rows[0];
    return {
      cheque_allowed: r?.cheque_allowed ?? true,
      max_open_cheques: r?.max_open_cheques ?? null,
      open_cheques_count: Number(r?.open_count ?? 0),
    };
  }

  /** اجرای یک واحدِ کار روی اتصال تراکنشی (برای سرویس‌هایی که خودشان tx می‌سازند) */
  async withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const result = await fn(client);
      await client.query('commit');
      return result;
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }
}
