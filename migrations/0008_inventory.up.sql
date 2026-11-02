-- مهاجرت 0008 — انبار، موجودی، انبارگردانی، بارگیری خودرو
-- منبع: dms-design-report.md › ضمیمه G › G.۵
-- فاز توسعه: ۱ | ماژول/بخش: انبار، موجودی، انبارگردانی، بارگیری خودرو

-- انبار یک مفهوم واحد با انواع مختلف است: خودرو، انبار مقصد، ضایعات و امانی
create table warehouse (
  id                 uuid primary key default gen_random_uuid(),
  branch_id          uuid not null references branch(id),
  code               text not null,
  name               text not null,
  kind               text not null default 'main'
                       check (kind in ('main','vehicle','transit','damaged','quarantine','consignment')),
  parent_warehouse_id uuid references warehouse(id),
  vehicle_id         uuid references vehicle(id),          -- فقط برای kind = 'vehicle'
  area_id            uuid references sales_area(id),
  allow_negative     boolean not null default false,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  row_version        integer not null default 0,
  constraint uq_warehouse_code unique (branch_id, code),
  constraint ck_warehouse_vehicle check ((kind = 'vehicle') = (vehicle_id is not null))
);

create unique index uq_warehouse_vehicle on warehouse (vehicle_id) where vehicle_id is not null;

-- مانده لحظه‌ای (مشتق از inventory_txn، اما برای کارایی و قفل ردیفی نگه داشته می‌شود)

create table stock_balance (
  warehouse_id uuid not null references warehouse(id),
  product_id   uuid not null references product(id),
  batch_id     uuid references batch(id),
  qty_on_hand  numeric(19,4) not null default 0,
  qty_reserved numeric(19,4) not null default 0,
  qty_on_hand_value numeric(19,2) not null default 0,      -- ارزش دفتری (ماژول ۹)
  updated_at   timestamptz not null default now(),
  constraint ck_stock_balance_qty check (qty_reserved >= 0)
);
-- سازمان‌بندی یکتا با احتساب NULL در batch

create unique index uq_stock_balance_nobatch on stock_balance (warehouse_id, product_id)
  where batch_id is null;

create unique index uq_stock_balance_batch on stock_balance (warehouse_id, product_id, batch_id)
  where batch_id is not null;

-- دفتر فقط‌افزودنی حرکت موجودی: منبع حقیقت

create table inventory_txn (
  id             bigint generated always as identity,
  branch_id      uuid not null references branch(id),
  warehouse_id   uuid not null references warehouse(id),
  product_id     uuid not null references product(id),
  batch_id       uuid references batch(id),
  txn_kind       text not null check (txn_kind in
                   ('purchase_in','sale_out','sale_return_in','purchase_return_out',
                    'transfer_in','transfer_out','count_gain','count_loss',
                    'damage_out','vehicle_load_out','vehicle_load_in','vehicle_return_in',
                    'adjust_in','adjust_out','consignment_out','consignment_in')),
  qty            numeric(19,4) not null check (qty <> 0),  -- مثبت ورود، منفی خروج
  unit_cost      numeric(19,4) not null default 0 check (unit_cost >= 0),
  source_type    text not null,                            -- goods_receipt | invoice | stock_transfer | ...
  source_id      uuid not null,
  source_line_id uuid,
  occurred_at    timestamptz not null default now(),
  posted_by      uuid,
  client_uuid    uuid,                                     -- از اپ میدانی (تکرارناپذیری)
  created_at     timestamptz not null default now(),
  primary key (id, occurred_at)
) partition by range (occurred_at);

create index ix_inventory_txn_doc on inventory_txn (source_type, source_id);

create index ix_inventory_txn_wh_product on inventory_txn (warehouse_id, product_id, occurred_at desc);

-- ایندکس یکتا روی جدول پارتیشن‌شده باید کلید پارتیشن را داشته باشد؛

