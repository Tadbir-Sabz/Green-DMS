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
 * تست API تنظیمات (ماژول ۱۱): GET /settings و PATCH /settings با همان گاردهای
 * ماژول (AuthGuard + PermissionsGuard) و ممیزی نوشتن.
 * ۱) دیتابیس موقت «greendms_settings_test» از صفر + مهاجرت‌ها
 * ۲) seed: شرکت/شعبه، ادمین همه‌مجوز و بینندهٔ بدون مجوز تنظیمات
 * ۳) اعتبارسنجی بدنه‌ها با ajv (JSON Schema 2020-12) + assertion پوششی خطاهای مستندشده
 * ۴) نوشتن تنظیم company/branch و بررسی ماندگاری در جدول setting و ثبت در audit_log
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_settings_test';
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

const ADMIN_USER = 'set_admin';
const ADMIN_PASSWORD = 'S3cret!pass';
const VIEWER_USER = 'set_viewer';
const VIEWER_PASSWORD = 'View!pass1';

let adminToken = '';
let viewerToken = '';
let companyId = '';
let branchId = '';

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
  const verb = (method: 'get' | 'patch') => (url: string) => {
    const req = base[method](url);
    return use ? req.set('Authorization', `Bearer ${use}`) : req;
  };
  return { get: verb('get'), patch: verb('patch') };
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
    `insert into company (code, legal_name) values ('SETCO', 'شرکت تست تنظیمات') returning id`,
  );
  companyId = company.rows[0].id;
  const branch = await pool.query<{ id: string }>(
    `insert into branch (company_id, code, name) values ($1, 'MAIN', 'شعبه مرکزی') returning id`,
    [companyId],
  );
  branchId = branch.rows[0].id;

  // ادمین همه‌مجوز (از جمله master.settings.view/update)
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

  // بیننده بدون مجوز تنظیمات (فقط master.product.view)
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

describe('SET — 401 بدون توکن روی همه مسیرها', () => {
  it('همه endpoint ها بدون توکن 401 ← Error', async () => {
    const cases: [string, string, string, unknown?][] = [
      ['get', '/settings', '/api/v1/settings'],
      ['patch', '/settings', '/api/v1/settings', { items: [{ key: 'invoice.prefix', value: 'INV-' }] }],
    ];
    for (const [method, contractPath, url, body] of cases) {
      const m = method as 'get' | 'patch';
      let req = api(null)[m](url);
      if (body !== undefined) req = req.send(body);
      const res = await req.expect(401);
      expectBodyMatchesSchema(method, contractPath, 401, res.body);
    }
  });
});

describe('SET — 403 بدون مجوز روی همه مسیرها', () => {
  it('همه endpoint ها برای بیننده 403 ← Error با جزئیات مجوز master.settings', async () => {
    const viewer = { Authorization: `Bearer ${viewerToken}` };
    const cases: [string, string, string, unknown?][] = [
      ['get', '/settings', '/api/v1/settings'],
      ['patch', '/settings', '/api/v1/settings', { items: [{ key: 'invoice.prefix', value: 'INV-' }] }],
    ];
    for (const [method, contractPath, url, body] of cases) {
      const m = method as 'get' | 'patch';
      let req = api(null)[m](url).set(viewer);
      if (body !== undefined) req = req.send(body);
      const res = await req.expect(403);
      expectBodyMatchesSchema(method, contractPath, 403, res.body);
      expect(res.body.code).toBe('forbidden');
      expect(res.body.details?.required?.[0]).toMatch(/^master\.settings\./);
    }
  });
});

