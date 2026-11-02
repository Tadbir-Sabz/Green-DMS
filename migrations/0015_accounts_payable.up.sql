-- مهاجرت 0015 — تأمین‌کننده، خرید، رسید، تطبیق سه‌طرفه
-- منبع: dms-design-report.md › ضمیمه G › G.۱۲
-- فاز توسعه: ۵ | ماژول/بخش: تأمین‌کننده، خرید، رسید، تطبیق سه‌طرفه

create table supplier (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references company(id),
  person_id       uuid not null unique references person(id),
  code            text not null,
  payment_term_days integer not null default 0 check (payment_term_days >= 0),
  lead_time_days  integer not null default 1,
  currency        char(3) not null default 'IRR',
  is_active       boolean not null default true,
  constraint uq_supplier_code unique (company_id, code)
);

-- چک پرداختی (ماژول ۱۰) به تأمین‌کننده (ماژول ۸) وصل می‌شود

alter table cheque
  add constraint fk_cheque_supplier foreign key (supplier_id) references supplier(id);

create table purchase_request (                            -- درخواست خرید
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references branch(id),
  doc_number  text not null,
  requested_by uuid not null,
  warehouse_id uuid not null references warehouse(id),
  needed_by   date,
  status      text not null default 'draft'
                check (status in ('draft','submitted','approved','rejected','converted','cancelled')),
  approval_request_id uuid references approval_request(id),
  created_at  timestamptz not null default now(),
  constraint uq_purchase_request_doc unique (branch_id, doc_number)
);

create table purchase_request_line (
  id                  uuid primary key default gen_random_uuid(),
  purchase_request_id uuid not null references purchase_request(id) on delete cascade,
  product_id          uuid not null references product(id),
  qty                 numeric(19,4) not null check (qty > 0),
  suggested_supplier_id uuid references supplier(id)
);

create table purchase_order (
  id           uuid primary key default gen_random_uuid(),
  branch_id    uuid not null references branch(id),
  doc_number   text not null,
  fiscal_year  smallint not null,
  supplier_id  uuid not null references supplier(id),
  request_id   uuid references purchase_request(id),
  warehouse_id uuid not null references warehouse(id),
  order_date   date not null default current_date,
  expected_date date,
  currency     char(3) not null default 'IRR',
  exchange_rate numeric(19,6) not null default 1 check (exchange_rate > 0),
  subtotal     numeric(19,2) not null default 0,
  discount_total numeric(19,2) not null default 0,
  tax_total    numeric(19,2) not null default 0,
  grand_total  numeric(19,2) not null default 0,
  status       text not null default 'draft' check (status in
                 ('draft','pending_approval','approved','partially_received','received','closed','cancelled')),
  approval_request_id uuid references approval_request(id),
  constraint uq_purchase_order_doc unique (branch_id, fiscal_year, doc_number),
  constraint ck_purchase_order_total check (grand_total = subtotal - discount_total + tax_total)
);

create index ix_purchase_order_open on purchase_order (branch_id, status)
  where status in ('approved','partially_received');

create table purchase_order_line (
  id               uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_order(id) on delete cascade,
  line_no          smallint not null,
  product_id       uuid not null references product(id),
  qty              numeric(19,4) not null check (qty > 0),
  qty_received     numeric(19,4) not null default 0 check (qty_received >= 0),
  unit_price       numeric(19,4) not null check (unit_price >= 0),
  discount_amount  numeric(19,2) not null default 0,
  tax_amount       numeric(19,2) not null default 0,
  line_total       numeric(19,2) not null,
  constraint uq_purchase_order_line unique (purchase_order_id, line_no),
  constraint ck_po_line_received check (qty_received <= qty)
);

create table goods_receipt (                               -- رسید انبار خرید (GRN)
  id                uuid primary key default gen_random_uuid(),
  branch_id         uuid not null references branch(id),
  doc_number        text not null,
  fiscal_year       smallint not null,
  purchase_order_id uuid references purchase_order(id),
  supplier_id       uuid not null references supplier(id),
  warehouse_id      uuid not null references warehouse(id),
  received_at       timestamptz not null default now(),
  received_by       uuid,
  status            text not null default 'draft'
                      check (status in ('draft','posted','voided')),
  note              text,
  constraint uq_goods_receipt_doc unique (branch_id, fiscal_year, doc_number)
);

create table goods_receipt_line (
  id               uuid primary key default gen_random_uuid(),
  goods_receipt_id uuid not null references goods_receipt(id) on delete cascade,
  purchase_order_line_id uuid references purchase_order_line(id),
  product_id       uuid not null references product(id),
  batch_id         uuid references batch(id),
  qty_received     numeric(19,4) not null check (qty_received > 0),
  qty_rejected     numeric(19,4) not null default 0 check (qty_rejected >= 0),
  unit_cost        numeric(19,4) not null check (unit_cost >= 0),
  constraint ck_grn_line_qty check (qty_rejected <= qty_received)
);

