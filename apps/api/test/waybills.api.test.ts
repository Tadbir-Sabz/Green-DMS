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
 * تست API حواله انبار — /waybills مطابق openapi.yaml (فاز D):
 * ۱) دیتابیس موقت «greendms_waybills_test» از صفر + همه مهاجرت‌ها
 * ۲) seed: شرکت/شعبه + مشتری + انبار + کالا + سفارش فروش + ادمین/بیننده
 * ۳) گاردها (401/403)، اعتبارسنجی (400)، 404، جریان ساخت و لیست
 * ۴) assertion پوششی: همه خطاهای مستندشدهٔ /waybills آزموده شده‌اند
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_waybills_test';
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

const ADMIN_USER = 'wb_admin';
const ADMIN_PASSWORD = 'S3cret!pass';
const VIEWER_USER = 'wb_viewer';
const VIEWER_PASSWORD = 'View!pass1';

let adminToken = '';
let viewerToken = '';
let companyId = '';
let customerId = '';
let warehouseId = '';
let productId = '';
let orderId = '';

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
  exercisedErrors.add(`${method.toUpperCase()} ${contractPath} ${status}`);
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
    `insert into company (code, legal_name) values ('WBCO', 'شرکت تست حواله') returning id`,
  );
  companyId = company.rows[0].id;
  await pool.query(
    `insert into branch (company_id, code, name) values ($1, 'MAIN', 'شعبه مرکزی')`,
    [companyId],
  );

  const person = await pool.query<{ id: string }>(
    `insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, 'CUST-1', 'natural', 'مشتری', 'تست') returning id`,
    [companyId],
  );
  customerId = (
    await pool.query<{ id: string }>(
      `insert into customer (person_id, branch_id, code, channel)
       select $1, id, 'C-1', 'retail' from branch where company_id = $2
       returning id`,
      [person.rows[0].id, companyId],
    )
  ).rows[0].id;

  warehouseId = (
    await pool.query<{ id: string }>(
      `insert into warehouse (branch_id, code, name)
       select id, 'WH-1', 'انبار مرکزی' from branch where company_id = $1
       returning id`,
      [companyId],
    )
  ).rows[0].id;

  await pool.query(`insert into uom (code, title) values ('WBPCS', 'عدد')`);
  const category = await pool.query<{ id: string }>(
    `insert into product_category (company_id, code, name) values ($1, 'CAT-1', 'دسته تست') returning id`,
    [companyId],
  );
  productId = (
    await pool.query<{ id: string }>(
      `insert into product (company_id, code, name, category_id, base_uom_id)
       select $1, 'PRD-1', 'کالای حواله', $2, id from uom where code = 'WBPCS'
       returning id`,
      [companyId, category.rows[0].id],
    )
  ).rows[0].id;

  orderId = (
    await pool.query<{ id: string }>(
      `insert into sales_order (branch_id, doc_number, fiscal_year, customer_id)
       select id, 'SO-1', extract(year from now())::int, $1
         from branch where company_id = $2
       returning id`,
      [customerId, companyId],
    )
  ).rows[0].id;

  // ادمین همه‌مجوز + بینندهٔ بدون مجوز حواله
  const adminPerson = await pool.query<{ id: string }>(
    `insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, 'ADM-1', 'natural', 'مدیر', 'سیستم') returning id`,
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
    `insert into app_user (person_id, username, password_hash, access_level)
     values ($1, $2, $3, 'web')`,
    [viewerPerson.rows[0].id, VIEWER_USER, viewerHash],
  );
  await pool.query(
    `insert into user_role (app_user_id, role_id) select u.id, $1 from app_user u where u.username = $2`,
    [viewerRole.rows[0].id, VIEWER_USER],
  );

  process.env.DATABASE_URL = testUrl.toString();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ logger: process.env.TEST_LOGGER === "1" ? ["error", "warn"] : false });
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

describe('WB — گاردها: 401 بدون توکن و 403 بدون مجوز', () => {
  it('بدون توکن 401 ← Error', async () => {
    expectBodyMatchesSchema('get', '/waybills', 401, (await api(null).get('/api/v1/waybills').expect(401)).body);
    expectBodyMatchesSchema(
      'post',
      '/waybills',
      401,
      (await api(null).post('/api/v1/waybills').send({ sales_order_id: MISSING, warehouse_id: MISSING }).expect(401)).body,
    );
    expectBodyMatchesSchema('get', '/waybills/{id}', 401, (await api(null).get(`/api/v1/waybills/${MISSING}`).expect(401)).body);
  });

  it('بیننده روی حواله 403 ← Error با جزئیات مجوز', async () => {
    const viewer = { Authorization: `Bearer ${viewerToken}` };
    const assertForbidden = (b: { code?: string; details?: { required?: string[] } }) => {
      expect(b.code).toBe('forbidden');
      expect(b.details?.required?.[0]).toMatch(/^sales\.waybill\./);
    };

    const list = await api(null).get('/api/v1/waybills').set(viewer).expect(403);
    expectBodyMatchesSchema('get', '/waybills', 403, list.body);
    assertForbidden(list.body);

    const create = await api(null)
      .post('/api/v1/waybills')
      .set(viewer)
      .send({ sales_order_id: MISSING, warehouse_id: MISSING })
      .expect(403);
    expectBodyMatchesSchema('post', '/waybills', 403, create.body);
    assertForbidden(create.body);

    const get = await api(null).get(`/api/v1/waybills/${MISSING}`).set(viewer).expect(403);
    expectBodyMatchesSchema('get', '/waybills/{id}', 403, get.body);
    assertForbidden(get.body);
  });
});

