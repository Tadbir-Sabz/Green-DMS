-- مهاجرت 0023 — نشست‌های احراز هویت (refresh چرخشی) و ستون‌های قرارداد /auth و /users
-- منبع: packages/contracts/openapi.yaml › schemas.AuthSession و schemas.User
--        dms-design-report.md › ضمیمه H (مدت نشست، قفل حساب، دستگاه مجاز)
-- فاز توسعه: ۱ | ماژول/بخش: identity-rbac (احراز هویت و کنترل دسترسی نقش/مجوز)
--
-- چرا لازم است:
--   * قرارداد POST /auth/refresh نیازمند نگه‌داری refresh token ابطال‌پذیر است؛ بدون جدول
--     نشست، خروج (logout) یا چرخش توکن نمی‌تواند توکن قبلی را باطل کند.
--   * قرارداد /users به ستون‌های is_active و locked_until نیاز دارد که در 0004 نبودند
--     (حذف فیزیکی کاربر ممنوع است؛ غیرفعال‌سازی با is_active انجام می‌شود).

alter table app_user
  add column is_active    boolean not null default true,
  add column locked_until timestamptz;

comment on column app_user.is_active is
  'کاربر فعال؟ غیرفعال‌سازی به‌جای حذف (ممیزی)؛ ورود و هر درخواست مجوزدار رد می‌شود';
comment on column app_user.locked_until is
  'قفل زمان‌دار ناشی از تلاش‌های ناموفق متوالی؛ تا این زمان ورود با 423 رد می‌شود';

create table auth_session (                                -- نشست ورود — پایه logout/refresh
  id                 uuid primary key default gen_random_uuid(),
  app_user_id        uuid not null references app_user(id) on delete cascade,
  refresh_token_hash text not null,                        -- sha256 توکن؛ خودِ توکن هرگز ذخیره نمی‌شود
  device_id          text,                                 -- دستگاه مجاز (اپ‌های میدانی، ضمیمه B)
  ip                 inet,
  user_agent         text,
  created_at         timestamptz not null default now(),
  last_used_at       timestamptz not null default now(),
  expires_at         timestamptz not null,
  revoked_at         timestamptz,
  revoked_reason     text check (revoked_reason in ('logout', 'rotated', 'reuse_detected', 'admin')),
  rotated_to         uuid references auth_session(id),     -- زنجیره چرخش refresh
  constraint uq_auth_session_refresh unique (refresh_token_hash)
);

create index ix_auth_session_user    on auth_session (app_user_id) where revoked_at is null;
create index ix_auth_session_expiry  on auth_session (expires_at)   where revoked_at is null;

comment on table auth_session is
  'نشست ورود: access token به sid اشاره می‌کند؛ با ابطال نشست (logout/چرخش/سوءاستفاده) بی‌اعتبار می‌شود';
comment on column auth_session.revoked_reason is
  'logout: خروج کاربر | rotated: چرخش موفق refresh | reuse_detected: استفاده مجدد از توکن چرخش‌شده (سرقت احتمالی) | admin: ابطال توسط مدیر';
