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
 * آزمون‌های امنیتیِ P3 زیرِ نقشِ زمانِ اجرا (`dms_app`) — مکملِ product-master-rls.test.ts:
 *
 *   customer_segment (مهاجرت 0066، الگوی direct RLS):
 *     - A سطرِ خودش را می‌بیند و سطرِ B را نه (خواندن ⇒ صفر ردیف، نه خطا)
 *     - A نمی‌تواند سطرِ با company_id=B درج کند (WITH CHECK ⇒ 42501)
 *     - A نمی‌تواند سطرِ B را به‌روزرسانی کند (صفر ردیف، بدون اثر)
 *     - نبودِ زمینه/زمینهٔ نامعتبر ⇒ fail-closed (صفر ردیف)
 *   قیودِ CHECK مسدودی اعتبار (ck_customer_credit_hold_*):
 *     - credit_hold=true بدونِ reason/set_at/set_by ⇒ 23514
 *     - رفعِ مسدودی با reason/متادیتا باقی‌مانده ⇒ 23514
 *   قیدِ کدِ بخش (ck_customer_segment_code): کد کوتاه (۱ کاراکتر) ⇒ 23514
 *
 * نکتهٔ نقش: رمزِ dms_app تصادفی و یکبارمصرف است و در پایان به NOLOGIN برمی‌گردد.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_p3_rls_test';
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

let companyA = '';
let companyB = '';
let segmentAId = '';
let segmentBId = '';
let customerAId = '';

type TenantCtx = string | 'none' | 'invalid';

async function asRuntime<T>(ctx: TenantCtx, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: appUrl.toString() });
  await client.connect();
  try {
    if (ctx === 'invalid') {
      await client.query(`select set_config('app.company_id', 'not-a-uuid', false)`);
      await client.query(`select set_config('app.user_id', 'not-a-uuid', false)`);
    } else if (ctx !== 'none') {
      await client.query(`select set_config('app.company_id', $1, false), set_config('app.user_id', $2, false)`, [
        ctx,
        crypto.randomUUID(),
      ]);
    }
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function expectSqlError(promise: Promise<unknown>, code: string, label: string): Promise<void> {
  try {
    await promise;
  } catch (err) {
    expect((err as { code?: string }).code, `${label}: کدِ خطای SQL`).toBe(code);
    return;
  }
  throw new Error(`expected SQL error ${code} for ${label}, but it succeeded`);
}

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

  ownerPool = new pg.Pool({ connectionString: testUrl.toString(), max: 2 });
  const u = () => crypto.randomBytes(4).toString('hex');

  companyA = (await ownerPool.query(`insert into company (code, legal_name) values ($1,'شرکت A') returning id`, [`RLS_SA_${u()}`])).rows[0].id;
  companyB = (await ownerPool.query(`insert into company (code, legal_name) values ($1,'شرکت B') returning id`, [`RLS_SB_${u()}`])).rows[0].id;
  const branchA = (await ownerPool.query(`insert into branch (company_id, code, name) values ($1,'HQ','مرکز A') returning id`, [companyA])).rows[0].id;
  const branchB = (await ownerPool.query(`insert into branch (company_id, code, name) values ($1,'HQ','مرکز B') returning id`, [companyB])).rows[0].id;

  segmentAId = (await ownerPool.query(
    `insert into customer_segment (company_id, code, title) values ($1,$2,'بخش A') returning id`,
    [companyA, `SEG-A-${u()}`],
  )).rows[0].id;
  segmentBId = (await ownerPool.query(
    `insert into customer_segment (company_id, code, title) values ($1,$2,'بخش B') returning id`,
    [companyB, `SEG-B-${u()}`],
  )).rows[0].id;

  const personA = (await ownerPool.query(
    `insert into person (company_id, code, legal_type, first_name, last_name) values ($1,$2,'natural','مشتری','A') returning id`,
    [companyA, `P-${u()}`],
  )).rows[0].id;
  customerAId = (await ownerPool.query(
    `insert into customer (person_id, branch_id, code, segment_id) values ($1,$2,$3,$4) returning id`,
    [personA, branchA, `C-${u()}`, segmentAId],
  )).rows[0].id;
  void branchB;

  await adminPool.query(
    `alter role ${RUNTIME_ROLE} login password '${RUNTIME_PASSWORD.replace(/'/g, "''")}'`,
  );
}, 240_000);

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
}, 60_000);

