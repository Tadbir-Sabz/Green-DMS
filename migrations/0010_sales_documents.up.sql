-- مهاجرت 0010 — درخواست، سفارش، حواله، فاکتور، توزیع، مرجوعی، مؤدیان
-- منبع: dms-design-report.md › ضمیمه G › G.۷
-- فاز توسعه: ۲ | ماژول/بخش: درخواست، سفارش، حواله، فاکتور، توزیع، مرجوعی، مؤدیان

-- درخواست مشتری (سفارش اولیه/ثبت‌شده توسط ویزیتور یا تلفنی یا پورتال)
create table customer_request (
  id             uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references branch(id),
  customer_id    uuid not null references customer(id),
  channel        text not null check (channel in ('field','telesale','portal','walk_in')),
  requested_by   uuid not null,                            -- app_user
  tour_id        uuid,                                     -- FK در §G.۸
  request_date   date not null default current_date,
  requested_delivery_date date,
  note           text,
  status         text not null default 'draft'
                   check (status in ('draft','submitted','converted','rejected','cancelled')),
  sales_order_id uuid,                                     -- پس از تبدیل پر می‌شود
  client_uuid    uuid,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  row_version    integer not null default 0
);

create index ix_customer_request_status on customer_request (branch_id, status, request_date desc);

create unique index uq_customer_request_client on customer_request (client_uuid) where client_uuid is not null;

create table customer_request_line (
  id                    uuid primary key default gen_random_uuid(),
  customer_request_id   uuid not null references customer_request(id) on delete cascade,
  product_id            uuid not null references product(id),
  packaging_id          uuid references product_packaging(id),
  qty                   numeric(19,4) not null check (qty > 0),
  requested_price       numeric(19,4),                     -- قیمتی که اپ نشان داده (برای تشخیص اختلاف)
  note                  text
);

create table sales_order (
  id              uuid primary key default gen_random_uuid(),
  branch_id       uuid not null references branch(id),
  doc_number      text not null,
  fiscal_year     smallint not null,
  customer_id     uuid not null references customer(id),
  request_id      uuid references customer_request(id),
  salesperson_id  uuid references staff(id),
  tour_id         uuid,
  channel         text not null default 'field'
                    check (channel in ('field','telesale','portal','walk_in')),
  order_date      date not null default current_date,
  delivery_date   date,
  price_list_id   uuid references price_list(id),
  subtotal        numeric(19,2) not null default 0,
  discount_total  numeric(19,2) not null default 0,
  tax_total       numeric(19,2) not null default 0,
  grand_total     numeric(19,2) not null default 0,
  settlement_term_id uuid references settlement_term(id),
  status          text not null default 'draft' check (status in
                    ('draft','pending_approval','approved','partially_delivered',
                     'delivered','invoiced','cancelled','rejected')),
  approval_request_id uuid references approval_request(id),
  note            text,
  client_uuid     uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  row_version     integer not null default 0,
  constraint uq_sales_order_doc unique (branch_id, fiscal_year, doc_number),
  constraint ck_sales_order_total check (grand_total = subtotal - discount_total + tax_total)
);

create index ix_sales_order_customer on sales_order (customer_id, order_date desc);

create index ix_sales_order_open on sales_order (branch_id, status) where status in ('approved','partially_delivered');

create unique index uq_sales_order_client on sales_order (client_uuid) where client_uuid is not null;

create table sales_order_line (
  id             uuid primary key default gen_random_uuid(),
  sales_order_id uuid not null references sales_order(id) on delete cascade,
  line_no        smallint not null,
  product_id     uuid not null references product(id),
  packaging_id   uuid references product_packaging(id),
  qty            numeric(19,4) not null check (qty > 0),
  qty_base       numeric(19,4) not null check (qty_base > 0),   -- مقدار به واحد پایه
  unit_price     numeric(19,4) not null check (unit_price >= 0),
  discount_pct   numeric(5,2) not null default 0 check (discount_pct between 0 and 100),
  discount_amount numeric(19,2) not null default 0 check (discount_amount >= 0),
  promotion_id   uuid references promotion(id),                 -- منشأ تخفیف (رهگیری)
  tax_rate_pct   numeric(5,2) not null default 0,
  tax_amount     numeric(19,2) not null default 0,
  line_total     numeric(19,2) not null,
  constraint uq_sales_order_line unique (sales_order_id, line_no)
);

