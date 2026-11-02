-- معکوس 0010_sales_documents
-- فقط شیت‌های خود همین مهاجرت را حذف می‌کند (CASCADE برای وابستگی‌ها)


drop index if exists uq_moadian_invoice;

drop index if exists ix_moadian_retry;

drop table if exists moadian_submission cascade;

drop table if exists return_request_line cascade;

drop index if exists ix_return_request_open;

drop table if exists return_request cascade;

drop table if exists pod cascade;

drop table if exists delivery_line cascade;

drop index if exists ix_delivery_open;

drop index if exists ix_delivery_tour;

drop table if exists delivery cascade;

drop table if exists credit_note_line cascade;

drop table if exists credit_note cascade;

drop table if exists invoice_line cascade;

drop trigger if exists trg_invoice_immutable on invoice;

drop index if exists ix_invoice_moadian_queue;

drop index if exists ix_invoice_customer_open;

drop table if exists invoice cascade;

drop table if exists waybill_line cascade;

drop table if exists waybill cascade;

drop table if exists sales_order_line cascade;

drop index if exists uq_sales_order_client;

drop index if exists ix_sales_order_open;

drop index if exists ix_sales_order_customer;

drop table if exists sales_order cascade;

drop table if exists customer_request_line cascade;

drop index if exists uq_customer_request_client;

drop index if exists ix_customer_request_status;

drop table if exists customer_request cascade;
