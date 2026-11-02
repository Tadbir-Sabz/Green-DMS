-- مهاجرت 0029 — شیءهای گزارش‌گیری تحلیلی + مجوز ثبت موقعیت میدانی
-- چرا این مهاجرت لازم است:
--   * کد API از چهار شیء خواند می‌کند که هرگز ساخته نشده بودند
--     (reports.module.ts:17,25,33 → mv_daily_sales / mv_ar_aging / mv_salesperson_performance
--      tracking.repository.ts:8 → v_live_locations)؛ 0028 فقط ایندکس اضافه کرد.
--   * مجوز tracking.location.report در فهرست مجوزهای 0022 نبود، در نتیجه
--     POST /tracking/ping برای هر نقشی 403 می‌داد.
-- منبع دdl: 0002 (branch)، 0004 (person/staff)، 0007 (customer/customer_credit)،
-- 0010 (sales_order/invoice/credit_note)، 0011 (tour/visit)، 0012 (location_sample)،
-- 0014 (payment_receipt)، 0022 (permission/role).

-- ====================================================================
-- ۱) نمای موقعیت زنده: آخرین نمونهٔ هر کارمند، محدود به بازهٔ اخیر
--    فیلتر زمانی عمدی است: location_sample ماهواره‌ای/پرحجم است (هدف NFR: ۵۰M در سال،
--    0012:41) و نقشهٔ «زنده» نمونه‌های کهنه را نمی‌خواهد. بازه = ۷ روز.
--    ستون‌های نام‌گذاری‌شده: company_id و sampled_at همان‌هایی‌اند که کوئری API استفاده می‌کند.
-- ====================================================================

create or replace view v_live_locations as
select b.company_id,
       s.id                                            as staff_id,
       coalesce(nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
                p.legal_name, s.employee_no, s.id::text) as staff_name,
       s.branch_id,
       b.code                                          as branch_code,
       b.name                                          as branch_name,
       ls.session_id,
       ls.tour_id,
       ST_Y(ls.geo::geometry)                      as lat,
       ST_X(ls.geo::geometry)                      as lng,
       ls.geo,
       ls.accuracy_m,
       ls.speed_mps,
       ls.heading_deg,
       ls.battery_pct,
       ls.is_mocked,
       ls.provider,
       ls.recorded_at                                  as sampled_at
  from staff s
  join lateral (
          select x.*
            from location_sample x
           where x.staff_id = s.id
             and x.recorded_at >= now() - interval '7 days'
           order by x.recorded_at desc
           limit 1
       ) ls on true
  join branch b on b.id = s.branch_id
  left join person p on p.id = s.person_id;

comment on view v_live_locations is
  'آخرین موقعیت ثبت‌شدهٔ هر کارمند میدانی در ۷ روز اخیر (ستون company_id برای دامنهٔ شرکت).';

-- ====================================================================
-- ۲) فروش روزانه به تفکیک شعبه: فاکتور + برگشت از فروش + وصولی
--    دامنهٔ گروه‌بندی (company_id, branch_id, sale_date) همگی not null هستند
--    تا ایندکس یکتا برای REFRESH ... CONCURRENTLY معتبر بماند.
-- ====================================================================

