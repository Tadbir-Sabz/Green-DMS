-- 0072 — S8-06 security remediation (forward-only correction; does NOT edit 0069/0070/0071).
--
-- Why a forward migration: 0069 and 0070 may already have been applied in some environment
-- (developer/staging databases built from the working tree). Their checksums are therefore
-- frozen. Every correction below is expressed as CREATE OR REPLACE / REVOKE / GRANT here.
--
-- Scope
--   1) fn_maintain_inventory_partitions (0070, SECURITY DEFINER, owner dms_owner):
--      - search_path = pg_catalog, public, pg_temp  (pg_temp LAST)
--      - every catalog relation is schema-qualified (pg_catalog.pg_inherits, pg_catalog.pg_class)
--      - every routine call is schema-qualified (public.fn_inventory_txn_protect_partition, …)
--      Threat addressed: with pg_temp absent from search_path, PostgreSQL searches the session's
--      temporary schema FIRST for relations and types. A dms_maintainer session that creates a
--      TEMP table named pg_inherits could otherwise redirect the definer's catalog reads.
--      (Functions and operators are NOT searched in pg_temp; see PostgreSQL namespace.c.)
--   2) fn_maintain_audit_partitions / fn_maintain_location_partitions (0071, SECURITY DEFINER,
--      owner = table owner dms_migrator): same search_path/qualification hardening, and every
--      newly created partition gets an explicit REVOKE UPDATE, DELETE, TRUNCATE from dms_app and
--      dms_readonly. Ownership-time default privileges (0041) are not relied upon.
--   3) Privilege invariants are re-asserted and verified in this migration (fail-closed):
--      EXECUTE only for dms_maintainer (plus the owner's implicit right); PUBLIC, dms_app,
--      dms_readonly denied; prosecdef = true; proconfig pinned exactly.
--   4) schema_migrations is not readable/writable by runtime roles (migration history is a
--      migrator-only artifact). Runtime boot no longer reads it (see scripts/migrate.mjs).
--
-- Preconditions: 0070 and 0071 applied; dms_owner NOLOGIN; migration runs inside the migration
-- window (db-window.mjs up), because step 1 switches to dms_owner with SET LOCAL ROLE.

-- ---------------------------------------------------------------------------
-- 0) Preconditions
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.fn_maintain_inventory_partitions(integer)') is null then
    raise exception '0072: fn_maintain_inventory_partitions(integer) وجود ندارد (0070 باید اعمال شده باشد).';
  end if;
  if to_regprocedure('public.fn_maintain_audit_partitions(integer)') is null
     or to_regprocedure('public.fn_maintain_location_partitions(integer)') is null then
    raise exception '0072: wrapperهای 0071 وجود ندارند.';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'dms_maintainer') then
    raise exception '0072: نقش dms_maintainer وجود ندارد.';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1) fn_maintain_inventory_partitions — same contract as 0070, hardened name resolution.
--    Owner stays dms_owner (CREATE OR REPLACE by the owner keeps ownership and ACL).
-- ---------------------------------------------------------------------------
set local role dms_owner;

create or replace function fn_maintain_inventory_partitions(p_months_ahead integer default 2)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_lower   date;
  v_upper   date;
  v_name    text;
  v_months  integer;
  v_part    regclass;
  v_using   constant text := 'branch_id in (select b.id from public.branch b where b.company_id = public.fn_current_company_id())';
begin
  if p_months_ahead is null or p_months_ahead < 0 or p_months_ahead > 12 then
    raise exception 'p_months_ahead must be between 0 and 12'
      using errcode = 'invalid_parameter_value';
  end if;

  v_months := -1;
  while v_months <= p_months_ahead loop
    v_lower := (pg_catalog.date_trunc('month', pg_catalog.current_date)
                + pg_catalog.make_interval(months => v_months))::pg_catalog.date;
    v_upper := (v_lower + interval '1 month')::pg_catalog.date;
    v_name  := 'inventory_txn_' || pg_catalog.to_char(v_lower, 'YYYY_MM');
    if not exists (
      select 1
        from pg_catalog.pg_inherits i
        join pg_catalog.pg_class c on c.oid = i.inhrelid
       where i.inhparent = 'public.inventory_txn'::pg_catalog.regclass
         and c.relname = v_name
    ) then
      -- DETACHed partitions are never dropped or recreated automatically (F2)
      if pg_catalog.to_regclass(pg_catalog.format('public.%I', v_name)) is not null then
        raise exception 'relation % exists but is not attached as a partition; re-attach manually', v_name
          using errcode = 'duplicate_table';
      end if;
      execute pg_catalog.format(
        'create table public.%I partition of public.inventory_txn for values from (%L) to (%L)',
        v_name, v_lower, v_upper);
      execute pg_catalog.format('grant select, insert, update, delete on public.%I to dms_app', v_name);
      execute pg_catalog.format('grant select on public.%I to dms_readonly', v_name);
      execute pg_catalog.format('alter table public.%I enable row level security', v_name);
      execute pg_catalog.format('alter table public.%I force row level security', v_name);
      execute pg_catalog.format('drop policy if exists p_inventory_txn_tenant on public.%I', v_name);
      execute pg_catalog.format('create policy p_inventory_txn_tenant on public.%I for all using (%s) with check (%s)',
                                v_name, v_using, v_using);
    end if;
    v_months := v_months + 1;
  end loop;

  -- idempotent guard sync for every inventory partition (old and new)
  for v_part in
       select i.inhrelid::pg_catalog.regclass
         from pg_catalog.pg_inherits i
        where i.inhparent = 'public.inventory_txn'::pg_catalog.regclass
  loop
    perform public.fn_inventory_txn_protect_partition(v_part);
  end loop;
