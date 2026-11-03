import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
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
 * تست API رسید انبار خرید (GRN) و ارزش‌گذاری — /goods-receipts و /valuation
 * مطابق openapi.yaml (ماژول ۸/۹، مهاجرت 0015/0016/0008):
 * ۱) دیتابیس موقت «greendms_grn_test» از صفر + همه مهاجرت‌ها
 * ۲) seed: شرکت/شعبه/انبار + کالا(+uom/دسته) + تأمین‌کننده + ادمین(همهٔ
 *    مجوزها)/بیننده(بدون ap.* و بدون valuation.view)
 * ۳) گاردها (401/403) و چرخهٔ کامل: ثبت رسید پیش‌نویس → ثبت قطعی (post) و
 *    سنجش عوارض انبار (inventory_txn/stock_balance) و بها (product_cost/
 *    cost_layer) با دو رسید برای میانگین متحرک؛ سپس GET /valuation.
 * ۴) assertion پوششی: همه خطاهای مستندشدهٔ هر ۵ عملیات آزموده شده‌اند.
 *
 * نکته: این جداول company_id ندارند و کلیدشان branch_id است؛ دامنهٔ شرکت از
 * راه branch_id in (select id from branch where company_id=…) اعمال می‌شود.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_grn_test';
const PSQL = process.env.PSQL ?? 'C:/Program Files/PostgreSQL/16/bin/psql.exe';
const SPEC_FILE = path.join(ROOT, 'packages', 'contracts', 'openapi.yaml');
/** uuid معتبرِ نسخهٔ ۴ که در دیتابیس وجود ندارد → برای آزمون 404 */
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

let adminPool: pg.Pool;
let pool: pg.Pool;
let app: INestApplication;

const ADMIN_USER = 'grn_admin';
const ADMIN_PASSWORD = 'S3cret!pass';
const VIEWER_USER = 'grn_viewer';
const VIEWER_PASSWORD = 'View!pass1';

let adminToken = '';
let viewerToken = '';
let companyId = '';
let branchId = '';
let warehouseId = '';
let productId = '';
let supplierId = '';
/** رسیدهای ثبت‌شده برای سنجش میانگین متحرک */
let grn1Id = '';
let grn2Id = '';

const exercisedErrors = new Set<string>();

interface SpecDoc {
  paths: Record<string, Record<string, any>>;
  [key: string]: unknown;
}
let spec: SpecDoc;
let ajv: Ajv2020;

const api = (token?: string | null) => {
  const base = request(app.getHttpServer());
  const use = token === undefined ? adminToken : token;
  const verb = (method: 'get' | 'post') => (url: string) => {
    const req = base[method](url);
    return use ? req.set('Authorization', `Bearer ${use}`) : req;
  };
  return { get: verb('get'), post: verb('post') };
};

const login = async (username: string, password: string): Promise<string> => {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ username, password })
    .expect(200);
  return res.body.access_token as string;
};

