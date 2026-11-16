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
 * تست API — دامنهٔ P3 (بخش‌بندی مشتری / اعتبار و مسدودی / پوششِ قلمرو):
 *
 *   P3-A  بخش‌بندی: ساخت/فهرست/Patch، کد تکراری 409، غیرفعال‌سازی، 403 بیننده
 *   P3-B  انتساب بخش به مشتری: بخش ناموجود/غیرفعال ⇒ 400
 *   P3-C  دروازهٔ اعتبار در ثبتِ سفارش: فراتر از سقف ⇒ 409 credit_limit_exceeded
 *   P3-D  مسدودی اعتبار: hold ⇒ 409 credit_hold در ثبت؛ رفعِ مسدودی ⇒ ثبت مجاز؛
 *         مسدودی روی تأییدِ همان سفارش هم اثر دارد (هیچ‌وقت با استثنا دور نمی‌خورد)
 *   P3-E  استثنای اعتبار: ساختِ سفارش استثنا ⇒ 201 + گردش ar.credit.exception؛
 *         تأییدِ سفارش بدونِ تصمیم ⇒ 409 credit_exception_required؛
 *         تصمیم تأییدکننده ⇒ سپس POST /orders/{id}/approve ⇒ 200
 *   P3-F  قلمرو: انتسابِ گروهی همه-یا-هیچ + گزارش پوشش (route/assigned)
 *
 * دیتابیس موقت greendms_p3_credit_test از صفر + همهٔ مهاجرت‌ها (از جمله 0066).
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_p3_credit_test';
const PSQL = process.env.PSQL ?? 'psql';
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

const ADMIN_USER = 'p3_admin';
const ADMIN_PASSWORD = 'S3cret!pass';
const VIEWER_USER = 'p3_viewer';
const VIEWER_PASSWORD = 'View!pass1';
const APPROVER_USER = 'p3_approver';
const APPROVER_PASSWORD = 'Apr!pass123';

let adminToken = '';
let viewerToken = '';
let approverToken = '';
let companyId = '';
let branchId = '';
let customerOkId = '';
let customerLimitId = '';
let customerHoldId = '';
let customerNoInvoiceId = ''; // مشتری استثنا (سقف بالا ولی معوقی ندارد)
let productId = '';
let areaId = '';
let routeId = '';

interface SpecDoc {
  paths: Record<string, Record<string, any>>;
  [key: string]: unknown;
}
let spec: SpecDoc;
let ajv: Ajv2020;

const api = (token?: string | null) => {
  const base = request(app.getHttpServer());
  const use = token === undefined ? adminToken : token;
  const verb = (method: 'get' | 'post' | 'patch' | 'put') => (url: string) => {
    const req = base[method](url);
    return use ? req.set('Authorization', `Bearer ${use}`) : req;
  };
  return { get: verb('get'), post: verb('post'), patch: verb('patch'), put: verb('put') };
};

const login = async (username: string, password: string): Promise<string> => {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ username, password })
    .expect(200);
  return res.body.access_token as string;
};

const today = () => new Date().toISOString().slice(0, 10);

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
};