end $$;

revoke all on function fn_maintain_inventory_partitions(integer) from public;
grant execute on function fn_maintain_inventory_partitions(integer) to dms_maintainer;

reset role;

-- ---------------------------------------------------------------------------
-- 2) Audit / location wrappers — owner remains the table owner (dms_migrator, Model C).
--    Owner-level dedicated NOLOGIN ownership is NOT applied here: it requires transferring
--    audit_log/location_sample ownership (owner decision; see docs §10 and the S8-06 report).
-- ---------------------------------------------------------------------------
create or replace function fn_maintain_audit_partitions(p_months_ahead integer default 2)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_months integer;
  v_lower  date;
  v_upper  date;
  v_name   text;
begin
  if p_months_ahead is null or p_months_ahead < 0 or p_months_ahead > 12 then
    raise exception 'p_months_ahead must be between 0 and 12'
      using errcode = 'invalid_parameter_value';
  end if;

  v_months := -1;
  while v_months <= p_months_ahead loop
    v_lower := (pg_catalog.date_trunc('month', pg_catalog.current_date)
                + pg_catalog.make_interval(months => v_months))::pg_catalog.date;
    v_upper := (v_lower + interval '1 month')::pg_catalog.date;
    v_name  := 'audit_log_' || pg_catalog.to_char(v_lower, 'YYYY_MM');
    if not exists (
      select 1 from pg_catalog.pg_inherits i join pg_catalog.pg_class c on c.oid = i.inhrelid
       where i.inhparent = 'public.audit_log'::pg_catalog.regclass and c.relname = v_name
    ) then
      if pg_catalog.to_regclass(pg_catalog.format('public.%I', v_name)) is not null then
        raise exception 'relation % exists but is not attached as a partition; re-attach manually', v_name
          using errcode = 'duplicate_table';
      end if;
      execute pg_catalog.format('create table public.%I partition of public.audit_log for values from (%L) to (%L)',
                                v_name, v_lower, v_upper);
      -- append-only: explicit, not dependent on default privileges
      execute pg_catalog.format('revoke update, delete, truncate on public.%I from dms_app, dms_readonly', v_name);
      execute pg_catalog.format('grant select, insert on public.%I to dms_app', v_name);
      execute pg_catalog.format('grant select on public.%I to dms_readonly', v_name);
      execute pg_catalog.format('alter table public.%I enable row level security', v_name);
      execute pg_catalog.format('alter table public.%I force row level security', v_name);
      execute pg_catalog.format('drop policy if exists p_audit_log_tenant on public.%I', v_name);
      execute pg_catalog.format('create policy p_audit_log_tenant on public.%I for all '
                                'using (company_id is null or company_id = public.fn_current_company_id()) '
                                'with check (company_id is null or company_id = public.fn_current_company_id())', v_name);
    end if;
    v_months := v_months + 1;
  end loop;
end $$;

create or replace function fn_maintain_location_partitions(p_months_ahead integer default 2)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_months integer;
  v_lower  date;
  v_upper  date;
  v_name   text;
