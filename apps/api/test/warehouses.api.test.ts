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
 * تست API انبار — /warehouses و /warehouses/{id} با همان گاردهای ماژول
 * (AuthGuard + PermissionsGuard روی inventory.warehouse.*):
 * ۱) دیتابیس موقت «greendms_warehouses_test» از صفر + همه مهاجرت‌ها
 * ۲) seed حداقلی: شرکت + شعبه، وسیله نقلیه، ادمینِ همه‌مجوز و بینندهٔ بدون مجوز انبار
 * ۳) بالا آوردن واقعی AppModule با همان ValidationPipe سراسری
 * ۴) اسناد HTTP با supertest + اعتبارسنجی بدنه‌ها با ajv (JSON Schema 2020-12)
 * ۵) assertion پوششی: همه خطاهای مستندشدهٔ /warehouses آزموده شده‌اند
 * ۶) حذف دیتابیس در پایان
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_warehouses_test';
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

const ADMIN_USER = 'wh_admin';
const ADMIN_PASSWORD = 'S3cret!pass';
const VIEWER_USER = 'wh_viewer';
const VIEWER_PASSWORD = 'View!pass1';

let adminToken = '';
let viewerToken = '';
let companyId = '';
let vehicleId = '';
let warehouseId = '';

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
    `insert into company (code, legal_name) values ('WHCO', 'شرکت تست انبار') returning id`,
  );
  companyId = company.rows[0].id;
  await pool.query(
    `insert into branch (company_id, code, name) values ($1, 'MAIN', 'شعبه مرکزی')`,
    [companyId],
  );

  // وسیله نقلیه برای آزمون قید انبار خودرو
  vehicleId = (
    await pool.query<{ id: string }>(
      `insert into vehicle (branch_id, plate) select id, '12-34-ص' from branch where company_id = $1 returning vehicle.id`,
      [companyId],
    )
  ).rows[0].id;

  // ادمین همه‌مجوز + بینندهٔ بدون مجوز انبار (برای 403)
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

describe('W — گاردها: 401 بدون توکن و 403 بدون مجوز', () => {
  const missing = '11111111-1111-4111-8111-111111111111';

  it('بدون توکن 401 ← Error', async () => {
    expectBodyMatchesSchema('get', '/warehouses', 401, (await api(null).get('/api/v1/warehouses').expect(401)).body);
    expectBodyMatchesSchema(
      'post',
      '/warehouses',
      401,
      (await api(null).post('/api/v1/warehouses').send({ code: 'X', name: 'X', kind: 'main' }).expect(401)).body,
    );
    expectBodyMatchesSchema('get', '/warehouses/{id}', 401, (await api(null).get(`/api/v1/warehouses/${missing}`).expect(401)).body);
    expectBodyMatchesSchema(
      'patch',
      '/warehouses/{id}',
      401,
      (await api(null).patch(`/api/v1/warehouses/${missing}`).send({ name: 'X' }).expect(401)).body,
    );
  });

  it('بدون مجوز 403 ← Error با جزئیات مجوز', async () => {
    const viewer = { Authorization: `Bearer ${viewerToken}` };
    const assertForbidden = (b: { code?: string; details?: { required?: string[] } }) => {
      expect(b.code).toBe('forbidden');
      expect(b.details?.required?.[0]).toMatch(/^inventory\.warehouse\./);
    };

    const list = await api(null).get('/api/v1/warehouses').set(viewer).expect(403);
    expectBodyMatchesSchema('get', '/warehouses', 403, list.body);
    assertForbidden(list.body);

    const create = await api(null)
      .post('/api/v1/warehouses')
      .set(viewer)
      .send({ code: 'NOPE', name: 'X', kind: 'main' })
      .expect(403);
    expectBodyMatchesSchema('post', '/warehouses', 403, create.body);
    assertForbidden(create.body);

    const get = await api(null).get(`/api/v1/warehouses/${missing}`).set(viewer).expect(403);
    expectBodyMatchesSchema('get', '/warehouses/{id}', 403, get.body);
    assertForbidden(get.body);

    const patch = await api(null).patch(`/api/v1/warehouses/${missing}`).set(viewer).send({ name: 'X' }).expect(403);
    expectBodyMatchesSchema('patch', '/warehouses/{id}', 403, patch.body);
    assertForbidden(patch.body);
  });
});

