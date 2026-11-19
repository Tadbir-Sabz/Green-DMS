#!/usr/bin/env node
/**
 * ابزار عملیاتی «پنجرهٔ مهاجرت» و bootstrapِ یک‌باره (S8 / task -04)
 *
 * هدف: dms_migrator فقط در یک پنجرهٔ کنترل‌شده عضوِ dms_owner (با SET) می‌شود و
 * بلافاصله پس از مهاجرت، عضویت برداشته و راستی‌آزمایی می‌شود. هیچ هویتِ زمانِ اجرا
 * (dms_app) و هیچ هویتِ نگه‌داری (dms_maintainer) هرگز این پنجره را نمی‌بیند.
 *
 * زیرفرمان‌ها:
 *   bootstrap                  (ADMIN، یک‌باره) نقش‌های LOGIN، PostGIS و 0001..0041 (شامل سخت‌سازیِ نقش‌ها)
 *                              سپس انتقالِ مالکیتِ اشیای public از مدیرِ bootstrap به dms_migrator.
 *   up [--to NNNN]             پنجرهٔ مهاجرت: preflight ⇒ backup-gate ⇒ GRANT ⇒ migrate ⇒ REVOKE (همیشه) ⇒ verify
 *   backup --out FILE          pg_dump (custom) با ADMIN + sha256 در FILE.sha256
 *   rollback [n]               برگشتِ اضطراری با ADMIN (فقط سوپرکاربر؛ backup-gate و دلیل الزامی)
 *   grant | revoke             باز/بستنِ دستیِ پنجره توسط اپراتورِ مجاز (ثبت‌شده)
 *   recover                    بستنِ پنجرهٔ مانده (پس از قطعی/kill) با اتصالِ تازه + راستی‌آزماییِ کامل
 *   verify                     راستی‌آزماییِ هویت‌های پیکربندی‌شده (فقط خواندنی)
 *
 * متغیرهای محیطی (هیچ رمزی در کد یا مخزن نیست):
 *   ADMIN_DATABASE_URL         سوپرکاربرِ استقرار (فقط bootstrap/پنجره/بازگشت؛ هرگز در API)
 *   DATABASE_URL               هویتِ مهاجرت (dms_migrator، LOGIN)
 *   APP_DATABASE_URL           هویتِ زمانِ اجرا (dms_app، LOGIN) — فقط برای bootstrap/verify
 *   MAINTENANCE_DATABASE_URL   هویتِ نگه‌داری (dms_maintainer، LOGIN) — فقط برای bootstrap/verify
 *   DMS_WINDOW_REASON          دلیلِ پنجره (≥ ۱۰ نویسه)؛ برای up/grant/rollback الزامی
 *   DMS_BACKUP_FILE            مسیرِ پشتیبانِ تأییدشده؛ برای up/rollback الزامی
 *   DMS_BACKUP_SHA256          (اختیاری ولی توصیه‌شده) هشِ مورد انتظارِ همان فایل
 *   DMS_BOOTSTRAP_CONFIRM      برای bootstrap باید دقیقاً "yes" باشد
 *   PG_DUMP                    مسیرِ pg_dump (پیش‌فرض: pg_dump در PATH)
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';
import { ROLE, collectIdentityProblems, currentIdentity, databaseProblems, identityOf, ledgerProblems } from './lib/db-identity.mjs';
import { createFaultInjector, faultHooksEnabled } from './lib/test-fault-hooks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const LOCK_KEY = 'dms-db-window';
const LOCK_WAIT_MS = 30_000;
const MIGRATE = path.join(ROOT, 'scripts', 'migrate.mjs');

const log = (event, data = {}) =>
  console.log(JSON.stringify({ at: new Date().toISOString(), event, ...data }));
/**
 * خطای عمومی. کدِ خروجِ مشخص‌تری که قبلاً ست شده (مثلاً 3 = پنجره بسته نشد) را بازنویسی نمی‌کند (S8-06 / D4).
 */
const fail = (msg) => {
  console.error(`خطا: ${msg}`);
  process.exitCode = process.exitCode || 1;
};

