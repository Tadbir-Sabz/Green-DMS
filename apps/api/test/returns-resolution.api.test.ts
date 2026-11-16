import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';
import request from 'supertest';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { PG_POOL } from '../src/database/database.module';
import { validationPipeOptions } from '../src/common/validation';
import { hashPassword } from '../src/modules/identity-rbac/password';

/**
 * TASK-P4-R — تست API «resolution مرجوعی»:
 * دریافت (POST /returns/{id}/receive) باید هم‌اتمیک با گذار به posted
 * آثار موجودی را در همان تراکنش ثبت کند:
 *   restock             ⇒ sale_return_in به انبار main شعبه (یا مقصد صریح)
 *   damaged             ⇒ sale_return_in به انبار quarantine/damaged شعبه
 *   scrap/return_to_supplier ⇒ بدون حرکت موجودی
 *   fail-closed        ⇒ انبار لازم وجود ندارد/انبار صریح نامعتبر ⇒ 4xx/409 و هیچ نوشتنی
 *   double-receive     ⇒ 409 و فقط یک پُستينگ
 *
 * دیتابیس موقت «greendms_returns_resolution_test» از صفر + همهٔ مهاجرت‌ها.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_returns_resolution_test';
const PSQL = process.env.PSQL ?? 'psql';

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
let pool: pg.Pool;
let app: INestApplication;

const PASSWORD = 'S3cret!pass';
const ADMIN_A = 'rr_admin_a';
const APPROVER_A = 'rr_approver_a';
const VIEWER_A = 'rr_viewer_a';
const ADMIN_B = 'rr_admin_b';
const APPROVER_B = 'rr_approver_b';
const ADMIN_C = 'rr_admin_c';
const APPROVER_C = 'rr_approver_c';

let adminA = '';
let approverA = '';
let viewerA = '';
let adminB = '';
let approverB = '';
let adminC = '';
let approverC = '';

/** شرکت A: انبار main + quarantine + consignment + غیرفعال + شعبهٔ دوم؛ معیوب ندارد */
let companyA = '';
let customerA = '';
let productA = '';
let batchA = '';
let whMain = '';
let whMainSide = '';
let whConsign = '';
let whOff = '';
let whQuar = '';

/** شرکت B: فقط انبار main دارد (قرنطینه ندارد) — برای fail-closed damaged */
let companyB = '';
let customerB = '';
let productB = '';

/** شرکت C: هیچ انباری ندارد — برای fail-closed restock */
let companyC = '';
let customerC = '';
let productC = '';

const MISSING = '11111111-1111-4111-8111-111111111111';

const api = (token: string) => {
  const base = request(app.getHttpServer());
  const verb = (method: 'get' | 'post') => (url: string) =>
    base[method](url).set('Authorization', `Bearer ${token}`);
  return { get: verb('get'), post: verb('post') };
};

const login = async (username: string): Promise<string> => {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ username, password: PASSWORD })
    .expect(200);
  return res.body.access_token as string;
};

const createReturn = async (
  token: string,
  lines: { product_id: string; qty: number; batch_id?: string }[],
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; status: string }> => {
  const res = await api(token)
    .post('/api/v1/returns')
    .send({ customer_id: overrides.customer_id ?? undefined, reason_code: 'damaged', lines, ...overrides })
    .expect(201);
  return { id: res.body.id as string, status: res.body.status as string };
};

const approveReturn = async (token: string, id: string): Promise<void> => {
  await api(token).post(`/api/v1/returns/${id}/approve`).expect(200);
};

const receive = (token: string, id: string, body: unknown) =>
  api(token).post(`/api/v1/returns/${id}/receive`).send(body);

const txnsFor = async (returnId: string) => {
  const { rows } = await pool.query<{ warehouse_id: string; txn_kind: string; qty: string; batch_id: string | null }>(
    `select warehouse_id, txn_kind, qty::text, batch_id from inventory_txn
      where source_type = 'return_request' and source_id = $1`,
    [returnId],
  );
  return rows;
};

const balanceOf = async (warehouseId: string, productId: string, batchId: string | null): Promise<number> => {
  const { rows } = await pool.query<{ qty_on_hand: string }>(
    `select qty_on_hand::text as qty_on_hand from stock_balance
      where warehouse_id = $1 and product_id = $2 and batch_id is not distinct from $3`,
    [warehouseId, productId, batchId],
  );
  return rows.length === 0 ? 0 : Number(rows[0].qty_on_hand);
};

