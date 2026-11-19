import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';
import request from 'supertest';
import { parse } from 'yaml';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import type { ValidateFunction } from 'ajv';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { PG_POOL } from '../src/database/database.module';
import { validationPipeOptions } from '../src/common/validation';
import { hashPassword } from '../src/modules/identity-rbac/password';

/**
 * S8 — پوشش زمان‌اجرا از راه HTTP برای چهار نویسندهٔ دفتر موجودی و گزارش تطبیق.
 *
 * ۱) ممیزی دقیقاً یک‌بار برای هر مسیر (GRN، اصلاحیه، انبارگردانی، برگشت)، با شرکت/شعبه/انبار/کالا،
 *    شناسهٔ سطر دفتر، هویت کاربر، request id، و مانده‌های قبل/بعد درست.
 * ۲) شکستِ ممیزی در هر مسیر (تزریقِ خطا روی audit_log) ⇒ سند، مانده و دفتر همگی بدون تغییر.
 * ۳) GET /stock/reconciliation: احراز هویت، مجوز inventory.stock.view، جداسازی شرکت،
 *    فیلتر انبار، ساختار پاسخ طبق قرارداد OpenAPI، و عدم تغییر داده.
 *
 * یادداشت هویت: اپ در این آزمون با DATABASE_URL (مالک) اجرا می‌شود، همان الگوی سایر آزمون‌های
 * API. بنابراین RLS در این فایل اثبات نمی‌شود؛ جداسازیِ RLS در ledger-integrity و
 * ledger-partition-protection با SET LOCAL ROLE dms_app اثبات می‌شود.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_inventory_ledger_http_test';
const PSQL = process.env.PSQL ?? 'psql';
const SPEC_FILE = path.join(ROOT, 'packages', 'contracts', 'openapi.yaml');
const MISSING = '11111111-1111-4111-8111-111111111111';

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

const PASSWORD = 'S8ledger!pass1';

let adminPool: pg.Pool;
let pool: pg.Pool;
let app: INestApplication;
let spec: { paths: Record<string, Record<string, any>>; [k: string]: unknown };
let ajv: Ajv2020;

interface Tenant {
  companyId: string;
  branchId: string;
  mainWh: string;
  secondWh: string;
  productId: string;
  supplierId: string;
  customerId: string;
  adminUser: string;
  adminToken: string;
  adminUserId: string;
  approverUser: string;
  approverToken: string;
  viewerUser: string;
  viewerToken: string;
}

let A: Tenant;
let B: Tenant;

const login = async (username: string): Promise<string> => {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ username, password: PASSWORD })
    .expect(200);
  return res.body.access_token as string;
};

const reqWithToken = (token: string | null) => {
  const base = request(app.getHttpServer());
  return {
    get: (url: string) => (token ? base.get(url).set('Authorization', `Bearer ${token}`) : base.get(url)),
    post: (url: string) => (token ? base.post(url).set('Authorization', `Bearer ${token}`) : base.post(url)),
    patch: (url: string) => (token ? base.patch(url).set('Authorization', `Bearer ${token}`) : base.patch(url)),
  };
};

const resolvePointer = (doc: unknown, ref: string): any =>
  ref
    .replace(/^#\//, '')
    .split('/')
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((node, seg) => (node == null ? node : node[seg]), doc);

/** اعتبارسنجی بدنهٔ پاسخ با اسکیمای قرارداد OpenAPI (همان الگوی سایر آزمون‌های API). */
const expectBodyMatchesSchema = (method: string, contractPath: string, status: number, body: unknown): void => {
  const responses = spec.paths[contractPath]?.[method]?.responses ?? {};
  expect(Object.keys(responses), `کد ${status} برای ${method} ${contractPath} در قرارداد نیست`).toContain(String(status));
  const responseNode = responses[String(status)];
  const baseRef: string =
    typeof responseNode.$ref === 'string'
      ? responseNode.$ref
      : `#/paths/${contractPath.replace(/\//g, '~1')}/${method}/responses/${status}`;
  const resolved = resolvePointer(spec, baseRef);
  const schemaNode = resolved?.content?.['application/json']?.schema;
  if (!schemaNode) return;
  const pointer = `${baseRef}/content/application~1json/schema`;
  const validate = ajv.getSchema(`openapi${pointer}`) as ValidateFunction | undefined;
  expect(validate, `اسکیمای ${pointer} در ajv کامپایل نشد`).toBeTruthy();
  const ok = validate!(body);
  if (!ok) console.error(JSON.stringify(validate!.errors, null, 2));
  expect(ok, `بدنه با اسکیمای قرارداد نمی‌خواند (${pointer})`).toBe(true);
};

