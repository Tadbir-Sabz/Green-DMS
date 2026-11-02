-- مهاجرت 0007 — روش پرداخت، تسویه، مشتری، سقف اعتبار
-- منبع: dms-design-report.md › ضمیمه G › G.۴.۵
-- فاز توسعه: ۱ | ماژول/بخش: روش پرداخت، تسویه، مشتری، سقف اعتبار

create table payment_method (
  id      uuid primary key default gen_random_uuid(),
  code    text not null unique,                             -- cash | card | cheque | credit | online
  title   text not null,
  kind    text not null check (kind in ('cash','card','cheque','credit','online','offset')),
  requires_reference boolean not null default false,        -- شماره پیگیری/شبا/شماره چک
  is_active boolean not null default true
);

create table settlement_term (                             -- نحوه/مهلت مجاز تسویه
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references company(id),
  code         text not null,
  title        text not null,
  due_days     smallint not null default 0 check (due_days >= 0),
  allowed_methods text[] not null default '{cash}',        -- زیرمجموعه payment_method.code
  max_cheque_count integer,
  constraint uq_settlement_term unique (company_id, code)
);

create table customer (
  id                     uuid primary key default gen_random_uuid(),
  person_id              uuid not null unique references person(id),
  branch_id              uuid not null references branch(id),
  code                   text not null,
  area_id                uuid references sales_area(id),
  route_id               uuid references route(id),
  salesperson_id         uuid references staff(id),        -- ویزیتور ثابت
  channel                text not null default 'retail'
                           check (channel in ('retail','wholesale','chain','horeca','institution')),
  price_list_id          uuid references price_list(id),
  settlement_term_id     uuid references settlement_term(id),
  default_payment_method_id uuid references payment_method(id),
  visit_sequence         integer,                          -- ترتیب بازدید پیشنهادی در مسیر
  geo                    geography(Point, 4326),
  geo_accuracy_m         numeric(8,2),
  geo_source             text check (geo_source in ('gps','map_pick','geocode','import')),
  geo_captured_at        timestamptz,
  geo_captured_by        uuid,                             -- ثبت موقعیت توسط فروشنده در اپ
  status                 text not null default 'active'
                           check (status in ('active','suspended','blocked','closed')),
  deleted_at             timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  row_version            integer not null default 0,
  constraint uq_customer_code unique (branch_id, code),
  constraint ck_customer_geo check (geo is null or (geo_source is not null and geo_captured_at is not null))
);

create index ix_customer_geo on customer using gist (geo);

create index ix_customer_route on customer (route_id, visit_sequence) where status = 'active';

create index ix_customer_salesperson on customer (salesperson_id) where status = 'active';

alter table customer_price
  add constraint fk_customer_price_customer foreign key (customer_id) references customer(id) on delete cascade;

create table customer_credit (                             -- سقف اعتبار و قواعد وصول
  customer_id          uuid primary key references customer(id) on delete cascade,
  credit_limit         numeric(19,2) not null default 0 check (credit_limit >= 0),
  extra_limit          numeric(19,2) not null default 0 check (extra_limit >= 0),
  extra_limit_expires_on date,
  cheque_allowed       boolean not null default true,
  max_open_cheques     integer,
  max_overdue_days     integer not null default 0,
  block_on_overdue     boolean not null default true,
  updated_at           timestamptz not null default now(),
  updated_by           uuid
);

alter table route_salesperson
  add constraint fk_route_salesperson_staff foreign key (salesperson_id) references staff(id);