/** تجزیهٔ رشتهٔ اتصال بدون چاپِ رمز */
function parseUrl(raw, name) {
  if (!raw) throw new Error(`${name} تنظیم نشده است.`);
  const u = new URL(raw);
  if (!u.username) throw new Error(`${name} نام کاربری ندارد.`);
  return {
    raw,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password || ''),
    host: u.hostname,
    port: u.port || '5432',
    database: decodeURIComponent(u.pathname.replace(/^\//, '')),
    toString: () => `${u.protocol}//${u.username}:***@${u.host}${u.pathname}`,
  };
}

async function connect(url, name, applicationName = 'dms-db-window') {
  const client = new pg.Client({ connectionString: url, application_name: applicationName });
  try {
    await client.connect();
  } catch (err) {
    throw new Error(`اتصال به ${name} ممکن نشد (${err.code ?? err.message}).`);
  }
  return client;
}

async function assertSuperuser(client, name) {
  const { rows } = await client.query(
    'select rolsuper from pg_roles where rolname = current_user',
  );
  if (!rows[0]?.rolsuper) {
    throw new Error(`${name} باید سوپرکاربر باشد (این عملیات فقط با مدیرِ استقرار مجاز است).`);
  }
}

function requireReason() {
  const reason = (process.env.DMS_WINDOW_REASON ?? '').trim();
  if (reason.length < 10) {
    throw new Error('DMS_WINDOW_REASON باید حداقل ۱۰ نویسه باشد (دلیلِ باز کردنِ پنجره).');
  }
  return reason;
}

/**
 * backup-gate (S8-05): فایل باید موجود و غیرخالی باشد؛ اگر DMS_BACKUP_SHA256 یا فایل sidecar
 * (.sha256 که backup می‌نویسد) باشد باید با هش مطابقت کند؛ و فهرست pg_restore باید خوانا و
 * غیرخالی باشد (پشتیبانِ خراب یا متنی قبول نیست).
 */
async function backupGate() {
  const file = process.env.DMS_BACKUP_FILE;
  if (!file) throw new Error('DMS_BACKUP_FILE تنظیم نشده است (پشتیبانِ تأییدشده لازم است).');
  const abs = path.resolve(file);
  if (!existsSync(abs) || statSync(abs).size === 0) {
    throw new Error(`فایلِ پشتیبان موجود یا غیرخالی نیست: ${abs}`);
  }
  const sha = createHash('sha256').update(readFileSync(abs)).digest('hex');
  const want = (process.env.DMS_BACKUP_SHA256 ?? '').trim().toLowerCase();
  if (want && want !== sha) {
    throw new Error('هشِ پشتیبان با DMS_BACKUP_SHA256 مطابقت ندارد؛ بازیابی/مهاجرت متوقف شد.');
  }
  const sidecar = `${abs}.sha256`;
  if (existsSync(sidecar)) {
    const recorded = readFileSync(sidecar, 'utf8').trim().split(/\s+/)[0].toLowerCase();
    if (recorded !== sha) throw new Error('هشِ فایل پشتیبان با sidecar (.sha256) مطابقت ندارد.');
  }
  const pgRestore = process.env.PG_RESTORE || 'pg_restore';
  const listing = await new Promise((resolve, reject) => {
    const child = spawn(pgRestore, ['--list', abs], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.on('error', (err) => reject(new Error(`pg_restore اجرا نشد (${err.code ?? err.message}).`)));
    child.on('close', (code) => (code === 0
      ? resolve(out)
      : reject(new Error(`pg_restore --list با کد ${code} شکست خورد؛ پشتیبان قابل‌بازیابی نیست.`))));
  });
  const entries = listing.split('\n').filter((l) => l.trim() && !l.startsWith(';')).length;
  if (entries === 0) throw new Error('پشتیبان فهرستِ قابل‌بازیابیِ خالی دارد.');
  return { file: abs, sha256: sha, bytes: statSync(abs).size, tocEntries: entries };
}

/**
 * فرزندِ فعلیِ مهاجرت (برای ارسالِ سیگنال و انتظار برای خروج). هنگامِ قطعیِ والد، کانالِ IPC بسته
 * می‌شود و فرزند با رویداد disconnect خودش خارج می‌شود (تراکنش برگشت می‌خورد).
 */
let activeChild = null;

/** سیگنالِ دریافتی توسط والد (برای خروج ۱۳۰ قطعی). null یعنی سیگنالی نرسیده است. */
let interruptedBy = null;

/**
 * اجرای scripts/migrate.mjs با هویتِ داده‌شده؛ خروجی مستقیماً به ترمینال می‌رود.
 * S8-07 (R4): اگر سیگنال رسیده باشد، مهاجرت اصلاً شروع نمی‌شود (بدونِ پنجره اجرا نشود).
 * شناسهٔ فرزند ثبت می‌شود تا آزمون‌ها زنده‌بودنِ همان فرایند را با PID بسنجند.
 */
function runMigrate(databaseUrl, args, extraEnv = {}) {
  return new Promise((resolve) => {
    if (interruptedBy) return resolve(130);
    const child = spawn(process.execPath, [MIGRATE, ...args], {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: databaseUrl, DMS_MIGRATE_CALLER: 'db-window', ...extraEnv },
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    });
    activeChild = child;
    log('migrate_child_started', { pid: child.pid });
    child.on('close', (code, signal) => {
      activeChild = null;
      log('migrate_child_exited', { pid: child.pid, code, signal });
      resolve(code ?? (signal ? 130 : 1));
    });
  });
}

/** انتظار برای خروجِ فرزند؛ پس از مهلت SIGKILL. */
function stopActiveChild(sig, timeoutMs = 30_000) {
  const child = activeChild;
  if (!child) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* already gone */ } }, timeoutMs);
    child.once('close', () => { clearTimeout(timer); resolve(); });
    try { child.kill(sig); } catch { /* already gone */ }
  });
}