const resolvePointer = (doc: unknown, ref: string): any =>
  ref
    .replace(/^#\//, '')
    .split('/')
    .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((node, seg) => (node == null ? node : node[seg]), doc);

const expectBodyMatchesSchema = (
  method: string,
  contractPath: string,
  status: number,
  body: unknown,
): void => {
  const responses = spec.paths[contractPath]?.[method]?.responses ?? {};
  expect(
    Object.keys(responses),
    `کد ${status} برای ${method.toUpperCase()} ${contractPath} در قرارداد نیست`,
  ).toContain(String(status));

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
  if (!ok) {
    console.error(
      `✗ ناسازگاری قرارداد ${method.toUpperCase()} ${contractPath} → ${status}:`,
      JSON.stringify(validate!.errors, null, 2),
    );
  }
  expect(ok, `بدنه پاسخ با اسکیمای قرارداد نمی‌خواند (${pointer})`).toBe(true);
  exercisedErrors.add(`${method.toUpperCase()} ${contractPath} ${status}`);
};

/** بدنهٔ معتبر رسید انبار (پیش‌فرض: ۱۰ عدد به بهای ۱۰۰) */
const grnBody = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  branch_id: branchId,
  supplier_id: supplierId,
  warehouse_id: warehouseId,
  lines: [{ product_id: productId, qty_received: 10, unit_cost: '100' }],
  ...over,
});

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
  const adminHash = await hashPassword(ADMIN_PASSWORD);
  const viewerHash = await hashPassword(VIEWER_PASSWORD);

  companyId = (
    await pool.query<{ id: string }>(
      `insert into company (code, legal_name) values ('GRNCO', 'شرکت تست رسید انبار') returning id`,
    )
  ).rows[0].id;
  branchId = (
    await pool.query<{ id: string }>(
      `insert into branch (company_id, code, name) values ($1, 'MAIN', 'شعبه مرکزی') returning id`,
      [companyId],
    )
  ).rows[0].id;
  warehouseId = (
    await pool.query<{ id: string }>(
      `insert into warehouse (branch_id, code, name) values ($1, 'WH-1', 'انبار مرکزی') returning id`,
      [branchId],
    )
  ).rows[0].id;

  // ---- کالا (product به category و uom نیاز دارد) ----
  await pool.query(`insert into uom (code, title) values ('GRNPCS', 'عدد')`);
  const category = await pool.query<{ id: string }>(
    `insert into product_category (company_id, code, name) values ($1, 'GCAT-1', 'دسته رسید') returning id`,
    [companyId],
  );
  productId = (
    await pool.query<{ id: string }>(
      `insert into product (company_id, code, name, category_id, base_uom_id)
       select $1, 'GPRD-1', 'کالای رسید', $2, id from uom where code = 'GRNPCS'
       returning id`,
      [companyId, category.rows[0].id],
    )
  ).rows[0].id;

  // ---- تأمین‌کننده (legal_type='legal' → ck_person_name نیاز به legal_name دارد) ----
  const supPerson = await pool.query<{ id: string }>(
    `insert into person (company_id, code, legal_type, legal_name)
     values ($1, 'SUP-1', 'legal', 'تأمین‌کنندهٔ رسید') returning id`,
    [companyId],
  );
  supplierId = (
    await pool.query<{ id: string }>(
      `insert into supplier (company_id, person_id, code) values ($1, $2, 'S-1') returning id`,
      [companyId, supPerson.rows[0].id],
    )
  ).rows[0].id;

  // ---- کاربران: ادمین (همهٔ مجوزها) و بیننده (بدون ap.* و بدون valuation.view) ----
  const adminPerson = await pool.query<{ id: string }>(
    `insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, 'GRN-ADM', 'natural', 'مدیر', 'انبار') returning id`,
    [companyId],
  );
  await pool.query(
    `insert into app_user (person_id, username, password_hash, access_level)
     values ($1, $2, $3, 'web')`,
    [adminPerson.rows[0].id, ADMIN_USER, adminHash],
  );
  const adminRole = await pool.query<{ id: string }>(
    `insert into role (company_id, code, name) values ($1, 'admin_full', 'مدیر کامل') returning id`,
    [companyId],
  );
  await pool.query(
    `insert into role_permission (role_id, permission_code) select $1, code from permission`,
    [adminRole.rows[0].id],
  );
  await pool.query(
    `insert into user_role (app_user_id, role_id) select u.id, $1 from app_user u where u.username = $2`,
    [adminRole.rows[0].id, ADMIN_USER],
  );

  const viewerPerson = await pool.query<{ id: string }>(
    `insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, 'GRN-VW', 'natural', 'بیننده', 'آزمایشی') returning id`,
    [companyId],
  );
  await pool.query(
    `insert into app_user (person_id, username, password_hash, access_level)
     values ($1, $2, $3, 'web')`,
    [viewerPerson.rows[0].id, VIEWER_USER, viewerHash],
  );
  const viewerRole = await pool.query<{ id: string }>(
    `insert into role (company_id, code, name) values ($1, 'viewer', 'بیننده') returning id`,
    [companyId],
  );
  await pool.query(
    `insert into role_permission (role_id, permission_code)
     select $1, code from permission where code = 'master.product.view'`,
    [viewerRole.rows[0].id],
  );
  await pool.query(
    `insert into user_role (app_user_id, role_id) select u.id, $1 from app_user u where u.username = $2`,
    [viewerRole.rows[0].id, VIEWER_USER],
  );

  process.env.DATABASE_URL = testUrl.toString();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1', { exclude: ['api/health'] });
  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
  await app.init();

  spec = parse(readFileSync(SPEC_FILE, 'utf8')) as SpecDoc;
  ajv = new Ajv2020({ strict: false, allErrors: true });
  addFormats(ajv);
  ajv.addSchema(spec, 'openapi');

  adminToken = await login(ADMIN_USER, ADMIN_PASSWORD);
  viewerToken = await login(VIEWER_USER, VIEWER_PASSWORD);
}, 180_000);

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

