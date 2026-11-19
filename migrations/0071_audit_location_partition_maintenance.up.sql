-- TASK-GDMS-S8-OPERATIONAL-SECURITY-CLOSURE-05 — نگه‌داری پارتیشن audit_log و location_sample
-- مدل C: بدونِ انتقالِ مالکیت. (تحلیل کامل در docs/db-privilege-architecture.md، بخش ۱۰)
--
-- چرا؟
--   * «CREATE TABLE … PARTITION OF <والد>» مالکیتِ والد را می‌خواهد. مالکِ فعلیِ
--     audit_log/location_sample هویتِ مهاجرت (dms_migrator) است و Task -04 انتقالِ آن‌ها به
--     dms_owner را بدونِ تأییدِ مالک ممنوع کرده است ⇒ این مهاجرت مالکیتِ هیچ جدولی را تغییر نمی‌دهد.
--   * مدل A (انتقال به dms_owner): رد نشد، اما تأیید مالک لازم است؛ در این گام اعمال نشده است.
--   * مدل B (گرانتِ موقتِ EXECUTE در هر پنجره): برای نگه‌داریِ زمان‌بندی‌شدهٔ ماهانه عملی نیست
--     (هر اجرا به پشتیبان و پنجره نیاز دارد) و تابعِ 0064 به‌تنهایی SECURITY INVOKER است.
--   * مدل C: دو wrapperِ SECURITY DEFINER که مالکشان همان مالکِ جدول است (دقیقاً همان سطحِ
--     امتیازی که جدول خودش دارد، نه بیشتر)، search_path پین‌شده، ورودیِ فقط عدد ۰..۱۲، نام‌ها ثابت،
--     و EXECUTE فقط برای dms_maintainer. dms_app / dms_readonly / dms_owner EXECUTE ندارند.
--     دامنهٔ کاری wrapper فقط ساختنِ پارتیشنِ ماهانه + RLS اجباری + سیاست والد + گرانت‌های
--     دفترِ ممیزی است؛ هیچ DELETE/UPDATE/TRUNCATE یا DDLِ دیگری ندارد.
--
-- این مهاجرت ردیف‌های تاریخیِ ممیزی/موقعیت را لمس نمی‌کند و هیچ مهاجرتِ اعمال‌شده‌ای را تغییر نمی‌دهد.
-- محافظتِ append-only روی audit_log/location_sample برای مالک (dms_migrator) همچنان مرزِ اعتماد است:
-- مالک می‌تواند خودش را دوباره GRANT کند؛ این در مستندات به‌عنوان محدودیت ثبت است.

-- ---------------------------------------------------------------------------
-- ۰) پیش‌شرط‌ها
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'dms_maintainer') then
    raise exception 'نقشِ dms_maintainer وجود ندارد (0070 باید پیش از این اجرا شده باشد).';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'dms_readonly') then
    raise exception 'نقشِ dms_readonly وجود ندارد (0041 باید پیش از این اجرا شده باشد).';
  end if;
  if to_regprocedure('public.fn_current_company_id()') is null then
    raise exception 'تابعِ fn_current_company_id() وجود ندارد (0041 باید پیش از این اجرا شده باشد).';
  end if;
  if to_regclass('public.audit_log') is null or to_regclass('public.location_sample') is null then
    raise exception 'audit_log یا location_sample وجود ندارد.';
  end if;
  if not (select relkind = 'p' from pg_class where oid = 'public.audit_log'::regclass)
     or not (select relkind = 'p' from pg_class where oid = 'public.location_sample'::regclass) then
    raise exception 'audit_log و location_sample باید جدولِ پارتیشن‌شده باشند.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- ۱) wrapperهای نگه‌داری (SECURITY DEFINER، مالک = مالکِ فعلیِ جدول، search_path پین‌شده)
--    ورودی فقط عدد صحیحِ ۰..۱۲؛ نام‌ها از to_char(تاریخ) ساخته می‌شوند نه از فراخواننده.
--    پارتیشنِ جداشده/موجودِ-بی-پیوند ⇒ 42P07 (fail-closed؛ هیچ DROP خودکار نیست).
-- ---------------------------------------------------------------------------
create or replace function fn_maintain_audit_partitions(p_months_ahead integer default 2)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_months integer;
  v_lower  date;
  v_upper  date;
  v_name   text;