create materialized view mv_daily_sales as
with inv as (                                    -- فاکتورهای ثبت‌شده (نه پیش‌نویس، نه مبطله)
  select b.company_id,
         i.branch_id,
         i.invoice_date                          as day,
         count(*)                                as invoice_count,
         sum(i.subtotal)                         as subtotal,
         sum(i.discount_total)                   as discount_total,
         sum(i.tax_total)                        as tax_total,
         sum(i.grand_total)                      as gross_amount,
         sum(i.paid_amount)                      as paid_amount
    from invoice i
    join branch b on b.id = i.branch_id
   where i.status in ('posted', 'partially_paid', 'paid')
   group by 1, 2, 3
),
ret as (                                         -- برگشت/اصلاحی ثبت‌شده
  select b.company_id,
         cn.branch_id,
         cn.issued_at::date                      as day,
         count(*)                                as return_count,
         sum(cn.amount)                          as return_amount
    from credit_note cn
    join branch b on b.id = cn.branch_id
   where cn.status = 'posted'
   group by 1, 2, 3
),
rcpt as (                                        -- وصولی‌های ثبت‌شده
  select b.company_id,
         pr.branch_id,
         pr.receipt_date                         as day,
         count(*)                                as receipt_count,
         sum(pr.amount)                          as collected_amount
    from payment_receipt pr
    join branch b on b.id = pr.branch_id
   where pr.status in ('posted', 'partially_allocated', 'allocated')
   group by 1, 2, 3
),
grain as (
  select company_id, branch_id, day from inv
  union
  select company_id, branch_id, day from ret
  union
  select company_id, branch_id, day from rcpt
)
select g.company_id,
       g.branch_id,
       b.code                                    as branch_code,
       b.name                                    as branch_name,
       g.day                                     as sale_date,
       coalesce(inv.invoice_count, 0)            as invoice_count,
       coalesce(inv.subtotal, 0)                 as subtotal,
       coalesce(inv.discount_total, 0)           as discount_total,
       coalesce(inv.tax_total, 0)                as tax_total,
       coalesce(inv.gross_amount, 0)             as gross_amount,
       coalesce(ret.return_amount, 0)            as return_amount,
       coalesce(ret.return_count, 0)             as return_count,
       coalesce(inv.gross_amount, 0) - coalesce(ret.return_amount, 0) as net_sales,
       coalesce(rcpt.collected_amount, 0)        as collected_amount,
       coalesce(rcpt.receipt_count, 0)           as receipt_count,
       coalesce(inv.paid_amount, 0)              as paid_amount,
       coalesce(inv.gross_amount, 0) - coalesce(inv.paid_amount, 0)   as open_invoice_amount
  from grain g
  join branch b on b.id = g.branch_id
  left join inv  on inv.company_id  = g.company_id
                and inv.branch_id   = g.branch_id
                and inv.day         = g.day
  left join ret  on ret.company_id  = g.company_id
                and ret.branch_id   = g.branch_id
                and ret.day         = g.day
  left join rcpt on rcpt.company_id = g.company_id
                and rcpt.branch_id  = g.branch_id
                and rcpt.day        = g.day;

create unique index uq_mv_daily_sales on mv_daily_sales (company_id, branch_id, sale_date);
create index ix_mv_daily_sales_date on mv_daily_sales (company_id, sale_date desc);

comment on materialized view mv_daily_sales is
  'فروش، برگشت و وصولی هر روز به تفکیک شعبه — با REFRESH mv_daily_sales به‌روز می‌شود.';

-- ====================================================================
-- ۳) تحلیل سنی حساب‌های دریافتنی
--    نام ستون‌ها با ar_aging_snapshot (0014:100) یکی است تا کلاینت‌ها گیج نشوند.
--    مانده = مبلغ فاکتور − وصول‌شده − برگشت ثبت‌شده (همان قاعدهٔ fn_check_allocation، 0014:51).
-- ====================================================================

create materialized view mv_ar_aging as
with bal as (
  select b.company_id,
         i.branch_id,
         i.customer_id,
         greatest(i.grand_total - i.paid_amount - coalesce(cn.credit_total, 0), 0) as balance,
         (current_date - coalesce(i.due_date, i.invoice_date))::integer            as overdue_days
    from invoice i
    join branch b on b.id = i.branch_id
    left join (
      select cn.invoice_id, sum(cn.amount) as credit_total
        from credit_note cn
       where cn.status = 'posted'
       group by 1
    ) cn on cn.invoice_id = i.id
   where i.status in ('posted', 'partially_paid')
),
aged as (
  select company_id,
         branch_id,
         customer_id,
         sum(case when overdue_days <= 0                then balance else 0 end) as current_amount,
         sum(case when overdue_days between 1  and 30   then balance else 0 end) as bucket_1_30,
         sum(case when overdue_days between 31 and 60   then balance else 0 end) as bucket_31_60,
         sum(case when overdue_days between 61 and 90   then balance else 0 end) as bucket_61_90,
         sum(case when overdue_days > 90                then balance else 0 end) as bucket_over_90,
         sum(balance)                                  as total_due,
         greatest(coalesce(max(overdue_days), 0), 0)   as overdue_days,
         count(*)                                      as open_invoice_count
    from bal
   group by 1, 2, 3
  having sum(balance) > 0.004
)
select a.company_id,
       a.branch_id,
       b.code                          as branch_code,
       b.name                          as branch_name,
       a.customer_id,
       c.code                          as customer_code,
       coalesce(nullif(p.legal_name, ''),
                nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
                c.code)                 as customer_name,
       current_date                    as as_of_date,
       a.current_amount,
       a.bucket_1_30,
       a.bucket_31_60,
       a.bucket_61_90,
       a.bucket_over_90,
       a.total_due,
       a.overdue_days,
       a.open_invoice_count,
       coalesce(cc.credit_limit, 0)     as credit_limit,
       coalesce(cc.credit_limit, 0) - a.total_due as credit_available
  from aged a
  join branch b on b.id = a.branch_id
  join customer c on c.id = a.customer_id
  left join person p on p.id = c.person_id
  left join customer_credit cc on cc.customer_id = a.customer_id;

