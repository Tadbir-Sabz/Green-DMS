-- مهاجرت 0018 — کدینگ حساب‌ها، دوره مالی، سند، نگاشت، تراز
-- منبع: dms-design-report.md › ضمیمه G › G.۱۵
-- فاز توسعه: ۵ | ماژول/بخش: کدینگ حساب‌ها، دوره مالی، سند، نگاشت، تراز

create table gl_account (                                  -- کدینگ ۴ سطحی + تفصیلی شناور
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references company(id),
  code         text not null,                              -- ۱۱۰۱ / ۱۱۰۱۰۲ / ۱۱۰۱۰۲۰۰۱
  parent_id    uuid references gl_account(id),
  level        smallint not null check (level between 1 and 4),
  title        text not null,
  nature       text not null check (nature in ('debit','credit')),
  account_type text not null check (account_type in
                 ('asset','liability','equity','revenue','expense','contra')),
  is_postable  boolean not null default true,              -- فقط سطح ۴ و تفصیلی قابل ثبت است
  control_type text check (control_type in
                 ('ar','ap','inventory','cash','bank','tax','cheque_in_hand','cogs','none')),
  currency     char(3) not null default 'IRR',
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  row_version  integer not null default 0,
  constraint uq_gl_account_code unique (company_id, code),
  constraint ck_gl_account_level check (
    (level = 1 and parent_id is null) or (level > 1 and parent_id is not null))
);

create index ix_gl_account_parent on gl_account (parent_id);

create unique index uq_gl_account_control on gl_account (company_id, control_type)
  where control_type is not null and control_type <> 'none';

create table gl_dimension (                                -- ابعاد تحلیلی: شعبه، حوزه، ویزیتور، پروژه
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  code       text not null,
  title      text not null,
  constraint uq_gl_dimension unique (company_id, code)
);

create table gl_dimension_value (
  id           uuid primary key default gen_random_uuid(),
  dimension_id uuid not null references gl_dimension(id) on delete cascade,
  code         text not null,
  title        text not null,
  ref_id       uuid,                                       -- شناسه موجودیت متناظر (branch/staff/...)
  constraint uq_gl_dimension_value unique (dimension_id, code)
);

create table fiscal_period (                               -- دوره مالی با قفل دومرحله‌ای
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references company(id),
  fiscal_year smallint not null,
  period_no   smallint not null check (period_no between 1 and 12),
  start_date  date not null,
  end_date    date not null,
  status      text not null default 'open' check (status in ('open','closed','locked')),
  closed_by   uuid,
  closed_at   timestamptz,
  constraint uq_fiscal_period unique (company_id, fiscal_year, period_no),
  constraint ck_fiscal_period_range check (end_date >= start_date)
);

create table journal_entry (                               -- سند حسابداری
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references company(id),
  branch_id       uuid references branch(id),
  doc_number      text not null,
  fiscal_period_id uuid not null references fiscal_period(id),
  entry_date      date not null,
  description     text not null,
  source_type     text not null check (source_type in
                    ('invoice','credit_note','receipt','payment_voucher','goods_receipt',
                     'supplier_invoice','value_document','cash_txn','cheque','payroll',
                     'manual','opening','closing','recurring')),
  source_id       uuid,
  total_debit     numeric(19,2) not null default 0 check (total_debit >= 0),
  total_credit    numeric(19,2) not null default 0 check (total_credit >= 0),
  status          text not null default 'draft' check (status in ('draft','posted','voided')),
  reversal_of_id  uuid references journal_entry(id),        -- سند معکوس
  created_by      uuid,
  posted_by       uuid,
  posted_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  row_version     integer not null default 0,
  constraint uq_journal_entry_doc unique (company_id, doc_number),
  constraint ck_journal_entry_balanced_check check (status = 'draft' or total_debit = total_credit)
);

-- بازه دوره مالی با CHECK قابل بررسی نیست (زیرکوئری در CHECK مجاز نیست)؛ تریگر جای آن

create or replace function fn_check_journal_period() returns trigger
language plpgsql as $$
declare v_status text; v_start date; v_end date;
begin
  select status, start_date, end_date into v_status, v_start, v_end
    from fiscal_period where id = new.fiscal_period_id;
  if new.entry_date < v_start or new.entry_date > v_end then
    raise exception 'تاریخ سند % خارج از بازه دوره مالی است (% تا %).',
      new.entry_date, v_start, v_end using errcode = 'check_violation';
  end if;
  if v_status <> 'open' then
    raise exception 'دوره مالی % بسته یا قفل است؛ ثبت سند مجاز نیست.', new.fiscal_period_id
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger trg_journal_period before insert or update on journal_entry
  for each row execute function fn_check_journal_period();
-- یک سند مبدأ، فقط یک سند حسابداری (تولید تکرارناپذیر و بی‌خطر در برابر تلاش مجدد)

create unique index uq_journal_source on journal_entry (source_type, source_id)
  where source_type <> 'manual' and status <> 'voided';

create index ix_journal_entry_period on journal_entry (fiscal_period_id, entry_date);