// =====================================================================
// گاردها — 401 بدون توکن و 403 بدون مجوز برای هر ۵ عملیات
// =====================================================================
describe('GRN/Valuation — گاردها: 401 و 403', () => {
  const guardBody = {
    branch_id: MISSING,
    supplier_id: MISSING,
    warehouse_id: MISSING,
    lines: [{ product_id: MISSING, qty_received: 1, unit_cost: '1' }],
  };

  it('بدون توکن 401 ← Error (همهٔ عملیات)', async () => {
    expectBodyMatchesSchema('get', '/goods-receipts', 401, (await api(null).get('/api/v1/goods-receipts').expect(401)).body);
    expectBodyMatchesSchema('get', '/goods-receipts/{id}', 401, (await api(null).get(`/api/v1/goods-receipts/${MISSING}`).expect(401)).body);
    expectBodyMatchesSchema('post', '/goods-receipts', 401, (await api(null).post('/api/v1/goods-receipts').send(guardBody).expect(401)).body);
    expectBodyMatchesSchema('post', '/goods-receipts/{id}/post', 401, (await api(null).post(`/api/v1/goods-receipts/${MISSING}/post`).expect(401)).body);
    expectBodyMatchesSchema('get', '/valuation', 401, (await api(null).get('/api/v1/valuation').expect(401)).body);
  });

  it('بیننده بدون مجوز 403 ← Error (همهٔ عملیات)', async () => {
    expectBodyMatchesSchema('get', '/goods-receipts', 403, (await api(viewerToken).get('/api/v1/goods-receipts').expect(403)).body);
    expectBodyMatchesSchema('get', '/goods-receipts/{id}', 403, (await api(viewerToken).get(`/api/v1/goods-receipts/${MISSING}`).expect(403)).body);
    expectBodyMatchesSchema('post', '/goods-receipts', 403, (await api(viewerToken).post('/api/v1/goods-receipts').send(guardBody).expect(403)).body);
    expectBodyMatchesSchema('post', '/goods-receipts/{id}/post', 403, (await api(viewerToken).post(`/api/v1/goods-receipts/${MISSING}/post`).expect(403)).body);
    expectBodyMatchesSchema('get', '/valuation', 403, (await api(viewerToken).get('/api/v1/valuation').expect(403)).body);
  });
});