create table waybill (                                     -- حواله انبار
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid not null references branch(id),
  doc_number    text not null,
  fiscal_year   smallint not null,
  sales_order_id uuid references sales_order(id),
  customer_id   uuid not null references customer(id),
  warehouse_id  uuid not null references warehouse(id),
  issued_at     timestamptz not null default now(),
  issued_by     uuid,
  status        text not null default 'draft' check (status in ('draft','issued','delivered','voided')),
  note          text,
  constraint uq_waybill_doc unique (branch_id, fiscal_year, doc_number)
);

create table waybill_line (
  id         uuid primary key default gen_random_uuid(),
  waybill_id uuid not null references waybill(id) on delete cascade,
  line_no    smallint not null,
  product_id uuid not null references product(id),
  batch_id   uuid references batch(id),
  qty        numeric(19,4) not null check (qty > 0),
  constraint uq_waybill_line unique (waybill_id, line_no)
);

create table invoice (
  id              uuid primary key default gen_random_uuid(),
  branch_id       uuid not null references branch(id),
  doc_number      text not null,
  fiscal_year     smallint not null,
  series_id       uuid not null references document_series(id),
  customer_id     uuid not null references customer(id),
  sales_order_id  uuid references sales_order(id),
  waybill_id      uuid references waybill(id),
  invoice_date    date not null default current_date,
  due_date        date,
  subtotal        numeric(19,2) not null default 0,
  discount_total  numeric(19,2) not null default 0,
  tax_total       numeric(19,2) not null default 0,
  grand_total     numeric(19,2) not null default 0,
  paid_amount     numeric(19,2) not null default 0 check (paid_amount >= 0),
  status          text not null default 'draft' check (status in
                    ('draft','posted','partially_paid','paid','voided')),
  return_status   text not null default 'none' check (return_status in ('none','partial','full')),
  moadian_status  text not null default 'not_sent'
                    check (moadian_status in ('not_sent','queued','sent','accepted','rejected','corrected')),
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  row_version     integer not null default 0,
  constraint uq_invoice_doc unique (branch_id, fiscal_year, doc_number),
  constraint uq_invoice_series_number unique (series_id, fiscal_year, doc_number),
  constraint ck_invoice_total check (grand_total = subtotal - discount_total + tax_total),
  constraint ck_invoice_due check (due_date is null or due_date >= invoice_date)
);

create index ix_invoice_customer_open on invoice (customer_id, due_date)
  where status in ('posted','partially_paid');

create index ix_invoice_moadian_queue on invoice (branch_id, moadian_status)
  where moadian_status in ('not_sent','queued','rejected');

create trigger trg_invoice_immutable before update on invoice
  for each row execute function fn_immutable_after_post();

create table invoice_line (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references invoice(id) on delete cascade,
  line_no      smallint not null,
  product_id   uuid not null references product(id),
  batch_id     uuid references batch(id),
  qty          numeric(19,4) not null check (qty > 0),
  unit_price   numeric(19,4) not null,
  discount_amount numeric(19,2) not null default 0,
  tax_rate_pct numeric(5,2) not null default 0,
  tax_amount   numeric(19,2) not null default 0,
  line_total   numeric(19,2) not null,
  tax_code_id  uuid references tax_code(id),
  constraint uq_invoice_line unique (invoice_id, line_no)
);

create table credit_note (                                 -- برگشت از فروش/اصلاحی
  id             uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references branch(id),
  doc_number     text not null,
  fiscal_year    smallint not null,
  invoice_id     uuid not null references invoice(id),
  customer_id    uuid not null references customer(id),
  reason_code    text not null check (reason_code in
                   ('sales_return','price_correction','damaged','expired','shortage','other')),
  amount         numeric(19,2) not null check (amount > 0),
  status         text not null default 'draft' check (status in ('draft','posted','voided')),
  issued_at      timestamptz not null default now(),
  constraint uq_credit_note_doc unique (branch_id, fiscal_year, doc_number),
  constraint ck_credit_note_amount check (amount > 0)
);