/**
 * قلاب‌های آزمایشی (R6). اگر DMS_TEST_FAULT تنظیم شده ولی قلاب‌ها فعال نیستند، خطا است (fail-closed):
 * آزمونِ شکست نباید بی‌صدا «سبز» شود.
 */
let faults = null;
async function faultsFor(client) {
  if (faults) return faults;
  const { rows } = await client.query('select current_user::text as u');
  const gate = faultHooksEnabled({ env: process.env, currentUser: rows[0].u });
  if (process.env.DMS_TEST_FAULT && !gate.enabled) {
    throw new Error(`DMS_TEST_FAULT تنظیم شده اما قلاب‌های آزمایشی فعال نیستند (${gate.reason}).`);
  }
  faults = createFaultInjector({ enabled: gate.enabled, spec: process.env.DMS_TEST_FAULT });
  return faults;
}

async function withAdvisoryLock(admin, fn) {
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    const { rows } = await admin.query('select pg_try_advisory_lock(hashtext($1)) as ok', [LOCK_KEY]);
    if (rows[0].ok) break;
    if (Date.now() > deadline) throw new Error('قفلِ پنجرهٔ مهاجرت در دسترس نیست (پنجرهٔ دیگری باز است).');
    await new Promise((r) => setTimeout(r, 500));
  }
  try {
    return await fn();
  } finally {
    await admin.query('select pg_advisory_unlock(hashtext($1))', [LOCK_KEY]).catch(() => {});
  }
}

/** GRANT موقت: dms_migrator می‌تواند با SET به dms_owner برود، بدون ارث‌بری. */
async function grantWindow(admin, reason) {
  const { rows: pre } = await admin.query(
    `select exists (select 1 from pg_auth_members m
                      join pg_roles a on a.oid = m.roleid
                      join pg_roles b on b.oid = m.member
                     where a.rolname = $1 and b.rolname = $2) as direct`,
    [ROLE.owner, ROLE.migrator],
  );
  if (pre[0].direct) throw new Error('پنجره از قبل باز است (dms_migrator عضوِ dms_owner است)؛ GRANT تکراری انجام نشد.');
  await admin.query(`grant ${ROLE.owner} to ${ROLE.migrator} with inherit false, set true`);
  if (faults && faults.hit('grant-check')) {
    // W6: شکستِ آزمایشی پس از GRANT؛ پنجره باز مانده و closeWindow باید REVOKE کند
    throw new Error('شکستِ آزمایشی پس از GRANT (قلابِ تست)');
  }
  const { rows } = await admin.query(
    `select pg_has_role($1, $2, 'SET') as ok`,
    [ROLE.migrator, ROLE.owner],
  );
  if (!rows[0].ok) throw new Error('GRANT انجام شد اما SET روی dms_owner دیده نمی‌شود.');
  log('window_open', { role: ROLE.migrator, member_of: ROLE.owner, inherit: false, set: true, reason });
}

/** REVOKE روی یک اتصالِ داده‌شده؛ پس از آن عضویت باید کاملاً نبوده باشد. */
async function revokeWindow(admin) {
  if (faults && faults.hit('revoke')) {
    // W5: شکستِ آزمایشیِ REVOKE؛ closeWindow تلاشِ مجدد دارد
    throw new Error('شکستِ آزمایشی REVOKE (قلابِ تست)');
  }
  await admin.query(`revoke ${ROLE.owner} from ${ROLE.migrator}`).catch((err) => {
    if (err.code !== '42704') throw err; // 42704: عضویت وجود نداشته؛ بی‌خطر
  });
  const { rows } = await admin.query(
    `select exists (select 1 from pg_auth_members m
                      join pg_roles a on a.oid = m.roleid
                      join pg_roles b on b.oid = m.member
                     where a.rolname = $1 and b.rolname = $2) as direct,
            case when exists (select 1 from pg_roles where rolname = $1)
                 then pg_has_role($2, $1, 'SET') else false end as settable`,
    [ROLE.owner, ROLE.migrator],
  );
  if (rows[0].direct || rows[0].settable) {
    throw new Error('CRITICAL: پس از REVOKE، dms_migrator هنوز عضو/قادر به SET dms_owner است.');
  }
  log('window_closed', { role: ROLE.migrator, member_of: ROLE.owner, verified: true });
}

