-- 0070 down — بازگردانیِ مالکیت و تعریفِ توابعِ 0068/0069 (برگشت‌پذیر)
-- هشدار: ALTER … OWNER قفلِ ACCESS EXCLUSIVE می‌گیرد.
-- محدودیت (یافته، بدونِ مسیر پنهان): بازگردانیِ مالکیت از dms_owner به هویتِ مهاجرت نیازمندِ
-- سوپرکاربر است، زیرا PostgreSQL برای ALTER … OWNER TO X باید بتوان «به‌عنوانِ مالک فعلی» به X
-- SET ROLE کرد و dms_owner هرگز نمی‌تواند به dms_migrator SET کند (و نباید بتواند).
-- اجرای غیرسوپرکاربر این فایل پیش از هر تغییری با خطا متوقف می‌شود (fail-closed).
do $$
begin
  if not coalesce((select rolsuper from pg_roles where rolname = current_user), false) then
    raise exception 'رجوعِ 0070 فقط با سوپرکاربر (یا اجرای عملیاتیِ مستندشده) انجام می‌شود؛ هیچ تغییری اعمال نشد.'
      using errcode = 'insufficient_privilege';
  end if;
end $$;
-- مالکِ مقصد: هویتی که جدول schema_migrations را ساخته (یعنی هویتِ اعمال‌کنندهٔ مهاجرت‌ها).
create temp table _0070_restore_target on commit drop as
  select coalesce(
           (select pg_get_userbyid(c.relowner) from pg_class c where c.oid = 'public.schema_migrations'::regclass),
           session_user::text) as owner_name;

do $$
declare v_owner text := (select owner_name from _0070_restore_target);
begin
  execute format('alter table public.inventory_txn owner to %I', v_owner);
  execute format('alter function public.fn_inventory_txn_guard() owner to %I', v_owner);
  execute format('alter function public.fn_inventory_txn_maintenance_begin(text, uuid) owner to %I', v_owner);
  execute format('alter function public.fn_inventory_txn_protect_partition(regclass) owner to %I', v_owner);
end $$;


create or replace function fn_inventory_txn_guard() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_owner name;
begin
  select pg_get_userbyid(c.relowner) into v_owner
    from pg_class c
   where c.oid = 'public.inventory_txn'::regclass;

  if coalesce(current_setting('dms.inventory_txn_maintenance', true), '') = 'on'
     and current_user::text = v_owner::text then
    if tg_op = 'DELETE' then return old; end if;
    if tg_op = 'UPDATE' then return new; end if;
    return null;  -- TRUNCATE (جمله‌ای): اجازه داده می‌شود
  end if;

  raise exception 'inventory_txn یک دفتر فقط‌افزودنی است؛ % مجاز نیست (مسیر ممیزی‌شدهٔ fn_inventory_txn_maintenance_begin را ببینید).', tg_op
    using errcode = 'insufficient_privilege';
end $$;

