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
 * تست API تورها و بازدیدها (ماژول ۵): /tours، /tours/{id}، /tours/{id}/settlement،
 * /visits، /visits/{id} با گاردهای AuthGuard + PermissionsGuard.
 * ۱) دیتابیس موقت «greendms_tours_test» از صفر + مهاجرت‌ها
 * ۲) seed: شرکت/شعبه، job_position، فروشنده (staff)، مشتری با مختصات، ادمین و بیننده
 * ۳) اعتبارسنجی بدنه‌ها با ajv + assertion پوششی خطاهای مستندشده
 * ۴) رفتارهای کلیدی: 409 duplicate_tour (uq_tour)، ضدتقلب GPS (409 visit_too_far)،
 *    idempotency آفلاین بازدید (409 duplicate_client)، و تسویهٔ زندهٔ تور
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_tours_test';
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

const ADMIN_USER = 'tour_admin';
const ADMIN_PASSWORD = 'S3cret!pass';
const VIEWER_USER = 'tour_viewer';
const VIEWER_PASSWORD = 'View!pass1';

const MISSING = '11111111-1111-4111-8111-111111111111';
const VISIT_UUID = '33333333-3333-4333-8333-333333333333';
const TOUR_DATE = '2025-06-01';
const CUST_GEO: [number, number] = [51.389, 35.6892]; // موقعیت مشتری (تهران)
const FAR_GEO: [number, number] = [52.5, 36.5]; // بسیار دورتر از ۵۰۰ متر

let adminToken = '';
let viewerToken = '';
let companyId = '';
let branchId = '';
let salespersonId = '';
let customerId = '';
let tourId = '';
let visitId = '';

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
    `insert into company (code, legal_name) values ('TOURCO', 'شرکت تست تور') returning id`,
  );
  companyId = company.rows[0].id;
  const branch = await pool.query<{ id: string }>(
    `insert into branch (company_id, code, name) values ($1, 'MAIN', 'شعبه مرکزی') returning id`,
    [companyId],
  );
  branchId = branch.rows[0].id;

  // جایگاه شغلی + فروشنده (staff) — salesperson_id در تور به staff.id اشاره می‌کند
  await pool.query(
    `insert into job_position (company_id, code, title) values ($1, 'salesperson_cold', 'ویزیتور سرد')`,
    [companyId],
  );
  await pool.query(
    `insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, 'SP-1', 'natural', 'فروشنده', 'تست')`,
    [companyId],
  );
  const staff = await pool.query<{ id: string }>(
    `insert into staff (person_id, branch_id, job_position_id, employee_no, is_field)
     select p.id, $2, (select id from job_position where company_id = $1 and code = 'salesperson_cold'), '2001', true
       from person p where p.company_id = $1 and p.code = 'SP-1'
     returning id`,
    [companyId, branchId],
  );
  salespersonId = staff.rows[0].id;

  // مشتری با مختصات ثبت‌شده (برای سنجش فاصلهٔ ضدتقلب) — ck_customer_geo نیاز به
  // geo_source + geo_captured_at دارد
  await pool.query(
    `insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, 'CUST-1', 'natural', 'مشتری', 'تست')`,
    [companyId],
  );
  const customer = await pool.query<{ id: string }>(
    `insert into customer (person_id, branch_id, code, channel, geo, geo_source, geo_captured_at)
     select p.id, $2, 'C-1', 'retail',
            st_setsrid(st_makepoint($3, $4), 4326)::geography, 'gps', now()
       from person p where p.company_id = $1 and p.code = 'CUST-1'
     returning id`,
    [companyId, branchId, CUST_GEO[0], CUST_GEO[1]],
  );
  customerId = customer.rows[0].id;

  // ادمین همه‌مجوز + بیننده بدون مجوز تور
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

const TOUR_ROUTES: [string, string, string, unknown?][] = [
  ['get', '/tours', '/api/v1/tours'],
  ['post', '/tours', '/api/v1/tours', { tour_date: TOUR_DATE, kind: 'cold', salesperson_id: MISSING }],
  ['get', '/tours/{id}', `/api/v1/tours/${MISSING}`],
  ['patch', '/tours/{id}', `/api/v1/tours/${MISSING}`, { status: 'active' }],
  ['get', '/tours/{id}/settlement', `/api/v1/tours/${MISSING}/settlement`],
  ['get', '/visits', '/api/v1/visits'],
  ['post', '/visits', '/api/v1/visits', { tour_id: MISSING, customer_id: MISSING }],
  ['get', '/visits/{id}', `/api/v1/visits/${MISSING}`],
  ['patch', '/visits/{id}', `/api/v1/visits/${MISSING}`, { result: 'no_order' }],
];

