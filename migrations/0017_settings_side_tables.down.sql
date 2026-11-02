-- معکوس 0017_settings_side_tables
-- فقط شیت‌های خود همین مهاجرت را حذف می‌کند (CASCADE برای وابستگی‌ها)


drop table if exists feature_flag cascade;

drop index if exists ix_webhook_delivery_retry;

drop table if exists webhook_delivery cascade;

drop table if exists webhook_endpoint cascade;

drop table if exists integration_credential cascade;

drop table if exists sms_template cascade;

drop index if exists uq_print_template_default;

drop table if exists print_template cascade;
