import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';

/**
 * محافظت از پارتیشن‌های آیندهٔ دفتر موجودی (مهاجرت 0069) — روی پایگاه‌داده‌ی واقعی و موقت.
 *
 *  ۱) بازتولید شکاف: با زنجیرهٔ تا 0068، fn_ensure_partitions پارتیشن تازه می‌سازد که
 *     تریگر TRUNCATE ندارد و dms_app هنوز UPDATE/DELETE دارد (شرط اثبات آزمون).
 *  ۲) 0069 پارتیشن‌های موجودِ بی‌محافظت را ترمیم می‌کند.
 *  ۳) fn_ensure_partitions پارتیشن‌های آینده را خودکار محافظت می‌کند.
 *  ۴) TRUNCATE/UPDATE/DELETE بیرون از پنجره رد می‌شود (مالک، dms_app، و حتی پس از DETACH).
 *  ۵) پنجرهٔ نگه‌داشتِ ممیزی‌شدهٔ مالک روی پارتیشن تازه کار می‌کند.
 *  ۶) برگشت (down 0069) و اعمال مجدد (up 0069) سالم است.
 *
 * هویتِ dms_app با SET LOCAL ROLE و بررسی current_user/rolbypassrls اجرا می‌شود (نه با
 * اتصالِ LOGIN، که روی PGlite محلی هویت را نگه نمی‌دارد).
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_partition_guard_test';
const PSQL = process.env.PSQL ?? 'psql';
const MIGRATIONS = path.join(ROOT, 'migrations');

const adminUrl = new URL(process.env.DATABASE_URL ?? '');
const testUrl = new URL(adminUrl);
testUrl.pathname = `/${TEST_DB}`;

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
let owner: pg.Pool;

const upTo = (maxNumber: number): string[] =>
  readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.up.sql') && Number(f.slice(0, 4)) <= maxNumber)
    .sort();

const applyFile = (file: string) =>
  execFileSync(PSQL, [...psqlBase, '-d', TEST_DB, '-1', '-q', '-f', path.join(MIGRATIONS, file)], {
    env: psqlEnv,
    stdio: 'pipe',
  });

/** ابتدای ماه آینده‌ی n‌ام (با همان تقویم SQL پایگاه‌داده) برای نام پارتیشن. */
async function partitionNameAhead(months: number): Promise<string> {
  const { rows } = await owner.query<{ n: string }>(
    `select 'inventory_txn_' || to_char(date_trunc('month', current_date) + make_interval(months => $1), 'YYYY_MM') as n`,
    [months],
  );
  return rows[0].n;
}

async function inventoryPartitions(): Promise<string[]> {
  const { rows } = await owner.query<{ relname: string }>(
    `select c.relname from pg_inherits i join pg_class c on c.oid = i.inhrelid
      where i.inhparent = 'public.inventory_txn'::regclass order by c.relname`,
  );
  return rows.map((r) => r.relname);
}

async function triggerNames(relname: string): Promise<string[]> {
  const { rows } = await owner.query<{ tgname: string }>(
    `select t.tgname from pg_trigger t where t.tgrelid = format('public.%I', $1::text)::regclass and not t.tgisinternal`,
    [relname],
  );
  return rows.map((r) => r.tgname);
}

async function hasTrigger(relname: string, name: string): Promise<boolean> {
  return (await triggerNames(relname)).includes(name);
}

async function dmsAppPrivs(relname: string): Promise<{ u: boolean; d: boolean; t: boolean; i: boolean }> {
  const { rows } = await owner.query<{ u: boolean; d: boolean; t: boolean; i: boolean }>(
    `select has_table_privilege('dms_app', format('public.%I', $1::text), 'UPDATE') as u,
            has_table_privilege('dms_app', format('public.%I', $1::text), 'DELETE') as d,
            has_table_privilege('dms_app', format('public.%I', $1::text), 'TRUNCATE') as t,
            has_table_privilege('dms_app', format('public.%I', $1::text), 'INSERT') as i`,
    [relname],
  );
  return rows[0];
}

