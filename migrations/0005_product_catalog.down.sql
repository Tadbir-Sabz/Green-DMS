-- معکوس 0005_product_catalog
-- فقط شیت‌های خود همین مهاجرت را حذف می‌کند (CASCADE برای وابستگی‌ها)


drop index if exists ix_batch_expiry;

drop table if exists batch cascade;

drop index if exists uq_product_sales_pack;

drop index if exists uq_product_barcode;

drop table if exists product_packaging cascade;

drop index if exists ix_product_code_trgm;

drop index if exists ix_product_category;

drop index if exists ix_product_name_trgm;

drop table if exists product cascade;

drop table if exists tax_code cascade;

drop table if exists brand cascade;

drop table if exists product_category cascade;

drop table if exists uom cascade;