async function seedTenant(code: string, label: string, withApprover: boolean): Promise<Tenant> {
  const company = await pool.query<{ id: string }>(
    `insert into company (code, legal_name) values ($1, $2) returning id`,
    [code, `شرکت ${label}`],
  );
  const companyId = company.rows[0].id;
  const branch = await pool.query<{ id: string }>(
    `insert into branch (company_id, code, name) values ($1, 'MAIN', 'شعبه') returning id`,
    [companyId],
  );
  const branchId = branch.rows[0].id;
  const mainWh = (
    await pool.query<{ id: string }>(
      `insert into warehouse (branch_id, code, name, kind) values ($1, 'MAIN', 'انبار اصلی', 'main') returning id`,
      [branchId],
    )
  ).rows[0].id;
  const secondWh = (
    await pool.query<{ id: string }>(
      `insert into warehouse (branch_id, code, name, kind) values ($1, 'WH2', 'انبار دوم', 'transit') returning id`,
      [branchId],
    )
  ).rows[0].id;
  const category = await pool.query<{ id: string }>(
    `insert into product_category (company_id, code, name) values ($1, 'CAT', 'دسته') returning id`,
    [companyId],
  );
  const productId = (
    await pool.query<{ id: string }>(
      `insert into product (company_id, code, name, category_id, base_uom_id)
       values ($1, 'PRD', 'کالای ${code}', $2, (select id from uom where code = 'LHPCS')) returning id`,
      [companyId, category.rows[0].id],
    )
  ).rows[0].id;
  const supPerson = await pool.query<{ id: string }>(
    `insert into person (company_id, code, legal_type, legal_name) values ($1, 'SUP', 'legal', 'تأمین‌کننده') returning id`,
    [companyId],
  );
  const supplierId = (
    await pool.query<{ id: string }>(
      `insert into supplier (company_id, person_id, code) values ($1, $2, 'S-1') returning id`,
      [companyId, supPerson.rows[0].id],
    )
  ).rows[0].id;
  const custPerson = await pool.query<{ id: string }>(
    `insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, 'CUST', 'natural', 'مشتری', 'آزمون') returning id`,
    [companyId],
  );
  const customerId = (
    await pool.query<{ id: string }>(
      `insert into customer (person_id, branch_id, code, channel) values ($1, $2, 'C-1', 'retail') returning id`,
      [custPerson.rows[0].id, branchId],
    )
  ).rows[0].id;

  const adminUser = `lh_admin_${code.toLowerCase()}`;
  const adminPerson = await pool.query<{ id: string }>(
    `insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, 'ADM', 'natural', 'مدیر', 'انبار') returning id`,
    [companyId],
  );
  const adminUserId = (
    await pool.query<{ id: string }>(
      `insert into app_user (person_id, username, password_hash, access_level)
       values ($1, $2, $3, 'web') returning id`,
      [adminPerson.rows[0].id, adminUser, await hashPassword(PASSWORD)],
    )
  ).rows[0].id;
  const adminRole = await pool.query<{ id: string }>(
    `insert into role (company_id, code, name) values ($1, 'admin_full', 'مدیر کامل') returning id`,
    [companyId],
  );
  await pool.query(`insert into role_permission (role_id, permission_code) select $1, code from permission`, [
    adminRole.rows[0].id,
  ]);
  await pool.query(`insert into user_role (app_user_id, role_id) values ($1, $2)`, [adminUserId, adminRole.rows[0].id]);

  // بیننده: فقط مشاهدهٔ کالا؛ فاقد inventory.stock.view
  const viewerUser = `lh_view_${code.toLowerCase()}`;
  const viewerPerson = await pool.query<{ id: string }>(
    `insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, 'VW', 'natural', 'بیننده', 'آزمون') returning id`,
    [companyId],
  );
  const viewerUserId = (
    await pool.query<{ id: string }>(
      `insert into app_user (person_id, username, password_hash, access_level)
       values ($1, $2, $3, 'web') returning id`,
      [viewerPerson.rows[0].id, viewerUser, await hashPassword(PASSWORD)],
    )
  ).rows[0].id;
  const viewerRole = await pool.query<{ id: string }>(
    `insert into role (company_id, code, name) values ($1, 'viewer', 'بیننده') returning id`,
    [companyId],
  );
  await pool.query(
    `insert into role_permission (role_id, permission_code) select $1, code from permission where code = 'master.product.view'`,
    [viewerRole.rows[0].id],
  );
  await pool.query(`insert into user_role (app_user_id, role_id) values ($1, $2)`, [viewerUserId, viewerRole.rows[0].id]);

  let approverUser = '';
  if (withApprover) {
    const apprUser = `lh_appr_${code.toLowerCase()}`;
    const apprPerson = await pool.query<{ id: string }>(
      `insert into person (company_id, code, legal_type, first_name, last_name)
       values ($1, 'APR', 'natural', 'تأیید', 'کننده') returning id`,
      [companyId],
    );
    const apprUserId = (
      await pool.query<{ id: string }>(
        `insert into app_user (person_id, username, password_hash, access_level)
         values ($1, $2, $3, 'web') returning id`,
        [apprPerson.rows[0].id, apprUser, await hashPassword(PASSWORD)],
      )
    ).rows[0].id;
    const apprRole = await pool.query<{ id: string }>(
      `insert into role (company_id, code, name) values ($1, 'rt_approver', 'تأییدکننده') returning id`,
      [companyId],
    );
    await pool.query(`insert into role_permission (role_id, permission_code) values ($1, 'sales.return.approve')`, [
      apprRole.rows[0].id,
    ]);
    await pool.query(`insert into user_role (app_user_id, role_id) values ($1, $2)`, [apprUserId, apprRole.rows[0].id]);
    approverUser = apprUser;
  }

  return {
    companyId,
    branchId,
    mainWh,
    secondWh,
    productId,
    supplierId,
    customerId,
    adminUser,
    adminToken: '',
    adminUserId,
    approverUser,
    approverToken: '',
    viewerUser,
    viewerToken: '',
  };
}

