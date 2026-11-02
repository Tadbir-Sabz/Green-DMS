#!/usr/bin/env node
/**
 * ابزار مهاجرت پایگاه‌داده Green-DMS
 *
 * قرارداد فایل‌ها: migrations/NNNN_name.up.sql  +  NNNN_name.down.sql
 * وضعیت اعمال:   جدول schema_migrations (نسخه، نام، هش، زمان اعمال)
 *
 * دستورها:
 *   node scripts/migrate.mjs status              نمایش اعمال‌شده/در انتظار
 *   node scripts/migrate.mjs status --json       همان وضعیت به‌صورت JSON (ماشین‌خوان)
 *   node scripts/migrate.mjs up                  اجرای همه مهاجرت‌های در انتظار
 *   node scripts/migrate.mjs down [n]            بازگشت n مهاجرت آخر (پیش‌فرض ۱)
 *   node scripts/migrate.mjs reset --yes         حذف کامل و اجرای از صفر (تخریبی)
 *
 * هر فایل در تراکنش واحد اجرا می‌شود (معادل psql -1 با ON_ERROR_STOP).
 */

import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('خطا: DATABASE_URL در .env تنظیم نیست.');
  process.exit(1);
}

const MIG_DIR = path.join(ROOT, 'migrations');
const FILE_RE = /^(\d{4})_([a-z0-9_]+)\.(up|down)\.sql$/i;

const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });

/** ---------- بارگذاری فایل‌ها ---------- */

async function loadMigrations() {
  const files = await readdir(MIG_DIR);
  const map = new Map();
  for (const file of files.sort()) {
    const m = FILE_RE.exec(file);
    if (!m) continue;
    const [, version, name, direction] = m;
    if (!map.has(version)) map.set(version, { version, name, up: null, down: null });
    map.get(version)[direction] = path.join(MIG_DIR, file);
  }
  const list = [...map.values()].sort((a, b) => a.version.localeCompare(b.version));
  for (const mig of list) {
    if (!mig.up) throw new Error(`مهاجرت ${mig.version}: فایل up یافت نشد`);
  }
  return list;
}

const sha256 = async (file) =>
  createHash('sha256').update(await readFile(file)).digest('hex');

// ---------- اجرای امن ----------

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const TRACKING_DDL = `
create table if not exists schema_migrations (
  version    text primary key,
  name       text not null,
  checksum   text not null,
  applied_at timestamptz not null default now()
)`;

// ---------- دستورها ----------

async function ensureTracking(client) {
  await client.query(TRACKING_DDL);
}

async function appliedMigrations(client) {
  const { rows } = await client.query(
    'select version, name, checksum from schema_migrations order by version',
  );
  return rows;
}

async function cmdStatus(migrations, { json = false } = {}) {
  await withTransaction(ensureTracking);
  const applied = await appliedMigrations(pool);
  const appliedMap = new Map(applied.map((r) => [r.version, r]));
  let pendingCount = 0;

  // خروجی ماشین‌خوان برای مصرفِ برنامه‌ای (مثل start خودکار در apps/api)
  if (json) {
    const items = [];
    for (const mig of migrations) {
      const rec = appliedMap.get(mig.version);
      if (!rec) {
        pendingCount += 1;
        items.push({ version: mig.version, name: mig.name, state: 'pending' });
        continue;
      }
      const sum = await sha256(mig.up);
      items.push({
        version: mig.version,
        name: mig.name,
        state: rec.checksum === sum ? 'applied' : 'modified',
      });
    }
    console.log(
      JSON.stringify({
        total: migrations.length,
        applied: migrations.length - pendingCount,
        pending: pendingCount,
        migrations: items,
      }),
    );
    return;
  }

  console.log('وضعیت مهاجرت‌ها:\n');
  for (const mig of migrations) {
    const rec = appliedMap.get(mig.version);
    if (!rec) {
      pendingCount += 1;
      console.log(`  ${mig.version}  ${mig.name.padEnd(30)}  در انتظار`);
      continue;
    }
    const sum = await sha256(mig.up);
    const note =
      rec.checksum === sum ? 'اعمال‌شده' : 'اعمال‌شده  ⚠ فایل تغییر کرده است';
    console.log(`  ${mig.version}  ${mig.name.padEnd(30)}  ${note}`);
  }
  console.log(
    `\n${migrations.length - pendingCount} اعمال‌شده، ${pendingCount} در انتظار.`,
  );
}

