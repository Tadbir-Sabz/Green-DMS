-- مهاجرت 0049 (down) — حذفِ کاملِ افزودنی‌های موتورِ قیمت/تخفیف
-- ترتیب معکوسِ up: RLS/گرانت با حذفِ جدول خودکار می‌شود؛ ستون‌های افزوده‌شده صریح حذف می‌شوند.
-- هیچ داده‌ای از جدول‌های پیش از این مهاجرت لمس نمی‌شود جز ستون‌های تازهٔ همین مهاجرت.

begin;

-- §9 مجوزها
delete from role_permission where permission_code in (
  'pricing.simulation.run', 'pricing.margin.view', 'pricing.margin.update',
  'pricing.margin.override', 'pricing.audit.view',
  'pricing.manual_price.apply', 'pricing.discount.override'
);
delete from permission where code in (
  'pricing.simulation.run', 'pricing.margin.view', 'pricing.margin.update',
  'pricing.margin.override', 'pricing.audit.view',
  'pricing.manual_price.apply', 'pricing.discount.override'
);

-- §7
drop table if exists price_simulation_log;
drop trigger if exists trg_price_change_log_immutable on price_change_log;
drop table if exists price_change_log;
drop function if exists fn_price_change_log_immutable();

-- §6
drop table if exists margin_exception;
drop table if exists margin_policy;

-- §5
drop table if exists promotion_evaluation;
drop table if exists promotion_redemption;
drop table if exists promotion_coupon;

-- §4
alter table promotion drop column if exists requires_coupon;
alter table promotion drop column if exists max_uses_per_customer;
alter table promotion drop column if exists max_uses_total;
alter table promotion drop column if exists max_discount_pct;
alter table promotion drop column if exists exclusive_group;
alter table promotion drop column if exists domain_id;

-- §3
drop index if exists ix_customer_price_lookup;
alter table customer_price drop constraint if exists ck_customer_price_qty;
alter table customer_price drop column if exists row_version;
alter table customer_price drop column if exists updated_at;
alter table customer_price drop column if exists created_at;
alter table customer_price drop column if exists created_by;
alter table customer_price drop column if exists note;
alter table customer_price drop column if exists approval_request_id;
alter table customer_price drop column if exists max_discount_pct;
alter table customer_price drop column if exists max_qty;
alter table customer_price drop column if exists min_qty;

-- §2
drop trigger if exists trg_customer_price_touch on customer_price;
drop trigger if exists trg_price_list_item_touch on price_list_item;
drop trigger if exists trg_price_list_touch on price_list;
alter table price_list_item drop constraint if exists ck_price_list_item_qty;
alter table price_list_item drop column if exists row_version;
alter table price_list_item drop column if exists updated_at;
alter table price_list_item drop column if exists created_at;
alter table price_list_item drop column if exists max_qty;
drop index if exists ix_price_list_domain;
drop index if exists uq_price_list_default;
alter table price_list drop column if exists is_default;
alter table price_list drop column if exists priority;
alter table price_list drop column if exists row_version;
alter table price_list drop column if exists updated_at;
alter table price_list drop column if exists domain_id;

-- §1
drop table if exists pricing_domain;

commit;
