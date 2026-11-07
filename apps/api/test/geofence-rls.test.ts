import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';

/**
 * آزمون‌های RLS جدولِ geofence — TASK-23 (مجموعهٔ C؛ R-01 از TASK-22RQ).
 *
 * ماتریس: CRUD بین‌اجاره‌ای مسدود؛ چسباندنِ والدِ بیگانه مسدود (branch اجباری،
 * customer/warehouse قابلِ NULL با قیدِ صریحِ null-or-exists)؛ مسیرهایِ هندسی
 * (area) برایِ همان‌اجاره‌ای مجاز و پنهان از بیگانه؛ fail-closed بدونِ زمینه.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_geofence_rls_test';
const PSQL = process.env.PSQL ?? 'psql';
const RUNTIME_ROLE = 'dms_app';
const RUNTIME_PASSWORD = `T${crypto.randomBytes(12).toString('hex')}!9x`;

const adminUrl = new URL(process.env.DATABASE_URL ?? '');
const testUrl = new URL(adminUrl);
testUrl.pathname = `/${TEST_DB}`;
const appUrl = new URL(testUrl);
appUrl.username = RUNTIME_ROLE;
appUrl.password = RUNTIME_PASSWORD;

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

let adminPool: pg.Pool;
let ownerPool: pg.Pool;

type TenantCtx = string | 'none' | 'invalid';

async function asRuntime<T>(ctx: TenantCtx, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: appUrl.toString() });
  await client.connect();
  try {
    if (ctx === 'invalid') {
      await client.query(`select set_config('app.company_id', 'not-a-uuid', false)`);
    } else if (ctx !== 'none') {
      await client.query(`select set_config('app.company_id', $1, false)`, [ctx]);
    }
    return await fn(client);
  } finally {
    await client.end();
  }
}

const uid = () => crypto.randomBytes(6).toString('hex');

interface Kit {
  company: string;
  branch: string;
  customer: string;
  warehouse: string;
  geofenceFull: string;
  geofenceNullRefs: string;
}

async function seedKit(q: pg.Pool, companyCode: string): Promise<Kit> {
  const u = uid();
  const company = (await q.query(`insert into company (code, legal_name) values ($1,$2) returning id`, [companyCode, `شرکت ${companyCode}`])).rows[0].id;
  const branch = (await q.query(`insert into branch (company_id, code, name) values ($1,'HQ',$2) returning id`, [company, `مرکز ${companyCode}`])).rows[0].id;
  const person = (await q.query(`insert into person (company_id, code, first_name, last_name) values ($1,$2,'کاربر',$3) returning id`, [company, `GP-${u}`, companyCode])).rows[0].id;
  const customer = (await q.query(`insert into customer (person_id, branch_id, code) values ($1,$2,$3) returning id`, [person, branch, `GC-${u}`])).rows[0].id;
  const warehouse = (await q.query(`insert into warehouse (branch_id, code, name) values ($1,$2,'انبار') returning id`, [branch, `GW-${u}`])).rows[0].id;
  const poly = `POLYGON((51 35, 51.1 35, 51.1 35.1, 51 35.1, 51 35))`;
  const geofenceFull = (await q.query(
    `insert into geofence (branch_id, name, kind, area, customer_id, warehouse_id)
     values ($1,$2,'customer', ST_GeomFromText($3,4326), $4, $5) returning id`,
    [branch, `حوزهٔ کامل ${companyCode}`, poly, customer, warehouse],
  )).rows[0].id;
  const geofenceNullRefs = (await q.query(
    `insert into geofence (branch_id, name, kind, area)
     values ($1,$2,'warehouse', ST_GeomFromText($3,4326)) returning id`,
    [branch, `حوزهٔ بدونِ ارجاع ${companyCode}`, poly],
  )).rows[0].id;
  return { company, branch, customer, warehouse, geofenceFull, geofenceNullRefs };
}

let A: Kit;
let B: Kit;

beforeAll(async () => {
  adminPool = new pg.Pool({ connectionString: adminUrl.toString(), max: 1 });
  await adminPool.query(
    'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
    [TEST_DB],
  );
  await adminPool.query(`drop database if exists "${TEST_DB}"`);
  await adminPool.query(`create database "${TEST_DB}"`);

  const files = readdirSync(path.join(ROOT, 'migrations'))
    .filter((f) => f.endsWith('.up.sql'))
    .sort()
    .flatMap((f) => ['-f', path.join(ROOT, 'migrations', f)]);
  execFileSync(PSQL, [...psqlBase, '-d', TEST_DB, '-1', '-q', ...files], {
    env: psqlEnv,
    stdio: 'pipe',
  });

  ownerPool = new pg.Pool({ connectionString: testUrl.toString(), max: 4 });
  A = await seedKit(ownerPool, `GF_A_${uid()}`);
  B = await seedKit(ownerPool, `GF_B_${uid()}`);

  await adminPool.query(
    `alter role ${RUNTIME_ROLE} login password '${RUNTIME_PASSWORD.replace(/'/g, "''")}'`,
  );
}, 300_000);

afterAll(async () => {
  await ownerPool?.end();
  if (adminPool) {
    await adminPool.query(
      'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
      [TEST_DB],
    );
    await adminPool.query(`drop database if exists "${TEST_DB}"`).catch(() => undefined);
    await adminPool.query(`alter role ${RUNTIME_ROLE} nologin`).catch(() => undefined);
    await adminPool.end();
  }
});

describe('geofence — RLS فعال و اجباری', () => {
  it('enabled + forced + سیاستِ p_geofence_tenant برقرار است', async () => {
    const { rows } = await ownerPool.query(
      `select relrowsecurity, relforcerowsecurity,
              exists (select 1 from pg_policy where polname='p_geofence_tenant') as has_policy
         from pg_class where relname='geofence'`,
    );
    expect(rows[0].relrowsecurity).toBe(true);
    expect(rows[0].relforcerowsecurity).toBe(true);
    expect(rows[0].has_policy).toBe(true);
  });
});

describe('geofence — جداسازیِ CRUD بین‌اجاره‌ای', () => {
  it('A فقط حوزه‌هایِ خودش را می‌بیند (هم با ارجاع و هم بدونِ ارجاع)', async () => {
    const a = await asRuntime(A.company, (c) => c.query(`select id from geofence order by name`));
    const b = await asRuntime(B.company, (c) => c.query(`select id from geofence order by name`));
    expect(a.rows.map((r) => r.id).sort()).toEqual([A.geofenceFull, A.geofenceNullRefs].sort());
    expect(b.rows.map((r) => r.id).sort()).toEqual([B.geofenceFull, B.geofenceNullRefs].sort());
  });

  it('A نمی‌تواند حوزهٔ B را به‌روزرسانی/حذف کند', async () => {
    const up = await asRuntime(A.company, (c) =>
      c.query(`update geofence set name='x' where id=$1`, [B.geofenceFull]),
    );
    const del = await asRuntime(A.company, (c) =>
      c.query(`delete from geofence where id=$1`, [B.geofenceFull]),
    );
    expect(up.rowCount).toBe(0);
    expect(del.rowCount).toBe(0);
    const row = await ownerPool.query(`select name from geofence where id=$1`, [B.geofenceFull]);
    expect(row.rows[0].name).toContain('حوزهٔ کامل');
  });

  it('درجِ همان‌اجاره‌ای با/بدونِ ارجاعِ قابلِ NULL مجاز است', async () => {
    const res = await asRuntime(A.company, (c) =>
      c.query(
        `insert into geofence (branch_id, name, kind, area) values ($1,$2,'work_area', ST_GeomFromText($3,4326)) returning id`,
        [A.branch, `حوزهٔ نو ${uid()}`, `POLYGON((52 36, 52.1 36, 52.1 36.1, 52 36.1, 52 36))`],
      ),
    );
    expect(res.rowCount).toBe(1);
    await ownerPool.query(`delete from geofence where id=$1`, [res.rows[0].id]);
  });

  it('بدونِ زمینه/زمینهٔ نامعتبر ⇒ fail-closed', async () => {
    const none = await asRuntime('none', (c) => c.query(`select * from geofence`));
    const bad = await asRuntime('invalid', (c) => c.query(`select * from geofence`));
    expect(none.rowCount).toBe(0);
    expect(bad.rowCount).toBe(0);
    const code = await asRuntime('none', async (c) => {
      try {
        await c.query(`insert into geofence (branch_id, name, kind, area) values ($1,'x','work_area', ST_GeomFromText($2,4326))`, [A.branch, `POLYGON((1 1,2 1,2 2,1 2,1 1))`]);
        return '';
      } catch (err) {
        return (err as { code?: string }).code ?? '';
      }
    });
    expect(code).toBe('42501');
  });
});

describe('geofence — چسباندنِ والدِ بیگانه مسدود است', () => {
  async function tryInsert(sql: string, params: unknown[]): Promise<string> {
    return asRuntime(A.company, async (c) => {
      try {
        await c.query(sql, params);
        return '';
      } catch (err) {
        return (err as { code?: string }).code ?? '';
      }
    });
  }

  it('branchِ اجباری نمی‌تواند متعلقِ به B باشد (42501)', async () => {
    const code = await tryInsert(
      `insert into geofence (branch_id, name, kind, area) values ($1,'x','work_area', ST_GeomFromText($2,4326))`,
      [B.branch, `POLYGON((1 1,2 1,2 2,1 2,1 1))`],
    );
    expect(code).toBe('42501');
  });

  it('customerِ قابلِ NULL نمی‌تواند متعلقِ به B باشد (null-or-exists ⇒ 42501)', async () => {
    const code = await tryInsert(
      `insert into geofence (branch_id, name, kind, area, customer_id) values ($1,'x','customer', ST_GeomFromText($2,4326),$3)`,
      [A.branch, `POLYGON((1 1,2 1,2 2,1 2,1 1))`, B.customer],
    );
    expect(code).toBe('42501');
  });

  it('warehouseِ قابلِ NULL نمی‌تواند متعلقِ به B باشد (null-or-exists ⇒ 42501)', async () => {
    const code = await tryInsert(
      `insert into geofence (branch_id, name, kind, area, warehouse_id) values ($1,'x','warehouse', ST_GeomFromText($2,4326),$3)`,
      [A.branch, `POLYGON((1 1,2 1,2 2,1 2,1 1))`, B.warehouse],
    );
    expect(code).toBe('42501');
  });

  it('اتصالِ ترکیبیِ branchِ خودی + customer/warehouseِ خودی مجاز است', async () => {
    const res = await asRuntime(A.company, (c) =>
      c.query(
        `insert into geofence (branch_id, name, kind, area, customer_id, warehouse_id) values ($1,$2,'customer', ST_GeomFromText($3,4326),$4,$5) returning id`,
        [A.branch, `ترکیبی ${uid()}`, `POLYGON((3 3,4 3,4 4,3 4,3 3))`, A.customer, A.warehouse],
      ),
    );
    expect(res.rowCount).toBe(1);
    await ownerPool.query(`delete from geofence where id=$1`, [res.rows[0].id]);
  });
});

describe('geofence — مسیرهایِ هندسی (area)', () => {
  it('A هندسهٔ حوزهٔ خودش را می‌خواند؛ هندسهٔ B نامرئی است', async () => {
    const rows = await asRuntime(A.company, (c) =>
      c.query(`select id, ST_AsText(area) as wkt from geofence where id = $1`, [A.geofenceFull]),
    );
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].wkt).toContain('POLYGON');
    const cross = await asRuntime(A.company, (c) =>
      c.query(`select ST_AsText(area) from geofence where id = $1`, [B.geofenceFull]),
    );
    expect(cross.rowCount).toBe(0);
  });

  it('هندسهٔ B از هیچ مسیرِ Join (branch/customer) قابل‌دیدن نیست', async () => {
    const rows = await asRuntime(A.company, (c) =>
      c.query(
        `select g.id from geofence g join branch b on b.id = g.branch_id join customer c on c.id = g.customer_id`,
      ),
    );
    expect(rows.rows.every((r) => r.id !== B.geofenceFull)).toBe(true);
  });
});
