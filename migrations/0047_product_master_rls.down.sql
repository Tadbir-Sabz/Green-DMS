-- مهاجرت 0047 (down) — بازگردانیِ دقیقِ وضعیتِ پیش از 0047
-- ترتیبِ معکوس: اول §3، بعد §2 (سیاست‌های تقویت‌شده به متنِ اصلیِ 0041/0042
-- بازمی‌گردند تا زنجیرهٔ downهای بعدی — از جمله 0046.down که ستون‌های
-- packaging_id/family_id را حذف می‌کند — بدونِ وابستگیِ سیاست به ستونِ حذف‌شده
-- کار کند)، و در آخر §1.

begin;

-- ---- §3: نما به حالتِ پیش‌فرض ----
alter view v_document_line_display reset (security_invoker);

-- ---- §2: بازگردانیِ سیاست‌های اصلی (متنِ 0041/0042 — بدونِ شرطِ کلیدِ جدید) ----
drop policy if exists p_product_tenant on product;
create policy p_product_tenant on product
  for all
  using (product.company_id = fn_current_company_id())
  with check (product.company_id = fn_current_company_id());

drop policy if exists p_price_list_item_tenant on price_list_item;
create policy p_price_list_item_tenant on price_list_item
  for all
  using (exists (select 1 from price_list pp where pp.id = price_list_id))
  with check (exists (select 1 from price_list pp where pp.id = price_list_id));

drop policy if exists p_customer_price_tenant on customer_price;
create policy p_customer_price_tenant on customer_price
  for all
  using (exists (select 1 from product pp where pp.id = product_id))
  with check (exists (select 1 from product pp where pp.id = product_id));

drop policy if exists p_sales_order_line_tenant on sales_order_line;
create policy p_sales_order_line_tenant on sales_order_line
  for all
  using (exists (select 1 from sales_order pp where pp.id = sales_order_id))
  with check (exists (select 1 from sales_order pp where pp.id = sales_order_id));

drop policy if exists p_invoice_line_tenant on invoice_line;
create policy p_invoice_line_tenant on invoice_line
  for all
  using (exists (select 1 from invoice pp where pp.id = invoice_id))
  with check (exists (select 1 from invoice pp where pp.id = invoice_id));

drop policy if exists p_credit_note_line_tenant on credit_note_line;
create policy p_credit_note_line_tenant on credit_note_line
  for all
  using (exists (select 1 from credit_note pp where pp.id = credit_note_id))
  with check (exists (select 1 from credit_note pp where pp.id = credit_note_id));

drop policy if exists p_return_request_line_tenant on return_request_line;
create policy p_return_request_line_tenant on return_request_line
  for all
  using (exists (select 1 from return_request pp where pp.id = return_request_id))
  with check (exists (select 1 from return_request pp where pp.id = return_request_id));

-- ---- §1: حذفِ سیاست‌ها و خاموش‌کردنِ RLS ده جدولِ 0046 ----
drop policy if exists p_product_family_tenant on product_family;
alter table product_family no force row level security;
alter table product_family disable row level security;

drop policy if exists p_product_alias_tenant on product_alias;
alter table product_alias no force row level security;
alter table product_alias disable row level security;

drop policy if exists p_product_attribute_def_tenant on product_attribute_def;
alter table product_attribute_def no force row level security;
alter table product_attribute_def disable row level security;

drop policy if exists p_product_attribute_enum_value_tenant on product_attribute_enum_value;
alter table product_attribute_enum_value no force row level security;
alter table product_attribute_enum_value disable row level security;

drop policy if exists p_product_attribute_value_tenant on product_attribute_value;
alter table product_attribute_value no force row level security;
alter table product_attribute_value disable row level security;

drop policy if exists p_product_relation_tenant on product_relation;
alter table product_relation no force row level security;
alter table product_relation disable row level security;

drop policy if exists p_product_bundle_tenant on product_bundle;
alter table product_bundle no force row level security;
alter table product_bundle disable row level security;

drop policy if exists p_product_barcode_tenant on product_barcode;
alter table product_barcode no force row level security;
alter table product_barcode disable row level security;

drop policy if exists p_product_code_seq_tenant on product_code_seq;
alter table product_code_seq no force row level security;
alter table product_code_seq disable row level security;

drop policy if exists p_product_import_tenant on product_import;
alter table product_import no force row level security;
alter table product_import disable row level security;

commit;
