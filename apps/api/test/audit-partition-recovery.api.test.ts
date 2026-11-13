import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * TASK-PM-01D-M4-G — F-R-02: اثباتِ مدل واقعی مالکیت/عضویت و هویت ترمیم پارتیشن.
 *
 * بازبینی مستقل F-R-02 نشان داد پیام F «نقش مهاجرت» را معرفی میکرد، درحالیکه
 * dms_migrator عضو dms_owner نیست و مالک audit_log نیست، dms_owner هیچ CREATEـی
 * ندارد و dms_app روی «همهٔ توابع public» EXECUTE داشت. ۰۰۶۴ حقیقت را اعمال کرد:
 * fn_ensure_partitions فقط توسط مالک اشیاء (DATABASE_URL) قابلاجراست،
 * SECURITY INVOKER است، search_path پین شده و EXECUTE از PUBLIC/تمام نقشهای
 * زمان اجرا/گزارشگیری/مهاجرت/مالکیتِ بیملکیت گرفته شده است.
 *
 * تمام اتصالها TCP واقعی با رمز تصادفی و current_user تأییدشدهاند؛ از SET ROLE
 * برای جایگزینی اثبات هویت استفاده نشده و هیچ آزمون کمینهامتیازی با ابرکاربر
 * «سبز» نشده است. DB کاملاً یکبارمصرف است و در پایان حذف میشود.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const PSQL = process.env.PSQL ?? 'psql';
const MIG = path.join(ROOT, 'migrations');
const DB_NAME = `greendms_g_recovery_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
const MAINT_ROLE = `g_recovery_${process.pid}_${crypto.randomBytes(3).toString('hex')}`;

const adminUrl = new URL(process.env.DATABASE_URL ?? '');
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
const host = adminUrl.hostname || '127.0.0.1';
const port = adminUrl.port || '5432';

const UP_FLAGS = readdirSync(MIG)
  .filter((f) => f.endsWith('.up.sql'))
  .sort()
  .flatMap((f) => ['-f', path.join(MIG, f)]);

const passwords: Record<string, string> = {};
let admin: pg.Pool;
let db: pg.Pool;
const clients: pg.Client[] = [];
let currentMonthPartition = '';
let pastPartitionAt = '';
let historicCount = 0;
let historicChecksum = '';

const urlFor = (role: string) =>
  `postgres://${role}:${passwords[role]}@${host}:${port}/${DB_NAME}`;

async function asRole(role: string): Promise<pg.Client> {
  const c = new pg.Client({ connectionString: urlFor(role), application_name: `g_role_${role}` });
  await c.connect();
  clients.push(c);
  return c;
}

async function identity(c: pg.Client): Promise<Record<string, unknown>> {
  const { rows } = await c.query(`
    select current_user, session_user,
           (select rolsuper from pg_roles where rolname=current_user) as rolsuper,
           (select rolbypassrls from pg_roles where rolname=current_user) as rolbypassrls,
           (select rolcreatedb from pg_roles where rolname=current_user) as rolcreatedb,
           (select rolcreaterole from pg_roles where rolname=current_user) as rolcreaterole`);
  return rows[0];
}

