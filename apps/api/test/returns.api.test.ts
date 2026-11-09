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
 * تست API مرجوعی — /returns، approve و receive مطابق openapi.yaml (فاز D):
 * ۱) دیتابیس موقت «greendms_returns_test» از صفر + همه مهاجرت‌ها
 * ۲) seed: شرکت/شعبه + مشتری + کالا + ادمین/بیننده
 * ۳) گاردها، اعتبارسنجی، گذار وضعیت submitted → approved → posted و 409 نامعتبر
 * ۴) assertion پوششی: همه خطاهای مستندشدهٔ /returns آزموده شده‌اند
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_returns_test';
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

const ADMIN_USER = 'rt_admin';
const ADMIN_PASSWORD = 'S3cret!pass';
const VIEWER_USER = 'rt_viewer';
const VIEWER_PASSWORD = 'View!pass1';

let adminToken = '';
let viewerToken = '';
/** TASK-24Y — تأییدکنندهٔ مستقل (نه درخواست‌دهندهٔ مرجوعی) */
let returnApproverToken = '';
let companyId = '';
let customerId = '';
let productId = '';

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
    `insert into company (code, legal_name) values ('RTCO', 'شرکت تست مرجوعی') returning id`,
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

  await pool.query(`insert into uom (code, title) values ('RTPCS', 'عدد')`);
  const category = await pool.query<{ id: string }>(
    `insert into product_category (company_id, code, name) values ($1, 'CAT-1', 'دسته تست') returning id`,
    [companyId],
  );
  productId = (
    await pool.query<{ id: string }>(
      `insert into product (company_id, code, name, category_id, base_uom_id)
       select $1, 'PRD-1', 'کالای مرجوعی', $2, id from uom where code = 'RTPCS'
       returning id`,
      [companyId, category.rows[0].id],
    )
  ).rows[0].id;

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

describe('RT — گاردها: 401 بدون توکن و 403 بدون مجوز', () => {
  it('بدون توکن 401 ← Error', async () => {
    expectBodyMatchesSchema('get', '/returns', 401, (await api(null).get('/api/v1/returns').expect(401)).body);
    expectBodyMatchesSchema(
      'post',
      '/returns',
      401,
      (await api(null).post('/api/v1/returns').send({ customer_id: MISSING, reason_code: 'damaged' }).expect(401)).body,
    );
    expectBodyMatchesSchema('get', '/returns/{id}', 401, (await api(null).get(`/api/v1/returns/${MISSING}`).expect(401)).body);
    expectBodyMatchesSchema(
      'post',
      '/returns/{id}/approve',
      401,
      (await api(null).post(`/api/v1/returns/${MISSING}/approve`).expect(401)).body,
    );
    expectBodyMatchesSchema(
      'post',
      '/returns/{id}/receive',
      401,
      (
        await api(null)
          .post(`/api/v1/returns/${MISSING}/receive`)
          .send({ lines: [{ product_id: MISSING, qty: 1, disposition: 'restock' }] })
          .expect(401)
      ).body,
    );
  });

  it('بیننده روی مرجوعی 403 ← Error با جزئیات مجوز', async () => {
    const viewer = { Authorization: `Bearer ${viewerToken}` };
    const assertForbidden = (b: { code?: string; details?: { required?: string[] } }, re: RegExp) => {
      expect(b.code).toBe('forbidden');
      expect(b.details?.required?.[0]).toMatch(re);
    };

    const list = await api(null).get('/api/v1/returns').set(viewer).expect(403);
    expectBodyMatchesSchema('get', '/returns', 403, list.body);
    assertForbidden(list.body, /^sales\.return\./);

    const create = await api(null)
      .post('/api/v1/returns')
      .set(viewer)
      .send({ customer_id: MISSING, reason_code: 'damaged' })
      .expect(403);
    expectBodyMatchesSchema('post', '/returns', 403, create.body);
    assertForbidden(create.body, /^sales\.return\./);

    const get = await api(null).get(`/api/v1/returns/${MISSING}`).set(viewer).expect(403);
    expectBodyMatchesSchema('get', '/returns/{id}', 403, get.body);
    assertForbidden(get.body, /^sales\.return\./);

    const approve = await api(null).post(`/api/v1/returns/${MISSING}/approve`).set(viewer).expect(403);
    expectBodyMatchesSchema('post', '/returns/{id}/approve', 403, approve.body);
    assertForbidden(approve.body, /^sales\.return\./);

    const receive = await api(null)
      .post(`/api/v1/returns/${MISSING}/receive`)
      .set(viewer)
      .send({ lines: [{ product_id: MISSING, qty: 1, disposition: 'restock' }] })
      .expect(403);
    expectBodyMatchesSchema('post', '/returns/{id}/receive', 403, receive.body);
    assertForbidden(receive.body, /^sales\.return\./);
  });
});