describe('TOUR — 401 بدون توکن روی همه مسیرها', () => {
  it('همه endpoint ها بدون توکن 401 ← Error', async () => {
    for (const [method, contractPath, url, body] of TOUR_ROUTES) {
      const m = method as 'get' | 'post' | 'patch';
      let req = api(null)[m](url);
      if (body !== undefined) req = req.send(body);
      const res = await req.expect(401);
      expectBodyMatchesSchema(method, contractPath, 401, res.body);
    }
  });
});

describe('TOUR — 403 بدون مجوز روی همه مسیرها', () => {
  it('همه endpoint ها برای بیننده 403 ← Error با جزئیات مجوز tour', async () => {
    const viewer = { Authorization: `Bearer ${viewerToken}` };
    for (const [method, contractPath, url, body] of TOUR_ROUTES) {
      const m = method as 'get' | 'post' | 'patch';
      let req = api(null)[m](url).set(viewer);
      if (body !== undefined) req = req.send(body);
      const res = await req.expect(403);
      expectBodyMatchesSchema(method, contractPath, 403, res.body);
      expect(res.body.code).toBe('forbidden');
      expect(res.body.details?.required?.[0]).toMatch(/^tour\./);
    }
  });
});

describe('TOUR — POST /tours', () => {
  it('ساخت تور 201 ← Tour (status=planned, doc_number)', async () => {
    const res = await api()
      .post('/api/v1/tours')
      .send({ tour_date: TOUR_DATE, kind: 'cold', salesperson_id: salespersonId, note: 'تور اولیه' })
      .expect(201);
    expectBodyMatchesSchema('post', '/tours', 201, res.body);
    tourId = res.body.id;
    expect(res.body.status).toBe('planned');
    expect(res.body.tour_date).toBe(TOUR_DATE);
    expect(res.body.kind).toBe('cold');
    expect(res.body.salesperson_id).toBe(salespersonId);
    expect(typeof res.body.doc_number).toBe('string');
  });

  it('تور تکراری (uq_tour) 409 ← duplicate_tour', async () => {
    const res = await api()
      .post('/api/v1/tours')
      .send({ tour_date: TOUR_DATE, kind: 'cold', salesperson_id: salespersonId })
      .expect(409);
    expectBodyMatchesSchema('post', '/tours', 409, res.body);
    expect(res.body.code).toBe('duplicate_tour');
  });

  it('فروشندهٔ ناموجود 400 ← salesperson_not_found', async () => {
    const res = await api()
      .post('/api/v1/tours')
      .send({ tour_date: '2025-06-02', kind: 'warm', salesperson_id: MISSING })
      .expect(400);
    expectBodyMatchesSchema('post', '/tours', 400, res.body);
    expect(res.body.code).toBe('salesperson_not_found');
  });

  it('بدون tour_date 400 ← validation_failed', async () => {
    const res = await api()
      .post('/api/v1/tours')
      .send({ kind: 'cold', salesperson_id: salespersonId })
      .expect(400);
    expectBodyMatchesSchema('post', '/tours', 400, res.body);
    expect(res.body.code).toBe('validation_failed');
  });
});

describe('TOUR — GET /tours', () => {
  it('200 ← Page + items[Tour]', async () => {
    const res = await api().get('/api/v1/tours').expect(200);
    expectBodyMatchesSchema('get', '/tours', 200, res.body);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.some((t: any) => t.id === tourId)).toBe(true);
  });

  it('kind نامعتبر 400 ← validation_failed', async () => {
    const res = await api().get('/api/v1/tours').query({ kind: 'bogus' }).expect(400);
    expectBodyMatchesSchema('get', '/tours', 400, res.body);
    expect(res.body.code).toBe('validation_failed');
  });
});

describe('TOUR — GET /tours/{id}', () => {
  it('200 ← Tour', async () => {
    const res = await api().get(`/api/v1/tours/${tourId}`).expect(200);
    expectBodyMatchesSchema('get', '/tours/{id}', 200, res.body);
    expect(res.body.id).toBe(tourId);
  });

  it('شناسه خراب 400 ← invalid_id', async () => {
    const res = await api().get('/api/v1/tours/abc').expect(400);
    expectBodyMatchesSchema('get', '/tours/{id}', 400, res.body);
    expect(res.body.code).toBe('invalid_id');
  });

  it('تور ناموجود 404 ← not_found', async () => {
    const res = await api().get(`/api/v1/tours/${MISSING}`).expect(404);
    expectBodyMatchesSchema('get', '/tours/{id}', 404, res.body);
    expect(res.body.code).toBe('not_found');
  });
});

