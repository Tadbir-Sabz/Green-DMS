#!/usr/bin/env node
/**
 * تست چرخه مهاجرت‌ها برای CI — npm run test:migrations
 *
 * مراحل:
 *   ۱) ساخت دیتابیس موقت (پیش‌فرض: greendms_ci_test؛ با TEST_DB تغییر می‌کند)
 *   ۲) up: اجرای همه migrations/*.up.sql به ترتیب، هر کدام در تراکنش واحد
 *   ۳) ثبت مجموعه اشیا (جدول‌ها/نماها + ایندکس‌ها + تریگرها)
 *   ۴) down: اجرای همه *.down.sql برعکس
 *   ۵) راستی‌آزمایی خالی‌شدن کامل اسکیما
 *   ۶) up دوباره و مقایسه اشیا با اجرای اول — باید «دقیقاً» یکی باشند
 *   ۷) حذف دیتابیس موقت (حتی در حالت خطا، با finally)
 *
 * خروجی: غیرصفر یعنی تست شکسته — مناسب CI.
 * اتصال از DATABASE_URL (ریشه .env) گرفته می‌شود؛ فقط نام دیتابیس عوض می‌شود.
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';
import { PINNED_SEARCH_PATH } from './lib/db-identity.mjs';
import { rollbackRefusal } from './lib/migration-policy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const ADMIN_URL = process.env.DATABASE_URL;
if (!ADMIN_URL) {
  console.error('خطا: DATABASE_URL در .env تنظیم نیست.');
  process.exit(1);
}

const TEST_DB = process.env.TEST_DB ?? 'greendms_ci_test';
const adminUrl = new URL(ADMIN_URL);
const testUrl = new URL(ADMIN_URL);
testUrl.pathname = `/${TEST_DB}`;

const FILE_RE = /^(\d{4})_([a-z0-9_]+)\.(up|down)\.sql$/i;

async function loadMigrations() {
  const files = await readdir(path.join(ROOT, 'migrations'));
  const map = new Map();
  for (const file of files) {
    const m = FILE_RE.exec(file);
    if (!m) continue;
    const [, version, name, direction] = m;
    if (!map.has(version)) map.set(version, { version, name, up: null, down: null });
    map.get(version)[direction] = path.join(ROOT, 'migrations', file);
  }
  const list = [...map.values()].sort((a, b) => a.version.localeCompare(b.version));
  for (const mig of list) {
    if (!mig.up) throw new Error(`مهاجرت ${mig.version}: فایل up یافت نشد`);
    if (!mig.down) throw new Error(`مهاجرت ${mig.version}: فایل down یافت نشد`);
  }
  return list;
}

/** اجرای یک فایل در تراکنش واحد (شکست = rollback کامل) */
async function runFile(pool, file) {
  const sql = await readFile(file, 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw new Error(`${path.basename(file)}: ${err.message}`);
  } finally {
    client.release();
  }
}

/** مجموعه دقیق اشیای اسکیمای public برای مقایسه بین دو اجرا */
async function snapshotObjects(pool, { excludeExtensionOwned = false } = {}) {
  // عضوِ پسوند بودن: pg_depend با deptype='e' روی خود شیء
  const notExt = (classid, oidExpr) =>
    excludeExtensionOwned
      ? `and not exists (select 1 from pg_depend dp where dp.classid = '${classid}'::regclass and dp.objid = ${oidExpr} and dp.deptype = 'e')`
      : '';
  const { rows } = await pool.query(`
    select 'table' as kind, c.relname as name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r','p','v','m') ${notExt('pg_class', 'c.oid')}
    union all
    select 'index', c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_index i on i.indexrelid = c.oid
     where n.nspname = 'public' and c.relkind = 'i' ${notExt('pg_class', 'c.oid')}
       -- ایندکسِ جدولِ عضوِ پسوند هم عضو حساب می‌شود (مثلاً spatial_ref_sys_pkey)
       and not exists (select 1 from pg_depend dp where dp.classid = 'pg_class'::regclass and dp.objid = i.indrelid and dp.deptype = 'e')
    union all
    select 'trigger', t.tgname || '@' || pc.relname
      from pg_trigger t
      join pg_class pc on pc.oid = t.tgrelid
      join pg_namespace n on n.oid = pc.relnamespace
     where n.nspname = 'public' and not t.tgisinternal ${notExt('pg_trigger', 't.oid')}
    union all
    select 'function', p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' ${notExt('pg_proc', 'p.oid')}
    order by 1, 2`);
  return rows.map((r) => `${r.kind}:${r.name}`);
}

function diff(a, b) {
  const sb = new Set(b);
  const onlyA = a.filter((x) => !sb.has(x));
  const sa = new Set(a);
  const onlyB = b.filter((x) => !sa.has(x));
  return { onlyA, onlyB };
}

const migrations = await loadMigrations();

/**
 * S8-07 (R7): بازگشتِ مهاجرتی که سیاستِ ابزار آن را رد می‌کند (مثلاً 0072) هرگز اجرا نمی‌شود.
 * به‌جایش اثباتِ D1 بسته است: wrapperِ 0070 باید با search_path پین‌شده (pg_temp آخر) باشد.
 */