/**
 * بستنِ پنجره با اتصالِ تازه و تلاشِ مجدد (S8-05).
 * اگر اتصالِ مدیریتیِ قبلی مرده باشد (مثلاً قطع‌شدن در میانهٔ مهاجرت) REVOKE همچنان انجام می‌شود.
 * شکستِ نهایی ⇒ خطای CRITICAL و کد خروج 3؛ پنجره نباید بی‌صدا باز بماند.
 */
async function closeWindow({ attempts = 3 } = {}) {
  let lastErr = null;
  for (let i = 1; i <= attempts; i++) {
    let admin = null;
    try {
      admin = await connect(parseUrl(process.env.ADMIN_DATABASE_URL, 'ADMIN_DATABASE_URL').raw,
        'ADMIN_DATABASE_URL', 'dms-db-window-close');
      await faultsFor(admin);
      await revokeWindow(admin);
      return;
    } catch (err) {
      lastErr = err;
      log('window_close_retry', { attempt: i, error: err.message });
    } finally {
      if (admin) await admin.end().catch(() => {});
    }
    await new Promise((r) => setTimeout(r, 1000 * i));
  }
  process.exitCode = 3;
  throw new Error(`CRITICAL: پنجرهٔ مهاجرت بسته نشد (${lastErr?.message}). بلافاصله «node scripts/db-window.mjs recover» را اجرا کنید.`);
}

/** وضعیتِ هر هویتِ پیکربندی‌شده؛ مغایرت‌ها خطا هستند. */
async function verifyAll({ windowOpen = false, requireAll = false, pendingD1Fix = false } = {}) {
  const targets = [
    [ROLE.migrator, process.env.DATABASE_URL],
    [ROLE.app, process.env.APP_DATABASE_URL],
    [ROLE.maintainer, process.env.MAINTENANCE_DATABASE_URL],
  ];
  const problems = [];
  const report = [];
  for (const [role, url] of targets) {
    if (!url) {
      report.push({ role, status: 'not-configured' });
      // S8-06: پیش‌پرواز و پس‌بررسی هرگز با یک هویتِ تنظیم‌نشده «سبز» نمی‌شوند (fail-closed)
      if (requireAll) problems.push(`${role}: URL تنظیم نشده است؛ راستی‌آزماییِ کامل ممکن نیست`);
      continue;
    }
    // S8-07 (R3): هر خطای راستی‌آزمایی یک مغایرتِ صریح است، نه «قبول»
    let c = null;
    try {
      c = await connect(url, role);
      const me = await currentIdentity(c);
      const logical = me?.name ?? '';
      const p = collectIdentityProblems(role, me, { windowOpen: windowOpen && role === ROLE.migrator });
      if (logical !== role) p.push(`اتصال با «${logical}» است، انتظار «${role}» بود`);
      const owner = await identityOf(c, ROLE.owner);
      if (!owner) p.push('dms_owner وجود ندارد');
      else if (role !== ROLE.migrator && owner.canLogin) p.push('dms_owner نباید LOGIN داشته باشد');
      if (role === ROLE.migrator) {
        const ledger = await ledgerProblems(c, { pendingD1Fix });
        p.push(...ledger.map((x) => `دفتر: ${x}`));
        const db = await databaseProblems(c);
        p.push(...db.map((x) => `پایگاه‌داده: ${x}`));
      }
      problems.push(...p);
      report.push({ role, status: p.length ? 'FAIL' : 'PASS', problems: p, ownedRelations: me?.ownedRelations, canSetOwner: me?.canSetOwner, directMemberOfOwner: me?.directMemberOfOwner });
    } catch (err) {
      const msg = `${role}: راستی‌آزمایی ناتمام (${err.message})`;
      problems.push(msg);
      report.push({ role, status: 'FAIL', problems: [msg] });
    } finally {
      if (c) await c.end().catch(() => {});
    }
  }
  return { problems, report };
}

/**
 * S8-07 (R3): آیا این پنجره مهاجرت 0072 را اعمال می‌کند؟ فقط در این حالت وضعِ D1 پیش از 0072 در
 * preflight پذیرفته می‌شود (پس‌بررسی آن را نمی‌پذیرد).
 */
function windowAppliesD1Fix(toArg) {
  const dir = process.env.MIGRATIONS_DIR ? path.resolve(process.env.MIGRATIONS_DIR) : path.join(ROOT, 'migrations');
  const has0072 = existsSync(dir) && readdirSync(dir).some((f) => /^0072_.*\.up\.sql$/.test(f));
  return has0072 && (toArg === null || toArg >= '0072');
}

/* ------------------------------------------------------------------ */
/* bootstrap                                                            */
/* ------------------------------------------------------------------ */