begin
  if p_months_ahead is null or p_months_ahead < 0 or p_months_ahead > 12 then
    raise exception 'p_months_ahead must be between 0 and 12'
      using errcode = 'invalid_parameter_value';
  end if;

  v_months := -1;
  while v_months <= p_months_ahead loop
    v_lower := (pg_catalog.date_trunc('month', pg_catalog.current_date)
                + pg_catalog.make_interval(months => v_months))::pg_catalog.date;
    v_upper := (v_lower + interval '1 month')::pg_catalog.date;
    v_name  := 'location_sample_' || pg_catalog.to_char(v_lower, 'YYYY_MM');
    if not exists (
      select 1 from pg_catalog.pg_inherits i join pg_catalog.pg_class c on c.oid = i.inhrelid
       where i.inhparent = 'public.location_sample'::pg_catalog.regclass and c.relname = v_name
    ) then
      if pg_catalog.to_regclass(pg_catalog.format('public.%I', v_name)) is not null then
        raise exception 'relation % exists but is not attached as a partition; re-attach manually', v_name
          using errcode = 'duplicate_table';
      end if;
      execute pg_catalog.format('create table public.%I partition of public.location_sample for values from (%L) to (%L)',
                                v_name, v_lower, v_upper);
      execute pg_catalog.format('revoke update, delete, truncate on public.%I from dms_app, dms_readonly', v_name);
      execute pg_catalog.format('grant select, insert on public.%I to dms_app', v_name);
      execute pg_catalog.format('grant select on public.%I to dms_readonly', v_name);
      execute pg_catalog.format('alter table public.%I enable row level security', v_name);
      execute pg_catalog.format('alter table public.%I force row level security', v_name);
      execute pg_catalog.format('drop policy if exists p_location_sample_tenant on public.%I', v_name);
      execute pg_catalog.format('create policy p_location_sample_tenant on public.%I for all '
                                'using (exists (select 1 from public.staff s where s.id = staff_id)) '
                                'with check (exists (select 1 from public.staff s where s.id = staff_id))', v_name);
    end if;
    v_months := v_months + 1;
  end loop;
end $$;

-- EXECUTE: only dms_maintainer. PUBLIC and runtime roles are denied explicitly.
revoke all on function fn_maintain_audit_partitions(integer) from public, dms_app, dms_readonly, dms_owner;
revoke all on function fn_maintain_location_partitions(integer) from public, dms_app, dms_readonly, dms_owner;
grant execute on function fn_maintain_audit_partitions(integer) to dms_maintainer;
grant execute on function fn_maintain_location_partitions(integer) to dms_maintainer;

-- ---------------------------------------------------------------------------
-- 3) Migration history is not a runtime artifact
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.schema_migrations') is not null then
    revoke all on table public.schema_migrations from public;
    if exists (select 1 from pg_roles where rolname = 'dms_app') then
      execute 'revoke all on table public.schema_migrations from dms_app';
    end if;
    if exists (select 1 from pg_roles where rolname = 'dms_readonly') then
      execute 'revoke all on table public.schema_migrations from dms_readonly';
    end if;
    if exists (select 1 from pg_roles where rolname = 'dms_maintainer') then
      execute 'revoke all on table public.schema_migrations from dms_maintainer';
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4) Post-check (fail-closed): the re-asserted invariants must hold before COMMIT
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_bad text := '';
begin
  for r in
    select p.oid, p.proname::text as fn, pg_get_userbyid(p.proowner) as owner,
           p.prosecdef, p.proconfig
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('fn_maintain_inventory_partitions',
                         'fn_maintain_audit_partitions',
                         'fn_maintain_location_partitions')
  loop
    if not r.prosecdef then v_bad := v_bad || r.fn || ': prosecdef=false; '; end if;
    if r.proconfig is null or not ('search_path=pg_catalog, public, pg_temp' = any (r.proconfig)) then
      v_bad := v_bad || r.fn || ': proconfig=' || coalesce(array_to_string(r.proconfig, ','), 'NULL') || '; ';
    end if;
    -- NULL proacl means the built-in default (EXECUTE to PUBLIC) is in effect ⇒ treated as a violation.
    if exists (select 1 from pg_proc p2 where p2.oid = r.oid and p2.proacl is null)
       or exists (select 1 from pg_proc p3, aclexplode(p3.proacl) a
                   where p3.oid = r.oid and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
      v_bad := v_bad || r.fn || ': PUBLIC has EXECUTE; ';
    end if;
    if not has_function_privilege('dms_maintainer', r.oid, 'EXECUTE') then
      v_bad := v_bad || r.fn || ': dms_maintainer lacks EXECUTE; ';
    end if;
    if has_function_privilege('dms_app', r.oid, 'EXECUTE') or has_function_privilege('dms_readonly', r.oid, 'EXECUTE') then
      v_bad := v_bad || r.fn || ': dms_app/dms_readonly has EXECUTE; ';
    end if;
  end loop;
  if v_bad <> '' then
    raise exception '0072 post-check failed: %', v_bad using errcode = 'insufficient_privilege';
  end if;
end $$;
