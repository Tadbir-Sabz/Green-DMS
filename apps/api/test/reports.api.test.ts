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
 * تست API گزارش‌ها (ضمیمه C): GET /reports (فهرست مجاز) و GET /reports/{key}
 * (اجرا با فیلتر بازه + قالب json/csv/xlsx) با گاردهای AuthGuard + PermissionsGuard.
 * ۱) دیتابیس موقت «greendms_reports_test» از صفر + مهاجرت‌ها
 * ۲) seed: شرکت، ادمین همه‌مجوز و بینندهٔ بدون مجوز گزارش
 * ۳) اعتبارسنجی بدنه‌ها با ajv + assertion پوششی خطاهای مستندشده
 * ۴) مجوز هر گزارش درون سرویس سنجیده می‌شود: بیننده → 403، کلید ناشناخته → 404
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_reports_test';
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

const ADMIN_USER = 'rep_admin';
const ADMIN_PASSWORD = 'S3cret!pass';
const VIEWER_USER = 'rep_viewer';
const VIEWER_PASSWORD = 'View!pass1';

let adminToken = '';
let viewerToken = '';
let companyId = '';

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
  return {
    get: (url: string) => {
      const req = base.get(url);
      return use ? req.set('Authorization', `Bearer ${use}`) : req;
    },
  };
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
    `insert into company (code, legal_name) values ('REPCO', 'شرکت تست گزارش') returning id`,
  );
  companyId = company.rows[0].id;
  await pool.query(
    `insert into branch (company_id, code, name) values ($1, 'MAIN', 'شعبه مرکزی')`,
    [companyId],
  );

  // ادمین همه‌مجوز (از جمله reports.dashboard.view / ar.ledger.view / gl.report.view)
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

  // بیننده بدون مجوز گزارش (فقط master.product.view)
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

describe('REP — 401 بدون توکن روی همه مسیرها', () => {
  it('همه endpoint ها بدون توکن 401 ← Error', async () => {
    const cases: [string, string][] = [
      ['/reports', '/api/v1/reports'],
      ['/reports/{key}', '/api/v1/reports/daily_sales'],
    ];
    for (const [contractPath, url] of cases) {
      const res = await api(null).get(url).expect(401);
      expectBodyMatchesSchema('get', contractPath, 401, res.body);
    }
  });
});

describe('REP — GET /reports (فهرست مجاز)', () => {
  it('ادمین 200 ← همه گزارش‌ها (items[ReportDescriptor])', async () => {
    const res = await api().get('/api/v1/reports').expect(200);
    expectBodyMatchesSchema('get', '/reports', 200, res.body);
    expect(Array.isArray(res.body.items)).toBe(true);
    const keys = res.body.items.map((r: any) => r.key);
    expect(keys).toContain('daily_sales');
    expect(keys).toContain('ar_aging');
    // هر قلم شناسنامهٔ کامل دارد
    for (const item of res.body.items) {
      expect(typeof item.key).toBe('string');
      expect(typeof item.title).toBe('string');
      expect(typeof item.required_permission).toBe('string');
    }
  });

  it('بیننده 200 ← فقط گزارش‌های مجاز (اینجا خالی، بدون 403)', async () => {
    //PermissionsGuard بدون @RequirePermissions اجازه می‌دهد؛ فیلتر در سرویس است
    const res = await api(viewerToken).get('/api/v1/reports').expect(200);
    expectBodyMatchesSchema('get', '/reports', 200, res.body);
    expect(res.body.items).toHaveLength(0);
  });
});

describe('REP — GET /reports/{key} (اجرا)', () => {
  it('daily_sales برای ادمین 200 ← { columns, rows }', async () => {
    const res = await api().get('/api/v1/reports/daily_sales').expect(200);
    expectBodyMatchesSchema('get', '/reports/{key}', 200, res.body);
    expect(Array.isArray(res.body.columns)).toBe(true);
    expect(Array.isArray(res.body.rows)).toBe(true);
    const colKeys = res.body.columns.map((c: any) => c.key);
    expect(colKeys).toContain('sale_date');
    expect(colKeys).toContain('net_sales');
  });

  it('فیلتر بازه تاریخ (from/to) 200 ← schema', async () => {
    const res = await api()
      .get('/api/v1/reports/ar_aging')
      .query({ from: '2024-01-01', to: '2024-12-31' })
      .expect(200);
    expectBodyMatchesSchema('get', '/reports/{key}', 200, res.body);
    expect(Array.isArray(res.body.rows)).toBe(true);
  });

  it('format=csv 200 ← text/csv (StreamableFile)', async () => {
    const res = await api().get('/api/v1/reports/daily_sales').query({ format: 'csv' }).expect(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/daily_sales\.csv/);
  });

  it('کلید ناشناخته 404 ← report_not_found', async () => {
    const res = await api().get('/api/v1/reports/no_such_report').expect(404);
    expectBodyMatchesSchema('get', '/reports/{key}', 404, res.body);
    expect(res.body.code).toBe('report_not_found');
  });

  it('گزارش بدون مجوز برای بیننده 403 ← forbidden', async () => {
    const res = await api(viewerToken).get('/api/v1/reports/daily_sales').expect(403);
    expectBodyMatchesSchema('get', '/reports/{key}', 403, res.body);
    expect(res.body.code).toBe('forbidden');
  });

  it('format نامعتبر 400 ← validation_failed', async () => {
    const res = await api().get('/api/v1/reports/daily_sales').query({ format: 'pdf' }).expect(400);
    expectBodyMatchesSchema('get', '/reports/{key}', 400, res.body);
    expect(res.body.code).toBe('validation_failed');
  });

  it('from نامعتبر (تاریخ نه) 400 ← validation_failed', async () => {
    const res = await api().get('/api/v1/reports/daily_sales').query({ from: 'not-a-date' }).expect(400);
    expectBodyMatchesSchema('get', '/reports/{key}', 400, res.body);
    expect(res.body.code).toBe('validation_failed');
  });
});

describe('REP — پوشش خطاهای مستندشده', () => {
  it('همه خطاهای مستندشده در این فایل آزموده شده‌اند', () => {
    const ops: [string, string][] = [
      ['get', '/reports'],
      ['get', '/reports/{key}'],
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