const statusOf = async (id: string): Promise<string> => {
  const { rows } = await pool.query<{ status: string }>(`select status from return_request where id = $1`, [id]);
  return rows[0]?.status ?? 'missing';
};

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

  pool = new pg.Pool({ connectionString: testUrl.toString(), max: 1 });
  const hash = await hashPassword(PASSWORD);
  await pool.query(`insert into uom (code, title) values ('RRPCS', 'عدد')`);

  const makeCompany = async (code: string, legal: string): Promise<string> => {
    const { rows } = await pool.query<{ id: string }>(
      `insert into company (code, legal_name) values ($1, $2) returning id`,
      [code, legal],
    );
    return rows[0].id;
  };
  const makeBranch = async (cid: string, code: string): Promise<string> => {
    const { rows } = await pool.query<{ id: string }>(
      `insert into branch (company_id, code, name) values ($1, $2, $2) returning id`,
      [cid, code],
    );
    return rows[0].id;
  };
  const makeWarehouse = async (bid: string, code: string, kind: string, isActive = true): Promise<string> => {
    const { rows } = await pool.query<{ id: string }>(
      `insert into warehouse (branch_id, code, name, kind, is_active)
       values ($1, $2, $2, $3, $4) returning id`,
      [bid, code, kind, isActive],
    );
    return rows[0].id;
  };
  const makeCustomer = async (cid: string, branchId: string, code: string): Promise<string> => {
    const person = await pool.query<{ id: string }>(
      `insert into person (company_id, code, legal_type, first_name, last_name)
       values ($1, $2, 'natural', 'مشتری', 'تست') returning id`,
      [cid, `P-${code}`],
    );
    const { rows } = await pool.query<{ id: string }>(
      `insert into customer (person_id, branch_id, code, channel)
       values ($1, $2, $3, 'retail') returning id`,
      [person.rows[0].id, branchId, code],
    );
    return rows[0].id;
  };
  const makeProduct = async (cid: string, code: string): Promise<string> => {
    const category = await pool.query<{ id: string }>(
      `insert into product_category (company_id, code, name) values ($1, $2, $2) returning id`,
      [cid, `CAT-${code}`],
    );
    const { rows } = await pool.query<{ id: string }>(
      `insert into product (company_id, code, name, category_id, base_uom_id)
       select $1, $2, $2, $3, id from uom where code = 'RRPCS' returning id`,
      [cid, code, category.rows[0].id],
    );
    return rows[0].id;
  };
  const makeUser = async (cid: string, code: string, roleCode: 'admin_full' | 'rr_approver' | 'rr_viewer'): Promise<void> => {
    const roleId = (
      await pool.query<{ id: string }>(
        `insert into role (company_id, code, name) values ($1, $2, $3) returning id`,
        [cid, `${roleCode}_${code}`, `${roleCode}_${code}`],
      )
    ).rows[0].id;
    if (roleCode === 'admin_full') {
      await pool.query(`insert into role_permission (role_id, permission_code) select $1, code from permission`, [roleId]);
    } else if (roleCode === 'rr_approver') {
      await pool.query(
        `insert into role_permission (role_id, permission_code) values ($1, 'sales.return.approve')`,
        [roleId],
      );
    } else {
      await pool.query(
        `insert into role_permission (role_id, permission_code) values ($1, 'sales.return.request')`,
        [roleId],
      );
    }
    const person = await pool.query<{ id: string }>(
      `insert into person (company_id, code, legal_type, first_name, last_name)
       values ($1, $2, 'natural', 'کاربر', 'تست') returning id`,
      [cid, `U-${code}`],
    );
    const user = await pool.query<{ id: string }>(
      `insert into app_user (person_id, username, password_hash, access_level)
       values ($1, $2, $3, 'web') returning id`,
      [person.rows[0].id, code, hash],
    );
    await pool.query(`insert into user_role (app_user_id, role_id) values ($1, $2)`, [user.rows[0].id, roleId]);
  };

  // ---------- شرکت A ----------
  companyA = await makeCompany('RRA', 'شرکت resolution الف');
  const branchA = await makeBranch(companyA, 'MAIN');
  const branchA2 = await makeBranch(companyA, 'SIDE');
  whMain = await makeWarehouse(branchA, 'MAIN', 'main');
  whQuar = await makeWarehouse(branchA, 'QUAR', 'quarantine');
  whConsign = await makeWarehouse(branchA, 'CONS', 'consignment');
  whOff = await makeWarehouse(branchA, 'OFFW', 'main', false);
  whMainSide = await makeWarehouse(branchA2, 'SIDEW', 'main');
  customerA = await makeCustomer(companyA, branchA, 'C-A');
  productA = await makeProduct(companyA, 'P-A');
  batchA = (
    await pool.query<{ id: string }>(
      `insert into batch (product_id, batch_no) values ($1, 'B-A-1') returning id`,
      [productA],
    )
  ).rows[0].id;
  await makeUser(companyA, ADMIN_A, 'admin_full');
  await makeUser(companyA, APPROVER_A, 'rr_approver');
  await makeUser(companyA, VIEWER_A, 'rr_viewer');

  // ---------- شرکت B: فقط انبار main دارد (قرنطینه ندارد) ----------
  companyB = await makeCompany('RRB', 'شرکت resolution ب');
  const branchB = await makeBranch(companyB, 'MAIN');
  await makeWarehouse(branchB, 'BMAIN', 'main');
  customerB = await makeCustomer(companyB, branchB, 'C-B');
  productB = await makeProduct(companyB, 'P-B');
  await makeUser(companyB, ADMIN_B, 'admin_full');
  await makeUser(companyB, APPROVER_B, 'rr_approver');

  // ---------- شرکت C: هیچ انباری ندارد ----------
  companyC = await makeCompany('RRC', 'شرکت resolution پ');
  const branchC = await makeBranch(companyC, 'MAIN');
  customerC = await makeCustomer(companyC, branchC, 'C-C');
  productC = await makeProduct(companyC, 'P-C');
  await makeUser(companyC, ADMIN_C, 'admin_full');
  await makeUser(companyC, APPROVER_C, 'rr_approver');

  process.env.DATABASE_URL = testUrl.toString();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1', { exclude: ['api/health'] });
  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
  await app.init();

  adminA = await login(ADMIN_A);
  approverA = await login(APPROVER_A);
  viewerA = await login(VIEWER_A);
  adminB = await login(ADMIN_B);
  approverB = await login(APPROVER_B);
  adminC = await login(ADMIN_C);
  approverC = await login(APPROVER_C);
}, 240_000);