/** اجرای یک دستور به‌عنوان dms_app؛ هویت پیش از اجرا اثبات می‌شود. خطا را برمی‌گرداند. */
async function attemptAsRuntime(sql: string): Promise<{ code?: string; message: string } | null> {
  const c = await owner.connect();
  try {
    await c.query('begin');
    await c.query('set local role dms_app');
    const who = await c.query<{ u: string; bypass: boolean }>(
      `select current_user as u, (select rolbypassrls from pg_roles where rolname = current_user) as bypass`,
    );
    if (who.rows[0].u !== 'dms_app' || who.rows[0].bypass) {
      throw new Error(`هویت آزمون نادرست است: ${who.rows[0].u}`);
    }
    try {
      await c.query(sql);
      return null;
    } catch (e) {
      const err = e as { code?: string; message: string };
      return { code: err.code, message: err.message };
    }
  } finally {
    await c.query('rollback').catch(() => undefined);
    c.release();
  }
}

beforeAll(async () => {
  adminPool = new pg.Pool({ connectionString: adminUrl.toString(), max: 1 });
  await adminPool.query(
    'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
    [TEST_DB],
  );
  await adminPool.query(`drop database if exists "${TEST_DB}"`);
  await adminPool.query(`create database "${TEST_DB}"`);
  owner = new pg.Pool({ connectionString: testUrl.toString(), max: 2 });
}, 180_000);

afterAll(async () => {
  await owner?.end();
  if (adminPool) {
    await adminPool.query(
      'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
      [TEST_DB],
    );
    await adminPool.query(`drop database if exists "${TEST_DB}"`);
    await adminPool.end();
  }
}, 180_000);

describe('P1: بازتولید شکاف با زنجیرهٔ تا 0068', () => {
  it('پارتیشن تازهٔ fn_ensure_partitions قبل از 0069 بی‌محافظت است (شرط اثبات)', async () => {
    for (const f of upTo(68)) applyFile(f);
    expect(await dmsAppPrivs('inventory_txn')).toMatchObject({ u: false, d: false, t: false });

    const before = new Set(await inventoryPartitions());
    await owner.query(`select fn_ensure_partitions(26)`);
    const fresh = (await inventoryPartitions()).filter((p) => !before.has(p));
    expect(fresh.length).toBeGreaterThan(0);

    for (const p of fresh) {
      expect(await hasTrigger(p, 'trg_inventory_txn_no_truncate')).toBe(false);
      expect((await dmsAppPrivs(p)).u).toBe(true); // گرانتِ 0064 به dms_app
    }
  });
});

describe('P2: ترمیم پارتیشن‌های بی‌محافظت توسط 0069', () => {
  it('پس از اعمال 0069 همهٔ پارتیشن‌های دفتر محافظت و گرانت‌زدایی شده‌اند', async () => {
    applyFile('0069_inventory_txn_partition_guard.up.sql');

    const parts = await inventoryPartitions();
    expect(parts.length).toBeGreaterThan(20);
    for (const p of parts) {
      expect(await hasTrigger(p, 'trg_inventory_txn_append_only')).toBe(true);
      expect(await hasTrigger(p, 'trg_inventory_txn_no_truncate')).toBe(true);
      expect(await dmsAppPrivs(p)).toMatchObject({ u: false, d: false, t: false, i: true });
    }
  });

  it('TRUNCATE مالک روی پارتیشنِ ترمیم‌شده بیرون از پنجره رد می‌شود', async () => {
    const p = (await inventoryPartitions())[0];
    await expect(owner.query(`truncate public.${p}`)).rejects.toThrow(/inventory_txn/);
  });
});

