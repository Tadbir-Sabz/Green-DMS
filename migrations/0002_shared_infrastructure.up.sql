-- مهاجرت 0002 — شرکت، شعبه، شماره‌گذاری اسناد، تنظیمات، پیوست، ممیزی
-- منبع: dms-design-report.md › ضمیمه G › G.۳
-- فاز توسعه: ۱ | ماژول/بخش: شرکت، شعبه، شماره‌گذاری اسناد، تنظیمات، پیوست، ممیزی

create table company (
  id              uuid primary key default gen_random_uuid(),
  code            text not null,
  legal_name      text not null,
  national_id     text,                                  -- شناسه ملی
  economic_code   text,                                  -- شماره اقتصادی، لازم برای مؤدیان
  currency        char(3) not null default 'IRR',
  vat_enabled     boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  row_version     integer not null default 0,
  constraint uq_company_code unique (code)
);

create table branch (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references company(id),
  code        text not null,
  name        text not null,
  address     text,
  phone       text,
  timezone    text not null default 'Asia/Tehran',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  row_version integer not null default 0,
  constraint uq_branch_code unique (company_id, code)
);

-- سری شماره‌گذاری: هر شعبه، هر نوع سند، هر سال مالی

create table document_series (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references branch(id),
  doc_kind    text not null check (doc_kind in
                ('sales_order','waybill','invoice','credit_note','return_request',
                 'purchase_order','goods_receipt','supplier_invoice','payment_voucher',
                 'receipt','journal','stock_count','stock_transfer','tour_receipt')),
  fiscal_year smallint not null check (fiscal_year between 1300 and 1500),
  prefix      text not null default '',
  is_active   boolean not null default true,
  constraint uq_document_series unique (branch_id, doc_kind, fiscal_year)
);

-- شمارنده اتمی: شماره سند هرگز تکراری نمی‌شود و حذف/دوباره‌استفاده ندارد

create table number_counter (
  series_id   uuid not null references document_series(id) on delete cascade,
  period      text not null,          -- '1405' یا '1405-07'
  last_number bigint not null default 0,
  primary key (series_id, period)
);

create or replace function fn_next_doc_number(p_series uuid, p_period text)
returns bigint language plpgsql as $$
declare v_next bigint;
begin
  insert into number_counter (series_id, period, last_number)
       values (p_series, p_period, 1)
  on conflict (series_id, period)
    do update set last_number = number_counter.last_number + 1
    returning last_number into v_next;
  return v_next;
end $$;

-- تنظیمات سلسله‌مراتبی (ماژول ۱۱): کاربر ← حوزه ← شعبه ← شرکت

create table setting (
  id         uuid primary key default gen_random_uuid(),
  key        text not null,
  scope_type text not null check (scope_type in ('company','branch','area','region','route','user')),
  scope_id   uuid not null,
  value      jsonb not null,
  value_type text not null default 'json'
               check (value_type in ('bool','int','decimal','text','json','time','date')),
  is_secret  boolean not null default false,   -- مقدار محرمانه در KMS، نه در این ستون
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create unique index uq_setting_scope on setting (key, scope_type, scope_id);

create or replace function fn_setting(p_key text, p_company uuid,
                                      p_branch uuid default null,
                                      p_area uuid default null,
                                      p_user uuid default null)
returns jsonb language sql stable as $$
  select s.value from setting s
   where s.key = p_key
     and ((s.scope_type = 'user'    and s.scope_id = p_user)
       or (s.scope_type = 'area'    and s.scope_id = p_area)
       or (s.scope_type = 'branch'  and s.scope_id = p_branch)
       or (s.scope_type = 'company' and s.scope_id = p_company))
   order by case s.scope_type when 'user' then 1 when 'area' then 2
                              when 'branch' then 3 else 4 end
   limit 1
$$;

create table attachment (
  id           uuid primary key default gen_random_uuid(),
  owner_type   text not null,                    -- pod | invoice | journal_entry | ...
  owner_id     uuid not null,
  file_name    text not null,
  content_type text not null,
  size_bytes   integer not null check (size_bytes > 0),
  storage_key  text not null,                    -- کلید در S3/MinIO، هرگز خود فایل
  sha256       text not null,
  uploaded_by  uuid,
  created_at   timestamptz not null default now(),
  constraint uq_attachment_key unique (storage_key)
);

create index ix_attachment_owner on attachment (owner_type, owner_id);

create table audit_log (
  id            bigint generated always as identity,
  company_id    uuid,
  actor_user_id uuid,
  action        text not null,                   -- create | update | void | approve | login | export
  entity_type   text not null,
  entity_id     uuid,
  before_data   jsonb,
  after_data    jsonb,
  ip            inet,
  user_agent    text,
  request_id    text,
  at            timestamptz not null default now(),
  primary key (id, at)
) partition by range (at);
