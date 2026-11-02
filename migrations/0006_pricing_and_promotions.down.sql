-- معکوس 0006_pricing_and_promotions
-- فقط شیت‌های خود همین مهاجرت را حذف می‌کند (CASCADE برای وابستگی‌ها)


drop index if exists ix_promotion_conditions;

drop index if exists ix_promotion_active;

drop table if exists promotion cascade;

drop table if exists customer_price cascade;

drop index if exists ix_price_list_item_lookup;

drop table if exists price_list_item cascade;

drop table if exists price_list cascade;
