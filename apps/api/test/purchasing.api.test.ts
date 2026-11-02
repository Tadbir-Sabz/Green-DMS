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
 * تست API خرید / Accounts-Payable — /purchase-orders، /supplier-invoices و
 * /payment-vouchers مطابق openapi.yaml (ماژول ۸، مهاجرت 0015):
 * ۱) دیتابیس موقت «greendms_purchasing_test» از صفر + همه مهاجرت‌ها
 * ۲) seed: شرکت/شعبه/انبار + کالا(+uom/دسته) + دو تأمین‌کننده + ادمین(همه
 *    مجوزها)/بیننده(بدون ap.*). payment_method در مهاجرت 0022 seed می‌شود.
 * ۳) گاردها (401/403) و چرخهٔ کامل: سفارش خرید (ثبت/تأیید)، فاکتور
 *    تأمین‌کننده (ثبت/تأیید ← دفتر بدهکاری debit) و سند پرداخت (ثبت با تخصیص
 *    ← دفتر بدهکاری credit + وضعیت فاکتور)؛ اثر هر کدام روی GET /ap سنجیده می‌شود.
 * ۴) assertion پوششی: همه خطاهای مستندشدهٔ هر ۱۱ عملیات آزموده شده‌اند.
 *
 * نکته: این سه جدول company_id ندارند و کلیدشان branch_id است؛ دامنهٔ شرکت از
 * راه branch_id in (select id from branch where company_id=…) اعمال می‌شود.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_purchasing_test';
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

const ADMIN_USER = 'pur_admin';
const ADMIN_PASSWORD = 'S3cret!pass';
const VIEWER_USER = 'pur_viewer';
const VIEWER_PASSWORD = 'View!pass1';

let adminToken = '';
let viewerToken = '';
let companyId = '';
let branchId = '';
let warehouseId = '';
let productId = '';
let supplierId = '';
let supplierPersonId = '';
let supplier2Id = '';
let cashMethodId = '';
/** سفارش خرید تأییدشده برای ارجاع فاکتور */
let approvedPoId = '';

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

