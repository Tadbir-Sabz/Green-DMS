-- بازگشت 0027 — برگرداندن قید به حالت 0025
-- ردیف‌های password_reset ابتدا به null می‌روند (مثل بازگشت 0025 برای device_revoked)
-- تا قید باریک‌تر نقض نشود؛ نشست‌ها همچنان باطل‌اند و ردیف ممیزی می‌ماند.

update auth_session
   set revoked_reason = null
 where revoked_reason = 'password_reset';

alter table auth_session
  drop constraint auth_session_revoked_reason_check;

alter table auth_session
  add constraint auth_session_revoked_reason_check
  check (revoked_reason in ('logout', 'rotated', 'reuse_detected', 'admin', 'device_revoked'));

comment on column auth_session.revoked_reason is
  'logout: خروج کاربر | rotated: چرخش موفق refresh | reuse_detected: استفاده مجدد از توکن چرخش‌شده (سرقت احتمالی) | admin: ابطال توسط مدیر | device_revoked: ابطال دستگاه از راه دور (DELETE /devices/{id})';
