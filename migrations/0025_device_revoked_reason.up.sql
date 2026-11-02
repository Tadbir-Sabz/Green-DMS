-- مهاجرت 0025 — دلیل ابطال «دستگاه باطل‌شده» برای نشست‌های همان دستگاه
-- منبع: packages/contracts/openapi.yaml › /devices/{id} (DELETE) + dms-design-report.md › ضمیمه H
-- فاز توسعه: ۱ | ماژول/بخش: identity-rbac (احراز هویت و کنترل دسترسی نقش/مجوز)
--
-- چرا لازم است:
--   * ابطال دستگاه از راه دور (گم‌شدن/فروش گوشی) باید نشست‌های بازِ همان دستگاه را
--     هم ببندد؛ دلیل ابطال باید از logout/rotated قابل تفکیک باشد تا گزارش ورود
--     و ممیزی، دلیل واقعی را ببینند (revoked_reason در 0023 چنین مقداری نداشت).

alter table auth_session
  drop constraint auth_session_revoked_reason_check;

alter table auth_session
  add constraint auth_session_revoked_reason_check
  check (revoked_reason in ('logout', 'rotated', 'reuse_detected', 'admin', 'device_revoked'));

comment on column auth_session.revoked_reason is
  'logout: خروج کاربر | rotated: چرخش موفق refresh | reuse_detected: استفاده مجدد از توکن چرخش‌شده (سرقت احتمالی) | admin: ابطال توسط مدیر | device_revoked: ابطال دستگاه از راه دور (DELETE /devices/{id})';
