-- بازگشت 0025 — بازگرداندن مقادیر مجاز revoked_reason به حالت 0023

-- نشست‌هایی که با ابطال دستگاه بسته شده‌اند همچنان باطل می‌مانند؛ فقط دلیلشان
-- پاک می‌شود تا ردیف با قید جدید (بدون device_revoked) سازگار بماند
update auth_session
   set revoked_reason = null
 where revoked_reason = 'device_revoked';

alter table auth_session
  drop constraint auth_session_revoked_reason_check;

alter table auth_session
  add constraint auth_session_revoked_reason_check
  check (revoked_reason in ('logout', 'rotated', 'reuse_detected', 'admin'));

comment on column auth_session.revoked_reason is
  'logout: خروج کاربر | rotated: چرخش موفق refresh | reuse_detected: استفاده مجدد از توکن چرخش‌شده (سرقت احتمالی) | admin: ابطال توسط مدیر';
