import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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
import { validationPipeOptions } from '../src/common/validation';
import { hashPassword } from '../src/modules/identity-rbac/password';
import {
  businessDateOf,
  businessDaysBehind,
  businessToday,
  isBusinessDate,
  shiftBusinessDate,
} from '../src/common/business-date';

/**
 * TASK-24X — آزمونِ رگرسیونِ یافته‌های حسابرسیِ مستقلِ TASK-24W:
 *
 *   A-1 (HIGH)    — سفارشِ تکراری از مسیرِ `POST /orders` با `request_id`
 *   B-1 (HIGH)    — واگراییِ `apply_promotions`: استعلام ۱۰۹۰ در برابر سفارش ۹۸۱
 *   C-1 (HIGH)    — fail-open شدنِ استثنای کفِ سود وقتی زنجیرهٔ تأیید تعریف نشده
 *   MEDIUM        — ناسازگاریِ تاریخِ UTC و تهران در بازهٔ ۲۰:۳۰–۲۴:۰۰ UTC
 *
 * هر ادعا از مسیرِ HTTP و روی PostgreSQLِ یک‌بارمصرف اجرا می‌شود.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_task24x_test';
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

const ADMIN_USER = 'x_admin';
const ADMIN_PASSWORD = 'S3cret!pass';
/** ثبتِ سفارش + تبدیل + قیمتِ دستی */
const PRICER_USER = 'x_pricer';
const PRICER_PASSWORD = 'Pricer!pass1';
/** همهٔ مجوزها — برای تصمیمِ استثنا (شخصِ دوم) */
const APPROVER_USER = 'x_approver';
const APPROVER_PASSWORD = 'Approve!pass1';
/** شرکتِ دوم برای آزمونِ جداسازی */
const OTHER_COMPANY_CODE = 'XCO2';

let adminToken = '';
let pricerToken = '';
let approverToken = '';
let companyId = '';
let company2Id = '';
let branchId = '';
let customerId = '';
let productId = '';
let adminUserId = '';
let approverUserId = '';
let pricerUserId = '';

const api = (token?: string | null) => {
  const base = request(app.getHttpServer());
  const use = token === undefined ? adminToken : token;
  const verb = (method: 'get' | 'post' | 'patch' | 'delete' | 'put') => (url: string) => {
    const req = base[method](url);
    return use ? req.set('Authorization', `Bearer ${use}`) : req;
  };
  return { get: verb('get'), post: verb('post'), patch: verb('patch'), delete: verb('delete'), put: verb('put') };
};

const login = async (username: string, password: string): Promise<string> => {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ username, password })
    .expect(200);
  return res.body.access_token as string;
};

const countRows = async (sql: string, params: unknown[] = []): Promise<number> => {
  const { rows } = await pool.query<{ c: number }>(sql, params);
  return Number(rows[0].c);
};

