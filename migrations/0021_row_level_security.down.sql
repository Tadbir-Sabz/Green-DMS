-- معکوس 0021_row_level_security
-- فقط شیت‌های خود همین مهاجرت را حذف می‌کند (CASCADE برای وابستگی‌ها)


drop policy if exists p_invoice_scope on invoice;

drop policy if exists p_invoice_tenant on invoice;

alter table invoice disable row level security;
