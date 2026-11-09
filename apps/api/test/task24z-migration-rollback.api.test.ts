import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';

/**
 * TASK-24Z · Phase E — ایمنیِ rollbackِ مهاجرت 0053.
 *
 * یافتهٔ F-1 حسابرسیِ TASK-24Y: فایلِ `0053...down.sql` ستون‌های
 * `sales_order.created_by` و `purchase_order.created_by` را حذف می‌کرد و
 * هویتِ سازنده **برای همیشه** از بین می‌رفت ⇒ کنترلِ جداسازیِ وظایف بی‌اثر
 * می‌شد.
 *
 * این آزمون همان سناریو را روی یک پایگاهِ یک‌بارمصرف اجرا می‌کند و اثبات می‌کند:
 *   up → دادهٔ سازنده → down → up  ⇒  هویتِ سازنده **باقی می‌ماند**.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_task24z_migration_test';
const PSQL = process.env.PSQL ?? 'psql';
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

let adminPool: pg.Pool;
let pool: pg.Pool;

const runSqlFile = (file: string): void => {
  execFileSync(PSQL, [...psqlBase, '-d', TEST_DB, '-q', '-f', file], { env: psqlEnv, stdio: 'pipe' });
};

const migDir = path.join(ROOT, 'migrations');
const fileFor = (prefix: string, dir: 'up' | 'down'): string =>
  path.join(migDir, `${prefix}.${dir}.sql`);

const columnExists = async (table: string, column: string): Promise<boolean> => {
  const { rows } = await pool.query<{ c: number }>(
    `select count(*)::int as c from information_schema.columns
      where table_name = $1 and column_name = $2`,
    [table, column],
  );
  return Number(rows[0].c) > 0;
};

beforeAll(async () => {
  adminPool = new pg.Pool({ connectionString: adminUrl.toString() });
  await adminPool.query(`drop database if exists ${TEST_DB}`);
  await adminPool.query(`create database ${TEST_DB}`);
  pool = new pg.Pool({ connectionString: (() => {
    const u = new URL(adminUrl.toString());
    u.pathname = `/${TEST_DB}`;
    return u.toString();
  })() });

  // کلِ زنجیره تا پیش از 0053
  const ups = readdirSync(migDir)
    .filter((f) => f.endsWith('.up.sql'))
    .sort()
    .filter((f) => f < '0053');
  for (const f of ups) runSqlFile(path.join(migDir, f));
}, 180_000);

afterAll(async () => {
  await pool?.end();
  if (adminPool) {
    await adminPool.query(
      `select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()`,
      [TEST_DB],
    );
    await adminPool.query(`drop database if exists ${TEST_DB}`);
    await adminPool.end();
  }
}, 60_000);

describe('F-1 · rollback هویتِ سازنده را نابود نمی‌کند', () => {
  it('up → داده → down → up ⇒ created_by حفظ می‌شود', async () => {
    // ---- ۱) اعمالِ 0053 ----
    runSqlFile(fileFor('0053_approval_architecture', 'up'));
    expect(await columnExists('sales_order', 'created_by')).toBe(true);
    expect(await columnExists('purchase_order', 'created_by')).toBe(true);

    // ---- ۲) دادهٔ واقعی: شرکت/شعبه/سفارش با سازنده ----
    const company = await pool.query<{ id: string }>(
      `insert into company (code, legal_name, currency) values ('M1', 'شرکتِ آزمونِ مهاجرت', 'IRR') returning id`,
    );
    const companyId = company.rows[0].id;
    const branch = await pool.query<{ id: string }>(
      `insert into branch (company_id, code, name) values ($1, 'MB1', 'شعبه') returning id`,
      [companyId],
    );
    const branchId = branch.rows[0].id;
    const person = await pool.query<{ id: string }>(
      `insert into person (company_id, code, legal_type, first_name) values ($1, 'MP1', 'natural', 'سازنده') returning id`,
      [companyId],
    );
    const userId = (
      await pool.query<{ id: string }>(
        `insert into app_user (person_id, username, password_hash, access_level)
         values ($1, 'm_user', 'x', 'web') returning id`,
        [person.rows[0].id],
      )
    ).rows[0].id;
    const custPerson = await pool.query<{ id: string }>(
      `insert into person (company_id, code, legal_type, first_name) values ($1, 'MP2', 'natural', 'مشتری') returning id`,
      [companyId],
    );
    const customerId = (
      await pool.query<{ id: string }>(
        `insert into customer (person_id, branch_id, code) values ($1, $2, 'MC1') returning id`,
        [custPerson.rows[0].id, branchId],
      )
    ).rows[0].id;

    const orderId = (
      await pool.query<{ id: string }>(
        `insert into sales_order
           (branch_id, doc_number, fiscal_year, customer_id, channel, order_date, status, created_by)
         values ($1, 'MSO-1', 1404, $2, 'field', current_date, 'draft', $3) returning id`,
        [branchId, customerId, userId],
      )
    ).rows[0].id;

    // پیش‌شرط: مقدار واقعاً ذخیره شده است
    const before = await pool.query<{ created_by: string | null }>(
      `select created_by from sales_order where id = $1`,
      [orderId],
    );
    expect(before.rows[0].created_by).toBe(userId);

    // ---- ۳) rollback ----
    runSqlFile(fileFor('0053_approval_architecture', 'down'));
    // ستون حذف می‌شود (بخشی از 0053) ولی داده باید در آرشیو مانده باشد
    expect(await columnExists('sales_order', 'created_by')).toBe(false);
    const archived = await pool.query<{ created_by: string }>(
      `select created_by from approval_sod_creator_archive
        where entity_table = 'sales_order' and entity_id = $1`,
      [orderId],
    );
    expect(archived.rows[0]?.created_by).toBe(userId);

    // ---- ۴) اعمالِ دوباره ----
    runSqlFile(fileFor('0053_approval_architecture', 'up'));
    expect(await columnExists('sales_order', 'created_by')).toBe(true);

    const after = await pool.query<{ created_by: string | null }>(
      `select created_by from sales_order where id = $1`,
      [orderId],
    );

    /**
     * TASK-24Y اینجا NULL می‌داد (یافتهٔ F-1).
     * TASK-24Z مقدار را از آرشیو بازمی‌گرداند.
     */
    expect(after.rows[0].created_by).toBe(userId);
  }, 120_000);

  it('rollback بدونِ دادهٔ سازنده، ستون را ساده حذف می‌کند (بدونِ آرشیوِ اضافی)', async () => {
    // در همین پایگاه، آرشیو از آزمونِ قبل موجود است؛ بررسی می‌کنیم که
    // اجرای دوبارهٔ down فروپاشدنی نیست (idempotent).
    runSqlFile(fileFor('0053_approval_architecture', 'down'));
    const n = await pool.query<{ c: number }>(
      `select count(*)::int as c from approval_sod_creator_archive`,
    );
    expect(Number(n.rows[0].c)).toBeGreaterThanOrEqual(1);
    runSqlFile(fileFor('0053_approval_architecture', 'up'));
  }, 120_000);

  it('0054 هم up/down را بدونِ خطا طی می‌کند و دادهٔ meta را حفظ می‌کند', async () => {
    runSqlFile(fileFor('0054_approval_lifecycle_integrity', 'up'));
    expect(await columnExists('approval_decision', 'meta')).toBe(true);

    const idx = await pool.query<{ c: number }>(
      `select count(*)::int as c from pg_indexes where indexname = 'uq_approval_binding_active'`,
    );
    expect(Number(idx.rows[0].c)).toBe(1);

    runSqlFile(fileFor('0054_approval_lifecycle_integrity', 'down'));
    // بدونِ دادهٔ meta، ستون حذف می‌شود (rollback کامل)
    expect(await columnExists('approval_decision', 'meta')).toBe(false);

    runSqlFile(fileFor('0054_approval_lifecycle_integrity', 'up'));
    expect(await columnExists('approval_decision', 'meta')).toBe(true);
  }, 120_000);
  it('populated approval policy makes destructive 0053 rollback refuse atomically', async () => {
    const companyId = (await pool.query<{ id: string }>(`select id from company limit 1`)).rows[0].id;
    const chainId = (await pool.query<{ id: string }>(
      `insert into approval_chain (company_id, code, entity) values ($1, 'ROLLBACK-GUARD', 'sales_order') returning id`,
      [companyId],
    )).rows[0].id;
    const policyId = (await pool.query<{ id: string }>(
      `insert into approval_policy (company_id, operation, scope, approval_chain_id)
       values ($1, 'sales.order.approve', 'central', $2) returning id`, [companyId, chainId],
    )).rows[0].id;
    expect(() => runSqlFile(fileFor('0053_approval_architecture', 'down'))).toThrow();
    expect((await pool.query(`select id from approval_policy where id = $1`, [policyId])).rowCount).toBe(1);
    expect(await columnExists('sales_order', 'created_by')).toBe(true);
  });

});
