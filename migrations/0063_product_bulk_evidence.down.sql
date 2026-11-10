-- TASK-PM-01D-M4-F — بازگردانی افزودنیِ شواهد، بدون حذف خاموش شواهد ثبتشده.
--
-- اگر حتی یک شاهد/همبستگی M4 وجود داشته باشد، down با پیام عملیاتی شکست میخورد و
-- تراکنش مهاجرت rollback میشود؛ هیچ ستون/جدولی حذف نمیشود تا اپراتور ناچار به
-- بایگانی قابل بازیابی با تأیید مالک شود. چرخهٔ خالی (up/down/up) همچنان مجاز است.

do $$
begin
  if to_regclass('public.product_bulk_history_event') is not null then
    if exists (select 1 from product_bulk_history_event) then
      raise exception
        'بازگردانی ۰۰۶۳ روی پایگاهدادهٔ دارای شواهد نگهداشت گروهی مجاز نیست؛ نخست با تأیید مالک یک بایگانی قابل بازیابی تهیه کنید، سپس شواهد را بهصورت کنترلشده پاک کنید. هیچ مقصد بایگانی خارجی در کد فرض نشده است.'
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
