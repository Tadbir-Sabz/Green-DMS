-- مهاجرت 0047 — رفع HIGH-01 (TASK-22Q): RLS کامل و اجباری برای جدول‌های Product Master
-- TASK-22R — جداسازیِ اجاره به‌صورتِ database-enforced برای هر جدولِ «مالکِ اجاره» که
-- مهاجرت 0046 ساخته یا تغییر داده است.
--
-- شواهد (TASK-22R فاز ۱ — از کاتالوگِ زنده، نه از شمارِ گزارش):
--   0046 ده جدول ساخته است (نه ۸ و نه ۹): product_family، product_alias،
--   product_attribute_def، product_attribute_enum_value، product_attribute_value،
--   product_relation، product_bundle، product_barcode، product_code_seq، product_import.
--   هیچ‌کدام RLS نداشتند. (فهرستِ TASK-22Q «۹ نام با عنوان ۸» بود و product_code_seq
--   را اصلاً نام نبرده بود.)
--
-- طراحیِ سیاست‌ها — از مدلِ دادهٔ راستی‌آزمایی‌شده، نه یک الگوی واحد:
--   A) مستقیم (company_id تنها کلیدِ خارجی): product_family، product_attribute_def،
--      product_code_seq، product_import — الگوی 0041 («p_<t>_tenant» با fn_current_company_id).
--   B) هیبرید (company_id + والدِ اجاره‌ای): product_alias، product_relation،
--      product_barcode — هم کلیدِ ذخیره‌شده باید با زمینه یکی باشد (payload قابلِ اعتماد نیست)
--      و هم والد باید برایِ همان اجاره «دیده» شود (بدونِ این، سطرِ فرزند می‌توانست
--      به والدِ اجارهٔ دیگر بچسبد — الزامِ ۳-۸ TASK-22R).
--   C) زنجیرهٔ والد (بدونِ ستونِ اجاره — الگوی 0042): product_attribute_enum_value (def_id)،
--      product_attribute_value (product_id + def_id)، product_bundle (هر دو محصول).
--      زیرکوئریِ «والد دیده می‌شود» زیرِ RLSِ خودِ والد اجرا می‌شود ⇒ fail-closed گذرا.
--
-- تقویتِ جدول‌های «تغییریافته» توسط 0046 — فقط برایِ کلیدهایِ خارجیِ «افزوده‌شده»:
--   product.family_id، price_list_item.packaging_id، customer_price.packaging_id،
--   sales_order_line/invoice_line/credit_note_line/return_request_line.packaging_id.
--   (وکتورهایِ پیش از 0046 مثلِ product.brand_id یا line.product_id طبقِ قراردادِ
--   0041/0042 باقی می‌مانند و در گزارشِ TASK-22R به‌عنوانِ پیگیریِ جدا ثبت شده‌اند.)
--
-- نمای v_document_line_display: نمایِ معمولی با مالکِ superuser ⇒ RLSِ جدول‌هایِ زیرین
-- را برایِ dms_app دور می‌زد (مسیرِ دسترسیِ جایگزین — الزامِ ۳-۱۰). با security_invoker
-- (PostgreSQL 15+؛ هدفِ پروژه 16) اکنون RLSِ نقشِ فراخوان اعمال می‌شود.
--
-- قاعده: تماماً افزودنی/تقویتی — هیچ داده‌ای جابه‌جا یا حذف نمی‌شود؛ رفتارِ
-- همان‌اجاره‌ایِ مجاز دست‌نخورده می‌ماند.

begin;

-- =====================================================================
-- §1  ده جدولِ 0046 — RLS + FORCE + سیاست
-- =====================================================================

-- ---- A) مستقیم ----
alter table product_family enable row level security;
alter table product_family force row level security;
drop policy if exists p_product_family_tenant on product_family;
create policy p_product_family_tenant on product_family
  for all
  using (product_family.company_id = fn_current_company_id())
  with check (product_family.company_id = fn_current_company_id());

alter table product_attribute_def enable row level security;
alter table product_attribute_def force row level security;
drop policy if exists p_product_attribute_def_tenant on product_attribute_def;
create policy p_product_attribute_def_tenant on product_attribute_def
  for all
  using (product_attribute_def.company_id = fn_current_company_id())
  with check (product_attribute_def.company_id = fn_current_company_id());

alter table product_code_seq enable row level security;
alter table product_code_seq force row level security;
drop policy if exists p_product_code_seq_tenant on product_code_seq;
create policy p_product_code_seq_tenant on product_code_seq
  for all
  using (product_code_seq.company_id = fn_current_company_id())
  with check (product_code_seq.company_id = fn_current_company_id());

