-- مهاجرت 0065 — بازگشت دقیق (TASK-PM-02-C2)
-- ترتیب معکوسِ up: ابتدا ایندکسها، سپس ستونها. هیچ جدول/ردیفی حذف نمیشود.

drop index if exists ix_uom_active_code;
alter table uom
  drop column if exists updated_at,
  drop column if exists created_at,
  drop column if exists is_active,
  drop column if exists title_latin,
  drop column if exists symbol;

drop index if exists ix_product_category_parent;
alter table product_category
  drop column if exists updated_at,
  drop column if exists created_at,
  drop column if exists name_latin;

drop index if exists ix_brand_active_code;
drop index if exists uq_brand_code;
alter table brand
  drop column if exists updated_at,
  drop column if exists created_at,
  drop column if exists is_active,
  drop column if exists name_latin,
  drop column if exists code;
