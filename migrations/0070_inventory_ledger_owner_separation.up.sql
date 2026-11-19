-- 0070 — جداسازیِ مالکیتِ دفترِ موجودی از هویت‌های عملیاتی (S8 / F1)
--
-- مشکل (F1، بحرانی): مالکیتِ inventory_txn و پارتیشن‌هایش با هویتِ DATABASE_URL است.
-- مالک می‌تواند  ALTER TABLE … DISABLE TRIGGER  بزند، سپس TRUNCATE روی پارتیشن انجام
-- دهد. تریگرهای 0068/0069 فقط با «current_user = مالک» محدود شده بودند، پس هر هویتی
-- که مالک بود دور زدنِ کامل داشت.
--
-- راه‌حل (برگشت‌پذیر با 0070.down):
--   ۱) مالکِ جدول‌ها، پارتیشن‌ها و توابعِ دفتر، نقشِ NOLOGIN بی‌امتیازِ dms_owner می‌شود.
--      هیچ LOGIN ای مالکِ این اشیاء نیست؛ ALTER TABLE از هر هویتِ غیرِعضو رد می‌شود.
--   ۲) تریگرهای append-only/no-truncate و پنجرهٔ نگه‌داشت به‌جای «مالک بودن» به
--      «عضوِ dms_owner بودن» (pg_has_role … 'MEMBER') وابسته می‌شوند.
--   ۳) fn_ensure_partitions هر پارتیشنِ تازهٔ دفتر را صریحاً به dms_owner منتقل می‌کند تا
--      پارتیشنی در مالکیتِ یک هویتِ عملیاتیِ منفرد باقی نماند.
--   ۴) dms_app/dms_readonly هیچ امتیازِ جدیدی نمی‌گیرند و هرگز عضوِ dms_owner نیستند
--      (پیش‌شرطِ سخت‌گیرانه؛ در همین مهاجرت بررسی می‌شود). هویتِ مهاجرت (dms_migrator)
--      باید پیش از اجرا SET روی dms_owner داشته باشد (GRANT dms_owner TO dms_migrator
--      WITH INHERIT FALSE, SET TRUE)، زیرا PostgreSQL 16 برای ALTER … OWNER به آن نیاز دارد.
--      این گرانت استقراری است و در این مهاجرت انجام نمی‌شود.
--   ۵) dms_maintainer (LOGIN در استقرار) فقط EXECUTE روی fn_maintain_inventory_partitions دارد؛
--      این تابع SECURITY DEFINER با مالک dms_owner است و فقط پارتیشن‌های دفتر را می‌سازد.
--
-- مرز اعتماد (صادقانه): سوپرکاربر (مثلِ postgres در CI/compose) با SET ROLE dms_owner
-- همچنان می‌تواند دور بزند. این مهاجرت آن را نمی‌بندد؛ فقط مرز «مالک/عضوِ غیرِ سوپرکاربر»
-- را می‌بندد. تأییدِ این مرز فقط با LOGIN واقعی روی PostgreSQL 16 معتبر است.
--
-- هشدارِ عملیاتی: ALTER … OWNER قفلِ ACCESS EXCLUSIVE می‌گیرد؛ روی دفترِ زنده باید در
-- پنجرهٔ نگه‌داشت اجرا شود.

-- ---------------------------------------------------------------------------
-- ۰) پیش‌شرط‌ها
-- ---------------------------------------------------------------------------
do $$
declare
  v_op_role text;
begin
  if not exists (select 1 from pg_roles where rolname = 'dms_owner') then
    raise exception 'نقشِ dms_owner وجود ندارد (0041 باید پیش از این اجرا شده باشد).';
  end if;
  if (select rolcanlogin from pg_roles where rolname = 'dms_owner') then
    raise exception 'dms_owner باید NOLOGIN باشد.';
  end if;
  -- ALTER … OWNER در PostgreSQL 16 به امکانِ SET ROLE به مالکِ جدید نیاز دارد
  -- ("must be able to SET ROLE"). پس هویتِ مهاجرت باید SET روی dms_owner داشته باشد.
  if not (
       coalesce((select rolsuper from pg_roles where rolname = current_user), false)
    or pg_has_role(current_user, 'dms_owner', 'SET')
  ) then
    raise exception 'برای انتقالِ مالکیتِ دفتر، هویتِ اجراکننده باید سوپرکاربر یا داراي SET روی dms_owner باشد (GRANT dms_owner TO <migrator>).'
      using errcode = 'insufficient_privilege';
  end if;
  -- عدم‌تصعید: هیچ هویتِ عملیاتیِ زمانِ اجرا نباید عضوِ dms_owner یا قادر به SET آن باشد.
  foreach v_op_role in array array['dms_app', 'dms_readonly', 'dms_maintainer'] loop
    if exists (select 1 from pg_roles where rolname = v_op_role)
       and (pg_has_role(v_op_role, 'dms_owner', 'MEMBER')
            or pg_has_role(v_op_role, 'dms_owner', 'SET')) then
      raise exception 'نقشِ عملیاتی % نباید عضو یا قادر به SET نقشِ dms_owner باشد.', v_op_role
        using errcode = 'insufficient_privilege';
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- ۱) توابعِ دفتر: مجوز بر اساسِ عضویتِ مالک (نه تطابقِ دقیقِ نام)
-- ---------------------------------------------------------------------------
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
     and pg_has_role(current_user, v_owner, 'MEMBER') then
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

  if not pg_has_role(current_user, v_owner, 'MEMBER') then
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

