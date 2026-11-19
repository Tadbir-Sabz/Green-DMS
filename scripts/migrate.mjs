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
 *   node scripts/migrate.mjs up [--to NNNN]     اجرای مهاجرت‌های در انتظار (تا شماره‌ی NNNN اگر داده شود)
 *   node scripts/migrate.mjs down [n]            بازگشت n مهاجرت آخر (پیش‌فرض ۱)
 *   node scripts/migrate.mjs reset --yes         حذف کامل و اجرای از صفر (تخریبی)
 *
 * هر فایل در تراکنش واحد اجرا می‌شود (معادل psql -1 با ON_ERROR_STOP).
 *
 * S8-07:
 *   - مهاجرتِ owner-دار (ارجاع به dms_owner) فقط وقتی اجرا/بازگردانده می‌شود که قفل «dms-db-window»
 *     توسط نشستِ «دیگری» نگه داشته شده باشد (حتی برای سوپرکاربر). قفلِ خودِ این فرایند هرگز حساب نمی‌شود.
 *   - API (DMS_MIGRATE_CALLER=api-auto) هرگز مهاجرتِ owner-دار را اعمال نمی‌کند.
 *   - بازگشتِ مهاجرت‌های دارای rollbackRefusal (مثلاً 0072) پیش از هر SQL رد می‌شود.
 *   - checksum ردیف‌های جدید «v2:<up>:<down>» است؛ ردیف‌های قدیمی (فقط up) بازتفسیر نمی‌شوند.
 */

import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';
import {
  callerRefusal,
  checksumRecord,
  requiresOwnerWindow,
  rollbackRefusal,
  verifyChecksum,
  windowDecision,
} from './lib/migration-policy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('خطا: DATABASE_URL در .env تنظیم نیست.');
  process.exit(1);
}

// MIGRATIONS_DIR فقط برای آزمون‌های شکست (مثلاً یک مهاجرتِ عمداً خراب) تنظیم می‌شود؛ پیش‌فرض همان migrations/ است.
const MIG_DIR = process.env.MIGRATIONS_DIR ? path.resolve(process.env.MIGRATIONS_DIR) : path.join(ROOT, 'migrations');
const FILE_RE = /^(\d{4})_([a-z0-9_]+)\.(up|down)\.sql$/i;

// application_name ثابت است: آزمون‌ها و اپراتور می‌توانند نشستِ مهاجرت را در pg_stat_activity پیدا کنند (S8-06 / D3)
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1, application_name: 'dms-migrate' });

// S8-06: اگر این فرایند فرزندِ scripts/db-window.mjs است، قطعیِ والد (حتی SIGKILL) به‌صورت disconnect می‌رسد.
// در آن صورت فرزند خارج می‌شود تا تراکنش برگردد و هیچ مهاجرتی بدونِ پنجره ادامه نیابد.
if (typeof process.send === 'function') {
  process.on('disconnect', () => {
    console.error('dms-migrate: والدِ پنجره قطع شد؛ مهاجرت متوقف و تراکنشِ جاری برگشت می‌خورد.');
    process.exit(130);
  });
}

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
      const v = verifyChecksum(rec.checksum, await hashesOf(mig));
      items.push({
        version: mig.version,
        name: mig.name,
        state: v.ok ? 'applied' : 'modified',
        detail: v.state,
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
    const v = verifyChecksum(rec.checksum, await hashesOf(mig));
    const note = v.ok ? 'اعمال‌شده' : `اعمال‌شده  ⚠ ${v.problem}`;
    console.log(`  ${mig.version}  ${mig.name.padEnd(30)}  ${note}`);
  }
  console.log(
    `\n${migrations.length - pendingCount} اعمال‌شده، ${pendingCount} در انتظار.`,
  );
}

/** هش‌های فعلیِ فایل‌های یک مهاجرت (down ممکن است نباشد؛ آنگاه null). */
async function hashesOf(mig) {
  return {
    upHash: await sha256(mig.up),
    downHash: mig.down ? await sha256(mig.down) : null,
  };
}

