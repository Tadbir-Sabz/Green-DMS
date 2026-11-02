-- معکوس 0011_tours_and_commission
-- فقط شیت‌های خود همین مهاجرت را حذف می‌کند (CASCADE برای وابستگی‌ها)


alter table vehicle_load drop constraint if exists fk_vehicle_load_tour;

alter table return_request drop constraint if exists fk_return_request_tour;

alter table delivery drop constraint if exists fk_delivery_tour;

alter table sales_order drop constraint if exists fk_sales_order_tour;

alter table customer_request drop constraint if exists fk_customer_request_tour;
alter table customer_request drop constraint if exists fk_customer_request_order;

drop index if exists ix_commission_line_staff;

drop table if exists commission_line cascade;

drop table if exists commission_tier cascade;

drop table if exists commission_plan cascade;

drop table if exists telesale_target cascade;

drop index if exists uq_tour_settlement_line;

drop table if exists tour_settlement_line cascade;

drop table if exists tour_settlement cascade;

drop index if exists uq_visit_client;

drop index if exists ix_visit_customer;

drop index if exists ix_visit_tour;

drop table if exists visit cascade;

drop table if exists tour_stop cascade;

drop index if exists ix_tour_today;

drop table if exists tour cascade;
