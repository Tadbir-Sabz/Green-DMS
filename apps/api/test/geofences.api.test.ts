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
 * تست API محدوده جغرافیایی — /geofences مطابق openapi.yaml (فاز D):
 * ۱) دیتابیس موقت «greendms_geofences_test» از صفر + همه مهاجرت‌ها
 * ۲) seed: شرکت/شعبه + مشتری + ادمین/بیننده
 * ۳) گاردها، اعتبارسنجی polygon، CRUD و حذف (204/404)
 * ۴) assertion پوششی: همه خطاهای مستندشدهٔ /geofences آزموده شده‌اند
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_geofences_test';
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

const ADMIN_USER = 'gf_admin';
const ADMIN_PASSWORD = 'S3cret!pass';
const VIEWER_USER = 'gf_viewer';
const VIEWER_PASSWORD = 'View!pass1';

let adminToken = '';
let viewerToken = '';
let companyId = '';
let customerId = '';

const exercisedErrors = new Set<string>();

interface SpecDoc {
  paths: Record<string, Record<string, any>>;
  [key: string]: unknown;
}
let spec: SpecDoc;
let ajv: Ajv2020;

/** چندضعبی معتبر: حلقهٔ بستهٔ ۵ نقطه‌ای */
const POLYGON = {
  type: 'Polygon',
  coordinates: [
    [
      [51.0, 35.0],
      [51.1, 35.0],
      [51.1, 35.1],
      [51.0, 35.1],
      [51.0, 35.0],
    ],
  ],
};