describe('TOUR — PATCH /tours/{id}', () => {
  it('شروع تور 200 ← status=active', async () => {
    const res = await api()
      .patch(`/api/v1/tours/${tourId}`)
      .send({ status: 'active', started_at: '2025-06-01T08:00:00Z' })
      .expect(200);
    expectBodyMatchesSchema('patch', '/tours/{id}', 200, res.body);
    expect(res.body.status).toBe('active');
  });

  it('پایان پیش از شروع 400 ← invalid_times', async () => {
    const res = await api()
      .patch(`/api/v1/tours/${tourId}`)
      .send({ started_at: '2025-06-01T10:00:00Z', ended_at: '2025-06-01T07:00:00Z' })
      .expect(400);
    expectBodyMatchesSchema('patch', '/tours/{id}', 400, res.body);
    expect(res.body.code).toBe('invalid_times');
  });

  it('شناسه خراب 400 ← invalid_id', async () => {
    const res = await api().patch('/api/v1/tours/abc').send({ status: 'active' }).expect(400);
    expectBodyMatchesSchema('patch', '/tours/{id}', 400, res.body);
    expect(res.body.code).toBe('invalid_id');
  });

  it('تور ناموجود 404 ← not_found', async () => {
    const res = await api().patch(`/api/v1/tours/${MISSING}`).send({ status: 'active' }).expect(404);
    expectBodyMatchesSchema('patch', '/tours/{id}', 404, res.body);
    expect(res.body.code).toBe('not_found');
  });
});

describe('TOUR — GET /tours/{id}/settlement', () => {
  it('200 ← TourSettlement (زنده، status=open وقتی تسویه ثبت نشده)', async () => {
    const res = await api().get(`/api/v1/tours/${tourId}/settlement`).expect(200);
    expectBodyMatchesSchema('get', '/tours/{id}/settlement', 200, res.body);
    expect(res.body.tour_id).toBe(tourId);
    expect(['open', 'reconciled', 'closed']).toContain(res.body.status);
  });

  it('شناسه خراب 400 ← invalid_id', async () => {
    const res = await api().get('/api/v1/tours/abc/settlement').expect(400);
    expectBodyMatchesSchema('get', '/tours/{id}/settlement', 400, res.body);
    expect(res.body.code).toBe('invalid_id');
  });

  it('تور ناموجود 404 ← not_found', async () => {
    const res = await api().get(`/api/v1/tours/${MISSING}/settlement`).expect(404);
    expectBodyMatchesSchema('get', '/tours/{id}/settlement', 404, res.body);
    expect(res.body.code).toBe('not_found');
  });
});

describe('TOUR — POST /visits', () => {
  it('check-in نزدیک مشتری 201 ← Visit (distance کوچک، result=order)', async () => {
    const res = await api()
      .post('/api/v1/visits')
      .send({
        tour_id: tourId,
        customer_id: customerId,
        check_in_at: '2025-06-01T08:10:00Z',
        geo_in: { type: 'Point', coordinates: CUST_GEO },
        accuracy_in_m: 8,
        client_uuid: VISIT_UUID,
      })
      .expect(201);
    expectBodyMatchesSchema('post', '/visits', 201, res.body);
    visitId = res.body.id;
    expect(res.body.tour_id).toBe(tourId);
    expect(res.body.customer_id).toBe(customerId);
    expect(res.body.result).toBe('order');
    expect(res.body.client_uuid).toBe(VISIT_UUID);
    expect(res.body.is_mocked).toBe(false);
    expect(Number(res.body.distance_m)).toBeLessThanOrEqual(500);
  });

  it('check-in دور از مشتری 409 ← visit_too_far (ضدتقلب GPS)', async () => {
    const res = await api()
      .post('/api/v1/visits')
      .send({
        tour_id: tourId,
        customer_id: customerId,
        geo_in: { type: 'Point', coordinates: FAR_GEO },
      })
      .expect(409);
    expectBodyMatchesSchema('post', '/visits', 409, res.body);
    expect(res.body.code).toBe('visit_too_far');
    expect(Number(res.body.details?.distance_m)).toBeGreaterThan(500);
  });

  it('client_uuid تکراری 409 ← duplicate_client (idempotency آفلاین)', async () => {
    const res = await api()
      .post('/api/v1/visits')
      .send({
        tour_id: tourId,
        customer_id: customerId,
        geo_in: { type: 'Point', coordinates: CUST_GEO },
        client_uuid: VISIT_UUID,
      })
      .expect(409);
    expectBodyMatchesSchema('post', '/visits', 409, res.body);
    expect(res.body.code).toBe('duplicate_client');
  });

  it('تور ناموجود 400 ← tour_not_found', async () => {
    const res = await api()
      .post('/api/v1/visits')
      .send({ tour_id: MISSING, customer_id: customerId })
      .expect(400);
    expectBodyMatchesSchema('post', '/visits', 400, res.body);
    expect(res.body.code).toBe('tour_not_found');
  });

  it('بدون customer_id 400 ← validation_failed', async () => {
    const res = await api().post('/api/v1/visits').send({ tour_id: tourId }).expect(400);
    expectBodyMatchesSchema('post', '/visits', 400, res.body);
    expect(res.body.code).toBe('validation_failed');
  });
});

