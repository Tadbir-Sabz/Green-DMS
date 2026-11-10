#!/usr/bin/env node
/**
 * TASK-PM-01D-M4-I — bounded, fail-closed cleanup of expired M4 preview rows.
 *
 * This is an explicit operator tool, NOT an API route, runtime job, migration,
 * scheduler or production configuration. It never grants DELETE to dms_app,
 * never adds SECURITY DEFINER, and never edits protected migration SQL. A dry
 * run is the default; --apply is required for any deletion. The caller must
 * supply an explicit tenant UUID and an explicit ISO cutoff. No retention
 * window, schedule or production policy is invented here.
 *
 * Required environment (explicit invocation only; no .env is loaded):
 *   DATABASE_URL                         authorized object-owner connection
 *   BULK_PREVIEW_CLEANUP_COMPANY_ID      UUID of exactly one tenant
 *   BULK_PREVIEW_CLEANUP_BEFORE          ISO-8601 timestamp with offset/Z
 *
 * Usage:
 *   node scripts/cleanup-expired-bulk-previews.mjs              # dry run
 *   node scripts/cleanup-expired-bulk-previews.mjs --apply      # delete
 *
 * Only `preview_created` rows whose `expires_at` is at/before the cutoff and
 * which have no operation-bound evidence are eligible. The object owner must
 * be able to see evidence across tenants (superuser/BYPASSRLS) so that a
 * hidden cross-tenant evidence row cannot be orphaned; otherwise the script
 * fails closed. RLS, grants and the exactly-one-tenant boundary are rechecked
 * inside one short transaction.
 */