describe('P3: پارتیشن‌های آینده خودکار محافظت می‌شوند', () => {
  let fresh: string[] = [];

  beforeAll(async () => {
    // ماه‌های +۲۷ تا +۴۰ در P1 ساخته نشده‌اند؛ پس این پارتیشن‌ها واقعاً «تازهٔ پس از 0069» هستند.
    const before = new Set(await inventoryPartitions());
    await owner.query(`select fn_ensure_partitions(40)`);
    fresh = (await inventoryPartitions()).filter((p) => !before.has(p));
  });

  it('پارتیشن‌های تازهٔ fn_ensure_partitions هر دو تریگر را دارند و dms_app فاقد U/D/T است', async () => {
    expect(fresh.length).toBeGreaterThan(0);
    for (const p of fresh) {
      expect(await hasTrigger(p, 'trg_inventory_txn_append_only')).toBe(true);
      expect(await hasTrigger(p, 'trg_inventory_txn_no_truncate')).toBe(true);
      expect(await dmsAppPrivs(p)).toMatchObject({ u: false, d: false, t: false, i: true });
    }
  });

  it('TRUNCATE مالک روی پارتیشن تازه بیرون از پنجره رد می‌شود', async () => {
    await expect(owner.query(`truncate public.${fresh[0]}`)).rejects.toThrow(/inventory_txn/);
  });

  it('dms_app نمی‌تواند پارتیشن تازه را TRUNCATE یا UPDATE کند (privilege)', async () => {
    const t = await attemptAsRuntime(`truncate public.${fresh[0]}`);
    expect(t?.code).toBe('42501');
    expect(t?.message).toMatch(/permission denied/);
    const u = await attemptAsRuntime(`update public.${fresh[0]} set qty = qty`);
    expect(u?.code).toBe('42501');
    expect(u?.message).toMatch(/permission denied/);
  });

  it('پنجرهٔ نگه‌داشتِ ممیزی‌شدهٔ مالک روی پارتیشن تازه TRUNCATE را اجازه می‌دهد و ممیزی می‌نویسد', async () => {
    const p = fresh[1];
    const c = await owner.connect();
    try {
      await c.query('begin');
      await c.query(`select fn_inventory_txn_maintenance_begin('تست پنجرهٔ نگه‌داشت پارتیشن', null)`);
      await c.query(`truncate public.${p}`);
      await c.query('commit');
    } finally {
      c.release();
    }
    const { rows } = await owner.query<{ n: string }>(
      `select count(*)::text as n from public.audit_log where action = 'ledger_maintenance_begin' and after_data->>'reason' = 'تست پنجرهٔ نگه‌داشت پارتیشن'`,
    );
    expect(rows[0].n).toBe('1');
  });

  it('fn_ensure_partitions تکراری خطا نمی‌دهد و تریگرها را تکراری نمی‌کند', async () => {
    await owner.query(`select fn_ensure_partitions(40)`);
    const p = fresh[3];
    const { rows } = await owner.query<{ n: string }>(
      `select count(*)::text as n from pg_trigger
        where tgrelid = format('public.%I', $1::text)::regclass and tgname = 'trg_inventory_txn_no_truncate'`,
      [p],
    );
    expect(rows[0].n).toBe('1');
  });

  it('پارتیشن ماه +۳۰ (ساخته‌شده پس از 0069) وجود دارد و محافظت شده است', async () => {
    const name = await partitionNameAhead(30);
    expect(await inventoryPartitions()).toContain(name);
    expect(await hasTrigger(name, 'trg_inventory_txn_no_truncate')).toBe(true);
  });

  it('DETACH و سپس TRUNCATE بیرون از پنجره هم رد می‌شود (تریگر روی خودِ پارتیشن می‌ماند)', async () => {
    const p = fresh[2];
    await owner.query(`alter table public.inventory_txn detach partition public.${p}`);
    await expect(owner.query(`truncate public.${p}`)).rejects.toThrow(/inventory_txn/);
  });
});

describe('P4: برگشت و اعمال مجدد 0069', () => {
  it('down 0069 تابع محافظت را برمی‌دارد و اعمال مجدد دوباره همه‌چیز را محافظت می‌کند', async () => {
    applyFile('0069_inventory_txn_partition_guard.down.sql');
    const helper = await owner.query<{ r: string | null }>(
      `select to_regprocedure('public.fn_inventory_txn_protect_partition(regclass)')::text as r`,
    );
    expect(helper.rows[0].r).toBeNull();
    const body = await owner.query<{ src: string }>(
      `select prosrc as src from pg_proc where proname = 'fn_ensure_partitions'`,
    );
    expect(body.rows[0].src).not.toMatch(/fn_inventory_txn_protect_partition/);

    applyFile('0069_inventory_txn_partition_guard.up.sql');
    const helper2 = await owner.query<{ r: string | null }>(
      `select to_regprocedure('public.fn_inventory_txn_protect_partition(regclass)')::text as r`,
    );
    expect(helper2.rows[0].r).not.toBeNull();
    for (const p of await inventoryPartitions()) {
      expect(await hasTrigger(p, 'trg_inventory_txn_no_truncate')).toBe(true);
    }
  });
});
