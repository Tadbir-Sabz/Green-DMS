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
 * تست API خزانه‌داری — /treasury/closes مطابق openapi.yaml (ماژول ۱۰، مهاجرت 0013):
 * ۱) دیتابیس موقت «greendms_treasury_test» از صفر + همه مهاجرت‌ها
 * ۲) seed: شرکت/شعبه + ادمین(همه مجوزها)/بیننده(بدون treasury.*)
 * ۳) گاردها (401/403) و چرخهٔ بستن روزانه: ثبت (closed)، فهرست با فیلتر،
 *    جزئیات، تأیید (approved)، و همهٔ ردهای رد (شعبهٔ نامعتبر، مبلغ منفی،
 *    تکراری، شناسهٔ خراب/ناموجود، تأیید دوباره)
 * ۴) assertion پوششی: همه خطاهای مستندشدهٔ هر ۴ عملیات /treasury/closes آزموده شده‌اند
 *
 * نکته: daily_treasury_close هیچ ستون company_id ندارد و کلید آن branch_id است؛
 * دامنهٔ شرکت از راه branch_id in (select id from branch where company_id=…) اعمال می‌شود.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_treasury_test';
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

const ADMIN_USER = 'tre_admin';
const ADMIN_PASSWORD = 'S3cret!pass';
const VIEWER_USER = 'tre_viewer';
const VIEWER_PASSWORD = 'View!pass1';

