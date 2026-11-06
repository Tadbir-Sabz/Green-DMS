-- مهاجرت 0037 — پورتال B2B مشتریان: حسابِ کاربریِ جداگانه و نشستِ مجزا
-- طبقِ تصمیمِ امنیتی، پورتال از جدولِ جداگانهٔ portal_user (نه app_userِ کارکنان) و
-- از JWT با audience/typ مجزا استفاده می‌کند تا توکنِ پورتال هرگز روی APIِ داخلیِ
-- کارکنان اعتبار نیابد و برعکس. هر portal_user به یک customer و یک company وابسته
-- است؛ endpointهای /portal تنها دادهٔ همان customer را برمی‌گردانند.

create table portal_user (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references company(id),
  customer_id     uuid not null references customer(id),
  email           text not null,
  password_hash   text not null,          -- scrypt (همان قالبِ password.ts کارکنان)
  display_name    text,
  is_active       boolean not null default true,
  failed_attempts integer not null default 0,
  locked_until    timestamptz,
  last_login_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ایمیل سراسری یکتا: ورود با ایمیل، بدونِ نیاز به انتخابِ شرکت
create unique index uq_portal_user_email on portal_user (lower(email));
create index ix_portal_user_customer on portal_user (customer_id);
create index ix_portal_user_company  on portal_user (company_id);

create table portal_session (
  id             uuid primary key default gen_random_uuid(),
  portal_user_id uuid not null references portal_user(id) on delete cascade,
  company_id     uuid not null references company(id),   -- denormalized برای RLS/اسکوپ
  refresh_hash   text not null unique,                   -- sha256(refresh)؛ خودِ توکن ذخیره نمی‌شود
  expires_at     timestamptz not null,
  revoked_at     timestamptz,
  user_agent     text,
  ip             inet,
  created_at     timestamptz not null default now()
);
create index ix_portal_session_user on portal_session (portal_user_id);

-- RLS هم‌راستا با 0036/0021 (بدون FORCE؛ مالک=اپ آن را bypass می‌کند و اعمالِ اصلی
-- در ریپازیتوری با company_id/customer_id است). دفاع در عمق برای نقش‌های غیرمالک.
alter table portal_user    enable row level security;
alter table portal_session enable row level security;

create policy p_portal_user_tenant on portal_user
  using (company_id = current_setting('app.company_id')::uuid);
create policy p_portal_session_tenant on portal_session
  using (company_id = current_setting('app.company_id')::uuid);