create table credit_note_line (
  id             uuid primary key default gen_random_uuid(),
  credit_note_id uuid not null references credit_note(id) on delete cascade,
  invoice_line_id uuid references invoice_line(id),
  product_id     uuid not null references product(id),
  qty            numeric(19,4) not null check (qty > 0),
  unit_price     numeric(19,4) not null,
  tax_amount     numeric(19,2) not null default 0,
  line_total     numeric(19,2) not null
);

-- مدیریت و پیگیری توزیع

create table delivery (
  id             uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references branch(id),
  doc_number     text not null,
  waybill_id     uuid not null references waybill(id),
  customer_id    uuid not null references customer(id),
  tour_id        uuid,
  courier_staff_id uuid references staff(id),                -- موزع
  planned_date   date not null,
  delivered_at   timestamptz,
  status         text not null default 'planned' check (status in
                   ('planned','dispatched','delivered','partial','failed','cancelled')),
  failure_reason text,
  signature_attachment_id uuid references attachment(id),
  photo_attachment_id     uuid references attachment(id),
  receiver_name  text,
  constraint uq_delivery_doc unique (branch_id, doc_number)
);

create index ix_delivery_tour on delivery (tour_id, status);

create index ix_delivery_open on delivery (branch_id, planned_date) where status in ('planned','dispatched');

create table delivery_line (
  id          uuid primary key default gen_random_uuid(),
  delivery_id uuid not null references delivery(id) on delete cascade,
  product_id  uuid not null references product(id),
  qty_planned numeric(19,4) not null,
  qty_delivered numeric(19,4) not null default 0,
  qty_rejected numeric(19,4) not null default 0,
  constraint ck_delivery_line_qty check (qty_delivered + qty_rejected <= qty_planned)
);

create table pod (                                         -- مدرک تحویل
  id             uuid primary key default gen_random_uuid(),
  delivery_id    uuid not null unique references delivery(id),
  delivered_by   uuid,
  received_by_name text,
  geo            geography(Point, 4326),
  captured_at    timestamptz not null default now(),
  is_offline_capture boolean not null default false,
  device_id      text
);

create table return_request (                              -- درخواست مرجوعی
  id             uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references branch(id),
  doc_number     text not null,
  customer_id    uuid not null references customer(id),
  invoice_id     uuid references invoice(id),
  tour_id        uuid,
  requested_by   uuid,
  reason_code    text not null check (reason_code in
                   ('damaged','expired','wrong_item','shortage','customer_refusal','promotion_error','other')),
  status         text not null default 'draft' check (status in
                   ('draft','submitted','approved','partially_approved','rejected','posted','closed')),
  credit_note_id uuid references credit_note(id),
  approval_request_id uuid references approval_request(id),
  requested_at   timestamptz not null default now(),
  approved_at    timestamptz,
  note           text,
  constraint uq_return_request_doc unique (branch_id, doc_number)
);

create index ix_return_request_open on return_request (branch_id, status)
  where status in ('submitted','approved');

create table return_request_line (
  id                uuid primary key default gen_random_uuid(),
  return_request_id uuid not null references return_request(id) on delete cascade,
  product_id        uuid not null references product(id),
  batch_id          uuid references batch(id),
  qty               numeric(19,4) not null check (qty > 0),
  qty_approved      numeric(19,4),
  unit_price        numeric(19,4) not null,
  disposition       text not null default 'restock'
                      check (disposition in ('restock','damaged','scrap','return_to_supplier')),
  constraint ck_return_line_approved check (qty_approved is null or qty_approved <= qty)
);

create table moadian_submission (                          -- صف ارسال به سامانه مؤدیان
  id             uuid primary key default gen_random_uuid(),
  invoice_id     uuid not null references invoice(id),
  submission_no  bigint generated always as identity,
  payload        jsonb not null,
  reference_id   text,                                     -- کد رهگیری/شماره مالیاتی
  status         text not null default 'queued' check (status in
                   ('queued','sending','sent','accepted','rejected','retrying','dead')),
  attempt_count  smallint not null default 0,
  last_error     text,
  sent_at        timestamptz,
  next_retry_at  timestamptz,
  created_at     timestamptz not null default now()
);

create index ix_moadian_retry on moadian_submission (next_retry_at)
  where status in ('queued','retrying');

create unique index uq_moadian_invoice on moadian_submission (invoice_id, submission_no);