describe('SET — GET /settings', () => {
  it('200 ← { items: SettingEntry[] }', async () => {
    const res = await api().get('/api/v1/settings').expect(200);
    expectBodyMatchesSchema('get', '/settings', 200, res.body);
    expect(Array.isArray(res.body.items)).toBe(true);
  });

  it('scope_type نامعتبر 400 ← validation_failed', async () => {
    const res = await api().get('/api/v1/settings').query({ scope_type: 'bogus' }).expect(400);
    expectBodyMatchesSchema('get', '/settings', 400, res.body);
    expect(res.body.code).toBe('validation_failed');
  });

  it('scope_id نامعتبر (uuid نه) 400 ← validation_failed', async () => {
    const res = await api().get('/api/v1/settings').query({ scope_id: 'not-a-uuid' }).expect(400);
    expectBodyMatchesSchema('get', '/settings', 400, res.body);
    expect(res.body.code).toBe('validation_failed');
  });
});

describe('SET — PATCH /settings', () => {
  it('upsert تنظیم company-scoped 200 ← ماندگاری + audit_log', async () => {
    const res = await api()
      .patch('/api/v1/settings')
      .send({ items: [{ key: 'invoice.prefix', value: 'INV-', scope_type: 'company' }] })
      .expect(200);
    expectBodyMatchesSchema('patch', '/settings', 200, res.body);
    const saved = res.body.items.find((s: any) => s.key === 'invoice.prefix');
    expect(saved).toBeTruthy();
    expect(saved.value).toBe('INV-');
    expect(saved.scope_type).toBe('company');

    // ماندگاری در جدول setting (value به‌صورت jsonb رشتهٔ JSON ذخیره می‌شود)
    const row = await pool.query(
      `select value #>> '{}' as value, scope_type, company_id::text as company_id
         from setting where key = 'invoice.prefix' and scope_type = 'company' and company_id = $1`,
      [companyId],
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].value).toBe('INV-');
    expect(row.rows[0].company_id).toBe(companyId);

    // هر تغییر در audit_log ثبت می‌شود (entity_type='setting')
    const audit = await pool.query(
      `select count(*)::int as n from audit_log where entity_type = 'setting' and company_id = $1`,
      [companyId],
    );
    expect(audit.rows[0].n).toBeGreaterThan(0);
  });

  it('upsert تنظیم branch-scoped با scope_id 200 ← round-trip با GET', async () => {
    const res = await api()
      .patch('/api/v1/settings')
      .send({ items: [{ key: 'tour.settlement.deadline_hours', value: '48', scope_type: 'branch', scope_id: branchId }] })
      .expect(200);
    expectBodyMatchesSchema('patch', '/settings', 200, res.body);

    // خواندن مؤثر با فیلتر دامنه، همان کلید را برمی‌گرداند
    const list = await api().get('/api/v1/settings').query({ scope_type: 'branch', scope_id: branchId }).expect(200);
    expectBodyMatchesSchema('get', '/settings', 200, list.body);
    const item = list.body.items.find((s: any) => s.key === 'tour.settlement.deadline_hours');
    expect(item).toBeTruthy();
    expect(item.value).toBe('48');
    expect(item.scope_id).toBe(branchId);
  });

  it('items غیرآرایه 400 ← validation_failed', async () => {
    const res = await api().patch('/api/v1/settings').send({ items: 'not-an-array' }).expect(400);
    expectBodyMatchesSchema('patch', '/settings', 400, res.body);
    expect(res.body.code).toBe('validation_failed');
  });

  it('قلم بدون key 400 ← validation_failed', async () => {
    const res = await api().patch('/api/v1/settings').send({ items: [{ value: 'x' }] }).expect(400);
    expectBodyMatchesSchema('patch', '/settings', 400, res.body);
    expect(res.body.code).toBe('validation_failed');
  });

  it('بدون فیلد items 400 ← validation_failed', async () => {
    const res = await api().patch('/api/v1/settings').send({}).expect(400);
    expectBodyMatchesSchema('patch', '/settings', 400, res.body);
    expect(res.body.code).toBe('validation_failed');
  });
});

describe('SET — پوشش خطاهای مستندشده', () => {
  it('همه خطاهای مستندشده در این فایل آزموده شده‌اند', () => {
    const ops: [string, string][] = [
      ['get', '/settings'],
      ['patch', '/settings'],
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
