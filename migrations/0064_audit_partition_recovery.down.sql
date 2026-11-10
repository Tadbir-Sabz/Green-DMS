-- TASK-PM-01D-M4-G — بازگردانیِ مهاجرت ۰۰۶۴ به وضعیتِ دقیقِ پس از ۰۰۴۲.
--
-- ۰۰۶۴ تابع را SECURITY INVOKER صریح + search_path پینشده + ACL بسته کرده و
-- comment طرحوارهٔ public را تغییر داده است. CREATE OR REPLACE بهتنهایی ترتیبِ
-- proacl و comment طرحواره را دقیقاً برنمیگرداند؛ بنابراین تابع حذف و دقیقاً
-- همان بدنهٔ ۰۰۴۲ بازسازی میشود تا ACL پیشفرض (PUBLIC + مالک) و سپس گرانت
-- صریح dms_app، همراه با comment تابع/طرحواره، به همان شکل ۰۰۴۲ برگردد.
-- پارتیشنها / ردیفهای ممیزی هرگز حذف نمیشوند (DROP پارتیشن = حذف شاهد تاریخی).
-- چرخهٔ خالی up/down/up بدون دخالت اپراتور برگشتپذیر است.

drop function if exists fn_ensure_partitions(integer);

create function fn_ensure_partitions(p_months_ahead integer default 2)
returns void
language plpgsql as $$
declare
  v_tbl   text;
  v_lower date;
  v_upper date;
  v_name  text;
  v_months integer;
  v_using text;
  v_check text;
begin
  for v_tbl in
       select unnest(array['location_sample', 'audit_log', 'inventory_txn'])
  loop
    v_months := -1;                      -- ماه جاری
    while v_months <= p_months_ahead loop
      v_lower := (date_trunc('month', current_date) + make_interval(months => v_months))::date;
      v_upper := (v_lower + interval '1 month')::date;
      v_name  := v_tbl || '_' || to_char(v_lower, 'YYYY_MM');
      if not exists (
        select 1
          from pg_inherits i
          join pg_class c on c.oid = i.inhrelid
         where i.inhparent = v_tbl::regclass
           and c.relname = v_name
      ) then
        execute format('create table %I partition of %I for values from (%L) to (%L)',
                       v_name, v_tbl, v_lower, v_upper);
        -- سخت‌سازیِ اجاره‌ایِ همان پارتیشنِ تازه (0042): بدونِ این، دسترسیِ مستقیم به
        -- پارتیشن سیاستِ والد را دور می‌زد.
        v_using := case v_tbl
                     when 'audit_log'       then 'company_id is null or company_id = fn_current_company_id()'
                     when 'inventory_txn'   then 'branch_id in (select id from branch where branch.company_id = fn_current_company_id())'
                     when 'location_sample' then 'exists (select 1 from staff s where s.id = staff_id)'
                   end;
        v_check := v_using;
        if v_using is not null then
          execute format('alter table %I enable row level security', v_name);
          execute format('alter table %I force row level security', v_name);
          execute format('drop policy if exists p_%s_tenant on %I', v_tbl, v_name);
          execute format('create policy p_%s_tenant on %I for all using (%s) with check (%s)',
                         v_tbl, v_name, v_using, v_check);
        end if;
      end if;
      v_months := v_months + 1;
    end loop;
  end loop;
end $$;

comment on function fn_ensure_partitions(integer) is
  'ساختِ پارتیشنِ ماهانهٔ سه جدولِ پرحجم + فعال‌سازیِ RLS و سیاستِ اجارهٔ والد رویِ هر پارتیشنِ تازه (0042)';

-- ۰۰۴۱ «grant execute on all functions ... to dms_app» داده بود؛ PUBLIC و مالک
-- با ساختهشدن دوبارهٔ تابع بهصورت پیشفرض برمیگردند. ترتیبِ دقیقِ proacl و
-- commentهای تابع/طرحواره با وضعیت پس از ۰۰۴۲ یکسان است (آزمون کاتالوگ).
grant execute on function fn_ensure_partitions(integer) to dms_app;
comment on schema public is 'standard public schema';