beforeAll(async () => {
  admin = new pg.Pool({ connectionString: adminUrl.toString(), max: 2 });
  await admin.query(
    'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
    [DB_NAME],
  );
  await admin.query(`drop database if exists "${DB_NAME}"`);
  await admin.query(`create database "${DB_NAME}"`);
  execFileSync(PSQL, [...psqlBase, '-d', DB_NAME, '-1', '-q', ...UP_FLAGS], {
    env: psqlEnv,
    stdio: 'pipe',
  });

  const testUrl = new URL(adminUrl);
  testUrl.pathname = `/${DB_NAME}`;
  db = new pg.Pool({ connectionString: testUrl.toString(), max: 4 });

  for (const role of ['dms_app', 'dms_readonly', 'dms_migrator', 'dms_owner']) {
    passwords[role] = crypto.randomBytes(18).toString('hex');
    await admin.query(`alter role ${role} login password '${passwords[role]}'`);
  }
  // grant connect سراسری است؛ بقیهٔ DDL/Grant روی «همان DB یکبارمصرف» اجرا میشود
  // (adminPool به DB postgres وصل است و public.audit_log را نمیبیند).
  await admin.query(`grant connect on database "${DB_NAME}" to dms_app, dms_readonly, dms_migrator, dms_owner`);

  // هویت نگهداشتِ غیرابرکاربر (فقط در DB یکبارمصرف): مالکیت والدها به آن منتقل و
  // EXECUTE صریح گرفته میشود. این همان تعریف مستند «مالک اشیاء» است، بدون
  // SECURITY DEFINER، بدون تصعید امتیاز و بدون تغییر نقش/رمز production.
  passwords[MAINT_ROLE] = crypto.randomBytes(18).toString('hex');
  await db.query(
    `create role "${MAINT_ROLE}" login password '${passwords[MAINT_ROLE]}' nosuperuser nobypassrls nocreatedb nocreaterole`,
  );
  await db.query(`grant usage, create on schema public to "${MAINT_ROLE}"`);
  await admin.query(`grant connect on database "${DB_NAME}" to "${MAINT_ROLE}"`);
  for (const t of ['audit_log', 'location_sample', 'inventory_txn']) {
    await db.query(`alter table public.${t} owner to "${MAINT_ROLE}"`);
  }
  await db.query(`grant execute on function public.fn_ensure_partitions(integer) to "${MAINT_ROLE}"`);

  // ردیفهای تاریخی در پارتیشنی «غیر از» پارتیشنی که حذف میشود.
  currentMonthPartition = (
    await db.query<{ name: string }>(
      `select 'audit_log_' || to_char(date_trunc('month', current_date),'YYYY_MM') as name`,
    )
  ).rows[0].name;
  const past = (
    await db.query<{ name: string; at: string }>(
      `select c.relname as name,
              (replace(substring(c.relname from length('audit_log_')+1), '_','-') || '-02')::timestamptz as at
         from pg_inherits i join pg_class c on c.oid=i.inhrelid
        where i.inhparent='public.audit_log'::regclass and c.relname <> $1
        order by c.relname limit 1`,
      [currentMonthPartition],
    )
  ).rows[0];
  pastPartitionAt = past.at;
  for (let i = 0; i < 3; i += 1) {
    await db.query(
      `insert into audit_log(company_id, action, entity_type, at) values (null,'login','auth',$1::timestamptz)`,
      [pastPartitionAt],
    );
  }
  const before = await db.query<{ n: number; sum: string }>(
    `select count(*)::int as n, coalesce(sum(id),0)::text as sum from audit_log`,
  );
  historicCount = before.rows[0].n;
  historicChecksum = before.rows[0].sum;
  expect(historicCount).toBe(3);
}, 180_000);

afterAll(async () => {
  for (const c of clients) await c.end().catch(() => undefined);
  await db?.end().catch(() => undefined);
  if (admin) {
    await admin.query(
      'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
      [DB_NAME],
    ).catch(() => undefined);
    await admin.query(`drop database if exists "${DB_NAME}"`).catch(() => undefined);
    await admin.query(`drop role if exists "${MAINT_ROLE}"`).catch(() => undefined);
    for (const role of ['dms_app', 'dms_readonly', 'dms_migrator', 'dms_owner']) {
      await admin.query(`alter role ${role} nologin`).catch(() => undefined);
    }
    await admin.end().catch(() => undefined);
  }
});