create or replace function fn_inventory_txn_maintenance_begin(
  p_reason text,
  p_actor  uuid default null
) returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_owner name;
begin
  select pg_get_userbyid(c.relowner) into v_owner
    from pg_class c
   where c.oid = 'public.inventory_txn'::regclass;

  if current_user::text <> v_owner::text then
    raise exception 'فقط مالک inventory_txn می‌تواند پنجرهٔ نگه‌داشت باز کند.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_reason is null or char_length(btrim(p_reason)) < 10 then
    raise exception 'دلیل نگه‌داشت باید حداقل ۱۰ نویسه باشد.'
      using errcode = 'check_violation';
  end if;

  -- تراکنش‌محلی: با COMMIT/ROLLBACK پایان می‌یابد و به نشست‌های دیگر نشت نمی‌کند.
  perform set_config('dms.inventory_txn_maintenance', 'on', true);

  insert into audit_log (company_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (null, p_actor, 'ledger_maintenance_begin', 'inventory_txn', null,
          jsonb_build_object('reason', btrim(p_reason), 'db_user', current_user::text));
end $$;

create or replace function fn_ensure_partitions(p_months_ahead integer default 2)
returns void
language plpgsql
security invoker
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_tbl    text;
  v_lower  date;
  v_upper  date;
  v_name   text;
  v_months integer;
  v_using  text;
  v_check  text;
  v_owner  oid;
  v_ok     boolean;
  v_part   regclass;
begin
  -- مرز اجرا: فقط مالکِ والدها (یا عضوِ نقشِ مالک / ابرکاربر) مجاز است.
  -- پیام، هویتِ پشتیبانیشده را دقیقاً نام میبرد؛ خطای مبهم «must be owner»
  -- جای خود را به خطای عملیاتی میدهد. dms_app حتی EXECUTE هم ندارد.
  foreach v_tbl in array array['audit_log', 'location_sample', 'inventory_txn'] loop
    select relowner into v_owner
      from pg_class
     where oid = format('public.%I', v_tbl)::regclass;
    if v_owner is null then
      raise exception 'جدول والد % وجود ندارد؛ بازیابی پارتیشن ممکن نیست.', v_tbl
        using errcode = 'undefined_table';
    end if;
    v_ok := coalesce((select rolsuper from pg_roles where rolname = current_user), false)
            or pg_has_role(current_user, v_owner, 'USAGE');
    if not v_ok then
      raise exception
        'بازیابی پارتیشن فقط با هویت مالک اشیاء مجاز است (همان DATABASE_URL که مهاجرتها را اعمال کرده و مالک public.% است). هویت کنونی «%» مالک نیست؛ dms_app، dms_readonly، dms_migrator و dms_owner بدون انتقال مالکیت و EXECUTE صریح مجاز نیستند. اقدام را در لاگ استقرار ثبت کنید.',
        v_tbl, current_user
        using errcode = 'insufficient_privilege';
    end if;
  end loop;

  if not has_schema_privilege(current_user, 'public', 'CREATE') then
    raise exception
      'هویت «%» فاقد CREATE روی public است؛ بازیابی پارتیشن نیازمند مالکیت والدها + CREATE/USAGE روی public است.', current_user
      using errcode = 'insufficient_privilege';
  end if;

  -- همان منطق ۰۰۴۲، بدونِ تغییر معنا: فقط پارتیشنِ «موجودنبوده» ساخته میشود،
  -- RLS اجباری و سیاست والد روی همان پارتیشن اعمال میشود. هیچ drop/update/delete
  -- روی ردیفها یا پارتیشنهای موجود انجام نمیشود ⇒ شواهد تاریخی ممیزی دستنخوردهاند.
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
        execute format('create table public.%I partition of public.%I for values from (%L) to (%L)',
                       v_name, v_tbl, v_lower, v_upper);

        -- همارزی صریح با ALTER DEFAULT PRIVILEGESـی ۰۰۴۱: اگر ترمیم توسط
        -- مالکِ دیگری (غیرآنکسی که default privileges را ست کرده) انجام شود،
        -- پارتیشن تازه بدونِ گرانتِ dms_app میماند و نوشتن ممیزی از کار میافتد.
        execute format('grant select, insert, update, delete on public.%I to dms_app', v_name);
        execute format('grant select on public.%I to dms_readonly', v_name);
        -- 0069: هر پارتیشنِ تازهٔ دفتر، همان لحظه محافظت و گرانت‌زدایی می‌شود.
        if v_tbl = 'inventory_txn' then
          perform fn_inventory_txn_protect_partition(format('public.%I', v_name)::regclass);
        end if;

        v_using := case v_tbl
                     when 'audit_log'       then 'company_id is null or company_id = fn_current_company_id()'
                     when 'inventory_txn'   then 'branch_id in (select id from branch where branch.company_id = fn_current_company_id())'
                     when 'location_sample' then 'exists (select 1 from staff s where s.id = staff_id)'
                   end;
        v_check := v_using;
        if v_using is not null then
          execute format('alter table public.%I enable row level security', v_name);
          execute format('alter table public.%I force row level security', v_name);
          execute format('drop policy if exists p_%s_tenant on public.%I', v_tbl, v_name);
          execute format('create policy p_%s_tenant on public.%I for all using (%s) with check (%s)',
                         v_tbl, v_name, v_using, v_check);
        end if;
      end if;
      v_months := v_months + 1;
    end loop;
  end loop;

  -- 0069: همگام‌سازی idempotent؛ انحراف احتمالیِ پارتیشن‌های قدیمی هم در هر اجرا ترمیم می‌شود.
  for v_part in
       select i.inhrelid::regclass
         from pg_inherits i
        where i.inhparent = 'public.inventory_txn'::regclass
  loop
    perform fn_inventory_txn_protect_partition(v_part);
  end loop;
end $$;

do $$
declare r record;
begin
  for r in select i.inhrelid::regclass as p
             from pg_inherits i
            where i.inhparent = 'public.inventory_txn'::regclass
  loop
    execute format('alter table %s owner to %I', r.p, (select owner_name from _0070_restore_target));
  end loop;
end $$;





revoke all on function fn_ensure_partitions(integer) from dms_owner;  -- وضعیت 0064


-- بازگردانیِ مسیر نگه‌داری 0070 (نقش‌ها عمداً حذف نمی‌شوند؛ آن‌ها cluster-wide‌اند)
drop function if exists fn_maintain_inventory_partitions(integer);

-- گرانت‌های 0070 لغو می‌شوند (وضعیتِ پیش از 0070).
revoke usage on schema public from dms_maintainer;
revoke usage, create on schema public from dms_owner;
revoke insert on public.audit_log from dms_owner;

-- audit_log و location_sample: بازگردانیِ UPDATE/DELETE به dms_app (وضعیتِ 0041).
do $$
declare r record;
begin
  for r in select c.oid::regclass as rel
             from pg_class c
            where c.relkind in ('r', 'p')
              and c.oid in ('public.audit_log'::regclass, 'public.location_sample'::regclass)
            union
           select i.inhrelid::regclass
             from pg_inherits i
            where i.inhparent in ('public.audit_log'::regclass, 'public.location_sample'::regclass)
  loop
    execute format('grant update, delete on %s to dms_app', r.rel);
  end loop;
end $$;
do $$
declare v_seq text;
begin
  v_seq := pg_get_serial_sequence('public.audit_log', 'id');
  if v_seq is not null then
    execute format('revoke usage on sequence %s from dms_owner', v_seq);
  end if;
end $$;