-- پس تکرارناپذیری در یک دفتر کوچک و غیرپارتیشن‌شده تضمین می‌شود
create table client_sync_receipt (
  client_uuid uuid primary key,
  entity_type text not null,                                 -- inventory_txn | sales_order | visit | ...
  entity_id   uuid not null,
  received_at timestamptz not null default now()
);

-- ثبت حرکت و به‌روزرسانی مانده در یک تراکنش + بررسی منفی‌شدن

create or replace function fn_apply_stock_txn(p_txn inventory_txn) returns void
language plpgsql as $$
declare v_allow boolean; v_balance numeric(19,4);
begin
  select w.allow_negative into v_allow from warehouse w where w.id = p_txn.warehouse_id;

  if p_txn.batch_id is null then
    insert into stock_balance (warehouse_id, product_id, qty_on_hand)
         values (p_txn.warehouse_id, p_txn.product_id, p_txn.qty)
    on conflict (warehouse_id, product_id) where batch_id is null
      do update set qty_on_hand = stock_balance.qty_on_hand + excluded.qty_on_hand,
                    updated_at  = now()
      returning qty_on_hand into v_balance;
  else
    insert into stock_balance (warehouse_id, product_id, batch_id, qty_on_hand)
         values (p_txn.warehouse_id, p_txn.product_id, p_txn.batch_id, p_txn.qty)
    on conflict (warehouse_id, product_id, batch_id) where batch_id is not null
      do update set qty_on_hand = stock_balance.qty_on_hand + excluded.qty_on_hand,
                    updated_at  = now()
      returning qty_on_hand into v_balance;
  end if;

  if v_balance < 0 and not coalesce(v_allow, false) then
    raise exception 'موجودی منفی در انبار % برای کالا % مجاز نیست (مانده: %).',
      p_txn.warehouse_id, p_txn.product_id, v_balance using errcode = 'check_violation';
  end if;
end $$;

create table stock_reservation (                            -- رزرو برای سفارش تأییدشده
  id           uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references warehouse(id),
  product_id   uuid not null references product(id),
  batch_id     uuid references batch(id),
  qty          numeric(19,4) not null check (qty > 0),
  source_type  text not null,                              -- sales_order | waybill | return_request
  source_id    uuid not null,
  status       text not null default 'active' check (status in ('active','released','consumed')),
  expires_at   timestamptz,                                -- الزام رزرو با انقضا (ماژول ۲ §۲.۲)
  created_at   timestamptz not null default now()
);
-- یکتایی با احتساب NULL فقط با ایندکس بیانی ممکن است، نه UNIQUE constraint

create unique index uq_stock_reservation_source on stock_reservation
  (source_type, source_id, warehouse_id, product_id, coalesce(batch_id, '00000000-0000-0000-0000-000000000000'::uuid));

create index ix_stock_reservation_active on stock_reservation (warehouse_id, product_id)
  where status = 'active';

create table stock_count (                                  -- سرجلسه انبارگردانی
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid not null references branch(id),
  warehouse_id  uuid not null references warehouse(id),
  doc_number    text,
  mode          text not null default 'full' check (mode in ('full','cycle','spot')),
  status        text not null default 'draft'
                  check (status in ('draft','counting','review','approved','posted','voided')),
  counted_from  timestamptz,
  counted_to    timestamptz,
  counted_by    uuid,
  approved_by   uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  row_version   integer not null default 0,
  constraint uq_stock_count_doc unique (branch_id, doc_number)
);

create table stock_count_line (
  id             uuid primary key default gen_random_uuid(),
  stock_count_id uuid not null references stock_count(id) on delete cascade,
  product_id     uuid not null references product(id),
  batch_id       uuid references batch(id),
  qty_system     numeric(19,4) not null,
  qty_counted    numeric(19,4),
  unit_cost      numeric(19,4),
  variance_value numeric(19,2) generated always as
                   (coalesce((qty_counted - qty_system) * unit_cost, 0)) stored,
  reason_code    text,
  counted_by     uuid,
  counted_at     timestamptz
);