/** مانده‌ی فعلی یک کالا/انبار از جدول مانده (رشتهٔ numeric) یا null. */
async function balance(warehouseId: string, productId: string): Promise<string | null> {
  const { rows } = await pool.query<{ q: string }>(
    `select qty_on_hand::text as q from stock_balance where warehouse_id = $1 and product_id = $2`,
    [warehouseId, productId],
  );
  return rows[0]?.q ?? null;
}

/** تعداد سطرهای دفتر برای یک منبع (برای اثبات عدم ثبت پس از شکست). */
async function txnCount(sourceType: string, sourceId: string): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `select count(*)::text as n from inventory_txn where source_type = $1 and source_id = $2`,
    [sourceType, sourceId],
  );
  return Number(rows[0].n);
}

/** ممیزی‌های یک سطر دفتر با شناسهٔ آن سطر. */
async function auditForTxn(txnId: string) {
  const { rows } = await pool.query<{
    company_id: string;
    actor_user_id: string;
    action: string;
    request_id: string;
    before_data: Record<string, string>;
    after_data: Record<string, any>;
  }>(
    `select company_id, actor_user_id, action, request_id, before_data, after_data
       from audit_log
      where entity_type = 'inventory_txn' and after_data->>'inventory_txn_id' = $1`,
    [txnId],
  );
  return rows;
}

async function txnsFor(sourceType: string, sourceId: string) {
  const { rows } = await pool.query<{
    id: string;
    branch_id: string;
    warehouse_id: string;
    product_id: string;
    txn_kind: string;
    qty: string;
    source_line_id: string | null;
    posted_by: string | null;
  }>(
    `select id::text, branch_id, warehouse_id, product_id, txn_kind, qty::text, source_line_id, posted_by
       from inventory_txn where source_type = $1 and source_id = $2 order by id`,
    [sourceType, sourceId],
  );
  return rows;
}

/**
 * شناسهٔ سند اصلاحیه از روی ممیزی با request id مشخص (پاسخ API فیلد id ندارد).
 * دقیق است: به «آخرین سند» تکیه نمی‌کند.
 */
async function adjustmentHeaderByRequestId(reqId: string): Promise<string> {
  const { rows } = await pool.query<{ source_id: string }>(
    `select t.source_id::text as source_id
       from audit_log a
       join inventory_txn t on t.id = (a.after_data->>'inventory_txn_id')::bigint
      where a.entity_type = 'inventory_txn' and a.request_id = $1 and t.source_type = 'stock_adjustment'`,
    [reqId],
  );
  expect(rows).toHaveLength(1);
  return rows[0].source_id;
}

/** فعال/غیرفعال کردن خطای تزریقی روی ممیزی دفتر (فقط در این پایگاه‌داده‌ی موقت). */
const setAuditFault = (on: boolean) =>
  pool.query(`update test_audit_fault set enabled = $1`, [on]);

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
  execFileSync(PSQL, [...psqlBase, '-d', TEST_DB, '-1', '-q', ...files], { env: psqlEnv, stdio: 'pipe' });

  pool = new pg.Pool({ connectionString: testUrl.toString(), max: 1 });

  // خطای تزریقی ممیزی: فقط وقتی فعال است و منبع inventory_txn است، درج audit_log شکست می‌خورد.
  await pool.query(`create table test_audit_fault (enabled boolean not null)`);
  await pool.query(`insert into test_audit_fault (enabled) values (false)`);
  await pool.query(`
    create or replace function fn_test_audit_fault() returns trigger
    language plpgsql as $$
    begin
      if new.entity_type = 'inventory_txn' and (select enabled from test_audit_fault limit 1) then
        raise exception 'simulated audit failure (test fault injection)';
      end if;
      return new;
    end $$;
  `);
  await pool.query(`create trigger trg_test_audit_fault before insert on audit_log for each row execute function fn_test_audit_fault()`);

  await pool.query(`insert into uom (code, title) values ('LHPCS', 'عدد')`);
  A = await seedTenant('LHA', 'ledger-A', true);
  B = await seedTenant('LHB', 'ledger-B', false);

  process.env.DATABASE_URL = testUrl.toString();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1', { exclude: ['api/health'] });
  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
  await app.init();

  for (const t of [A, B]) {
    t.adminToken = await login(t.adminUser);
    t.viewerToken = await login(t.viewerUser);
    if (t.approverUser) t.approverToken = await login(t.approverUser);
  }

  spec = parse(readFileSync(SPEC_FILE, 'utf8')) as typeof spec;
  ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  ajv.addSchema(spec, 'openapi');
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
}, 180_000);

