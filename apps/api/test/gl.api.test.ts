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
 * تست API دفتر کل — /gl مطابق openapi.yaml (ماژول ۹، مهاجرت 0018):
 * ۱) دیتابیس موقت «greendms_gl_test» از صفر + همه مهاجرت‌ها
 * ۲) seed: شرکت/شعبه + ادمین(همه مجوزها)/بیننده(بدون gl) + چند حسابِ
 *    دفتر کل و یک دورهٔ مالی «باز» (این دو جدول در هیچ مهاجرتی seed نمی‌شوند)
 * ۳) گاردها (401/403)، کدینگ حساب‌ها، دوره‌ها (ساخت/بستن)، اسناد (ثبت سند
 *    دستیِ متوازن و همهٔ ردهای رد: یک‌سمتی، حساب نامعتبر/غیرثبت‌پذیر،
 *    ناترازی، نبود دورهٔ باز) و تراز آزمایشی
 * ۴) assertion پوششی: همه خطاهای مستندشدهٔ هر ۸ عملیات /gl آزموده شده‌اند
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_gl_test';
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

const ADMIN_USER = 'gl_admin';
const ADMIN_PASSWORD = 'S3cret!pass';
const VIEWER_USER = 'gl_viewer';
const VIEWER_PASSWORD = 'View!pass1';

let adminToken = '';
let viewerToken = '';
let companyId = '';
let branchId = '';
/** حساب بدهکارِ ثبت‌پذیر (صندوق) */
let accDebit = '';
/** حساب بستانکارِ ثبت‌پذیر (درآمد فروش) */
let accCredit = '';
/** حساب سرتیترِ غیرثبت‌پذیر (برای آزمون account_not_postable) */
let accNonPostable = '';
/** دورهٔ مالی بازِ نگه‌داشته برای ثبت سند */
let openPeriodId = '';

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

