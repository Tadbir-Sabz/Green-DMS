#!/usr/bin/env node
/**
 * TASK-C13-EXECUTION-ENABLEMENT-01 — مدیری نقصِ دورریختنیِ PostgreSQL برای C13 (disposable).
 *
 * دستورات:
 *   node scripts/c13-disposable-pg.mjs provision [--work-dir DIR] [--port N] [--db NAME]
 *   node scripts/c13-disposable-pg.mjs teardown  --work-dir DIR
 *   node scripts/c13-disposable-pg.mjs selftest  [--port N]
 *
 * ضمانت‌ها:
 *   - هیچ نمونهٔ فعال/اشتراکی را متوقف/پیکربندی نمی‌کند؛ یک initdb کاملاً جدید می‌سازد.
 *   - قابلِ حذف فقط اگر نشانگرِ خودمان (.c13-disposable-marker) وجود داشته باشد.
 *   - ساختِ نقشِ c13_readonly با default_transaction_read_only=on + statement_timeout (نیاز به superuser داخلی).
 *   - اعمالِ فکسچر از apps/api/test/fixtures/c13-disposable-schema.sql (دادهٔ ۱۰۰٪ ساختگی).
 *   - هیچ دادهٔ واقعی خوانده/کپی نمی‌شود.
 *   - env.json داخلِ work-dir شاملِ DSNهاست؛ هرگز commit/لاگِ بیرونی نشود.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_SQL = path.join(ROOT, 'apps/api/test/fixtures/c13-disposable-schema.sql');
const MARKER = '.c13-disposable-marker';

const args = process.argv.slice(2);
const cmd = args[0];
const argVal = (name, def = undefined) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : def;
};

const log = (msg) => process.stdout.write(`[c13-disposable] ${msg}\n`);
const fail = (msg, code = 1) => { process.stderr.write(`[c13-disposable] FAIL: ${msg}\n`); process.exit(code); };

/** مسیرِ ابزارها: PATH ← C13_PG_BIN ← pgserver (پایتون) */
async function pgBinDir() {
  const fromEnv = process.env.C13_PG_BIN;
  if (fromEnv && existsSync(path.join(fromEnv, 'initdb'))) return fromEnv;
  try {
    execFileSync('initdb', ['--version'], { stdio: 'pipe' });
    return ''; // از PATH
  } catch { /* ادامه */ }
  try {
    const out = execFileSync('python3', ['-c',
      'import pgserver, os; print(os.path.join(os.path.dirname(pgserver.__file__), "pginstall", "bin"))'],
      { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
    if (out && existsSync(path.join(out, 'initdb'))) return out;
  } catch { /* ادامه */ }
  fail('ابزارِ PostgreSQL یافت نشد (نه PATH، نه C13_PG_BIN، نه pgserver). نصب: pip install pgserver یا نصبِ postgresql-client/server.');
}

const bin = async (name) => path.join(await pgBinDir(), name);

function run(file, argv, opts = {}) {
  return execFileSync(file, argv, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

function assertDisposableDir(dir, { mustExist }) {
  const abs = path.resolve(dir);
  if (mustExist) {
    if (!existsSync(path.join(abs, MARKER))) {
      fail(`«${abs}» نشانگرِ disposable ندارد — حذف/بازنویسی ممنوع.`);
    }
  } else if (existsSync(abs) && readdirSync(abs).length > 0) {
    fail(`«${abs}» غیرخالی است و نشانگر ندارد — برای ایمنی متوقف شدم. یک مسیرِ خالی بدهید.`);
  }
  return abs;
}

async function provision() {
  const dirArg = argVal('work-dir', path.join('/tmp', `c13-disposable-${process.pid}`));
  const dir = assertDisposableDir(dirArg, { mustExist: false });
  const portArg = argVal('port');
  const port = portArg ? Number(portArg) : await freePort();
  const dbName = argVal('db', 'c13_disposable');
  if (!Number.isInteger(port) || port <= 0 || port >= 65536) fail('پورتِ نامعتبر');

  const binDir = await pgBinDir();
  const B = (n) => path.join(binDir, n);
  const datadir = path.join(dir, 'data');
  mkdirSync(datadir, { recursive: true });
  writeFileSync(path.join(dir, MARKER), `marker ${randomUUID()} created ${new Date().toISOString()}\n`);

  log('initdb…');
  run(B('initdb'), ['-D', datadir, '-U', 'postgres', '--auth=trust', '-E', 'UTF8', '--locale=C', '--no-sync']);

  const logFile = path.join(dir, 'postmaster.log');
  log(`postgres روی 127.0.0.1:${port}…`);
  const pgCtl = B('pg_ctl');
  run(pgCtl, ['-D', datadir, '-l', logFile, '-o', `-p ${port} -k ${dir} -c listen_addresses=127.0.0.1`, '-w', '-t', '60', 'start']);

  // صبر تا آماده شود
  const psql = B('psql');
  for (let i = 0; i < 60; i += 1) {
    try { run(psql, ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-c', 'select 1'], { stdio: 'pipe' }); break; }
    catch { if (i === 59) fail('postgres آماده نشد (postmaster.log را ببینید)'); else await new Promise((r) => setTimeout(r, 500)); }
  }

  log('ساختِ نقش‌ها و پایگاه…');
  const roleSql = [
    `create role c13_readonly login`,
    `alter role c13_readonly set default_transaction_read_only = on`,
    `alter role c13_readonly set statement_timeout = '5s'`,
    `create role c13_writer login`,
  ].map((s) => `${s};`).join('\n');
  run(psql, ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', roleSql]);
  // CREATE DATABASE تراکنش‌پذیر نیست — جدا اجرا می‌شود
  run(psql, ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', `create database ${dbName}`]);

  log('اعمالِ فکسچرِ مصنوعی…');
  run(psql, ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', dbName, '-v', 'ON_ERROR_STOP=1', '-f', FIXTURE_SQL]);

  // فقط‌خواندنی واقعی: فقط SELECT روی همهٔ جدول‌ها (هیچ نو‌نویسیِ بعدی هم نیست؛ این disposable است)
  log('اعطای SELECT به c13_readonly…');
  run(psql, ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', dbName, '-v', 'ON_ERROR_STOP=1', '-c',
    'grant select on all tables in schema public to c13_readonly']);

  const env = {
    workDir: dir,
    port,
    adminDsn: `postgres://postgres@127.0.0.1:${port}/${dbName}`,
    readonlyDsn: `postgres://c13_readonly@127.0.0.1:${port}/${dbName}`,
    writerDsn: `postgres://c13_writer@127.0.0.1:${port}/${dbName}`,
    db: dbName,
    fixtureSha256: createHash('sha256').update(readFileSync(FIXTURE_SQL)).digest('hex'),
  };
  writeFileSync(path.join(dir, 'env.json'), JSON.stringify(env, null, 2) + '\n');
  log(`آماده. env.json در ${dir} (هرگز commit نشود).`);
  process.stdout.write(`C13_DISPOSABLE_READY ${JSON.stringify({ workDir: dir, port, db: dbName })}\n`);
}

async function teardown() {
  const dirArg = argVal('work-dir');
  if (!dirArg) fail('--work-dir لازم است');
  const dir = assertDisposableDir(dirArg, { mustExist: true });
  const binDir = await pgBinDir();
  const datadir = path.join(dir, 'data');
  try {
    run(path.join(binDir, 'pg_ctl'), ['-D', datadir, '-m', 'fast', '-w', '-t', '60', 'stop']);
    log('postgres متوقف شد.');
  } catch {
    log('هشدار: توقف با خطا برخورد کرد؛ تلاش برای حذف ادامه می‌یابد.');
  }
  rmSync(dir, { recursive: true, force: true });
  log(`حذف شد: ${dir}`);
}

async function selftest() {
  const dir = path.join('/tmp', `c13-disposable-selftest-${process.pid}`);
  process.argv = [process.argv[0], process.argv[1], 'provision', '--work-dir', dir, ...(argVal('port') ? ['--port', argVal('port')] : [])];
  await provision();
  // اجرای نمونه‌ای با CLIِ آداپتور (اگر موجود باشد) انجام می‌شود توسطِ فراخوان؛ اینجا فقط نسبتِ سلامت را می‌سنجیم
  log(`selftest: محیط بالا آمد در ${dir} — برای پایین‌آوردن: node scripts/c13-disposable-pg.mjs teardown --work-dir ${dir}`);
}

const main = { provision, teardown, selftest }[cmd];
if (!main) fail('دستور ناشناخته. دستورات: provision | teardown | selftest');
main().catch((e) => fail(e?.message ?? String(e), 1));
