-- TASK-PM-01D-M4 — controlled central Product Master bulk maintenance.
-- Additive/reversible operation ledger only: product rows, 0060 immutable
-- catalog history, 0061 import reliability and all prior grants are untouched.
--
-- A durable ledger is required because:
--   * audit_log is partitioned and AuditService historically swallows errors,
--     so it cannot serve as a transactional idempotency claim;
--   * product_import has approved per-batch/whole-file semantics that must not
--     be conflated with a bulk maintenance operation;
--   * an in-memory map cannot survive a crash or prove replay after ACK loss.

create table product_bulk_operation (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references company(id),
  actor_user_id      uuid,
  status             text not null
    check (status in ('preview_created','accepted','committed','rejected','unknown')),
  outcome            text not null default 'not_started'
    check (outcome in ('not_started','committed','rolled_back','unknown')),
  failure_category   text not null default 'none'
    check (failure_category in ('none','validation','concurrency','permission','infrastructure','stale','unknown')),
  reason_code        text,
  message_fa         text,
  request_hash       text not null,
  preview_token_hash text not null,
  preview_hash       text not null,
  product_ids        uuid[] not null,
  changes            jsonb not null,
  expected_versions  jsonb not null,
  preview            jsonb not null,
  result             jsonb,
  eligible_count     integer not null default 0 check (eligible_count >= 0),
  rejected_count     integer not null default 0 check (rejected_count >= 0),
  updated_count      integer not null default 0 check (updated_count >= 0),
  attempts           integer not null default 0 check (attempts >= 0),
  expires_at         timestamptz not null,
  accepted_at        timestamptz,
  committed_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint uq_product_bulk_operation_company_id unique (company_id, id),
  constraint ck_product_bulk_operation_bounded
    check (cardinality(product_ids) between 1 and 100),
  -- The exact 1..9 field bound is enforced by the server DTO/service whitelist;
  -- PostgreSQL CHECK expressions cannot contain the needed jsonb_keys subquery.
  constraint ck_product_bulk_operation_changes
    check (jsonb_typeof(changes) = 'object' and changes <> '{}'::jsonb)
);

create index ix_product_bulk_operation_lookup
  on product_bulk_operation (company_id, actor_user_id, created_at desc);

alter table product_bulk_operation enable row level security;
alter table product_bulk_operation force row level security;
drop policy if exists p_product_bulk_operation_tenant on product_bulk_operation;
create policy p_product_bulk_operation_tenant on product_bulk_operation
  for all
  using (product_bulk_operation.company_id = fn_current_company_id())
  with check (product_bulk_operation.company_id = fn_current_company_id());

-- 0041 default privileges grant DELETE to dms_app; this ledger must be
-- append/update-only from the runtime role, matching the 0061 pattern.
revoke all on product_bulk_operation from public, dms_app;
grant select, insert, update on product_bulk_operation to dms_app;

comment on table product_bulk_operation is
  'Durable idempotency/lifecycle ledger for one all-or-nothing central product bulk maintenance operation; not an import job and not a competing audit system.';
comment on column product_bulk_operation.status is
  'preview_created | accepted | committed | rejected | unknown; accepted is durable only when no product mutation has committed.';
comment on column product_bulk_operation.preview_token_hash is
  'SHA-256 of an opaque preview token; the raw token is returned once and never stored.';
comment on column product_bulk_operation.request_hash is
  'Hash of the validated product_id set and normalized field changes; execute never accepts a new change payload.';