describe('TASK-PM-01D-M4-G — F-R-02: real PostgreSQL recovery identities', () => {
  it('documents the actual ownership/membership model and the hardened function boundary', async () => {
    const { rows } = await db.query(`
      select
        (select relowner::regrole::text from pg_class where relname='audit_log') as audit_owner_before,
        (select prosecdef from pg_proc where oid='public.fn_ensure_partitions(integer)'::regprocedure) as secdef,
        (select proconfig::text from pg_proc where oid='public.fn_ensure_partitions(integer)'::regprocedure) as config,
        (select bool_and(not has_function_privilege(r.rolname,'public.fn_ensure_partitions(integer)','EXECUTE'))
           from pg_roles r where r.rolname in ('dms_app','dms_readonly','dms_migrator','dms_owner')) as runtime_no_execute,
        (select pg_has_role('dms_migrator','dms_owner','USAGE')) as migrator_is_owner_member,
        (select has_schema_privilege('dms_owner','public','CREATE')) as owner_has_create,
        (select has_schema_privilege('dms_app','public','CREATE')) as app_has_create`);
    // مالکیت والدها در همین DB به هویت نگهداشت منتقل شده است (fixture)،
    // بنابراین «مدل واقعی» = مالک اشیاء؛ dms_migrator عضو dms_owner نیست.
    expect(rows[0].audit_owner_before).toBe(MAINT_ROLE);
    expect(rows[0].secdef).toBe(false);
    expect(rows[0].config).toContain('search_path=public, pg_catalog, pg_temp');
    expect(rows[0].runtime_no_execute).toBe(true);
    expect(rows[0].migrator_is_owner_member).toBe(false);
    expect(rows[0].owner_has_create).toBe(false);
    expect(rows[0].app_has_create).toBe(false);
  });

  it('dms_app: real TCP identity, no DDL/CREATE, no EXECUTE on maintenance, no elevated attributes', async () => {
    const c = await asRole('dms_app');
    const id = await identity(c);
    expect(id.current_user).toBe('dms_app');
    expect(id.session_user).toBe('dms_app'); // اثبات اتصال واقعی، نه SET ROLE
    expect(id.rolsuper).toBe(false);
    expect(id.rolbypassrls).toBe(false);
    expect(id.rolcreatedb).toBe(false);
    expect(id.rolcreaterole).toBe(false);
    await expect(c.query(`select fn_ensure_partitions(2)`)).rejects.toThrow();
    await expect(c.query(`create table public.g_app_ddl_probe(i int)`)).rejects.toThrow();
    await expect(
      c.query(`create table public.g_app_part partition of public.audit_log for values from ('2030-01-01') to ('2030-02-01')`),
    ).rejects.toThrow();
  });

  it('dms_readonly: real TCP identity, cannot read protected evidence and cannot execute maintenance', async () => {
    const c = await asRole('dms_readonly');
    const id = await identity(c);
    expect(id.current_user).toBe('dms_readonly');
    expect(id.session_user).toBe('dms_readonly');
    await expect(c.query(`select fn_ensure_partitions(2)`)).rejects.toThrow();
    await expect(c.query(`select * from product_bulk_operation`)).rejects.toThrow();
    await expect(c.query(`select * from product_bulk_history_event`)).rejects.toThrow();
  });

  it('dms_migrator and dms_owner (real TCP) cannot execute the maintenance function', async () => {
    for (const role of ['dms_migrator', 'dms_owner']) {
      const c = await asRole(role);
      const id = await identity(c);
      expect(id.current_user).toBe(role);
      expect(id.session_user).toBe(role);
      expect(id.rolsuper).toBe(false);
      await expect(c.query(`select fn_ensure_partitions(2)`)).rejects.toThrow();
    }
  });

  it('dms_app cannot acquire elevated privileges through the guard (explicit ownership error if called)', async () => {
    // حتی اگر EXECUTEـای صریحِ آزمایشی داده شود، پیششرط مالکیت در خودِ تابع
    // جلوی ایجاد پارتیشن را میگیرد و پیام هویت پشتیبانیشده را نام میبرد.
    await db.query(`grant execute on function public.fn_ensure_partitions(integer) to dms_app`);
    try {
      const c = await asRole('dms_app');
      await expect(c.query(`select fn_ensure_partitions(2)`)).rejects.toThrow(/مالک|owner|permission/);
    } finally {
      await db.query(`revoke execute on function public.fn_ensure_partitions(integer) from dms_app`);
    }
  });

  it('authorized non-superuser object owner creates the missing partition, preserves history/RLS, and is idempotent', async () => {
    // شبیهسازی «پارتیشن موجود نیست» توسط تست (نه تابع ترمیم).
    await db.query(`drop table if exists public."${currentMonthPartition}"`);
    const mid = await db.query<{ n: number; sum: string }>(
      `select count(*)::int as n, coalesce(sum(id),0)::text as sum from audit_log`,
    );
    expect(mid.rows[0].n).toBe(historicCount);
    expect(mid.rows[0].sum).toBe(historicChecksum);

    const maint = await asRole(MAINT_ROLE);
    const id = await identity(maint);
    expect(id.current_user).toBe(MAINT_ROLE);
    expect(id.session_user).toBe(MAINT_ROLE);
    expect(id.rolsuper).toBe(false);

    await maint.query(`select fn_ensure_partitions(2)`);
    await maint.query(`select fn_ensure_partitions(2)`); // تکرار ⇒ بایدار، بدون پارتیشن تکراری

    const after = await db.query<{ n: number; sum: string; dup: number; rls: boolean; pol: number; app_sel: boolean; app_ins: boolean; ro_sel: boolean; forced_parent: boolean }>(`
      select
        (select count(*)::int from audit_log) as n,
        (select coalesce(sum(id),0)::text from audit_log) as sum,
        (select count(*)::int from pg_class where relname=$1) as dup,
        (select relrowsecurity and relforcerowsecurity from pg_class where relname=$1) as rls,
        (select count(*)::int from pg_policy where polrelid=(select oid from pg_class where relname=$1) and polname='p_audit_log_tenant') as pol,
        (select has_table_privilege('dms_app',$1,'SELECT')) as app_sel,
        (select has_table_privilege('dms_app',$1,'INSERT')) as app_ins,
        (select has_table_privilege('dms_readonly',$1,'SELECT')) as ro_sel,
        (select relforcerowsecurity from pg_class where relname='audit_log') as forced_parent`,
      [currentMonthPartition]);
    expect(after.rows[0].n).toBe(historicCount);       // ردیفهای تاریخی دستنخورده
    expect(after.rows[0].sum).toBe(historicChecksum);
    expect(after.rows[0].dup).toBe(1);                  // بدون پارتیشن تکراری
    expect(after.rows[0].rls).toBe(true);
    expect(after.rows[0].pol).toBe(1);
    expect(after.rows[0].forced_parent).toBe(true);
    expect(after.rows[0].app_sel).toBe(true);
    expect(after.rows[0].app_ins).toBe(true);
    expect(after.rows[0].ro_sel).toBe(true);

    // هویت مستند (مالک اشیاء = DATABASE_URL در توپولوژی CI) نیز میتواند ترمیم کند.
    await db.query(`select fn_ensure_partitions(2)`);
  });

  it('documented owner identity (DATABASE_URL) can also run idempotent recovery', async () => {
    const { rows } = await db.query<{ u: string; s: boolean }>(
      `select current_user as u, (select rolsuper from pg_roles where rolname=current_user) as s`,
    );
    // در توپولوژی CI/compose این هویت ابرکاربر/مالک است؛ صرفاً بهعنوان «هویت
    // پشتیبانیشدهٔ مستند» تأیید میشود، نه برای سبزکردن آزمون کمینهامتیاز.
    expect(rows[0].s).toBe(true);
    await db.query(`select fn_ensure_partitions(2)`);
    const { rows: dup } = await db.query<{ n: number }>(
      `select count(*)::int as n from pg_class where relname=$1`, [currentMonthPartition],
    );
    expect(dup[0].n).toBe(1);
  });
});
