-- TASK-PM-01D-M4-G — F-R-01: حذفِ رقابتِ TOCTOU در بازگردانی ۰۰۶۲.
--
-- پیش از F این فایل بیقیدوشرط drop table میکرد؛ F نگهبان «خالیبودن» افزود، ولی
-- بازبینی مستقل F-R ثابت کرد نگهبان بدونِ قفل، یک EXISTS ساده در READ COMMITTED
-- است: تراکنشِ نوشتن میتواند بعد از نگهبان و پیش از DDLِ مخرب commit کند و دفتر
-- پرشده خاموش حذف شود. این نسخه «قفل، سپس نگهبان» است.
--
-- ترتیبِ سراسریِ یکسانِ قفلگیری (همین ترتیب در 0063.down.sql هم رعایت شده و با
-- ترتیبِ نوشتنِ مسیر M4 سازگار است تا بنبست نسازد):
--   ۱) product_bulk_operation  ۲) product_catalog_history
--   ۳) product_bulk_history_event  ۴) audit_log
--
-- ACCESS EXCLUSIVE با RowExclusiveLockِ INSERT/UPDATE ناسازگار است؛ بنابراین
-- LOCK منتظرِ نویسندههای درحالاجرا میماند، نویسندهٔ تازهای نمیتواند وارد شود و
-- نگهبان «وضعیت نهاییِ commitشده» را میبیند. هیچ فرضِ زمانی، pg_sleep، قلاب
-- تست یا رفتار ویژهٔ production در SQLِ مهاجرت وجود ندارد. تمام فایل در همان
-- تراکنشِ migrate.mjs / test-migrations.mjs اجرا میشود.
--
-- اپراتور (تنها با تأیید صریح مالک و خارج از این مخزن):
--   ۱) بایگانی قابل بازیابی از product_bulk_operation و شواهد ۰۰۶۳ تهیه کند؛
--   ۲) ردیفهای قطعی/نامشخص را با مرور دوعامل بررسی و تصمیم را مستند کند؛
--   ۳) تنها پس از خالیشدن کامل دفتر، npm run db:rollback را اجرا کند.
-- چرخهٔ خالی (fresh up/down/up) بدون دخالت اپراتور مجاز است.

-- ---------------------------------------------------------------------------
-- ۰) قفلگیری پیش از هر بررسیِ داده (F-R-01)
-- ---------------------------------------------------------------------------
do $$
declare
  v_rel  text;
  v_rels text[] := array[
    'product_bulk_operation',
    'product_catalog_history',
    'product_bulk_history_event',
    'audit_log'
  ];
begin
  foreach v_rel in array v_rels loop
    if to_regclass(format('public.%I', v_rel)) is not null then
      execute format('lock table public.%I in access exclusive mode', v_rel);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- ۱) نگهبانِ fail-closed، اکنون پس از قفل
-- ---------------------------------------------------------------------------
-- دفتر عملیات، و (اگر ۰۰۶۳ هنوز برگردانده نشده باشد) شواهد/همبستگیهای همان
-- عملیات. بررسیِ شرطی با to_regclass/pg_attribute اجرای مستقیم و جداگانهٔ
-- 0062.down را هم ایمن نگه میدارد.
do $$
begin
  if to_regclass('public.product_bulk_operation') is not null then
    if exists (select 1 from product_bulk_operation) then
      raise exception
        'بازگردانی ۰۰۶۲ روی دفتر عملیات پرشده مجاز نیست؛ شامل عملیاتهای committed، unknown، rejected و rolled_back میشود. نخست با تأیید مالک بایگانی قابل بازیابی تهیه و تصمیم اپراتور مستند شود، سپس دفتر خالی گردد. هیچ مقصد بایگانی خارجی یا حذف خودکار در کد فرض نشده است.'
        using errcode = 'integrity_constraint_violation';
    end if;
  end if;

  if to_regclass('public.product_bulk_history_event') is not null then
    if exists (select 1 from product_bulk_history_event) then
      raise exception
        'بازگردانی ۰۰۶۲ روی پایگاهدادهای دارای شاهد operation-bound مجاز نیست؛ نخست ۰۰۶۳ را برگردانید یا با تأیید مالک بایگانی قابل بازیابی تهیه کنید.'
        using errcode = 'integrity_constraint_violation';
    end if;
  end if;

  if exists (
    select 1 from pg_attribute
    where attrelid = 'public.product_catalog_history'::regclass
      and attname = 'bulk_operation_id' and not attisdropped
  ) then
    if exists (select 1 from product_catalog_history where bulk_operation_id is not null) then
      raise exception
        'بازگردانی ۰۰۶۲ روی تاریخچهای دارای همبستگی M4 مجاز نیست؛ نخست بایگانی قابل بازیابی با تأیید مالک تهیه کنید.'
        using errcode = 'integrity_constraint_violation';
    end if;
  end if;

  if exists (
    select 1 from pg_attribute
    where attrelid = 'public.audit_log'::regclass
      and attname = 'bulk_operation_id' and not attisdropped
  ) then
    if exists (select 1 from audit_log where bulk_operation_id is not null) then
      raise exception
        'بازگردانی ۰۰۶۲ روی ممیزیای دارای همبستگی M4 مجاز نیست؛ نخست بایگانی قابل بازیابی با تأیید مالک تهیه کنید.'
        using errcode = 'integrity_constraint_violation';
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- ۲) DDLِ مخرب، تنها پس از قفل + نگهبان
-- ---------------------------------------------------------------------------
drop policy if exists p_product_bulk_operation_tenant on product_bulk_operation;
drop table if exists product_bulk_operation;