// =====================================================================
// چرخهٔ رسید انبار: ثبت پیش‌نویس → ثبت قطعی → عوارض انبار و بها
// =====================================================================
describe('GRN — چرخهٔ ثبت و عوارض انبار/بها', () => {
  it('POST 201 ← رسید پیش‌نویس با doc_number (GRN-…) و اقلام', async () => {
    const res = await api().post('/api/v1/goods-receipts').send(grnBody()).expect(201);
    expectBodyMatchesSchema('post', '/goods-receipts', 201, res.body);
    grn1Id = res.body.id as string;
    expect(res.body.status).toBe('draft');
    expect(res.body.doc_number).toMatch(/^GRN-/);
    expect(res.body.branch_id).toBe(branchId);
    expect(res.body.supplier_id).toBe(supplierId);
    expect(res.body.warehouse_id).toBe(warehouseId);
    expect(res.body.received_by).toBeNull();
    expect(Array.isArray(res.body.lines)).toBe(true);
    expect(res.body.lines).toHaveLength(1);
    expect(Number(res.body.lines[0].qty_received)).toBe(10);
    expect(Number(res.body.lines[0].unit_cost)).toBe(100);
  });

  it('GET /:id 200 ← جزئیات با اقلام؛ GET فهرست خلاصهٔ بی‌سطر', async () => {
    const detail = await api().get(`/api/v1/goods-receipts/${grn1Id}`).expect(200);
    expectBodyMatchesSchema('get', '/goods-receipts/{id}', 200, detail.body);
    expect(detail.body.id).toBe(grn1Id);
    expect(detail.body.lines).toHaveLength(1);

    const list = await api().get('/api/v1/goods-receipts').expect(200);
    expectBodyMatchesSchema('get', '/goods-receipts', 200, list.body);
    expect(Array.isArray(list.body.items)).toBe(true);
    expect(list.body.items.some((r: { id: string }) => r.id === grn1Id)).toBe(true);
    // فهرست خلاصه است و lines ندارد (الگوی summary-vs-detail)
    const summary = list.body.items.find((r: { id: string }) => r.id === grn1Id);
    expect(summary.lines).toBeUndefined();
  });

  it('POST /:id/post 200 ← posted و اثر انبار (inventory_txn/stock_balance)', async () => {
    const res = await api().post(`/api/v1/goods-receipts/${grn1Id}/post`).expect(200);
    expectBodyMatchesSchema('post', '/goods-receipts/{id}/post', 200, res.body);
    expect(res.body.status).toBe('posted');
    expect(res.body.received_by).toBeTruthy();

    // یک inventory_txn «purchase_in» با qty=+10 برای این رسید
    const txn = await pool.query(
      `select txn_kind, qty::text as qty, source_type, source_id::text as source_id
         from inventory_txn where source_type='goods_receipt' and source_id=$1`,
      [grn1Id],
    );
    expect(txn.rows).toHaveLength(1);
    expect(txn.rows[0].txn_kind).toBe('purchase_in');
    expect(Number(txn.rows[0].qty)).toBe(10);

    // stock_balance: qty_on_hand=10 و qty_on_hand_value=1000 (بها جدا از تابع)
    const bal = await pool.query(
      `select qty_on_hand::text as qty_on_hand, qty_on_hand_value::text as qty_on_hand_value
         from stock_balance where warehouse_id=$1 and product_id=$2 and batch_id is null`,
      [warehouseId, productId],
    );
    expect(bal.rows).toHaveLength(1);
    expect(Number(bal.rows[0].qty_on_hand)).toBe(10);
    expect(Number(bal.rows[0].qty_on_hand_value)).toBe(1000);
  });

  it('پس از ثبت: product_cost میانگین متحرک و یک لایهٔ بها', async () => {
    const cost = await pool.query(
      `select method, avg_cost::text as avg_cost, qty_on_hand::text as qty_on_hand,
              value_on_hand::text as value_on_hand, last_purchase_cost::text as last_purchase_cost
         from product_cost where product_id=$1 and warehouse_id=$2`,
      [productId, warehouseId],
    );
    expect(cost.rows).toHaveLength(1);
    expect(cost.rows[0].method).toBe('moving_avg');
    expect(Number(cost.rows[0].avg_cost)).toBe(100);
    expect(Number(cost.rows[0].qty_on_hand)).toBe(10);
    expect(Number(cost.rows[0].value_on_hand)).toBe(1000);
    expect(Number(cost.rows[0].last_purchase_cost)).toBe(100);

    const layer = await pool.query(
      `select qty_in::text as qty_in, qty_remaining::text as qty_remaining, unit_cost::text as unit_cost,
              inventory_txn_id
         from cost_layer where product_id=$1 and warehouse_id=$2`,
      [productId, warehouseId],
    );
    expect(layer.rows).toHaveLength(1);
    expect(Number(layer.rows[0].qty_in)).toBe(10);
    expect(Number(layer.rows[0].qty_remaining)).toBe(10);
    expect(Number(layer.rows[0].unit_cost)).toBe(100);
    expect(layer.rows[0].inventory_txn_id).toBeTruthy();
  });

  it('GET /valuation 200 ← ردیف ارزش موجودیِ کالا', async () => {
    const res = await api().get('/api/v1/valuation').query({ warehouse_id: warehouseId }).expect(200);
    expectBodyMatchesSchema('get', '/valuation', 200, res.body);
    expect(Array.isArray(res.body.items)).toBe(true);
    const row = res.body.items.find((r: { product_id: string }) => r.product_id === productId);
    expect(row).toBeTruthy();
    expect(row.method).toBe('moving_avg');
    expect(Number(row.qty_on_hand)).toBe(10);
    expect(Number(row.avg_cost)).toBe(100);
    expect(Number(row.value_on_hand)).toBe(1000);
  });

  it('رسید دوم → میانگین متحرک: ۱۰@۱۰۰ + ۱۰@۲۰۰ = avg 150، qty 20، value 3000', async () => {
    const created = await api()
      .post('/api/v1/goods-receipts')
      .send(grnBody({ lines: [{ product_id: productId, qty_received: 10, unit_cost: '200' }] }))
      .expect(201);
    grn2Id = created.body.id as string;
    await api().post(`/api/v1/goods-receipts/${grn2Id}/post`).expect(200);

    const cost = await pool.query(
      `select avg_cost::text as avg_cost, qty_on_hand::text as qty_on_hand,
              value_on_hand::text as value_on_hand, last_purchase_cost::text as last_purchase_cost
         from product_cost where product_id=$1 and warehouse_id=$2`,
      [productId, warehouseId],
    );
    expect(Number(cost.rows[0].qty_on_hand)).toBe(20);
    expect(Number(cost.rows[0].value_on_hand)).toBe(3000);
    expect(Number(cost.rows[0].avg_cost)).toBe(150);
    expect(Number(cost.rows[0].last_purchase_cost)).toBe(200);

    const bal = await pool.query(
      `select qty_on_hand::text as qty_on_hand, qty_on_hand_value::text as qty_on_hand_value
         from stock_balance where warehouse_id=$1 and product_id=$2 and batch_id is null`,
      [warehouseId, productId],
    );
    expect(Number(bal.rows[0].qty_on_hand)).toBe(20);
    expect(Number(bal.rows[0].qty_on_hand_value)).toBe(3000);

    const layers = await pool.query(
      `select count(*)::int as n from cost_layer where product_id=$1 and warehouse_id=$2`,
      [productId, warehouseId],
    );
    expect(layers.rows[0].n).toBe(2);
  });

  it('ثبت دوباره 409 ← grn_not_draft؛ ناموجود 404 و شناسهٔ خراب 400', async () => {
    const again = await api().post(`/api/v1/goods-receipts/${grn1Id}/post`).expect(409);
    expectBodyMatchesSchema('post', '/goods-receipts/{id}/post', 409, again.body);
    expect(again.body.code).toBe('grn_not_draft');

    const miss = await api().post(`/api/v1/goods-receipts/${MISSING}/post`).expect(404);
    expectBodyMatchesSchema('post', '/goods-receipts/{id}/post', 404, miss.body);
    expect(miss.body.code).toBe('not_found');

    const bad = await api().post('/api/v1/goods-receipts/abc/post').expect(400);
    expectBodyMatchesSchema('post', '/goods-receipts/{id}/post', 400, bad.body);
    expect(bad.body.code).toBe('invalid_id');
  });
});

