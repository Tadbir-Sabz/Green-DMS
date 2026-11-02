-- معکوس 0012_tracking
-- فقط شیت‌های خود همین مهاجرت را حذف می‌کند (CASCADE برای وابستگی‌ها)


drop table if exists route_plan_stop cascade;

drop index if exists ix_route_plan_tour;

drop table if exists route_plan cascade;

drop index if exists ix_geofence_event_staff;

drop table if exists geofence_event cascade;

drop index if exists ix_geofence_active;

drop index if exists ix_geofence_area;

drop table if exists geofence cascade;

drop index if exists brin_location_time;

drop index if exists ix_location_staff_time;

drop index if exists ix_location_session_time;

drop table if exists location_sample cascade;

drop index if exists ix_field_session_open;

drop table if exists field_session cascade;

drop index if exists ix_device_active;

drop table if exists device cascade;
