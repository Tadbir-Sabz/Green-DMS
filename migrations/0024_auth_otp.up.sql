-- مهاجرت 0024 — کد یک‌بارمصرف پیامکی (OTP) برای /auth/otp/request و /auth/otp/verify
-- منبع: packages/contracts/openapi.yaml › /auth/otp/* + dms-design-report.md › ضمیمه H (OTP پیامکی)
-- فاز توسعه: ۱ | ماژول/بخش: identity-rbac (احراز هویت و کنترل دسترسی)
--
-- چرا لازم است:
--   * قرارداد verify نشست صادر می‌کند؛ بدون نگهداری کد، مهلت انقضا و سقف تلاش،
--     تأیید کد ممکن نیست (حدس‌زدن ۶ رقمی بدون سقف تلاش در چند ثانیه ممکن است).
--   * خودِ کد هرگز ذخیره نمی‌شود (هش scrypt مثل رمز عبور) تا نشت پایگاه‌داده
--     به کد قابل استفاده نینجامد.

create table auth_otp (
  id           uuid primary key default gen_random_uuid(),
  username     text not null,             -- بدون FK: درخواست برای نام ناشناخته باید بی‌اثر و بی‌صدا بماند
  phone        text,                      -- شماره مقصد (برای ممیزی)؛ null یعنی ارسالی انجام نشد
  purpose      text not null default 'login'
                 check (purpose in ('login', 'password_reset', 'device_bind')),
  code_hash    text not null,             -- هش scrypt کد؛ کد خام فقط در متن پیامک خروجی است
  sent_at      timestamptz not null default now(),
  expires_at   timestamptz not null,
  attempts     integer not null default 0,
  consumed_at  timestamptz
);

-- آخرین کد در انتظار هر کاربر (تأیید) + شمارش نرخ‌گیری درخواست‌ها
create index ix_auth_otp_pending on auth_otp (username) where consumed_at is null;
create index ix_auth_otp_sent    on auth_otp (username, purpose, sent_at desc);

comment on table auth_otp is
  'کد یک‌بارمصرف پیامکی: هر درخواست یک ردیف؛ تأیید موفق یا رسیدن به سقف تلاش آن را می‌سوزاند';
comment on column auth_otp.code_hash is
  'scrypt کد (مثل password_hash) — کد خام در دیتابیس نیست تا نشت دیتابیس بی‌اثر باشد';
comment on column auth_otp.attempts is
  'تلاش ناموفق تأیید؛ به سقف OTP_MAX_ATTEMPTS برسد کد می‌سوزد و verify با 429 رد می‌شود';
comment on column auth_otp.consumed_at is
  'زمان مصرف/سوختن کد؛ ردیف مصرف‌شده دیگر تأیید نمی‌شود (یک‌بارمصرف واقعی)';
