-- مهاجرت 0016 — بهای تمام‌شده، لایه FIFO، سند ارزشی، COGS
-- منبع: dms-design-report.md › ضمیمه G › G.۱۳
-- فاز توسعه: ۵ | ماژول/بخش: بهای تمام‌شده، لایه FIFO، سند ارزشی، COGS

create table product_cost (                                -- میانگین متحرک و بهای استاندارد جاری
  product_id       uuid not null references product(id),
  warehouse_id     uuid not null references warehouse(id),
  method           text not null check (method in ('moving_avg','fifo','standard')),
  avg_cost         numeric(19,4) not null default 0 check (avg_cost >= 0),
  standard_cost    numeric(19,4),
  last_purchase_cost numeric(19,4),
  qty_on_hand      numeric(19,4) not null default 0,
  value_on_hand    numeric(19,2) not null default 0,
  updated_at       timestamptz not null default now(),
  primary key (product_id, warehouse_id)
);

create table cost_layer (                                  -- لایه‌های FIFO
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references product(id),
  warehouse_id     uuid not null references warehouse(id),
  batch_id         uuid references batch(id),
  received_at      timestamptz not null,
  inventory_txn_id bigint,
  qty_in           numeric(19,4) not null check (qty_in > 0),
  qty_remaining    numeric(19,4) not null check (qty_remaining >= 0),
  unit_cost        numeric(19,4) not null check (unit_cost >= 0),
  landing_cost_per_unit numeric(19,4) not null default 0,
  constraint ck_cost_layer_remaining check (qty_remaining <= qty_in)
);

create index ix_cost_layer_open on cost_layer (product_id, warehouse_id, received_at)
  where qty_remaining > 0;

create table standard_cost_history (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references product(id),
  cost         numeric(19,4) not null check (cost >= 0),
  valid        daterange not null,
  reason       text,
  approved_by  uuid,
  constraint ex_standard_cost exclude using gist (product_id with =, valid with &&)
);

create table value_document (                              -- سند ارزشی (قرینه ریالی حرکت انبار)
  id             uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references branch(id),
  doc_number     text not null,
  fiscal_year    smallint not null,
  doc_date       date not null,
  kind           text not null check (kind in
                   ('receipt_value','issue_value','revaluation','write_off','count_variance',
                    'transfer_value','opening_value')),
  source_type    text not null,
  source_id      uuid not null,
  total_value    numeric(19,2) not null,
  status         text not null default 'draft' check (status in ('draft','posted','voided')),
  journal_entry_id uuid,                                   -- FK در §G.۱۵
  created_at     timestamptz not null default now(),
  constraint uq_value_document_doc unique (branch_id, fiscal_year, doc_number)
);

create table value_document_line (
  id                uuid primary key default gen_random_uuid(),
  value_document_id uuid not null references value_document(id) on delete cascade,
  product_id        uuid not null references product(id),
  warehouse_id      uuid not null references warehouse(id),
  batch_id          uuid references batch(id),
  qty               numeric(19,4) not null check (qty <> 0),
  unit_cost         numeric(19,4) not null,
  amount            numeric(19,2) not null
);

create table cogs_entry (                                  -- بهای تمام‌شده لحظه‌ای هر خط فروش
  id             uuid primary key default gen_random_uuid(),
  invoice_line_id uuid not null unique references invoice_line(id),
  product_id     uuid not null references product(id),
  qty            numeric(19,4) not null check (qty > 0),
  unit_cost      numeric(19,4) not null check (unit_cost >= 0),
  cost_amount    numeric(19,2) not null,
  method         text not null check (method in ('moving_avg','fifo','standard')),
  posted_at      timestamptz not null default now()
);

create table stock_valuation (                             -- عکس پایان دوره برای گزارش و حسابرسی
  id           uuid primary key default gen_random_uuid(),
  period_end   date not null,
  warehouse_id uuid not null references warehouse(id),
  product_id   uuid not null references product(id),
  qty          numeric(19,4) not null,
  unit_cost    numeric(19,4) not null,
  value        numeric(19,2) not null,
  constraint uq_stock_valuation unique (period_end, warehouse_id, product_id)
);

create index ix_stock_valuation_period on stock_valuation (period_end desc);

-- مغایرت‌گیری موجودی فیزیکی با ارزش دفتری (ماژول ۹ §۹.۳)

create or replace view v_stock_valuation_variance as
select sb.warehouse_id,
       sb.product_id,
       sb.qty_on_hand,
       sb.qty_on_hand_value,
       coalesce(sb.qty_on_hand * pc.avg_cost, 0) as expected_value,
       sb.qty_on_hand_value - coalesce(sb.qty_on_hand * pc.avg_cost, 0) as variance
  from stock_balance sb
  left join product_cost pc
    on pc.product_id = sb.product_id and pc.warehouse_id = sb.warehouse_id
 where pc.method = 'moving_avg'
   and abs(sb.qty_on_hand_value - coalesce(sb.qty_on_hand * pc.avg_cost, 0)) > 1;
