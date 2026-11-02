-- مهاجرت 0014 — رسید وصول، تخصیص، دفتر مشتری، تحلیل سنی
-- منبع: dms-design-report.md › ضمیمه G › G.۱۱
-- فاز توسعه: ۵ | ماژول/بخش: رسید وصول، تخصیص، دفتر مشتری، تحلیل سنی

create table payment_receipt (                             -- رسید وصول
  id                uuid primary key default gen_random_uuid(),
  branch_id         uuid not null references branch(id),
  doc_number        text not null,
  fiscal_year       smallint not null,
  customer_id       uuid not null references customer(id),
  receipt_date      date not null default current_date,
  payment_method_id uuid not null references payment_method(id),
  amount            numeric(19,2) not null check (amount > 0),
  allocated_amount  numeric(19,2) not null default 0 check (allocated_amount >= 0),
  cash_box_id       uuid references cash_box(id),
  bank_account_id   uuid references bank_account(id),
  cheque_id         uuid references cheque(id),
  psp_transaction_id uuid references psp_transaction(id),
  tour_settlement_id uuid references tour_settlement(id),
  collected_by      uuid references staff(id),
  reference_no      text,                                  -- شماره پیگیری
  status            text not null default 'draft' check (status in
                      ('draft','posted','partially_allocated','allocated','bounced','voided')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  row_version       integer not null default 0,
  constraint uq_payment_receipt_doc unique (branch_id, fiscal_year, doc_number),
  constraint ck_receipt_allocated check (allocated_amount <= amount),
  constraint ck_receipt_destination check (
    num_nonnulls(cash_box_id, bank_account_id, cheque_id, psp_transaction_id) = 1)
);

create index ix_receipt_customer on payment_receipt (customer_id, receipt_date desc);

create index ix_receipt_unallocated on payment_receipt (branch_id)
  where status in ('posted','partially_allocated');

create table receipt_allocation (                          -- تخصیص رسید به فاکتور (FIFO قابل بازنویسی)
  id          uuid primary key default gen_random_uuid(),
  receipt_id  uuid not null references payment_receipt(id) on delete cascade,
  invoice_id  uuid not null references invoice(id),
  amount      numeric(19,2) not null check (amount > 0),
  allocated_at timestamptz not null default now(),
  constraint uq_receipt_allocation unique (receipt_id, invoice_id)
);

create index ix_receipt_allocation_invoice on receipt_allocation (invoice_id);

-- جلوگیری از تخصیص بیش از مبلغ رسید یا بیش از مانده فاکتور

create or replace function fn_check_allocation() returns trigger
language plpgsql as $$
declare v_receipt numeric(19,2); v_allocated numeric(19,2);
        v_invoice numeric(19,2); v_inv_alloc numeric(19,2);
begin
  select amount into v_receipt from payment_receipt where id = new.receipt_id;
  select coalesce(sum(amount),0) into v_allocated
    from receipt_allocation where receipt_id = new.receipt_id and id <> coalesce(new.id, gen_random_uuid());
  if v_allocated + new.amount > v_receipt then
    raise exception 'جمع تخصیص‌ها از مبلغ رسید بیشتر می‌شود.';
  end if;

  select grand_total into v_invoice from invoice where id = new.invoice_id;
  select coalesce(sum(amount),0) + coalesce((select sum(amount) from credit_note where invoice_id = new.invoice_id and status='posted'),0)
    into v_inv_alloc
    from receipt_allocation where invoice_id = new.invoice_id and id <> coalesce(new.id, gen_random_uuid());
  if v_inv_alloc + new.amount > v_invoice then
    raise exception 'مبلغ تخصیص از مانده فاکتور بیشتر است.';
  end if;
  return new;
end $$;

create trigger trg_receipt_allocation_check
  before insert or update on receipt_allocation
  for each row execute function fn_check_allocation();

-- دفتر بدهکاری مشتری: فقط‌افزودنی، منبع گزارش تحلیل سنی و صورت‌حساب

create table customer_ledger_entry (
  id           bigint generated always as identity primary key,
  branch_id    uuid not null references branch(id),
  customer_id  uuid not null references customer(id),
  entry_date   date not null,
  doc_type     text not null check (doc_type in
                 ('invoice','credit_note','receipt','opening','adjustment','write_off','cheque_bounce')),
  doc_id       uuid not null,
  description  text not null,
  debit        numeric(19,2) not null default 0 check (debit >= 0),
  credit       numeric(19,2) not null default 0 check (credit >= 0),
  created_at   timestamptz not null default now(),
  constraint ck_ledger_one_side check ((debit = 0) <> (credit = 0)),
  constraint uq_customer_ledger_doc unique (doc_type, doc_id)
);

create index ix_customer_ledger_customer on customer_ledger_entry (customer_id, entry_date);

create index ix_customer_ledger_open on customer_ledger_entry (branch_id, entry_date)
  where debit > 0;

create table ar_aging_snapshot (                           -- عکس لحظه‌ای تحلیل سنی (پیش‌محاسبه شبانه)
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid not null references branch(id),
  as_of_date    date not null,
  customer_id   uuid not null references customer(id),
  current_amount  numeric(19,2) not null default 0,
  bucket_1_30   numeric(19,2) not null default 0,
  bucket_31_60  numeric(19,2) not null default 0,
  bucket_61_90  numeric(19,2) not null default 0,
  bucket_over_90 numeric(19,2) not null default 0,
  total_due     numeric(19,2) not null default 0,
  overdue_days  integer not null default 0,
  credit_limit  numeric(19,2) not null default 0,
  constraint uq_ar_aging unique (as_of_date, customer_id)
);

create index ix_ar_aging_branch on ar_aging_snapshot (branch_id, as_of_date desc, total_due desc);

create table collection_action (                           -- پیگیری وصول
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references customer(id),
  invoice_id   uuid references invoice(id),
  kind         text not null check (kind in ('call','sms','letter','visit','legal','promise')),
  promised_amount numeric(19,2),
  promised_date date,
  outcome      text check (outcome in ('promised','refused','partial','no_answer','escalated')),
  note         text,
  performed_by uuid,
  performed_at timestamptz not null default now()
);

create index ix_collection_action_customer on collection_action (customer_id, performed_at desc);

-- نمای اعتبار مؤثر: سقف + استثنا + بدهی جاری + چک‌های در جریان

create or replace view v_customer_exposure as
select c.id as customer_id,
       c.code,
       cc.credit_limit,
       cc.extra_limit,
       coalesce(ar.total_due, 0)                          as total_due,
       coalesce(ch.open_cheques, 0)                       as open_cheque_amount,
       cc.credit_limit + case when cc.extra_limit_expires_on is null
                                or cc.extra_limit_expires_on >= current_date
                              then cc.extra_limit else 0 end
         - coalesce(ar.total_due, 0)                      as available_credit
  from customer c
  left join customer_credit cc on cc.customer_id = c.id
  left join (select customer_id, sum(grand_total - paid_amount) as total_due
               from invoice
              where status in ('posted','partially_paid')
              group by customer_id) ar on ar.customer_id = c.id
  left join (select customer_id, sum(amount) as open_cheques
               from cheque
              where direction = 'received' and status in ('in_hand','deposited')
              group by customer_id) ch on ch.customer_id = c.id
 where c.status = 'active';