alter table product_import enable row level security;
alter table product_import force row level security;
drop policy if exists p_product_import_tenant on product_import;
create policy p_product_import_tenant on product_import
  for all
  using (product_import.company_id = fn_current_company_id())
  with check (product_import.company_id = fn_current_company_id());

-- ---- B) هیبرید: کلیدِ اجاره + دیده‌شدنِ والد ----
alter table product_alias enable row level security;
alter table product_alias force row level security;
drop policy if exists p_product_alias_tenant on product_alias;
create policy p_product_alias_tenant on product_alias
  for all
  using (product_alias.company_id = fn_current_company_id()
         and exists (select 1 from product pp where pp.id = product_alias.product_id))
  with check (product_alias.company_id = fn_current_company_id()
              and exists (select 1 from product pp where pp.id = product_alias.product_id));

alter table product_relation enable row level security;
alter table product_relation force row level security;
drop policy if exists p_product_relation_tenant on product_relation;
create policy p_product_relation_tenant on product_relation
  for all
  using (product_relation.company_id = fn_current_company_id()
         and exists (select 1 from product pp where pp.id = product_relation.product_id)
         and exists (select 1 from product pp2 where pp2.id = product_relation.related_id))
  with check (product_relation.company_id = fn_current_company_id()
              and exists (select 1 from product pp where pp.id = product_relation.product_id)
              and exists (select 1 from product pp2 where pp2.id = product_relation.related_id));

alter table product_barcode enable row level security;
alter table product_barcode force row level security;
drop policy if exists p_product_barcode_tenant on product_barcode;
create policy p_product_barcode_tenant on product_barcode
  for all
  using (product_barcode.company_id = fn_current_company_id()
         and exists (select 1 from product pp where pp.id = product_barcode.product_id)
         and (product_barcode.packaging_id is null
              or exists (select 1 from product_packaging pk where pk.id = product_barcode.packaging_id)))
  with check (product_barcode.company_id = fn_current_company_id()
              and exists (select 1 from product pp where pp.id = product_barcode.product_id)
              and (product_barcode.packaging_id is null
                   or exists (select 1 from product_packaging pk where pk.id = product_barcode.packaging_id)));

-- ---- C) زنجیرهٔ والد ----
alter table product_attribute_enum_value enable row level security;
alter table product_attribute_enum_value force row level security;
drop policy if exists p_product_attribute_enum_value_tenant on product_attribute_enum_value;
create policy p_product_attribute_enum_value_tenant on product_attribute_enum_value
  for all
  using (exists (select 1 from product_attribute_def dd
                  where dd.id = product_attribute_enum_value.def_id))
  with check (exists (select 1 from product_attribute_def dd
                       where dd.id = product_attribute_enum_value.def_id));

alter table product_attribute_value enable row level security;
alter table product_attribute_value force row level security;
drop policy if exists p_product_attribute_value_tenant on product_attribute_value;
create policy p_product_attribute_value_tenant on product_attribute_value
  for all
  using (exists (select 1 from product pp where pp.id = product_attribute_value.product_id)
         and exists (select 1 from product_attribute_def dd where dd.id = product_attribute_value.def_id))
  with check (exists (select 1 from product pp where pp.id = product_attribute_value.product_id)
              and exists (select 1 from product_attribute_def dd where dd.id = product_attribute_value.def_id));

alter table product_bundle enable row level security;
alter table product_bundle force row level security;
drop policy if exists p_product_bundle_tenant on product_bundle;
create policy p_product_bundle_tenant on product_bundle
  for all
  using (exists (select 1 from product pp where pp.id = product_bundle.bundle_product_id)
         and exists (select 1 from product pp2 where pp2.id = product_bundle.component_product_id))
  with check (exists (select 1 from product pp where pp.id = product_bundle.bundle_product_id)
              and exists (select 1 from product pp2 where pp2.id = product_bundle.component_product_id));

-- =====================================================================
-- §2  تقویتِ جدول‌های تغییریافته — کلیدهای خارجیِ افزوده‌شده توسط 0046
-- =====================================================================
-- الگو: عبارتِ مالکیتِ موجود (0041/0042) دست‌نخورده می‌ماند؛ فقط شرطِ
-- «packaging_id تهی یا والد دیده می‌شود» / «family_id تهی یا والد دیده می‌شود»
-- افزوده می‌شود. سطرهایِ مشروعِ همان اجاره همچنان دیده/نوشته می‌شوند.

-- product: family_id → product_family (افزوده‌شده در 0046)
drop policy if exists p_product_tenant on product;
create policy p_product_tenant on product
  for all
  using (product.company_id = fn_current_company_id()
         and (product.family_id is null
              or exists (select 1 from product_family pf where pf.id = product.family_id)))
  with check (product.company_id = fn_current_company_id()
              and (product.family_id is null
                   or exists (select 1 from product_family pf where pf.id = product.family_id)));

