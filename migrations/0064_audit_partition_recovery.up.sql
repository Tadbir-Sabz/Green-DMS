-- TASK-PM-01D-M4-G — F-R-02: معماریِ واقعیِ بازیابیِ پارتیشن ممیزی.
--
-- یافتهٔ بازبینی مستقل F-R-02: پیامِ AuditPartitionMissingError و
-- docs/db-privilege-architecture.md «نقش مهاجرت/تعمیرات» را برای اجرای
-- fn_ensure_partitions(2) معرفی میکردند، درحالیکه روی DB تازهٔ واقعی:
--   * مالکِ public.audit_log و سایر اشیاء = هویتی است که مهاجرتها را اعمال
--     کرده است (DATABASE_URL؛ در CI/compose یک ابرکاربر/مالک)، نه dms_owner؛
--   * dms_migrator فقط USAGE+CREATE روی public دارد، عضوِ dms_owner نیست و
--     مالک هیچ شیئی نیست ⇒ «must be owner of table audit_log»؛
--   * dms_owner هیچ CREATEـی روی public ندارد ⇒ «permission denied for schema public»؛
--   * dms_app و dms_readonly اساساً نباید بتوانند تابع نگهداشت را صدا بزنند؛
--   * fn_ensure_partitions از ۰۰۱۹/۰۰۴۲ SECURITY INVOKER و بدونِ search_path پینشده
--     بود و ۰۰۴۱ به dms_app روی «همهٔ توابع public» EXECUTE داده بود.
--
-- مدلِ PostgreSQL: «create table ... partition of <والد>» نیازمندِ مالکیتِ والد
-- (یا عضویت در نقشِ مالک) و CREATE روی public است. بنابراین کمینهامتیازترین
-- هویتِ قادربهترمیم، «مالک اشیاء» است؛ نمیشود آن را بدونِ انتقالِ مالکیت یا
-- SECURITY DEFINER به dms_app/dms_migrator سپرد. هر دو گزینهٔ دوم خارج از
-- مجوز این کارند (تصعید امتیاز / تغییر مالکیت production)، پس حقیقت مستند و
-- مرز اجرا در خودِ تابع اعمال میشود.
--
-- این مهاجرت صرفاً افزودنی/بازگشتپذیر است: هیچ نقش/رمز/مالکیت productionـی
-- تغییر نمیکند، SECURITY DEFINER تازهای اضافه نمیشود، هیچ ردیف تاریخی ممیزی
-- خوانده/نوشته/حذف نمیشود و RLS هیچ پارتیشنی خاموش نمیشود.
--
-- هویتِ مجازِ نگهداشت (تعریف صریح):
--   * نام/نقش: همان هویتِ DATABASE_URL که مهاجرتها را اعمال کرده و مالکِ
--     public.audit_log / location_sample / inventory_txn است؛ یا نقشی که
--     مالکیتِ والدها بهصورت خارج از مخزن به آن منتقل و EXECUTE صریح گرفته باشد.
--   * امتیاز: مالکیت والدها + CREATE/USAGE روی public؛ نه dms_app، نه
--     dms_readonly، و نه dms_migrator/dms_owner مگر مالک شده باشند.
--   * مالکیتِ تابع: همان مالک اشیاء؛ SECURITY INVOKER؛
--     search_path = public, pg_catalog, pg_temp (پینشده).
--   * مرز اجرا: EXECUTE از PUBLIC/dms_app/dms_readonly/dms_migrator/dms_owner
--     گرفته میشود؛ فقط مالک (و ابرکاربر) EXECUTE دارند. هیچ مسیر APIـی به آن
--     وصل نیست و dms_app هرگز DDL/پارتیشن نمیسازد.
--   * حسابرسی: اجرا دستی، خارج از برنامه، با ثبت لاگ استقرار و بررسی پارتیشن؛
--     تابع بایدار است (if not exists + drop/create policy) و تکرار آن امن است.

-- ---------------------------------------------------------------------------
-- ۱) تابعِ نگهداشت: invoker، search_path پینشده، پیششرطِ مالکیت، گرانت صریح
-- ---------------------------------------------------------------------------
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
end $$;

comment on function fn_ensure_partitions(integer) is
  'TASK-PM-01D-M4-G: ساختِ بایدارِ پارتیشنِ ماهانهٔ سه جدول پرحجم فقط با هویت مالک اشیاء (DATABASE_URL)، همراه با RLS اجباری/سیاست والد و گرانتهای صریح؛ SECURITY INVOKER، search_path پینشده، بدون لمس ردیفهای تاریخی. dms_app فاقد EXECUTE/DDL است.';

-- ---------------------------------------------------------------------------
-- ۲) کمینهامتیازی: EXECUTE تابعِ نگهداشت از نقشهای زمان اجرا/گزارشگیری و PUBLIC
-- ---------------------------------------------------------------------------
-- ۰۰۴۱ صریحاً «grant execute on all functions in schema public to dms_app» داده
-- بود؛ CREATE FUNCTION هم به PUBLIC پیشفرض EXECUTE میدهد. هر دو اینجا پس گرفته
-- میشوند. مالک تابع (و ابرکاربر) بهدلیل مالکیت، EXECUTE خود را حفظ میکنند.
revoke all on function fn_ensure_partitions(integer) from public;
revoke all on function fn_ensure_partitions(integer) from dms_app, dms_readonly, dms_migrator, dms_owner;

-- یادآوریِ مستند (بدونِ ساختِ نقش/رمز/عضویت تازه):
comment on schema public is
  'بازیابی پارتیشن ممیزی فقط با هویت مالک اشیاء (DATABASE_URL) و fn_ensure_partitions(2)؛ dms_app/dms_readonly/dms_migrator/dms_owner فاقد EXECUTE/DDLاند. TASK-PM-01D-M4-G.';