async function assertD1Closed(pool) {
  const { rows } = await pool.query(
    `select p.proconfig as cfg from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.proname = 'fn_maintain_inventory_partitions'`,
  );
  const cfg = rows[0]?.cfg ?? [];
  if (!cfg.includes(PINNED_SEARCH_PATH)) {
    throw new Error(`D1 باز است: fn_maintain_inventory_partitions پین‌شده نیست (proconfig=${JSON.stringify(cfg)})`);
  }
}

const refusedAt = migrations.find((m) => rollbackRefusal(m.version));
const sameDb = async () => {
  await adminPool.query(
    'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
    [TEST_DB],
  );
  await adminPool.query(`drop database if exists "${TEST_DB}"`);
  await adminPool.query(`create database "${TEST_DB}"`);
  if (testPool) await testPool.end();
  testPool = new pg.Pool({ connectionString: testUrl.toString(), max: 1 });
};
console.log(`تست ${migrations.length} مهاجرت روی دیتابیس موقت «${TEST_DB}»`);
if (refusedAt) {
  console.log(`  بازگشتِ ${refusedAt.version} طبق سیاست رد می‌شود؛ چرخهٔ کامل فقط تا قبل از آن اجرا می‌شود (R1/R7)\n`);
} else {
  console.log('');
}

const adminPool = new pg.Pool({ connectionString: adminUrl.toString(), max: 1 });
let testPool = null;
let failed = false;

try {
  // ---- الف) up کامل؛ عکس اول؛ بازگشتِ ردشده باید پیش از SQL رد شود و D1 بسته بماند ----
  await sameDb();
  console.log(`✓ دیتابیس «${TEST_DB}» ساخته شد`);
  const started1 = Date.now();
  for (const mig of migrations) {
    await runFile(testPool, mig.up);
    console.log(`  up    ${mig.version}  ${mig.name}`);
  }
  const snapshot1 = await snapshotObjects(testPool);
  console.log(`✓ up کامل شد (${((Date.now() - started1) / 1000).toFixed(1)}s) — ${snapshot1.length} شیء\n`);

  const downable = refusedAt ? migrations.filter((m) => m.version < refusedAt.version) : migrations;
  if (refusedAt) {
    await assertD1Closed(testPool);
    console.log(`✓ ${refusedAt.version}: بازگشت ردشده؛ پس از up کامل D1 بسته است (proconfig پین‌شده)\n`);
  }

  // ---- ب) چرخهٔ down⇒خالی⇒up روی مهاجرت‌های قابل‌بازگشت (تا پیش از اولین مورد ردشده) ----
  await sameDb();
  for (const mig of downable) await runFile(testPool, mig.up);
  for (const mig of [...downable].reverse()) {
    await runFile(testPool, mig.down);
    console.log(`  down  ${mig.version}  ${mig.name}`);
  }
  const empty = await snapshotObjects(testPool, { excludeExtensionOwned: true });
  if (empty.length) {
    throw new Error(`پس از down اشیای باقی‌مانده: ${empty.join(', ')}`);
  }
  console.log(`✓ down کامل — اسکیمای کاربر خالی شد (اشیای عضو پسوندها نادیده گرفته شد)\n`);

  // ---- پ) up همهٔ مهاجرت‌ها دوباره و مقایسه با عکس اول ----
  const started2 = Date.now();
  for (const mig of migrations) await runFile(testPool, mig.up);
  const snapshot2 = await snapshotObjects(testPool);
  console.log(`✓ up دوم هم کامل شد (${((Date.now() - started2) / 1000).toFixed(1)}s)`);

  const { onlyA, onlyB } = diff(snapshot1, snapshot2);
  if (onlyA.length || onlyB.length) {
    throw new Error(
      `اشیای دو اجرا یکسان نیستند — فقط در اول: [${onlyA.join(', ')}] | فقط در دوم: [${onlyB.join(', ')}]`,
    );
  }
  console.log(`✓ مقایسه: دو اجرا دقیقاً ${snapshot2.length} شیء یکسان دارند`);

  console.log('\n✓ تست مهاجرت موفق بود');
} catch (err) {
  failed = true;
  console.error(`\n✗ شکست تست مهاجرت: ${err.message}`);
} finally {
  if (testPool) await testPool.end();
  await adminPool.end();
  // ۷) حتی در حالت خطا دیتابیس موقت پاک می‌شود
  const cleanup = new pg.Pool({ connectionString: adminUrl.toString(), max: 1 });
  try {
    await cleanup.query(
      'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
      [TEST_DB],
    );
    await cleanup.query(`drop database if exists "${TEST_DB}"`);
    console.log(`✓ دیتابیس موقت «${TEST_DB}» حذف شد`);
  } catch {
    console.error(`! حذف دیتابیس موقت «${TEST_DB}» ناموفق بود؛ دستی حذفش کنید.`);
  } finally {
    await cleanup.end();
  }
}

process.exit(failed ? 1 : 0);