async function cmdBootstrap() {
  if ((process.env.DMS_BOOTSTRAP_CONFIRM ?? '') !== 'yes') {
    throw new Error('bootstrap تخریبی/یک‌باره است؛ برای اجرا DMS_BOOTSTRAP_CONFIRM=yes بگذارید.');
  }
  const adminUrl = parseUrl(process.env.ADMIN_DATABASE_URL, 'ADMIN_DATABASE_URL').raw;
  const migrator = parseUrl(process.env.DATABASE_URL, 'DATABASE_URL');
  const admin = await connect(adminUrl, 'ADMIN_DATABASE_URL');
  try {
    await assertSuperuser(admin, 'ADMIN_DATABASE_URL');
    const adminName = (await admin.query('select current_user::text as u')).rows[0].u;
    log('bootstrap_start', { admin_role: adminName, database: parseUrl(adminUrl, 'ADMIN').database });

    // (۱) نقش‌های LOGIN: ساختِ نقش با ویژگی‌های امن؛ رمز فقط برای نقشی که ساخته می‌شود ست می‌شود.
    const loginRoles = [
      [ROLE.migrator, process.env.DATABASE_URL],
      [ROLE.app, process.env.APP_DATABASE_URL],
      [ROLE.maintainer, process.env.MAINTENANCE_DATABASE_URL],
    ];
    for (const [role, url] of loginRoles) {
      if (!url) {
        if (role === ROLE.migrator) throw new Error('DATABASE_URL (هویت مهاجرت) لازم است.');
        log('bootstrap_skip_login', { role, reason: 'URL داده نشده' });
        continue;
      }
      const u = parseUrl(url, role);
      const exists = (await admin.query('select 1 from pg_roles where rolname = $1', [role])).rowCount > 0;
      if (!exists) {
        await admin.query(
          `create role ${admin.escapeIdentifier(role)} login nosuperuser nobypassrls nocreatedb nocreaterole password ${admin.escapeLiteral(u.password)}`,
        );
        log('role_created', { role, login: true });
      } else {
        const can = (await identityOf(admin, role)).canLogin;
        if (!can) {
          await admin.query(
            `alter role ${admin.escapeIdentifier(role)} login password ${admin.escapeLiteral(u.password)}`,
          );
          log('role_login_enabled', { role });
        } else {
          log('role_exists_password_unchanged', { role, note: 'رمز تغییر نمی‌کند؛ چرخشِ رمز جداگانه و آگاهانه است' });
        }
      }
    }

    // (۲) مهاجرت‌های یک‌باره تا 0041 با سوپرکاربر: PostGIS/افزونه‌ها و سخت‌سازیِ نقش‌ها.
    // S8-07 (R2): 0041 مالکانه است و فرزند بدونِ قفلِ خارجیِ dms-db-window رد می‌شود؛ پس bootstrap
    // همان قفلِ پنجره را نگه می‌دارد. بدونِ آن، bootstrap همیشه شکست می‌خورد (regression جلوگیری‌شده).
    const code = await withAdvisoryLock(admin, () => runMigrate(adminUrl, ['up', '--to', '0041']));
    if (code !== 0) throw new Error(`bootstrap مهاجرت‌های 0001..0041 را اجرا نکرد (کد ${code}).`);

    // (۳) انتقالِ مالکیتِ اشیای public که مدیرِ bootstrap ساخته به dms_migrator.
    //     افزونه‌ها (extension members) دست‌نخورده می‌مانند؛ جداول/پارتیشن‌ها قبل از توالی‌ها.
    await admin.query('begin');
    try {
      const { rows: rels } = await admin.query(
        `select c.relname, c.relkind from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relowner = (select oid from pg_roles where rolname = current_user)
            and c.relkind in ('r','p','v','m','f','S')
            and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
          order by case c.relkind when 'S' then 2 else 1 end, c.relname`,
      );
      const kindWord = { r: 'TABLE', p: 'TABLE', v: 'VIEW', m: 'MATERIALIZED VIEW', f: 'FOREIGN TABLE', S: 'SEQUENCE' };
      for (const r of rels) {
        const cur = (await admin.query(
          `select pg_get_userbyid(c.relowner) as o from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=$1`,
          [r.relname],
        )).rows[0];
        if (cur?.o !== adminName) continue; // ممکن است با انتقالِ جدولِ مالک (توالیِ هویت) قبلاً عوض شده باشد
        await admin.query(
          `alter ${kindWord[r.relkind]} public.${admin.escapeIdentifier(r.relname)} owner to ${admin.escapeIdentifier(ROLE.migrator)}`,
        );
      }
      const { rows: fns } = await admin.query(
        `select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proowner = (select oid from pg_roles where rolname = current_user)
            and not exists (select 1 from pg_depend d where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')`,
      );
      for (const f of fns) {
        await admin.query(`alter function ${f.sig} owner to ${admin.escapeIdentifier(ROLE.migrator)}`);
      }
      await admin.query('commit');
      log('ownership_transferred', { to: ROLE.migrator, relations: rels.length, functions: fns.length });
    } catch (err) {
      await admin.query('rollback').catch(() => {});
      throw err;
    }

    // (۳-ب) مالکیتِ طرحوارهٔ public به dms_migrator (یک‌باره، صریح). 0064 با COMMENT ON SCHEMA public
    //        مالکیتِ طرحواره را لازم دارد؛ در PG16 مالکِ پیش‌فرض pg_database_owner است. این تغییر
    //        فقط به هویت مهاجرت می‌دهد، نه به نقش‌های زمانِ اجرا و نه به dms_owner.
    const schemaOwner = (
      await admin.query(
        `select pg_get_userbyid(n.nspowner) as o from pg_namespace n where n.nspname = 'public'`,
      )
    ).rows[0]?.o;
    if (schemaOwner !== ROLE.migrator) {
      await admin.query(`alter schema public owner to ${admin.escapeIdentifier(ROLE.migrator)}`);
      log('schema_owner_set', { schema: 'public', from: schemaOwner, to: ROLE.migrator });
    }

    // (§۳-ب) S8-06: TEMP از PUBLIC برداشته می‌شود. دلیل: جدولِ موقتِ سایه‌زن (مثلاً به نامِ pg_inherits)
    //        در مسیرِ جست‌وجوی relation «اول» دیده می‌شود. هیچ کدِ برنامه/مهاجرت/اسکریپتِ نگه‌داری از
    //        جدولِ موقت استفاده نمی‌کند (بررسی‌شده). سوپرکاربر و مالک اثری نمی‌بینند.
    const dbName = (await admin.query('select current_database() as d')).rows[0].d;
    await admin.query(`revoke temp on database ${admin.escapeIdentifier(dbName)} from public`);
    log('temp_revoked_from_public', { database: dbName });

    // (۴) راستی‌آزمایی: مهاجرت باید مالکِ اشیا باشد؛ dms_app/dms_owner هیچ‌کدام مالک نیستند.
    const me = await identityOf(admin, ROLE.migrator);
    const probs = collectIdentityProblems(ROLE.migrator, me);
    if (probs.length) throw new Error(`پس از bootstrap: ${probs.join('؛ ')}`);
    log('bootstrap_done', { next: 'node scripts/db-window.mjs up' });
  } finally {
    await admin.end();
  }
}

