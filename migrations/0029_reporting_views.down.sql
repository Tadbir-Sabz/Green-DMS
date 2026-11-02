-- مهاجرت 0029 — بازگشت
-- ترتیب معکوس up: نگاشت‌های مجوز، خودِ مجوز، سپس شیءهای گزارش‌گیری.
-- (migrations/0022_permission و role_permission با on delete cascade تعریف شده‌اند،
--  ولی حذف صریح نگاشت‌ها مهاجرت را به ترتیبِ حذفِ FK وابسته نمی‌کند.)

delete from role_permission where permission_code = 'tracking.location.report';

delete from permission where code = 'tracking.location.report';

drop view if exists v_live_locations;

drop materialized view if exists mv_salesperson_performance;
drop materialized view if exists mv_ar_aging;
drop materialized view if exists mv_daily_sales;
