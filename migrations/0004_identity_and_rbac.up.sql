-- مهاجرت 0004 — شخص، پرسنل، کاربری، نقش‌ها، مجوزها، وسیله نقلیه
-- منبع: dms-design-report.md › ضمیمه G › G.۴.۲
-- فاز توسعه: ۱ | ماژول/بخش: شخص، پرسنل، کاربری، نقش‌ها، مجوزها، وسیله نقلیه

create table person (                                      -- مرکز واحد: مشتری و پرسنل هر دو شخص‌اند
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references company(id),
  code         text not null,
  legal_type   text not null default 'natural' check (legal_type in ('natural','legal')),
  first_name   text,
  last_name    text,
  legal_name   text,                                       -- برای شخص حقوقی
  national_id  text,
  economic_code text,
  is_active    boolean not null default true,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  row_version  integer not null default 0,
  constraint uq_person_code unique (company_id, code),
  constraint ck_person_name check (legal_type = 'legal' and legal_name is not null
                                   or legal_type = 'natural' and (first_name is not null or last_name is not null))
);

create unique index uq_person_national_id on person (company_id, national_id)
  where national_id is not null and deleted_at is null;

create index ix_person_name_trgm on person using gin ((coalesce(first_name,'') || ' ' || coalesce(last_name,'')) gin_trgm_ops);

create table person_phone (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references person(id) on delete cascade,
  phone      text not null,
  kind       text not null default 'mobile' check (kind in ('mobile','landline','fax','whatsapp')),
  is_primary boolean not null default false,
  constraint uq_person_phone unique (person_id, phone)
);

create unique index uq_person_primary_phone on person_phone (person_id) where is_primary;

create table person_address (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references person(id) on delete cascade,
  title      text,
  province   text,
  city       text,
  address    text not null,
  postal_code text,
  geo        geography(Point, 4326),
  is_default boolean not null default false
);

create table job_position (                                -- شغل/پست سازمانی
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  code       text not null,
  title      text not null,
  department text,
  constraint uq_job_position_code unique (company_id, code)
);

create table staff (
  id              uuid primary key default gen_random_uuid(),
  person_id       uuid not null unique references person(id),
  branch_id       uuid not null references branch(id),
  job_position_id uuid not null references job_position(id),
  employee_no     text,
  hire_date       date,
  supervisor_id   uuid references staff(id),               -- سرپرست فروشندگان
  vehicle_id      uuid,                                     -- FK در همین بخش افزوده می‌شود
  is_field        boolean not null default false,
  status          text not null default 'active'
                    check (status in ('active','suspended','terminated')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  row_version     integer not null default 0,
  constraint uq_staff_employee_no unique (branch_id, employee_no),
  constraint ck_staff_no_self_supervisor check (supervisor_id is null or supervisor_id <> id)
);

create index ix_staff_supervisor on staff (supervisor_id) where status = 'active';

-- نوع دسترسی کاربر (ماژول ۱ §۱.۴): وب، سه اپ میدانی، فقط محدوده، یا بدون کاربری

create table app_user (
  id                   uuid primary key default gen_random_uuid(),
  person_id            uuid not null unique references person(id),
  username             text not null,
  password_hash        text,                               -- null یعنی ورود فقط با OTP
  access_level         text not null check (access_level in
                         ('web','field_sales','field_delivery','field_telesales','scope_only','none')),
  is_locked            boolean not null default false,
  must_change_password boolean not null default false,
  failed_attempts      integer not null default 0,
  mfa_secret_enc       text,
  last_login_at        timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  row_version          integer not null default 0,
  constraint uq_app_user_username unique (username)
);

create table role (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  code       text not null,
  name       text not null,
  is_system  boolean not null default false,
  constraint uq_role_code unique (company_id, code)
);

create table permission (
  code   text primary key,                                 -- sales.invoice.issue
  module text not null,
  title  text not null
);

create table role_permission (
  role_id         uuid not null references role(id) on delete cascade,
  permission_code text not null references permission(code) on delete cascade,
  primary key (role_id, permission_code)
);

create table user_role (
  app_user_id uuid not null references app_user(id) on delete cascade,
  role_id     uuid not null references role(id) on delete cascade,
  primary key (app_user_id, role_id)
);

-- دامنه داده (ABAC/Row-level): انباردار فقط انبار خودش، ویزیتور فقط مسیر خودش

create table user_scope (
  app_user_id uuid not null references app_user(id) on delete cascade,
  scope_type  text not null check (scope_type in ('branch','area','region','route','warehouse')),
  scope_id    uuid not null,
  primary key (app_user_id, scope_type, scope_id)
);

create table vehicle (
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid not null references branch(id),
  plate         text not null,
  kind          text not null default 'van' check (kind in ('van','truck','pickup','motorcycle')),
  capacity_kg   numeric(10,2),
  capacity_volume_m3 numeric(10,3),
  ownership     text not null default 'owned' check (ownership in ('owned','rented','contractor')),
  is_active     boolean not null default true,
  constraint uq_vehicle_plate unique (branch_id, plate)
);

alter table staff
  add constraint fk_staff_vehicle foreign key (vehicle_id) references vehicle(id);