/* ------------------------------------------------------------------ */
/* up (پنجرهٔ مهاجرت)                                                   */
/* ------------------------------------------------------------------ */

async function cmdUp(args) {
  const reason = requireReason();
  const backup = await backupGate();
  const adminUrl = parseUrl(process.env.ADMIN_DATABASE_URL, 'ADMIN_DATABASE_URL').raw;
  const migratorUrl = parseUrl(process.env.DATABASE_URL, 'DATABASE_URL').raw;
  const toIdx = args.indexOf('--to');
  const toArg = toIdx >= 0 ? String(args[toIdx + 1] ?? '') : null;
  const migrateArgs = ['up', ...(toIdx >= 0 ? ['--to', toArg] : [])];
  // S8-07 (R1/R10): --to بین ۰۰۷۰ و ۰۰۷۲ مجاز نیست: مهاجرت 0070 بدون 0072 تمام شود، D1 (wrapper بدون
  // search_path پین‌شده) پس از COMMIT باز می‌ماند و پس‌بررسی شکست می‌خورد. پیش از هر GRANT رد می‌شود.
  if (toArg !== null && toArg >= '0070' && toArg < '0072') {
    throw new Error(`--to ${toArg} مجاز نیست: مهاجرت باید تا ۰۰۷۲ کامل شود تا D1 بسته بماند (--to فقط با ۰۰۷۲ یا بالاتر).`);
  }

  const admin = await connect(adminUrl, 'ADMIN_DATABASE_URL', 'dms-db-window-up');
  try {
    await assertSuperuser(admin, 'ADMIN_DATABASE_URL');
    await faultsFor(admin);
    await withAdvisoryLock(admin, async () => {
      log('preflight', { backup, reason_len: reason.length });
      // پیش‌پرواز: هیچ پنجره‌ای نباید باز باشد؛ همهٔ هویت‌ها (با URLهای الزامی) و دفتر سالم باشند.
      // S8-07: وضعِ D1 پیش از 0072 فقط وقتی پذیرفته می‌شود که همین پنجره 0072 را اعمال کند.
      const pre = await verifyAll({ windowOpen: false, requireAll: true, pendingD1Fix: windowAppliesD1Fix(toArg) });
      if (pre.problems.length) {
        log('preflight_failed', { problems: pre.problems });
        throw new Error('پیش‌پرواز ناموفق؛ پنجره باز نشد (هیچ GRANT انجام نشد).');
      }

      // S8-07 (R4): سیگنال فقط ثبت و به فرزند فوروارد می‌شود؛ پس از اتمامِ فرزند و REVOKE، کدِ ۱۳۰ ست می‌شود.
      // هیچ خروجیِ زودهنگامی از handler نیست تا با مسیرِ اصلی رقابت نکند؛ دومین سیگنال هم ثبت می‌شود.
      const onSignal = (sig) => {
        if (interruptedBy) return;
        interruptedBy = sig;
        log('window_signal', { sig, child_running: activeChild !== null });
        stopActiveChild(sig);
      };
      process.on('SIGINT', onSignal);
      process.on('SIGTERM', onSignal);

      let code = 1;
      let runError = null;
      let closeError = null;
      try {
        await grantWindow(admin, reason);            // اگر GRANT نیمه‌کاره بماند، closeWindow آن را برمی‌دارد
        code = await runMigrate(migratorUrl, migrateArgs);
      } catch (err) {
        runError = err;
      } finally {
        try {
          await closeWindow();
        } catch (err) {
          closeError = err;                          // پنجره بسته نشد: این بحرانی‌ترین خطاست
        } finally {
          process.off('SIGINT', onSignal);
          process.off('SIGTERM', onSignal);
        }
      }
      if (closeError) {
        // کدِ 3 توسط closeWindow ست شده است؛ خطای مهاجرت (در صورت وجود) در لاگ می‌ماند.
        if (runError) log('run_error_before_close_failure', { error: runError.message });
        throw closeError;
      }
      if (runError) throw runError;
      if (interruptedBy) {
        // پنجره بسته است (closeWindow موفق)؛ مهاجرت ثبت نشده (فرزند یا پیش از شروع متوقف شد).
        log('window_interrupted', { sig: interruptedBy, window_closed: true });
        process.exitCode = 130;
        return;
      }

      const post = await verifyAll({ windowOpen: false, requireAll: true });
      if (post.problems.length) {
        log('postcheck_failed', { problems: post.problems });
        throw new Error('پس از بستنِ پنجره، راستی‌آزمایی ناموفق بود (drift یا دفتر ناسالم).');
      }
      if (code !== 0) throw new Error(`مهاجرت با کد ${code} شکست خورد؛ پنجره بسته شد و راستی‌آزمایی گذشت.`);
      log('window_result', { status: 'PASS', backup_sha256: backup.sha256, backup_toc_entries: backup.tocEntries });
    });
  } finally {
    await admin.end().catch(() => {});
  }
}