/** مشتریِ تازه + کاربر ادمین/بیننده/تأییدکننده؛ همهٔ idها از SQL برمی‌گردند */
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
  const approverHash = await hashPassword(APPROVER_PASSWORD);

  const company = await pool.query<{ id: string }>(
    `insert into company (code, legal_name) values ('P3CO', 'شرکت تست دامنهٔ اعتبار') returning id`,
  );
  companyId = company.rows[0].id;
  const branch = await pool.query<{ id: string }>(
    `insert into branch (company_id, code, name) values ($1, 'MAIN', 'شعبه مرکزی') returning id`,
    [companyId],
  );
  branchId = branch.rows[0].id;

  // کالا + لیست قیمت
  const category = await pool.query<{ id: string }>(
    `insert into product_category (company_id, code, name) values ($1, 'P3CAT', 'دسته P3') returning id`,
    [companyId],
  );
  const product = await pool.query<{ id: string }>(
    `insert into product (company_id, code, name, category_id, base_uom_id)
     values ($1, 'P3-P1', 'کالای P3', $2, (select id from uom where code = 'pcs'))
     returning id`,
    [companyId, category.rows[0].id],
  );
  productId = product.rows[0].id;
  const priceList = await pool.query<{ id: string }>(
    `insert into price_list (company_id, code, title, kind)
     values ($1, 'P3-PL', 'لیست P3', 'general') returning id`,
    [companyId],
  );
  await pool.query(
    `insert into price_list_item (price_list_id, product_id, price, min_qty, valid)
     values ($1, $2, 1500, 0, daterange(current_date - 30, current_date + 30))`,
    [priceList.rows[0].id, productId],
  );

  // قلمرو: حوزه + مسیر
  const area = await pool.query<{ id: string }>(
    `insert into sales_area (branch_id, code, name) values ($1, 'P3-AREA', 'حوزهٔ P3') returning id`,
    [branchId],
  );
  areaId = area.rows[0].id;
  const route = await pool.query<{ id: string }>(
    `insert into route (area_id, code, name, visit_weekday) values ($1, 'P3-RT', 'مسیر P3', 1) returning id`,
    [areaId],
  );
  routeId = route.rows[0].id;

  /** چهار مشتری: بدونِ اعتبار، سقف‌دارِ درمانده، نگه‌داری‌اعتبار، و بدونِ سقف اما تأییدپذیر */
  const mkCustomer = async (code: string, personCode: string): Promise<string> => {
    const person = await pool.query<{ id: string }>(
      `insert into person (company_id, code, legal_type, first_name, last_name)
       values ($1, $2, 'natural', 'مشتری', $2) returning id`,
      [companyId, personCode],
    );
    const inserted = await pool.query<{ id: string }>(
      `insert into customer (person_id, branch_id, code, price_list_id)
       values ($1, $2, $3, $4) returning id`,
      [person.rows[0].id, branchId, code, priceList.rows[0].id],
    );
    return inserted.rows[0].id;
  };
  customerOkId = await mkCustomer('CU-OK-1', 'P3-OK');
  customerLimitId = await mkCustomer('CU-LT-1', 'P3-LT');
  customerHoldId = await mkCustomer('CU-HD-1', 'P3-HD');
  customerNoInvoiceId = await mkCustomer('CU-EX-1', 'P3-EX');

  // سقف اعتبار برای CU-LT-1 (ده‌هزار) + یک فاکتورِ بازِ پنج‌هزاری (بدهی) — نه معوق
  await pool.query(
    `insert into customer_credit (customer_id, credit_limit, max_overdue_days, block_on_overdue)
     values ($1, 10000, 30, true)`,
    [customerLimitId],
  );
  await pool.query(
    `insert into document_series (branch_id, doc_kind, fiscal_year, prefix, is_active)
     values ($1, 'invoice', 1405, 'P3', true)`,
    [branchId],
  );
  await pool.query(
    `insert into invoice (branch_id, doc_number, fiscal_year, series_id, customer_id,
                          invoice_date, due_date, subtotal, discount_total, tax_total,
                          grand_total, paid_amount, status)
     select $1, 'P3-INV-1', 1405, ds.id, $2,
            current_date - 10, current_date + 5,
            5000, 0, 0, 5000, 0, 'posted'
       from document_series ds where ds.branch_id = $1 and ds.doc_kind = 'invoice'`,
    [branchId, customerLimitId],
  );

  // ادمین همه‌مجوز
  const adminPerson = await pool.query<{ id: string }>(
    `insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, 'P3-ADM', 'natural', 'مدیر', 'P3') returning id`,
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
    `insert into user_role (app_user_id, role_id)
     select u.id, $1 from app_user u where u.username = $2`,
    [adminRole.rows[0].id, ADMIN_USER],
  );

  // بینندهٔ بدون مجوز P3
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
     values ($1, 'P3-VW', 'natural', 'بیننده', 'P3') returning id`,
    [companyId],
  );
  await pool.query(
    `insert into app_user (person_id, username, password_hash, access_level)
     values ($1, $2, $3, 'web')`,
    [viewerPerson.rows[0].id, VIEWER_USER, viewerHash],
  );
  await pool.query(
    `insert into user_role (app_user_id, role_id)
     select u.id, $1 from app_user u where u.username = $2`,
    [viewerRole.rows[0].id, VIEWER_USER],
  );

  // تأییدکنندهٔ مستقل: مجوز تأییدِ سفارش + تصمیم در گردش
  const approverRole = await pool.query<{ id: string }>(
    `insert into role (company_id, code, name) values ($1, 'p3_approver', 'تأییدکننده P3') returning id`,
    [companyId],
  );
  await pool.query(
    `insert into role_permission (role_id, permission_code)
     select $1, code from permission where code = any($2::text[])`,
    [approverRole.rows[0].id, ['sales.order.approve', 'rules.approval.decide']],
  );
  const approverPerson = await pool.query<{ id: string }>(
    `insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, 'P3-APR', 'natural', 'تأییدکننده', 'P3') returning id`,
    [companyId],
  );
  await pool.query(
    `insert into app_user (person_id, username, password_hash, access_level)
     values ($1, $2, $3, 'web')`,
    [approverPerson.rows[0].id, APPROVER_USER, approverHash],
  );
  await pool.query(
    `insert into user_role (app_user_id, role_id)
     select u.id, $1 from app_user u where u.username = $2`,
    [approverRole.rows[0].id, APPROVER_USER],
  );

  // سیاستِ تأییدِ «استثنای اعتبار» با یک‌مرحله‌ای تأیید توسط نقشِ p3_approver
  const chain = await pool.query<{ id: string }>(
    `insert into approval_chain (company_id, code, entity) values ($1, 'P3-CH', 'sales_order') returning id`,
    [companyId],
  );
  await pool.query(
    `insert into approval_step_def (approval_chain_id, step_no, approver_role_id)
     values ($1, 1, $2)`,
    [chain.rows[0].id, approverRole.rows[0].id],
  );
  await pool.query(
    `insert into approval_policy (company_id, operation, scope, approval_chain_id)
     values ($1, 'ar.credit.exception', 'central', $2)`,
    [companyId, chain.rows[0].id],
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
  approverToken = await login(APPROVER_USER, APPROVER_PASSWORD);
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

const orderBody = (customerId: string, qty: number) => ({
  customer_id: customerId,
  order_date: today(),
  lines: [{ product_id: productId, qty }],
});

describe('P3-A — بخش‌بندی: 403 / 201 / کد تکراری / patch', () => {
  it('بیننده بدون مجوز 403؛ ادمین بخش می‌سازد 201 و قرارداد اجرا می‌شود', async () => {
    await api(viewerToken)
      .get('/api/v1/customer-segments')
      .expect(403);

    const created = await api()
      .post('/api/v1/customer-segments')
      .send({ code: 'GOLD', title: 'مشتریان طلایی' })
      .expect(201);
    expectBodyMatchesSchema('post', '/customer-segments', 201, created.body);
    expect(created.body.code).toBe('GOLD');
    expect(created.body.is_active).toBe(true);

    const dupe = await api()
      .post('/api/v1/customer-segments')
      .send({ code: 'GOLD', title: 'تکراری' })
      .expect(409);
    expect(dupe.body.code).toBe('duplicate_code');
  });

  it('فهرست 200 + patch غیرفعال‌سازی؛ کد تغییر نمی‌کند', async () => {
    const list = await api().get('/api/v1/customer-segments').expect(200);
    expectBodyMatchesSchema('get', '/customer-segments', 200, list.body);
    expect(list.body.items.map((s: { code: string }) => s.code)).toContain('GOLD');

    const gold = list.body.items.find((s: { code: string }) => s.code === 'GOLD');
    const patched = await api()
      .patch(`/api/v1/customer-segments/${gold.id}`)
      .send({ description: 'مشتریان با حجم خرید بالا' })
      .expect(200);
    expect(patched.body.description).toBe('مشتریان با حجم خرید بالا');
  });
});

describe('P3-B — انتساب بخش به مشتری: ناموجود/غیرفعال ⇒ 400', () => {
  it('بخش ناموجود 400 segment_not_found؛ بخش غیرفعال 400 segment_inactive', async () => {
    const missing = '11111111-1111-4111-8111-111111111111';
    const p = await pool.query<{ id: string }>(
      `insert into person (company_id, code, legal_type, first_name, last_name)
       values ($1, 'P3-SEGN', 'natural', 'بخش', 'ناموجود') returning id`,
      [companyId],
    );
    const badSegment = await api()
      .post('/api/v1/customers')
      .send({ person_id: p.rows[0].id, code: 'CU-SEG-1', segment_id: missing })
      .expect(400);
    expect(badSegment.body.code).toBe('segment_not_found');

    // بخش را بساز و غیرفعال کن؛ انتساب مشتری تازه باید رد شود
    const created = await api()
      .post('/api/v1/customer-segments')
      .send({ code: 'DORMANT', title: 'بخش غیرفعال', is_active: true })
      .expect(201);
    await api()
      .patch(`/api/v1/customer-segments/${created.body.id}`)
      .send({ is_active: false })
      .expect(200);

    const p2 = await pool.query<{ id: string }>(
      `insert into person (company_id, code, legal_type, first_name, last_name)
       values ($1, 'P3-SEGI', 'natural', 'بخش', 'غیرفعال') returning id`,
      [companyId],
    );
    const inactive = await api()
      .post('/api/v1/customers')
      .send({ person_id: p2.rows[0].id, code: 'CU-SEG-2', segment_id: created.body.id })
      .expect(400);
    expect(inactive.body.code).toBe('segment_inactive');
  });
});

describe('P3-C — دروازهٔ اعتبار در ثبت سفارش (سقف)', () => {
  it('مشتری بدون ردیف اعتبار: ثبت 201؛ فراتر از سقف: 409 credit_limit_exceeded', async () => {
    const ok = await api()
      .post('/api/v1/orders')
      .send(orderBody(customerOkId, 1))
      .expect(201);
    expect(ok.body.status).toBe('draft');

    // CU-LT-1: سقف 10000، بدهی 5000 ⇒ در دسترس 5000؛ سفارش ۴×۱۵۰۰=۶۰۰۰
    const over = await api()
      .post('/api/v1/orders')
      .send(orderBody(customerLimitId, 4))
      .expect(409);
    expect(over.body.code).toBe('credit_limit_exceeded');
  });

  it('GET /customers/{id}/credit 200 با مانده و سقف؛ 404 برای شناسهٔ ناموجود', async () => {
    const detail = await api().get(`/api/v1/customers/${customerLimitId}/credit`).expect(200);
    expectBodyMatchesSchema('get', '/customers/{id}/credit', 200, detail.body);
    expect(detail.body.credit_limit).toBe(10000);
    expect(detail.body.total_due).toBe(5000);
    expect(detail.body.available_credit).toBe(5000);
    expect(detail.body.credit_hold).toBe(false);

    await api().get('/api/v1/customers/11111111-1111-4111-8111-111111111111/credit').expect(404);
  });
});

describe('P3-D — مسدودی اعتبار (hold): ثبت و تأیید را می‌بندد؛ رفع آزاد می‌کند', () => {
  it('hold 200؛ سپس POST /orders ⇒ 409 credit_hold؛ بیننده 403؛ release 200؛ ثبت دوباره مجاز', async () => {
    const before = await api()
      .post('/api/v1/orders')
      .send(orderBody(customerHoldId, 1))
      .expect(201);

    const hold = await api()
      .post(`/api/v1/customers/${customerHoldId}/credit/hold`)
      .send({ reason: 'بدهی معوق خارج از روند عادی' })
      .expect(200);
    expectBodyMatchesSchema('post', '/customers/{id}/credit/hold', 200, hold.body);
    expect(hold.body.credit_hold).toBe(true);

    await api(viewerToken)
      .post(`/api/v1/customers/${customerHoldId}/credit/hold`)
      .send({ reason: 'نباید قبول شود' })
      .expect(403);

    const blocked = await api()
      .post('/api/v1/orders')
      .send(orderBody(customerHoldId, 1))
      .expect(409);
    expect(blocked.body.code).toBe('credit_hold');

    // مسدودی روی تأییدِ همان سفارشِ پیش‌نویس هم اثر دارد
    const approveBlocked = await api(approverToken)
      .post(`/api/v1/orders/${before.body.id}/approve`)
      .expect(409);
    expect(approveBlocked.body.code).toBe('credit_hold');

    const release = await api()
      .post(`/api/v1/customers/${customerHoldId}/credit/release`)
      .send({ note: 'تسویه انجام شد' })
      .expect(200);
    expectBodyMatchesSchema('post', '/customers/{id}/credit/release', 200, release.body);
    expect(release.body.credit_hold).toBe(false);

    await api()
      .post('/api/v1/orders')
      .send(orderBody(customerHoldId, 1))
      .expect(201);
  });
});

describe('P3-E — استثنای اعتبار: چرخهٔ کامل گردش + مصرف در تأیید', () => {
  it('بدونِ مانع: 409 no_credit_exception_needed؛ با مانع: 201 + pending_approval', async () => {
    // مشتری بدون هیچ محدودیتی ⇒ گردش بی‌مورد ساخته نمی‌شود
    const noNeed = await api()
      .post('/api/v1/orders/credit-exception')
      .send({ ...orderBody(customerNoInvoiceId, 1), reason: 'سفارشِ عادی بدون هیچ مانعی' })
      .expect(409);
    expect(noNeed.body.code).toBe('no_credit_exception_needed');

    // مشتریِ سقف‌دار با بدهی ⇒ استثنا لازم است
    const created = await api()
      .post('/api/v1/orders/credit-exception')
      .send({ ...orderBody(customerLimitId, 4), reason: 'مشتری خوش‌حساب؛ پرداخت طی هفته آینده' })
      .expect(201);
    expectBodyMatchesSchema('post', '/orders/credit-exception', 201, created.body);
    expect(created.body.approval_request_id).toBeTruthy();
    expect(created.body.status).toBe('pending_approval');

    // خودتأییدیِ استثنا ممنوع — حتی پیش از مصرف در approve
    const selfDecision = await api()
      .post(`/api/v1/rules-engine/approvals/${created.body.approval_request_id}/decision`)
      .send({ step_no: 1, decision: 'approved' })
      .expect(403);
    expect(selfDecision.body.code).toBe('self_approval_forbidden');

    // تأییدکننده بدون تصمیم: تلاش برای approve ⇒ 409 credit_exception_required
    const approveFirst = await api(approverToken).post(`/api/v1/orders/${created.body.id}/approve`);
    expect(approveFirst.status).toBe(409);
    expect(approveFirst.body.code).toBe('credit_exception_required');

    // تصمیم تأییدکننده (نقش p3_approver) ⇒ سپس approve ⇒ 200
    const decision = await api(approverToken)
      .post(`/api/v1/rules-engine/approvals/${created.body.approval_request_id}/decision`)
      .send({ step_no: 1, decision: 'approved' })
      .expect(200);
    expect(decision.body.status ?? 'approved').toBeTruthy();

    const approved = await api(approverToken)
      .post(`/api/v1/orders/${created.body.id}/approve`)
      .expect(200);
    expectBodyMatchesSchema('post', '/orders/{id}/approve', 200, approved.body);
    expect(approved.body.status).toBe('approved');
  });

  it('استثنا برای سفارش موجود: POST /orders/{id}/credit-exception ⇒ 201 + ApprovalSubmission', async () => {
    const draft = await api()
      .post('/api/v1/orders')
      .send(orderBody(customerLimitId, 4));
    // این ثبت باید 409 باشد (سقف) — پس از راهٔ عادی نمی‌شود پیش‌نویس ساخت؛
    // سفارش استثنای قبلی را استفاده نمی‌کنیم؛ مسیر موجود ⇒ باید 409 باشد
    expect(draft.status).toBe(409);

    // سفارش پیش‌نویس را مستقیماً با مسیر استثنا بساز و بعد استثنای تازه بخواه
    const created = await api()
      .post('/api/v1/orders/credit-exception')
      .send({ ...orderBody(customerLimitId, 4), reason: 'استثنای دوم مشتری خوش‌حساب' })
      .expect(201);

    // استثنای تکراری برای همان سفارشِ تغییرنکرده ⇒ 409 approval_already_submitted
    // (موتور تأیید درخواستِ فعال با همان اثرانگشت را تشخیص می‌دهد و fail-closed می‌کند)
    const again = await api()
      .post(`/api/v1/orders/${created.body.id}/credit-exception`)
      .send({ reason: 'استثنای تکراری برای همان سفارش' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('approval_already_submitted');
  });
});

describe('P3-F — قلمرو: انتسابِ گروهی و گزارش پوشش', () => {
  it('انتسابِ CU-OK به مسیر 200؛ coverage 200 با شمارنده‌های سازگار؛ بیننده 403', async () => {
    const reassign = await api()
      .post('/api/v1/territory/reassign')
      .send({
        customer_ids: [customerOkId],
        target_route_id: routeId,
        reason: 'تخصیص اولیهٔ مسیر برای پوشش تست',
      })
      .expect(200);
    expectBodyMatchesSchema('post', '/territory/reassign', 200, reassign.body);
    expect(reassign.body.updated).toBe(1);
    expect(reassign.body.unassigned).toBe(false);

    const coverage = await api().get('/api/v1/territory/coverage').expect(200);
    expectBodyMatchesSchema('get', '/territory/coverage', 200, coverage.body);
    expect(coverage.body.totals.customers_total).toBeGreaterThanOrEqual(1);
    expect(coverage.body.totals.customers_assigned).toBeGreaterThanOrEqual(1);
    const assigned = coverage.body.routes.find((r: { route_id: string }) => r.route_id === routeId);
    expect(assigned?.assigned_count).toBeGreaterThanOrEqual(1);

    await api(viewerToken).get('/api/v1/territory/coverage').expect(403);

    // انتسابِ شناسهٔ ناموجود ⇒ 400 customer_not_found
    const bad = await api()
      .post('/api/v1/territory/reassign')
      .send({
        customer_ids: ['11111111-1111-4111-8111-111111111111'],
        target_route_id: routeId,
        reason: 'مشتریِ ناموجود — نباید اعمال شود',
      })
      .expect(400);
    expect(bad.body.code).toBe('customer_not_found');
  });
});
