import 'reflect-metadata';
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * TASK-PM-01D-M4-I — F-R-03: bounded cleanup of expired, evidence-free M4
 * preview rows. Native disposable PostgreSQL only; no shared/production DB,
 * production config, role/secret change, migration edit or CI change.
 *
 * The operator tool is invoked as a separate process with an explicit owner
 * DATABASE_URL, tenant UUID and cutoff. No .env is loaded by either process.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'cleanup-expired-bulk-previews.mjs');
const PSQL = process.env.PSQL ?? 'psql';
const DB_NAME = `greendms_i_cleanup_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
const DENIED_ROLE = `greendms_i_cleanup_denied_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;

let rootAdmin: pg.Pool;
let admin: pg.Pool;
let ownerUrl: string;
let deniedUrl: string;
let companyId: string;
let otherCompanyId: string;
let cutoff: string;
let ops: Record<string, string>;

const uuid = () => crypto.randomUUID();

function cleanupEnv(url: string, tenant: string, before: string) {
  return {
    ...process.env,
    DATABASE_URL: url,
    BULK_PREVIEW_CLEANUP_COMPANY_ID: tenant,
    BULK_PREVIEW_CLEANUP_BEFORE: before,
  };
}

function runCleanup(url: string, tenant: string, before: string, apply: boolean) {
  const stdout = execFileSync(process.execPath, [SCRIPT, ...(apply ? ['--apply'] : [])], {
    env: cleanupEnv(url, tenant, before),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(stdout);
}

function spawnCleanup(url: string, tenant: string, before: string, apply: boolean) {
  return spawnSync(process.execPath, [SCRIPT, ...(apply ? ['--apply'] : [])], {
    env: cleanupEnv(url, tenant, before),
    encoding: 'utf8',
  });
}

async function exists(id: string): Promise<boolean> {
  const { rows } = await admin.query<{ present: boolean }>(
    'select exists(select 1 from product_bulk_operation where id = $1::uuid) as present',
    [id],
  );
  return rows[0].present;
}

async function teardown() {
  await admin?.end().catch(() => undefined);
  if (rootAdmin) {
    await rootAdmin.query(
      'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
      [DB_NAME],
    ).catch(() => undefined);
    await rootAdmin.query(`drop database if exists "${DB_NAME}"`).catch(() => undefined);
    await rootAdmin.query(`drop role if exists "${DENIED_ROLE}"`).catch(() => undefined);
    await rootAdmin.end().catch(() => undefined);
  }
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL must be set explicitly for this disposable-DB suite');
  const adminUrl = new URL(process.env.DATABASE_URL);
  const testUrl = new URL(adminUrl);
  testUrl.pathname = `/${DB_NAME}`;
  ownerUrl = testUrl.toString();

  const psqlEnv = {
    ...process.env,
    ...(adminUrl.password ? { PGPASSWORD: decodeURIComponent(adminUrl.password) } : {}),
  };
  const psqlBase = [
    '-h', adminUrl.hostname || '127.0.0.1',
    '-U', adminUrl.username || 'postgres',
    '-p', adminUrl.port || '5432',
    '-v', 'ON_ERROR_STOP=1',
  ];

  rootAdmin = new pg.Pool({ connectionString: adminUrl.toString(), max: 2 });
  await rootAdmin.query(
    'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
    [DB_NAME],
  );
  await rootAdmin.query(`drop database if exists "${DB_NAME}"`);
  await rootAdmin.query(`create database "${DB_NAME}"`);

  const upFiles = readdirSync(path.join(ROOT, 'migrations'))
    .filter((f) => f.endsWith('.up.sql'))
    .sort()
    .flatMap((f) => ['-f', path.join(ROOT, 'migrations', f)]);
  execFileSync(PSQL, [...psqlBase, '-d', DB_NAME, '-1', '-q', ...upFiles], {
    env: psqlEnv,
    stdio: 'pipe',
  });

  admin = new pg.Pool({ connectionString: testUrl.toString(), max: 4 });
  companyId = uuid();
  otherCompanyId = uuid();
  ops = {
    cleanExpired: uuid(),
    evidenceExpired: uuid(),
    futurePreview: uuid(),
    committedExpired: uuid(),
    unknownExpired: uuid(),
    acceptedExpired: uuid(),
    rejectedExpired: uuid(),
    otherTenantExpired: uuid(),
  };

  await admin.query(
    `insert into company (id, code, legal_name) values ($1,'I-A','شرکت الف'), ($2,'I-B','شرکت ب')`,
    [companyId, otherCompanyId],
  );
  const row = (
    id: string,
    company: string,
    status: string,
    outcome: string,
    failure: string,
    expiry: string,
  ) => [id, company, status, outcome, failure, expiry];
  const values = [
    row(ops.cleanExpired, companyId, 'preview_created', 'not_started', 'none', "now() - interval '2 days'"),
    row(ops.evidenceExpired, companyId, 'preview_created', 'not_started', 'none', "now() - interval '3 days'"),
    row(ops.futurePreview, companyId, 'preview_created', 'not_started', 'none', "now() + interval '2 days'"),
    row(ops.committedExpired, companyId, 'committed', 'committed', 'none', "now() - interval '9 days'"),
    row(ops.unknownExpired, companyId, 'unknown', 'unknown', 'unknown', "now() - interval '9 days'"),
    row(ops.acceptedExpired, companyId, 'accepted', 'not_started', 'none', "now() - interval '9 days'"),
    row(ops.rejectedExpired, companyId, 'rejected', 'rolled_back', 'stale', "now() - interval '9 days'"),
    row(ops.otherTenantExpired, otherCompanyId, 'preview_created', 'not_started', 'none', "now() - interval '9 days'"),
  ];
  const params: string[] = [];
  const tuples = values.map(([id, company, status, outcome, failure, expiry]) => {
    const base = params.length;
    params.push(id, company, status, outcome, failure);
    return `($${base + 1}::uuid,$${base + 2}::uuid,$${base + 3},$${base + 4},$${base + 5},
      'rh','pt','ph',array[gen_random_uuid()]::uuid[],'{"name":"x"}'::jsonb,'{}'::jsonb,'{"items":[]}'::jsonb,${expiry})`;
  });
  await admin.query(
    `insert into product_bulk_operation
      (id, company_id, status, outcome, failure_category, request_hash,
       preview_token_hash, preview_hash, product_ids, changes, expected_versions, preview, expires_at)
     values ${tuples.join(',')}`,
    params,
  );
  await admin.query(
    `insert into product_bulk_history_event
      (bulk_operation_id, product_id, company_id, actor_user_id, history_id)
     values ($1::uuid, gen_random_uuid(), $2::uuid, gen_random_uuid(), 1)`,
    [ops.evidenceExpired, companyId],
  );

  cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const deniedPassword = crypto.randomBytes(18).toString('hex');
  await rootAdmin.query(
    `create role "${DENIED_ROLE}" login password '${deniedPassword}'
       nosuperuser nobypassrls nocreatedb nocreaterole`,
  );
  await rootAdmin.query(`grant connect on database "${DB_NAME}" to "${DENIED_ROLE}"`);
  await admin.query(`grant usage on schema public to "${DENIED_ROLE}"`);
  const denied = new URL(adminUrl);
  denied.username = DENIED_ROLE;
  denied.password = deniedPassword;
  denied.pathname = `/${DB_NAME}`;
  deniedUrl = denied.toString();
}, 180_000);

afterAll(async () => {
  await teardown();
});

describe('TASK-PM-01D-M4-I — expired preview cleanup (F-R-03)', () => {
  it('dry run identifies exactly one eligible row and changes nothing', async () => {
    const out = runCleanup(ownerUrl, companyId, cutoff, false);
    expect(out.mode).toBe('dry-run');
    expect(out.candidate_count).toBe(1);
    expect(out.candidate_ids).toEqual([ops.cleanExpired]);
    expect(out.deleted_count).toBe(0);
    expect(out.owner_ok).toBe(true);
    expect(out.rls_forced).toBe(true);
    expect(out.dms_app_delete).toBe(false);
    expect(out.dms_readonly_select).toBe(false);
    expect(out.before_status_counts).toEqual(out.after_status_counts);
    expect(await exists(ops.cleanExpired)).toBe(true);
  });

  it('apply deletes only the evidence-free expired preview of the requested tenant', async () => {
    const out = runCleanup(ownerUrl, companyId, cutoff, true);
    expect(out.mode).toBe('apply');
    expect(out.deleted_count).toBe(1);
    expect(out.candidate_ids).toEqual([ops.cleanExpired]);
    expect(await exists(ops.cleanExpired)).toBe(false);

    for (const id of [
      ops.evidenceExpired,
      ops.futurePreview,
      ops.committedExpired,
      ops.unknownExpired,
      ops.acceptedExpired,
      ops.rejectedExpired,
      ops.otherTenantExpired,
    ]) {
      expect(await exists(id)).toBe(true);
    }
    const evidence = await admin.query<{ n: number }>(
      'select count(*)::int as n from product_bulk_history_event where bulk_operation_id = $1::uuid',
      [ops.evidenceExpired],
    );
    expect(evidence.rows[0].n).toBe(1);

    const boundary = await admin.query<{
      app_delete: boolean;
      readonly_select: boolean;
      rls_enabled: boolean;
      rls_forced: boolean;
      tenant_guc: string;
    }>(`
      select
        has_table_privilege('dms_app','public.product_bulk_operation','DELETE') as app_delete,
        has_table_privilege('dms_readonly','public.product_bulk_operation','SELECT') as readonly_select,
        c.relrowsecurity as rls_enabled,
        c.relforcerowsecurity as rls_forced,
        coalesce(current_setting('app.company_id', true), '') as tenant_guc
      from pg_class c
      where c.oid = 'public.product_bulk_operation'::regclass
    `);
    expect(boundary.rows[0]).toMatchObject({
      app_delete: false,
      readonly_select: false,
      rls_enabled: true,
      rls_forced: true,
      tenant_guc: '',
    });
  });

  it('a repeated apply is idempotent and deletes nothing further', async () => {
    const out = runCleanup(ownerUrl, companyId, cutoff, true);
    expect(out.candidate_count).toBe(0);
    expect(out.deleted_count).toBe(0);
    expect(out.after_status_counts.preview_created).toBe(2);
  });

  it('a real non-owner TCP connection is denied before any deletion', async () => {
    const out = spawnCleanup(deniedUrl, companyId, cutoff, true);
    expect(out.status).toBe(1);
    expect(out.stderr).toContain('object owner');
    expect(out.stderr).toContain('aborted');
    expect(await exists(ops.otherTenantExpired)).toBe(true);
  });

  it('invalid tenant or cutoff fails closed with no cleanup', async () => {
    const badTenant = spawnCleanup(ownerUrl, 'not-a-uuid', cutoff, true);
    expect(badTenant.status).toBe(1);
    expect(badTenant.stderr).toContain('must be a UUID');

    const badCutoff = spawnCleanup(ownerUrl, companyId, '2026-11-10', true);
    expect(badCutoff.status).toBe(1);
    expect(badCutoff.stderr).toContain('ISO-8601');
    expect(await exists(ops.evidenceExpired)).toBe(true);
  });
});
