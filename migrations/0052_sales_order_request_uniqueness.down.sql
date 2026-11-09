-- بازگردانیِ مهاجرت 0052 — TASK-24X · A-1
-- فقط ساختارِ ایندکس حذف می‌شود؛ هیچ داده‌ای تغییر نمی‌کند.
begin;

drop index if exists uq_sales_order_request_active;
drop index if exists ix_sales_order_request_id;

commit;
