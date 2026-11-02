-- مهاجرت 0017 — قالب چاپ/پیامک، اعتبارنامه سرویس‌ها، webhook
-- منبع: dms-design-report.md › ضمیمه G › G.۱۴
-- فاز توسعه: ۱۱ | ماژول/بخش: قالب چاپ/پیامک، اعتبارنامه سرویس‌ها، webhook

create table print_template (                              -- قالب چاپ فاکتور/حواله/رسید
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references company(id),
  doc_kind    text not null,
  name        text not null,
  paper_size  text not null default 'A5' check (paper_size in ('A4','A5','thermal_80','thermal_58')),
  layout      jsonb not null,                              -- مؤلفه‌ها، لوگو، مهر و امضا
  is_default  boolean not null default false,
  updated_at  timestamptz not null default now(),
  constraint uq_print_template unique (company_id, doc_kind, name)
);

create unique index uq_print_template_default on print_template (company_id, doc_kind) where is_default;

create table sms_template (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references company(id),
  code        text not null,                               -- invoice_issued | payment_due | otp | pod
  title       text not null,
  body        text not null,                               -- با متغیرهای {{customer}} و {{amount}}
  provider_template_id text,
  is_active   boolean not null default true,
  constraint uq_sms_template unique (company_id, code)
);

create table integration_credential (                      -- کلید سرویس‌های بیرونی (رمزنگاری‌شده)
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references company(id),
  provider      text not null check (provider in
                  ('moadian','psp','sms','map','push','bank','storage')),
  title         text not null,
  secret_enc    bytea not null,                            -- AES-GCM با کلید KMS، هرگز متن ساده
  meta          jsonb not null default '{}'::jsonb,        -- شناسه ترمینال، شماره خط، ...
  valid_until   timestamptz,
  rotated_at    timestamptz,
  is_active     boolean not null default true,
  constraint uq_integration_credential unique (company_id, provider, title)
);

create table webhook_endpoint (                            -- مصرف‌کننده بیرونی (API مشتری سازمانی)
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references company(id),
  url           text not null,
  secret_hash   text not null,
  events        text[] not null default '{}',              -- invoice.posted, order.approved, ...
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table webhook_delivery (
  id           uuid primary key default gen_random_uuid(),
  endpoint_id  uuid not null references webhook_endpoint(id) on delete cascade,
  event        text not null,
  payload      jsonb not null,
  status       text not null default 'pending'
                 check (status in ('pending','delivered','failed','dead')),
  attempt      smallint not null default 0,
  last_error   text,
  next_retry_at timestamptz,
  delivered_at timestamptz,
  created_at   timestamptz not null default now()
);

create index ix_webhook_delivery_retry on webhook_delivery (next_retry_at)
  where status in ('pending','failed');

create table feature_flag (                                -- انتشار تدریجی قابلیت به حوزه/شعبه
  id         uuid primary key default gen_random_uuid(),
  key        text not null,
  scope_type text not null default 'company' check (scope_type in ('company','branch','area','user')),
  scope_id   uuid not null,
  is_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  constraint uq_feature_flag unique (key, scope_type, scope_id)
);