/**
 * S8-05 / S8-07 (R9): مهاجرتِ اعمال‌شده نباید تغییر کرده باشد. ردیف‌های v2 هم up و هم down را
 * می‌سنجند؛ ردیف‌های قدیمی (فقط up) فقط up را می‌سنجند و هرگز بازتفسیر نمی‌شوند.
 * هر ناهمخوانی یا فایلِ گم‌شده ⇒ توقف بدون هیچ تغییری در پایگاه‌داده.
 */
async function assertNoTamper(migrations, applied) {
  const byVersion = new Map(migrations.map((m) => [m.version, m]));
  for (const rec of applied) {
    const mig = byVersion.get(rec.version);
    if (!mig) {
      throw new Error(`مهاجرت اعمال‌شدهٔ ${rec.version} در مخزن یافت نشد؛ اجرا متوقف شد.`);
    }
    const v = verifyChecksum(rec.checksum, await hashesOf(mig));
    if (!v.ok) {
      throw new Error(
        `مهاجرت اعمال‌شدهٔ ${rec.version}: ${v.problem} [${v.state}]؛ مهاجرتِ اعمال‌شده را نباید ویرایش کرد.`,
      );
    }
  }
}

/** قفل نشستِ سراسری: دو اجرای همزمان مهاجرت نمی‌توانند هم‌زمان بنویسند. */
async function withMigrationLock(fn) {
  const c = new pg.Client({ connectionString: DATABASE_URL, application_name: 'dms-migrate' });
  await c.connect();
  try {
    const { rows } = await c.query("select pg_try_advisory_lock(hashtext('dms-migrate')) as ok");
    if (!rows[0].ok) throw new Error('مهاجرتِ دیگری در حال اجراست (قفل dms-migrate در دسترس نیست).');
    return await fn();
  } finally {
    await c.end().catch(() => {});
  }
}

/**
 * شمارشِ قفلِ پنجرهٔ مهاجرت از pg_locks (بدونِ گرفتنِ قفل): own = نگه‌داشته‌شده توسط همین نشست،
 * external = نگه‌داشته‌شده توسط نشستِ دیگر. خطا ⇒ پرتاب (fail-closed).
 */
async function windowLockCounts() {
  const { rows } = await pool.query(`
    with k as (select hashtext('dms-db-window')::bigint as h)
    select count(*) filter (where l.pid = pg_backend_pid())::int as own,
           count(*) filter (where l.pid <> pg_backend_pid())::int as external
      from pg_locks l, k
     where l.locktype = 'advisory' and l.granted and l.objsubid = 1
       and l.database = (select oid from pg_database where datname = current_database())
       and l.classid::bigint = ((k.h >> 32) & 4294967295)
       and l.objid::bigint = (k.h & 4294967295)`);
  if (!rows[0]) throw new Error('خواندنِ قفلِ پنجره ناموفق بود (fail-closed).');
  return { own: rows[0].own, external: rows[0].external };
}

/**
 * S8-06 / S8-07 (R2): مهاجرتِ owner-دار (up یا down) فقط در پنجرهٔ باز و با قفلِ نشستِ «دیگری»
 * مجاز است؛ برای سوپرکاربر هم همین قاعده است. سپس باید هویت بتواند به dms_owner SET کند (یا سوپرکاربر باشد).
 */
async function assertOwnerWindow(files, direction) {
  const needs = [];
  for (const { version, file } of files) {
    if (requiresOwnerWindow(await readFile(file, 'utf8'))) needs.push(version);
  }
  if (needs.length === 0) return;
  const label = `مهاجرت‌های ${needs.join('، ')} (${direction})`;
  const refusal = callerRefusal({ caller: process.env.DMS_MIGRATE_CALLER ?? 'operator', requiresOwner: true });
  if (refusal) throw new Error(`${label}: ${refusal}`);
  const lock = await windowLockCounts();
  const decision = windowDecision({ ownLocks: lock.own, externalHolders: lock.external, requiresOwner: true });
  if (decision) throw new Error(`${label}: ${decision}`);
  const { rows } = await pool.query(`
    select coalesce((select rolsuper from pg_roles where rolname = current_user), false) as su,
           case when exists (select 1 from pg_roles where rolname = 'dms_owner')
                then pg_has_role(current_user, 'dms_owner', 'SET') else false end as can_set`);
  if (rows[0]?.su || rows[0]?.can_set) return;
  throw new Error(
    `${label}: این هویت نمی‌تواند به dms_owner SET کند. اجرا فقط از مسیرِ پنجرهٔ مهاجرت مجاز است: node scripts/db-window.mjs up`,
  );
}

