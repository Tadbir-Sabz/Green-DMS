-- مهاجرت 0013 — صندوق، بانک، چک، پوز، تنخواه، بستن روزانه
-- منبع: dms-design-report.md › ضمیمه G › G.۱۰
-- فاز توسعه: ۵ | ماژول/بخش: صندوق، بانک، چک، پوز، تنخواه، بستن روزانه

create table cash_box (                                    -- صندوق مرکزی یا صندوق فروشنده
  id             uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references branch(id),
  code           text not null,
  title          text not null,
  kind           text not null check (kind in ('main','salesperson','petty','psp')),
  holder_staff_id uuid references staff(id),
  is_active      boolean not null default true,
  constraint uq_cash_box unique (branch_id, code),
  constraint ck_cash_box_holder check (kind <> 'salesperson' or holder_staff_id is not null)
);

create unique index uq_cash_box_holder on cash_box (holder_staff_id) where kind = 'salesperson' and is_active;

create table cash_txn (
  id            uuid primary key default gen_random_uuid(),
  cash_box_id   uuid not null references cash_box(id),
  direction     text not null check (direction in ('in','out')),
  amount        numeric(19,2) not null check (amount > 0),
  reason_code   text not null check (reason_code in
                  ('receipt','tour_settlement','deposit_to_bank','petty_topup','expense',
                   'supplier_payment','variance','opening')),
  source_type   text,
  source_id     uuid,
  occurred_at   timestamptz not null default now(),
  created_by    uuid,
  note          text,
  constraint uq_cash_txn_source unique (source_type, source_id, reason_code, direction)
);

create index ix_cash_txn_box_time on cash_txn (cash_box_id, occurred_at desc);

create table cash_session (                                -- شمارش و بستن صندوق
  id            uuid primary key default gen_random_uuid(),
  cash_box_id   uuid not null references cash_box(id),
  opened_at     timestamptz not null default now(),
  closed_at     timestamptz,
  opening_balance numeric(19,2) not null default 0,
  expected_balance numeric(19,2),
  counted_balance  numeric(19,2),
  variance_amount  numeric(19,2) generated always as
                     (coalesce(counted_balance - expected_balance, 0)) stored,
  status        text not null default 'open' check (status in ('open','closed','approved')),
  counted_by    uuid,
  approved_by   uuid,
  note          text
);

create unique index uq_cash_session_open on cash_session (cash_box_id) where status = 'open';

create table bank_account (
  id             uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references branch(id),
  title          text not null,
  bank_name      text not null,
  iban           text,
  account_no     text,
  currency       char(3) not null default 'IRR',
  opening_balance numeric(19,2) not null default 0,
  is_active      boolean not null default true,
  constraint uq_bank_account_iban unique (iban)
);

create table bank_statement (
  id              uuid primary key default gen_random_uuid(),
  bank_account_id uuid not null references bank_account(id),
  period_start    date not null,
  period_end      date not null,
  opening_balance numeric(19,2),
  closing_balance numeric(19,2),
  imported_at     timestamptz not null default now(),
  imported_by     uuid,
  constraint ck_bank_statement_period check (period_end >= period_start)
);

create table bank_statement_line (
  id                uuid primary key default gen_random_uuid(),
  bank_statement_id uuid not null references bank_statement(id) on delete cascade,
  txn_date          date not null,
  value_date        date,
  description       text,
  debit             numeric(19,2) not null default 0 check (debit >= 0),
  credit            numeric(19,2) not null default 0 check (credit >= 0),
  balance           numeric(19,2),
  reference         text,
  bank_ref          text,
  status            text not null default 'unmatched'
                      check (status in ('unmatched','matched','ignored')),
  matched_type      text,                                  -- receipt | payment | cheque | fee
  matched_id        uuid,
  constraint ck_bank_line_one_side check ((debit = 0) <> (credit = 0))
);

create unique index uq_bank_line on bank_statement_line
  (bank_statement_id, txn_date, debit, credit, coalesce(reference, ''));

create index ix_bank_line_unmatched on bank_statement_line (bank_statement_id) where status = 'unmatched';

