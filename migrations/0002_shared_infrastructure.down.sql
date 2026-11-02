-- معکوس 0002_shared_infrastructure
-- فقط شیت‌های خود همین مهاجرت را حذف می‌کند (CASCADE برای وابستگی‌ها)


drop table if exists audit_log cascade;

drop index if exists ix_attachment_owner;

drop table if exists attachment cascade;

drop function if exists fn_setting(text, uuid, uuid, uuid, uuid) cascade;

drop index if exists uq_setting_scope;

drop table if exists setting cascade;

drop function if exists fn_next_doc_number(uuid, text) cascade;

drop table if exists number_counter cascade;

drop table if exists document_series cascade;

drop table if exists branch cascade;

drop table if exists company cascade;