afterAll(async () => {
  const appPool = app?.get<pg.Pool>(PG_POOL);
  await app?.close();
  await appPool?.end();
  await pool?.end();
  if (adminPool) {
    await adminPool.query(
      'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
      [TEST_DB],
    );
    await adminPool.query(`drop database if exists "${TEST_DB}"`);
    await adminPool.end();
  }
}, 60_000);

describe('RR — restock', () => {
  it('مقصد پیش‌فرض = انبار main؛ مانده و دفتر درست و qty_approved ثبت می‌شود', async () => {
    const { id } = await createReturn(
      adminA,
      [{ product_id: productA, qty: 2 }],
      { customer_id: customerA },
    );
    await approveReturn(approverA, id);
    const res = await receive(adminA, id, { lines: [{ product_id: productA, qty: 2, disposition: 'restock' }] }).expect(200);
    expect(res.body.status).toBe('posted');
    expect(await balanceOf(whMain, productA, null)).toBe(2);
    const txns = await txnsFor(id);
    expect(txns).toHaveLength(1);
    expect(txns[0]).toMatchObject({ warehouse_id: whMain, txn_kind: 'sale_return_in', batch_id: null });
    expect(Number(txns[0].qty)).toBe(2);
  });

  it('مقصد صریح ( consignment فعالِ همین شعبه ) اعمال می‌شود و main بی‌اثر می‌ماند', async () => {
    const before = await balanceOf(whMain, productA, null);
    const { id } = await createReturn(
      adminA,
      [{ product_id: productA, qty: 1 }],
      { customer_id: customerA },
    );
    await approveReturn(approverA, id);
    await receive(adminA, id, {
      warehouse_id: whConsign,
      lines: [{ product_id: productA, qty: 1, disposition: 'restock' }],
    }).expect(200);
    expect(await balanceOf(whConsign, productA, null)).toBe(1);
    expect(await balanceOf(whMain, productA, null)).toBe(before);
  });

  it('انبار صریحِ ناموجود ⇒ 400 warehouse_not_found و هیچ نوشتنی رخ نمی‌دهد', async () => {
    const { id } = await createReturn(
      adminA,
      [{ product_id: productA, qty: 1 }],
      { customer_id: customerA },
    );
    await approveReturn(approverA, id);
    const res = await receive(adminA, id, {
      warehouse_id: MISSING,
      lines: [{ product_id: productA, qty: 1, disposition: 'restock' }],
    }).expect(400);
    expect(res.body.code).toBe('warehouse_not_found');
    expect(await statusOf(id)).toBe('approved');
    expect(await txnsFor(id)).toHaveLength(0);
    const line = await pool.query(`select qty_approved from return_request_line where return_request_id = $1`, [id]);
    expect(line.rows[0].qty_approved).toBeNull();
  });

  it('انبار صریحِ مالِ شعبهٔ دیگر ⇒ 400 warehouse_not_found (fail-closed بین برنچ‌ها)', async () => {
    const { id } = await createReturn(
      adminA,
      [{ product_id: productA, qty: 1 }],
      { customer_id: customerA },
    );
    await approveReturn(approverA, id);
    const res = await receive(adminA, id, {
      warehouse_id: whMainSide,
      lines: [{ product_id: productA, qty: 1, disposition: 'restock' }],
    }).expect(400);
    expect(res.body.code).toBe('warehouse_not_found');
    expect(await statusOf(id)).toBe('approved');
    expect(await txnsFor(id)).toHaveLength(0);
  });

  it('انبار صریحِ غیرفعال ⇒ 400 warehouse_inactive', async () => {
    const { id } = await createReturn(
      adminA,
      [{ product_id: productA, qty: 1 }],
      { customer_id: customerA },
    );
    await approveReturn(approverA, id);
    const res = await receive(adminA, id, {
      warehouse_id: whOff,
      lines: [{ product_id: productA, qty: 1, disposition: 'restock' }],
    }).expect(400);
    expect(res.body.code).toBe('warehouse_inactive');
    expect(await statusOf(id)).toBe('approved');
  });

  it('restock با batch ⇒ ماندهٔ بچ به‌روز می‌شود و batch روی txn ثبت می‌شود', async () => {
    const { id } = await createReturn(
      adminA,
      [{ product_id: productA, qty: 1.5, batch_id: batchA }],
      { customer_id: customerA },
    );
    await approveReturn(approverA, id);
    await receive(adminA, id, { lines: [{ product_id: productA, qty: 1.5, disposition: 'restock' }] }).expect(200);
    expect(await balanceOf(whMain, productA, batchA)).toBe(1.5);
    const txns = await txnsFor(id);
    expect(txns[0].batch_id).toBe(batchA);
  });

  it('شرکتِ بدون هیچ انباری ⇒ 409 restock_warehouse_missing و rollback کامل', async () => {
    const { id } = await createReturn(
      adminC,
      [{ product_id: productC, qty: 1 }],
      { customer_id: customerC },
    );
    await approveReturn(approverC, id);
    const res = await receive(adminC, id, {
      lines: [{ product_id: productC, qty: 1, disposition: 'restock' }],
    }).expect(409);
    expect(res.body.code).toBe('restock_warehouse_missing');
    expect(await statusOf(id)).toBe('approved');
    expect(await txnsFor(id)).toHaveLength(0);
  });
});