-- ACL خالیِ fn_ensure_partitions (از 0064) مانع CREATE OR REPLACE در PG16 می‌شود (42501)؛
-- همان الگوی 0069: EXECUTE موقتاً به هویت مهاجرتِ فعلی داده و بلافاصله پس از تعریف گرفته می‌شود.
grant execute on function fn_ensure_partitions(integer) to current_user;

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
        -- 0070 (F2): نامِ جدولِ جداشده (DETACH) رزرو می‌ماند؛ هرگز DROP نمی‌شود.
        if to_regclass(format('public.%I', v_name)) is not null then
          raise exception 'جدولی به نام % وجود دارد اما پیوست پارتیشن نیست (احتمالاً DETACH شده). fn_ensure_partitions آن را حذف یا دوباره وصل نمی‌کند؛ پس از بررسی با ATTACH PARTITION دستی وصل کنید یا نامش را تغییر دهید.', v_name
            using errcode = 'duplicate_table';
        end if;
        execute format('create table public.%I partition of public.%I for values from (%L) to (%L)',
                       v_name, v_tbl, v_lower, v_upper);

        -- همارزی صریح با ALTER DEFAULT PRIVILEGESـی ۰۰۴۱: اگر ترمیم توسط
        -- مالکِ دیگری (غیرآنکسی که default privileges را ست کرده) انجام شود،
        -- پارتیشن تازه بدونِ گرانتِ dms_app میماند و نوشتن ممیزی از کار میافتد.
        -- 0070 (narrowest): inventory_txn فقط INSERT/SELECT (+ UPDATE/DELETE که 0069 می‌گیرد)؛
        -- audit_log و location_sample append-only برای dms_app: فقط SELECT/INSERT.
        if v_tbl = 'inventory_txn' then
          execute format('grant select, insert, update, delete on public.%I to dms_app', v_name);
        else
          execute format('grant select, insert on public.%I to dms_app', v_name);
        end if;
        execute format('grant select on public.%I to dms_readonly', v_name);
        -- 0069: هر پارتیشنِ تازهٔ دفتر، همان لحظه محافظت و گرانت‌زدایی می‌شود.
        if v_tbl = 'inventory_txn' then
          -- 0070: پارتیشنِ تازه هم مالکِ dms_owner است (نه هویتِ سازنده)
          execute format('alter table public.%I owner to dms_owner', v_name);
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


-- ---------------------------------------------------------------------------
-- ۲) انتقالِ مالکیت: جدول والد، پارتیشن‌های موجود، و توابعِ دفتر
-- ---------------------------------------------------------------------------
-- ALTER … OWNER TO dms_owner در PG16 نیازمندِ CREATE روی طرحوارهٔ هدف برای مالکِ جدید است
-- (خطای «permission denied for schema public»). پس این گرانت باید پیش از انتقال باشد.
-- USAGE صریح: ایجادِ شیء از طریقِ search_path به USAGE نیاز دارد. در PG16 این از پیش‌فرضِ
-- PUBLIC می‌آید، اما در PGlite (PG18) چنین نیست؛ گرانتِ صریح، رفتار را مستقل از پیش‌فرض می‌کند.
grant usage, create on schema public to dms_owner;

-- باز کردنِ پنجرهٔ نگه‌داشت در زمینهٔ dms_owner ردیفِ ممیزی می‌نویسد؛ فقط INSERT و
-- USAGE روی توالیِ شناسه (بدونِ UPDATE/DELETE). RLS اجباری مالک را محدود نگه می‌دارد.
grant insert on public.audit_log to dms_owner;
do $$
declare v_seq text;
begin
  v_seq := pg_get_serial_sequence('public.audit_log', 'id');
  if v_seq is not null then
    execute format('grant usage on sequence %s to dms_owner', v_seq);
  end if;
end $$;

alter table public.inventory_txn owner to dms_owner;