create table supplier_invoice (
  id               uuid primary key default gen_random_uuid(),
  branch_id        uuid not null references branch(id),
  doc_number       text not null,                          -- شماره فاکتور تأمین‌کننده
  internal_no      text not null,
  supplier_id      uuid not null references supplier(id),
  purchase_order_id uuid references purchase_order(id),
  invoice_date     date not null default current_date,
  due_date         date,
  amount           numeric(19,2) not null check (amount >= 0),
  tax_amount       numeric(19,2) not null default 0,
  status           text not null default 'draft' check (status in
                     ('draft','matched','mismatch','approved','partially_paid','paid','voided')),
  match_status     text not null default 'pending'
                     check (match_status in ('pending','matched','price_variance','qty_variance','no_grn')),
  constraint uq_supplier_invoice_no unique (supplier_id, doc_number),
  constraint uq_supplier_invoice_internal unique (branch_id, internal_no),
  constraint ck_supplier_invoice_due check (due_date is null or due_date >= invoice_date)
);

create table supplier_invoice_line (
  id                  uuid primary key default gen_random_uuid(),
  supplier_invoice_id uuid not null references supplier_invoice(id) on delete cascade,
  line_no             smallint not null,
  product_id          uuid not null references product(id),
  qty                 numeric(19,4) not null check (qty > 0),
  unit_price          numeric(19,4) not null,
  tax_amount          numeric(19,2) not null default 0,
  line_total          numeric(19,2) not null,
  constraint uq_supplier_invoice_line unique (supplier_invoice_id, line_no)
);

create table invoice_match (                               -- تطبیق سه‌طرفه: سفارش ← رسید ← فاکتور
  id                  uuid primary key default gen_random_uuid(),
  supplier_invoice_id uuid not null unique references supplier_invoice(id) on delete cascade,
  purchase_order_id   uuid not null references purchase_order(id),
  goods_receipt_id    uuid not null references goods_receipt(id),
  ordered_qty         numeric(19,4) not null,
  received_qty        numeric(19,4) not null,
  invoiced_qty        numeric(19,4) not null,
  ordered_amount      numeric(19,2) not null,
  invoiced_amount     numeric(19,2) not null,
  price_variance      numeric(19,2) not null default 0,
  qty_variance        numeric(19,4) not null default 0,
  tolerance_pct       numeric(5,2) not null default 1.0,
  result              text not null check (result in ('matched','price_variance','qty_variance','blocked')),
  approved_by         uuid,
  created_at          timestamptz not null default now(),
  constraint ck_match_qty check (
    abs(invoiced_qty - received_qty) <= received_qty * tolerance_pct / 100 or result <> 'matched')
);

create table payment_voucher (                             -- سند پرداخت به تأمین‌کننده
  id             uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references branch(id),
  doc_number     text not null,
  fiscal_year    smallint not null,
  supplier_id    uuid not null references supplier(id),
  payment_date   date not null default current_date,
  method_id      uuid not null references payment_method(id),
  amount         numeric(19,2) not null check (amount > 0),
  cash_box_id    uuid references cash_box(id),
  bank_account_id uuid references bank_account(id),
  cheque_id      uuid references cheque(id),
  status         text not null default 'draft' check (status in ('draft','posted','voided')),
  constraint uq_payment_voucher_doc unique (branch_id, fiscal_year, doc_number)
);

create table payment_allocation (
  id                uuid primary key default gen_random_uuid(),
  payment_voucher_id uuid not null references payment_voucher(id) on delete cascade,
  supplier_invoice_id uuid not null references supplier_invoice(id),
  amount            numeric(19,2) not null check (amount > 0),
  constraint uq_payment_allocation unique (payment_voucher_id, supplier_invoice_id)
);

create table landed_cost (                                 -- هزینه‌های اضافه خرید (حمل، بیمه، حقوق گمرکی)
  id               uuid primary key default gen_random_uuid(),
  branch_id        uuid not null references branch(id),
  goods_receipt_id uuid not null references goods_receipt(id),
  kind             text not null check (kind in ('freight','insurance','customs','port','other')),
  amount           numeric(19,2) not null check (amount > 0),
  supplier_id      uuid references supplier(id),
  allocation_method text not null default 'by_value'
                     check (allocation_method in ('by_value','by_qty','by_weight')),
  status           text not null default 'draft' check (status in ('draft','posted','voided'))
);

create table supplier_ledger_entry (
  id         bigint generated always as identity primary key,
  branch_id  uuid not null references branch(id),
  supplier_id uuid not null references supplier(id),
  entry_date date not null,
  doc_type   text not null check (doc_type in
               ('supplier_invoice','payment_voucher','credit_note','opening','adjustment')),
  doc_id     uuid not null,
  debit      numeric(19,2) not null default 0 check (debit >= 0),
  credit     numeric(19,2) not null default 0 check (credit >= 0),
  created_at timestamptz not null default now(),
  constraint ck_supplier_ledger_one_side check ((debit = 0) <> (credit = 0)),
  constraint uq_supplier_ledger_doc unique (doc_type, doc_id)
);

create index ix_supplier_ledger_supplier on supplier_ledger_entry (supplier_id, entry_date);
