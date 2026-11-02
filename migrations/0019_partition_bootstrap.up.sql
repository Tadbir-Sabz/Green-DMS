-- مهاجرت 0019 — ایجاد پارتیشن‌های ماهانه (زیرساخت داده‌های حجیم)
-- منبع: dms-design-report.md › ضمیمه G › G.۱۶.۲ (نسخه عملیاتی؛ مثال‌های دستی حذف شدند)
-- فاز توسعه: ۱ | اجرای این فایل پیش از هر درج در location_sample، audit_log و inventory_txn الزامی است.
--
-- نکته: مرز پارتیشن بر اساس UTC است؛ مرز روز/ماه تهران (UTC+3:30) از جمع‌بندی داده جداست
-- و فقط برای نگه‌داری/حذف پارتیشن استفاده می‌شود.

create or replace function fn_ensure_partitions(p_months_ahead integer default 2)
returns void
language plpgsql as $$
declare
  v_tbl   text;
  v_lower date;
  v_upper date;
  v_name  text;
  v_months integer;
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
      end if;
      v_months := v_months + 1;
    end loop;
  end loop;
end $$;

comment on function fn_ensure_partitions(integer) is
  'پارتیشن ماه جاری و p_months_ahead ماه آینده را برای سه جدول پارتیشن‌شده می‌سازد؛ با cron ماهانه فراخوانی شود';

select fn_ensure_partitions(2);