describe('RLS customer_segment زیرِ dms_app', () => {
  it('A سطرِ خودش را می‌بیند؛ سطرِ B و برعکس صفر ردیف است', async () => {
    const own = await asRuntime(companyA, (c) =>
      c.query(`select id from customer_segment where id = $1`, [segmentAId]));
    expect(own.rows.length).toBe(1);

    const cross = await asRuntime(companyA, (c) =>
      c.query(`select id from customer_segment where id = $1`, [segmentBId]));
    expect(cross.rows.length).toBe(0);

    const ownB = await asRuntime(companyB, (c) =>
      c.query(`select id from customer_segment where id = $1`, [segmentBId]));
    expect(ownB.rows.length).toBe(1);

    const crossB = await asRuntime(companyB, (c) =>
      c.query(`select id from customer_segment where id = $1`, [segmentAId]));
    expect(crossB.rows.length).toBe(0);
  });

  it('نبودِ زمینه / زمینهٔ نامعتبر ⇒ fail-closed (صفر ردیف)', async () => {
    for (const ctx of ['none', 'invalid'] as const) {
      const r = await asRuntime(ctx, (c) => c.query(`select id from customer_segment`));
      expect(r.rows.length, `ctx=${ctx}`).toBe(0);
    }
  });

  it('درجِ سطر با company_id شرکتِ دیگر ⇒ 42501', async () => {
    await expectSqlError(
      asRuntime(companyA, (c) =>
        c.query(`insert into customer_segment (company_id, code, title) values ($1,'HACK-1','نفوذ')`, [companyB])),
      '42501',
      'insert-into-B',
    );
  });

  it('به‌روزرسانیِ سطرِ B توسط A ⇒ صفر ردیف و بدونِ اثر', async () => {
    const r = await asRuntime(companyA, (c) =>
      c.query(`update customer_segment set title = 'دستکاری' where id = $1`, [segmentBId]));
    expect(r.rowCount).toBe(0);
    const check = await ownerPool.query(`select title from customer_segment where id = $1`, [segmentBId]);
    expect(check.rows[0].title).toBe('بخش B');
  });
});

describe('قیودِ CHECK در مهاجرت 0066 (همان دیتابیسِ واقعی)', () => {
  it('credit_hold=true بدون reason/متادیتا ⇒ 23514', async () => {
    await expectSqlError(
      ownerPool.query(
        `insert into customer_credit (customer_id, credit_limit, credit_hold)
         values ($1, 100, true)`,
        [customerAId],
      ),
      '23514',
      'hold-without-meta',
    );
  });

  it('رفعِ مسدودی با باقی‌ماندنِ reason/متادیتا ⇒ 23514', async () => {
    await ownerPool.query(
      `insert into customer_credit (customer_id, credit_limit, credit_hold, hold_reason, hold_set_at, hold_set_by)
       values ($1, 100, true, 'دلیل', now(), gen_random_uuid())`,
      [customerAId],
    );
    await expectSqlError(
      ownerPool.query(`update customer_credit set credit_hold = false where customer_id = $1`, [customerAId]),
      '23514',
      'release-with-leftover-meta',
    );
  });

  it('کدِ بخش کوتاه‌تر از ۲ کاراکتر ⇒ 23514', async () => {
    await expectSqlError(
      ownerPool.query(
        `insert into customer_segment (company_id, code, title) values ($1,'X','خیلی کوتاه')`,
        [companyA],
      ),
      '23514',
      'segment-code-too-short',
    );
  });
});
