-- معکوس 0015_accounts_payable
-- فقط شیت‌های خود همین مهاجرت را حذف می‌کند (CASCADE برای وابستگی‌ها)


drop index if exists ix_supplier_ledger_supplier;

drop table if exists supplier_ledger_entry cascade;

drop table if exists landed_cost cascade;

drop table if exists payment_allocation cascade;

drop table if exists payment_voucher cascade;

drop table if exists invoice_match cascade;

drop table if exists supplier_invoice_line cascade;

drop table if exists supplier_invoice cascade;

drop table if exists goods_receipt_line cascade;

drop table if exists goods_receipt cascade;

drop table if exists purchase_order_line cascade;

drop index if exists ix_purchase_order_open;

drop table if exists purchase_order cascade;

drop table if exists purchase_request_line cascade;

drop table if exists purchase_request cascade;

alter table cheque drop constraint if exists fk_cheque_supplier;

drop table if exists supplier cascade;