// ---------------------------------------------------------------------------
describe('S8 HTTP ۱: رسید انبار خرید (GRN) — ممیزی دقیق', () => {
  const reqId = crypto.randomUUID();
  let grnId = '';
  let txnId = '';

  it('ثبت و تأیید: یک سطر دفتر و دقیقاً یک ممیزی با هویت، request id و مانده‌های درست', async () => {
    const created = await reqWithToken(A.adminToken).post('/api/v1/goods-receipts').send({
      branch_id: A.branchId,
      supplier_id: A.supplierId,
      warehouse_id: A.mainWh,
      lines: [{ product_id: A.productId, qty_received: 10, unit_cost: '100' }],
    });
    expect(created.status).toBe(201);
    grnId = created.body.id;

    const res = await reqWithToken(A.adminToken).post(`/api/v1/goods-receipts/${grnId}/post`).set('X-Request-Id', reqId);
    expect(res.status).toBe(200);
    expectBodyMatchesSchema('post', '/goods-receipts/{id}/post', 200, res.body);

    const txns = await txnsFor('goods_receipt', grnId);
    expect(txns).toHaveLength(1);
    txnId = txns[0].id;
    expect(txns[0]).toMatchObject({
      branch_id: A.branchId,
      warehouse_id: A.mainWh,
      product_id: A.productId,
      txn_kind: 'purchase_in',
      qty: '10.0000',
      posted_by: A.adminUserId,
    });

    const audits = await auditForTxn(txnId);
    expect(audits).toHaveLength(1);
    const a = audits[0];
    expect(a).toMatchObject({
      company_id: A.companyId,
      actor_user_id: A.adminUserId,
      action: 'create',
      request_id: reqId,
    });
    expect(a.after_data).toMatchObject({
      domain: 'inventory',
      company_id: A.companyId,
      branch_id: A.branchId,
      warehouse_id: A.mainWh,
      product_id: A.productId,
      inventory_txn_id: txnId,
      txn_kind: 'purchase_in',
      direction: 'in',
      qty: '10',
      source_type: 'goods_receipt',
      source_id: grnId,
      source_line_id: txns[0].source_line_id,
    });
    expect(Number(a.before_data.qty_on_hand)).toBe(0);
    expect(Number(a.after_data.qty_on_hand)).toBe(10);
    expect(await balance(A.mainWh, A.productId)).toBe('10.0000');
  });

  it('شکست ممیزی: سند پست‌نشده، مانده و دفتر بدون تغییر (rollback یکپارچه)', async () => {
    const created = await reqWithToken(A.adminToken).post('/api/v1/goods-receipts').send({
      branch_id: A.branchId,
      supplier_id: A.supplierId,
      warehouse_id: A.mainWh,
      lines: [{ product_id: A.productId, qty_received: 4, unit_cost: '100' }],
    });
    const failingId = created.body.id as string;
    const before = await balance(A.mainWh, A.productId);

    await setAuditFault(true);
    try {
      const res = await reqWithToken(A.adminToken).post(`/api/v1/goods-receipts/${failingId}/post`);
      expect(res.status).toBeGreaterThanOrEqual(400);
    } finally {
      await setAuditFault(false);
    }

    expect(await txnCount('goods_receipt', failingId)).toBe(0);
    expect(await balance(A.mainWh, A.productId)).toBe(before);
    const head = await pool.query<{ status: string }>(`select status from goods_receipt where id = $1`, [failingId]);
    expect(head.rows[0].status).toBe('draft');

    // کنترل مثبت: سند هنوز پیش‌نویس است و تلاش مجدد پس از رفع خطا باید یک‌بار ثبت کند
    const retry = await reqWithToken(A.adminToken).post(`/api/v1/goods-receipts/${failingId}/post`);
    expect(retry.status).toBe(200);
    const txns = await txnsFor('goods_receipt', failingId);
    expect(txns).toHaveLength(1);
    expect(await auditForTxn(txns[0].id)).toHaveLength(1);
    expect(Number(await balance(A.mainWh, A.productId))).toBe(Number(before) + 4);
  });
});

