-- مهاجرت 0039 — صورتحسابِ اشتراک (billing) — فقط «مدیریت صورتحساب»، بدونِ درگاهِ
-- پرداخت و بدونِ اشتراکِ پولی (طبقِ دامنهٔ مصوب). این جدول یک دفترِ کل (ledger) از
-- صورتحساب‌هایِ دوره‌ایِ صادرشده برای هر اجاره است تا ساختارِ لازم برای افزودنِ
-- پرداخت/اشتراک در آینده آماده باشد. وضعیت فقط issued/void است (پرداخت ندارد).

create table billing_invoice (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references company(id),
  invoice_no   text not null,
  period_start date not null,
  period_end   date not null,
  amount       numeric(19,2) not null check (amount >= 0),
  currency     char(3) not null default 'IRR',
  status       text not null default 'issued' check (status in ('issued', 'void')),
  notes        text,
  issued_at    timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  constraint uq_billing_invoice_no unique (company_id, invoice_no),
  constraint ck_billing_period check (period_end >= period_start)
);

create index ix_billing_invoice_company on billing_invoice (company_id, issued_at desc);

-- RLS هم‌راستا با 0036/0037 (بدونِ FORCE؛ مالک=اپ bypass می‌کند، اعمالِ اصلی در
-- ریپازیتوری با company_id است).
alter table billing_invoice enable row level security;
create policy p_billing_invoice_tenant on billing_invoice
  using (company_id = current_setting('app.company_id')::uuid);
