import 'reflect-metadata';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';
import { describe, expect, it } from 'vitest';

/**
 * TASK-PM-01D-M4-G — F-R-01: آزمونِ رقابتِ تعیینکننده برای downـهای ۰۰۶۲/۰۰۶۳.
 *
 * بازبینی مستقل F-R ثابت کرد نسخهٔ F نگهبان «خالیبودن» را بدونِ قفل اجرا میکرد:
 * نویسندهای میتوانست میانِ نگهبان و DDLِ مخرب commit کند و دفتر/شواهد خاموش
 * حذف شود. این فایل همان اکسپلویت را — و وارونهایش — با اتصالهای مستقل،
 * همگامسازی صریح از طریق pg_stat_activity/pg_locks و ثبت ترتیب واقعی
 * تراکنشها اجرا میکند. فقط DB یکبارمصرف (DATABASE_URL) لمس میشود.
 *
 * پوشش: A دفتر committed، B شاهد operation-bound ممیزی، C نویسندهای که پیش از
 * قفلگیری rollback commit میکند، D نویسندهای که پس از قفلگیری نمیتواند دادهٔ
 * قطعیشدهای بسازد، E دستنخوردهماندن اسکیما/ردیفها پس از شکست نگهبان، F چرخهٔ
 * خالی down/up، G تکرار و بازیابی بدونِ تغییر نیمهاعمالشده.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const PSQL = process.env.PSQL ?? 'psql';
const MIG = path.join(ROOT, 'migrations');
const DOWN62 = path.join(MIG, '0062_product_bulk_maintenance.down.sql');
const DOWN63 = path.join(MIG, '0063_product_bulk_evidence.down.sql');

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

const UP_FLAGS = readdirSync(MIG)
  .filter((f) => f.endsWith('.up.sql'))
  .sort()
  .flatMap((f) => ['-f', path.join(MIG, f)]);

interface Ctx {
  dbName: string;
  url: string;
  admin: pg.Pool;
  pool: pg.Pool;
  clients: pg.Client[];
  children: ChildProcess[];
  close: () => Promise<void>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function makeCtx(tag: string): Promise<Ctx> {
  const dbName = `greendms_g_race_${tag}_${process.pid}_${crypto.randomBytes(3).toString('hex')}`;
  const admin = new pg.Pool({ connectionString: adminUrl.toString(), max: 2 });
  await admin.query(
    'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
    [dbName],
  );
  await admin.query(`drop database if exists "${dbName}"`);
  await admin.query(`create database "${dbName}"`);
  const u = new URL(adminUrl);
  u.pathname = `/${dbName}`;
  const url = u.toString();
  execFileSync(PSQL, [...psqlBase, '-d', dbName, '-1', '-q', ...UP_FLAGS], {
    env: psqlEnv,
    stdio: 'pipe',
  });
  const pool = new pg.Pool({ connectionString: url, max: 6 });
  await pool.query(`create table g_witness(step text, who text, at timestamptz not null default clock_timestamp())`);
  const clients: pg.Client[] = [];
  const children: ChildProcess[] = [];
  const close = async () => {
    for (const c of children) if (c.exitCode === null) c.kill('SIGKILL');
    for (const c of clients) await c.end().catch(() => undefined);
    await pool.end().catch(() => undefined);
    await admin.query(
      'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
      [dbName],
    ).catch(() => undefined);
    await admin.query(`drop database if exists "${dbName}"`).catch(() => undefined);
    await admin.end().catch(() => undefined);
  };
  return { dbName, url, admin, pool, clients, children, close };
}

async function connect(ctx: Ctx, applicationName: string): Promise<pg.Client> {
  const c = new pg.Client({ connectionString: ctx.url, application_name: applicationName });
  await c.connect();
  ctx.clients.push(c);
  return c;
}

/** downـی واقعی را در همان تراکنش migrate.mjs (psql -1) بهصورت ناهمزمان اجرا میکند. */
function startDown(ctx: Ctx, file: string, tag: string) {
  // PGAPPNAME (libpq) قابلاعتماد است؛ PGOPTIONS -c application_name روی برخی
  // بیلدهای psql نادیده گرفته میشود و psql مقدار پیشفرض «psql» را میفرستد.
  const child = spawn(PSQL, [...psqlBase, '-d', ctx.dbName, '-1', '-q', '-f', file], {
    env: { ...psqlEnv, PGAPPNAME: tag },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  ctx.children.push(child);
  let out = '';
  child.stdout.on('data', (d: Buffer) => { out += d.toString(); });
  child.stderr.on('data', (d: Buffer) => { out += d.toString(); });
  const done = new Promise<{ code: number | null; out: string }>((resolve) => {
    child.on('close', (code) => resolve({ code, out }));
  });
  return { child, done, tag };
}

interface BackendRow {
  pid: number;
  state: string;
  wait_event_type: string | null;
  wait_event: string | null;
  query: string;
}

async function backends(ctx: Ctx, appName: string): Promise<BackendRow[]> {
  const { rows } = await ctx.admin.query<BackendRow>(
    `select pid, state, wait_event_type, wait_event, query
       from pg_stat_activity where datname=$1 and application_name=$2`,
    [ctx.dbName, appName],
  );
  return rows;
}

async function waitFor(
  ctx: Ctx,
  appName: string,
  predicate: (rows: BackendRow[]) => boolean,
  label: string,
  timeoutMs = 20_000,
): Promise<BackendRow[]> {
  const start = Date.now();
  let last: BackendRow[] = [];
  while (Date.now() - start < timeoutMs) {
    last = await backends(ctx, appName);
    if (predicate(last)) return last;
    await sleep(25);
  }
  throw new Error(`timeout waiting for ${label} (${appName}): ${JSON.stringify(last)}`);
}

async function grantedLocks(ctx: Ctx, appName: string): Promise<Array<{ relname: string; mode: string }>> {
  // pg_stat_activity/pg_locks سراسری کلاستراند، ولی pg_class «هر DB» است؛
  // پس این پرسوجو باید از همان DB یکبارمصرف اجرا شود تا OID رابطهها پیدا شوند.
  const { rows } = await ctx.pool.query<{ relname: string; mode: string }>(
    `select c.relname, l.mode
       from pg_locks l
       join pg_class c on c.oid = l.relation
       join pg_stat_activity a on a.pid = l.pid
      where a.datname=$1 and a.application_name=$2
        and l.locktype='relation' and l.granted`,
    [ctx.dbName, appName],
  );
  return rows;
}

async function witness(ctx: Ctx, step: string, who = 'observer'): Promise<void> {
  await ctx.pool.query(`insert into g_witness(step, who) values ($1,$2)`, [step, who]);
}

async function witnessSteps(ctx: Ctx): Promise<string[]> {
  const { rows } = await ctx.pool.query<{ step: string }>(`select step from g_witness order by at, step`);
  return rows.map((r) => r.step);
}

async function companyId(ctx: Ctx): Promise<string> {
  const { rows } = await ctx.pool.query<{ id: string }>(
    `insert into company(code, legal_name) values ($1,'شرکت رقابت G') returning id`,
    [`G-${crypto.randomBytes(4).toString('hex')}`],
  );
  return rows[0].id;
}

const insertOp = (ctx: Ctx, cid: string, status = 'committed', outcome = 'committed') =>
  ctx.pool.query<{ id: string }>(
    `insert into product_bulk_operation
      (company_id,status,outcome,failure_category,request_hash,preview_token_hash,preview_hash,
       product_ids,changes,expected_versions,preview,expires_at)
     values ($1,$2,$3,'none',$4,$4,$4,
       array[gen_random_uuid()]::uuid[],'{"name":"x"}'::jsonb,'{}'::jsonb,'{"items":[]}'::jsonb,
       now()+interval '1 day') returning id`,
    [cid, status, outcome, crypto.randomUUID()],
  );

/** شاهدِ ممیزیِ operation-bound (بدون تریگر ۰۰۶۰، مستقیماً در DB یکبارمصرف). */
async function insertBoundAudit(ctx: Ctx, cid: string, opId: string): Promise<void> {
  await ctx.pool.query(
    `insert into audit_log(company_id, action, entity_type, bulk_operation_id, at)
     values ($1,'update','product',$2, now())`,
    [cid, opId],
  );
}

interface SchemaState {
  audit_col: number;
  hist_col: number;
  evidence_tbl: number;
  ledger_tbl: number;
  hist_triggers: number;
  evidence_pols: number;
  evidence_constraints: number;
  indexes: number;
  funcs: number;
}

async function schemaState(ctx: Ctx): Promise<SchemaState> {
  const { rows } = await ctx.pool.query<SchemaState>(`
    select
      (select count(*)::int from pg_attribute where attrelid='public.audit_log'::regclass
         and attname='bulk_operation_id' and not attisdropped) as audit_col,
      (select count(*)::int from pg_attribute where attrelid='public.product_catalog_history'::regclass
         and attname='bulk_operation_id' and not attisdropped) as hist_col,
      (select count(*)::int from pg_class where relname='product_bulk_history_event') as evidence_tbl,
      (select count(*)::int from pg_class where relname='product_bulk_operation') as ledger_tbl,
      (select count(*)::int from pg_trigger where tgrelid='public.product_catalog_history'::regclass
         and not tgisinternal) as hist_triggers,
      (select count(*)::int from pg_policy where polrelid='public.product_bulk_history_event'::regclass) as evidence_pols,
      (select count(*)::int from pg_constraint where conrelid='public.product_bulk_history_event'::regclass) as evidence_constraints,
      (select count(*)::int from pg_class where relname in
        ('ix_audit_log_bulk_operation','ix_product_catalog_history_bulk_operation',
         'ix_product_bulk_operation_expires','ix_product_bulk_history_event_operation',
         'ix_product_bulk_history_event_actor')) as indexes,
      (select count(*)::int from pg_proc where proname in
        ('fn_product_catalog_history_bind_bulk','fn_product_bulk_history_evidence')) as funcs`);
  return rows[0];
}

const FULL_STATE: SchemaState = {
  audit_col: 1, hist_col: 1, evidence_tbl: 1, ledger_tbl: 1,
  hist_triggers: 2, evidence_pols: 2, evidence_constraints: 3,
  indexes: 5, funcs: 2,
};

/** ۰۰۶۳ را (روی DB خالی) برمیگرداند تا ۰۰۶۲ در ترتیب واقعی rollback آزمون شود. */
async function rollback0063(ctx: Ctx): Promise<void> {
  const d = startDown(ctx, DOWN63, `g_down63_${crypto.randomBytes(3).toString('hex')}`);
  const r = await d.done;
  expect(r.code, r.out).toBe(0);
}

describe('TASK-PM-01D-M4-G — F-R-01: deterministic rollback race elimination', () => {
  // A + E: ردیفِ قطعی پیش از شروع rollback ⇒ نگهبان جلوی DDL را میگیرد و هیچ چیز حذف نمیشود.
  it('A/E: a committed ledger row prevents 0062.down and leaves the full schema/rows intact', async () => {
    const ctx = await makeCtx('a');
    try {
      const cid = await companyId(ctx);
      await insertOp(ctx, cid, 'committed', 'committed');
      const before = await schemaState(ctx);
      const d = startDown(ctx, DOWN62, 'g_down62_A');
      const r = await d.done;
      expect(r.code).not.toBe(0);
      expect(r.out).toContain('پرشده');
      expect(await schemaState(ctx)).toEqual(before);
      expect((await ctx.pool.query(`select count(*)::int as n from product_bulk_operation`)).rows[0].n).toBe(1);
      await witness(ctx, 'A_guard_rejected_rollback');
    } finally {
      await ctx.close();
    }
  }, 90_000);

  // B + E: شاهدِ ممیزی operation-bound ⇒ نگهبان ۰۰۶۳ جلوی حذف ستون/جدول را میگیرد.
  it('B/E: an operation-bound audit evidence row prevents 0063.down and leaves everything intact', async () => {
    const ctx = await makeCtx('b');
    try {
      const cid = await companyId(ctx);
      // عمداً هیچ ردیف دفتری وجود ندارد: فقط «شاهد ممیزی operation-bound» نگهبان
      // ۰۰۶۳ را فعال میکند، بنابراین علت شکست منحصراً همین شاهد است.
      const op = crypto.randomUUID();
      await insertBoundAudit(ctx, cid, op);
      const before = await schemaState(ctx);
      const d = startDown(ctx, DOWN63, 'g_down63_B');
      const r = await d.done;
      expect(r.code).not.toBe(0);
      expect(r.out).toContain('ممیزی دارای همبستگی M4');
      expect(await schemaState(ctx)).toEqual(before);
      expect((await ctx.pool.query(`select count(*)::int as n from audit_log where bulk_operation_id is not null`)).rows[0].n).toBe(1);
      expect((await ctx.pool.query(`select count(*)::int as n from product_bulk_operation`)).rows[0].n).toBe(0);
    } finally {
      await ctx.close();
    }
  }, 90_000);

  // C: نویسنده پیش از «قفلگیری» rollback commit میکند ⇒ نگهبانِ پس از قفل آن را میبیند.
  it('C/0062: a writer that commits before the rollback lock is acquired is detected', async () => {
    const ctx = await makeCtx('c62');
    try {
      await rollback0063(ctx);
      const cid = await companyId(ctx);
      const writer = await connect(ctx, 'g_writer_C62');
      await writer.query('BEGIN');
      await writer.query(
        `insert into product_bulk_operation
          (company_id,status,outcome,failure_category,request_hash,preview_token_hash,preview_hash,
           product_ids,changes,expected_versions,preview,expires_at)
         values ($1,'committed','committed','none','c62','c62','c62',
           array[gen_random_uuid()]::uuid[],'{"name":"x"}'::jsonb,'{}'::jsonb,'{"items":[]}'::jsonb,
           now()+interval '1 day')`,
        [cid],
      );
      await witness(ctx, 'C62_writer_insert_uncommitted');

      const d = startDown(ctx, DOWN62, 'g_down62_C');
      const waiting = await waitFor(ctx, 'g_down62_C', (rows) =>
        rows.some((r) => r.wait_event_type === 'Lock'), '0062.down waiting for writer');
      expect(waiting.some((r) => r.wait_event_type === 'Lock')).toBe(true);
      await witness(ctx, 'C62_rollback_waiting_on_lock');

      await writer.query('COMMIT');
      await witness(ctx, 'C62_writer_committed', 'writer');

      const r = await d.done;
      expect(r.code, r.out).not.toBe(0);
      expect(r.out).toContain('پرشده');
      const steps = await witnessSteps(ctx);
      expect(steps.indexOf('C62_rollback_waiting_on_lock')).toBeLessThan(steps.indexOf('C62_writer_committed'));
      // E: هیچ چیز حذف نشد.
      expect((await ctx.pool.query(`select count(*)::int as n from product_bulk_operation`)).rows[0].n).toBe(1);
      expect((await ctx.pool.query(`select to_regclass('public.product_bulk_operation') is not null as ok`)).rows[0].ok).toBe(true);
    } finally {
      await ctx.close();
    }
  }, 90_000);

  // C: همان سناریو برای ۰۰۶۳ (نویسندهٔ ممیزی، قفل چهارم = audit_log).
  it('C/0063: a bound-audit writer that commits before the rollback lock is detected', async () => {
    const ctx = await makeCtx('c63');
    try {
      const cid = await companyId(ctx);
      // بدون ردیف دفتر: تنها دادهٔ محافظتشده همان ردیف ممیزیِ نویسنده است.
      const op = crypto.randomUUID();
      const writer = await connect(ctx, 'g_writer_C63');
      await writer.query('BEGIN');
      await writer.query(
        `insert into audit_log(company_id, action, entity_type, bulk_operation_id, at)
         values ($1,'update','product',$2, now())`,
        [cid, op],
      );
      await witness(ctx, 'C63_writer_insert_uncommitted');

      const d = startDown(ctx, DOWN63, 'g_down63_C');
      const waiting = await waitFor(ctx, 'g_down63_C', (rows) =>
        rows.some((r) => r.wait_event_type === 'Lock'), '0063.down waiting for audit writer');
      expect(waiting.some((r) => r.wait_event_type === 'Lock')).toBe(true);
      await witness(ctx, 'C63_rollback_waiting_on_lock');

      await writer.query('COMMIT');
      await witness(ctx, 'C63_writer_committed', 'writer');

      const r = await d.done;
      expect(r.code, r.out).not.toBe(0);
      expect(r.out).toContain('ممیزی دارای همبستگی M4');
      expect(await schemaState(ctx)).toEqual(FULL_STATE);
      expect((await ctx.pool.query(`select count(*)::int as n from audit_log where bulk_operation_id is not null`)).rows[0].n).toBe(1);
      const steps = await witnessSteps(ctx);
      expect(steps.indexOf('C63_rollback_waiting_on_lock')).toBeLessThan(steps.indexOf('C63_writer_committed'));
    } finally {
      await ctx.close();
    }
  }, 90_000);

  // D/F: نویسندهای که «پس از» قفلگیری اقدام میکند نمیتواند چیزی commit کند و سپس حذف شود.
  it('D/F/0062: a writer after lock acquisition cannot silently commit data that is dropped', async () => {
    const ctx = await makeCtx('d62');
    try {
      await rollback0063(ctx);
      const cid = await companyId(ctx);

      // کنترلکننده آخرین قفل ترتیب سراسری (audit_log) را نگه میدارد: down قفلهای
      // ۱..۳ را گرفته و پشت قفل ۴ منتظر میماند ⇒ پنجرهٔ تعیینکننده، بدون pg_sleep
      // و بدون قلاب در SQL مهاجرت.
      const controller = await connect(ctx, 'g_controller_D62');
      await controller.query('BEGIN');
      await controller.query('lock table public.audit_log in access exclusive mode');
      await witness(ctx, 'D62_controller_holds_audit_lock');

      const d = startDown(ctx, DOWN62, 'g_down62_D');
      await waitFor(ctx, 'g_down62_D', (rows) =>
        rows.some((r) => r.wait_event_type === 'Lock'), '0062.down blocked by controller');
      const locks = await grantedLocks(ctx, 'g_down62_D');
      expect(locks.some((l) => l.relname === 'product_bulk_operation' && l.mode === 'AccessExclusiveLock')).toBe(true);
      expect(locks.some((l) => l.relname === 'product_catalog_history' && l.mode === 'AccessExclusiveLock')).toBe(true);
      await witness(ctx, 'D62_rollback_holds_early_locks');

      const writer = await connect(ctx, 'g_writer_D62');
      await writer.query(`set statement_timeout = '12s'`);
      const write = (async () => {
        await writer.query('BEGIN');
        await writer.query(
          `insert into product_bulk_operation
            (company_id,status,outcome,failure_category,request_hash,preview_token_hash,preview_hash,
             product_ids,changes,expected_versions,preview,expires_at)
           values ($1,'committed','committed','none','d62','d62','d62',
             array[gen_random_uuid()]::uuid[],'{"name":"x"}'::jsonb,'{}'::jsonb,'{"items":[]}'::jsonb,
             now()+interval '1 day')`,
          [cid],
        );
        await writer.query(`insert into g_witness(step,who) values ('D62_writer_committed','writer')`);
        await writer.query('COMMIT');
      })();
      const writeOutcome = write.then(() => 'resolved', (e: Error) => e);
      await waitFor(ctx, 'g_writer_D62', (rows) =>
        rows.some((r) => r.wait_event_type === 'Lock'), 'writer blocked by rollback AccessExclusive');
      await witness(ctx, 'D62_writer_blocked_after_down_lock');

      await controller.query('ROLLBACK'); // رهاکردن قفل چهارم ⇒ down نگهبان/DDL را تمام میکند
      const r = await d.done;
      expect(r.code, r.out).toBe(0); // F: چرخهٔ خالی موفق است
      expect(await writeOutcome).toBeInstanceOf(Error);
      await writer.query('ROLLBACK').catch(() => undefined);

      expect((await ctx.pool.query(`select count(*)::int as n from g_witness where step='D62_writer_committed'`)).rows[0].n).toBe(0);
      expect((await ctx.pool.query(`select to_regclass('public.product_bulk_operation') is null as gone`)).rows[0].gone).toBe(true);
      const steps = await witnessSteps(ctx);
      expect(steps.indexOf('D62_rollback_holds_early_locks')).toBeLessThan(steps.indexOf('D62_writer_blocked_after_down_lock'));
    } finally {
      await ctx.close();
    }
  }, 90_000);

  // D/F: همان برای ۰۰۶۳ (نویسنده سعی میکند شاهد operation-bound بسازد).
  it('D/F/0063: a writer after lock acquisition cannot silently commit evidence that is dropped', async () => {
    const ctx = await makeCtx('d63');
    try {
      const cid = await companyId(ctx);
      // DB خالی (F): تنها نویسندهٔ مسدودشده میتوانست دادهٔ محافظتشده بسازد.
      const op = crypto.randomUUID();

      const controller = await connect(ctx, 'g_controller_D63');
      await controller.query('BEGIN');
      await controller.query('lock table public.audit_log in access exclusive mode');
      await witness(ctx, 'D63_controller_holds_audit_lock');

      const d = startDown(ctx, DOWN63, 'g_down63_D');
      await waitFor(ctx, 'g_down63_D', (rows) =>
        rows.some((r) => r.wait_event_type === 'Lock'), '0063.down blocked by controller');
      const locks = await grantedLocks(ctx, 'g_down63_D');
      expect(locks.some((l) => l.relname === 'product_bulk_operation' && l.mode === 'AccessExclusiveLock')).toBe(true);
      expect(locks.some((l) => l.relname === 'product_bulk_history_event' && l.mode === 'AccessExclusiveLock')).toBe(true);
      await witness(ctx, 'D63_rollback_holds_early_locks');

      const writer = await connect(ctx, 'g_writer_D63');
      await writer.query(`set statement_timeout = '12s'`);
      const write = (async () => {
        await writer.query('BEGIN');
        // history_id فقط bigint است و FK ندارد؛ نباید پیش از قفل به تاریخچه نوشت
        // (down همان جدول را ACCESS EXCLUSIVE قفل کرده است).
        await writer.query(
          `insert into product_bulk_history_event
            (bulk_operation_id, product_id, company_id, actor_user_id, history_id)
           values ($1, gen_random_uuid(), $2, gen_random_uuid(), 1)`,
          [op, cid],
        );
        await writer.query(`insert into g_witness(step,who) values ('D63_writer_committed','writer')`);
        await writer.query('COMMIT');
      })();
      const writeOutcome = write.then(() => 'resolved', (e: Error) => e);
      await waitFor(ctx, 'g_writer_D63', (rows) =>
        rows.some((r) => r.wait_event_type === 'Lock'), 'writer blocked by rollback AccessExclusive');
      await witness(ctx, 'D63_writer_blocked_after_down_lock');

      await controller.query('ROLLBACK');
      const r = await d.done;
      expect(r.code, r.out).toBe(0);
      expect(await writeOutcome).toBeInstanceOf(Error);
      await writer.query('ROLLBACK').catch(() => undefined);

      expect((await ctx.pool.query(`select count(*)::int as n from g_witness where step='D63_writer_committed'`)).rows[0].n).toBe(0);
      expect((await ctx.pool.query(`select to_regclass('public.product_bulk_history_event') is null as gone`)).rows[0].gone).toBe(true);
      const steps = await witnessSteps(ctx);
      expect(steps.indexOf('D63_rollback_holds_early_locks')).toBeLessThan(steps.indexOf('D63_writer_blocked_after_down_lock'));
    } finally {
      await ctx.close();
    }
  }, 90_000);

  // F: چرخهٔ خالی down/up کامل و بازاعمال همان اسکیما/گرانتها.
  it('F: empty rollback and re-application restore the exact end state', async () => {
    const ctx = await makeCtx('f');
    try {
      expect(await schemaState(ctx)).toEqual(FULL_STATE);
      const d63 = startDown(ctx, DOWN63, 'g_down63_F');
      expect((await d63.done).code).toBe(0);
      const d62 = startDown(ctx, DOWN62, 'g_down62_F');
      expect((await d62.done).code).toBe(0);
      expect((await ctx.pool.query(`select to_regclass('public.product_bulk_operation') is null as gone`)).rows[0].gone).toBe(true);
      expect((await ctx.pool.query(`select to_regclass('public.product_bulk_history_event') is null as gone`)).rows[0].gone).toBe(true);

      execFileSync(PSQL, [...psqlBase, '-d', ctx.dbName, '-1', '-q',
        '-f', path.join(MIG, '0062_product_bulk_maintenance.up.sql'),
        '-f', path.join(MIG, '0063_product_bulk_evidence.up.sql')], { env: psqlEnv, stdio: 'pipe' });
      expect(await schemaState(ctx)).toEqual(FULL_STATE);
      const { rows } = await ctx.pool.query<{ ok: boolean }>(`
        select (select relrowsecurity and relforcerowsecurity from pg_class where relname='product_bulk_operation')
            and (select relrowsecurity and relforcerowsecurity from pg_class where relname='product_bulk_history_event')
            and (select has_table_privilege('dms_app','product_bulk_history_event','INSERT') = false)
            and (select has_table_privilege('dms_readonly','product_bulk_operation','SELECT') = false) as ok`);
      expect(rows[0].ok).toBe(true);
    } finally {
      await ctx.close();
    }
  }, 90_000);

  // G: شکستهای مکرر و بازیابی، هیچ تغییر نیمهاعمالشدهای بجا نمیگذارند.
  it('G: repeated failing rollbacks and recovery leave no partially applied schema changes', async () => {
    const ctx = await makeCtx('g');
    try {
      const cid = await companyId(ctx);
      await insertOp(ctx, cid, 'committed', 'committed');
      const before = await schemaState(ctx);

      for (let i = 0; i < 2; i += 1) {
        const d63 = startDown(ctx, DOWN63, `g_down63_G${i}`);
        expect((await d63.done).code).not.toBe(0);
        expect(await schemaState(ctx)).toEqual(before);
        const d62 = startDown(ctx, DOWN62, `g_down62_G${i}`);
        expect((await d62.done).code).not.toBe(0);
        expect(await schemaState(ctx)).toEqual(before);
        expect((await ctx.pool.query(`select count(*)::int as n from product_bulk_operation`)).rows[0].n).toBe(1);
      }

      // بازیابی: فقط ردیف ساختگی همین تست پاک میشود؛ سپس down خالی موفق است.
      await ctx.pool.query(`delete from product_bulk_operation`);
      const d63 = startDown(ctx, DOWN63, 'g_down63_G_ok');
      const r63 = await d63.done;
      expect(r63.code, r63.out).toBe(0);
      const d62 = startDown(ctx, DOWN62, 'g_down62_G_ok');
      const r62 = await d62.done;
      expect(r62.code, r62.out).toBe(0);
      expect((await ctx.pool.query(`select to_regclass('public.product_bulk_operation') is null as gone`)).rows[0].gone).toBe(true);
    } finally {
      await ctx.close();
    }
  }, 120_000);
});