describe('RT — جریان کامل /returns', () => {
  let returnId = '';

  it('ساخت 201 ← ReturnRequest با قلم (submitted)', async () => {
    const res = await api()
      .post('/api/v1/returns')
      .send({
        customer_id: customerId,
        reason_code: 'damaged',
        lines: [{ product_id: productId, qty: 2 }],
        note: 'مرجوعی تست',
      })
      .expect(201);
    expectBodyMatchesSchema('post', '/returns', 201, res.body);
    returnId = res.body.id;
    expect(res.body.status).toBe('submitted');
    expect(res.body.doc_number).toMatch(/^RT-/);
    expect(res.body.lines).toHaveLength(1);
  });

  it('بدون reason_code 400 ← validation_failed', async () => {
    const res = await api().post('/api/v1/returns').send({ customer_id: customerId }).expect(400);
    expectBodyMatchesSchema('post', '/returns', 400, res.body);
    expect(res.body.code).toBe('validation_failed');
  });

  it('بدون قلم 400 ← lines_required', async () => {
    const res = await api()
      .post('/api/v1/returns')
      .send({ customer_id: customerId, reason_code: 'expired' })
      .expect(400);
    expectBodyMatchesSchema('post', '/returns', 400, res.body);
    expect(res.body.code).toBe('lines_required');
  });

  it('مشتری ناموجود 400 ← customer_not_found', async () => {
    const res = await api()
      .post('/api/v1/returns')
      .send({ customer_id: MISSING, reason_code: 'other', lines: [{ product_id: productId, qty: 1 }] })
      .expect(400);
    expectBodyMatchesSchema('post', '/returns', 400, res.body);
    expect(res.body.code).toBe('customer_not_found');
  });

  it('جزئیات 200 ← ReturnRequest؛ شناسه خراب 400 و ناموجود 404', async () => {
    const detail = await api().get(`/api/v1/returns/${returnId}`).expect(200);
    expectBodyMatchesSchema('get', '/returns/{id}', 200, detail.body);
    expect(detail.body.id).toBe(returnId);

    const bad = await api().get('/api/v1/returns/abc').expect(400);
    expectBodyMatchesSchema('get', '/returns/{id}', 400, bad.body);
    expect(bad.body.code).toBe('invalid_id');

    const miss = await api().get(`/api/v1/returns/${MISSING}`).expect(404);
    expectBodyMatchesSchema('get', '/returns/{id}', 404, miss.body);
    expect(miss.body.code).toBe('not_found');
  });

  it('receive قبل از approve 409 ← invalid_transition', async () => {
    const res = await api()
      .post(`/api/v1/returns/${returnId}/receive`)
      .send({ lines: [{ product_id: productId, qty: 2, disposition: 'restock' }] })
      .expect(409);
    expectBodyMatchesSchema('post', '/returns/{id}/receive', 409, res.body);
    expect(res.body.code).toBe('invalid_transition');
  });

  it('approve 200 ← approved؛ دوباره 409 ← invalid_transition', async () => {
    // TASK-24Y — جداسازیِ وظایف: درخواست‌دهنده نمی‌تواند تأیید کند. این آزمون
    // پیش‌تر با همان کاربر تأیید می‌کرد، یعنی الگویِ ناامن را تثبیت می‌کرد.
    const self = await api().post(`/api/v1/returns/${returnId}/approve`);
    expect(self.status).toBe(403);
    expect(self.body.code).toBe('self_approval_forbidden');

    const viewer = await pool.query<{ id: string }>(`select id from app_user where username = $1`, [VIEWER_USER]);
    const role = await pool.query<{ id: string }>(
      `insert into role (company_id, code, name) values ($1, 'rt_approver', 'تأییدکنندهٔ مرجوعی') returning id`,
      [companyId],
    );
    await pool.query(`insert into role_permission (role_id, permission_code) values ($1, 'sales.return.approve')`, [
      role.rows[0].id,
    ]);
    await pool.query(`insert into user_role (app_user_id, role_id) values ($1, $2)`, [viewer.rows[0].id, role.rows[0].id]);
    returnApproverToken = await login(VIEWER_USER, VIEWER_PASSWORD);

    const ok = await api(returnApproverToken).post(`/api/v1/returns/${returnId}/approve`).expect(200);
    expectBodyMatchesSchema('post', '/returns/{id}/approve', 200, ok.body);
    expect(ok.body.status).toBe('approved');

    const again = await api(returnApproverToken).post(`/api/v1/returns/${returnId}/approve`).expect(409);
    expectBodyMatchesSchema('post', '/returns/{id}/approve', 409, again.body);
    expect(again.body.code).toBe('invalid_transition');
  });

  it('approve ناموجود 404', async () => {
    const res = await api().post(`/api/v1/returns/${MISSING}/approve`).expect(404);
    expectBodyMatchesSchema('post', '/returns/{id}/approve', 404, res.body);
    expect(res.body.code).toBe('not_found');
  });

  it('approve شناسه خراب 400 ← invalid_id', async () => {
    const res = await api().post('/api/v1/returns/abc/approve').expect(400);
    expectBodyMatchesSchema('post', '/returns/{id}/approve', 400, res.body);
    expect(res.body.code).toBe('invalid_id');
  });

  it('receive ناموجود 404', async () => {
    const res = await api()
      .post(`/api/v1/returns/${MISSING}/receive`)
      .send({ lines: [{ product_id: productId, qty: 1, disposition: 'restock' }] })
      .expect(404);
    expectBodyMatchesSchema('post', '/returns/{id}/receive', 404, res.body);
    expect(res.body.code).toBe('not_found');
  });

  it('receive 200 ← posted با qty_approved و disposition', async () => {
    const res = await api()
      .post(`/api/v1/returns/${returnId}/receive`)
      .send({ lines: [{ product_id: productId, qty: 2, disposition: 'damaged' }] })
      .expect(200);
    expectBodyMatchesSchema('post', '/returns/{id}/receive', 200, res.body);
    expect(res.body.status).toBe('posted');
    const line = res.body.lines.find((l: { product_id: string }) => l.product_id === productId);
    expect(line.qty_approved).toBe(2);
    expect(line.disposition).toBe('damaged');
  });

  it('receive با قلم نامربوط 400 ← line_not_found', async () => {
    const other = await api()
      .post('/api/v1/returns')
      .send({
        customer_id: customerId,
        reason_code: 'shortage',
        lines: [{ product_id: productId, qty: 1 }],
      })
      .expect(201);
    // TASK-24Y — تأییدکنندهٔ مستقل (درخواست‌دهنده = admin)
    const res = await api(returnApproverToken)
      .post(`/api/v1/returns/${other.body.id}/approve`)
      .expect(200);
    expect(res.body.status).toBe('approved');

    const bad = await api()
      .post(`/api/v1/returns/${other.body.id}/receive`)
      .send({ lines: [{ product_id: MISSING, qty: 1, disposition: 'restock' }] })
      .expect(400);
    expectBodyMatchesSchema('post', '/returns/{id}/receive', 400, bad.body);
    expect(bad.body.code).toBe('line_not_found');
  });

  it('لیست 200 ← Page + فیلتر customer_id و status', async () => {
    const res = await api().get('/api/v1/returns').expect(200);
    expectBodyMatchesSchema('get', '/returns', 200, res.body);
    expect(res.body.items.length).toBeGreaterThan(0);

    const byCustomer = await api().get('/api/v1/returns').query({ customer_id: customerId }).expect(200);
    expect(byCustomer.body.items.every((r: { customer_id: string }) => r.customer_id === customerId)).toBe(true);

    const posted = await api().get('/api/v1/returns').query({ status: 'posted' }).expect(200);
    expect(posted.body.items.every((r: { status: string }) => r.status === 'posted')).toBe(true);
  });
});

describe('RT — پوشش خطاهای مستندشدهٔ /returns', () => {
  it('همه خطاهای مستندشده در همین فایل آزموده شده‌اند', () => {
    const ops: [string, string][] = [
      ['get', '/returns'],
      ['post', '/returns'],
      ['get', '/returns/{id}'],
      ['post', '/returns/{id}/approve'],
      ['post', '/returns/{id}/receive'],
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
