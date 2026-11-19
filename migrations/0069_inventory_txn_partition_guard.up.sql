-- 0069 — محافظت خودکارِ پارتیشن‌های آیندهٔ دفتر موجودی (inventory_txn)
--
-- مشکل (باقی‌مانده از 0068): تریگرِ جمله‌ایِ TRUNCATE به پارتیشن‌ها منتقل نمی‌شود و 0068
-- فقط پارتیشن‌های موجودِ لحظهٔ اجرا را محافظت کرده بود. تنها مسیرِ ساختِ پارتیشنِ ماهانه
-- fn_ensure_partitions است (0019 → 0042 → 0064). نسخهٔ 0064 هم به dms_app دوباره
-- UPDATE/DELETE روی پارتیشنِ تازه می‌دهد.
--
-- راه‌حل (افزودنی و برگشت‌پذیر، بدون تغییر در ردیف‌ها، RLS یا مالکیت):
--   ۱) fn_inventory_txn_protect_partition(regclass): تریگرهای سطری و TRUNCATE را روی یک
--      پارتیشن می‌گذارد (اگر نباشند) و UPDATE/DELETE/TRUNCATE را از dms_app پس می‌گیرد.
--   ۲) fn_ensure_partitions: برای هر پارتیشن تازهٔ inventory_txn همان لحظه تابع (۱) را
--      صدا می‌زند و در هر اجرا همهٔ پارتیشن‌های موجود را همگام می‌کند (idempotent).
--   ۳) در همین مهاجرت، همهٔ پارتیشن‌های موجودی که هنوز محافظت ندارند ترمیم می‌شوند.
-- پنجرهٔ نگه‌داشتِ مالک (fn_inventory_txn_maintenance_begin) دست‌نخورده است و روی پارتیشن‌های
-- تازه هم کار می‌کند؛ TRUNCATE مستقیمِ مالک بیرون از پنجره رد می‌شود.
-- بدون مالکیتِ پیش‌فرض، EXECUTE روی تابع‌های جدید از PUBLIC و dms_app پس گرفته می‌شود.

-- ---------------------------------------------------------------------------
-- ۱) تابع محافظت یک پارتیشن (idempotent)
-- ---------------------------------------------------------------------------
create or replace function fn_inventory_txn_protect_partition(p_part regclass)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from pg_trigger
     where tgrelid = p_part and tgname = 'trg_inventory_txn_append_only'
  ) then
    execute format(
      'create trigger trg_inventory_txn_append_only before update or delete on %s '
      'for each row execute function fn_inventory_txn_guard()', p_part);
  end if;

  if not exists (
    select 1 from pg_trigger
     where tgrelid = p_part and tgname = 'trg_inventory_txn_no_truncate'
  ) then
    execute format(
      'create trigger trg_inventory_txn_no_truncate before truncate on %s '
      'for each statement execute function fn_inventory_txn_guard()', p_part);
  end if;

  if exists (select 1 from pg_roles where rolname = 'dms_app') then
    execute format('revoke update, delete, truncate on %s from dms_app', p_part);
  end if;
end $$;

comment on function fn_inventory_txn_protect_partition(regclass) is
  'محافظت از یک پارتیشن دفتر موجودی: تریگرهای append-only و no-truncate + گرانت‌زدایی از dms_app (idempotent).';

revoke all on function fn_inventory_txn_protect_partition(regclass) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'dms_app') then
    execute 'revoke all on function fn_inventory_txn_protect_partition(regclass) from dms_app';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- ۲) بازتعریف fn_ensure_partitions (بدنهٔ 0064 + محافظت خودکار دفتر)
-- ---------------------------------------------------------------------------
-- 0064 مالک (هویت مهاجرت) را از EXECUTE این تابع محروم کرده و ACL آن را خالی گذاشته است.
-- در PG16، CREATE OR REPLACE روی تابعِ با ACL خالی با 42501 شکست می‌خورد (تأییدشده روی
-- PG 16.2 با نقش‌های LOGIN واقعی). پس فقط برای همین جایگزینی، EXECUTE به هویت مالکِ
-- فعلی داده می‌شود و بلافاصله پس از تعریف، گرفته می‌شود تا وضعیت نهایی همان 0064 بماند
-- (dms_migrator/dms_app/dms_readonly/dms_owner فاقد EXECUTE؛ PUBLIC فاقد EXECUTE).
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

revoke all on function fn_ensure_partitions(integer) from current_user;
revoke all on function fn_ensure_partitions(integer) from public;

-- ---------------------------------------------------------------------------
-- ۳) ترمیمِ پارتیشن‌های موجودی که پیش از این مهاجرت ساخته شده‌اند
-- ---------------------------------------------------------------------------
do $$
declare
  v_part regclass;
begin
  for v_part in
       select i.inhrelid::regclass
         from pg_inherits i
        where i.inhparent = 'public.inventory_txn'::regclass
  loop
    perform fn_inventory_txn_protect_partition(v_part);
  end loop;
end $$;
