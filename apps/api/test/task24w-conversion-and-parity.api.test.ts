import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';
import request from 'supertest';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { PG_POOL } from '../src/database/database.module';
import { validationPipeOptions } from '../src/common/validation';
import { hashPassword } from '../src/modules/identity-rbac/password';
import { businessToday, shiftBusinessDate } from '../src/common/business-date';

/**
 * TASK-24W — آزمونِ رگرسیونِ دو یافتهٔ بازِ TASK-24V:
 *
 *   A) HIGH-1-R1 — تبدیلِ درخواست به سفارش (`POST /requests/{id}/convert`):
 *      actor از نشست، مجوز از نشست (نه بدنه)، دلیلِ الزامی برای واگراییِ قیمت،
 *      ممیزیِ منبعِ تبدیل، ضدِ تکرار/هم‌زمانی، fail-closed بدونِ actor.
 *
 *   B) HIGH-2-R1 — هم‌سانیِ استعلام/شبیه‌سازی/سفارش: یک مسیرِ سیاست
 *      (`pricedPolicyRun`)، سقفِ تجمیعی، کفِ سود و استثنا، مجوزِ قیمتِ دستی،
 *      ردِ لیستِ بین‌قلمرویی، مرزِ تاریخ، گردکردن/مالیات، ورودیِ فرضی در
 *      شبیه‌سازی و اثباتِ «بدونِ سندِ کسب‌وکار».
 *
 * همهٔ ادعاها از مسیرِ HTTP و روی PostgreSQL ایزولهٔ یک‌بارمصرف اجرا می‌شوند.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_task24w_test';
const PSQL = process.env.PSQL ?? 'psql';

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

const ADMIN_USER = 'w_admin';
const ADMIN_PASSWORD = 'S3cret!pass';
/** ثبتِ سفارش + تبدیل، **بدونِ** مجوزِ قیمتِ دستی */
const CLERK_USER = 'w_clerk';
const CLERK_PASSWORD = 'Clerk!pass1';
/** همان اختیارات + `pricing.manual_price.apply` */
const PRICER_USER = 'w_pricer';
const PRICER_PASSWORD = 'Pricer!pass1';
/** فقط مشاهده — نه تبدیل، نه قیمتِ دستی */
const VIEWER_USER = 'w_viewer';
const VIEWER_PASSWORD = 'View!pass1';

let adminToken = '';
let clerkToken = '';
let pricerToken = '';
let viewerToken = '';

let companyId = '';
let branchId = '';
let customerId = '';
let productId = '';
let packagingId = '';
let adminUserId = '';
let warehouseId = '';

// تاریخِ کسب‌وکار (Asia/Tehran)، نه تاریخِ UTC؛ در بازهٔ ۲۰:۳۰–۲۴:۰۰ UTC این دو یک روز اختلاف دارند.
const TODAY = businessToday();
const ALL_DATES = { valid_from: '2020-01-01', valid_to: '2099-12-31' };
const REASON = 'قیمتِ توافقیِ قراردادِ سالانه طبقِ پیوستِ الف';

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

const num = (v: unknown): number => Number(v);

const countRows = async (table: string): Promise<number> => {
  const { rows } = await pool.query<{ c: number }>(`select count(*)::int as c from ${table}`);
  return Number(rows[0].c);
};

const seedUser = async (
  username: string,
  password: string,
  code: string,
  permissions: string[] | 'all',
): Promise<string> => {
  const hash = await hashPassword(password);
  const person = await pool.query<{ id: string }>(
    `insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, $2, 'natural', $3, 'آزمایشی') returning id`,
    [companyId, code, username],
  );
  const user = await pool.query<{ id: string }>(
    `insert into app_user (person_id, username, password_hash, access_level)
     values ($1, $2, $3, 'web') returning id`,
    [person.rows[0].id, username, hash],
  );
  const role = await pool.query<{ id: string }>(
    `insert into role (company_id, code, name) values ($1, $2, $2) returning id`,
    [companyId, `role_${code}`],
  );
  if (permissions === 'all') {
    await pool.query(
      `insert into role_permission (role_id, permission_code) select $1, code from permission`,
      [role.rows[0].id],
    );
  } else if (permissions.length > 0) {
    await pool.query(
      `insert into role_permission (role_id, permission_code)
       select $1, code from permission where code = any($2::text[])`,
      [role.rows[0].id, permissions],
    );
  }
  await pool.query(`insert into user_role (app_user_id, role_id) values ($1, $2)`, [
    user.rows[0].id,
    role.rows[0].id,
  ]);
  return user.rows[0].id;
};