create trigger trg_journal_immutable before update on journal_entry
  for each row execute function fn_immutable_after_post();

create table journal_line (
  id          bigint generated always as identity primary key,
  entry_id    uuid not null references journal_entry(id) on delete cascade,
  line_no     smallint not null,
  account_id  uuid not null references gl_account(id),
  description text not null,
  debit       numeric(19,2) not null default 0 check (debit >= 0),
  credit      numeric(19,2) not null default 0 check (credit >= 0),
  dimensions  jsonb not null default '{}'::jsonb,          -- {"branch": "...", "salesperson": "..."}
  party_type  text check (party_type in ('customer','supplier','staff')),
  party_id    uuid,
  constraint uq_journal_line unique (entry_id, line_no),
  constraint ck_journal_line_one_side check ((debit = 0) <> (credit = 0))
);

create index ix_journal_line_account on journal_line (account_id, entry_id);

create index ix_journal_line_party on journal_line (party_type, party_id) where party_id is not null;

create index ix_journal_line_dimensions on journal_line using gin (dimensions);

-- توازن سند در پایان تراکنش بررسی می‌شود، نه در هر سطر

create or replace function fn_journal_balanced() returns trigger
language plpgsql as $$
declare v_entry uuid; v_d numeric(19,2); v_c numeric(19,2);
begin
  v_entry := coalesce(new.entry_id, old.entry_id);
  select coalesce(sum(debit),0), coalesce(sum(credit),0)
    into v_d, v_c from journal_line where entry_id = v_entry;
  if v_d <> v_c then
    raise exception 'سند % متوازن نیست: بدهکار % / بستانکار %', v_entry, v_d, v_c
      using errcode = 'check_violation';
  end if;
  return null;
end $$;

create constraint trigger trg_journal_balanced
  after insert or update or delete on journal_line
  deferrable initially deferred
  for each row execute function fn_journal_balanced();

create table account_mapping (                             -- نگاشت رویداد ← حساب (A.۳، قابل تنظیم)
  id                uuid primary key default gen_random_uuid(),
  company_id        uuid not null references company(id),
  event_type        text not null,                         -- sales_invoice.cash | purchase_receipt.vat | ...
  debit_account_id  uuid not null references gl_account(id),
  credit_account_id uuid not null references gl_account(id),
  conditions        jsonb not null default '{}'::jsonb,    -- مثلاً فقط برای کالای معاف
  is_active         boolean not null default true,
  updated_at        timestamptz not null default now(),
  constraint uq_account_mapping unique (company_id, event_type, debit_account_id, credit_account_id),
  constraint ck_account_mapping_diff check (debit_account_id <> credit_account_id)
);

create table tax_ledger (                                  -- تفکیک ارزش افزوده فروش/خرید
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references company(id),
  fiscal_period_id uuid not null references fiscal_period(id),
  direction   text not null check (direction in ('output','input')),
  tax_code_id uuid references tax_code(id),
  taxable_base numeric(19,2) not null default 0,
  tax_amount  numeric(19,2) not null default 0,
  source_type text not null,
  source_id   uuid not null,
  created_at  timestamptz not null default now()
);

create unique index uq_tax_ledger_source on tax_ledger
  (direction, source_type, source_id, coalesce(tax_code_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table ledger_balance_snapshot (                     -- مانده ماهانه حساب‌ها (پیش‌محاسبه گزارش)
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references company(id),
  fiscal_period_id uuid not null references fiscal_period(id),
  account_id      uuid not null references gl_account(id),
  opening_balance numeric(19,2) not null default 0,
  debit_total     numeric(19,2) not null default 0,
  credit_total    numeric(19,2) not null default 0,
  closing_balance numeric(19,2) not null default 0,
  computed_at     timestamptz not null default now(),
  constraint uq_ledger_balance_snapshot unique (account_id, fiscal_period_id)
);

create table recurring_journal (                           -- سند الگو/تکرارشونده
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references company(id),
  title              text not null,
  template_lines     jsonb not null,                       -- [{account_code, debit, credit, description}]
  schedule_cron      text not null,
  next_run_at        timestamptz,
  is_active          boolean not null default true
);

alter table value_document
  add constraint fk_value_document_journal foreign key (journal_entry_id) references journal_entry(id);

-- تراز آزمایشی: منبع صفحه «تراز» و مغایرت‌گیری زیرسیستم‌ها با دفتر کل (A.۵)

create or replace view v_trial_balance as
select a.company_id,
       p.fiscal_year,
       p.period_no,
       a.code            as account_code,
       a.title,
       a.level,
       a.nature,
       coalesce(sum(l.debit), 0)  as debit_total,
       coalesce(sum(l.credit), 0) as credit_total,
       coalesce(sum(l.debit - l.credit), 0) as balance
  from gl_account a
  join journal_line l on l.account_id = a.id
  join journal_entry e on e.id = l.entry_id and e.status = 'posted'
  join fiscal_period p on p.id = e.fiscal_period_id
 group by a.company_id, p.fiscal_year, p.period_no, a.code, a.title, a.level, a.nature
 order by a.code;