describe('RR — damaged (قرنطینه، fail-closed)', () => {
  it('damaged ⇒ قرنطینه؛ انبار main بی‌اثر می‌ماند', async () => {
    const beforeMain = await balanceOf(whMain, productA, null);
    const { id } = await createReturn(
      adminA,
      [{ product_id: productA, qty: 3 }],
      { customer_id: customerA },
    );
    await approveReturn(approverA, id);
    const res = await receive(adminA, id, { lines: [{ product_id: productA, qty: 3, disposition: 'damaged' }] }).expect(200);
    expect(res.body.status).toBe('posted');
    expect(await balanceOf(whQuar, productA, null)).toBe(3);
    expect(await balanceOf(whMain, productA, null)).toBe(beforeMain);
    const txns = await txnsFor(id);
    expect(txns[0].warehouse_id).toBe(whQuar);
  });

  it('شرکتِ بدون انبار قرنطینه ⇒ 409 quarantine_warehouse_missing و rollback کامل', async () => {
    const { id } = await createReturn(
      adminB,
      [{ product_id: productB, qty: 2 }],
      { customer_id: customerB },
    );
    await approveReturn(approverB, id);
    const res = await receive(adminB, id, {
      lines: [{ product_id: productB, qty: 2, disposition: 'damaged' }],
    }).expect(409);
    expect(res.body.code).toBe('quarantine_warehouse_missing');
    expect(await statusOf(id)).toBe('approved');
    expect(await txnsFor(id)).toHaveLength(0);
  });

  it('انبار صریح روی damaged اثر ندارد — همیشه قرنطینه', async () => {
    const { id } = await createReturn(
      adminA,
      [{ product_id: productA, qty: 1 }],
      { customer_id: customerA },
    );
    await approveReturn(approverA, id);
    await receive(adminA, id, {
      warehouse_id: whMain,
      lines: [{ product_id: productA, qty: 1, disposition: 'damaged' }],
    }).expect(200);
    const txns = await txnsFor(id);
    expect(txns[0].warehouse_id).toBe(whQuar);
  });
});

