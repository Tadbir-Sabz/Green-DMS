-- بازگشت 0072 (S8-06). فقط سوپرکاربر؛ برای هر هویتِ دیگر fail-closed با 42501.
-- بدنه‌های 0070 (fn_maintain_inventory_partitions) و 0071 (دو wrapper) را دقیقاً بازمی‌گرداند
-- (از همان فایل‌های منجمدِ اعمال‌شده استخراج شده‌اند؛ هیچ بازنویسیِ دستی ندارند).
-- گرانت‌های صریحِ جدید بر schema_migrations برداشته نمی‌شوند (کاهشِ امتیاز، عمداً دائمی).
-- پارتیشن‌ها حذف نمی‌شوند.

do $$
begin
  if not coalesce((select rolsuper from pg_roles where rolname = current_user), false) then
    raise exception 'بازگشت 0072 فقط با سوپرکاربر مجاز است؛ هویت «%» مجاز نیست.', current_user
      using errcode = 'insufficient_privilege';
  end if;
end $$;

-- ---- بازگردانی بدنهٔ 0070 (از 0070.up.sql خطوط 327-396) ----
set local role dms_owner;

create or replace function fn_maintain_inventory_partitions(p_months_ahead integer default 2)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_lower   date;
  v_upper   date;
  v_name    text;
  v_months  integer;
  v_part    regclass;
  -- همان سیاستِ مستأجر که fn_ensure_partitions برای inventory_txn می‌سازد (کاملاً واجد طرحواره)
  v_using   constant text := 'branch_id in (select b.id from public.branch b where b.company_id = public.fn_current_company_id())';
begin
  if p_months_ahead is null or p_months_ahead < 0 or p_months_ahead > 12 then
    raise exception 'p_months_ahead باید بین ۰ و ۱۲ باشد.'
      using errcode = 'invalid_parameter_value';
  end if;

  -- محدوده فقط inventory_txn است؛ هیچ نام جدول یا SQLِ ورودیِ کاربر در متن اجرایی نمی‌آید.
  v_months := -1;
  while v_months <= p_months_ahead loop
    v_lower := (date_trunc('month', current_date) + make_interval(months => v_months))::date;
    v_upper := (v_lower + interval '1 month')::date;
    v_name  := 'inventory_txn_' || to_char(v_lower, 'YYYY_MM');
    if not exists (
      select 1
        from pg_inherits i
        join pg_class c on c.oid = i.inhrelid
       where i.inhparent = 'public.inventory_txn'::regclass
         and c.relname = v_name
    ) then
      -- DETACH شده‌ها هرگز حذف یا بازسازی نمی‌شوند (F2)
      if to_regclass(format('public.%I', v_name)) is not null then
        raise exception 'جدولی به نام % وجود دارد اما پیوست پارتیشن نیست (احتمالاً DETACH شده). آن را دستی و آگاهانه دوباره وصل کنید؛ هیچ حذف یا بازسازی خودکاری انجام نمی‌شود.', v_name
          using errcode = 'duplicate_table';
      end if;
      execute format('create table public.%I partition of public.inventory_txn for values from (%L) to (%L)',
                     v_name, v_lower, v_upper);
      execute format('grant select, insert, update, delete on public.%I to dms_app', v_name);
      execute format('grant select on public.%I to dms_readonly', v_name);
      execute format('alter table public.%I enable row level security', v_name);
      execute format('alter table public.%I force row level security', v_name);
      execute format('drop policy if exists p_inventory_txn_tenant on public.%I', v_name);
      execute format('create policy p_inventory_txn_tenant on public.%I for all using (%s) with check (%s)',
                     v_name, v_using, v_using);
    end if;
    v_months := v_months + 1;
  end loop;

  -- همگام‌سازیِ idempotent محافظت برای همهٔ پارتیشن‌های دفتر (قدیمی و تازه)
  for v_part in
       select i.inhrelid::regclass
         from pg_inherits i
        where i.inhparent = 'public.inventory_txn'::regclass
  loop
    perform fn_inventory_txn_protect_partition(v_part);
  end loop;
end $$;

-- fn_ensure_partitions عمداً به dms_owner منتقل نمی‌شود: ALTER … OWNER ACL قبلی (که 0064 از
-- dms_owner گرفته بود) را به مالکِ جدید منتقل می‌کند و EXECUTE را دوباره به dms_owner می‌دهد.
-- wrapper به آن وابسته نیست، پس تغییرِ مالکیتِ آن لازم نیست.
revoke all on function fn_maintain_inventory_partitions(integer) from public;
grant execute on function fn_maintain_inventory_partitions(integer) to dms_maintainer;

reset role;

-- ---- بازگردانی بدنه‌های 0071 (از 0071.up.sql خطوط 49-165) ----
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

revoke all on function fn_maintain_audit_partitions(integer) from public, dms_app, dms_readonly, dms_owner;
revoke all on function fn_maintain_location_partitions(integer) from public, dms_app, dms_readonly, dms_owner;
grant execute on function fn_maintain_audit_partitions(integer) to dms_maintainer;
grant execute on function fn_maintain_location_partitions(integer) to dms_maintainer;