import pg from 'pg';

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function parseArgs(argv) {
  const args = new Set(argv);
  for (const arg of args) {
    if (arg !== '--apply' && arg !== '--help' && arg !== '-h') {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return { apply: args.has('--apply'), help: args.has('--help') || args.has('-h') };
}

function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error(`${name} must be set explicitly`);
  return value.trim();
}

function validateInputs() {
  const databaseUrl = required('DATABASE_URL');
  const companyId = required('BULK_PREVIEW_CLEANUP_COMPANY_ID');
  const cutoff = required('BULK_PREVIEW_CLEANUP_BEFORE');
  if (!UUID_RE.test(companyId)) {
    throw new Error('BULK_PREVIEW_CLEANUP_COMPANY_ID must be a UUID');
  }
  if (!ISO_RE.test(cutoff) || Number.isNaN(Date.parse(cutoff))) {
    throw new Error('BULK_PREVIEW_CLEANUP_BEFORE must be an ISO-8601 timestamp with Z or numeric offset');
  }
  try {
    const parsed = new URL(databaseUrl);
    if (!/^postgres(?:ql)?:$/.test(parsed.protocol)) {
      throw new Error('DATABASE_URL must use postgres:// or postgresql://');
    }
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
  }
  return { databaseUrl, companyId, cutoff };
}

async function preflight(client) {
  const { rows } = await client.query(`
    select
      current_user::text                                      as current_user,
      c.relowner::regrole::text                               as table_owner,
      pg_has_role(current_user, c.relowner::regrole::text, 'USAGE') as owner_ok,
      has_table_privilege(current_user, 'public.product_bulk_operation', 'DELETE') as can_delete,
      coalesce((select rolsuper or rolbypassrls
                  from pg_roles where rolname = current_user), false) as full_visibility,
      c.relrowsecurity                                        as rls_enabled,
      c.relforcerowsecurity                                   as rls_forced,
      to_regclass('public.product_bulk_history_event')        is not null as evidence_table_present,
      has_table_privilege('dms_app', 'public.product_bulk_operation', 'DELETE') as dms_app_delete,
      has_table_privilege('dms_readonly', 'public.product_bulk_operation', 'SELECT') as dms_readonly_select,
      coalesce(current_setting('app.company_id', true), '')  as tenant_guc_before,
      coalesce(current_setting('app.user_id', true), '')     as user_guc_before,
      coalesce(current_setting('app.bulk_operation_id', true), '') as bulk_guc_before,
      current_setting('row_security')                         as row_security
    from pg_class c
    where c.oid = 'public.product_bulk_operation'::regclass
  `);
  if (rows.length !== 1) throw new Error('public.product_bulk_operation not found');
  const p = rows[0];
  if (p.tenant_guc_before || p.user_guc_before || p.bulk_guc_before) {
    throw new Error('tenant/user/bulk GUC already set on the maintenance connection; refusing to reuse a leaked context');
  }
  if (!p.rls_enabled || !p.rls_forced) throw new Error('product_bulk_operation must keep FORCE ROW LEVEL SECURITY');
  if (p.dms_app_delete) throw new Error('dms_app unexpectedly has DELETE on product_bulk_operation; refusing cleanup');
  if (p.dms_readonly_select) throw new Error('dms_readonly unexpectedly has SELECT on product_bulk_operation; refusing cleanup');
  if (!p.evidence_table_present) throw new Error('0063 evidence table is missing; refusing cleanup on an unsupported schema');
  if (!p.owner_ok || !p.can_delete) {
    throw new Error('cleanup requires the object owner / authorized DATABASE_URL identity with DELETE; dms_app, dms_readonly, dms_migrator and dms_owner are not sufficient');
  }
  if (!p.full_visibility) {
    throw new Error('cleanup requires superuser/BYPASSRLS owner identity for a full cross-tenant evidence check; production topology must supply that identity or no cleanup is performed');
  }
  if (p.row_security !== 'on') throw new Error('row_security must be on');
  return p;
}

async function candidateIds(client, companyId, cutoff) {
  const { rows } = await client.query(`
    select o.id::text as id
      from product_bulk_operation o
     where o.company_id = $1::uuid
       and o.status = 'preview_created'
       and o.expires_at <= $2::timestamptz
       and not exists (
         select 1 from product_bulk_history_event e
          where e.bulk_operation_id = o.id
       )
       and not exists (
         select 1 from product_catalog_history h
          where h.bulk_operation_id = o.id
       )
       and not exists (
         select 1 from audit_log a
          where a.bulk_operation_id = o.id
       )
     order by o.expires_at, o.id
     for update of o
  `, [companyId, cutoff]);
  return rows.map((r) => r.id);
}

async function statusCounts(client, companyId) {
  const { rows } = await client.query(`
    select status, count(*)::int as n
      from product_bulk_operation
     where company_id = $1::uuid
     group by status
     order by status
  `, [companyId]);
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

async function main() {
  const { apply, help } = parseArgs(process.argv.slice(2));
  if (help) {
    console.log('Usage: node scripts/cleanup-expired-bulk-previews.mjs [--apply]');
    return;
  }

  const { databaseUrl, companyId, cutoff } = validateInputs();
  const client = new pg.Client({ connectionString: databaseUrl, application_name: 'dms_m4_preview_cleanup' });
  await client.connect();
  let out;
  try {
    await client.query('BEGIN');
    await client.query(`set local statement_timeout = '30s'`);
    await client.query(`set local lock_timeout = '5s'`);
    await client.query(`set local idle_in_transaction_session_timeout = '30s'`);
    await client.query(`set local row_security = on`);
    await client.query(`set local search_path = public, pg_catalog, pg_temp`);

    const p = await preflight(client);
    await client.query(`select set_config('app.company_id', $1, true), set_config('app.user_id', '', true), set_config('app.bulk_operation_id', '', true)`, [companyId]);
    const guc = await client.query(`select fn_current_company_id()::text as company_id`);
    if (guc.rows[0]?.company_id !== companyId) {
      throw new Error('app.company_id did not resolve to the requested tenant; refusing cleanup');
    }

    const before = await statusCounts(client, companyId);
    const ids = await candidateIds(client, companyId, cutoff);
    let deletedCount = 0;
    if (apply && ids.length > 0) {
      const del = await client.query(`
        delete from product_bulk_operation o
         where o.id = any($3::uuid[])
           and o.company_id = $1::uuid
           and o.status = 'preview_created'
           and o.expires_at <= $2::timestamptz
           and not exists (
             select 1 from product_bulk_history_event e
              where e.bulk_operation_id = o.id
           )
           and not exists (
             select 1 from product_catalog_history h
              where h.bulk_operation_id = o.id
           )
           and not exists (
             select 1 from audit_log a
              where a.bulk_operation_id = o.id
           )
         returning o.id::text as id
      `, [companyId, cutoff, ids]);
      deletedCount = del.rowCount ?? 0;
      if (deletedCount !== ids.length) {
        throw new Error(`candidate/delete mismatch: ${ids.length} candidates, ${deletedCount} deleted`);
      }
    }
    const after = await statusCounts(client, companyId);
    const postflight = await client.query(`
      select
        has_table_privilege('dms_app', 'public.product_bulk_operation', 'DELETE') as dms_app_delete,
        has_table_privilege('dms_readonly', 'public.product_bulk_operation', 'SELECT') as dms_readonly_select,
        c.relrowsecurity as rls_enabled,
        c.relforcerowsecurity as rls_forced
      from pg_class c
      where c.oid = 'public.product_bulk_operation'::regclass
    `);
    if (postflight.rows[0].dms_app_delete || postflight.rows[0].dms_readonly_select ||
        !postflight.rows[0].rls_enabled || !postflight.rows[0].rls_forced) {
      throw new Error('RLS/grant postflight failed; rolling back');
    }
    await client.query('COMMIT');
    out = {
      task: 'TASK-PM-01D-M4-I',
      mode: apply ? 'apply' : 'dry-run',
      company_id: companyId,
      cutoff,
      current_user: p.current_user,
      table_owner: p.table_owner,
      owner_ok: p.owner_ok,
      full_visibility: p.full_visibility,
      rls_forced: p.rls_forced,
      dms_app_delete: p.dms_app_delete,
      dms_readonly_select: p.dms_readonly_select,
      candidate_count: ids.length,
      deleted_count: deletedCount,
      candidate_ids: ids,
      before_status_counts: before,
      after_status_counts: after,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    await client.end().catch(() => undefined);
  }
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ task: 'TASK-PM-01D-M4-I', error: err.message, mode: 'aborted' }, null, 2));
  process.exitCode = 1;
});