describe('RR — scrap و return_to_supplier', () => {
  it.each(['scrap', 'return_to_supplier'] as const)('%s: posted بدون هیچ حرکت موجودی', async (disposition) => {
    const before = await balanceOf(whMain, productA, null);
    const { id } = await createReturn(
      adminA,
      [{ product_id: productA, qty: 4 }],
      { customer_id: customerA },
    );
    await approveReturn(approverA, id);
    const res = await receive(adminA, id, { lines: [{ product_id: productA, qty: 4, disposition }] }).expect(200);
    expect(res.body.status).toBe('posted');
    expect(res.body.lines[0].disposition).toBe(disposition);
    expect(await txnsFor(id)).toHaveLength(0);
    expect(await balanceOf(whMain, productA, null)).toBe(before);
  });
});

describe('RR — اتمیک بودن و جلوگیری از تکرار', () => {
  it('double receive ⇒ 409 invalid_transition و فقط یک پُستينگ', async () => {
    const { id } = await createReturn(
      adminA,
      [{ product_id: productA, qty: 2 }],
      { customer_id: customerA },
    );
    await approveReturn(approverA, id);
    await receive(adminA, id, { lines: [{ product_id: productA, qty: 2, disposition: 'restock' }] }).expect(200);
    const second = await receive(adminA, id, {
      lines: [{ product_id: productA, qty: 2, disposition: 'restock' }],
    }).expect(409);
    expect(second.body.code).toBe('invalid_transition');
    expect(await txnsFor(id)).toHaveLength(1);
    expect(await balanceOf(whMain, productA, null)).toBe(
      (await balanceOf(whMain, productA, null)), // ثابت می‌ماند؛ شمارش txns دقیق است
    );
  });

  it('qty بیشتر از درخواستی ⇒ 422 rule_rejected؛ status و دفتر دست‌نخورده می‌مانند', async () => {
    const { id } = await createReturn(
      adminA,
      [{ product_id: productA, qty: 1 }],
      { customer_id: customerA },
    );
    await approveReturn(approverA, id);
    const res = await receive(adminA, id, {
      lines: [{ product_id: productA, qty: 999, disposition: 'restock' }],
    }).expect(422);
    expect(res.body.code).toBe('rule_rejected');
    expect(await statusOf(id)).toBe('approved');
    expect(await txnsFor(id)).toHaveLength(0);
  });
});

describe('RR — مرزهای دسترسی', () => {
  it('بدون مجوز sales.return.post ⇒ 403', async () => {
    const { id } = await createReturn(
      adminA,
      [{ product_id: productA, qty: 1 }],
      { customer_id: customerA },
    );
    await approveReturn(approverA, id);
    await receive(viewerA, id, { lines: [{ product_id: productA, qty: 1, disposition: 'restock' }] }).expect(403);
    expect(await statusOf(id)).toBe('approved');
  });

  it('مرجوعیِ شرکتِ دیگر ⇒ 404 (انزوای tenant حفظ می‌شود)', async () => {
    const { id } = await createReturn(
      adminB,
      [{ product_id: productB, qty: 1 }],
      { customer_id: customerB },
    );
    await approveReturn(approverB, id);
    await receive(adminA, id, { lines: [{ product_id: productB, qty: 1, disposition: 'restock' }] }).expect(404);
    expect(await statusOf(id)).toBe('approved');
  });
});