create unique index uq_mv_ar_aging on mv_ar_aging (company_id, branch_id, customer_id);
create index ix_mv_ar_aging_due on mv_ar_aging (company_id, total_due desc);

comment on materialized view mv_ar_aging is
  'ماندهٔ باز هر مشتری به تفکیک شعبه و سطل‌های سنی (آنی/۱-۳۰/۳۱-۶۰/۶۱-۹۰/بالای ۹۰).';

-- ====================================================================
-- ۴) عملکرد ویزیتور ماهانه
--    کارمند از sales_order (و در نبود آن مشتری ثابت) گرفته می‌شود؛ وصولی از
--    payment_receipt.collected_by و بازدیدها از tour→visit.
-- ====================================================================

create materialized view mv_salesperson_performance as
with ord as (
  select b.company_id,
         so.salesperson_id,
         date_trunc('month', so.order_date)::date as period_start,
         count(*)                          as order_count,
         sum(so.grand_total)               as order_amount,
         sum(so.discount_total)            as discount_amount
    from sales_order so
    join branch b on b.id = so.branch_id
   where so.salesperson_id is not null
     and so.status not in ('cancelled', 'rejected')
   group by 1, 2, 3
),
inv as (
  select b.company_id,
         coalesce(so.salesperson_id, c.salesperson_id) as salesperson_id,
         date_trunc('month', i.invoice_date)::date     as period_start,
         count(*)             as invoice_count,
         sum(i.grand_total)   as invoiced_amount
    from invoice i
    join branch b on b.id = i.branch_id
    left join sales_order so on so.id = i.sales_order_id
    left join customer c on c.id = i.customer_id
   where i.status in ('posted', 'partially_paid', 'paid')
   group by 1, 2, 3
),
ret as (
  select b.company_id,
         coalesce(so.salesperson_id, c.salesperson_id) as salesperson_id,
         date_trunc('month', cn.issued_at)::date       as period_start,
         count(*)             as return_count,
         sum(cn.amount)       as return_amount
    from credit_note cn
    join branch b on b.id = cn.branch_id
    left join invoice i on i.id = cn.invoice_id
    left join sales_order so on so.id = i.sales_order_id
    left join customer c on c.id = cn.customer_id
   where cn.status = 'posted'
   group by 1, 2, 3
),
rcpt as (
  select b.company_id,
         pr.collected_by     as salesperson_id,
         date_trunc('month', pr.receipt_date)::date as period_start,
         count(*)             as receipt_count,
         sum(pr.amount)       as collected_amount
    from payment_receipt pr
    join branch b on b.id = pr.branch_id
   where pr.collected_by is not null
     and pr.status in ('posted', 'partially_allocated', 'allocated')
   group by 1, 2, 3
),
vst as (
  select b.company_id,
         t.salesperson_id,
         date_trunc('month', t.tour_date)::date as period_start,
         count(*)                                            as tour_count,
         count(v.id)                                         as visit_count,
         count(v.id) filter (where v.result = 'order')       as ordered_visit_count
    from tour t
    join branch b on b.id = t.branch_id
    left join visit v on v.tour_id = t.id
   group by 1, 2, 3
),
grain as (
  select company_id, salesperson_id, period_start from ord
  union select company_id, salesperson_id, period_start from inv
  union select company_id, salesperson_id, period_start from ret
  union select company_id, salesperson_id, period_start from rcpt
  union select company_id, salesperson_id, period_start from vst
)
select g.company_id,
       g.salesperson_id,
       s.branch_id,
       b.code                                     as branch_code,
       coalesce(nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''),
                s.employee_no, g.salesperson_id::text) as salesperson_name,
       g.period_start,
       (extract(year from g.period_start))::smallint as calendar_year,
       to_char(g.period_start, 'YYYY-MM')         as period_label,
       coalesce(ord.order_count, 0)               as order_count,
       coalesce(ord.order_amount, 0)              as order_amount,
       coalesce(ord.discount_amount, 0)           as discount_amount,
       coalesce(inv.invoice_count, 0)             as invoice_count,
       coalesce(inv.invoiced_amount, 0)           as invoiced_amount,
       coalesce(ret.return_count, 0)              as return_count,
       coalesce(ret.return_amount, 0)             as return_amount,
       coalesce(inv.invoiced_amount, 0) - coalesce(ret.return_amount, 0) as net_sales,
       coalesce(rcpt.receipt_count, 0)            as receipt_count,
       coalesce(rcpt.collected_amount, 0)         as collected_amount,
       coalesce(vst.tour_count, 0)                as tour_count,
       coalesce(vst.visit_count, 0)               as visit_count,
       coalesce(vst.ordered_visit_count, 0)       as ordered_visit_count,
       case when coalesce(vst.visit_count, 0) = 0 then null
            else round(vst.ordered_visit_count::numeric / vst.visit_count * 100, 2)
       end                                        as visit_conversion_pct
  from grain g
  join staff s on s.id = g.salesperson_id
  join branch b on b.id = s.branch_id
  left join person p on p.id = s.person_id
  left join ord  on ord.company_id  = g.company_id
                and ord.salesperson_id  = g.salesperson_id
                and ord.period_start    = g.period_start
  left join inv  on inv.company_id  = g.company_id
                and inv.salesperson_id  = g.salesperson_id
                and inv.period_start    = g.period_start
  left join ret  on ret.company_id  = g.company_id
                and ret.salesperson_id  = g.salesperson_id
                and ret.period_start    = g.period_start
  left join rcpt on rcpt.company_id = g.company_id
                and rcpt.salesperson_id = g.salesperson_id
                and rcpt.period_start   = g.period_start
  left join vst  on vst.company_id  = g.company_id
                and vst.salesperson_id  = g.salesperson_id
                and vst.period_start    = g.period_start
 where g.salesperson_id is not null;