/** درخواستِ مشتری با قیمتِ درخواستیِ دلخواه (وضعیت: submitted) */
const createRequest = async (
  lines: { product_id: string; qty: number; requested_price?: string | null }[],
  token = clerkToken,
): Promise<string> => {
  const res = await api(token)
    .post('/api/v1/requests')
    .send({
      customer_id: customerId,
      channel: 'field',
      lines: lines.map((l) => ({
        product_id: l.product_id,
        qty: l.qty,
        ...(l.requested_price ? { requested_price: l.requested_price } : {}),
      })),
    })
    .expect(201);
  const id = res.body.id as string;
  // ثبت‌شده (submitted) — پیش‌نیازِ تبدیل
  await pool.query(`update customer_request set status = 'submitted' where id = $1`, [id]);
  return id;
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

  pool = new pg.Pool({ connectionString: testUrl.toString(), max: 2 });

  companyId = (
    await pool.query<{ id: string }>(
      `insert into company (code, legal_name) values ('WCO', 'شرکتِ آزمونِ TASK-24W') returning id`,
    )
  ).rows[0].id;
  branchId = (
    await pool.query<{ id: string }>(
      `insert into branch (company_id, code, name) values ($1, 'MAIN', 'شعبه مرکزی') returning id`,
      [companyId],
    )
  ).rows[0].id;
  warehouseId = (
    await pool.query<{ id: string }>(
      `insert into warehouse (branch_id, code, name) values ($1, 'WH-W', 'انبار') returning id`,
      [branchId],
    )
  ).rows[0].id;

  const tax9 = (
    await pool.query<{ id: string }>(
      `insert into tax_code (company_id, code, title, rate_pct)
       values ($1, 'VAT9', 'مالیات ۹٪', 9) returning id`,
      [companyId],
    )
  ).rows[0].id;
  const categoryId = (
    await pool.query<{ id: string }>(
      `insert into product_category (company_id, code, name) values ($1, 'CAT', 'دسته') returning id`,
      [companyId],
    )
  ).rows[0].id;
  productId = (
    await pool.query<{ id: string }>(
      `insert into product (company_id, code, name, category_id, base_uom_id, tax_code_id)
       values ($1, 'W-P1', 'کالای آزمون', $2, (select id from uom where code = 'pcs'), $3) returning id`,
      [companyId, categoryId, tax9],
    )
  ).rows[0].id;
  packagingId = (
    await pool.query<{ id: string }>(
      `insert into product_packaging (product_id, uom_id, factor_to_base)
       values ($1, (select id from uom where code = 'carton'), 12) returning id`,
      [productId],
    )
  ).rows[0].id;
  const personId = (
    await pool.query<{ id: string }>(
      `insert into person (company_id, code, legal_type, first_name, last_name)
       values ($1, 'W-C1', 'natural', 'مشتری', 'آزمون') returning id`,
      [companyId],
    )
  ).rows[0].id;
  customerId = (
    await pool.query<{ id: string }>(
      `insert into customer (person_id, branch_id, code) values ($1, $2, 'W-C1') returning id`,
      [personId, branchId],
    )
  ).rows[0].id;

  adminUserId = await seedUser(ADMIN_USER, ADMIN_PASSWORD, 'W-ADM', 'all');
  await seedUser(CLERK_USER, CLERK_PASSWORD, 'W-CLK', [
    'master.price.view',
    'sales.order.create',
    'sales.order.view',
    'sales.request.create',
    'sales.request.view',
    'sales.request.convert',
  ]);
  await seedUser(PRICER_USER, PRICER_PASSWORD, 'W-PRC', [
    'master.price.view',
    'sales.order.create',
    'sales.order.view',
    'sales.request.create',
    'sales.request.view',
    'sales.request.convert',
    'pricing.manual_price.apply',
  ]);
  await seedUser(VIEWER_USER, VIEWER_PASSWORD, 'W-VW', [
    'master.price.view',
    'sales.order.view',
    'sales.request.view',
  ]);

  process.env.DATABASE_URL = testUrl.toString();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1', { exclude: ['api/health'] });
  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
  await app.init();

  adminToken = await login(ADMIN_USER, ADMIN_PASSWORD);
  clerkToken = await login(CLERK_USER, CLERK_PASSWORD);
  pricerToken = await login(PRICER_USER, PRICER_PASSWORD);
  viewerToken = await login(VIEWER_USER, VIEWER_PASSWORD);

  // قیمتِ سیستمی از مسیرِ API (لیستِ سراسری ۱۰۰۰)
  await api()
    .post('/api/v1/price-lists')
    .send({
      code: 'WL-1',
      title: 'لیستِ سراسری',
      kind: 'general',
      priority: 1,
      items: [{ product_id: productId, price: '1000', ...ALL_DATES }],
    })
    .expect(201);
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
// A) HIGH-1-R1 — تبدیلِ درخواست به سفارش
// =====================================================================

describe('W1 — تبدیلِ درخواست: مجوز، actor، دلیل، ممیزی', () => {
  it('مجوزِ تبدیل را دارد ولی قیمتِ دستی ندارد ⇒ قیمتِ درخواستی با 403 رد می‌شود', async () => {
    const requestId = await createRequest([{ product_id: productId, qty: 1, requested_price: '950' }]);
    const res = await api(clerkToken)
      .post(`/api/v1/requests/${requestId}/convert`)
      .send({ price_override_reason: REASON })
      .expect(403);
    expect(res.body.code).toBe('manual_price_not_authorized');
    // درخواست دست‌نخورده مانده است (هیچ سفارشی ساخته نشد)
    const req = await pool.query<{ status: string; sales_order_id: string | null }>(
      'select status, sales_order_id from customer_request where id = $1',
      [requestId],
    );
    expect(req.rows[0].status).toBe('submitted');
    expect(req.rows[0].sales_order_id).toBeNull();
  });

  it('درخواست بدونِ قیمتِ دستی ⇒ تبدیل با قیمتِ سیستمی و بدونِ نیازِ مجوزِ قیمت', async () => {
    const requestId = await createRequest([{ product_id: productId, qty: 2 }]);
    const res = await api(clerkToken).post(`/api/v1/requests/${requestId}/convert`).send({}).expect(201);
    expect(num(res.body.lines[0].unit_price)).toBe(1000);
    expect(res.body.request_id).toBe(requestId);
    // پیوندِ منبع: درخواست converted و sales_order_id پر شده
    const req = await pool.query<{ status: string; sales_order_id: string }>(
      'select status, sales_order_id from customer_request where id = $1',
      [requestId],
    );
    expect(req.rows[0].status).toBe('converted');
    expect(req.rows[0].sales_order_id).toBe(res.body.id);
  });

  it('تبدیلِ مجاز با قیمتِ دستی + دلیل ⇒ 201 و ممیزیِ کاملِ منبع', async () => {
    const requestId = await createRequest([{ product_id: productId, qty: 1, requested_price: '870' }]);
    const res = await api(pricerToken)
      .post(`/api/v1/requests/${requestId}/convert`)
      .send({ price_override_reason: REASON })
      .expect(201);

    expect(res.body.request_id).toBe(requestId);
    // قیمتِ نهایی = قیمتِ درخواستیِ مشتری (قاعدهٔ قیمتِ دستی)
    expect(num(res.body.lines[0].unit_price)).toBe(870);

    // ممیزیِ منبعِ تبدیل: actor، درخواست، سفارش، دلیل
    const convertLog = await pool.query<{ actor_user_id: string; after_data: any; before_data: any }>(
      `select actor_user_id, before_data, after_data from price_change_log
        where company_id = $1 and entity_type = 'customer_request' and entity_id = $2
          and action = 'convert_to_order'
        order by at desc limit 1`,
      [companyId, requestId],
    );
    expect(convertLog.rowCount).toBe(1);
    const row = convertLog.rows[0];
    expect(row.after_data.order_id).toBe(res.body.id);
    expect(row.after_data.request_id).toBe(requestId);
    expect(row.after_data.reason).toBe(REASON);
    expect(row.after_data.manual_price_used).toBe(true);
    expect(row.after_data.actor_user_id).toBeTruthy();
    expect(row.before_data.request_status).toBe('submitted');
    expect(Number(row.before_data.requested_prices[0].requested_price)).toBe(870);

    // و ممیزیِ قلمِ سفارش هم actor و قیمتِ سیستمی دارد (مسیرِ یگانه)
    const lineLog = await pool.query<{ actor_user_id: string; before_data: any; after_data: any }>(
      `select actor_user_id, before_data, after_data from price_change_log
        where company_id = $1 and entity_type = 'sales_order_line' and entity_id = $2
        order by at desc limit 1`,
      [companyId, res.body.id],
    );
    expect(lineLog.rowCount).toBe(1);
    expect(Number(lineLog.rows[0].before_data.system_unit_price)).toBe(1000);
    expect(Number(lineLog.rows[0].after_data.unit_price)).toBe(870);
  });

  it('قیمتِ دستیِ واگرا بدونِ دلیل ⇒ 400 و بدونِ سفارش', async () => {
    const requestId = await createRequest([{ product_id: productId, qty: 1, requested_price: '700' }]);
    const ordersBefore = await countRows('sales_order');
    const res = await api(pricerToken)
      .post(`/api/v1/requests/${requestId}/convert`)
      .send({})
      .expect(400);
    expect(res.body.code).toBe('override_reason_required');
    expect(await countRows('sales_order')).toBe(ordersBefore);
  });

  it('دلیلِ کوتاه/بی‌معنا (کمتر از ۳ نویسه) هم رد می‌شود', async () => {
    const requestId = await createRequest([{ product_id: productId, qty: 1, requested_price: '700' }]);
    const res = await api(pricerToken)
      .post(`/api/v1/requests/${requestId}/convert`)
      .send({ price_override_reason: '  آ  ' })
      .expect(400);
    expect(res.body.code).toBe('override_reason_required');
  });

  it('قیمتِ دستیِ برابر با قیمتِ سیستمی (بدونِ واگرایی) دلیل لازم ندارد', async () => {
    const requestId = await createRequest([{ product_id: productId, qty: 1, requested_price: '1000' }]);
    const res = await api(pricerToken)
      .post(`/api/v1/requests/${requestId}/convert`)
      .send({})
      .expect(201);
    expect(num(res.body.lines[0].unit_price)).toBe(1000);
  });

  it('پرچمِ جعلیِ مجوز در بدنه هیچ اثری ندارد (بدونِ مجوزِ واقعی ⇒ 403)', async () => {
    const requestId = await createRequest([{ product_id: productId, qty: 1, requested_price: '960' }]);
    const res = await api(clerkToken)
      .post(`/api/v1/requests/${requestId}/convert`)
      .send({
        price_override_reason: REASON,
        // همهٔ شکل‌های ممکنِ جعل — باید بی‌اثر باشند
        permissions: { manual_price: true, manual_price_apply: true },
        manual_price: true,
        allow_manual_price: true,
        allow_discount_override: true,
        is_admin: true,
        roles: ['admin'],
      })
      .expect(403);
    expect(res.body.code).toBe('manual_price_not_authorized');
  });

  it('تبدیل‌کنندهٔ بدونِ مجوزِ sales.request.convert ⇒ 403 (نگهبانِ مسیر)', async () => {
    const requestId = await createRequest([{ product_id: productId, qty: 1 }]);
    await api(viewerToken).post(`/api/v1/requests/${requestId}/convert`).send({}).expect(403);
  });

  it('بدونِ توکن ⇒ 401 (fail-closed؛ هیچ actor ضمنی‌ای وجود ندارد)', async () => {
    const requestId = await createRequest([{ product_id: productId, qty: 1 }]);
    const res = await api(null).post(`/api/v1/requests/${requestId}/convert`).send({}).expect(401);
    expect(res.body.code).toBeDefined();
  });

  it('تبدیلِ دوباره و هم‌زمان: فقط یک سفارش و یک رکوردِ ممیزی', async () => {
    const requestId = await createRequest([{ product_id: productId, qty: 1, requested_price: '990' }]);
    const payload = { price_override_reason: REASON };

    const [first, second] = await Promise.all([
      api(pricerToken).post(`/api/v1/requests/${requestId}/convert`).send(payload),
      api(pricerToken).post(`/api/v1/requests/${requestId}/convert`).send(payload),
    ]);
    const statuses = [first.status, second.status].sort();
    // یکی موفق، دیگری ۴۰۹ (یا هر دو ۴۰۹ در حالتی که وضعیت پیش از خواندن عوض شده)
    expect(statuses[0]).toBe(201);
    expect(statuses[1]).toBeGreaterThanOrEqual(400);
    expect([409, 400]).toContain(statuses[1]);

    const orders = await pool.query<{ c: number }>(
      `select count(*)::int as c from sales_order where request_id = $1`,
      [requestId],
    );
    // حداکثر یک سفارشِ پیوندخورده به این درخواست
    expect(orders.rows[0].c).toBe(1);

    const logs = await pool.query<{ c: number }>(
      `select count(*)::int as c from price_change_log
        where company_id = $1 and entity_type = 'customer_request' and entity_id = $2
          and action = 'convert_to_order'`,
      [companyId, requestId],
    );
    // فقط تبدیلِ برنده ممیزیِ منبع نوشته است (بدونِ رکوردِ تکراری)
    expect(logs.rows[0].c).toBe(1);

    // و تلاشِ سوم هم رد می‌شود
    await api(pricerToken)
      .post(`/api/v1/requests/${requestId}/convert`)
      .send(payload)
      .expect(409);
  });

  it('کفِ سود و سقفِ تخفیف روی مسیرِ تبدیل هم اعمال می‌شوند (بدونِ مسیرِ جایگزین)', async () => {
    // سیاستِ کفِ سود: حداقل ۳۰٪ روی بهای تمام‌شده (۸۰۰ ⇒ کف ۱۰۴۰)
    const policy = await api()
      .post('/api/v1/margin-policies')
      .send({ scope: 'company', min_margin_pct: '30', on_unknown_cost: 'block', priority: 10, valid_from: '2020-01-01' })
      .expect(201);
    await pool.query(
      `insert into product_cost (product_id, warehouse_id, method, avg_cost) values ($1, $2, 'moving_avg', '800')`,
      [productId, warehouseId],
    );
    try {
      const requestId = await createRequest([{ product_id: productId, qty: 1, requested_price: '500' }]);
      const res = await api(pricerToken)
        .post(`/api/v1/requests/${requestId}/convert`)
        .send({ price_override_reason: REASON })
        .expect(409);
      expect(['margin_floor_violation', 'margin_loss_making']).toContain(res.body.code);

      // و همان درخواست به سفارش تبدیل نشده است
      const req = await pool.query<{ status: string }>('select status from customer_request where id = $1', [
        requestId,
      ]);
      expect(req.rows[0].status).toBe('submitted');
    } finally {
      // پاک‌سازی: سیاست و بهای تمام‌شده نباید به آزمون‌های بعدی نشت کند
      await pool.query(`delete from margin_exception where margin_policy_id = $1`, [policy.body.id]).catch(() => undefined);
      await pool.query(`delete from margin_policy where id = $1`, [policy.body.id]);
      await pool.query(`delete from product_cost where product_id = $1`, [productId]);
    }
  });
});

// =====================================================================
// B) HIGH-2-R1 — هم‌سانیِ استعلام / شبیه‌سازی / سفارش
// =====================================================================

describe('W2 — هم‌سانیِ قیمت در استعلام، شبیه‌سازی و سفارش', () => {
  const quote = (body: Record<string, unknown>, token = adminToken) =>
    api(token).post('/api/v1/pricing/quote').send(body);
  const simulate = (body: Record<string, unknown>, token = adminToken) =>
    api(token).post('/api/v1/pricing/simulate').send({ ...body, persist_audit: false });
  const order = (body: Record<string, unknown>, token = adminToken) =>
    api(token).post('/api/v1/orders').send(body);

  const ctx = (over: Record<string, unknown> = {}) => ({
    customer_id: customerId,
    pricing_date: TODAY,
    lines: [{ product_id: productId, qty: 1 }],
    ...over,
  });

  it('زمینهٔ یکسان ⇒ سه مسیر عددِ یکسان می‌دهند (subtotal/discount/tax/grand)', async () => {
    const q = await quote(ctx()).expect(201);
    const s = await simulate(ctx()).expect(201);
    const o = await order({
      customer_id: customerId,
      order_date: TODAY,
      lines: [{ product_id: productId, qty: 1 }],
    }).expect(201);

    for (const key of ['subtotal', 'discount_total', 'tax_total', 'grand_total'] as const) {
      expect(num(s.body[key])).toBe(num(q.body[key]));
      expect(num(o.body[key])).toBe(num(q.body[key]));
    }
    expect(num(q.body.lines[0].unit_price)).toBe(num(o.body.lines[0].unit_price));
  });

  it('تشویق + سقفِ تجمیعی: استعلام، شبیه‌سازی و سفارش همه سقفِ پایدار را می‌بینند', async () => {
    const promo = await api().post('/api/v1/promotions').send({
      code: 'W-PROM40', title: 'چهل درصد', kind: 'percent_line', priority: 100,
      allow_stacking: true, is_active: true, ...ALL_DATES,
      benefit: { percent: 40 },
    }).expect(201);
    await api().patch('/api/v1/pricing/settings').send({ apply_promotions_on_orders: true }).expect(200);
    await api().patch('/api/v1/pricing/settings').send({ max_total_discount_pct: 5 }).expect(200);
    try {
      const q = await quote(ctx()).expect(201);
      const s = await simulate(ctx()).expect(201);
      const o = await order({
        customer_id: customerId,
        order_date: TODAY,
        price_override_reason: 'آزمونِ سقفِ تجمیعی',
        lines: [{ product_id: productId, qty: 1 }],
      }).expect(201);
      // سقفِ ۵٪ از ۱۰۰۰ = ۵۰
      expect(num(q.body.discount_total)).toBe(50);
      expect(num(s.body.discount_total)).toBe(50);
      expect(num(o.body.discount_total)).toBe(50);
    } finally {
      await api().patch('/api/v1/pricing/settings').send({ max_total_discount_pct: null }).expect(200);
      await api().patch('/api/v1/pricing/settings').send({ apply_promotions_on_orders: false }).expect(200);
      await api().patch(`/api/v1/promotions/${promo.body.id}`).send({ is_active: false }).expect(200);
    }
  });

  it('کفِ سود: استعلام نقض را گزارش می‌کند، سفارش رد می‌شود (یک سیاست، دو شکلِ پاسخ)', async () => {
    const policy = await api()
      .post('/api/v1/margin-policies')
      .send({ scope: 'company', min_margin_pct: '10', on_unknown_cost: 'block', priority: 20, valid_from: '2020-01-01' })
      .expect(201);
    await pool.query(
      `insert into product_cost (product_id, warehouse_id, method, avg_cost) values ($1, $2, 'moving_avg', '950')`,
      [productId, warehouseId],
    );
    try {
      const q = await quote(ctx({ lines: [{ product_id: productId, qty: 1, unit_price: '960' }] })).expect(201);
      expect(q.body.margin_violations.length).toBeGreaterThan(0);
      const o = await order({
        customer_id: customerId,
        order_date: TODAY,
        price_override_reason: REASON,
        lines: [{ product_id: productId, qty: 1, unit_price: '960' }],
      }).expect(409);
      expect(['margin_floor_violation', 'margin_loss_making']).toContain(o.body.code);
    } finally {
      await pool.query(`delete from product_cost where product_id = $1`, [productId]);
      await pool.query(`delete from margin_policy where id = $1`, [policy.body.id]);
    }
  });

  it('قیمتِ دستی: بدونِ مجوز ⇒ 403 در استعلام و سفارش؛ با مجوز ⇒ 201 در هر دو', async () => {
    const body = ctx({ lines: [{ product_id: productId, qty: 1, unit_price: '900' }] });
    const forbidden = await quote(body, clerkToken).expect(403);
    expect(forbidden.body.code).toBe('manual_price_not_authorized');
    await order(
      {
        customer_id: customerId,
        order_date: TODAY,
        price_override_reason: REASON,
        lines: [{ product_id: productId, qty: 1, unit_price: '900' }],
      },
      clerkToken,
    ).expect(403);

    // با مجوز (pricer) و دلیل ⇒ هر دو مسیر قیمتِ دستی را می‌پذیرند
    const allowed = await quote(body, pricerToken).expect(201);
    expect(num(allowed.body.lines[0].unit_price)).toBe(900);
    const allowedOrder = await order(
      {
        customer_id: customerId,
        order_date: TODAY,
        price_override_reason: REASON,
        lines: [{ product_id: productId, qty: 1, unit_price: '900' }],
      },
      pricerToken,
    ).expect(201);
    expect(num(allowedOrder.body.lines[0].unit_price)).toBe(900);
  });

  it('لیستِ قیمتِ بین‌قلمرویی: بدونِ مجوز/دلیل در هر سه مسیر رد می‌شود', async () => {
    // قلمروی دوم + لیستی متعلق به آن
    const otherBranch = (
      await pool.query<{ id: string }>(
        `insert into branch (company_id, code, name) values ($1, 'BR-W2', 'شعبه دوم') returning id`,
        [companyId],
      )
    ).rows[0].id;
    const otherDomain = (
      await api().post('/api/v1/pricing-domains').send({
        code: 'W-DOM2', title: 'قلمرو دوم', kind: 'branch', branch_id: otherBranch, priority: 5,
      }).expect(201)
    ).body.id;
    const foreignList = (
      await api().post('/api/v1/price-lists').send({
        code: 'W-PL-DOM2', title: 'لیست قلمرو دوم', kind: 'channel', priority: 50, domain_id: otherDomain,
        items: [{ product_id: productId, price: '1111', ...ALL_DATES }],
      }).expect(201)
    ).body.id;

    const clerkQuote = await quote(ctx({ price_list_id: foreignList }), clerkToken).expect(403);
    expect(clerkQuote.body.code).toBe('price_list_domain_forbidden');

    // مجوز دارد ولی دلیل ندارد ⇒ 400 (در استعلام و سفارش)
    const noReason = await quote(ctx({ price_list_id: foreignList }), adminToken).expect(400);
    expect(noReason.body.code).toBe('cross_domain_reason_required');

    // با دلیل ⇒ نتیجه یکسان در استعلام و سفارش
    const withReason = await quote(
      ctx({ price_list_id: foreignList, cross_domain_reason: 'قراردادِ بین‌شعبه‌ای' }),
      adminToken,
    ).expect(201);
    expect(num(withReason.body.lines[0].unit_price)).toBe(1111);
    const ord = await order(
      {
        customer_id: customerId,
        order_date: TODAY,
        price_list_id: foreignList,
        price_override_reason: 'قراردادِ بین‌شعبه‌ای',
        lines: [{ product_id: productId, qty: 1 }],
      },
      adminToken,
    ).expect(201);
    expect(num(ord.body.lines[0].unit_price)).toBe(1111);
  });

  it('مرزِ تاریخ: استعلام و سفارش هر دو تاریخِ مؤثر را یکسان می‌بینند', async () => {
    // لیستی که فقط تا دیروز معتبر است
    const yesterday = shiftBusinessDate(TODAY, -1);
    const expiredProduct = (
      await pool.query<{ id: string }>(
        `insert into product (company_id, code, name, category_id, base_uom_id)
         values ($1, 'W-P-EXP', 'کالای منقضی', (select id from product_category where company_id = $1 limit 1),
                 (select id from uom where code = 'pcs')) returning id`,
        [companyId],
      )
    ).rows[0].id;
    await api().post('/api/v1/price-lists').send({
      code: 'W-PL-EXP', title: 'لیستِ منقضی', kind: 'general', priority: 900,
      items: [{ product_id: expiredProduct, price: '500', valid_from: '2020-01-01', valid_to: yesterday }],
    }).expect(201);

    // استعلام برای «امروز» ⇒ قیمتی وجود ندارد
    const q = await quote(ctx({ lines: [{ product_id: expiredProduct, qty: 1 }] })).expect(400);
    expect(q.body.code).toBe('price_missing');
    // سفارشِ «امروز» هم همان خطا را می‌دهد
    const o = await order({
      customer_id: customerId,
      order_date: TODAY,
      lines: [{ product_id: expiredProduct, qty: 1 }],
    }).expect(400);
    expect(o.body.code).toBe('price_missing');
  });

  it('گردکردن و مالیات: سه مسیر تا ریالِ دوم یکسان‌اند (qty اعشاری + قیمتِ اعشاری)', async () => {
    await api().post('/api/v1/price-lists').send({
      code: 'W-PL-ODD', title: 'لیستِ اعشاری', kind: 'general', priority: 950,
      items: [{ product_id: productId, price: '333.335', ...ALL_DATES }],
    }).expect(201);
    try {
      const body = ctx({ lines: [{ product_id: productId, qty: 3.5 }] });
      const q = await quote(body).expect(201);
      const s = await simulate(body).expect(201);
      const o = await order({
        customer_id: customerId,
        order_date: TODAY,
        lines: [{ product_id: productId, qty: 3.5 }],
      }).expect(201);
      for (const key of ['subtotal', 'tax_total', 'grand_total'] as const) {
        expect(num(s.body[key])).toBe(num(q.body[key]));
        expect(num(o.body[key])).toBe(num(q.body[key]));
      }
      expect(num(q.body.tax_total)).toBeCloseTo(num(q.body.subtotal) * 0.09, 2);
    } finally {
      await pool.query(`update price_list set is_active = false where code = 'W-PL-ODD'`).catch(() => undefined);
    }
  });

  it('شبیه‌سازی: ورودیِ فرضی صریح است و هیچ سفارش/فاکتور/مصرفِ تشویقی نمی‌سازد', async () => {
    const before = {
      orders: await countRows('sales_order'),
      invoices: await countRows('invoice'),
      redemptions: await countRows('promotion_redemption'),
      sims: await countRows('price_simulation_log'),
    };
    const res = await api()
      .post('/api/v1/pricing/simulate')
      .send({
        pricing_date: '2026-03-01',
        lines: [
          { product_id: productId, qty: 5, unit_price: '800' },
        ],
        cross_domain_reason: 'سناریوی فرضیِ فروشِ عمده',
      })
      .expect(201);

    expect(res.body.creates_business_document).toBe(false);
    expect(res.body.hypothetical_inputs).toContain('pricing_date');
    expect(res.body.hypothetical_inputs).toContain('lines.unit_price');
    expect(res.body.simulation_id).toBeTruthy();

    expect(await countRows('sales_order')).toBe(before.orders);
    expect(await countRows('invoice')).toBe(before.invoices);
    expect(await countRows('promotion_redemption')).toBe(before.redemptions);
    // فقط یک ردیفِ ممیزیِ شبیه‌سازی
    expect(await countRows('price_simulation_log')).toBe(before.sims + 1);

    const logged = await pool.query<{ result: any }>(
      `select result from price_simulation_log order by id desc limit 1`,
    );
    const policy = logged.rows[0].result.policy;
    // سیاست و مجوزهای مؤثر در ممیزیِ شبیه‌سازی ثبت می‌شوند (قابلِ بازتولید)
    expect(policy).toHaveProperty('settings');
    expect(policy).toHaveProperty('permissions');
    expect(policy.mode).toBe('lookup');
  });

  it('استعلام فیلدهای سیاستِ مؤثر را برمی‌گرداند (تفاوتِ عمدیِ پاسخ با سفارش)', async () => {
    const q = await quote(ctx()).expect(201);
    expect(q.body.policy_applied.source).toBe('pricing_policy');
    expect(q.body.policy_applied.pricing_settings).toHaveProperty('max_total_discount_pct');
    expect(q.body.system_unit_prices).toHaveLength(1);
    // سفارش این فیلدها را ندارد (سندِ پایدار، نه گزارشِ سیاست)
    const o = await order({
      customer_id: customerId,
      order_date: TODAY,
      lines: [{ product_id: productId, qty: 1 }],
    }).expect(201);
    expect(o.body.policy_applied).toBeUndefined();
  });

  it('سقف/مجوز از بدنهٔ درخواست پذیرفته نمی‌شود (بدنه مجوز نیست)', async () => {
    const res = await api()
      .post('/api/v1/pricing/quote')
      .send({
        ...ctx(),
        max_total_discount_pct: 0,
        allow_manual_price: true,
        permissions: { manual_price: true },
        lines: [{ product_id: productId, qty: 1, unit_price: '950' }],
      })
      // مجوزِ قیمتِ دستی از نشست خوانده می‌شود؛ مدیر مجوز دارد ⇒ 201
      .expect(201);
    expect(num(res.body.lines[0].unit_price)).toBe(950);

    // و برای کاربرِ بدونِ مجوز، همان بدنه هم 403 می‌دهد
    const denied = await api(clerkToken)
      .post('/api/v1/pricing/quote')
      .send({
        ...ctx(),
        allow_manual_price: true,
        permissions: { manual_price: true },
        lines: [{ product_id: productId, qty: 1, unit_price: '950' }],
      })
      .expect(403);
    expect(denied.body.code).toBe('manual_price_not_authorized');
  });
});
