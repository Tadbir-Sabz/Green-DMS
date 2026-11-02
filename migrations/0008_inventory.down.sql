-- معکوس 0008_inventory
-- فقط شیت‌های خود همین مهاجرت را حذف می‌کند (CASCADE برای وابستگی‌ها)


drop table if exists reorder_policy cascade;

drop table if exists vehicle_load_line cascade;

drop table if exists vehicle_load cascade;

drop index if exists ix_container_loan_open;

drop table if exists container_loan cascade;

drop table if exists stock_adjustment_line cascade;

drop table if exists stock_adjustment cascade;

drop table if exists stock_transfer_line cascade;

drop table if exists stock_transfer cascade;

drop index if exists uq_stock_count_line;

drop table if exists stock_count_line cascade;

drop table if exists stock_count cascade;

drop index if exists ix_stock_reservation_active;

drop index if exists uq_stock_reservation_source;

drop table if exists stock_reservation cascade;

drop function if exists fn_apply_stock_txn(inventory_txn) cascade;

drop table if exists client_sync_receipt cascade;

drop index if exists ix_inventory_txn_wh_product;

drop index if exists ix_inventory_txn_doc;

drop table if exists inventory_txn cascade;

drop index if exists uq_stock_balance_batch;

drop index if exists uq_stock_balance_nobatch;

drop table if exists stock_balance cascade;

drop index if exists uq_warehouse_vehicle;

drop table if exists warehouse cascade;