/** خواندن ماندهٔ بدهکاری یک تأمین‌کننده از GET /ap (بر حسب person_id) */
const apPayable = async (personId: string): Promise<number> => {
  const res = await api().get('/api/v1/ap').query({ supplier_person_id: personId }).expect(200);
  const row = res.body.items.find((r: { supplier_person_id: string }) => r.supplier_person_id === personId);
  return Number(row?.total_payable ?? 0);
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
  const adminHash = await hashPassword(ADMIN_PASSWORD);
  const viewerHash = await hashPassword(VIEWER_PASSWORD);

  companyId = (
    await pool.query<{ id: string }>(
      `insert into company (code, legal_name) values ('PURCO', 'شرکت تست خرید') returning id`,
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
  await pool.query(`insert into uom (code, title) values ('PURPCS', 'عدد')`);
  const category = await pool.query<{ id: string }>(
    `insert into product_category (company_id, code, name) values ($1, 'PCAT-1', 'دسته خرید') returning id`,
    [companyId],
  );
  productId = (
    await pool.query<{ id: string }>(
      `insert into product (company_id, code, name, category_id, base_uom_id)
       select $1, 'PPRD-1', 'کالای خریداری', $2, id from uom where code = 'PURPCS'
       returning id`,
      [companyId, category.rows[0].id],
    )
  ).rows[0].id;

  // ---- دو تأمین‌کننده (دومی برای آزمون عدم تطابق supplier) ----
  const supPerson = await pool.query<{ id: string }>(
    `insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, 'SUP-1', 'legal', null, 'تأمین‌کنندهٔ یک') returning id`,
    [companyId],
  );
  supplierPersonId = supPerson.rows[0].id;
  supplierId = (
    await pool.query<{ id: string }>(
      `insert into supplier (company_id, person_id, code) values ($1, $2, 'S-1') returning id`,
      [companyId, supplierPersonId],
    )
  ).rows[0].id;
  const sup2Person = await pool.query<{ id: string }>(
    `insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, 'SUP-2', 'legal', null, 'تأمین‌کنندهٔ دو') returning id`,
    [companyId],
  );
  supplier2Id = (
    await pool.query<{ id: string }>(
      `insert into supplier (company_id, person_id, code) values ($1, $2, 'S-2') returning id`,
      [companyId, sup2Person.rows[0].id],
    )
  ).rows[0].id;

  // payment_method در مهاجرت 0022 seed شده است — «cash» فعال و بدون پیگیری
  cashMethodId = (
    await pool.query<{ id: string }>(`select id from payment_method where code = 'cash'`)
  ).rows[0].id;

  // ---- کاربران: ادمین (همهٔ مجوزها) و بیننده (بدون هیچ ap.*) ----
  const adminPerson = await pool.query<{ id: string }>(
    `insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, 'PUR-ADM', 'natural', 'مدیر', 'خرید') returning id`,
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
     values ($1, 'PUR-VW', 'natural', 'بیننده', 'آزمایشی') returning id`,
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
// گاردها — 401 بدون توکن و 403 بدون مجوزِ ap برای هر ۱۱ عملیات
// =====================================================================
describe('Purchasing — گاردها: 401 و 403', () => {
  const poBody = { branch_id: MISSING, supplier_id: MISSING, warehouse_id: MISSING, lines: [{ product_id: MISSING, qty: 1, unit_price: '1' }] };
  const siBody = { branch_id: MISSING, supplier_id: MISSING, doc_number: 'X-1', amount: '1' };
  const pvBody = { branch_id: MISSING, supplier_id: MISSING, method_id: MISSING, amount: '1' };

  it('بدون توکن 401 ← Error (همهٔ عملیات)', async () => {
    expectBodyMatchesSchema('get', '/purchase-orders', 401, (await api(null).get('/api/v1/purchase-orders').expect(401)).body);
    expectBodyMatchesSchema('get', '/purchase-orders/{id}', 401, (await api(null).get(`/api/v1/purchase-orders/${MISSING}`).expect(401)).body);
    expectBodyMatchesSchema('post', '/purchase-orders', 401, (await api(null).post('/api/v1/purchase-orders').send(poBody).expect(401)).body);
    expectBodyMatchesSchema('post', '/purchase-orders/{id}/approve', 401, (await api(null).post(`/api/v1/purchase-orders/${MISSING}/approve`).expect(401)).body);
    expectBodyMatchesSchema('get', '/supplier-invoices', 401, (await api(null).get('/api/v1/supplier-invoices').expect(401)).body);
    expectBodyMatchesSchema('get', '/supplier-invoices/{id}', 401, (await api(null).get(`/api/v1/supplier-invoices/${MISSING}`).expect(401)).body);
    expectBodyMatchesSchema('post', '/supplier-invoices', 401, (await api(null).post('/api/v1/supplier-invoices').send(siBody).expect(401)).body);
    expectBodyMatchesSchema('post', '/supplier-invoices/{id}/approve', 401, (await api(null).post(`/api/v1/supplier-invoices/${MISSING}/approve`).expect(401)).body);
    expectBodyMatchesSchema('get', '/payment-vouchers', 401, (await api(null).get('/api/v1/payment-vouchers').expect(401)).body);
    expectBodyMatchesSchema('get', '/payment-vouchers/{id}', 401, (await api(null).get(`/api/v1/payment-vouchers/${MISSING}`).expect(401)).body);
    expectBodyMatchesSchema('post', '/payment-vouchers', 401, (await api(null).post('/api/v1/payment-vouchers').send(pvBody).expect(401)).body);
  });

  it('بیننده روی هر سه منبع 403 ← Error با جزئیات مجوز ap.*', async () => {
    const assertForbidden = (b: { code?: string; details?: { required?: string[] } }) => {
      expect(b.code).toBe('forbidden');
      expect(b.details?.required?.[0]).toMatch(/^ap\./);
    };
    const check = async (method: 'get' | 'post', url: string, contractPath: string, body?: Record<string, unknown>) => {
      let req = api(viewerToken)[method](`/api/v1${url}`);
      if (body) req = req.send(body) as typeof req;
      const res = await req.expect(403);
      expectBodyMatchesSchema(method, contractPath, 403, res.body);
      assertForbidden(res.body);
    };
    await check('get', '/purchase-orders', '/purchase-orders');
    await check('get', `/purchase-orders/${MISSING}`, '/purchase-orders/{id}');
    await check('post', '/purchase-orders', '/purchase-orders', poBody);
    await check('post', `/purchase-orders/${MISSING}/approve`, '/purchase-orders/{id}/approve');
    await check('get', '/supplier-invoices', '/supplier-invoices');
    await check('get', `/supplier-invoices/${MISSING}`, '/supplier-invoices/{id}');
    await check('post', '/supplier-invoices', '/supplier-invoices', siBody);
    await check('post', `/supplier-invoices/${MISSING}/approve`, '/supplier-invoices/{id}/approve');
    await check('get', '/payment-vouchers', '/payment-vouchers');
    await check('get', `/payment-vouchers/${MISSING}`, '/payment-vouchers/{id}');
    await check('post', '/payment-vouchers', '/payment-vouchers', pvBody);
  });
});

// =====================================================================
// سفارش خرید — ثبت، تأیید و ردهای رد
// =====================================================================
describe('Purchasing — سفارش خرید', () => {
  const poBody = (over: Record<string, unknown> = {}) => ({
    branch_id: branchId,
    supplier_id: supplierId,
    warehouse_id: warehouseId,
    lines: [{ product_id: productId, qty: 10, unit_price: '100' }],
    ...over,
  });

  it('POST /purchase-orders 201 ← PurchaseOrder پیش‌نویس با جمع محاسبه‌شده', async () => {
    const res = await api().post('/api/v1/purchase-orders').send(poBody()).expect(201);
    expectBodyMatchesSchema('post', '/purchase-orders', 201, res.body);
    expect(res.body.status).toBe('draft');
    expect(res.body.doc_number).toMatch(/^PO-/);
    expect(Number(res.body.subtotal)).toBe(1000);
    expect(Number(res.body.grand_total)).toBe(1000);
    expect(res.body.lines).toHaveLength(1);
    expect(Number(res.body.lines[0].line_total)).toBe(1000);
    approvedPoId = res.body.id;
  });

  it('GET /purchase-orders 200 ← Page + فیلتر status و supplier_id', async () => {
    const res = await api().get('/api/v1/purchase-orders').expect(200);
    expectBodyMatchesSchema('get', '/purchase-orders', 200, res.body);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    expect(res.body).toHaveProperty('has_more');

    const drafts = await api().get('/api/v1/purchase-orders').query({ status: 'draft' }).expect(200);
    expectBodyMatchesSchema('get', '/purchase-orders', 200, drafts.body);
    expect(drafts.body.items.every((p: { status: string }) => p.status === 'draft')).toBe(true);

    const bySupplier = await api().get('/api/v1/purchase-orders').query({ supplier_id: supplierId }).expect(200);
    expect(bySupplier.body.items.every((p: { supplier_id: string }) => p.supplier_id === supplierId)).toBe(true);
  });

  it('GET /purchase-orders/{id} 200 ← جزئیات با اقلام؛ شناسهٔ خراب 400 و ناموجود 404', async () => {
    const detail = await api().get(`/api/v1/purchase-orders/${approvedPoId}`).expect(200);
    expectBodyMatchesSchema('get', '/purchase-orders/{id}', 200, detail.body);
    expect(detail.body.id).toBe(approvedPoId);
    expect(detail.body.lines).toHaveLength(1);

    const bad = await api().get('/api/v1/purchase-orders/abc').expect(400);
    expectBodyMatchesSchema('get', '/purchase-orders/{id}', 400, bad.body);
    expect(bad.body.code).toBe('invalid_id');

    const miss = await api().get(`/api/v1/purchase-orders/${MISSING}`).expect(404);
    expectBodyMatchesSchema('get', '/purchase-orders/{id}', 404, miss.body);
    expect(miss.body.code).toBe('not_found');
  });

  it('POST /purchase-orders/{id}/approve 200 ← draft به approved', async () => {
    const res = await api().post(`/api/v1/purchase-orders/${approvedPoId}/approve`).expect(200);
    expectBodyMatchesSchema('post', '/purchase-orders/{id}/approve', 200, res.body);
    expect(res.body.status).toBe('approved');
    expect(res.body.lines).toHaveLength(1);
  });

  it('تأیید دوباره 409 ← po_not_draft؛ ناموجود 404 و خراب 400', async () => {
    const again = await api().post(`/api/v1/purchase-orders/${approvedPoId}/approve`).expect(409);
    expectBodyMatchesSchema('post', '/purchase-orders/{id}/approve', 409, again.body);
    expect(again.body.code).toBe('po_not_draft');

    const miss = await api().post(`/api/v1/purchase-orders/${MISSING}/approve`).expect(404);
    expectBodyMatchesSchema('post', '/purchase-orders/{id}/approve', 404, miss.body);
    expect(miss.body.code).toBe('not_found');

    const bad = await api().post('/api/v1/purchase-orders/abc/approve').expect(400);
    expectBodyMatchesSchema('post', '/purchase-orders/{id}/approve', 400, bad.body);
    expect(bad.body.code).toBe('invalid_id');
  });

  it('ردهای رد 400: شعبه/تأمین‌کننده/انبار/کالای نامعتبر و مبلغ منفی', async () => {
    const badBranch = await api().post('/api/v1/purchase-orders').send(poBody({ branch_id: MISSING })).expect(400);
    expectBodyMatchesSchema('post', '/purchase-orders', 400, badBranch.body);
    expect(badBranch.body.code).toBe('branch_invalid');

    const badSupplier = await api().post('/api/v1/purchase-orders').send(poBody({ supplier_id: MISSING })).expect(400);
    expect(badSupplier.body.code).toBe('supplier_invalid');

    const badWarehouse = await api().post('/api/v1/purchase-orders').send(poBody({ warehouse_id: MISSING })).expect(400);
    expect(badWarehouse.body.code).toBe('warehouse_invalid');

    const badProduct = await api()
      .post('/api/v1/purchase-orders')
      .send(poBody({ lines: [{ product_id: MISSING, qty: 1, unit_price: '10' }] }))
      .expect(400);
    expect(badProduct.body.code).toBe('product_invalid');

    const negPrice = await api()
      .post('/api/v1/purchase-orders')
      .send(poBody({ lines: [{ product_id: productId, qty: 1, unit_price: '-5' }] }))
      .expect(400);
    expect(negPrice.body.code).toBe('invalid_amount');

    const noLines = await api()
      .post('/api/v1/purchase-orders')
      .send({ branch_id: branchId, supplier_id: supplierId, warehouse_id: warehouseId, lines: [] })
      .expect(400);
    expect(noLines.body.code).toBe('validation_failed');
  });
});

// =====================================================================
// فاکتور تأمین‌کننده — ثبت، تأیید (دفتر بدهکاری debit) و ردهای رد
// =====================================================================
describe('Purchasing — فاکتور تأمین‌کننده', () => {
  let invoiceId = '';
  let invoiceBId = '';

  const siBody = (over: Record<string, unknown> = {}) => ({
    branch_id: branchId,
    supplier_id: supplierId,
    doc_number: 'SUP-INV-1',
    invoice_date: '2024-05-01',
    due_date: '2024-06-01',
    purchase_order_id: approvedPoId,
    amount: '1000',
    tax_amount: '0',
    lines: [{ product_id: productId, qty: 10, unit_price: '100' }],
    ...over,
  });

  it('POST /supplier-invoices 201 ← SupplierInvoice پیش‌نویس با internal_no', async () => {
    const res = await api().post('/api/v1/supplier-invoices').send(siBody()).expect(201);
    expectBodyMatchesSchema('post', '/supplier-invoices', 201, res.body);
    invoiceId = res.body.id;
    expect(res.body.status).toBe('draft');
    expect(res.body.match_status).toBe('pending');
    expect(res.body.internal_no).toMatch(/^SINV-/);
    expect(res.body.doc_number).toBe('SUP-INV-1');
    expect(res.body.lines).toHaveLength(1);
  });

  it('شمارهٔ فاکتور تکراری برای همان تأمین‌کننده 409 ← duplicate_invoice', async () => {
    const res = await api().post('/api/v1/supplier-invoices').send(siBody()).expect(409);
    expectBodyMatchesSchema('post', '/supplier-invoices', 409, res.body);
    expect(res.body.code).toBe('duplicate_invoice');
  });

  it('GET /supplier-invoices 200 ← Page + فیلتر status', async () => {
    const res = await api().get('/api/v1/supplier-invoices').expect(200);
    expectBodyMatchesSchema('get', '/supplier-invoices', 200, res.body);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);

    const drafts = await api().get('/api/v1/supplier-invoices').query({ status: 'draft' }).expect(200);
    expectBodyMatchesSchema('get', '/supplier-invoices', 200, drafts.body);
    expect(drafts.body.items.every((s: { status: string }) => s.status === 'draft')).toBe(true);
  });

  it('GET /supplier-invoices/{id} 200؛ شناسهٔ خراب 400 و ناموجود 404', async () => {
    const detail = await api().get(`/api/v1/supplier-invoices/${invoiceId}`).expect(200);
    expectBodyMatchesSchema('get', '/supplier-invoices/{id}', 200, detail.body);
    expect(detail.body.id).toBe(invoiceId);

    const bad = await api().get('/api/v1/supplier-invoices/abc').expect(400);
    expectBodyMatchesSchema('get', '/supplier-invoices/{id}', 400, bad.body);
    expect(bad.body.code).toBe('invalid_id');

    const miss = await api().get(`/api/v1/supplier-invoices/${MISSING}`).expect(404);
    expectBodyMatchesSchema('get', '/supplier-invoices/{id}', 404, miss.body);
    expect(miss.body.code).toBe('not_found');
  });

  it('ردهای رد 400: سررسید پیش از فاکتور و عدم تطابق تأمین‌کنندهٔ سفارش', async () => {
    const dueBefore = await api()
      .post('/api/v1/supplier-invoices')
      .send(siBody({ doc_number: 'SUP-INV-DUE', invoice_date: '2024-05-10', due_date: '2024-05-01' }))
      .expect(400);
    expectBodyMatchesSchema('post', '/supplier-invoices', 400, dueBefore.body);
    expect(dueBefore.body.code).toBe('due_before_invoice');

    // سفارشِ supplier1 با supplier2 → عدم تطابق
    const mismatch = await api()
      .post('/api/v1/supplier-invoices')
      .send(siBody({ doc_number: 'SUP-INV-MM', supplier_id: supplier2Id, purchase_order_id: approvedPoId }))
      .expect(400);
    expect(mismatch.body.code).toBe('po_supplier_mismatch');

    const negAmount = await api()
      .post('/api/v1/supplier-invoices')
      .send(siBody({ doc_number: 'SUP-INV-NEG', amount: '-1' }))
      .expect(400);
    expect(negAmount.body.code).toBe('invalid_amount');
  });

  it('POST approve 200 ← approved و دفتر بدهکاری debit؛ ماندهٔ /ap بالا می‌رود', async () => {
    const before = await apPayable(supplierPersonId);
    const res = await api().post(`/api/v1/supplier-invoices/${invoiceId}/approve`).expect(200);
    expectBodyMatchesSchema('post', '/supplier-invoices/{id}/approve', 200, res.body);
    expect(res.body.status).toBe('approved');

    // یک ردیف دفتر بدهکاری (debit=1000, credit=0) برای این فاکتور
    const ledger = await pool.query(
      `select debit::text, credit::text from supplier_ledger_entry where doc_type='supplier_invoice' and doc_id=$1`,
      [invoiceId],
    );
    expect(ledger.rows).toHaveLength(1);
    expect(Number(ledger.rows[0].debit)).toBe(1000);
    expect(Number(ledger.rows[0].credit)).toBe(0);

    const after = await apPayable(supplierPersonId);
    expect(after - before).toBe(1000);
  });

  it('تأیید دوباره 409 ← invoice_not_approvable؛ ناموجود 404 و خراب 400', async () => {
    const again = await api().post(`/api/v1/supplier-invoices/${invoiceId}/approve`).expect(409);
    expectBodyMatchesSchema('post', '/supplier-invoices/{id}/approve', 409, again.body);
    expect(again.body.code).toBe('invoice_not_approvable');

    const miss = await api().post(`/api/v1/supplier-invoices/${MISSING}/approve`).expect(404);
    expectBodyMatchesSchema('post', '/supplier-invoices/{id}/approve', 404, miss.body);
    expect(miss.body.code).toBe('not_found');

    const bad = await api().post('/api/v1/supplier-invoices/abc/approve').expect(400);
    expectBodyMatchesSchema('post', '/supplier-invoices/{id}/approve', 400, bad.body);
    expect(bad.body.code).toBe('invalid_id');
  });

  it('فاکتور دوم برای آزمون پرداخت جزئی/کامل', async () => {
    const res = await api()
      .post('/api/v1/supplier-invoices')
      .send(siBody({ doc_number: 'SUP-INV-2', amount: '500' }))
      .expect(201);
    invoiceBId = res.body.id;
    await api().post(`/api/v1/supplier-invoices/${invoiceBId}/approve`).expect(200);
  });
});

// =====================================================================
// سند پرداخت — ثبت با تخصیص (دفتر بدهکاری credit) و اثر بر فاکتور و /ap
// =====================================================================
describe('Purchasing — سند پرداخت', () => {
  // شناسهٔ دو فاکتور تأییدشده از describe قبل
  let invA = '';
  let invB = '';
  let voucherId = '';

  it('آماده‌سازی: دو فاکتور تأییدشده', async () => {
    const list = await api().get('/api/v1/supplier-invoices').query({ status: 'approved' }).expect(200);
    const approved = list.body.items.filter((s: { supplier_id: string }) => s.supplier_id === supplierId);
    // فاکتور ۱۰۰۰ (SUP-INV-1) و ۵۰۰ (SUP-INV-2)
    invA = approved.find((s: { amount: string }) => Number(s.amount) === 1000)?.id ?? '';
    invB = approved.find((s: { amount: string }) => Number(s.amount) === 500)?.id ?? '';
    expect(invA).toBeTruthy();
    expect(invB).toBeTruthy();
  });

  const pvBody = (over: Record<string, unknown> = {}) => ({
    branch_id: branchId,
    supplier_id: supplierId,
    method_id: cashMethodId,
    payment_date: '2024-06-05',
    amount: '1000',
    allocations: [{ supplier_invoice_id: invA, amount: '1000' }],
    ...over,
  });

  it('POST /payment-vouchers 201 ← پرداخت کامل فاکتور A؛ status=paid و ماندهٔ /ap صفر می‌شود', async () => {
    const before = await apPayable(supplierPersonId);
    const res = await api().post('/api/v1/payment-vouchers').send(pvBody()).expect(201);
    expectBodyMatchesSchema('post', '/payment-vouchers', 201, res.body);
    voucherId = res.body.id;
    expect(res.body.status).toBe('posted');
    expect(res.body.doc_number).toMatch(/^PV-/);
    expect(res.body.allocations).toHaveLength(1);

    // دفتر بدهکاری: یک ردیف credit=1000
    const ledger = await pool.query(
      `select debit::text, credit::text from supplier_ledger_entry where doc_type='payment_voucher' and doc_id=$1`,
      [voucherId],
    );
    expect(ledger.rows).toHaveLength(1);
    expect(Number(ledger.rows[0].credit)).toBe(1000);
    expect(Number(ledger.rows[0].debit)).toBe(0);

    // فاکتور A کاملاً پرداخت شد
    const inv = await api().get(`/api/v1/supplier-invoices/${invA}`).expect(200);
    expect(inv.body.status).toBe('paid');

    // ماندهٔ بدهکاری به اندازهٔ پرداخت کاهش یافت (1500 → 500)
    const after = await apPayable(supplierPersonId);
    expect(before - after).toBe(1000);
    expect(after).toBe(500);
  });

  it('پرداخت جزئی فاکتور B ← status=partially_paid', async () => {
    const res = await api()
      .post('/api/v1/payment-vouchers')
      .send(pvBody({ amount: '200', allocations: [{ supplier_invoice_id: invB, amount: '200' }] }))
      .expect(201);
    expectBodyMatchesSchema('post', '/payment-vouchers', 201, res.body);
    const inv = await api().get(`/api/v1/supplier-invoices/${invB}`).expect(200);
    expect(inv.body.status).toBe('partially_paid');
  });

  it('GET /payment-vouchers 200 ← Page و GET /{id} 200 با تخصیص‌ها', async () => {
    const list = await api().get('/api/v1/payment-vouchers').expect(200);
    expectBodyMatchesSchema('get', '/payment-vouchers', 200, list.body);
    expect(list.body.items.length).toBeGreaterThanOrEqual(2);

    const posted = await api().get('/api/v1/payment-vouchers').query({ status: 'posted' }).expect(200);
    expectBodyMatchesSchema('get', '/payment-vouchers', 200, posted.body);
    expect(posted.body.items.every((v: { status: string }) => v.status === 'posted')).toBe(true);

    const detail = await api().get(`/api/v1/payment-vouchers/${voucherId}`).expect(200);
    expectBodyMatchesSchema('get', '/payment-vouchers/{id}', 200, detail.body);
    expect(detail.body.id).toBe(voucherId);
    expect(detail.body.allocations).toHaveLength(1);

    const bad = await api().get('/api/v1/payment-vouchers/abc').expect(400);
    expectBodyMatchesSchema('get', '/payment-vouchers/{id}', 400, bad.body);
    expect(bad.body.code).toBe('invalid_id');

    const miss = await api().get(`/api/v1/payment-vouchers/${MISSING}`).expect(404);
    expectBodyMatchesSchema('get', '/payment-vouchers/{id}', 404, miss.body);
    expect(miss.body.code).toBe('not_found');
  });

  it('تخصیص بیش از مبلغ سند 422 ← over_allocation', async () => {
    const res = await api()
      .post('/api/v1/payment-vouchers')
      .send(pvBody({ amount: '100', allocations: [{ supplier_invoice_id: invB, amount: '150' }] }))
      .expect(422);
    expectBodyMatchesSchema('post', '/payment-vouchers', 422, res.body);
    expect(res.body.code).toBe('over_allocation');
  });

  it('روش پرداخت نامعتبر 400 ← method_invalid', async () => {
    const res = await api()
      .post('/api/v1/payment-vouchers')
      .send(pvBody({ method_id: MISSING, allocations: [] }))
      .expect(400);
    expectBodyMatchesSchema('post', '/payment-vouchers', 400, res.body);
    expect(res.body.code).toBe('method_invalid');
  });

  it('تخصیص به فاکتورِ تأمین‌کنندهٔ دیگر 422 ← invoice_supplier_mismatch', async () => {
    // فاکتوری برای supplier2 بساز و تأیید کن، سپس با سندِ supplier1 تخصیص بده
    const inv2 = await api()
      .post('/api/v1/supplier-invoices')
      .send({ branch_id: branchId, supplier_id: supplier2Id, doc_number: 'S2-INV-1', amount: '300' })
      .expect(201);
    await api().post(`/api/v1/supplier-invoices/${inv2.body.id}/approve`).expect(200);

    const res = await api()
      .post('/api/v1/payment-vouchers')
      .send(pvBody({ amount: '300', allocations: [{ supplier_invoice_id: inv2.body.id, amount: '300' }] }))
      .expect(422);
    expectBodyMatchesSchema('post', '/payment-vouchers', 422, res.body);
    expect(res.body.code).toBe('invoice_supplier_mismatch');
  });
});

// =====================================================================
// پوشش خطاهای مستندشدهٔ همهٔ عملیات
// =====================================================================
describe('Purchasing — پوشش خطاهای مستندشده', () => {
  it('همهٔ خطاهای مستندشده در همین فایل آزموده شده‌اند', () => {
    const ops: [string, string][] = [
      ['get', '/purchase-orders'],
      ['get', '/purchase-orders/{id}'],
      ['post', '/purchase-orders'],
      ['post', '/purchase-orders/{id}/approve'],
      ['get', '/supplier-invoices'],
      ['get', '/supplier-invoices/{id}'],
      ['post', '/supplier-invoices'],
      ['post', '/supplier-invoices/{id}/approve'],
      ['get', '/payment-vouchers'],
      ['get', '/payment-vouchers/{id}'],
      ['post', '/payment-vouchers'],
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