/* ------------------------------------------------------------------ */
/* backup / rollback / grant / revoke / verify                         */
/* ------------------------------------------------------------------ */

function cmdBackup(args) {
  const outIdx = args.indexOf('--out');
  const out = outIdx >= 0 ? args[outIdx + 1] : null;
  if (!out) throw new Error('روش مصرف: backup --out <مسیرِ فایل.dump>');
  const adminUrl = parseUrl(process.env.ADMIN_DATABASE_URL, 'ADMIN_DATABASE_URL');
  const pgDump = process.env.PG_DUMP || 'pg_dump';
  return new Promise((resolve, reject) => {
    const child = spawn(
      pgDump,
      ['--format=custom', '--no-owner', '--file', path.resolve(out), '--dbname', adminUrl.raw],
      { env: process.env, stdio: 'inherit' },
    );
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`pg_dump با کد ${code} شکست خورد.`));
      const sha = createHash('sha256').update(readFileSync(path.resolve(out))).digest('hex');
      writeFileSync(`${path.resolve(out)}.sha256`, `${sha}  ${path.basename(out)}\n`);
      log('backup_written', { file: path.resolve(out), sha256: sha, bytes: statSync(path.resolve(out)).size });
      resolve();
    });
  });
}

async function cmdRollback(args) {
  const reason = requireReason();
  const backup = await backupGate();
  const steps = String(args.find((a) => /^\d+$/.test(a)) ?? '1');
  const adminUrl = parseUrl(process.env.ADMIN_DATABASE_URL, 'ADMIN_DATABASE_URL').raw;
  const admin = await connect(adminUrl, 'ADMIN_DATABASE_URL', 'dms-db-window-rollback');
  try {
    await assertSuperuser(admin, 'ADMIN_DATABASE_URL');
    await faultsFor(admin);
    // S8-06: برگشت هم زیرِ قفلِ پنجره اجرا می‌شود تا با up/grant هم‌زمان نشود
    await withAdvisoryLock(admin, async () => {
      const pre = await verifyAll({ windowOpen: false, requireAll: true });
      if (pre.problems.length) {
        log('rollback_preflight_failed', { problems: pre.problems });
        throw new Error('پیش‌پرواز برگشت ناموفق؛ ابتدا وضعیت هویت‌ها را اصلاح کنید.');
      }
      log('rollback_start', { steps, reason_len: reason.length, backup_sha256: backup.sha256 });
      const onSignal = (sig) => {
        if (interruptedBy) return;
        interruptedBy = sig;
        log('rollback_signal', { sig });
        stopActiveChild(sig);
      };
      process.on('SIGINT', onSignal);
      process.on('SIGTERM', onSignal);
      let code;
      try {
        code = await runMigrate(adminUrl, ['down', steps]);
      } finally {
        process.off('SIGINT', onSignal);
        process.off('SIGTERM', onSignal);
      }
      if (interruptedBy) {
        log('rollback_interrupted', { sig: interruptedBy });
        process.exitCode = 130;
        return;
      }
      if (code !== 0) throw new Error(`برگشت با کد ${code} شکست خورد (تراکنش برگشت خورد).`);
      const post = await verifyAll({ windowOpen: false, requireAll: true });
      if (post.problems.length) {
        log('rollback_postcheck_failed', { problems: post.problems });
        throw new Error('پس از برگشت، راستی‌آزمایی ناموفق بود؛ بازیابی دستی لازم است.');
      }
      log('rollback_done', { steps, verified: true });
    });
  } finally {
    await admin.end().catch(() => {});
  }
}