let adminToken = '';
let viewerToken = '';
let companyId = '';
let branchId = '';
/** بستنی که در وضعیت closed می‌ماند (برای فیلتر و جزئیات) */
let pendingCloseId = '';
/** بستنی که تأیید می‌شود (approved) و تأیید دوباره‌اش 409 است */
let approvedCloseId = '';

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
      `insert into company (code, legal_name) values ('TRECO', 'شرکت تست خزانه') returning id`,
    )
  ).rows[0].id;
  branchId = (
    await pool.query<{ id: string }>(
      `insert into branch (company_id, code, name) values ($1, 'MAIN', 'شعبه مرکزی') returning id`,
      [companyId],
    )
  ).rows[0].id;

  // ---- کاربران: ادمین (همهٔ مجوزها) و بیننده (بدون هیچ treasury.*) ----
  const adminPerson = await pool.query<{ id: string }>(
    `insert into person (company_id, code, first_name, last_name)
     values ($1, 'TRE-ADM', 'مدیر', 'خزانه') returning id`,
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
    `insert into person (company_id, code, first_name, last_name)
     values ($1, 'TRE-VW', 'بیننده', 'آزمایشی') returning id`,
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
  // مجوز غیرِ treasury → کاربر احراز هویت می‌شود ولی روی /treasury/closes ممنوع است (403)
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
// گاردها — 401 بدون توکن و 403 بدون مجوزِ treasury برای هر ۴ عملیات
// =====================================================================
describe('Treasury — گاردها: 401 و 403', () => {
  const createBody = { branch_id: MISSING, close_date: '2024-03-20', cash_counted: '10' };

  it('بدون توکن 401 ← Error (همهٔ عملیات)', async () => {
    expectBodyMatchesSchema(
      'get', '/treasury/closes', 401,
      (await api(null).get('/api/v1/treasury/closes').expect(401)).body,
    );
    expectBodyMatchesSchema(
      'get', '/treasury/closes/{id}', 401,
      (await api(null).get(`/api/v1/treasury/closes/${MISSING}`).expect(401)).body,
    );
    expectBodyMatchesSchema(
      'post', '/treasury/closes', 401,
      (await api(null).post('/api/v1/treasury/closes').send(createBody).expect(401)).body,
    );
    expectBodyMatchesSchema(
      'post', '/treasury/closes/{id}/approve', 401,
      (await api(null).post(`/api/v1/treasury/closes/${MISSING}/approve`).expect(401)).body,
    );
  });

  it('بیننده روی /treasury/closes 403 ← Error با جزئیات مجوز', async () => {
    const assertForbidden = (b: { code?: string; details?: { required?: string[] } }) => {
      expect(b.code).toBe('forbidden');
      expect(b.details?.required?.[0]).toMatch(/^treasury\./);
    };

    const list = await api(viewerToken).get('/api/v1/treasury/closes').expect(403);
    expectBodyMatchesSchema('get', '/treasury/closes', 403, list.body);
    assertForbidden(list.body);

    const detail = await api(viewerToken).get(`/api/v1/treasury/closes/${MISSING}`).expect(403);
    expectBodyMatchesSchema('get', '/treasury/closes/{id}', 403, detail.body);
    assertForbidden(detail.body);

    const create = await api(viewerToken).post('/api/v1/treasury/closes').send(createBody).expect(403);
    expectBodyMatchesSchema('post', '/treasury/closes', 403, create.body);
    assertForbidden(create.body);

    const approve = await api(viewerToken).post(`/api/v1/treasury/closes/${MISSING}/approve`).expect(403);
    expectBodyMatchesSchema('post', '/treasury/closes/{id}/approve', 403, approve.body);
    assertForbidden(approve.body);
  });
});

// =====================================================================
// ثبت بستن روزانه — ایجاد (closed) و ردهای رد
// =====================================================================
describe('Treasury — ثبت بستن روزانه', () => {
  const closeBody = (over: Record<string, unknown> = {}) => ({
    branch_id: branchId,
    close_date: '2024-03-21',
    cash_expected: '1000',
    cash_counted: '950',
    bank_balance: '5000',
    cheque_in_hand_amount: '200',
    note: 'بستن روزانه آزمایشی',
    ...over,
  });

  it('POST /treasury/closes 201 ← TreasuryClose با status=closed و مغایرت محاسبه‌شده', async () => {
    const res = await api().post('/api/v1/treasury/closes').send(closeBody()).expect(201);
    expectBodyMatchesSchema('post', '/treasury/closes', 201, res.body);
    pendingCloseId = res.body.id;
    expect(res.body.status).toBe('closed');
    expect(res.body.branch_id).toBe(branchId);
    expect(res.body.close_date).toBe('2024-03-21');
    expect(res.body.closed_by).toBeTruthy();
    // مغایرت = شمارش‌شده − مورد انتظار = 950 − 1000 = −50
    expect(Number(res.body.cash_variance)).toBe(-50);
  });

  it('POST دوم برای تاریخ دیگر 201 ← بستن دوم (برای فیلتر و تأیید)', async () => {
    const res = await api()
      .post('/api/v1/treasury/closes')
      .send(closeBody({ close_date: '2024-03-20', cash_expected: '800', cash_counted: '800' }))
      .expect(201);
    expectBodyMatchesSchema('post', '/treasury/closes', 201, res.body);
    approvedCloseId = res.body.id;
    expect(Number(res.body.cash_variance)).toBe(0);
  });

  it('شعبهٔ نامعتبر 400 ← branch_invalid', async () => {
    const res = await api().post('/api/v1/treasury/closes').send(closeBody({ branch_id: MISSING })).expect(400);
    expectBodyMatchesSchema('post', '/treasury/closes', 400, res.body);
    expect(res.body.code).toBe('branch_invalid');
  });

  it('مبلغ منفی 400 ← invalid_amount', async () => {
    const res = await api().post('/api/v1/treasury/closes').send(closeBody({ cash_counted: '-5' })).expect(400);
    expectBodyMatchesSchema('post', '/treasury/closes', 400, res.body);
    expect(res.body.code).toBe('invalid_amount');
  });

  it('بدنهٔ ناقص (بدون branch_id) 400 ← validation_failed', async () => {
    const res = await api()
      .post('/api/v1/treasury/closes')
      .send({ close_date: '2024-03-22' })
      .expect(400);
    expectBodyMatchesSchema('post', '/treasury/closes', 400, res.body);
    expect(res.body.code).toBe('validation_failed');
  });

  it('تکراری (همان شعبه و تاریخ) 409 ← duplicate_close', async () => {
    const res = await api().post('/api/v1/treasury/closes').send(closeBody()).expect(409);
    expectBodyMatchesSchema('post', '/treasury/closes', 409, res.body);
    expect(res.body.code).toBe('duplicate_close');
  });
});

// =====================================================================
// فهرست و فیلترها
// =====================================================================
describe('Treasury — فهرست بستن‌های روزانه', () => {
  it('GET /treasury/closes 200 ← Page شامل هر دو بستن', async () => {
    const res = await api().get('/api/v1/treasury/closes').expect(200);
    expectBodyMatchesSchema('get', '/treasury/closes', 200, res.body);
    const ids = res.body.items.map((c: { id: string }) => c.id);
    expect(ids).toContain(pendingCloseId);
    expect(ids).toContain(approvedCloseId);
    expect(res.body).toHaveProperty('has_more');
    expect(res.body).toHaveProperty('next_cursor');
  });

  it('فیلتر branch_id و status=closed و بازهٔ تاریخ', async () => {
    const byBranch = await api().get('/api/v1/treasury/closes').query({ branch_id: branchId }).expect(200);
    expectBodyMatchesSchema('get', '/treasury/closes', 200, byBranch.body);
    expect(byBranch.body.items.every((c: { branch_id: string }) => c.branch_id === branchId)).toBe(true);

    const closed = await api().get('/api/v1/treasury/closes').query({ status: 'closed' }).expect(200);
    expect(closed.body.items.every((c: { status: string }) => c.status === 'closed')).toBe(true);
    expect(closed.body.items.map((c: { id: string }) => c.id)).toContain(pendingCloseId);

    // از ۲۱ به بعد → فقط بستنِ ۲۱ (pending)
    const from = await api().get('/api/v1/treasury/closes').query({ from: '2024-03-21' }).expect(200);
    expectBodyMatchesSchema('get', '/treasury/closes', 200, from.body);
    expect(from.body.items.map((c: { id: string }) => c.id)).toContain(pendingCloseId);
    expect(from.body.items.map((c: { id: string }) => c.id)).not.toContain(approvedCloseId);

    // تا ۲۰ → فقط بستنِ ۲۰ (approved)
    const to = await api().get('/api/v1/treasury/closes').query({ to: '2024-03-20' }).expect(200);
    expect(to.body.items.map((c: { id: string }) => c.id)).toContain(approvedCloseId);
    expect(to.body.items.map((c: { id: string }) => c.id)).not.toContain(pendingCloseId);
  });
});

// =====================================================================
// جزئیات یک بستن
// =====================================================================
describe('Treasury — جزئیات بستن روزانه', () => {
  it('GET /treasury/closes/{id} 200 ← TreasuryClose', async () => {
    const res = await api().get(`/api/v1/treasury/closes/${pendingCloseId}`).expect(200);
    expectBodyMatchesSchema('get', '/treasury/closes/{id}', 200, res.body);
    expect(res.body.id).toBe(pendingCloseId);
    expect(res.body.status).toBe('closed');
    expect(res.body.cash_expected).toBeTruthy();
  });

  it('شناسهٔ خراب 400 ← invalid_id و ناموجود 404 ← not_found', async () => {
    const bad = await api().get('/api/v1/treasury/closes/abc').expect(400);
    expectBodyMatchesSchema('get', '/treasury/closes/{id}', 400, bad.body);
    expect(bad.body.code).toBe('invalid_id');

    const miss = await api().get(`/api/v1/treasury/closes/${MISSING}`).expect(404);
    expectBodyMatchesSchema('get', '/treasury/closes/{id}', 404, miss.body);
    expect(miss.body.code).toBe('not_found');
  });
});

// =====================================================================
// تأیید بستن روزانه — closed → approved
// =====================================================================
describe('Treasury — تأیید بستن روزانه', () => {
  it('POST /treasury/closes/{id}/approve 200 ← status=approved و approved_by پر', async () => {
    const res = await api()
      .post(`/api/v1/treasury/closes/${approvedCloseId}/approve`)
      .send({ note: 'تأیید شد' })
      .expect(200);
    expectBodyMatchesSchema('post', '/treasury/closes/{id}/approve', 200, res.body);
    expect(res.body.status).toBe('approved');
    expect(res.body.approved_by).toBeTruthy();
    expect(res.body.note).toBe('تأیید شد');
  });

  it('تأیید دوباره 409 ← close_not_pending', async () => {
    const res = await api().post(`/api/v1/treasury/closes/${approvedCloseId}/approve`).expect(409);
    expectBodyMatchesSchema('post', '/treasury/closes/{id}/approve', 409, res.body);
    expect(res.body.code).toBe('close_not_pending');
  });

  it('شناسهٔ خراب 400 ← invalid_id و ناموجود 404 ← not_found', async () => {
    const bad = await api().post('/api/v1/treasury/closes/abc/approve').expect(400);
    expectBodyMatchesSchema('post', '/treasury/closes/{id}/approve', 400, bad.body);
    expect(bad.body.code).toBe('invalid_id');

    const miss = await api().post(`/api/v1/treasury/closes/${MISSING}/approve`).expect(404);
    expectBodyMatchesSchema('post', '/treasury/closes/{id}/approve', 404, miss.body);
    expect(miss.body.code).toBe('not_found');
  });

  it('پس از تأیید، فیلتر status=approved آن را برمی‌گرداند', async () => {
    const res = await api().get('/api/v1/treasury/closes').query({ status: 'approved' }).expect(200);
    expectBodyMatchesSchema('get', '/treasury/closes', 200, res.body);
    const ids = res.body.items.map((c: { id: string }) => c.id);
    expect(ids).toContain(approvedCloseId);
    expect(ids).not.toContain(pendingCloseId);
  });
});

// =====================================================================
// پوشش خطاهای مستندشدهٔ همهٔ عملیات /treasury/closes
// =====================================================================
describe('Treasury — پوشش خطاهای مستندشده', () => {
  it('همهٔ خطاهای مستندشده در همین فایل آزموده شده‌اند', () => {
    const ops: [string, string][] = [
      ['get', '/treasury/closes'],
      ['get', '/treasury/closes/{id}'],
      ['post', '/treasury/closes'],
      ['post', '/treasury/closes/{id}/approve'],
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