/** جمع اعشاری رشته‌های مبلغ برای assert تراز */
const sumMoney = (vals: (string | number | null | undefined)[]): number =>
  vals.reduce<number>((a, v) => a + (v == null || v === '' ? 0 : Number(v)), 0);

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
    `insert into company (code, legal_name) values ('GLCO', 'شرکت تست دفتر کل') returning id`,
  );
  companyId = company.rows[0].id;
  branchId = (
    await pool.query<{ id: string }>(
      `insert into branch (company_id, code, name) values ($1, 'MAIN', 'شعبه مرکزی') returning id`,
      [companyId],
    )
  ).rows[0].id;

  // ---- کدینگ حساب‌ها (gl_account در هیچ مهاجرتی seed نمی‌شود) ----
  const assetHeader = (
    await pool.query<{ id: string }>(
      `insert into gl_account (company_id, code, parent_id, level, title, nature, account_type, is_postable, control_type)
       values ($1, '1', null, 1, 'دارایی‌ها', 'debit', 'asset', false, 'none') returning id`,
      [companyId],
    )
  ).rows[0].id;
  accNonPostable = assetHeader; // سرتیتر سطح ۱ → غیرثبت‌پذیر
  accDebit = (
    await pool.query<{ id: string }>(
      `insert into gl_account (company_id, code, parent_id, level, title, nature, account_type, is_postable, control_type)
       values ($1, '1101', $2, 4, 'صندوق', 'debit', 'asset', true, 'cash') returning id`,
      [companyId, assetHeader],
    )
  ).rows[0].id;
  const revenueHeader = (
    await pool.query<{ id: string }>(
      `insert into gl_account (company_id, code, parent_id, level, title, nature, account_type, is_postable, control_type)
       values ($1, '4', null, 1, 'درآمدها', 'credit', 'revenue', false, 'none') returning id`,
      [companyId],
    )
  ).rows[0].id;
  accCredit = (
    await pool.query<{ id: string }>(
      `insert into gl_account (company_id, code, parent_id, level, title, nature, account_type, is_postable, control_type)
       values ($1, '4101', $2, 4, 'درآمد فروش', 'credit', 'revenue', true, 'none') returning id`,
      [companyId, revenueHeader],
    )
  ).rows[0].id;

  // ---- یک دورهٔ مالی بازِ پوشش‌دهندهٔ کل سال (fiscal_period هم seed نمی‌شود) ----
  openPeriodId = (
    await pool.query<{ id: string }>(
      `insert into fiscal_period (company_id, fiscal_year, period_no, start_date, end_date, status)
       values ($1, 1403, 1, '2024-01-01', '2024-12-31', 'open') returning id`,
      [companyId],
    )
  ).rows[0].id;

  // ---- کاربران: ادمین (همهٔ مجوزها) و بیننده (بدون هیچ gl.*) ----
  const adminPerson = await pool.query<{ id: string }>(
    `insert into person (company_id, code, first_name, last_name)
     values ($1, 'GL-ADM', 'مدیر', 'مالی') returning id`,
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
     values ($1, 'GL-VW', 'بیننده', 'آزمایشی') returning id`,
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
  // مجوز غیرِ gl → کاربر احراز هویت می‌شود ولی روی /gl ممنوع است (403)
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
// گاردها — 401 بدون توکن و 403 بدون مجوزِ gl برای هر ۸ عملیات
// =====================================================================
describe('GL — گاردها: 401 و 403', () => {
  it('بدون توکن 401 ← Error (همهٔ عملیات)', async () => {
    expectBodyMatchesSchema('get', '/gl/accounts', 401, (await api(null).get('/api/v1/gl/accounts').expect(401)).body);
    expectBodyMatchesSchema('get', '/gl/periods', 401, (await api(null).get('/api/v1/gl/periods').expect(401)).body);
    expectBodyMatchesSchema(
      'post',
      '/gl/periods',
      401,
      (
        await api(null)
          .post('/api/v1/gl/periods')
          .send({ fiscal_year: 1403, period_no: 5, start_date: '2024-05-01', end_date: '2024-05-31' })
          .expect(401)
      ).body,
    );
    expectBodyMatchesSchema(
      'post',
      '/gl/periods/{id}/close',
      401,
      (await api(null).post(`/api/v1/gl/periods/${MISSING}/close`).expect(401)).body,
    );
    expectBodyMatchesSchema('get', '/gl/journals', 401, (await api(null).get('/api/v1/gl/journals').expect(401)).body);
    expectBodyMatchesSchema(
      'get',
      '/gl/journals/{id}',
      401,
      (await api(null).get(`/api/v1/gl/journals/${MISSING}`).expect(401)).body,
    );
    expectBodyMatchesSchema(
      'post',
      '/gl/journals',
      401,
      (
        await api(null)
          .post('/api/v1/gl/journals')
          .send({ branch_id: branchId, entry_date: '2024-06-01', description: 'x', lines: [] })
          .expect(401)
      ).body,
    );
    expectBodyMatchesSchema(
      'get',
      '/gl/trial-balance',
      401,
      (await api(null).get('/api/v1/gl/trial-balance').expect(401)).body,
    );
  });

  it('بیننده روی /gl 403 ← Error با جزئیات مجوز', async () => {
    const viewer = { Authorization: `Bearer ${viewerToken}` };
    const assertForbidden = (b: { code?: string; details?: { required?: string[] } }) => {
      expect(b.code).toBe('forbidden');
      expect(b.details?.required?.[0]).toMatch(/^gl\./);
    };

    const accounts = await api(null).get('/api/v1/gl/accounts').set(viewer).expect(403);
    expectBodyMatchesSchema('get', '/gl/accounts', 403, accounts.body);
    assertForbidden(accounts.body);

    const periods = await api(null).get('/api/v1/gl/periods').set(viewer).expect(403);
    expectBodyMatchesSchema('get', '/gl/periods', 403, periods.body);
    assertForbidden(periods.body);

    const createPeriod = await api(null)
      .post('/api/v1/gl/periods')
      .set(viewer)
      .send({ fiscal_year: 1403, period_no: 6, start_date: '2024-06-01', end_date: '2024-06-30' })
      .expect(403);
    expectBodyMatchesSchema('post', '/gl/periods', 403, createPeriod.body);
    assertForbidden(createPeriod.body);

    const closePeriod = await api(null).post(`/api/v1/gl/periods/${MISSING}/close`).set(viewer).expect(403);
    expectBodyMatchesSchema('post', '/gl/periods/{id}/close', 403, closePeriod.body);
    assertForbidden(closePeriod.body);

    const journals = await api(null).get('/api/v1/gl/journals').set(viewer).expect(403);
    expectBodyMatchesSchema('get', '/gl/journals', 403, journals.body);
    assertForbidden(journals.body);

    const journal = await api(null).get(`/api/v1/gl/journals/${MISSING}`).set(viewer).expect(403);
    expectBodyMatchesSchema('get', '/gl/journals/{id}', 403, journal.body);
    assertForbidden(journal.body);

    const createJournal = await api(null)
      .post('/api/v1/gl/journals')
      .set(viewer)
      .send({ branch_id: branchId, entry_date: '2024-06-01', description: 'x', lines: [] })
      .expect(403);
    expectBodyMatchesSchema('post', '/gl/journals', 403, createJournal.body);
    assertForbidden(createJournal.body);

    const tb = await api(null).get('/api/v1/gl/trial-balance').set(viewer).expect(403);
    expectBodyMatchesSchema('get', '/gl/trial-balance', 403, tb.body);
    assertForbidden(tb.body);
  });
});

// =====================================================================
// کدینگ حساب‌ها
// =====================================================================
describe('GL — کدینگ حساب‌ها', () => {
  it('GET /gl/accounts 200 ← Page با حساب‌های seed و فیلتر nature', async () => {
    const res = await api().get('/api/v1/gl/accounts').expect(200);
    expectBodyMatchesSchema('get', '/gl/accounts', 200, res.body);
    expect(res.body.items.length).toBeGreaterThanOrEqual(4);
    const codes = res.body.items.map((a: { code: string }) => a.code);
    expect(codes).toContain('1101');
    expect(codes).toContain('4101');

    const debitOnly = await api().get('/api/v1/gl/accounts').query({ nature: 'debit' }).expect(200);
    expectBodyMatchesSchema('get', '/gl/accounts', 200, debitOnly.body);
    expect(debitOnly.body.items.every((a: { nature: string }) => a.nature === 'debit')).toBe(true);

    const assets = await api().get('/api/v1/gl/accounts').query({ account_type: 'asset' }).expect(200);
    expect(assets.body.items.every((a: { account_type: string }) => a.account_type === 'asset')).toBe(true);
  });
});

// =====================================================================
// دوره‌های مالی — ساخت و بستن
// =====================================================================
describe('GL — دوره‌های مالی', () => {
  let createdPeriodId = '';

  it('GET /gl/periods 200 ← فهرست دوره‌ها شامل دورهٔ باز', async () => {
    const res = await api().get('/api/v1/gl/periods').expect(200);
    expectBodyMatchesSchema('get', '/gl/periods', 200, res.body);
    expect(res.body.items.some((p: { id: string }) => p.id === openPeriodId)).toBe(true);
  });

  it('POST /gl/periods 201 ← FiscalPeriod (دورهٔ بازِ تازه)', async () => {
    const res = await api()
      .post('/api/v1/gl/periods')
      .send({ fiscal_year: 1403, period_no: 2, start_date: '2024-02-01', end_date: '2024-02-29' })
      .expect(201);
    expectBodyMatchesSchema('post', '/gl/periods', 201, res.body);
    expect(res.body.status).toBe('open');
    expect(res.body.period_no).toBe(2);
    createdPeriodId = res.body.id;
  });

  it('POST /gl/periods با بازهٔ وارونه 400 ← invalid_range', async () => {
    const res = await api()
      .post('/api/v1/gl/periods')
      .send({ fiscal_year: 1403, period_no: 3, start_date: '2024-12-31', end_date: '2024-01-01' })
      .expect(400);
    expectBodyMatchesSchema('post', '/gl/periods', 400, res.body);
    expect(res.body.code).toBe('invalid_range');
  });

  it('POST /gl/periods تکراری 409 ← duplicate_period', async () => {
    const res = await api()
      .post('/api/v1/gl/periods')
      .send({ fiscal_year: 1403, period_no: 1, start_date: '2024-01-01', end_date: '2024-01-31' })
      .expect(409);
    expectBodyMatchesSchema('post', '/gl/periods', 409, res.body);
    expect(res.body.code).toBe('duplicate_period');
  });

  it('POST /gl/periods/{id}/close 200 ← دوره بسته می‌شود', async () => {
    const res = await api().post(`/api/v1/gl/periods/${createdPeriodId}/close`).expect(200);
    expectBodyMatchesSchema('post', '/gl/periods/{id}/close', 200, res.body);
    expect(res.body.status).toBe('closed');
    expect(res.body.closed_at).toBeTruthy();
  });

  it('بستن دوبارهٔ دوره 409 ← period_not_open', async () => {
    const res = await api().post(`/api/v1/gl/periods/${createdPeriodId}/close`).expect(409);
    expectBodyMatchesSchema('post', '/gl/periods/{id}/close', 409, res.body);
    expect(res.body.code).toBe('period_not_open');
  });

  it('بستن دورهٔ ناموجود 404 و شناسهٔ خراب 400', async () => {
    const miss = await api().post(`/api/v1/gl/periods/${MISSING}/close`).expect(404);
    expectBodyMatchesSchema('post', '/gl/periods/{id}/close', 404, miss.body);
    expect(miss.body.code).toBe('not_found');

    const bad = await api().post('/api/v1/gl/periods/abc/close').expect(400);
    expectBodyMatchesSchema('post', '/gl/periods/{id}/close', 400, bad.body);
    expect(bad.body.code).toBe('invalid_id');
  });
});

// =====================================================================
// اسناد حسابداری — ثبت سند دستیِ متوازن و ردهای رد
// =====================================================================
describe('GL — اسناد حسابداری', () => {
  let journalId = '';

  const balancedBody = (over: Record<string, unknown> = {}) => ({
    branch_id: branchId,
    entry_date: '2024-06-01',
    description: 'شناسایی درآمد نقدی',
    lines: [
      { account_id: accDebit, description: 'صندوق', debit: '1000' },
      { account_id: accCredit, description: 'درآمد فروش', credit: '1000' },
    ],
    ...over,
  });

  it('POST /gl/journals سند متوازن 201 ← JournalEntry (posted + JV + سطرها)', async () => {
    const res = await api().post('/api/v1/gl/journals').send(balancedBody()).expect(201);
    expectBodyMatchesSchema('post', '/gl/journals', 201, res.body);
    journalId = res.body.id;
    expect(res.body.status).toBe('posted');
    expect(res.body.doc_number).toMatch(/^JV-/);
    expect(res.body.source_type).toBe('manual');
    expect(Number(res.body.total_debit)).toBe(1000);
    expect(Number(res.body.total_credit)).toBe(1000);
    expect(res.body.lines).toHaveLength(2);
    expect(res.body.fiscal_period_id).toBe(openPeriodId);
  });

  it('GET /gl/journals/{id} 200 ← سند با سطرها؛ شناسه خراب 400 و ناموجود 404', async () => {
    const detail = await api().get(`/api/v1/gl/journals/${journalId}`).expect(200);
    expectBodyMatchesSchema('get', '/gl/journals/{id}', 200, detail.body);
    expect(detail.body.id).toBe(journalId);
    expect(detail.body.lines).toHaveLength(2);
    const debitLine = detail.body.lines.find((l: { account_id: string }) => l.account_id === accDebit);
    expect(Number(debitLine.debit)).toBe(1000);
    expect(debitLine.account_code).toBe('1101');

    const bad = await api().get('/api/v1/gl/journals/abc').expect(400);
    expectBodyMatchesSchema('get', '/gl/journals/{id}', 400, bad.body);
    expect(bad.body.code).toBe('invalid_id');

    const miss = await api().get(`/api/v1/gl/journals/${MISSING}`).expect(404);
    expectBodyMatchesSchema('get', '/gl/journals/{id}', 404, miss.body);
    expect(miss.body.code).toBe('not_found');
  });

  it('GET /gl/journals 200 ← Page + فیلتر status و source_type', async () => {
    const res = await api().get('/api/v1/gl/journals').expect(200);
    expectBodyMatchesSchema('get', '/gl/journals', 200, res.body);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);

    const posted = await api().get('/api/v1/gl/journals').query({ status: 'posted' }).expect(200);
    expect(posted.body.items.every((j: { status: string }) => j.status === 'posted')).toBe(true);

    const manual = await api().get('/api/v1/gl/journals').query({ source_type: 'manual' }).expect(200);
    expect(manual.body.items.every((j: { source_type: string }) => j.source_type === 'manual')).toBe(true);
  });

  it('بدون حداقل دو سطر 400 ← validation_failed', async () => {
    const res = await api()
      .post('/api/v1/gl/journals')
      .send({ branch_id: branchId, entry_date: '2024-06-01', description: 'یک سطر', lines: [
        { account_id: accDebit, description: 'صندوق', debit: '10' },
      ] })
      .expect(400);
    expectBodyMatchesSchema('post', '/gl/journals', 400, res.body);
    expect(res.body.code).toBe('validation_failed');
  });

  it('شعبهٔ نامعتبر 400 ← branch_invalid', async () => {
    const res = await api().post('/api/v1/gl/journals').send(balancedBody({ branch_id: MISSING })).expect(400);
    expectBodyMatchesSchema('post', '/gl/journals', 400, res.body);
    expect(res.body.code).toBe('branch_invalid');
  });

  it('سطرِ دوسمت‌دار 400 ← line_one_side', async () => {
    const res = await api()
      .post('/api/v1/gl/journals')
      .send(
        balancedBody({
          lines: [
            { account_id: accDebit, description: 'صندوق', debit: '100', credit: '100' },
            { account_id: accCredit, description: 'درآمد', credit: '100' },
          ],
        }),
      )
      .expect(400);
    expectBodyMatchesSchema('post', '/gl/journals', 400, res.body);
    expect(res.body.code).toBe('line_one_side');
  });

  it('حسابِ غیرثبت‌پذیر 400 ← account_not_postable', async () => {
    const res = await api()
      .post('/api/v1/gl/journals')
      .send(
        balancedBody({
          lines: [
            { account_id: accNonPostable, description: 'سرتیتر', debit: '100' },
            { account_id: accCredit, description: 'درآمد', credit: '100' },
          ],
        }),
      )
      .expect(400);
    expectBodyMatchesSchema('post', '/gl/journals', 400, res.body);
    expect(res.body.code).toBe('account_not_postable');
  });

  it('حسابِ ناموجود 400 ← account_invalid', async () => {
    const res = await api()
      .post('/api/v1/gl/journals')
      .send(
        balancedBody({
          lines: [
            { account_id: MISSING, description: 'ناموجود', debit: '100' },
            { account_id: accCredit, description: 'درآمد', credit: '100' },
          ],
        }),
      )
      .expect(400);
    expectBodyMatchesSchema('post', '/gl/journals', 400, res.body);
    expect(res.body.code).toBe('account_invalid');
  });

  it('سندِ ناتراز 422 ← journal_unbalanced', async () => {
    const res = await api()
      .post('/api/v1/gl/journals')
      .send(
        balancedBody({
          lines: [
            { account_id: accDebit, description: 'صندوق', debit: '100' },
            { account_id: accCredit, description: 'درآمد', credit: '50' },
          ],
        }),
      )
      .expect(422);
    expectBodyMatchesSchema('post', '/gl/journals', 422, res.body);
    expect(res.body.code).toBe('journal_unbalanced');
  });

  it('تاریخ خارج از هر دورهٔ باز 422 ← period_not_open', async () => {
    const res = await api()
      .post('/api/v1/gl/journals')
      .send(balancedBody({ entry_date: '2020-01-01' }))
      .expect(422);
    expectBodyMatchesSchema('post', '/gl/journals', 422, res.body);
    expect(res.body.code).toBe('period_not_open');
  });
});

// =====================================================================
// تراز آزمایشی — جمع بدهکار و بستانکار برابر است
// =====================================================================
describe('GL — تراز آزمایشی', () => {
  it('GET /gl/trial-balance 200 ← ردیف‌های متوازن پس از ثبت سند', async () => {
    // یک سند متوازن دیگر تا تراز قطعاً داده داشته باشد
    await api()
      .post('/api/v1/gl/journals')
      .send({
        branch_id: branchId,
        entry_date: '2024-07-01',
        description: 'درآمد نقدی دوم',
        lines: [
          { account_id: accDebit, description: 'صندوق', debit: '500' },
          { account_id: accCredit, description: 'درآمد فروش', credit: '500' },
        ],
      })
      .expect(201);

    const res = await api().get('/api/v1/gl/trial-balance').query({ fiscal_year: 1403, period_no: 1 }).expect(200);
    expectBodyMatchesSchema('get', '/gl/trial-balance', 200, res.body);
    expect(res.body.items.length).toBeGreaterThanOrEqual(2);

    const totalDebit = sumMoney(res.body.items.map((r: { debit_total: string }) => r.debit_total));
    const totalCredit = sumMoney(res.body.items.map((r: { credit_total: string }) => r.credit_total));
    expect(Math.abs(totalDebit - totalCredit)).toBeLessThan(0.005);
    expect(totalDebit).toBeGreaterThan(0);

    const cashRow = res.body.items.find((r: { account_code: string }) => r.account_code === '1101');
    expect(cashRow).toBeTruthy();
    expect(Number(cashRow.debit_total)).toBeGreaterThan(0);
    expect(cashRow.nature).toBe('debit');
  });
});

// =====================================================================
// پوشش خطاهای مستندشدهٔ همهٔ عملیات /gl
// =====================================================================
describe('GL — پوشش خطاهای مستندشده', () => {
  it('همهٔ خطاهای مستندشده در همین فایل آزموده شده‌اند', () => {
    const ops: [string, string][] = [
      ['get', '/gl/accounts'],
      ['get', '/gl/periods'],
      ['post', '/gl/periods'],
      ['post', '/gl/periods/{id}/close'],
      ['get', '/gl/journals'],
      ['get', '/gl/journals/{id}'],
      ['post', '/gl/journals'],
      ['get', '/gl/trial-balance'],
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