create table cheque (                                      -- چک دریافتی/پرداختی (صیادی)
  id              uuid primary key default gen_random_uuid(),
  branch_id       uuid not null references branch(id),
  direction       text not null check (direction in ('received','issued')),
  sayad_id        text,                                    -- شناسه صیادی
  serial_no       text not null,
  bank_name       text not null,
  branch_name     text,
  amount          numeric(19,2) not null check (amount > 0),
  due_date        date not null,
  issue_date      date,
  customer_id     uuid references customer(id),
  supplier_id     uuid,                                    -- FK در §G.۱۲ افزوده می‌شود
  bank_account_id uuid references bank_account(id),
  status          text not null check (status in
                    ('in_hand','deposited','cleared','bounced','returned','cancelled','settled')),
  received_at     timestamptz,
  clearance_date  date,
  bounce_reason   text,
  photo_attachment_id uuid references attachment(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  row_version     integer not null default 0,
  constraint uq_cheque_serial unique (direction, bank_name, serial_no),
  constraint ck_cheque_party check (
    (direction = 'received' and customer_id is not null) or
    (direction = 'issued' and supplier_id is not null))
);

create index ix_cheque_due on cheque (branch_id, due_date, status)
  where status in ('in_hand','deposited');

create unique index uq_cheque_sayad on cheque (sayad_id) where sayad_id is not null;

create table cheque_event (                                -- تاریخچه وضعیت (بدون حذف)
  id         uuid primary key default gen_random_uuid(),
  cheque_id  uuid not null references cheque(id) on delete cascade,
  from_status text,
  to_status  text not null,
  at         timestamptz not null default now(),
  actor_id   uuid,
  note       text
);

create index ix_cheque_event on cheque_event (cheque_id, at);

create table psp_transaction (                             -- تراکنش کارت/درگاه
  id             uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references branch(id),
  terminal_id    text not null,
  psp            text not null,
  rrn            text,
  trace_no       text,
  card_masked    text,
  amount         numeric(19,2) not null check (amount > 0),
  fee_amount     numeric(19,2) not null default 0,
  txn_at         timestamptz not null,
  settlement_date date,
  invoice_id     uuid references invoice(id),
  status         text not null default 'success'
                   check (status in ('success','failed','reversed','settled')),
  raw_payload    jsonb,
  constraint uq_psp_transaction unique (psp, terminal_id, rrn)
);

create index ix_psp_unsettled on psp_transaction (branch_id, settlement_date) where status = 'success';

create table petty_cash (                                  -- تنخواه
  id             uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references branch(id),
  custodian_id   uuid not null references staff(id),
  ceiling_amount numeric(19,2) not null default 0,
  balance        numeric(19,2) not null default 0,
  is_active      boolean not null default true
);

create table petty_cash_line (
  id             uuid primary key default gen_random_uuid(),
  petty_cash_id  uuid not null references petty_cash(id) on delete cascade,
  occurred_on    date not null,
  description    text not null,
  debit          numeric(19,2) not null default 0,
  credit         numeric(19,2) not null default 0,
  attachment_id  uuid references attachment(id),
  approved_by    uuid,
  constraint ck_petty_line_one_side check ((debit = 0) <> (credit = 0))
);

create table daily_treasury_close (                        -- بستن روزانه خزانه
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid not null references branch(id),
  close_date    date not null,
  cash_expected numeric(19,2) not null default 0,
  cash_counted  numeric(19,2) not null default 0,
  bank_balance  numeric(19,2) not null default 0,
  cheque_in_hand_amount numeric(19,2) not null default 0,
  status        text not null default 'draft' check (status in ('draft','closed','approved')),
  closed_by     uuid,
  approved_by   uuid,
  note          text,
  constraint uq_daily_treasury_close unique (branch_id, close_date)
);

-- تسویه تور (ماژول ۵) به صندوق خزانه (ماژول ۱۰) وصل می‌شود

alter table tour_settlement
  add constraint fk_tour_settlement_cash_box foreign key (cash_box_id) references cash_box(id);
