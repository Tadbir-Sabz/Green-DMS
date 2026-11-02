-- معکوس 0014_accounts_receivable
-- فقط شیت‌های خود همین مهاجرت را حذف می‌کند (CASCADE برای وابستگی‌ها)


drop view if exists v_customer_exposure cascade;

drop index if exists ix_collection_action_customer;

drop table if exists collection_action cascade;

drop index if exists ix_ar_aging_branch;

drop table if exists ar_aging_snapshot cascade;

drop index if exists ix_customer_ledger_open;

drop index if exists ix_customer_ledger_customer;

drop table if exists customer_ledger_entry cascade;

drop trigger if exists trg_receipt_allocation_check on receipt_allocation;

drop function if exists fn_check_allocation() cascade;

drop index if exists ix_receipt_allocation_invoice;

drop table if exists receipt_allocation cascade;

drop index if exists ix_receipt_unallocated;

drop index if exists ix_receipt_customer;

drop table if exists payment_receipt cascade;
