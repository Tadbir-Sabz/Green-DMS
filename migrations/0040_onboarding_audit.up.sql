-- 0040 — ممیزیِ تلاش‌هایِ خودخدمت‌دهیِ استقرار (onboarding)
--
-- چرا: POST /onboarding/register عمومی و بدونِ نشست است. برایِ دفاع در برابرِ
-- ساختِ انبوهِ اجاره/سوءاستفاده، علاوه بر نرخ‌گذاری باید «ردِ پایِ» هر تلاش
-- (موفق یا رد‌شده) نگه داشته شود تا الگوهایِ خودکار قابلِ تشخیص و پیگیری باشند.
--
-- این جدول «سراسری» است و عمداً company_id-محور نیست: بسیاریِ تلاش‌ها پیش از آنکه
-- شرکتی وجود داشته باشد رخ می‌دهند. بنابراین RLS اجاره‌ای روی آن معنا ندارد و
-- دسترسی به آن باید فقط از راهِ نقشِ برنامه (و مدیرانِ ممیزی) باشد.
-- هیچ دادهٔ حساسی (رمز/هشِ رمز) اینجا ذخیره نمی‌شود.

create table onboarding_attempt (
  id            uuid primary key default gen_random_uuid(),
  occurred_at   timestamptz not null default now(),

  -- منشأ درخواست (برایِ نرخ‌گذاری و تشخیصِ الگو). IP به‌صورتِ inet تا هم v4 هم v6
  -- و هم CIDR قابلِ جست‌وجو باشند.
  client_ip     inet,
  user_agent    text,

  -- هویتِ «ادعاشده» در تلاش (برایِ تشخیصِ پیمایشِ فضای نام). رمز هرگز ثبت نمی‌شود.
  company_code  text,
  admin_email   text,

  outcome       text not null,
  reason_code   text,

  -- در صورتِ موفقیت، اجارهٔ ساخته‌شده. on delete set null تا تاریخچهٔ ممیزی
  -- با حذفِ یک شرکت از بین نرود.
  company_id    uuid references company(id) on delete set null,

  constraint ck_onboarding_attempt_outcome check (outcome in (
    'created',                 -- اجاره ساخته شد
    'rejected_rate_limit',     -- سقفِ نرخ (IP یا سراسری)
    'rejected_policy',         -- رمزِ ضعیف یا کدِ دعوتِ نامعتبر
    'rejected_conflict',       -- کدِ شرکت/ایمیل تکراری
    'failed'                   -- خطایِ غیرمنتظرهٔ سرور
  ))
);

comment on table onboarding_attempt is
  'ممیزیِ تلاش‌هایِ ثبتِ اجارهٔ خودخدمت (موفق و رد‌شده) — بدونِ ذخیرهٔ رمز یا هشِ رمز';

-- جست‌وجویِ رایج: تلاش‌هایِ اخیرِ یک IP / یک کدِ شرکت / کلِ سیستم
create index ix_onboarding_attempt_time on onboarding_attempt (occurred_at desc);
create index ix_onboarding_attempt_ip on onboarding_attempt (client_ip, occurred_at desc);
create index ix_onboarding_attempt_code on onboarding_attempt (lower(company_code), occurred_at desc);
create index ix_onboarding_attempt_outcome on onboarding_attempt (outcome, occurred_at desc);
