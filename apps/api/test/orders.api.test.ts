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
 * تست API سفارش فروش: /orders، /orders/{id} و تأیید (sales.order.*).
 * ۱) دیتابیس موقت «greendms_orders_test» + مهاجرت‌ها
 * ۲) seed: شرکت/شعبه، کالا، مشتری، لیست قیمت، ادمین همه‌مجوز و بینندهٔ بدون مجوز فروش
 * ۳) اعتبارسنجی ajv + assertion پوششی خطاهای مستندشده
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_orders_test';
const PSQL = process.env.PSQL ?? 'C:/Program Files/PostgreSQL/16/bin/psql.exe';
const SPEC_FILE = path.join(ROOT, 'packages', 'contracts', 'openapi.yaml');

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

const ADMIN_USER = 'od_admin';
const ADMIN_PASSWORD = 'S3cret!pass';
const VIEWER_USER = 'od_viewer';
const VIEWER_PASSWORD = 'View!pass1';

let adminToken = '';
let viewerToken = '';
let companyId = '';
let customerId = '';
let priceListId = '';
let productId = '';
const createdOrders: string[] = [];

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
  const verb = (method: 'get' | 'post' | 'patch') => (url: string) => {
    const req = base[method](url);
    return use ? req.set('Authorization', `Bearer ${use}`) : req;
  };
  return { get: verb('get'), post: verb('post'), patch: verb('patch') };
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
  if (status >= 400) exercisedErrors.add(`${method.toUpperCase()} ${contractPath} ${status}`);
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

  const company = await pool.query<{ id: string }>(
    `insert into company (code, legal_name) values ('ODO', 'شرکت تست سفارش') returning id`,
  );
  companyId = company.rows[0].id;
  await pool.query(
    `insert into branch (company_id, code, name) values ($1, 'MAIN', 'شعبه مرکزی')`,
    [companyId],
  );

  // کالا + لیست قیمت با قیمت فعال برای کالا
  const category = await pool.query<{ id: string }>(
    `insert into product_category (company_id, code, name) values ($1, 'BEV', 'نوشیدنی') returning id`,
    [companyId],
  );
  const product = await pool.query<{ id: string }>(
    `insert into product (company_id, code, name, category_id, base_uom_id)
     values ($1, 'P-1', 'کالای تست', $2, (select id from uom where code = 'pcs'))
     returning id`,
    [companyId, category.rows[0].id],
  );
  productId = product.rows[0].id;
  const priceList = await pool.query<{ id: string }>(
    `insert into price_list (company_id, code, title, kind) values ($1, 'PL-MAIN', 'لیست اصلی', 'general') returning id`,
    [companyId],
  );
  priceListId = priceList.rows[0].id;
  await pool.query(
    `insert into price_list_item (price_list_id, product_id, price, min_qty, valid)
     values ($1, $2, 1500, 0, daterange(current_date - 30, current_date + 30))`,
    [priceListId, productId],
  );

  // مشتری با لیست قیمت پیش‌فرض
  const person = await pool.query<{ id: string }>(
    `insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, 'C-P-1', 'natural', 'مشتری', 'سفارش') returning id`,
    [companyId],
  );
  const customer = await pool.query<{ id: string }>(
    `insert into customer (person_id, branch_id, code, price_list_id)
     values ($1, (select id from branch where company_id = $2), 'CU-1', $3)
     returning id`,
    [person.rows[0].id, companyId, priceListId],
  );
  customerId = customer.rows[0].id;

  // ادمین همه‌مجوز + بینندهٔ بدون مجوز سفارش
  const adminPerson = await pool.query<{ id: string }>(
    `insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, 'ADM-1', 'natural', 'مدیر', 'سیستم') returning id`,
    [companyId],
  );
  await pool.query(
    `insert into app_user (person_id, username, password_hash, access_level) values ($1, $2, $3, 'web')`,
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

  const viewerRole = await pool.query<{ id: string }>(
    `insert into role (company_id, code, name) values ($1, 'viewer', 'بیننده') returning id`,
    [companyId],
  );
  await pool.query(
    `insert into role_permission (role_id, permission_code)
     select $1, code from permission where code = 'master.product.view'`,
    [viewerRole.rows[0].id],
  );
  const viewerPerson = await pool.query<{ id: string }>(
    `insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, 'VW-1', 'natural', 'بیننده', 'آزمایشی') returning id`,
    [companyId],
  );
  await pool.query(
    `insert into app_user (person_id, username, password_hash, access_level) values ($1, $2, $3, 'web')`,
    [viewerPerson.rows[0].id, VIEWER_USER, viewerHash],
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

const MISSING = '11111111-1111-4111-8111-111111111111';

describe('OD — 401 بدون توکن روی همه مسیرها', () => {
  it('orders بدون توکن 401 ← Error', async () => {
    const cases: [string, string, string, unknown?][] = [
      ['get', '/orders', '/api/v1/orders'],
      ['post', '/orders', '/api/v1/orders', { customer_id: MISSING, order_date: '2024-05-01' }],
      ['get', '/orders/{id}', `/api/v1/orders/${MISSING}`],
      ['patch', '/orders/{id}', `/api/v1/orders/${MISSING}`, {}],
      ['post', '/orders/{id}/approve', `/api/v1/orders/${MISSING}/approve`],
    ];
    for (const [method, contractPath, url, body] of cases) {
      const m = method as 'get' | 'post' | 'patch';
      let req = api(null)[m](url);
      if (body !== undefined) req = req.send(body);
      const res = await req.expect(401);
      expectBodyMatchesSchema(method, contractPath, 401, res.body);
    }
  });
});

describe('OD — 403 بدون مجوز روی همه مسیرها', () => {
  it('بیننده روی sales.order 403 ← Error با جزئیات مجوز', async () => {
    const viewer = { Authorization: `Bearer ${viewerToken}` };
    const cases: [string, string, string, unknown?][] = [
      ['get', '/orders', '/api/v1/orders'],
      ['post', '/orders', '/api/v1/orders', { customer_id: MISSING, order_date: '2024-05-01' }],
      ['get', '/orders/{id}', `/api/v1/orders/${MISSING}`],
      ['patch', '/orders/{id}', `/api/v1/orders/${MISSING}`, {}],
      ['post', '/orders/{id}/approve', `/api/v1/orders/${MISSING}/approve`],
    ];
    for (const [method, contractPath, url, body] of cases) {
      const m = method as 'get' | 'post' | 'patch';
      let req = api(null)[m](url).set(viewer);
      if (body !== undefined) req = req.send(body);
      const res = await req.expect(403);
      expectBodyMatchesSchema(method, contractPath, 403, res.body);
      expect(res.body.code).toBe('forbidden');
      expect(res.body.details?.required?.[0]).toMatch(/^sales\.order\./);
    }
  });
});

describe('OD — /orders', () => {
  let orderId = '';

  it('ساخت 201 ← SalesOrder با محاسبه مبالغ از اقلام', async () => {
    const res = await api()
      .post('/api/v1/orders')
      .send({
        customer_id: customerId,
        order_date: '2024-05-01',
        // TASK-24F · HIGH-3: دلیلِ قیمتِ دستیِ متفاوت از قیمتِ سیستمی الزامی است
        price_override_reason: 'قیمتِ توافقیِ آزمون',
        lines: [{ product_id: productId, qty: 3, unit_price: '1000', discount_amount: '200' }],
      })
      .expect(201);
    expectBodyMatchesSchema('post', '/orders', 201, res.body);
    orderId = res.body.id;
    createdOrders.push(orderId);
    expect(res.body.status).toBe('draft');
    expect(res.body.doc_number).toMatch(/^SO-/);
    expect(Number(res.body.fiscal_year)).toBeGreaterThanOrEqual(1300);
    expect(res.body.subtotal).toBe('3000.00');
    expect(res.body.discount_total).toBe('200.00');
    expect(res.body.tax_total).toBe('0.00');
    expect(res.body.grand_total).toBe('2800.00');
    expect(res.body.customer_id).toBe(customerId);
    expect(res.body.branch_id).toBeTruthy();
  });

  it('بدون unit_price ← قیمت از لیست قیمت مشتری خوانده می‌شود', async () => {
    const res = await api()
      .post('/api/v1/orders')
      .send({
        customer_id: customerId,
        order_date: '2024-05-02',
        lines: [{ product_id: productId, qty: 2 }],
      })
      .expect(201);
    expectBodyMatchesSchema('post', '/orders', 201, res.body);
    createdOrders.push(res.body.id);
    expect(res.body.subtotal).toBe('3000.00'); // 2 × 1500 از price_list_item
    expect(res.body.grand_total).toBe('3000.00');
  });

  it('بدون customer_id 400 ← validation_failed', async () => {
    const res = await api().post('/api/v1/orders').send({ order_date: '2024-05-01' }).expect(400);
    expectBodyMatchesSchema('post', '/orders', 400, res.body);
    expect(res.body.code).toBe('validation_failed');
  });

  it('مشتری ناموجود 400 ← customer_not_found', async () => {
    const res = await api()
      .post('/api/v1/orders')
      .send({ customer_id: MISSING, order_date: '2024-05-01' })
      .expect(400);
    expectBodyMatchesSchema('post', '/orders', 400, res.body);
    expect(res.body.code).toBe('customer_not_found');
  });

  it('کالای ناموجود در قلم 400 ← product_not_found', async () => {
    const res = await api()
      .post('/api/v1/orders')
      .send({
        customer_id: customerId,
        order_date: '2024-05-01',
        lines: [{ product_id: MISSING, qty: 1, unit_price: '100' }],
      })
      .expect(400);
    expectBodyMatchesSchema('post', '/orders', 400, res.body);
    expect(res.body.code).toBe('product_not_found');
  });

  it('client_uuid تکراری 409 ← duplicate_client', async () => {
    const body = {
      customer_id: customerId,
      order_date: '2024-05-03',
      client_uuid: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      price_override_reason: 'قیمتِ توافقیِ آزمون',
      lines: [{ product_id: productId, qty: 1, unit_price: '1000' }],
    };
    await api().post('/api/v1/orders').send(body).expect(201);
    const res = await api().post('/api/v1/orders').send(body).expect(409);
    expectBodyMatchesSchema('post', '/orders', 409, res.body);
    expect(res.body.code).toBe('duplicate_client');
  });

  it('فهرست 200 ← Page + items[SalesOrder]؛ فیلتر status و limit نامعتبر 400', async () => {
    const list = await api().get('/api/v1/orders').expect(200);
    expectBodyMatchesSchema('get', '/orders', 200, list.body);
    expect(list.body.items.length).toBeGreaterThan(0);

    const filtered = await api().get('/api/v1/orders').query({ status: 'draft' }).expect(200);
    expectBodyMatchesSchema('get', '/orders', 200, filtered.body);
    expect(filtered.body.items.every((o: any) => o.status === 'draft')).toBe(true);

    const bad = await api().get('/api/v1/orders').query({ status: 'bogus' }).expect(400);
    expectBodyMatchesSchema('get', '/orders', 400, bad.body);
  });

  it('جزئیات 200 ← SalesOrder با lines؛ شناسه خراب 400 و ناموجود 404', async () => {
    const detail = await api().get(`/api/v1/orders/${orderId}`).expect(200);
    expectBodyMatchesSchema('get', '/orders/{id}', 200, detail.body);
    expect(detail.body.lines).toHaveLength(1);
    expect(detail.body.lines[0].product_id).toBe(productId);
    expect(detail.body.lines[0].qty).toBe(3);
    // unit_price numeric(19,4) → قرارداد string است؛ دقت اعشار مهم نیست
    expect(parseFloat(detail.body.lines[0].unit_price)).toBe(1000);

    const bad = await api().get('/api/v1/orders/abc').expect(400);
    expectBodyMatchesSchema('get', '/orders/{id}', 400, bad.body);

    const miss = await api().get(`/api/v1/orders/${MISSING}`).expect(404);
    expectBodyMatchesSchema('get', '/orders/{id}', 404, miss.body);
  });

  it('ویرایش در draft 200 ← مبالغ تازه محاسبه می‌شود؛ خراب 400 و ناموجود 404', async () => {
    const patched = await api()
      .patch(`/api/v1/orders/${orderId}`)
      .send({
        note: 'سفارش آزمایشی',
        price_override_reason: 'قیمتِ توافقیِ آزمون',
        lines: [{ product_id: productId, qty: 5, unit_price: '2000' }],
      })
      .expect(200);
    expectBodyMatchesSchema('patch', '/orders/{id}', 200, patched.body);
    expect(patched.body.note).toBe('سفارش آزمایشی');
    expect(patched.body.subtotal).toBe('10000.00');
    expect(patched.body.grand_total).toBe('10000.00');

    const bad = await api().patch('/api/v1/orders/abc').send({ note: 'X' }).expect(400);
    expectBodyMatchesSchema('patch', '/orders/{id}', 400, bad.body);

    const miss = await api().patch(`/api/v1/orders/${MISSING}`).send({ note: 'X' }).expect(404);
    expectBodyMatchesSchema('patch', '/orders/{id}', 404, miss.body);
  });

  it('تأیید 200 ← status=approved؛ شناسه خراب 400 و ناموجود 404', async () => {
    const res = await api().post(`/api/v1/orders/${orderId}/approve`).expect(200);
    expectBodyMatchesSchema('post', '/orders/{id}/approve', 200, res.body);
    expect(res.body.status).toBe('approved');

    const bad = await api().post('/api/v1/orders/abc/approve').expect(400);
    expectBodyMatchesSchema('post', '/orders/{id}/approve', 400, bad.body);

    const miss = await api().post(`/api/v1/orders/${MISSING}/approve`).expect(404);
    expectBodyMatchesSchema('post', '/orders/{id}/approve', 404, miss.body);
  });

  it('تأیید مجدد 409 ← not_approvable', async () => {
    const res = await api().post(`/api/v1/orders/${orderId}/approve`).expect(409);
    expectBodyMatchesSchema('post', '/orders/{id}/approve', 409, res.body);
    expect(res.body.code).toBe('not_approvable');
  });

  it('ویرایش بعد از تأیید 409 ← not_editable', async () => {
    const res = await api()
      .patch(`/api/v1/orders/${orderId}`)
      .send({ note: 'نامعتبر' })
      .expect(409);
    expectBodyMatchesSchema('patch', '/orders/{id}', 409, res.body);
    expect(res.body.code).toBe('not_editable');
  });
});

describe('OD — پوشش خطاهای مستندشده', () => {
  it('همه خطاهای مستندشده در این فایل آزموده شده‌اند', () => {
    const ops: [string, string][] = [
      ['get', '/orders'],
      ['post', '/orders'],
      ['get', '/orders/{id}'],
      ['patch', '/orders/{id}'],
      ['post', '/orders/{id}/approve'],
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
