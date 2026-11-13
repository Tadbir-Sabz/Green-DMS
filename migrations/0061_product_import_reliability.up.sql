-- TASK-PM-01D-M2 — Product Import reliability, concurrency and atomicity.
-- Additive only: §E per-batch all-or-nothing and continuation after a failed
-- batch remain authoritative. No historical migration is rewritten.

alter table product_import
  add column status text not null default 'completed'
    check (status in ('processing','completed','failed')),
  add column failure_category text not null default 'none'
    check (failure_category in ('none','validation','business','permission','concurrency','infrastructure')),
  add column retryable boolean not null default false,
  add column transaction_outcome text not null default 'committed'
    check (transaction_outcome in ('committed','partial','rolled_back','not_started','unknown')),
  add column last_batch_no integer not null default 0,
  add column completed_at timestamptz,
  add column updated_at timestamptz not null default now(),
  add column attempts integer not null default 1,
  add constraint uq_product_import_company_id unique (company_id, id);

create table product_import_batch (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references company(id),
  import_id           uuid not null,
  batch_no            integer not null check (batch_no > 0),
  status              text not null
    check (status in ('committed','rolled_back','rejected','failed')),
  transaction_outcome text not null
    check (transaction_outcome in ('committed','rolled_back','not_started','unknown')),
  failure_category    text not null default 'none'
    check (failure_category in ('none','validation','business','permission','concurrency','infrastructure')),
  retryable           boolean not null default false,
  reason_code         text,
  message_fa          text,
  total_rows          integer not null default 0,
  created_rows        integer not null default 0,
  updated_rows        integer not null default 0,
  failed_rows         integer not null default 0,
  report              jsonb not null default '[]'::jsonb,
  attempts            integer not null default 1,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint uq_product_import_batch unique (import_id, batch_no),
  constraint fk_product_import_batch_import
    foreign key (company_id, import_id)
    references product_import (company_id, id) on delete cascade
);

create index ix_product_import_batch_lookup
  on product_import_batch (company_id, import_id, batch_no);

alter table product_import_batch enable row level security;
alter table product_import_batch force row level security;
drop policy if exists p_product_import_batch_tenant on product_import_batch;
create policy p_product_import_batch_tenant on product_import_batch
  for all
  using (product_import_batch.company_id = fn_current_company_id())
  with check (product_import_batch.company_id = fn_current_company_id());

-- Least privilege for the runtime role; migration/rollback stay with the migrator.
-- 0041 grants DELETE on all current/future tables to dms_app, so revoke first.
revoke all on product_import_batch from public, dms_app;
grant select, insert, update on product_import_batch to dms_app;

comment on table product_import_batch is
  'Per-batch committed/rolled-back/rejected outcome; committed rows are written in the same transaction as product mutations.';
comment on column product_import.status is
  'processing | completed | failed; processing is resumable only under the per-idempotency-key advisory lock.';
comment on column product_import.transaction_outcome is
  'Aggregate committed/partial/rolled_back/not_started/unknown outcome; never claims a failed transaction as success.';