describe('TOUR — GET /visits', () => {
  it('200 ← Page + items[Visit]', async () => {
    const res = await api().get('/api/v1/visits').expect(200);
    expectBodyMatchesSchema('get', '/visits', 200, res.body);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.some((v: any) => v.id === visitId)).toBe(true);
  });

  it('tour_id نامعتبر 400 ← validation_failed', async () => {
    const res = await api().get('/api/v1/visits').query({ tour_id: 'not-a-uuid' }).expect(400);
    expectBodyMatchesSchema('get', '/visits', 400, res.body);
    expect(res.body.code).toBe('validation_failed');
  });
});

describe('TOUR — GET /visits/{id}', () => {
  it('200 ← Visit', async () => {
    const res = await api().get(`/api/v1/visits/${visitId}`).expect(200);
    expectBodyMatchesSchema('get', '/visits/{id}', 200, res.body);
    expect(res.body.id).toBe(visitId);
  });

  it('شناسه خراب 400 ← invalid_id', async () => {
    const res = await api().get('/api/v1/visits/abc').expect(400);
    expectBodyMatchesSchema('get', '/visits/{id}', 400, res.body);
    expect(res.body.code).toBe('invalid_id');
  });

  it('بازدید ناموجود 404 ← not_found', async () => {
    const res = await api().get(`/api/v1/visits/${MISSING}`).expect(404);
    expectBodyMatchesSchema('get', '/visits/{id}', 404, res.body);
    expect(res.body.code).toBe('not_found');
  });
});

describe('TOUR — PATCH /visits/{id}', () => {
  it('check-out با نتیجه 200 ← result=no_order', async () => {
    const res = await api()
      .patch(`/api/v1/visits/${visitId}`)
      .send({ check_out_at: '2025-06-01T09:00:00Z', result: 'no_order', no_order_reason: 'مشتری نیاز نداشت' })
      .expect(200);
    expectBodyMatchesSchema('patch', '/visits/{id}', 200, res.body);
    expect(res.body.result).toBe('no_order');
  });

  it('check-out پیش از check-in 400 ← invalid_times', async () => {
    const res = await api()
      .patch(`/api/v1/visits/${visitId}`)
      .send({ check_out_at: '2025-06-01T07:00:00Z' })
      .expect(400);
    expectBodyMatchesSchema('patch', '/visits/{id}', 400, res.body);
    expect(res.body.code).toBe('invalid_times');
  });

  it('شناسه خراب 400 ← invalid_id', async () => {
    const res = await api().patch('/api/v1/visits/abc').send({ result: 'no_order' }).expect(400);
    expectBodyMatchesSchema('patch', '/visits/{id}', 400, res.body);
    expect(res.body.code).toBe('invalid_id');
  });

  it('بازدید ناموجود 404 ← not_found', async () => {
    const res = await api().patch(`/api/v1/visits/${MISSING}`).send({ result: 'no_order' }).expect(404);
    expectBodyMatchesSchema('patch', '/visits/{id}', 404, res.body);
    expect(res.body.code).toBe('not_found');
  });
});

describe('TOUR — پوشش خطاهای مستندشده', () => {
  it('همه خطاهای مستندشده در این فایل آزموده شده‌اند', () => {
    const ops: [string, string][] = [
      ['get', '/tours'],
      ['post', '/tours'],
      ['get', '/tours/{id}'],
      ['patch', '/tours/{id}'],
      ['get', '/tours/{id}/settlement'],
      ['get', '/visits'],
      ['post', '/visits'],
      ['get', '/visits/{id}'],
      ['patch', '/visits/{id}'],
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