describe('W — CRUD انبار علیه قرارداد', () => {
  it('لیست 200 ← Page + items[Warehouse]', async () => {
    const res = await api().get('/api/v1/warehouses').expect(200);
    expectBodyMatchesSchema('get', '/warehouses', 200, res.body);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('فیلتر نامعتبر kind 400 ← Error', async () => {
    const res = await api().get('/api/v1/warehouses').query({ kind: 'bogus' }).expect(400);
    expectBodyMatchesSchema('get', '/warehouses', 400, res.body);
    expect(res.body.code).toBe('validation_failed');
  });

  it('ساخت انبار اصلی 201 ← Warehouse (شعبه پیش‌فرض)', async () => {
    const res = await api()
      .post('/api/v1/warehouses')
      .send({ code: 'WH-MAIN', name: 'انبار مرکزی', kind: 'main' })
      .expect(201);
    expectBodyMatchesSchema('post', '/warehouses', 201, res.body);
    warehouseId = res.body.id;
    expect(res.body.code).toBe('WH-MAIN');
    expect(res.body.kind).toBe('main');
    expect(res.body).toHaveProperty('branch_id');
    expect(res.body.is_active).toBe(true);
    expect(res.body.allow_negative).toBe(false);
  });

  it('ساخت بدون name 400 ← validation_failed', async () => {
    const res = await api().post('/api/v1/warehouses').send({ code: 'WH-NO-N', kind: 'main' }).expect(400);
    expectBodyMatchesSchema('post', '/warehouses', 400, res.body);
    expect(res.body.code).toBe('validation_failed');
    expect(res.body.details.fields.name[0]).toMatch(/[؀-ۿ]/);
  });

  it('کد تکراری در شعبه 409 ← duplicate_code', async () => {
    const res = await api()
      .post('/api/v1/warehouses')
      .send({ code: 'WH-MAIN', name: 'تکراری', kind: 'main' })
      .expect(409);
    expectBodyMatchesSchema('post', '/warehouses', 409, res.body);
    expect(res.body.code).toBe('duplicate_code');
  });

  it('انبار خودرو بدون vehicle_id 400 ← vehicle_required (قید ck)', async () => {
    const res = await api()
      .post('/api/v1/warehouses')
      .send({ code: 'WH-VEH', name: 'انبار خودرو', kind: 'vehicle' })
      .expect(400);
    expectBodyMatchesSchema('post', '/warehouses', 400, res.body);
    expect(res.body.code).toBe('vehicle_required');
    expect(res.body.message_fa).toMatch(/[؀-ۿ]/);
  });

  it('انبار غیرخودرو با vehicle_id 400 ← vehicle_not_allowed', async () => {
    const res = await api()
      .post('/api/v1/warehouses')
      .send({ code: 'WH-BAD-V', name: 'نامعتبر', kind: 'main', vehicle_id: vehicleId })
      .expect(400);
    expectBodyMatchesSchema('post', '/warehouses', 400, res.body);
    expect(res.body.code).toBe('vehicle_not_allowed');
  });

  it('انبار خودرو با vehicle_id معتبر 201 ← Warehouse', async () => {
    const res = await api()
      .post('/api/v1/warehouses')
      .send({ code: 'WH-VEH-OK', name: 'خودروی پخش', kind: 'vehicle', vehicle_id: vehicleId })
      .expect(201);
    expectBodyMatchesSchema('post', '/warehouses', 201, res.body);
    expect(res.body.kind).toBe('vehicle');
    expect(res.body.vehicle_id).toBe(vehicleId);
  });

  it('جزئیات 200 ← Warehouse؛ شناسه خراب 400 و ناموجود 404', async () => {
    const detail = await api().get(`/api/v1/warehouses/${warehouseId}`).expect(200);
    expectBodyMatchesSchema('get', '/warehouses/{id}', 200, detail.body);
    expect(detail.body.code).toBe('WH-MAIN');

    const invalid = await api().get('/api/v1/warehouses/abc').expect(400);
    expectBodyMatchesSchema('get', '/warehouses/{id}', 400, invalid.body);
    expect(invalid.body.code).toBe('invalid_id');

    const missing = await api().get('/api/v1/warehouses/11111111-1111-4111-8111-111111111111').expect(404);
    expectBodyMatchesSchema('get', '/warehouses/{id}', 404, missing.body);
  });

  it('ویرایش 200 ← Warehouse؛ شناسه خراب 400 و ناموجود 404', async () => {
    const patched = await api()
      .patch(`/api/v1/warehouses/${warehouseId}`)
      .send({ name: 'انبار مرکزی (به‌روز)', allow_negative: true })
      .expect(200);
    expectBodyMatchesSchema('patch', '/warehouses/{id}', 200, patched.body);
    expect(patched.body.name).toBe('انبار مرکزی (به‌روز)');
    expect(patched.body.allow_negative).toBe(true);

    const invalid = await api().patch('/api/v1/warehouses/abc').send({ name: 'X' }).expect(400);
    expectBodyMatchesSchema('patch', '/warehouses/{id}', 400, invalid.body);

    const missing = await api()
      .patch('/api/v1/warehouses/11111111-1111-4111-8111-111111111111')
      .send({ name: 'X' })
      .expect(404);
    expectBodyMatchesSchema('patch', '/warehouses/{id}', 404, missing.body);
  });

  it('قفل خوش‌بینانه 409 ← version_conflict', async () => {
    const fresh = await api().get(`/api/v1/warehouses/${warehouseId}`).expect(200);
    expect(typeof fresh.body.row_version).toBe('number');

    const res = await api()
      .patch(`/api/v1/warehouses/${warehouseId}`)
      .send({ name: 'انبار (نسخه کهنه)', row_version: fresh.body.row_version + 99 })
      .expect(409);
    expectBodyMatchesSchema('patch', '/warehouses/{id}', 409, res.body);
    expect(res.body.code).toBe('version_conflict');

    const ok = await api()
      .patch(`/api/v1/warehouses/${warehouseId}`)
      .send({ name: 'انبار مرکزی (نسخه درست)', row_version: fresh.body.row_version })
      .expect(200);
    expectBodyMatchesSchema('patch', '/warehouses/{id}', 200, ok.body);
    expect(ok.body.row_version).toBe(fresh.body.row_version + 1);
  });
});

describe('W — پوشش خطاهای مستندشدهٔ /warehouses', () => {
  it('همه خطاهای مستندشده در همین فایل آزموده شده‌اند', () => {
    const ops: [string, string][] = [
      ['get', '/warehouses'],
      ['post', '/warehouses'],
      ['get', '/warehouses/{id}'],
      ['patch', '/warehouses/{id}'],
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
