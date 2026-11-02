-- معکوس 0023 — بازگرداندن app_user به شکل 0004 و حذف نشست‌ها
-- فقط شیت‌های خودِ همین مهاجرت حذف می‌شوند.

drop table if exists auth_session cascade;

alter table app_user drop column if exists locked_until;
alter table app_user drop column if exists is_active;
