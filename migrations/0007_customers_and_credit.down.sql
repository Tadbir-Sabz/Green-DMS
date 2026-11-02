-- معکوس 0007_customers_and_credit
-- فقط شیت‌های خود همین مهاجرت را حذف می‌کند (CASCADE برای وابستگی‌ها)


alter table route_salesperson drop constraint if exists fk_route_salesperson_staff;

drop table if exists customer_credit cascade;

alter table customer_price drop constraint if exists fk_customer_price_customer;

drop index if exists ix_customer_salesperson;

drop index if exists ix_customer_route;

drop index if exists ix_customer_geo;

drop table if exists customer cascade;

drop table if exists settlement_term cascade;

drop table if exists payment_method cascade;
