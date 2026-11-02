-- معکوس 0003_sales_organization
-- فقط شیت‌های خود همین مهاجرت را حذف می‌کند (CASCADE برای وابستگی‌ها)


drop table if exists route_salesperson cascade;

drop table if exists route cascade;

drop index if exists ix_region_boundary;

drop table if exists region cascade;

drop table if exists sales_area cascade;
