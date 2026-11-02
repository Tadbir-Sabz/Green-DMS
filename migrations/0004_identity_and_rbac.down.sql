-- معکوس 0004_identity_and_rbac
-- فقط شیت‌های خود همین مهاجرت را حذف می‌کند (CASCADE برای وابستگی‌ها)


alter table staff drop constraint if exists fk_staff_vehicle;

drop table if exists vehicle cascade;

drop table if exists user_scope cascade;

drop table if exists user_role cascade;

drop table if exists role_permission cascade;

drop table if exists permission cascade;

drop table if exists role cascade;

drop table if exists app_user cascade;

drop index if exists ix_staff_supervisor;

drop table if exists staff cascade;

drop table if exists job_position cascade;

drop table if exists person_address cascade;

drop index if exists uq_person_primary_phone;

drop table if exists person_phone cascade;

drop index if exists ix_person_name_trgm;

drop index if exists uq_person_national_id;

drop table if exists person cascade;