do $$
declare r record;
begin
  for r in select i.inhrelid::regclass as p
             from pg_inherits i
            where i.inhparent = 'public.inventory_txn'::regclass
  loop
    execute format('alter table %s owner to dms_owner', r.p);
  end loop;
end $$;

alter function fn_inventory_txn_guard() owner to dms_owner;
alter function fn_inventory_txn_maintenance_begin(text, uuid) owner to dms_owner;
alter function fn_inventory_txn_protect_partition(regclass) owner to dms_owner;

-- ---------------------------------------------------------------------------
-- ۲-ب) مسیر نگه‌داریِ پارتیشن: تابعِ SECURITY DEFINER با مالک dms_owner
--      - fn_ensure_partitions خودش SECURITY INVOKER است و بدونِ عضویتِ مالک کار نمی‌کند.
--      - تابعِ wrapper فقط یک عدد (۰..۱۲) می‌پذیرد و فقط fn_ensure_partitions را صدا
--        می‌زند؛ هیچ نام جدول/SQL ورودیِ کاربر در متن اجرایی وارد نمی‌شود.
--      - search_path ثابت است؛ EXECUTE فقط به dms_maintainer داده می‌شود.
--      - dms_maintainer عضو dms_owner نیست؛ پس نمی‌تواند تریگر غیرفعال کند یا TRUNCATE بزند.
--      - GRANT/REVOKE روی اشیاءِ متعلق به dms_owner فقط با SET LOCAL ROLE dms_owner معتبرند
--        (در غیر این صورت PUBLIC/نقش‌های قبلی بی‌صدا باقی می‌مانند).
-- ---------------------------------------------------------------------------
-- نقشِ نگه‌داری (NOLOGIN در این مهاجرت؛ ورودِ LOGIN را استقرار جداگانه می‌سازد).
-- اگر نقش از قبل وجود نداشته باشد، ساخته می‌شود (نیازمند CREATEROLE؛ مهاجرتِ غیرسوپرکاربر
-- باید آن را از پیش در مرحلهٔ bootstrap بسازد).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'dms_maintainer') then
    create role dms_maintainer nologin nosuperuser nobypassrls nocreatedb nocreaterole;
  end if;
end $$;

-- audit_log و location_sample (بدونِ انتقالِ مالکیت به dms_owner): dms_app و dms_readonly
-- UPDATE/DELETE/TRUNCATE ندارند. اپلیکیشن هیچ UPDATE/DELETE روی این دو جدول ندارد (کد و
-- اسکریپت‌های نگه‌داری بررسی شد). این REVOKE با هویت مالک (مهاجرت) اجرا می‌شود.
-- محدودیت: مالک/سوپرکاربر همچنان می‌تواند تغییر دهد (مرز اعتماد؛ به مستندات مراجعه کنید).
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
    execute format('revoke update, delete, truncate on %s from dms_app, dms_readonly', r.rel);
  end loop;
end $$;

-- این گرانت روی طرحوارهٔ public (متعلق به هویتِ مهاجرت) انجام می‌شود، پیش از SET ROLE.
grant usage on schema public to dms_maintainer;

-- این REVOKE باید با هویتِ مالک/گرانتِ فعلی (مهاجرت) اجرا شود؛ داخل SET ROLE dms_owner
-- بی‌اثر است، زیرا fn_ensure_partitions هنوز مالکِ مهاجرت است.
revoke all on function fn_ensure_partitions(integer) from current_user, public, dms_maintainer;

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

-- ---------------------------------------------------------------------------
-- ۳) بازرسیِ پایانی: هیچ پارتیشنِ دفتری نباید مالکی غیرِ dms_owner داشته باشد
-- ---------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select c.oid::regclass as rel, pg_get_userbyid(c.relowner) as owner
             from pg_class c
            where c.oid = 'public.inventory_txn'::regclass
               or c.oid in (select inhrelid from pg_inherits where inhparent = 'public.inventory_txn'::regclass)
  loop
    if r.owner <> 'dms_owner' then
      raise exception 'مالکیتِ % هنوز % است؛ انتقال کامل نشده.', r.rel, r.owner;
    end if;
  end loop;
  for r in select p.proname::text as rel, pg_get_userbyid(p.proowner) as owner
             from pg_proc p
            where p.pronamespace = 'public'::regnamespace
              and p.proname in ('fn_inventory_txn_guard', 'fn_inventory_txn_maintenance_begin',
                                'fn_inventory_txn_protect_partition', 'fn_maintain_inventory_partitions')
  loop
    if r.owner <> 'dms_owner' then
      raise exception 'مالکیتِ تابعِ % هنوز % است؛ انتقال کامل نشده.', r.rel, r.owner;
    end if;
  end loop;
end $$;