describe('WB — جریان /waybills', () => {
  let waybillId = '';

  it('ساخت 201 ← Waybill با قلم', async () => {
    const res = await api()
      .post('/api/v1/waybills')
      .send({
        sales_order_id: orderId,
        warehouse_id: warehouseId,
        lines: [{ product_id: productId, qty: 5 }],
        note: 'حواله تست',
      })
      .expect(201);
    expectBodyMatchesSchema('post', '/waybills', 201, res.body);
    waybillId = res.body.id;
    expect(res.body.status).toBe('draft');
    expect(res.body.doc_number).toMatch(/^WB-/);
    expect(res.body.customer_id).toBe(customerId); // از سفارش آمده
    expect(res.body.lines).toHaveLength(1);
    expect(res.body.lines[0].qty).toBe(5);
  });

  it('بدون sales_order_id 400 ← validation_failed', async () => {
    const res = await api().post('/api/v1/waybills').send({ warehouse_id: warehouseId }).expect(400);
    expectBodyMatchesSchema('post', '/waybills', 400, res.body);
    expect(res.body.code).toBe('validation_failed');
  });

  it('سفارش ناموجود 400 ← sales_order_not_found', async () => {
    const res = await api()
      .post('/api/v1/waybills')
      .send({ sales_order_id: MISSING, warehouse_id: warehouseId })
      .expect(400);
    expectBodyMatchesSchema('post', '/waybills', 400, res.body);
    expect(res.body.code).toBe('sales_order_not_found');
  });

  it('انبار ناموجود 400 ← warehouse_or_order_not_found', async () => {
    const res = await api()
      .post('/api/v1/waybills')
      .send({ sales_order_id: orderId, warehouse_id: MISSING })
      .expect(400);
    expectBodyMatchesSchema('post', '/waybills', 400, res.body);
    expect(res.body.code).toBe('warehouse_or_order_not_found');
  });

  it('کالای شرکت دیگر 400 ← product_not_found', async () => {
    const res = await api()
      .post('/api/v1/waybills')
      .send({
        sales_order_id: orderId,
        warehouse_id: warehouseId,
        lines: [{ product_id: MISSING, qty: 1 }],
      })
      .expect(400);
    expectBodyMatchesSchema('post', '/waybills', 400, res.body);
    expect(res.body.code).toBe('product_not_found');
  });

  it('جزئیات 200 ← Waybill با اقلام؛ شناسه خراب 400 و ناموجود 404', async () => {
    const detail = await api().get(`/api/v1/waybills/${waybillId}`).expect(200);
    expectBodyMatchesSchema('get', '/waybills/{id}', 200, detail.body);
    expect(detail.body.id).toBe(waybillId);

    const bad = await api().get('/api/v1/waybills/abc').expect(400);
    expectBodyMatchesSchema('get', '/waybills/{id}', 400, bad.body);
    expect(bad.body.code).toBe('invalid_id');

    const miss = await api().get(`/api/v1/waybills/${MISSING}`).expect(404);
    expectBodyMatchesSchema('get', '/waybills/{id}', 404, miss.body);
    expect(miss.body.code).toBe('not_found');
  });

  it('لیست 200 ← Page + فیلتر order_id و status', async () => {
    const res = await api().get('/api/v1/waybills').expect(200);
    expectBodyMatchesSchema('get', '/waybills', 200, res.body);
    expect(res.body.items.length).toBeGreaterThan(0);

    const byOrder = await api().get('/api/v1/waybills').query({ order_id: orderId }).expect(200);
    expect(byOrder.body.items.every((w: { sales_order_id: string }) => w.sales_order_id === orderId)).toBe(true);

    const byStatus = await api().get('/api/v1/waybills').query({ status: 'draft' }).expect(200);
    expect(byStatus.body.items.every((w: { status: string }) => w.status === 'draft')).toBe(true);
  });
});

describe('WB — پوشش خطاهای مستندشدهٔ /waybills', () => {
  it('همه خطاهای مستندشده در همین فایل آزموده شده‌اند', () => {
    const ops: [string, string][] = [
      ['get', '/waybills'],
      ['post', '/waybills'],
      ['get', '/waybills/{id}'],
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
