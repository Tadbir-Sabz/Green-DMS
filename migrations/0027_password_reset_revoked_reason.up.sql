-- مهاجرت 0027 — دلیل ابطال «بازیابی رمز» برای نشست‌های بازِ کاربر
-- منبع: packages/contracts/openapi.yaml › /auth/password-reset
-- فاز توسعه: ۱ | ماژول/بخش: identity-rbac (احراز هویت)
--
-- چرا لازم است:
--   * تغییر رمز از راه بازیابی باید همه نشست‌های باز کاربر را ببندد؛ دلیل ابطال
--     باید از logout/admin/device_revoked قابل تفکیک باشد تا گزارش ورود و ممیزی
--     علت واقعی را ببینند (revoked_reason در 0025 چنین مقداری نداشت).

alter table auth_session
  drop constraint auth_session_revoked_reason_check;

alter table auth_session
  add constraint auth_session_revoked_reason_check
  check (revoked_reason in
         ('logout', 'rotated', 'reuse_detected', 'admin', 'device_revoked', 'password_reset'));

comment on column auth_session.revoked_reason is
  'logout: خروج کاربر | rotated: چرخش موفق refresh | reuse_detected: استفاده مجدد از توکن چرخش‌شده (سرقت احتمالی) | admin: ابطال توسط مدیر | device_revoked: ابطال دستگاه از راه دور (DELETE /devices/{id}) | password_reset: بازیابی رمز عبور (POST /auth/password-reset)';