-- price_list_item: packaging_id → product_packaging (افزوده‌شده در 0046)
drop policy if exists p_price_list_item_tenant on price_list_item;
create policy p_price_list_item_tenant on price_list_item
  for all
  using (exists (select 1 from price_list pp where pp.id = price_list_item.price_list_id)
         and (price_list_item.packaging_id is null
              or exists (select 1 from product_packaging pk where pk.id = price_list_item.packaging_id)))
  with check (exists (select 1 from price_list pp where pp.id = price_list_item.price_list_id)
              and (price_list_item.packaging_id is null
                   or exists (select 1 from product_packaging pk where pk.id = price_list_item.packaging_id)));

-- customer_price: packaging_id → product_packaging (افزوده‌شده در 0046)
drop policy if exists p_customer_price_tenant on customer_price;
create policy p_customer_price_tenant on customer_price
  for all
  using (exists (select 1 from product pp where pp.id = customer_price.product_id)
         and (customer_price.packaging_id is null
              or exists (select 1 from product_packaging pk where pk.id = customer_price.packaging_id)))
  with check (exists (select 1 from product pp where pp.id = customer_price.product_id)
              and (customer_price.packaging_id is null
                   or exists (select 1 from product_packaging pk where pk.id = customer_price.packaging_id)));

-- sales_order_line: packaging_id (ستون از پیش موجود؛ جدول در 0046 تغییر کرد — M-2/D3)
drop policy if exists p_sales_order_line_tenant on sales_order_line;
create policy p_sales_order_line_tenant on sales_order_line
  for all
  using (exists (select 1 from sales_order pp where pp.id = sales_order_line.sales_order_id)
         and (sales_order_line.packaging_id is null
              or exists (select 1 from product_packaging pk where pk.id = sales_order_line.packaging_id)))
  with check (exists (select 1 from sales_order pp where pp.id = sales_order_line.sales_order_id)
              and (sales_order_line.packaging_id is null
                   or exists (select 1 from product_packaging pk where pk.id = sales_order_line.packaging_id)));

-- invoice_line: packaging_id → product_packaging (افزوده‌شده در 0046)
drop policy if exists p_invoice_line_tenant on invoice_line;
create policy p_invoice_line_tenant on invoice_line
  for all
  using (exists (select 1 from invoice pp where pp.id = invoice_line.invoice_id)
         and (invoice_line.packaging_id is null
              or exists (select 1 from product_packaging pk where pk.id = invoice_line.packaging_id)))
  with check (exists (select 1 from invoice pp where pp.id = invoice_line.invoice_id)
              and (invoice_line.packaging_id is null
                   or exists (select 1 from product_packaging pk where pk.id = invoice_line.packaging_id)));

-- credit_note_line: packaging_id → product_packaging (افزوده‌شده در 0046)
drop policy if exists p_credit_note_line_tenant on credit_note_line;
create policy p_credit_note_line_tenant on credit_note_line
  for all
  using (exists (select 1 from credit_note pp where pp.id = credit_note_line.credit_note_id)
         and (credit_note_line.packaging_id is null
              or exists (select 1 from product_packaging pk where pk.id = credit_note_line.packaging_id)))
  with check (exists (select 1 from credit_note pp where pp.id = credit_note_line.credit_note_id)
              and (credit_note_line.packaging_id is null
                   or exists (select 1 from product_packaging pk where pk.id = credit_note_line.packaging_id)));

-- return_request_line: packaging_id → product_packaging (افزوده‌شده در 0046)
drop policy if exists p_return_request_line_tenant on return_request_line;
create policy p_return_request_line_tenant on return_request_line
  for all
  using (exists (select 1 from return_request pp where pp.id = return_request_line.return_request_id)
         and (return_request_line.packaging_id is null
              or exists (select 1 from product_packaging pk where pk.id = return_request_line.packaging_id)))
  with check (exists (select 1 from return_request pp where pp.id = return_request_line.return_request_id)
              and (return_request_line.packaging_id is null
                   or exists (select 1 from product_packaging pk where pk.id = return_request_line.packaging_id)));

-- =====================================================================
-- §3  نمای v_document_line_display — بستنِ مسیرِ دسترسیِ جایگزین
-- =====================================================================
-- مالکِ نما (مهاجرت‌راننده — گاهی superuser) بر RLSِ جدول‌هایِ زیرین غلبه می‌کند.
-- security_invoker ⇒ رفتارِ نما دقیقاً رفتارِ نقشِ فراخوان زیرِ RLSِ خودش.
alter view v_document_line_display set (security_invoker = true);

commit;
