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
 * تست API انبار: GET /stock، POST /stock/adjustments، چرخهٔ کامل /stocktakes
 * و /transfers — با همان گاردهای ماژول (AuthGuard + PermissionsGuard).
 * ۱) دیتابیس موقت «greendms_inventory_test» از صفر + مهاجرت‌ها
 * ۲) seed: شرکت/شعبه، دسته/کالا/واحد، دو انبار، ادمین همه‌مجوز و بینندهٔ بدون مجوز انبار
 * ۳) اعتبارسنجی بدنه‌ها با ajv (JSON Schema 2020-12) + assertion پوششی خطاهای مستندشده
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_inventory_test';
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

const ADMIN_USER = 'inv_admin';
const ADMIN_PASSWORD = 'S3cret!pass';
const VIEWER_USER = 'inv_viewer';
const VIEWER_PASSWORD = 'View!pass1';

let adminToken = '';
let viewerToken = '';
let companyId = '';
let productId = '';
let wh1 = '';
let wh2 = '';

let stocktakeId = '';
let transferId = '';

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
    `insert into company (code, legal_name) values ('INVCO', 'شرکت تست انبار') returning id`,
  );
  companyId = company.rows[0].id;
  await pool.query(
    `insert into branch (company_id, code, name) values ($1, 'MAIN', 'شعبه مرکزی')`,
    [companyId],
  );

  // دسته + کالا (unit از seed 0022: pcs)
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

  // دو انبار (WH1 بدون موجودی منفی برای آزمون 422)
  const w1 = await pool.query<{ id: string }>(
    `insert into warehouse (branch_id, code, name, kind)
     select id, 'WH1', 'انبار ۱', 'main' from branch where company_id = $1 returning id`,
    [companyId],
  );
  wh1 = w1.rows[0].id;
  const w2 = await pool.query<{ id: string }>(
    `insert into warehouse (branch_id, code, name, kind)
     select id, 'WH2', 'انبار ۲', 'main' from branch where company_id = $1 returning id`,
    [companyId],
  );
  wh2 = w2.rows[0].id;

  // ادمین همه‌مجوز + بینندهٔ بدون مجوز انبار
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