const api = (token?: string | null) => {
  const base = request(app.getHttpServer());
  const use = token === undefined ? adminToken : token;
  const verb = (method: 'get' | 'post' | 'patch' | 'delete') => (url: string) => {
    const req = base[method](url);
    return use ? req.set('Authorization', `Bearer ${use}`) : req;
  };
  return { get: verb('get'), post: verb('post'), patch: verb('patch'), delete: verb('delete') };
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
    `insert into company (code, legal_name) values ('GFCO', 'شرکت تست محدوده') returning id`,
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

describe('GF — گاردها: 401 بدون توکن و 403 بدون مجوز', () => {
  it('بدون توکن 401 ← Error برای همه عملیات', async () => {
    expectBodyMatchesSchema('get', '/geofences', 401, (await api(null).get('/api/v1/geofences').expect(401)).body);
    expectBodyMatchesSchema(
      'post',
      '/geofences',
      401,
      (await api(null).post('/api/v1/geofences').send({ name: 'X', kind: 'work_area', area: POLYGON }).expect(401)).body,
    );
    expectBodyMatchesSchema('get', '/geofences/{id}', 401, (await api(null).get(`/api/v1/geofences/${MISSING}`).expect(401)).body);
    expectBodyMatchesSchema(
      'patch',
      '/geofences/{id}',
      401,
      (await api(null).patch(`/api/v1/geofences/${MISSING}`).send({ name: 'X' }).expect(401)).body,
    );
    expectBodyMatchesSchema('delete', '/geofences/{id}', 401, (await api(null).delete(`/api/v1/geofences/${MISSING}`).expect(401)).body);
  });

  it('بیننده روی محدوده 403 ← Error با جزئیات مجوز', async () => {
    const viewer = { Authorization: `Bearer ${viewerToken}` };
    const assertForbidden = (b: { code?: string; details?: { required?: string[] } }) => {
      expect(b.code).toBe('forbidden');
      expect(b.details?.required?.[0]).toMatch(/^tracking\.geofence\./);
    };

    const list = await api(null).get('/api/v1/geofences').set(viewer).expect(403);
    expectBodyMatchesSchema('get', '/geofences', 403, list.body);
    assertForbidden(list.body);

    const create = await api(null)
      .post('/api/v1/geofences')
      .set(viewer)
      .send({ name: 'X', kind: 'work_area', area: POLYGON })
      .expect(403);
    expectBodyMatchesSchema('post', '/geofences', 403, create.body);
    assertForbidden(create.body);

    const get = await api(null).get(`/api/v1/geofences/${MISSING}`).set(viewer).expect(403);
    expectBodyMatchesSchema('get', '/geofences/{id}', 403, get.body);
    assertForbidden(get.body);

    const patch = await api(null).patch(`/api/v1/geofences/${MISSING}`).set(viewer).send({ name: 'X' }).expect(403);
    expectBodyMatchesSchema('patch', '/geofences/{id}', 403, patch.body);
    assertForbidden(patch.body);

    const del = await api(null).delete(`/api/v1/geofences/${MISSING}`).set(viewer).expect(403);
    expectBodyMatchesSchema('delete', '/geofences/{id}', 403, del.body);
    assertForbidden(del.body);
  });
});

describe('GF — جریان /geofences', () => {
  let geofenceId = '';

  it('ساخت 201 ← Geofence با polygon', async () => {
    const res = await api()
      .post('/api/v1/geofences')
      .send({ name: 'حوزه مرکزی', kind: 'work_area', area: POLYGON })
      .expect(201);
    expectBodyMatchesSchema('post', '/geofences', 201, res.body);
    geofenceId = res.body.id;
    expect(res.body.kind).toBe('work_area');
    expect(res.body.is_active).toBe(true);
    expect(res.body.area?.type).toBe('Polygon');
  });

  it('بدون name 400 ← validation_failed', async () => {
    const res = await api()
      .post('/api/v1/geofences')
      .send({ kind: 'work_area', area: POLYGON })
      .expect(400);
    expectBodyMatchesSchema('post', '/geofences', 400, res.body);
    expect(res.body.code).toBe('validation_failed');
  });

  it('polygon باز 400 ← invalid_geo', async () => {
    const res = await api()
      .post('/api/v1/geofences')
      .send({
        name: 'نامعتبر',
        kind: 'work_area',
        area: { type: 'Polygon', coordinates: [[[51, 35], [51.1, 35], [51.1, 35.1]]] },
      })
      .expect(400);
    expectBodyMatchesSchema('post', '/geofences', 400, res.body);
    expect(res.body.code).toBe('invalid_geo');
  });

  it('kind=customer بدون customer_id 400 ← customer_required', async () => {
    const res = await api()
      .post('/api/v1/geofences')
      .send({ name: 'محدوده مشتری', kind: 'customer', area: POLYGON })
      .expect(400);
    expectBodyMatchesSchema('post', '/geofences', 400, res.body);
    expect(res.body.code).toBe('customer_required');
  });

  it('مشتری ناموجود 400 ← target_not_found', async () => {
    const res = await api()
      .post('/api/v1/geofences')
      .send({ name: 'محدوده مشتری', kind: 'customer', area: POLYGON, customer_id: MISSING })
      .expect(400);
    expectBodyMatchesSchema('post', '/geofences', 400, res.body);
    expect(res.body.code).toBe('target_not_found');
  });

  it('جزئیات 200 ← Geofence؛ شناسه خراب 400 و ناموجود 404', async () => {
    const detail = await api().get(`/api/v1/geofences/${geofenceId}`).expect(200);
    expectBodyMatchesSchema('get', '/geofences/{id}', 200, detail.body);
    expect(detail.body.id).toBe(geofenceId);

    const bad = await api().get('/api/v1/geofences/abc').expect(400);
    expectBodyMatchesSchema('get', '/geofences/{id}', 400, bad.body);
    expect(bad.body.code).toBe('invalid_id');

    const miss = await api().get(`/api/v1/geofences/${MISSING}`).expect(404);
    expectBodyMatchesSchema('get', '/geofences/{id}', 404, miss.body);
    expect(miss.body.code).toBe('not_found');
  });

  it('ویرایش 200 ← Geofence (name و is_active)', async () => {
    const res = await api()
      .patch(`/api/v1/geofences/${geofenceId}`)
      .send({ name: 'حوزه مرکزی (به‌روز)', is_active: false })
      .expect(200);
    expectBodyMatchesSchema('patch', '/geofences/{id}', 200, res.body);
    expect(res.body.name).toBe('حوزه مرکزی (به‌روز)');
    expect(res.body.is_active).toBe(false);
  });

  it('ویرایش با polygon نامعتبر 400 ← invalid_geo', async () => {
    const res = await api()
      .patch(`/api/v1/geofences/${geofenceId}`)
      .send({ area: { type: 'Polygon', coordinates: [[[0, 0]]] } })
      .expect(400);
    expectBodyMatchesSchema('patch', '/geofences/{id}', 400, res.body);
    expect(res.body.code).toBe('invalid_geo');
  });

  it('ویرایش شناسه خراب 400 و ناموجود 404', async () => {
    const bad = await api().patch('/api/v1/geofences/abc').send({ name: 'X' }).expect(400);
    expectBodyMatchesSchema('patch', '/geofences/{id}', 400, bad.body);

    const miss = await api().patch(`/api/v1/geofences/${MISSING}`).send({ name: 'X' }).expect(404);
    expectBodyMatchesSchema('patch', '/geofences/{id}', 404, miss.body);
  });

  it('فیلتر is_active لیست', async () => {
    const all = await api().get('/api/v1/geofences').expect(200);
    expectBodyMatchesSchema('get', '/geofences', 200, all.body);
    expect(all.body.items.length).toBeGreaterThan(0);

    const active = await api().get('/api/v1/geofences').query({ is_active: 'true' }).expect(200);
    expect(active.body.items.every((g: { is_active: boolean }) => g.is_active === true)).toBe(true);
  });

  it('حذف 204 ← بدون بدنه؛ دوباره 404', async () => {
    await api().delete(`/api/v1/geofences/${geofenceId}`).expect(204);
    const again = await api().delete(`/api/v1/geofences/${geofenceId}`).expect(404);
    expectBodyMatchesSchema('delete', '/geofences/{id}', 404, again.body);
    expect(again.body.code).toBe('not_found');
  });

  it('حذف شناسه خراب 400', async () => {
    const bad = await api().delete('/api/v1/geofences/abc').expect(400);
    expectBodyMatchesSchema('delete', '/geofences/{id}', 400, bad.body);
    expect(bad.body.code).toBe('invalid_id');
  });
});

describe('GF — پوشش خطاهای مستندشدهٔ /geofences', () => {
  it('همه خطاهای مستندشده در همین فایل آزموده شده‌اند', () => {
    const ops: [string, string][] = [
      ['get', '/geofences'],
      ['post', '/geofences'],
      ['get', '/geofences/{id}'],
      ['patch', '/geofences/{id}'],
      ['delete', '/geofences/{id}'],
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