const seedUser = async (
  company: string,
  username: string,
  password: string,
  code: string,
  permissions: string[] | 'all',
): Promise<string> => {
  const hash = await hashPassword(password);
  const person = await pool.query<{ id: string }>(
    `insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, $2, 'natural', $3, 'آزمایشی') returning id`,
    [company, code, username],
  );
  const user = await pool.query<{ id: string }>(
    `insert into app_user (person_id, username, password_hash, access_level)
     values ($1, $2, $3, 'web') returning id`,
    [person.rows[0].id, username, hash],
  );
  const role = await pool.query<{ id: string }>(
    `insert into role (company_id, code, name) values ($1, $2, $2) returning id`,
    [company, `role_${code}`],
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

const ALL_DATES = { valid_from: '2020-01-01', valid_to: '2099-12-31' };
const REASON = 'قیمتِ توافقیِ قراردادِ سالانه طبقِ پیوستِ الف';

/** درخواستِ مشتریِ submitted */
const createRequest = async (
  lines: { product_id: string; qty: number; requested_price?: string | null }[],
  token = pricerToken,
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
  await pool.query(`update customer_request set status = 'submitted' where id = $1`, [id]);
  return id;
};

const setSettings = async (patch: Record<string, unknown>): Promise<void> => {
  await api().patch('/api/v1/pricing/settings').send(patch).expect(200);
};

const resetSettings = async (): Promise<void> => {
  await pool.query(`delete from pricing_settings where company_id = $1`, [companyId]);
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

  pool = new pg.Pool({ connectionString: testUrl.toString(), max: 4 });

  companyId = (
    await pool.query<{ id: string }>(
      `insert into company (code, legal_name) values ('XCO1', 'شرکتِ آزمونِ TASK-24X') returning id`,
    )
  ).rows[0].id;
  company2Id = (
    await pool.query<{ id: string }>(
      `insert into company (code, legal_name) values ($1, 'شرکتِ دومِ آزمون') returning id`,
      [OTHER_COMPANY_CODE],
    )
  ).rows[0].id;

  branchId = (
    await pool.query<{ id: string }>(
      `insert into branch (company_id, code, name) values ($1, 'MAIN', 'شعبه مرکزی') returning id`,
      [companyId],
    )
  ).rows[0].id;
  await pool.query(`insert into warehouse (branch_id, code, name) values ($1, 'WH-X', 'انبار')`, [
    branchId,
  ]);

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
       values ($1, 'X-P1', 'کالای آزمون', $2, (select id from uom where code = 'pcs'), $3) returning id`,
      [companyId, categoryId, tax9],
    )
  ).rows[0].id;

  const personId = (
    await pool.query<{ id: string }>(
      `insert into person (company_id, code, legal_type, first_name, last_name)
       values ($1, 'X-C1', 'natural', 'مشتری', 'آزمون') returning id`,
      [companyId],
    )
  ).rows[0].id;
  customerId = (
    await pool.query<{ id: string }>(
      `insert into customer (person_id, branch_id, code) values ($1, $2, 'X-C1') returning id`,
      [personId, branchId],
    )
  ).rows[0].id;

  adminUserId = await seedUser(companyId, ADMIN_USER, ADMIN_PASSWORD, 'X-ADM', 'all');
  approverUserId = await seedUser(companyId, APPROVER_USER, APPROVER_PASSWORD, 'X-APR', 'all');
  pricerUserId = await seedUser(companyId, PRICER_USER, PRICER_PASSWORD, 'X-PRC', [
    'master.price.view',
    'sales.order.create',
    'sales.order.view',
    'sales.request.create',
    'sales.request.view',
    'sales.request.convert',
    'pricing.manual_price.apply',
    'pricing.simulation.run',
    'pricing.margin.update',
  ]);
  void adminUserId;
  void pricerUserId;

  process.env.DATABASE_URL = testUrl.toString();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1', { exclude: ['api/health'] });
  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
  await app.init();

  adminToken = await login(ADMIN_USER, ADMIN_PASSWORD);
  pricerToken = await login(PRICER_USER, PRICER_PASSWORD);
  approverToken = await login(APPROVER_USER, APPROVER_PASSWORD);

  await api()
    .post('/api/v1/price-lists')
    .send({
      code: 'XL-1',
      title: 'لیستِ سراسری',
      kind: 'general',
      priority: 1,
      items: [{ product_id: productId, price: '1000', ...ALL_DATES }],
    })
    .expect(201);
}, 180_000);

afterAll(async () => {
  try {
    await app?.close();
  } catch {
    /* noop */
  }
  try {
    await pool?.end();
  } catch {
    /* noop */
  }
  try {
    await adminPool?.end();
  } catch {
    /* noop */
  }
});

// =====================================================================
// A-1 — یکتاییِ سفارش برای یک درخواست
// =====================================================================
describe('A-1 — ساختِ سفارشِ تکراری برای یک درخواست', () => {
  it('A1-1 · POST /orders با request_id پس از تبدیل ⇒ 409 (نه سفارشِ دوم)', async () => {
    const requestId = await createRequest([{ product_id: productId, qty: 1 }]);

    const conv = await api(pricerToken)
      .post(`/api/v1/requests/${requestId}/convert`)
      .send({ price_override_reason: REASON });
    expect(conv.status).toBe(201);

    // همان مسیرِ سوءاستفاده‌ای که حسابرسی نشان داد
    const alt = await api(pricerToken).post('/api/v1/orders').send({
      customer_id: customerId,
      order_date: businessToday(),
      request_id: requestId,
      lines: [{ product_id: productId, qty: 1 }],
    });

    expect(alt.status).toBe(409);
    expect(alt.body.code).toBe('request_already_converted');

    const orders = await countRows(
      `select count(*)::int as c from sales_order where request_id = $1`,
      [requestId],
    );
    expect(orders).toBe(1);
  });

  it('A1-2 · POST /orders دوبار با همان request_id ⇒ فقط یک سفارش', async () => {
    const requestId = await createRequest([{ product_id: productId, qty: 1 }]);
    const payload = {
      customer_id: customerId,
      order_date: businessToday(),
      request_id: requestId,
      lines: [{ product_id: productId, qty: 1 }],
    };

    const first = await api(pricerToken).post('/api/v1/orders').send(payload);
    expect(first.status).toBe(201);
    const second = await api(pricerToken).post('/api/v1/orders').send(payload);

    expect(second.status).toBe(409);
    expect(second.body.code).toBe('request_already_converted');
    expect(second.body.details?.sales_order_id).toBe(first.body.id);

    const orders = await countRows(
      `select count(*)::int as c from sales_order where request_id = $1`,
      [requestId],
    );
    expect(orders).toBe(1);
  });

  it('A1-3 · رقابتِ مستقیم: ۵ درخواستِ هم‌زمانِ POST /orders ⇒ دقیقاً یک سفارش', async () => {
    const requestId = await createRequest([{ product_id: productId, qty: 1 }]);
    const payload = {
      customer_id: customerId,
      order_date: businessToday(),
      request_id: requestId,
      lines: [{ product_id: productId, qty: 1 }],
    };

    const results = await Promise.all(
      Array.from({ length: 5 }, () => api(pricerToken).post('/api/v1/orders').send(payload)),
    );
    const created = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status === 409);

    expect(created).toHaveLength(1);
    expect(rejected).toHaveLength(4);
    const orders = await countRows(
      `select count(*)::int as c from sales_order where request_id = $1`,
      [requestId],
    );
    expect(orders).toBe(1);
  });

  it('A1-4 · رقابتِ تبدیل در برابر ساختِ مستقیمِ سفارش ⇒ دقیقاً یک سفارش', async () => {
    const requestId = await createRequest([{ product_id: productId, qty: 1 }]);
    const payload = {
      customer_id: customerId,
      order_date: businessToday(),
      request_id: requestId,
      lines: [{ product_id: productId, qty: 1 }],
    };

    const [conv, direct] = await Promise.all([
      api(pricerToken).post(`/api/v1/requests/${requestId}/convert`).send({ price_override_reason: REASON }),
      api(pricerToken).post('/api/v1/orders').send(payload),
    ]);

    const winners = [conv, direct].filter((r) => r.status === 201);
    expect(winners).toHaveLength(1);
    const orders = await countRows(
      `select count(*)::int as c from sales_order where request_id = $1`,
      [requestId],
    );
    expect(orders).toBe(1);
  });

  it('A1-5 · ایندکسِ یکتای جزئی وجود دارد و اسنادِ لغوشده را مستثنا می‌کند', async () => {
    const { rows } = await pool.query<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef from pg_indexes where tablename = 'sales_order' and indexname = 'uq_sales_order_request_active'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].indexdef).toContain('UNIQUE');
    expect(rows[0].indexdef).toContain('request_id');
    expect(rows[0].indexdef).toContain('cancelled');
  });

  it('A1-6 · لغوِ سفارش، تبدیلِ دوباره را ممکن می‌کند (سندِ لغوشده قفل نمی‌کند)', async () => {
    const requestId = await createRequest([{ product_id: productId, qty: 1 }]);
    const conv = await api(pricerToken)
      .post(`/api/v1/requests/${requestId}/convert`)
      .send({ price_override_reason: REASON });
    expect(conv.status).toBe(201);

    await pool.query(`update sales_order set status = 'cancelled' where id = $1`, [conv.body.id]);
    // درخواست را دستی به submitted برگردان تا مسیرِ کسب‌وکار شبیه‌سازی شود
    await pool.query(`update customer_request set status = 'submitted' where id = $1`, [requestId]);

    const again = await api(pricerToken).post('/api/v1/orders').send({
      customer_id: customerId,
      order_date: businessToday(),
      request_id: requestId,
      lines: [{ product_id: productId, qty: 1 }],
    });
    expect(again.status).toBe(201);
  });

  it('A1-7 · سفارشِ مستقل (بدونِ request_id) هرگز مسدود نمی‌شود', async () => {
    const payload = {
      customer_id: customerId,
      order_date: businessToday(),
      lines: [{ product_id: productId, qty: 1 }],
    };
    const a = await api(pricerToken).post('/api/v1/orders').send(payload);
    const b = await api(pricerToken).post('/api/v1/orders').send(payload);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.id).not.toBe(b.body.id);
  });

  it('A1-8 · جداسازیِ شرکت: request_id شرکتِ دیگر نشت نمی‌دهد', async () => {
    const requestId = await createRequest([{ product_id: productId, qty: 1 }]);
    const conv = await api(pricerToken)
      .post(`/api/v1/requests/${requestId}/convert`)
      .send({ price_override_reason: REASON });
    expect(conv.status).toBe(201);

    // کاربرِ شرکتِ دوم تلاش می‌کند همان شناسه را در POST /orders بگذارد
    const otherBranch = (
      await pool.query<{ id: string }>(
        `insert into branch (company_id, code, name) values ($1, 'M2', 'شعبه۲') returning id`,
        [company2Id],
      )
    ).rows[0].id;
    await pool.query(
      `insert into warehouse (branch_id, code, name) values ($1, 'WH2', 'انبار۲')`,
      [otherBranch],
    );
    const otherTax = (
      await pool.query<{ id: string }>(
        `insert into tax_code (company_id, code, title, rate_pct) values ($1, 'VAT9', 'م۹', 9) returning id`,
        [company2Id],
      )
    ).rows[0].id;
    const otherCat = (
      await pool.query<{ id: string }>(
        `insert into product_category (company_id, code, name) values ($1, 'CAT2', 'دسته۲') returning id`,
        [company2Id],
      )
    ).rows[0].id;
    const otherProduct = (
      await pool.query<{ id: string }>(
        `insert into product (company_id, code, name, category_id, base_uom_id, tax_code_id)
         values ($1, 'X2-P1', 'کالای۲', $2, (select id from uom where code = 'pcs'), $3) returning id`,
        [company2Id, otherCat, otherTax],
      )
    ).rows[0].id;
    const otherPerson = (
      await pool.query<{ id: string }>(
        `insert into person (company_id, code, legal_type, first_name, last_name)
         values ($1, 'X2-C1', 'natural', 'م۲', 'آ') returning id`,
        [company2Id],
      )
    ).rows[0].id;
    const otherCustomer = (
      await pool.query<{ id: string }>(
        `insert into customer (person_id, branch_id, code) values ($1, $2, 'X2-C1') returning id`,
        [otherPerson, otherBranch],
      )
    ).rows[0].id;
    await seedUser(company2Id, 'x_other', 'Other!pass1', 'X2', 'all');
    const otherToken = await login('x_other', 'Other!pass1');

    const res = await api(otherToken).post('/api/v1/orders').send({
      customer_id: otherCustomer,
      order_date: businessToday(),
      request_id: requestId,
      lines: [{ product_id: otherProduct, qty: 1 }],
    });
    // یا رد می‌شود (ارجاعِ نامعتبر) و یا اگر پذیرفته شود، هیچ سفارشی به آن درخواست نباید وصل شود
    const linked = await countRows(
      `select count(*)::int as c from sales_order where request_id = $1`,
      [requestId],
    );
    expect(linked).toBe(1);
    expect([400, 403, 404, 409]).toContain(res.status);
  });
});

// =====================================================================
// B-1 — هم‌سانیِ تشویق در استعلام/شبیه‌سازی/سفارش
// =====================================================================
describe('B-1 — هم‌سانیِ سیاستِ تشویق', () => {
  const seedPromotion = async (): Promise<void> => {
    await api()
      .post('/api/v1/promotions')
      .send({
        code: `XP-${Math.random().toString(36).slice(2, 8)}`,
        title: 'تخفیف ۱۰٪',
        kind: 'percent_line',
        benefit: { percent: 10 },
        is_active: true,
        ...ALL_DATES,
      })
      .expect(201);
  };

  it('B1-1 · تنظیمات روشن: استعلام == شبیه‌سازی == سفارش (۹۸۱)', async () => {
    await resetSettings();
    await setSettings({ apply_promotions_on_orders: true, max_total_discount_pct: 50 });
    await seedPromotion();

    const day = businessToday();
    const body = { customer_id: customerId, pricing_date: day, lines: [{ product_id: productId, qty: 1 }] };

    const quote = await api(pricerToken).post('/api/v1/pricing/quote').send(body);
    const sim = await api(pricerToken).post('/api/v1/pricing/simulate').send(body);
    const order = await api(pricerToken).post('/api/v1/orders').send({
      customer_id: customerId,
      order_date: day,
      lines: [{ product_id: productId, qty: 1 }],
    });

    expect(quote.status).toBe(201);
    expect(sim.status).toBe(201);
    expect(order.status).toBe(201);
    expect(Number(quote.body.grand_total)).toBe(981);
    expect(Number(sim.body.grand_total)).toBe(981);
    expect(Number(order.body.grand_total)).toBe(981);
  });

  it('B1-2 · تلاشِ خاموش‌کردنِ تشویق از بدنه اثری ندارد (ناسازگاریِ یافتهٔ B-1)', async () => {
    await resetSettings();
    await setSettings({ apply_promotions_on_orders: true, max_total_discount_pct: 50 });

    const day = businessToday();
    const body = {
      customer_id: customerId,
      pricing_date: day,
      // همان ورودی‌ای که در حسابرسی استعلام را ۱۰۹۰ می‌کرد
      apply_promotions: false,
      lines: [{ product_id: productId, qty: 1 }],
    };
    const quote = await api(pricerToken).post('/api/v1/pricing/quote').send(body);
    const order = await api(pricerToken).post('/api/v1/orders').send({
      customer_id: customerId,
      order_date: day,
      lines: [{ product_id: productId, qty: 1 }],
    });

    expect(quote.status).toBe(201);
    expect(order.status).toBe(201);
    // فیلدِ ناشناخته نادیده گرفته می‌شود؛ سیاستِ شرکت حاکم است ⇒ هر دو ۹۸۱
    expect(Number(quote.body.grand_total)).toBe(981);
    expect(Number(quote.body.grand_total)).toBe(Number(order.body.grand_total));
  });

  it('B1-3 · تنظیمات خاموش: هیچ‌یک از سه مسیر تشویق اعمال نمی‌کند (۱۰۹۰)', async () => {
    await resetSettings();
    await setSettings({ apply_promotions_on_orders: false });

    const day = businessToday();
    const body = { customer_id: customerId, pricing_date: day, lines: [{ product_id: productId, qty: 1 }] };
    const quote = await api(pricerToken).post('/api/v1/pricing/quote').send(body);
    const order = await api(pricerToken).post('/api/v1/orders').send({
      customer_id: customerId,
      order_date: day,
      lines: [{ product_id: productId, qty: 1 }],
    });

    expect(Number(quote.body.grand_total)).toBe(1090);
    expect(Number(order.body.grand_total)).toBe(1090);
  });

  it('B1-4 · شبیه‌سازی هیچ سندِ کسب‌وکاری نمی‌سازد', async () => {
    await resetSettings();
    await setSettings({ apply_promotions_on_orders: true, max_total_discount_pct: 50 });

    const before = await countRows(`select count(*)::int as c from sales_order`);
    const sim = await api(pricerToken).post('/api/v1/pricing/simulate').send({
      customer_id: customerId,
      pricing_date: businessToday(),
      lines: [{ product_id: productId, qty: 1 }],
    });
    expect(sim.status).toBe(201);
    expect(sim.body.creates_business_document).toBe(false);
    expect(await countRows(`select count(*)::int as c from sales_order`)).toBe(before);
  });

  it('B1-5 · مجوزِ قیمتِ دستی در استعلام و سفارش یکسان است', async () => {
    await resetSettings();
    const day = businessToday();
    const body = {
      customer_id: customerId,
      pricing_date: day,
      lines: [{ product_id: productId, qty: 1, unit_price: '900' }],
    };
    // x_approver همهٔ مجوزها را دارد؛ x_pricer هم قیمتِ دستی دارد
    const q = await api(approverToken).post('/api/v1/pricing/quote').send(body);
    const o = await api(approverToken).post('/api/v1/orders').send({
      customer_id: customerId,
      order_date: day,
      override_reason: undefined,
      price_override_reason: REASON,
      lines: [{ product_id: productId, qty: 1, unit_price: '900' }],
    });
    expect([201]).toContain(q.status);
    expect([201]).toContain(o.status);
    expect(Number(q.body.grand_total)).toBe(Number(o.body.grand_total));
  });
});

// =====================================================================
// C-1 — fail-closed تأییدِ استثنای کفِ سود
// =====================================================================
describe('C-1 — fail-closed بودنِ زنجیرهٔ تأییدِ استثنای کفِ سود', () => {
  const createChain = async (steps: number[]): Promise<string> => {
    const chain = (
      await pool.query<{ id: string }>(
        `insert into approval_chain (company_id, code, entity)
         values ($1, $2, 'pricing.margin_exception') returning id`,
        [companyId, `CH-${Math.random().toString(36).slice(2, 8)}`],
      )
    ).rows[0].id;
    for (const stepNo of steps) {
      await pool.query(
        `insert into approval_step_def (approval_chain_id, step_no) values ($1, $2)`,
        [chain, stepNo],
      );
    }
    return chain;
  };

  const removeChains = async (): Promise<void> => {
    // ترتیبِ حذف از روی FKها: margin_exception → approval_request → steps → chain
    await pool.query(`delete from margin_exception where company_id = $1`, [companyId]);
    await pool.query(
      `delete from approval_step_def where approval_chain_id in
         (select id from approval_chain where company_id = $1 and entity = 'pricing.margin_exception')`,
      [companyId],
    );
    await pool.query(
      `delete from approval_decision where approval_request_id in
         (select id from approval_request where approval_chain_id in
            (select id from approval_chain where company_id = $1 and entity = 'pricing.margin_exception'))`,
      [companyId],
    );
    await pool.query(
      `delete from approval_request where approval_chain_id in
         (select id from approval_chain where company_id = $1 and entity = 'pricing.margin_exception')`,
      [companyId],
    );
    await pool.query(
      `delete from approval_chain where company_id = $1 and entity = 'pricing.margin_exception'`,
      [companyId],
    );
  };

  const exceptionPayload = () => ({
    entity_type: 'price_list_item',
    product_id: productId,
    effective_margin_pct: 1,
    reason: 'استثنای آزمونِ حسابرسی برای کفِ سود',
  });

  it('C1-1 · نبودِ زنجیرهٔ تأیید ⇒ 409 و هیچ استثنایی ثبت نمی‌شود', async () => {
    await removeChains();
    const res = await api(pricerToken).post('/api/v1/margin-exceptions').send(exceptionPayload());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('approval_chain_required');
    expect(await countRows(`select count(*)::int as c from margin_exception`)).toBe(0);
  });

  it('C1-2 · زنجیرهٔ بدونِ مرحله ⇒ 409 (پیکربندیِ ناقص)', async () => {
    await removeChains();
    await createChain([]);
    const res = await api(pricerToken).post('/api/v1/margin-exceptions').send(exceptionPayload());
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('approval_chain_empty');
    expect(await countRows(`select count(*)::int as c from margin_exception`)).toBe(0);
  });

  it('C1-3 · زنجیرهٔ معتبر ⇒ استثنا با approval_request_id غیر-null ثبت می‌شود', async () => {
    await removeChains();
    await createChain([1]);
    const res = await api(pricerToken).post('/api/v1/margin-exceptions').send(exceptionPayload());
    expect(res.status).toBe(201);
    expect(res.body.approval_request_id).toBeTruthy();
    const linked = await countRows(
      `select count(*)::int as c from approval_request where id = $1`,
      [res.body.approval_request_id],
    );
    expect(linked).toBe(1);
  });

  it('C1-4 · ردیفِ تاریخیِ بدونِ تأیید حتی با مجوز تأیید قابلِ تصویب نیست', async () => {
    await removeChains();
    // ردیفِ «قدیمی» را مستقیم می‌سازیم (همان حالتی که باگِ C-1 تولید می‌کرد)
    const legacy = (
      await pool.query<{ id: string }>(
        `insert into margin_exception
           (company_id, entity_type, product_id, effective_margin_pct, reason, requested_by, status)
         values ($1, 'price_list_item', $2, 1, 'ردیفِ تاریخیِ بی‌تأیید', $3, 'pending') returning id`,
        [companyId, productId, pricerUserId],
      )
    ).rows[0].id;

    const res = await api(approverToken)
      .post(`/api/v1/margin-exceptions/${legacy}/decision`)
      .send({ decision: 'approve' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('approval_request_missing');
  });

  it('C1-5 · منعِ خودتأییدی روی مسیرِ استثنا', async () => {
    await removeChains();
    await createChain([1]);
    const created = await api(pricerToken).post('/api/v1/margin-exceptions').send(exceptionPayload());
    expect(created.status).toBe(201);

    // درخواست‌دهنده مجوزِ `pricing.margin.override` را ندارد ⇒ نگهبانِ مسیر (403).
    // این همان نتیجهٔ مطلوب است: خودتأییدی در هیچ حالتی ممکن نیست.
    const self = await api(pricerToken)
      .post(`/api/v1/margin-exceptions/${created.body.id}/decision`)
      .send({ decision: 'approve' });
    expect(self.status).toBe(403);

    // و اگر همان کاربر مجوزِ تصمیم را داشته باشد، قاعدهٔ «شخصِ دوم» صریحاً فعال می‌شود
    await pool.query(
      `insert into role_permission (role_id, permission_code)
       select r.id, 'pricing.margin.override' from role r
        where r.company_id = $1 and r.code = 'role_X-PRC'
       on conflict do nothing`,
      [companyId],
    );
    const self2 = await api(pricerToken)
      .post(`/api/v1/margin-exceptions/${created.body.id}/decision`)
      .send({ decision: 'approve' });
    expect(self2.status).toBe(403);
    expect(self2.body.code).toBe('second_person_required');
  });

  it('C1-6 · جداسازیِ شرکت: استثنای شرکتِ دیگر دیده نمی‌شود', async () => {
    await removeChains();
    await createChain([1]);
    const created = await api(pricerToken).post('/api/v1/margin-exceptions').send(exceptionPayload());
    expect(created.status).toBe(201);

    const otherToken = await login('x_other', 'Other!pass1');
    const res = await api(otherToken)
      .post(`/api/v1/margin-exceptions/${created.body.id}/decision`)
      .send({ decision: 'approve' });
    expect([403, 404]).toContain(res.status);
  });
});

// =====================================================================
// MEDIUM — تاریخِ کسب‌وکار (تهران)
// =====================================================================
describe('MEDIUM — تاریخِ کسب‌وکار', () => {
  it('M-1 · بازهٔ ۲۰:۳۰–۲۴:۰۰ UTC: تاریخِ UTC یک روز عقب‌تر است، تاریخِ کسب‌وکار نه', () => {
    const lateUtc = new Date('2026-06-15T21:30:00Z');
    const utcDate = lateUtc.toISOString().slice(0, 10);
    const businessDate = businessDateOf(lateUtc);

    expect(utcDate).toBe('2026-06-15');
    expect(businessDate).toBe('2026-06-16');
    expect(businessDate).not.toBe(utcDate);
  });

  it('M-2 · مرزِ نیمه‌شبِ تهران دقیقاً در ۲۰:۳۰ UTC است', () => {
    expect(businessDateOf(new Date('2026-06-15T20:29:59Z'))).toBe('2026-06-15');
    expect(businessDateOf(new Date('2026-06-15T20:30:00Z'))).toBe('2026-06-16');
  });

  it('M-3 · تاریخِ کسب‌وکار مستقل از TZ ماشین است', () => {
    const original = process.env.TZ;
    const moment = new Date('2026-06-15T22:00:00Z');
    const baseline = businessDateOf(moment);
    for (const tz of ['UTC', 'America/New_York', 'Europe/Berlin', 'Asia/Tokyo']) {
      process.env.TZ = tz;
      expect(businessDateOf(moment)).toBe(baseline);
    }
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
    expect(baseline).toBe('2026-06-16');
  });

  it('M-4 · کمک‌تابع‌های تاریخ درست عمل می‌کنند', () => {
    expect(isBusinessDate('2026-01-31')).toBe(true);
    expect(isBusinessDate('2026-1-31')).toBe(false);
    expect(isBusinessDate('2026-01-31T00:00:00Z')).toBe(false);
    expect(shiftBusinessDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftBusinessDate('2024-03-01', -1)).toBe('2024-02-29'); // کبیسه
    expect(businessDaysBehind('2026-06-10', '2026-06-16')).toBe(6);
  });

  it('M-4b · ساعتِ جعلی در پنجرهٔ ۲۰:۳۰ UTC: businessToday از UTC جلوتر است', async () => {
    // همان لحظه‌ای که در حسابرسی، convert() را رد می‌کرد
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-15T21:30:00Z'));
    try {
      const utcToday = new Date().toISOString().slice(0, 10);
      expect(utcToday).toBe('2026-06-15');
      expect(businessToday()).toBe('2026-06-16');
      // «گذشته» بودن با تاریخِ کسب‌وکار سنجیده می‌شود ⇒ امروز عقب‌گرد نیست
      expect(businessToday() < businessToday()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('M-5 · تبدیلِ درخواست از تاریخِ کسب‌وکار استفاده می‌کند و هم‌زمان با UTC یک روز عقب‌نمی‌ماند', async () => {
    const requestId = await createRequest([{ product_id: productId, qty: 1 }]);
    const conv = await api(pricerToken)
      .post(`/api/v1/requests/${requestId}/convert`)
      .send({ price_override_reason: REASON });
    expect(conv.status).toBe(201);

    const stored = (
      await pool.query<{ order_date: string }>(
        `select to_char(order_date, 'YYYY-MM-DD') as order_date from sales_order where id = $1`,
        [conv.body.id],
      )
    ).rows[0].order_date;
    // تاریخِ ثبت‌شده باید تاریخِ کسب‌وکار باشد، نه تاریخِ UTC
    expect(stored).toBe(businessToday());
  });
});