describe('INV — 401 بدون توکن روی همه مسیرها', () => {
  it('همه endpoint ها بدون توکن 401 ← Error', async () => {
    const cases: [string, string, string, unknown?][] = [
      ['get', '/stock', '/api/v1/stock'],
      ['post', '/stock/adjustments', '/api/v1/stock/adjustments', { warehouse_id: wh1, product_id: productId, qty_delta: 1, reason_code: 'damage' }],
      ['get', '/stocktakes', '/api/v1/stocktakes'],
      ['post', '/stocktakes', '/api/v1/stocktakes', { warehouse_id: wh1 }],
      ['get', '/stocktakes/{id}', `/api/v1/stocktakes/${MISSING}`],
      ['patch', '/stocktakes/{id}', `/api/v1/stocktakes/${MISSING}`, {}],
      ['post', '/stocktakes/{id}/submit', `/api/v1/stocktakes/${MISSING}/submit`],
      ['get', '/transfers', '/api/v1/transfers'],
      ['post', '/transfers', '/api/v1/transfers', { from_warehouse_id: wh1, to_warehouse_id: wh2, lines: [] }],
      ['get', '/transfers/{id}', `/api/v1/transfers/${MISSING}`],
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

describe('INV — 403 بدون مجوز روی همه مسیرها', () => {
  it('همه endpoint ها برای بیننده 403 ← Error با جزئیات مجوز inventory', async () => {
    const viewer = { Authorization: `Bearer ${viewerToken}` };
    const cases: [string, string, string, unknown?][] = [
      ['get', '/stock', '/api/v1/stock'],
      ['post', '/stock/adjustments', '/api/v1/stock/adjustments', { warehouse_id: wh1, product_id: productId, qty_delta: 1, reason_code: 'damage' }],
      ['get', '/stocktakes', '/api/v1/stocktakes'],
      ['post', '/stocktakes', '/api/v1/stocktakes', { warehouse_id: wh1 }],
      ['get', '/stocktakes/{id}', `/api/v1/stocktakes/${MISSING}`],
      ['patch', '/stocktakes/{id}', `/api/v1/stocktakes/${MISSING}`, {}],
      ['post', '/stocktakes/{id}/submit', `/api/v1/stocktakes/${MISSING}/submit`],
      ['get', '/transfers', '/api/v1/transfers'],
      ['post', '/transfers', '/api/v1/transfers', { from_warehouse_id: wh1, to_warehouse_id: wh2, lines: [] }],
      ['get', '/transfers/{id}', `/api/v1/transfers/${MISSING}`],
    ];
    for (const [method, contractPath, url, body] of cases) {
      const m = method as 'get' | 'post' | 'patch';
      let req = api(null)[m](url).set(viewer);
      if (body !== undefined) req = req.send(body);
      const res = await req.expect(403);
      expectBodyMatchesSchema(method, contractPath, 403, res.body);
      expect(res.body.code).toBe('forbidden');
      expect(res.body.details?.required?.[0]).toMatch(/^inventory\./);
    }
  });
});

describe('INV — GET /stock', () => {
  it('200 ← Page + items[StockBalance]', async () => {
    const res = await api().get('/api/v1/stock').expect(200);
    expectBodyMatchesSchema('get', '/stock', 200, res.body);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('فیلتر warehouse_id نامعتبر 400 ← Error', async () => {
    const res = await api().get('/api/v1/stock').query({ warehouse_id: 'not-a-uuid' }).expect(400);
    expectBodyMatchesSchema('get', '/stock', 400, res.body);
    expect(res.body.code).toBe('validation_failed');
  });
});

describe('INV — POST /stock/adjustments', () => {
  it('ساخت اصلاحیه مثبت 201 ← StockAdjustment', async () => {
    const res = await api()
      .post('/api/v1/stock/adjustments')
      .send({ warehouse_id: wh1, product_id: productId, qty_delta: 10, reason_code: 'count_fix', note: 'اصلاح اولیه' })
      .expect(201);
    expectBodyMatchesSchema('post', '/stock/adjustments', 201, res.body);
    expect(res.body.warehouse_id).toBe(wh1);
    expect(res.body.product_id).toBe(productId);
    expect(res.body.qty_delta).toBe(10);
    expect(res.body.reason_code).toBe('count_fix');
  });

  it('موجودی منفی 422 ← RuleRejected (fn_apply_stock_txn)', async () => {
    const res = await api()
      .post('/api/v1/stock/adjustments')
      .send({ warehouse_id: wh1, product_id: productId, qty_delta: -100, reason_code: 'damage' })
      .expect(422);
    expectBodyMatchesSchema('post', '/stock/adjustments', 422, res.body);
    expect(res.body.code).toBe('negative_stock_forbidden');
    expect(res.body.message_fa).toMatch(/[؀-ۿ]/);
  });

  it('انبار ناموجود 400 ← Error', async () => {
    const res = await api()
      .post('/api/v1/stock/adjustments')
      .send({ warehouse_id: MISSING, product_id: productId, qty_delta: 1, reason_code: 'damage' })
      .expect(400);
    expectBodyMatchesSchema('post', '/stock/adjustments', 400, res.body);
    expect(res.body.code).toBe('warehouse_not_found');
  });

  it('بدون product_id 400 ← validation_failed', async () => {
    const res = await api()
      .post('/api/v1/stock/adjustments')
      .send({ warehouse_id: wh1, qty_delta: 1, reason_code: 'damage' })
      .expect(400);
    expectBodyMatchesSchema('post', '/stock/adjustments', 400, res.body);
    expect(res.body.code).toBe('validation_failed');
  });
});

describe('INV — GET /stocktakes', () => {
  it('200 ← Page + items[StockTake]', async () => {
    const res = await api().get('/api/v1/stocktakes').expect(200);
    expectBodyMatchesSchema('get', '/stocktakes', 200, res.body);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('فیلتر status نامعتبر 400 ← Error', async () => {
    const res = await api().get('/api/v1/stocktakes').query({ status: 'bogus' }).expect(400);
    expectBodyMatchesSchema('get', '/stocktakes', 400, res.body);
    expect(res.body.code).toBe('validation_failed');
  });
});

describe('INV — چرخه کامل /stocktakes', () => {
  it('ساخت 201 ← StockTake (draft)', async () => {
    const res = await api().post('/api/v1/stocktakes').send({ warehouse_id: wh1 }).expect(201);
    expectBodyMatchesSchema('post', '/stocktakes', 201, res.body);
    stocktakeId = res.body.id;
    expect(res.body.status).toBe('draft');
    expect(res.body.warehouse_id).toBe(wh1);
  });

  it('ساخت بدون warehouse_id 400 ← validation_failed', async () => {
    const res = await api().post('/api/v1/stocktakes').send({}).expect(400);
    expectBodyMatchesSchema('post', '/stocktakes', 400, res.body);
    expect(res.body.code).toBe('validation_failed');
  });

  it('جزئیات 200 ← StockTake با اقلام', async () => {
    const res = await api().get(`/api/v1/stocktakes/${stocktakeId}`).expect(200);
    expectBodyMatchesSchema('get', '/stocktakes/{id}', 200, res.body);
    expect(Array.isArray(res.body.lines)).toBe(true);
  });

  it('جزئیات شناسه خراب 400 و ناموجود 404', async () => {
    const bad = await api().get('/api/v1/stocktakes/abc').expect(400);
    expectBodyMatchesSchema('get', '/stocktakes/{id}', 400, bad.body);
    const miss = await api().get(`/api/v1/stocktakes/${MISSING}`).expect(404);
    expectBodyMatchesSchema('get', '/stocktakes/{id}', 404, miss.body);
  });

  it('ثبت شمارش اقلام 200 ← system_qty/counted_qty/variance', async () => {
    const res = await api()
      .patch(`/api/v1/stocktakes/${stocktakeId}`)
      .send({ lines: [{ product_id: productId, counted_qty: 12 }] })
      .expect(200);
    expectBodyMatchesSchema('patch', '/stocktakes/{id}', 200, res.body);
    const line = res.body.lines.find((l: any) => l.product_id === productId);
    expect(line).toBeTruthy();
    expect(line.system_qty).toBe(10); // مانده پس از اصلاحیه +10
    expect(line.counted_qty).toBe(12);
    expect(line.variance_qty).toBe(2);
  });

  it('قفل خوش‌بینانه 409 ← version_conflict', async () => {
    const fresh = await api().get(`/api/v1/stocktakes/${stocktakeId}`).expect(200);
    expect(typeof fresh.body.row_version).toBe('number');

    const res = await api()
      .patch(`/api/v1/stocktakes/${stocktakeId}`)
      .send({ status: 'counting', row_version: fresh.body.row_version + 99 })
      .expect(409);
    expectBodyMatchesSchema('patch', '/stocktakes/{id}', 409, res.body);
    expect(res.body.code).toBe('version_conflict');
  });

  it('patch شناسه خراب 400 و ناموجود 404', async () => {
    const bad = await api().patch('/api/v1/stocktakes/abc').send({ status: 'counting' }).expect(400);
    expectBodyMatchesSchema('patch', '/stocktakes/{id}', 400, bad.body);
    const miss = await api().patch(`/api/v1/stocktakes/${MISSING}`).send({ status: 'counting' }).expect(404);
    expectBodyMatchesSchema('patch', '/stocktakes/{id}', 404, miss.body);
  });

  it('submit 200 ← اعمال مغایرت و وضعیت posted', async () => {
    const res = await api().post(`/api/v1/stocktakes/${stocktakeId}/submit`).expect(200);
    expectBodyMatchesSchema('post', '/stocktakes/{id}/submit', 200, res.body);
    expect(res.body.status).toBe('posted');
  });

  it('submit دوباره 409 ← already_final', async () => {
    const res = await api().post(`/api/v1/stocktakes/${stocktakeId}/submit`).expect(409);
    expectBodyMatchesSchema('post', '/stocktakes/{id}/submit', 409, res.body);
    expect(res.body.code).toBe('already_final');
  });

  it('submit بدون قلم شمارش‌شده 400 ← no_counted_lines', async () => {
    const empty = await api().post('/api/v1/stocktakes').send({ warehouse_id: wh2 }).expect(201);
    const res = await api().post(`/api/v1/stocktakes/${empty.body.id}/submit`).expect(400);
    expectBodyMatchesSchema('post', '/stocktakes/{id}/submit', 400, res.body);
    expect(res.body.code).toBe('no_counted_lines');
  });

  it('submit شناسه خراب 400', async () => {
    const res = await api().post('/api/v1/stocktakes/abc/submit').expect(400);
    expectBodyMatchesSchema('post', '/stocktakes/{id}/submit', 400, res.body);
    expect(res.body.code).toBe('invalid_id');
  });
});

describe('INV — /transfers', () => {
  it('ساخت انتقال 201 ← Transfer با قلم', async () => {
    const res = await api()
      .post('/api/v1/transfers')
      .send({ from_warehouse_id: wh1, to_warehouse_id: wh2, lines: [{ product_id: productId, qty: 5 }] })
      .expect(201);
    expectBodyMatchesSchema('post', '/transfers', 201, res.body);
    transferId = res.body.id;
    expect(res.body.status).toBe('draft');
    expect(res.body.from_warehouse_id).toBe(wh1);
    expect(res.body.to_warehouse_id).toBe(wh2);
    expect(res.body.lines).toHaveLength(1);
    expect(res.body.lines[0].qty).toBe(5);
  });

  it('مبدأ و مقصد یکسان 400 ← same_warehouse', async () => {
    const res = await api()
      .post('/api/v1/transfers')
      .send({ from_warehouse_id: wh1, to_warehouse_id: wh1, lines: [{ product_id: productId, qty: 1 }] })
      .expect(400);
    expectBodyMatchesSchema('post', '/transfers', 400, res.body);
    expect(res.body.code).toBe('same_warehouse');
  });

  it('بدون قلم 400 ← lines_required', async () => {
    const res = await api()
      .post('/api/v1/transfers')
      .send({ from_warehouse_id: wh1, to_warehouse_id: wh2, lines: [] })
      .expect(400);
    expectBodyMatchesSchema('post', '/transfers', 400, res.body);
    expect(res.body.code).toBe('lines_required');
  });

  it('انبار ناموجود 400 ← warehouse_not_found', async () => {
    const res = await api()
      .post('/api/v1/transfers')
      .send({ from_warehouse_id: MISSING, to_warehouse_id: wh2, lines: [{ product_id: productId, qty: 1 }] })
      .expect(400);
    expectBodyMatchesSchema('post', '/transfers', 400, res.body);
    expect(res.body.code).toBe('warehouse_not_found');
  });

  it('فهرست 200 ← Page + items[Transfer]', async () => {
    const res = await api().get('/api/v1/transfers').expect(200);
    expectBodyMatchesSchema('get', '/transfers', 200, res.body);
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it('فهرست limit نامعتبر 400 ← Error', async () => {
    const res = await api().get('/api/v1/transfers').query({ limit: 999 }).expect(400);
    expectBodyMatchesSchema('get', '/transfers', 400, res.body);
    expect(res.body.code).toBe('validation_failed');
  });

  it('جزئیات 200 ← Transfer؛ شناسه خراب 400 و ناموجود 404', async () => {
    const detail = await api().get(`/api/v1/transfers/${transferId}`).expect(200);
    expectBodyMatchesSchema('get', '/transfers/{id}', 200, detail.body);
    expect(detail.body.id).toBe(transferId);

    const bad = await api().get('/api/v1/transfers/abc').expect(400);
    expectBodyMatchesSchema('get', '/transfers/{id}', 400, bad.body);

    const miss = await api().get(`/api/v1/transfers/${MISSING}`).expect(404);
    expectBodyMatchesSchema('get', '/transfers/{id}', 404, miss.body);
  });
});

describe('INV — پوشش خطاهای مستندشده', () => {
  it('همه خطاهای مستندشده در این فایل آزموده شده‌اند', () => {
    const ops: [string, string][] = [
      ['get', '/stock'],
      ['post', '/stock/adjustments'],
      ['get', '/stocktakes'],
      ['post', '/stocktakes'],
      ['get', '/stocktakes/{id}'],
      ['patch', '/stocktakes/{id}'],
      ['post', '/stocktakes/{id}/submit'],
      ['get', '/transfers'],
      ['post', '/transfers'],
      ['get', '/transfers/{id}'],
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