begin
  if p_months_ahead is null or p_months_ahead < 0 or p_months_ahead > 12 then
    raise exception 'p_months_ahead باید بین ۰ و ۱۲ باشد.'
      using errcode = 'invalid_parameter_value';
  end if;

  v_months := -1;
  while v_months <= p_months_ahead loop
    v_lower := (date_trunc('month', current_date) + make_interval(months => v_months))::date;
    v_upper := (v_lower + interval '1 month')::date;
    v_name  := 'audit_log_' || to_char(v_lower, 'YYYY_MM');
    if not exists (
      select 1 from pg_inherits i join pg_class c on c.oid = i.inhrelid
       where i.inhparent = 'public.audit_log'::regclass and c.relname = v_name
    ) then
      if to_regclass(format('public.%I', v_name)) is not null then
        raise exception 'جدولی به نام % وجود دارد اما پیوست پارتیشن نیست (احتمالاً DETACH شده). آن را دستی و آگاهانه دوباره وصل یا بازنام کنید؛ wrapper آن را حذف نمی‌کند.', v_name
          using errcode = 'duplicate_table';
      end if;
      execute format('create table public.%I partition of public.audit_log for values from (%L) to (%L)',
                     v_name, v_lower, v_upper);
      -- کمینهٔ امتیاز: ممیزی فقط SELECT/INSERT برای dms_app؛ بدون UPDATE/DELETE/TRUNCATE
      execute format('grant select, insert on public.%I to dms_app', v_name);
      execute format('grant select on public.%I to dms_readonly', v_name);
      execute format('alter table public.%I enable row level security', v_name);
      execute format('alter table public.%I force row level security', v_name);
      execute format('drop policy if exists p_audit_log_tenant on public.%I', v_name);
      execute format('create policy p_audit_log_tenant on public.%I for all '
                     'using (company_id is null or company_id = fn_current_company_id()) '
                     'with check (company_id is null or company_id = fn_current_company_id())', v_name);
    end if;
    v_months := v_months + 1;
  end loop;
end $$;

create or replace function fn_maintain_location_partitions(p_months_ahead integer default 2)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_months integer;
  v_lower  date;
  v_upper  date;
  v_name   text;
begin
  if p_months_ahead is null or p_months_ahead < 0 or p_months_ahead > 12 then
    raise exception 'p_months_ahead باید بین ۰ و ۱۲ باشد.'
      using errcode = 'invalid_parameter_value';
  end if;

  v_months := -1;
  while v_months <= p_months_ahead loop
    v_lower := (date_trunc('month', current_date) + make_interval(months => v_months))::date;
    v_upper := (v_lower + interval '1 month')::date;
    v_name  := 'location_sample_' || to_char(v_lower, 'YYYY_MM');
    if not exists (
      select 1 from pg_inherits i join pg_class c on c.oid = i.inhrelid
       where i.inhparent = 'public.location_sample'::regclass and c.relname = v_name
    ) then
      if to_regclass(format('public.%I', v_name)) is not null then
        raise exception 'جدولی به نام % وجود دارد اما پیوست پارتیشن نیست (احتمالاً DETACH شده). آن را دستی و آگاهانه دوباره وصل یا بازنام کنید؛ wrapper آن را حذف نمی‌کند.', v_name
          using errcode = 'duplicate_table';
      end if;
      execute format('create table public.%I partition of public.location_sample for values from (%L) to (%L)',
                     v_name, v_lower, v_upper);
      execute format('grant select, insert on public.%I to dms_app', v_name);
      execute format('grant select on public.%I to dms_readonly', v_name);
      execute format('alter table public.%I enable row level security', v_name);
      execute format('alter table public.%I force row level security', v_name);
      execute format('drop policy if exists p_location_sample_tenant on public.%I', v_name);
      execute format('create policy p_location_sample_tenant on public.%I for all '
                     'using (exists (select 1 from public.staff s where s.id = staff_id)) '
                     'with check (exists (select 1 from public.staff s where s.id = staff_id))', v_name);
    end if;
    v_months := v_months + 1;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- ۲) مالکیت و EXECUTE
--    مالکِ wrapper باید همان مالکِ والد باشد (تا تعریفِ «سطحِ امتیازِ برابرِ جدول» برقرار بماند).
--    EXECUTE فقط برای dms_maintainer؛ PUBLIC و نقش‌های دیگر بسته‌اند.
-- ---------------------------------------------------------------------------
do $$
declare
  v_bad text;
begin
  select string_agg(p.proname || ' owner=' || pg_get_userbyid(p.proowner)
                    || ' ≠ table owner=' || pg_get_userbyid(c.relowner), ', ')
    into v_bad
    from (values ('fn_maintain_audit_partitions', 'public.audit_log'),
                 ('fn_maintain_location_partitions', 'public.location_sample')) as w(fn, tbl)
    join pg_proc p on p.proname = w.fn and p.pronamespace = 'public'::regnamespace
    join pg_class c on c.oid = w.tbl::regclass
   where p.proowner <> c.relowner;
  if v_bad is not null then
    raise exception 'مالکِ wrapper با مالکِ جدول یکی نیست: %', v_bad;
  end if;
end $$;

revoke all on function fn_maintain_audit_partitions(integer) from public, dms_app, dms_readonly, dms_owner;
revoke all on function fn_maintain_location_partitions(integer) from public, dms_app, dms_readonly, dms_owner;
grant execute on function fn_maintain_audit_partitions(integer) to dms_maintainer;
grant execute on function fn_maintain_location_partitions(integer) to dms_maintainer;

comment on function fn_maintain_audit_partitions(integer) is
  'S8-05: ساختِ پارتیشن ماهانهٔ audit_log (مالک = مالکِ جدول)؛ ورودی ۰..۱۲؛ RLS اجباری؛ فقط dms_maintainer EXECUTE دارد.';
comment on function fn_maintain_location_partitions(integer) is
  'S8-05: ساختِ پارتیشن ماهانهٔ location_sample (مالک = مالکِ جدول)؛ ورودی ۰..۱۲؛ RLS اجباری؛ فقط dms_maintainer EXECUTE دارد.';
