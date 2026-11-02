-- مهاجرت 0011 — تور، بازدید، تسویه تور، فروش تلفنی، پورسانت
-- منبع: dms-design-report.md › ضمیمه G › G.۸
-- فاز توسعه: ۳ | ماژول/بخش: تور، بازدید، تسویه تور، فروش تلفنی، پورسانت

create table tour (
  id                 uuid primary key default gen_random_uuid(),
  branch_id          uuid not null references branch(id),
  doc_number         text,
  tour_date          date not null,
  kind               text not null check (kind in ('cold','warm')),   -- فروش سرد/گرم
  salesperson_id     uuid not null references staff(id),
  supervisor_id      uuid references staff(id),
  route_id           uuid references route(id),
  vehicle_id         uuid references vehicle(id),
  warehouse_id       uuid references warehouse(id),        -- انبار خودرو (پخش گرم)
  status             text not null default 'planned' check (status in
                       ('planned','approved','in_progress','completed','settled','cancelled')),
  planned_start_at   timestamptz,
  started_at         timestamptz,
  ended_at           timestamptz,
  approval_request_id uuid references approval_request(id),
  note               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  row_version        integer not null default 0,
  constraint uq_tour unique (branch_id, tour_date, salesperson_id, kind),
  constraint ck_tour_times check (ended_at is null or started_at is null or ended_at >= started_at)
);

create index ix_tour_today on tour (branch_id, tour_date, status);

create table tour_stop (                                   -- ایستگاه برنامه‌ریزی‌شده
  id          uuid primary key default gen_random_uuid(),
  tour_id     uuid not null references tour(id) on delete cascade,
  customer_id uuid not null references customer(id),
  seq         smallint not null check (seq > 0),
  planned_at  timestamptz,
  status      text not null default 'planned' check (status in ('planned','visited','skipped')),
  skip_reason text,
  constraint uq_tour_stop unique (tour_id, seq),
  constraint uq_tour_stop_customer unique (tour_id, customer_id)
);

create table visit (                                       -- بازدید واقعی با موقعیت
  id            uuid primary key default gen_random_uuid(),
  tour_id       uuid not null references tour(id) on delete cascade,
  customer_id   uuid not null references customer(id),
  check_in_at   timestamptz not null,
  check_out_at  timestamptz,
  geo_in        geography(Point, 4326),
  geo_out       geography(Point, 4326),
  accuracy_in_m numeric(8,2),
  distance_m    numeric(10,2),
  result        text not null default 'order' check (result in
                  ('order','no_order','closed','payment_only','return_only')),
  no_order_reason text,
  device_id     text,
  client_uuid   uuid,
  constraint ck_visit_times check (check_out_at is null or check_out_at >= check_in_at)
);

create index ix_visit_tour on visit (tour_id, check_in_at);

create index ix_visit_customer on visit (customer_id, check_in_at desc);

create unique index uq_visit_client on visit (client_uuid) where client_uuid is not null;

create table tour_settlement (                             -- تسویه پایان روز تور
  id                uuid primary key default gen_random_uuid(),
  tour_id           uuid not null unique references tour(id),
  doc_number        text,
  invoice_count     integer not null default 0,
  invoice_amount    numeric(19,2) not null default 0,
  cash_amount       numeric(19,2) not null default 0,
  card_amount       numeric(19,2) not null default 0,
  cheque_amount     numeric(19,2) not null default 0,
  credit_amount     numeric(19,2) not null default 0,
  return_amount     numeric(19,2) not null default 0,
  damaged_amount    numeric(19,2) not null default 0,
  expected_cash     numeric(19,2) not null default 0,      -- نقد مورد انتظار
  counted_cash      numeric(19,2),                          -- نقد شمارش‌شده
  variance_amount   numeric(19,2) generated always as
                      (coalesce(counted_cash - expected_cash, 0)) stored,
  leftover_goods_value numeric(19,2) not null default 0,   -- ارزش کالای باقی‌مانده خودرو
  status            text not null default 'draft'
                      check (status in ('draft','submitted','approved','posted','voided')),
  settled_by        uuid,
  approved_by       uuid,
  settled_at        timestamptz,
  cash_box_id       uuid,                                  -- FK در §G.۱۰
  constraint ck_tour_settlement_variance check (variance_amount between -100000000 and 100000000)
);

create table tour_settlement_line (                        -- تفکیک ابزار پرداخت
  id                  uuid primary key default gen_random_uuid(),
  tour_settlement_id  uuid not null references tour_settlement(id) on delete cascade,
  payment_method_id   uuid not null references payment_method(id),
  amount              numeric(19,2) not null,
  reference           text                                 -- شماره پیگیری پوز/چک
);

create unique index uq_tour_settlement_line on tour_settlement_line
  (tour_settlement_id, payment_method_id, coalesce(reference, ''));

create table telesale_target (                             -- هدف/سهمیه کارشناس تلفنی
  id             uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references branch(id),
  staff_id       uuid not null references staff(id),
  period_start   date not null,
  period_end     date not null,
  target_amount  numeric(19,2) not null default 0,
  target_calls   integer,
  target_orders  integer,
  constraint ck_telesale_period check (period_end >= period_start)
);

create table commission_plan (                             -- طرح پورسانت
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references company(id),
  code          text not null,
  title         text not null,
  basis         text not null check (basis in ('sales_amount','sales_qty','margin','collection','mixed')),
  kind          text not null check (kind in ('flat','tiered','target_bonus')),
  valid         daterange not null,
  applies_to    text not null default 'salesperson'
                  check (applies_to in ('salesperson','supervisor','driver','telesales')),
  constraint uq_commission_plan unique (company_id, code)
);

create table commission_tier (
  id                  uuid primary key default gen_random_uuid(),
  commission_plan_id  uuid not null references commission_plan(id) on delete cascade,
  from_value          numeric(19,2) not null default 0,
  to_value            numeric(19,2),
  rate_pct            numeric(6,3),
  flat_amount         numeric(19,2),
  constraint ck_commission_tier_range check (to_value is null or to_value >= from_value),
  constraint ck_commission_tier_value check (rate_pct is not null or flat_amount is not null)
);

create table commission_line (                             -- نتیجه محاسبه (قابل بازبینی و اعتراض)
  id             uuid primary key default gen_random_uuid(),
  commission_plan_id uuid not null references commission_plan(id),
  staff_id       uuid not null references staff(id),
  period_start   date not null,
  period_end     date not null,
  basis_amount   numeric(19,2) not null,
  rate_pct       numeric(6,3),
  amount         numeric(19,2) not null,
  source_type    text,                                     -- invoice | receipt | tour_settlement
  source_id      uuid,
  status         text not null default 'calculated'
                   check (status in ('calculated','approved','paid','reversed')),
  approved_by    uuid,
  created_at     timestamptz not null default now()
);

create index ix_commission_line_staff on commission_line (staff_id, period_start desc);

alter table customer_request
  add constraint fk_customer_request_tour  foreign key (tour_id) references tour(id),
  add constraint fk_customer_request_order foreign key (sales_order_id) references sales_order(id);

alter table sales_order
  add constraint fk_sales_order_tour foreign key (tour_id) references tour(id);

alter table delivery
  add constraint fk_delivery_tour foreign key (tour_id) references tour(id);

alter table return_request
  add constraint fk_return_request_tour foreign key (tour_id) references tour(id);

alter table vehicle_load
  add constraint fk_vehicle_load_tour foreign key (tour_id) references tour(id);