async function cmdUp(migrations, { to = null } = {}) {
  await withTransaction(ensureTracking);
  await assertNoTamper(migrations, await appliedMigrations(pool));
  const applied = new Set((await appliedMigrations(pool)).map((r) => r.version));
  // --to NNNN: فقط مهاجرت‌های تا همین شماره (برای مرحلهٔ bootstrap مدیریتی، مثلاً تا 0041)
  const pending = migrations.filter((m) => !applied.has(m.version) && (to === null || m.version <= to));

  if (pending.length === 0) {
    console.log('همه مهاجرت‌ها قبلاً اعمال شده‌اند.');
    return;
  }
  // S8-07 (R9): هر مهاجرتِ جدید باید down داشته باشد تا checksum v2 (up+down) ثبت شود
  for (const mig of pending) {
    if (!mig.down) throw new Error(`مهاجرت ${mig.version}: فایل down ندارد؛ اعمال نمی‌شود (checksum نسخهٔ ۲ به down نیاز دارد).`);
  }
  await assertOwnerWindow(pending.map((m) => ({ version: m.version, file: m.up })), 'up');

  for (const mig of pending) {
    const sql = await readFile(mig.up, 'utf8');
    const checksum = checksumRecord(await hashesOf(mig));
    try {
      await withTransaction(async (client) => {
        await client.query(sql);
        await client.query(
          'insert into schema_migrations (version, name, checksum) values ($1, $2, $3)',
          [mig.version, mig.name, checksum],
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
  await assertNoTamper(migrations, applied);
  const byVersion = new Map(migrations.map((m) => [m.version, m]));
  const targets = applied.slice(-count).reverse();

  if (targets.length === 0) {
    console.log('مهاجرت اعمال‌شده‌ای برای بازگشت وجود ندارد.');
    return;
  }
  // S8-07 (R1): بازگشتی که ایمن ثابت نشده، پیش از هر SQL (و برای هر هدف) رد می‌شود.
  for (const rec of targets) {
    const refusal = rollbackRefusal(rec.version);
    if (refusal) {
      console.error(`  ${rec.version}  ✗ ${refusal}`);
      process.exit(1);
    }
  }
  // S8-06: بازگشتِ مهاجرتی که به dms_owner ارجاع دارد هم فقط در پنجرهٔ باز و با قفلِ نشستِ دیگر مجاز است
  await assertOwnerWindow(
    targets.map((r) => byVersion.get(r.version)).filter((m) => m && m.down).map((m) => ({ version: m.version, file: m.down })),
    'down',
  );

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
    case 'up': {
      const toIdx = rest.indexOf('--to');
      const to = toIdx >= 0 ? String(rest[toIdx + 1] ?? '') : null;
      if (to !== null && !/^\d{4}$/.test(to)) throw new Error('--to باید شماره‌ی چهاررقمی مهاجرت باشد (مثلاً 0041)');
      await withMigrationLock(() => cmdUp(migrations, { to }));
      break;
    }
    case 'down': {
      const n = Number(rest.find((a) => /^\d+$/.test(a)) ?? 1);
      if (!Number.isInteger(n) || n < 1) throw new Error('شماره بازگشت نامعتبر است');
      await withMigrationLock(() => cmdDown(migrations, n));
      break;
    }
    case 'reset':
      if (!rest.includes('--yes')) {
        console.error('reset تخریبی است؛ برای اجرا --yes اضافه کنید.');
        process.exit(1);
      }
      // S8-05: reset هرگز در production و بدون اجازهٔ صریح اجرا نمی‌شود
      if (process.env.NODE_ENV === 'production' || process.env.DMS_ALLOW_DESTRUCTIVE_RESET !== 'yes') {
        console.error('reset در این محیط مجاز نیست (NODE_ENV=production یا DMS_ALLOW_DESTRUCTIVE_RESET=yes تنظیم نشده).');
        process.exit(1);
      }
      await withMigrationLock(() => cmdReset(migrations));
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