// ---------------------------------------------------------------------------
describe('S8 HTTP ۲: اصلاحیهٔ موجودی — ممیزی دقیق و rollback', () => {
  let adjId = '';
  let txnIn = '';

  it('افزایش ۴ واحد: before=مانده‌ی پیش از حرکت، after=before+4 و ممیزی دقیقاً یک‌بار', async () => {
    const before = Number(await balance(A.mainWh, A.productId));
    const reqId = crypto.randomUUID();
    const res = await reqWithToken(A.adminToken)
      .post('/api/v1/stock/adjustments')
      .set('X-Request-Id', reqId)
      .send({ warehouse_id: A.mainWh, product_id: A.productId, qty_delta: 4, reason_code: 'count_fix' });
    expect(res.status).toBe(201);
    expectBodyMatchesSchema('post', '/stock/adjustments', 201, res.body);
    adjId = await adjustmentHeaderByRequestId(reqId);

    const txns = await txnsFor('stock_adjustment', adjId);
    expect(txns).toHaveLength(1);
    txnIn = txns[0].id;
    expect(txns[0]).toMatchObject({ txn_kind: 'adjust_in', qty: '4.0000', warehouse_id: A.mainWh, posted_by: A.adminUserId });

    const audits = await auditForTxn(txnIn);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ company_id: A.companyId, actor_user_id: A.adminUserId, request_id: reqId });
    expect(audits[0].after_data).toMatchObject({
      branch_id: A.branchId,
      warehouse_id: A.mainWh,
      product_id: A.productId,
      inventory_txn_id: txnIn,
      txn_kind: 'adjust_in',
      direction: 'in',
      source_type: 'stock_adjustment',
      source_id: adjId,
    });
    expect(Number(audits[0].before_data.qty_on_hand)).toBe(before);
    expect(Number(audits[0].after_data.qty_on_hand)).toBe(before + 4);
    expect(await balance(A.mainWh, A.productId)).toBe(String(before + 4) + '.0000');
  });

  it('کاهش ۳ واحد: direction=out، after=before-3', async () => {
    const before = Number(await balance(A.mainWh, A.productId));
    const reqId = crypto.randomUUID();
    const res = await reqWithToken(A.adminToken)
      .post('/api/v1/stock/adjustments')
      .set('X-Request-Id', reqId)
      .send({ warehouse_id: A.mainWh, product_id: A.productId, qty_delta: -3, reason_code: 'damage' });
    expect(res.status).toBe(201);
    const txns = await txnsFor('stock_adjustment', await adjustmentHeaderByRequestId(reqId));
    expect(txns).toHaveLength(1);
    const audits = await auditForTxn(txns[0].id);
    expect(audits).toHaveLength(1);
    expect(audits[0].request_id).toBe(reqId);
    expect(audits[0].after_data).toMatchObject({ txn_kind: 'adjust_out', direction: 'out', qty: '-3' });
    expect(Number(audits[0].before_data.qty_on_hand)).toBe(before);
    expect(Number(audits[0].after_data.qty_on_hand)).toBe(before - 3);
  });

  it('شکست ممیزی: هیچ سند/سطر دفتر/تغییر مانده باقی نمی‌ماند؛ تلاش مجدد پس از رفع خطا موفق است', async () => {
    const before = await balance(A.mainWh, A.productId);
    const headersBefore = await pool.query<{ n: string }>(`select count(*)::text as n from stock_adjustment`);
    await setAuditFault(true);
    try {
      const res = await reqWithToken(A.adminToken)
        .post('/api/v1/stock/adjustments')
        .send({ warehouse_id: A.mainWh, product_id: A.productId, qty_delta: 5, reason_code: 'count_fix' });
      expect(res.status).toBeGreaterThanOrEqual(400);
    } finally {
      await setAuditFault(false);
    }
    expect(await balance(A.mainWh, A.productId)).toBe(before);
    const headersAfter = await pool.query<{ n: string }>(`select count(*)::text as n from stock_adjustment`);
    expect(headersAfter.rows[0].n).toBe(headersBefore.rows[0].n); // سند هم rollback شده

    // کنترل مثبت: همان درخواست بدون خطای تزریقی باید موفق و کاملاً یک‌بار ثبت شود
    const retryReq = crypto.randomUUID();
    const retry = await reqWithToken(A.adminToken)
      .post('/api/v1/stock/adjustments')
      .set('X-Request-Id', retryReq)
      .send({ warehouse_id: A.mainWh, product_id: A.productId, qty_delta: 5, reason_code: 'count_fix' });
    expect(retry.status).toBe(201);
    const txns = await txnsFor('stock_adjustment', await adjustmentHeaderByRequestId(retryReq));
    expect(txns).toHaveLength(1);
    expect(await auditForTxn(txns[0].id)).toHaveLength(1);
    expect(Number(await balance(A.mainWh, A.productId))).toBe(Number(before) + 5);
  });
});

