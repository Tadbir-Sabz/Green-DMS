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
 * آزمون‌های RLS جدولِ device — TASK-23 (مجموعهٔ B؛ R-02 از TASK-22RQ).
 *
 * ماتریس: CRUD بین‌اجاره‌ای مسدود، چسباندنِ والدِ بیگانه مسدود (app_user_id)،
 * محرمانگیِ push_token (بدونِ خواندن/ویرایش/استنباطِ بین‌اجاره‌ای از مسیرِ مستقیم
 * یا Join)، همان‌اجاره‌ای مجاز دست‌نخورده، fail-closed بدونِ زمینه.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_device_rls_test';
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
  appUser: string;
  device: string;
  pushToken: string;
}

async function seedKit(q: pg.Pool, companyCode: string): Promise<Kit> {
  const u = uid();
  const company = (await q.query(`insert into company (code, legal_name) values ($1,$2) returning id`, [companyCode, `شرکت ${companyCode}`])).rows[0].id;
  const person = (await q.query(`insert into person (company_id, code, first_name, last_name) values ($1,$2,'کاربر',$3) returning id`, [company, `DP-${u}`, companyCode])).rows[0].id;
  const appUser = (await q.query(
    `insert into app_user (person_id, username, access_level) values ($1,$2,'web') returning id`,
    [person, `usr-${u}`],
  )).rows[0].id;
  const pushToken = `tok-${u}-${companyCode}`;
  const device = (await q.query(
    `insert into device (app_user_id, device_uuid, platform, app_kind, push_token) values ($1,$2,'android','sales',$3) returning id`,
    [appUser, `uuid-${u}`, pushToken],
  )).rows[0].id;
  return { company, appUser, device, pushToken };
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
  A = await seedKit(ownerPool, `DV_A_${uid()}`);
  B = await seedKit(ownerPool, `DV_B_${uid()}`);

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

describe('device — RLS فعال و اجباری', () => {
  it('enabled + forced + سیاستِ p_device_tenant برقرار است', async () => {
    const { rows } = await ownerPool.query(
      `select relrowsecurity, relforcerowsecurity,
              exists (select 1 from pg_policy where polname='p_device_tenant') as has_policy
         from pg_class where relname='device'`,
    );
    expect(rows[0].relrowsecurity).toBe(true);
    expect(rows[0].relforcerowsecurity).toBe(true);
    expect(rows[0].has_policy).toBe(true);
  });
});

describe('device — جداسازیِ CRUD بین‌اجاره‌ای', () => {
  it('A فقط دستگاهِ خودش را می‌بیند، دستگاهِ B را نه', async () => {
    const a = await asRuntime(A.company, (c) => c.query(`select id from device`));
    const b = await asRuntime(B.company, (c) => c.query(`select id from device`));
    expect(a.rows.map((r) => r.id)).toEqual([A.device]);
    expect(b.rows.map((r) => r.id)).toEqual([B.device]);
  });

  it('A نمی‌تواند دستگاهِ B را به‌روزرسانی کند (صفر ردیف، بدون اثر)', async () => {
    const res = await asRuntime(A.company, (c) =>
      c.query(`update device set platform='ios' where id = $1`, [B.device]),
    );
    expect(res.rowCount).toBe(0);
    const row = await ownerPool.query(`select platform from device where id=$1`, [B.device]);
    expect(row.rows[0].platform).toBe('android');
  });

  it('A نمی‌تواند دستگاهِ B را حذف کند', async () => {
    const res = await asRuntime(A.company, (c) => c.query(`delete from device where id = $1`, [B.device]));
    expect(res.rowCount).toBe(0);
    const row = await ownerPool.query(`select count(*)::int as n from device where id=$1`, [B.device]);
    expect(row.rows[0].n).toBe(1);
  });

  it('A نمی‌تواند دستگاهی به app_userِ B بچسباند (والدِ بیگانه ⇒ 42501)', async () => {
    const code = await asRuntime(A.company, async (c) => {
      try {
        await c.query(
          `insert into device (app_user_id, device_uuid, platform, app_kind) values ($1,$2,'android','sales')`,
          [B.appUser, `atk-${uid()}`],
        );
        return '';
      } catch (err) {
        return (err as { code?: string }).code ?? '';
      }
    });
    expect(code).toBe('42501');
  });

  it('درجِ همان‌اجاره‌ای مجاز است (والدِ خودی)', async () => {
    const res = await asRuntime(A.company, (c) =>
      c.query(
        `insert into device (app_user_id, device_uuid, platform, app_kind) values ($1,$2,'android','sales') returning id`,
        [A.appUser, `own-${uid()}`],
      ),
    );
    expect(res.rowCount).toBe(1);
    await ownerPool.query(`delete from device where id=$1`, [res.rows[0].id]);
  });

  it('بدونِ زمینه/زمینهٔ نامعتبر ⇒ fail-closed (خواندن صفر، درج 42501)', async () => {
    const none = await asRuntime('none', (c) => c.query(`select * from device`));
    const bad = await asRuntime('invalid', (c) => c.query(`select * from device`));
    expect(none.rowCount).toBe(0);
    expect(bad.rowCount).toBe(0);
    const code = await asRuntime('none', async (c) => {
      try {
        await c.query(`insert into device (app_user_id, device_uuid, platform, app_kind) values ($1,'x','android','sales')`, [A.appUser]);
        return '';
      } catch (err) {
        return (err as { code?: string }).code ?? '';
      }
    });
    expect(code).toBe('42501');
  });
});

describe('device — محرمانگیِ push_token', () => {
  it('توکنِ B از مسیرِ مستقیم برای A قابل‌خواندن نیست', async () => {
    const rows = await asRuntime(A.company, (c) => c.query(`select push_token from device`));
    expect(rows.rows.every((r) => r.push_token !== B.pushToken)).toBe(true);
  });

  it('توکنِ B از Join با app_user هم قابل‌استنباط نیست', async () => {
    const rows = await asRuntime(A.company, (c) =>
      c.query(`select d.push_token from device d join app_user u on u.id = d.app_user_id`),
    );
    expect(rows.rows.every((r) => r.push_token !== B.pushToken)).toBe(true);
    expect(JSON.stringify(rows.rows).includes(B.pushToken)).toBe(false);
  });

  it('A نمی‌تواند توکنِ B را تغییر دهد (بدون اثر روی سطرِ B)', async () => {
    const res = await asRuntime(A.company, (c) =>
      c.query(`update device set push_token='hijacked' where id=$1`, [B.device]),
    );
    expect(res.rowCount).toBe(0);
    const row = await ownerPool.query(`select push_token from device where id=$1`, [B.device]);
    expect(row.rows[0].push_token).toBe(B.pushToken);
  });

  it('استنباط از شمارش/flagها: شمارِ دستگاهِ A مستقل از B است', async () => {
    const before = await asRuntime(A.company, (c) => c.query(`select count(*)::int as n from device`));
    await ownerPool.query(
      `insert into device (app_user_id, device_uuid, platform, app_kind) values ($1,$2,'android','sales')`,
      [B.appUser, `extra-${uid()}`],
    );
    const after = await asRuntime(A.company, (c) => c.query(`select count(*)::int as n from device`));
    expect(after.rows[0].n).toBe(before.rows[0].n);
    await ownerPool.query(`delete from device where device_uuid like 'extra-%'`);
  });
});
