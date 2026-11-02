-- معکوس 0016_inventory_valuation
-- فقط شیت‌های خود همین مهاجرت را حذف می‌کند (CASCADE برای وابستگی‌ها)


drop view if exists v_stock_valuation_variance cascade;

drop index if exists ix_stock_valuation_period;

drop table if exists stock_valuation cascade;

drop table if exists cogs_entry cascade;

drop table if exists value_document_line cascade;

drop table if exists value_document cascade;

drop table if exists standard_cost_history cascade;

drop index if exists ix_cost_layer_open;

drop table if exists cost_layer cascade;

drop table if exists product_cost cascade;