// ---------------------------------------------------------------------------
describe('S8 HTTP ۳: انبارگردانی — ممیزی دقیق و rollback', () => {
  let stId = '';
  let txnId = '';
  const reqId = crypto.randomUUID();

  it('شمارش +۲ نسبت به مانده‌ی سیستم: count_gain با before=system after=system+2 و ممیزی دقیقاً یک‌بار', async () => {
    const system = Number(await balance(A.mainWh, A.productId));
    const created = await reqWithToken(A.adminToken).post('/api/v1/stocktakes').send({ warehouse_id: A.mainWh });
    expect(created.status).toBe(201);
    stId = created.body.id;

    const patched = await reqWithToken(A.adminToken)
      .patch(`/api/v1/stocktakes/${stId}`)
      .send({ lines: [{ product_id: A.productId, counted_qty: system + 2 }] });
    expect(patched.status).toBe(200);

    const res = await reqWithToken(A.adminToken).post(`/api/v1/stocktakes/${stId}/submit`).set('X-Request-Id', reqId);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('posted');

    const txns = await txnsFor('stock_count', stId);
    expect(txns).toHaveLength(1);
    txnId = txns[0].id;
    expect(txns[0]).toMatchObject({ txn_kind: 'count_gain', warehouse_id: A.mainWh, posted_by: A.adminUserId });
    expect(Number(txns[0].qty)).toBe(2);

    const audits = await auditForTxn(txnId);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ company_id: A.companyId, actor_user_id: A.adminUserId, request_id: reqId });
    expect(audits[0].after_data).toMatchObject({
      branch_id: A.branchId,
      warehouse_id: A.mainWh,
      product_id: A.productId,
      inventory_txn_id: txnId,
      txn_kind: 'count_gain',
      direction: 'in',
      source_type: 'stock_count',
      source_id: stId,
    });
    expect(Number(audits[0].before_data.qty_on_hand)).toBe(system);
    expect(Number(audits[0].after_data.qty_on_hand)).toBe(system + 2);
    expect(await balance(A.mainWh, A.productId)).toBe(String(system + 2) + '.0000');
  });

  it('شکست ممیزی هنگام ثبت انبارگردانی: وضعیت سند و مانده بدون تغییر', async () => {
    const created = await reqWithToken(A.adminToken).post('/api/v1/stocktakes').send({ warehouse_id: A.mainWh });
    const failingId = created.body.id as string;
    await reqWithToken(A.adminToken)
      .patch(`/api/v1/stocktakes/${failingId}`)
      .send({ lines: [{ product_id: A.productId, counted_qty: Number(await balance(A.mainWh, A.productId)) + 2 }] });
    const before = await balance(A.mainWh, A.productId);

    await setAuditFault(true);
    try {
      const res = await reqWithToken(A.adminToken).post(`/api/v1/stocktakes/${failingId}/submit`);
      expect(res.status).toBeGreaterThanOrEqual(400);
    } finally {
      await setAuditFault(false);
    }
    expect(await txnCount('stock_count', failingId)).toBe(0);
    expect(await balance(A.mainWh, A.productId)).toBe(before);
    const head = await pool.query<{ status: string }>(`select status from stock_count where id = $1`, [failingId]);
    expect(head.rows[0].status).not.toBe('posted');

    // کنترل مثبت: تلاش مجدد پس از رفع خطا، یک سطر دفتر و یک ممیزی ایجاد می‌کند
    const retry = await reqWithToken(A.adminToken).post(`/api/v1/stocktakes/${failingId}/submit`);
    expect(retry.status).toBe(200);
    const txns = await txnsFor('stock_count', failingId);
    expect(txns).toHaveLength(1);
    expect(await auditForTxn(txns[0].id)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
describe('S8 HTTP ۴: بازگشت کالا (restock) — ممیزی دقیق و rollback', () => {
  const reqId = crypto.randomUUID();
  let retId = '';
  let txnId = '';

  const newApprovedReturn = async (qty: number): Promise<string> => {
    const created = await reqWithToken(A.adminToken).post('/api/v1/returns').send({
      customer_id: A.customerId,
      reason_code: 'damaged',
      lines: [{ product_id: A.productId, qty }],
    });
    expect(created.status).toBe(201);
    const approved = await reqWithToken(A.approverToken).post(`/api/v1/returns/${created.body.id}/approve`);
    expect(approved.status).toBe(200);
    return created.body.id as string;
  };

  it('بازگشت ۲ عدد restock: sale_return_in با before=مانده‌ی پیش از دریافت و after=before+2، ممیزی دقیقاً یک‌بار', async () => {
    retId = await newApprovedReturn(2);
    const before = Number(await balance(A.mainWh, A.productId));

    const res = await reqWithToken(A.adminToken)
      .post(`/api/v1/returns/${retId}/receive`)
      .set('X-Request-Id', reqId)
      .send({ lines: [{ product_id: A.productId, qty: 2, disposition: 'restock' }] });
    expect(res.status).toBe(200);
    expectBodyMatchesSchema('post', '/returns/{id}/receive', 200, res.body);
    expect(res.body.status).toBe('posted');

    const txns = await txnsFor('return_request', retId);
    expect(txns).toHaveLength(1);
    txnId = txns[0].id;
    expect(txns[0]).toMatchObject({ txn_kind: 'sale_return_in', qty: '2.0000', warehouse_id: A.mainWh, posted_by: A.adminUserId });

    const audits = await auditForTxn(txnId);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ company_id: A.companyId, actor_user_id: A.adminUserId, request_id: reqId });
    expect(audits[0].after_data).toMatchObject({
      branch_id: A.branchId,
      warehouse_id: A.mainWh,
      product_id: A.productId,
      inventory_txn_id: txnId,
      txn_kind: 'sale_return_in',
      direction: 'in',
      source_type: 'return_request',
      source_id: retId,
    });
    expect(Number(audits[0].before_data.qty_on_hand)).toBe(before);
    expect(Number(audits[0].after_data.qty_on_hand)).toBe(before + 2);
    expect(await balance(A.mainWh, A.productId)).toBe(String(before + 2) + '.0000');
  });

  it('شکست ممیزی هنگام دریافت: بازگشت پست‌نشده، هیچ حرکتی و مانده بدون تغییر', async () => {
    const failingId = await newApprovedReturn(1);
    const before = await balance(A.mainWh, A.productId);

    await setAuditFault(true);
    try {
      const res = await reqWithToken(A.adminToken)
        .post(`/api/v1/returns/${failingId}/receive`)
        .send({ lines: [{ product_id: A.productId, qty: 1, disposition: 'restock' }] });
      expect(res.status).toBeGreaterThanOrEqual(400);
    } finally {
      await setAuditFault(false);
    }
    expect(await txnCount('return_request', failingId)).toBe(0);
    expect(await balance(A.mainWh, A.productId)).toBe(before);
    const head = await pool.query<{ status: string }>(`select status from return_request where id = $1`, [failingId]);
    expect(head.rows[0].status).toBe('approved');

    // کنترل مثبت: دریافت مجدد پس از رفع خطا، یک سطر دفتر و یک ممیزی ایجاد می‌کند
    const retry = await reqWithToken(A.adminToken)
      .post(`/api/v1/returns/${failingId}/receive`)
      .send({ lines: [{ product_id: A.productId, qty: 1, disposition: 'restock' }] });
    expect(retry.status).toBe(200);
    const txns = await txnsFor('return_request', failingId);
    expect(txns).toHaveLength(1);
    expect(await auditForTxn(txns[0].id)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
describe('S8 HTTP ۵: GET /stock/reconciliation', () => {
  // وضعیت دادهٔ شرکت A پس از بخش‌های بالا (فقط ثبت‌های موفق در دفتر):
  //  - mainWh/product: دفتر = 10 + 4 − 3 + 2 + 2 = 15 و مانده = 15 ⇒ بدون مغایرت دفتر؛
  //    qty_reserved=2 بدون رزرو فعال ⇒ missing_reservation_functionality
  //  - secondWh/product: مانده 3 بدون سابقهٔ دفتر ⇒ historical_data_limitation
  // شرکت B: یک حرکت سازگار (دفتر و مانده برابر ۶) ⇒ بدون مغایرت.
  beforeAll(async () => {
    await pool.query(
      `insert into stock_balance (warehouse_id, product_id, qty_on_hand) values ($1, $2, 3)`,
      [A.secondWh, A.productId],
    );
    await pool.query(
      `update stock_balance set qty_reserved = 2 where warehouse_id = $1 and product_id = $2`,
      [A.mainWh, A.productId],
    );
    // شرکت B: دفتر و مانده سازگار
    await pool.query(
      `insert into inventory_txn (branch_id, warehouse_id, product_id, txn_kind, qty, unit_cost, source_type, source_id)
       values ($1, $2, $3, 'purchase_in', 6, 0, 'goods_receipt', gen_random_uuid())`,
      [B.branchId, B.mainWh, B.productId],
    );
    await pool.query(
      `insert into stock_balance (warehouse_id, product_id, qty_on_hand) values ($1, $2, 6)`,
      [B.mainWh, B.productId],
    );
  });

  it('بدون توکن: 401 و با توکن بدون مجوز: 403', async () => {
    const anon = await reqWithToken(null).get('/api/v1/stock/reconciliation');
    expect(anon.status).toBe(401);
    expectBodyMatchesSchema('get', '/stock/reconciliation', 401, anon.body);

    const noPerm = await reqWithToken(A.viewerToken).get('/api/v1/stock/reconciliation');
    expect(noPerm.status).toBe(403);
    expectBodyMatchesSchema('get', '/stock/reconciliation', 403, noPerm.body);
  });

  it('شناسهٔ انبار نامعتبر: 400', async () => {
    const bad = await reqWithToken(A.adminToken).get('/api/v1/stock/reconciliation?warehouse_id=abc');
    expect(bad.status).toBe(400);
    expectBodyMatchesSchema('get', '/stock/reconciliation', 400, bad.body);
  });

  it('شرکت A: ساختار قرارداد، طبقه‌بندی، و هیچ کلیدی از شرکت B', async () => {
    const res = await reqWithToken(A.adminToken).get('/api/v1/stock/reconciliation');
    expect(res.status).toBe(200);
    expectBodyMatchesSchema('get', '/stock/reconciliation', 200, res.body);

    expect(res.body).toMatchObject({ company_id: A.companyId, domain: 'inventory', mode: 'read_only', warehouse_id: null });
    expect(res.body.findings.every((f: { company_id: string }) => f.company_id === A.companyId)).toBe(true);
    expect(res.body.findings.some((f: { warehouse_id: string }) => f.warehouse_id === B.mainWh)).toBe(false);

    const hist = res.body.findings.find((f: any) => f.warehouse_id === A.secondWh && f.metric === 'qty_on_hand');
    expect(hist).toMatchObject({ classification: 'historical_data_limitation', severity: 'medium', ledger_qty: 0, recorded_balance: 3, difference: 3 });

    const reserved = res.body.findings.find((f: any) => f.warehouse_id === A.mainWh && f.metric === 'qty_reserved');
    expect(reserved).toMatchObject({ classification: 'missing_reservation_functionality', severity: 'medium', recorded_balance: 2, difference: 2 });

    // مانده/دفتر mainWh سازگار است
    expect(res.body.findings.some((f: any) => f.warehouse_id === A.mainWh && f.metric === 'qty_on_hand')).toBe(false);
    expect(res.body.summary.byClassification.historical_data_limitation).toBe(1);
    expect(res.body.summary.byClassification.missing_reservation_functionality).toBe(1);
    expect(res.body.summary.byClassification.ledger_discrepancy).toBe(0);
  });

  it('فیلتر انبار: فقط همان انبار و بدون نشت به شرکت دیگر', async () => {
    const onlySecond = await reqWithToken(A.adminToken).get(`/api/v1/stock/reconciliation?warehouse_id=${A.secondWh}`);
    expect(onlySecond.status).toBe(200);
    expectBodyMatchesSchema('get', '/stock/reconciliation', 200, onlySecond.body);
    expect(onlySecond.body.warehouse_id).toBe(A.secondWh);
    expect(onlySecond.body.findings.map((f: any) => f.warehouse_id)).toEqual([A.secondWh]);

    const foreign = await reqWithToken(A.adminToken).get(`/api/v1/stock/reconciliation?warehouse_id=${B.mainWh}`);
    expect(foreign.status).toBe(200);
    expect(foreign.body.checked_keys).toBe(0);
    expect(foreign.body.findings).toEqual([]);

    const unknown = await reqWithToken(A.adminToken).get(`/api/v1/stock/reconciliation?warehouse_id=${MISSING}`);
    expect(unknown.body.checked_keys).toBe(0);
  });

  it('شرکت B فقط داده‌ی خودش را می‌بیند و سازگار است (بدون مغایرت)', async () => {
    const res = await reqWithToken(B.adminToken).get('/api/v1/stock/reconciliation');
    expect(res.status).toBe(200);
    expect(res.body.company_id).toBe(B.companyId);
    expect(res.body.checked_keys).toBe(1);
    expect(res.body.finding_count).toBe(0);
    expect(res.body.findings).toEqual([]);
  });

  it('فقط‌خواندنی: پس از چند فراخوانی، هیچ داده‌ای تغییر و هیچ ممیزی‌ای اضافه نمی‌شود', async () => {
    const fp = async () => {
      const { rows } = await pool.query<{ fp: string }>(`
        select md5(concat(
          (select count(*)::text from inventory_txn), '|',
          (select coalesce(md5(string_agg(warehouse_id||':'||product_id||':'||qty_on_hand||':'||qty_reserved, '|' order by warehouse_id, product_id)),'') from stock_balance), '|',
          (select count(*)::text from audit_log), '|',
          (select count(*)::text from stock_reservation)
        )) as fp`);
      return rows[0].fp;
    };
    const before = await fp();
    await reqWithToken(A.adminToken).get('/api/v1/stock/reconciliation');
    await reqWithToken(A.adminToken).get(`/api/v1/stock/reconciliation?warehouse_id=${A.mainWh}`);
    await reqWithToken(B.adminToken).get('/api/v1/stock/reconciliation');
    expect(await fp()).toBe(before);

    const qr = await pool.query<{ q: string }>(
      `select qty_reserved::text as q from stock_balance where warehouse_id = $1 and product_id = $2`,
      [A.mainWh, A.productId],
    );
    expect(qr.rows[0].q).toBe('2.0000'); // بدون اصلاح خودکار
  });
});