create unique index uq_stock_count_line on stock_count_line
  (stock_count_id, product_id, coalesce(batch_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table stock_transfer (
  id                 uuid primary key default gen_random_uuid(),
  branch_id          uuid not null references branch(id),
  doc_number         text,
  from_warehouse_id  uuid not null references warehouse(id),
  to_warehouse_id    uuid not null references warehouse(id),
  status             text not null default 'draft'
                       check (status in ('draft','approved','in_transit','received','voided')),
  sent_at            timestamptz,
  received_at        timestamptz,
  sent_by            uuid,
  received_by        uuid,
  constraint ck_stock_transfer_diff check (from_warehouse_id <> to_warehouse_id)
);

create table stock_transfer_line (
  id                uuid primary key default gen_random_uuid(),
  stock_transfer_id uuid not null references stock_transfer(id) on delete cascade,
  product_id        uuid not null references product(id),
  batch_id          uuid references batch(id),
  qty               numeric(19,4) not null check (qty > 0),
  qty_received      numeric(19,4),
  unit_cost         numeric(19,4) not null default 0
);

create table stock_adjustment (                             -- ضایعات، هدیه، مصرف داخلی
  id           uuid primary key default gen_random_uuid(),
  branch_id    uuid not null references branch(id),
  warehouse_id uuid not null references warehouse(id),
  doc_number   text,
  reason_code  text not null check (reason_code in
                 ('damage','expiry','sample','internal_use','theft','count_fix','other')),
  status       text not null default 'draft' check (status in ('draft','approved','posted','voided')),
  approved_by  uuid,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  row_version  integer not null default 0
);

create table stock_adjustment_line (
  id                  uuid primary key default gen_random_uuid(),
  stock_adjustment_id uuid not null references stock_adjustment(id) on delete cascade,
  product_id          uuid not null references product(id),
  batch_id            uuid references batch(id),
  qty                 numeric(19,4) not null check (qty <> 0),
  unit_cost           numeric(19,4) not null default 0
);

create table container_loan (                              -- ظروف امانی (بطری/قفس/پالت)
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references customer(id),
  product_id     uuid not null references product(id),     -- کالای ظرف
  qty_out        numeric(19,4) not null check (qty_out >= 0),
  qty_returned   numeric(19,4) not null default 0 check (qty_returned >= 0),
  deposit_amount numeric(19,2) not null default 0,
  opened_at      timestamptz not null default now(),
  closed_at      timestamptz,
  constraint ck_container_loan_qty check (qty_returned <= qty_out + 0)
);

create index ix_container_loan_open on container_loan (customer_id) where closed_at is null;

create table vehicle_load (                                -- برگه بارگیری خودرو (پخش گرم)
  id                uuid primary key default gen_random_uuid(),
  branch_id         uuid not null references branch(id),
  vehicle_warehouse_id uuid not null references warehouse(id),
  tour_id           uuid,                                  -- FK در §G.۸
  doc_number        text,
  loaded_at         timestamptz not null default now(),
  loaded_by         uuid,
  status            text not null default 'draft'
                      check (status in ('draft','loaded','settled','voided')),
  constraint uq_vehicle_load_doc unique (branch_id, doc_number)
);

create table vehicle_load_line (
  id              uuid primary key default gen_random_uuid(),
  vehicle_load_id uuid not null references vehicle_load(id) on delete cascade,
  product_id      uuid not null references product(id),
  batch_id        uuid references batch(id),
  qty_loaded      numeric(19,4) not null check (qty_loaded > 0),
  qty_returned    numeric(19,4) not null default 0 check (qty_returned >= 0),
  qty_damaged     numeric(19,4) not null default 0 check (qty_damaged >= 0)
);

create table reorder_policy (                              -- نقطه سفارش
  id           uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references warehouse(id),
  product_id   uuid not null references product(id),
  min_qty      numeric(19,4) not null default 0,
  max_qty      numeric(19,4),
  lead_time_days smallint not null default 1,
  constraint uq_reorder_policy unique (warehouse_id, product_id)
);