async function cmdUp(migrations) {
  await withTransaction(ensureTracking);
  const applied = new Set((await appliedMigrations(pool)).map((r) => r.version));
  const pending = migrations.filter((m) => !applied.has(m.version));

  if (pending.length === 0) {
    console.log('همه مهاجرت‌ها قبلاً اعمال شده‌اند.');
    return;
  }

  for (const mig of pending) {
    const sql = await readFile(mig.up, 'utf8');
    const sum = await sha256(mig.up);
    try {
      await withTransaction(async (client) => {
        await client.query(sql);
        await client.query(
          'insert into schema_migrations (version, name, checksum) values ($1, $2, $3)',
          [mig.version, mig.name, sum],
        );
      });
      console.log(`  ${mig.version}  ${mig.name}  ✓`);
    } catch (err) {
      console.error(`\n  ${mig.version}  ${mig.name}  ✗ شکست (تراکنش برگشت خورد)`);
      console.error(`  ${err.message}`);
      process.exit(1);
    }
  }
  console.log(`\n${pending.length} مهاجرت اعمال شد.`);
}

async function cmdDown(migrations, count) {
  const applied = await appliedMigrations(pool);
  const byVersion = new Map(migrations.map((m) => [m.version, m]));
  const targets = applied.slice(-count).reverse();

  if (targets.length === 0) {
    console.log('مهاجرت اعمال‌شده‌ای برای بازگشت وجود ندارد.');
    return;
  }

  for (const rec of targets) {
    const mig = byVersion.get(rec.version);
    if (!mig || !mig.down) {
      console.error(
        `  ${rec.version}  ✗ فایل down برای این مهاجرت موجود نیست؛ بازگشت متوقف شد.`,
      );
      process.exit(1);
    }
    const sql = await readFile(mig.down, 'utf8');
    try {
      await withTransaction(async (client) => {
        await client.query(sql);
        await client.query('delete from schema_migrations where version = $1', [
          rec.version,
        ]);
      });
      console.log(`  ${rec.version}  ${rec.name}  ↩ برگشت خورد`);
    } catch (err) {
      console.error(`\n  ${rec.version}  ${rec.name}  ✗ شکست (تراکنش برگشت خورد)`);
      console.error(`  ${err.message}`);
      process.exit(1);
    }
  }
}

async function cmdReset(migrations) {
  console.log('هشدار: همه شیت‌ها و داده‌های موجود حذف می‌شوند.');
  await withTransaction(async (client) => {
    // پسوندها اول باید بروند؛ وگرنه اشیای عضو پسوند مانع DROP SCHEMA می‌شوند
    await client.query('drop extension if exists postgis cascade');
    await client.query('drop extension if exists pgcrypto cascade');
    await client.query('drop extension if exists pg_trgm cascade');
    await client.query('drop extension if exists btree_gist cascade');
    await client.query('drop schema if exists public cascade');
    await client.query('create schema public');
  });
  console.log('اسکیمای پایگاه‌داده پاک شد؛ اجرای همه مهاجرت‌ها…\n');
  await cmdUp(migrations);
}

// ---------- اجرا ----------

const [cmd, ...rest] = process.argv.slice(2);

try {
  const migrations = await loadMigrations();

  switch (cmd) {
    case 'status':
      await cmdStatus(migrations, { json: rest.includes('--json') });
      break;
    case 'up':
      await cmdUp(migrations);
      break;
    case 'down': {
      const n = Number(rest.find((a) => /^\d+$/.test(a)) ?? 1);
      if (!Number.isInteger(n) || n < 1) throw new Error('شماره بازگشت نامعتبر است');
      await cmdDown(migrations, n);
      break;
    }
    case 'reset':
      if (!rest.includes('--yes')) {
        console.error('reset تخریبی است؛ برای اجرا --yes اضافه کنید.');
        process.exit(1);
      }
      await cmdReset(migrations);
      break;
    default:
      console.log(
        'روش مصرف:\n  node scripts/migrate.mjs status [--json]\n  node scripts/migrate.mjs up\n  node scripts/migrate.mjs down [n]\n  node scripts/migrate.mjs reset --yes',
      );
      process.exit(cmd ? 1 : 0);
  }
} catch (err) {
  console.error(`خطا: ${err.message}`);
  process.exit(1);
} finally {
  await pool.end();
}
