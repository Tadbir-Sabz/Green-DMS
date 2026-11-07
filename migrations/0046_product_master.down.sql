-- مهاجرت 0046 (down) — حذفِ افزودنی‌های Product Master (P1)
-- ترتیبِ معکوس؛ هیچ داده/ستونِ قدیمیِ موجود حذف نمی‌شود (فقط افزودنی‌های 0046).

drop view if exists v_document_line_display;

drop table if exists product_import;

-- ستون‌های snapshot / لنگرهای واحدِ افزوده‌شده
alter table stock_count_line drop column if exists product_name, drop column if exists product_code;
alter table delivery_line   drop column if exists product_name, drop column if exists product_code;
alter table waybill_line    drop column if exists product_name, drop column if exists product_code,
                            drop column if exists uom_title, drop column if exists packaging_factor;
alter table stock_transfer_line drop column if exists product_name, drop column if exists product_code,
                            drop column if exists uom_title, drop column if exists packaging_factor;
alter table goods_receipt_line drop column if exists product_name, drop column if exists product_code,
                            drop column if exists uom_title, drop column if exists packaging_factor;
alter table purchase_order_line drop column if exists product_name, drop column if exists product_code,
                            drop column if exists uom_title, drop column if exists packaging_factor;
alter table return_request_line drop column if exists packaging_id, drop column if exists qty_base,
                            drop column if exists product_name, drop column if exists product_code,
                            drop column if exists variant_display, drop column if exists packaging_label,
                            drop column if exists tax_code, drop column if exists uom_title,
                            drop column if exists packaging_factor;
alter table credit_note_line drop column if exists packaging_id, drop column if exists qty_base,
                            drop column if exists product_name, drop column if exists product_code,
                            drop column if exists variant_display, drop column if exists packaging_label,
                            drop column if exists tax_code, drop column if exists uom_title,
                            drop column if exists packaging_factor;
alter table invoice_line drop column if exists packaging_id, drop column if exists qty_base,
                            drop column if exists product_name, drop column if exists product_code,
                            drop column if exists variant_display, drop column if exists packaging_label,
                            drop column if exists tax_code, drop column if exists uom_title,
                            drop column if exists packaging_factor;
alter table sales_order_line drop column if exists product_name, drop column if exists product_code,
                            drop column if exists variant_display, drop column if exists packaging_label,
                            drop column if exists tax_code, drop column if exists uom_title,
                            drop column if exists packaging_factor;

drop trigger if exists trg_sales_order_line_snapshot on sales_order_line;
drop trigger if exists trg_invoice_line_snapshot on invoice_line;
drop trigger if exists trg_credit_note_line_snapshot on credit_note_line;
drop trigger if exists trg_return_request_line_snapshot on return_request_line;
drop trigger if exists trg_purchase_order_line_snapshot on purchase_order_line;
drop trigger if exists trg_goods_receipt_line_snapshot on goods_receipt_line;
drop trigger if exists trg_stock_transfer_line_snapshot on stock_transfer_line;
drop trigger if exists trg_waybill_line_snapshot on waybill_line;
drop trigger if exists trg_delivery_line_snapshot on delivery_line;
drop trigger if exists trg_stock_count_line_snapshot on stock_count_line;
drop function if exists fn_product_line_snapshot();

-- قیدهای قیمت → قیدهای اصلی (بدونِ packaging)
alter table customer_price drop constraint if exists ex_customer_price;
alter table customer_price add constraint ex_customer_price
  exclude using gist (customer_id with =, product_id with =, valid with &&);
alter table customer_price drop column if exists packaging_id;

alter table price_list_item drop constraint if exists ex_price_list_item;
alter table price_list_item add constraint ex_price_list_item
  exclude using gist (price_list_id with =, product_id with =, min_qty with =, valid with &&);
alter table price_list_item drop column if exists packaging_id;

drop table if exists product_code_seq;

-- بارکدهای کپی‌شده از product_packaging.barcode با kind='other' ساخته شده‌اند؛
-- ستونِ legacy هنوز مرجع است (تا P5) — حذفِ کلِ جدولِ جدید کافی است.
drop table if exists product_barcode;

drop trigger if exists trg_sales_order_line_no_bundle on sales_order_line;
drop trigger if exists trg_invoice_line_no_bundle on invoice_line;
drop trigger if exists trg_credit_note_line_no_bundle on credit_note_line;
drop trigger if exists trg_return_request_line_no_bundle on return_request_line;
drop function if exists fn_reject_bundle_line();

drop function if exists is_bundle_product(uuid);
drop table if exists product_bundle;
drop table if exists product_relation;
drop table if exists product_attribute_value;
drop table if exists product_attribute_enum_value;
drop table if exists product_attribute_def;
drop table if exists product_alias;

alter table product drop column if exists variant_signature;
alter table product drop column if exists family_id;
alter table product drop column if exists name_latin;
drop table if exists product_family;

delete from role_permission where permission_code in ('master.product.import', 'master.product.status');
delete from permission where code in ('master.product.import', 'master.product.status');