async function cmdGrantOrRevoke(kind) {
  const reason = kind === 'grant' ? requireReason() : 'manual revoke (operator)';
  const adminUrl = parseUrl(process.env.ADMIN_DATABASE_URL, 'ADMIN_DATABASE_URL').raw;
  const admin = await connect(adminUrl, 'ADMIN_DATABASE_URL', 'dms-db-window-manual');
  try {
    await assertSuperuser(admin, 'ADMIN_DATABASE_URL');
    if (kind === 'grant') await grantWindow(admin, reason);
    else await closeWindow();
  } finally {
    await admin.end().catch(() => {});
  }
}

/** بازیابیِ پس از قطعی: REVOKE با اتصالِ تازه، سپس راستی‌آزماییِ کامل (S8-05). */
async function cmdRecover() {
  // S8-06: بازیابی هم زیرِ قفلِ پنجره است تا با یک up/rollback زنده هم‌زمان نشود.
  // قفل با قطع‌شدنِ نشستِ والدِ مرده آزاد می‌شود؛ اگر مهاجرتی هنوز زنده باشد، recover منتظر می‌ماند و رد می‌شود.
  // ترتیب: بستنِ پنجره (REVOKE) ⇒ راستی‌آزمایی با requireAll (هر هویتِ الزامی باید وجود داشته باشد).
  const adminUrl = parseUrl(process.env.ADMIN_DATABASE_URL, 'ADMIN_DATABASE_URL').raw;
  const admin = await connect(adminUrl, 'ADMIN_DATABASE_URL', 'dms-db-window-recover');
  try {
    await assertSuperuser(admin, 'ADMIN_DATABASE_URL');
    await withAdvisoryLock(admin, async () => {
      await closeWindow();
      const post = await verifyAll({ windowOpen: false, requireAll: true });
      console.log(JSON.stringify({ report: post.report, problems: post.problems }, null, 2));
      if (post.problems.length) {
        process.exitCode = 1;
        throw new Error('بازیابی انجام شد اما راستی‌آزمایی هنوز ناموفق است.');
      }
      log('recover_done', { verified: true });
    });
  } finally {
    await admin.end().catch(() => {});
  }
}

async function cmdVerify() {
  const { problems, report } = await verifyAll({ windowOpen: false });
  console.log(JSON.stringify({ report, problems }, null, 2));
  if (problems.length) process.exitCode = 1;
}

/* ------------------------------------------------------------------ */

const [cmd, ...args] = process.argv.slice(2);
const run = {
  bootstrap: () => cmdBootstrap(),
  up: () => cmdUp(args),
  backup: () => cmdBackup(args),
  rollback: () => cmdRollback(args),
  grant: () => cmdGrantOrRevoke('grant'),
  revoke: () => cmdGrantOrRevoke('revoke'),
  recover: () => cmdRecover(),
  verify: () => cmdVerify(),
}[cmd];

if (!run) {
  console.log(
    'روش مصرف:\n' +
      '  node scripts/db-window.mjs bootstrap   (ADMIN، DMS_BOOTSTRAP_CONFIRM=yes)\n' +
      '  node scripts/db-window.mjs up [--to NNNN]\n' +
      '  node scripts/db-window.mjs backup --out FILE.dump\n' +
      '  node scripts/db-window.mjs rollback [n]\n' +
      '  node scripts/db-window.mjs grant | revoke | recover\n' +
      '  node scripts/db-window.mjs verify',
  );
  process.exit(cmd ? 1 : 0);
}

try {
  await run();
} catch (err) {
  fail(err.message);
} finally {
  if (process.exitCode === undefined) process.exitCode = 0;
}