// =====================================================================
// اعتبارسنجی ثبت و خواندن
// =====================================================================
describe('GRN — اعتبارسنجی', () => {
  it('GET /:id ناموجود 404 و شناسهٔ خراب 400 ← invalid_id', async () => {
    const miss = await api().get(`/api/v1/goods-receipts/${MISSING}`).expect(404);
    expectBodyMatchesSchema('get', '/goods-receipts/{id}', 404, miss.body);
    expect(miss.body.code).toBe('not_found');

    const bad = await api().get('/api/v1/goods-receipts/abc').expect(400);
    expectBodyMatchesSchema('get', '/goods-receipts/{id}', 400, bad.body);
    expect(bad.body.code).toBe('invalid_id');
  });

  it('POST با شعبهٔ ناموجود 400 ← branch_invalid', async () => {
    const res = await api().post('/api/v1/goods-receipts').send(grnBody({ branch_id: MISSING })).expect(400);
    expectBodyMatchesSchema('post', '/goods-receipts', 400, res.body);
    expect(res.body.code).toBe('branch_invalid');
  });

  it('POST با تأمین‌کنندهٔ ناموجود 400 ← supplier_invalid', async () => {
    const res = await api().post('/api/v1/goods-receipts').send(grnBody({ supplier_id: MISSING })).expect(400);
    expectBodyMatchesSchema('post', '/goods-receipts', 400, res.body);
    expect(res.body.code).toBe('supplier_invalid');
  });

  it('POST با کالای خارج از شرکت 400 ← product_invalid', async () => {
    const res = await api()
      .post('/api/v1/goods-receipts')
      .send(grnBody({ lines: [{ product_id: MISSING, qty_received: 5, unit_cost: '10' }] }))
      .expect(400);
    expectBodyMatchesSchema('post', '/goods-receipts', 400, res.body);
    expect(res.body.code).toBe('product_invalid');
  });

  it('POST با بهای واحد منفی 400 ← invalid_amount', async () => {
    const res = await api()
      .post('/api/v1/goods-receipts')
      .send(grnBody({ lines: [{ product_id: productId, qty_received: 5, unit_cost: '-10' }] }))
      .expect(400);
    expectBodyMatchesSchema('post', '/goods-receipts', 400, res.body);
    expect(res.body.code).toBe('invalid_amount');
  });

  it('POST با اقلام خالی 400 ← validation_failed', async () => {
    const res = await api().post('/api/v1/goods-receipts').send(grnBody({ lines: [] })).expect(400);
    expectBodyMatchesSchema('post', '/goods-receipts', 400, res.body);
    expect(res.body.code).toBe('validation_failed');
  });
});