create unique index uq_mv_salesperson_perf
  on mv_salesperson_performance (company_id, salesperson_id, period_start);
create index ix_mv_salesperson_perf_period
  on mv_salesperson_performance (company_id, period_start desc);

comment on materialized view mv_salesperson_performance is
  'عملکرد ماهانهٔ هر ویزیتور: سفارش، فاکتور، برگشت، وصولی، تور و بازدید.';

-- ====================================================================
-- ۵) مجوز ثبت موقعیت توسط دستگاه میدانی
--    POST /tracking/ping پیش‌تر tracking.update را می‌خواست که در فهرست مجوزها
--    وجود نداشت (0022:118-123) ⇒ 403 برای همهٔ نقش‌ها. اینجا مجوز درست تعریف و
--    به نقش‌های میدانی داده می‌شود. مدیران فروش و سرپرستان با الگوی tracking.*
--    (0022:242,252) آن را می‌گیرند، اما چون 0022 پیش از این مجوز اجرا شده،
--    صریحاً برای آن‌ها هم درج می‌شود.
-- ====================================================================

insert into permission (code, module, title) values
  ('tracking.location.report', 'tracking', 'ثبت موقعیت لحظه‌ای از دستگاه میدانی')
on conflict (code) do update
  set module = excluded.module,
      title = excluded.title;

insert into role_permission (role_id, permission_code)
select r.id, 'tracking.location.report'
  from role r
 where r.code in ('salesperson_cold', 'salesperson_warm', 'courier',
                  'sales_manager', 'supervisor')
on conflict do nothing;
