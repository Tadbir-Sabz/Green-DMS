-- معکوس 0001_extensions_and_functions
-- فقط شیت‌های خود همین مهاجرت را حذف می‌کند (CASCADE برای وابستگی‌ها)


drop function if exists fn_immutable_after_post() cascade;

drop function if exists fn_touch() cascade;

-- پسوندها عمداً حذف نمی‌شوند (ممکن است توسط شیت دیگری یا توابع دیگر استفاده شوند): pgcrypto، pg_trgm، btree_gist، postgis