// =====================================================================
// پوشش خطاهای مستندشدهٔ همهٔ عملیات
// =====================================================================
describe('GRN/Valuation — پوشش خطاهای مستندشده', () => {
  it('همهٔ خطاهای مستندشده در همین فایل آزموده شده‌اند', () => {
    const ops: [string, string][] = [
      ['get', '/goods-receipts'],
      ['get', '/goods-receipts/{id}'],
      ['post', '/goods-receipts'],
      ['post', '/goods-receipts/{id}/post'],
      ['get', '/valuation'],
    ];

    const documented = new Set<string>();
    for (const [method, contractPath] of ops) {
      const responses = spec.paths[contractPath]?.[method]?.responses ?? {};
      expect(Object.keys(responses).length, `${method} ${contractPath} در سند نیست`).toBeGreaterThan(0);
      for (const status of Object.keys(responses)) {
        if (Number(status) >= 400) documented.add(`${method.toUpperCase()} ${contractPath} ${status}`);
      }
    }
    expect(documented.size).toBeGreaterThan(0);

    const missed = [...documented].filter((key) => !exercisedErrors.has(key));
    expect(missed, `این خطاهای مستندشده هنوز آزموده نشده‌اند:\n  ${missed.join('\n  ')}`).toEqual([]);

    const stray = [...exercisedErrors].filter(
      (key) =>
        ops.some(([m, p]) => key.startsWith(`${m.toUpperCase()} ${p} `)) &&
        Number(key.split(' ').at(-1)) >= 400 &&
        !documented.has(key),
    );
    expect(stray, `پاسخ خطای آزموده‌شده خارج از قرارداد:\n  ${stray.join('\n  ')}`).toEqual([]);
  });
});
