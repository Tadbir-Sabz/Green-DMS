-- TASK-PM-01D-M4-G — F-R-01: حذفِ رقابتِ TOCTOU در بازگردانی ۰۰۶۳.
--
-- F نگهبان «وجود حتی یک شاهد/همبستگی» افزود، ولی بازبینی مستقل F-R نشان داد
-- تراکنش موازی میتواند پس از نگهبان و پیش از drop/alter، ممیزی یا شاهد
-- operation-bound درج و commit کند؛ سپس DDLِ A همان داده را خاموش حذف میکند.
-- این نسخه «قفل، سپس نگهبان» است.
--
-- ترتیبِ سراسریِ یکسانِ قفلگیری (همانِ 0062.down.sql، و سازگار با ترتیبِ قفلِ
-- مسیر نوشتن M4: دفتر ← تاریخچه ۰۰۶۰ ← شاهد ۰۰۶۳ ← ممیزی):
--   ۱) product_bulk_operation  ۲) product_catalog_history
--   ۳) product_bulk_history_event  ۴) audit_log
--
-- ACCESS EXCLUSIVE با RowExclusiveLockِ INSERT/UPDATE ناسازگار است؛ LOCK منتظرِ
-- نویسندههای درحالاجرا میماند، نویسندهٔ تازهای وارد نمیشود و نگهبان وضعیت
-- نهاییِ commitشده را میسنجد. بدونِ فرضِ زمانی، pg_sleep، قلاب تست یا رفتار
-- ویژهٔ production. جدولِ پارتیشنشدهٔ audit_log بهصورت پیشفرض همراهِ تمام
-- پارتیشنهای فرزند قفل میشود.
--
-- اگر حتی یک شاهد/همبستگی M4 وجود داشته باشد، down با پیام عملیاتی شکست میخورد
-- و تراکنش مهاجرت rollback میشود؛ هیچ ستون/جدولی حذف نمیشود تا اپراتور ناچار به
-- بایگانی قابل بازیابی با تأیید مالک شود. چرخهٔ خالی (up/down/up) همچنان مجاز است.

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
do $$
begin
  if to_regclass('public.product_bulk_operation') is not null then
    if exists (select 1 from product_bulk_operation) then
      raise exception
        'بازگردانی ۰۰۶۳ روی دفتر عملیات پرشده مجاز نیست؛ نخست با تأیید مالک بایگانی قابل بازیابی تهیه و تصمیم اپراتور مستند شود، سپس ۰۰۶۲ را برگردانید. هیچ مقصد بایگانی خارجی یا حذف خودکار در کد فرض نشده است.'
        using errcode = 'integrity_constraint_violation';
    end if;
  end if;

  if to_regclass('public.product_bulk_history_event') is not null then
    if exists (select 1 from product_bulk_history_event) then
      raise exception
        'بازگردانی ۰۰۶۳ روی پایگاهدادهای دارای شواهد نگهداشت گروهی مجاز نیست؛ نخست با تأیید مالک یک بایگانی قابل بازیابی تهیه کنید، سپس شواهد را بهصورت کنترلشده پاک کنید. هیچ مقصد بایگانی خارجی در کد فرض نشده است.'
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
        'بازگردانی ۰۰۶۳ روی تاریخچهای دارای همبستگی M4 مجاز نیست؛ نخست بایگانی قابل بازیابی با تأیید مالک تهیه کنید.'
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
        'بازگردانی ۰۰۶۳ روی ممیزی دارای همبستگی M4 مجاز نیست؛ نخست بایگانی قابل بازیابی با تأیید مالک تهیه کنید.'
        using errcode = 'integrity_constraint_violation';
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- ۲) DDLِ مخرب، تنها پس از قفل + نگهبان
-- ---------------------------------------------------------------------------
drop trigger if exists trg_product_bulk_history_evidence on product_catalog_history;
drop trigger if exists trg_product_catalog_history_bind_bulk on product_catalog_history;
drop function if exists fn_product_bulk_history_evidence();
drop function if exists fn_product_catalog_history_bind_bulk();

drop table if exists product_bulk_history_event;

drop index if exists ix_product_bulk_operation_expires;
drop index if exists ix_product_catalog_history_bulk_operation;
drop index if exists ix_audit_log_bulk_operation;

alter table product_catalog_history drop column if exists bulk_operation_id;
alter table audit_log drop column if exists bulk_operation_id;

-- بازگرداندن امتیاز پیشین ۶۰۰۲: 0041 default privileges به dms_readonly روی جدول
-- تازه SELECT داده بود و ۰۰۶۳ آن را گرفته بود.
do $$
begin
  if to_regclass('public.product_bulk_operation') is not null then
    grant select on product_bulk_operation to dms_readonly;
  end if;
end $$;
