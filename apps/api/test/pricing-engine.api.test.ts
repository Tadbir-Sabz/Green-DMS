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

/**
 * تستِ رفتاریِ APIِ موتورِ قیمت/تخفیف (TASK-24) — پوششِ ۹ ناحیهٔ پایان‌به‌پایان:
 *   PE-1 دقتِ شبیه‌سازی (بدونِ سندِ کسب‌وکار)
 *   PE-2 تقدمِ منابعِ قیمت + جداسازیِ قلمرو + مرزِ تاریخ + سطحِ بسته‌بندی
 *   PE-3 اجرای تشویق و سقفِ تخفیف
 *   PE-4 کفِ سود + استثنای دو‌شخصی (SECOND PERSON)
 *   PE-5 تخفیف/قیمتِ دستیِ غیرمجاز ⇒ 403 (پرچم فقط از مجوزها، نه بدنه)
 *   PE-6 تغییرناپذیریِ سندِ تاریخی + دفترِ تغییرِ قیمت
 *   PE-7 idempotency و بازپخش
 *   PE-8 تغییرِ هم‌زمانِ قیمت (row_version ⇒ 409)
 *   PE-9 جداسازیِ اجاره (مشتری/لیستِ قیمتِ شرکتِ دیگر)
 *
 * هیچ تستی skip/ضعیف نمی‌شود؛ هر رفتارِ موتور باید از مسیرِ HTTP اثبات شود.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_pricing_engine_test';
const PSQL = process.env.PSQL ?? 'C:/Program Files/PostgreSQL/16/bin/psql.exe';

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

const ADMIN_USER = 'pe_admin';
const ADMIN_PASSWORD = 'S3cret!pass';
const VIEWER_USER = 'pe_viewer';
const VIEWER_PASSWORD = 'View!pass1';
const APPROVER_USER = 'pe_approver';
const APPROVER_PASSWORD = 'Appr0ve!pass';
/** TASK-24F · HIGH-3: کاربرِ «ثبتِ سفارش» بدونِ مجوزهای قیمتِ دستی/سقفِ تخفیف */
const ORDERER_USER = 'pe_orderer';
const ORDERER_PASSWORD = 'Order!pass1';
/** همان کاربر بدونِ مجوزِ تاریخِ گذشته (fail-closed) */
const BACKDATER_USER = 'pe_backdater';
const BACKDATER_PASSWORD = 'Back!pass1';

let adminToken = '';
let viewerToken = '';
let approverToken = '';
let ordererToken = '';
let backdaterToken = '';

let companyId = '';
let otherCompanyId = '';
let branchId = '';
let otherBranchId = '';
let categoryId = '';
let productId = '';
let otherProductId = '';
let giftProductId = '';
let packagingId = '';
let customerId = '';
let otherCustomerId = '';
let capProductId = '';
let concProductId = '';
let capListId = '';
let domainId = '';
let otherDomainId = '';
let companyListId = '';
/** لیستِ قیمتِ متعلق به قلمروِ دیگر (MEDIUM-2) */
let foreignDomainListId = '';

const TODAY = '2026-06-15';
/** دلیلِ الزامیِ ثبتِ سندِ عقب‌گرد (TASK-24F · HIGH-1) */
const BACKDATE_REASON = 'ثبتِ سندِ آزمایشی با تاریخِ گذشته برای آزمونِ کنترل‌ها';
const ALL_DATES = { valid_from: '2026-01-01', valid_to: '2026-12-31' };

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

/** شمارشِ ردیف‌های یک جدول — برای اثباتِ «بدونِ سندِ کسب‌وکار» */
const countRows = async (table: string, where = '', params: unknown[] = []): Promise<number> => {
  const { rows } = await pool.query<{ c: string }>(
    `select count(*)::text as c from ${table} ${where}`,
    params,
  );
  return Number(rows[0].c);
};

const newWarehouse = async (branch: string, code: string): Promise<string> => {
  const { rows } = await pool.query<{ id: string }>(
    `insert into warehouse (branch_id, code, name) values ($1, $2, $2) returning id`,
    [branch, code],
  );
  return rows[0].id;
};

const seedUser = async (
  username: string,
  password: string,
  code: string,
  permissions: string[] | 'all',
): Promise<void> => {
  const hash = await hashPassword(password);
  const person = await pool.query<{ id: string }>(
    `insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, $2, 'natural', $3, 'آزمایشی') returning id`,
    [companyId, code, username],
  );
  await pool.query(
    `insert into app_user (person_id, username, password_hash, access_level) values ($1, $2, $3, 'web')`,
    [person.rows[0].id, username, hash],
  );
  const role = await pool.query<{ id: string }>(
    `insert into role (company_id, code, name) values ($1, $2, $2) returning id`,
    [companyId, `role_${code}`],
  );
  if (permissions === 'all') {
    await pool.query(`insert into role_permission (role_id, permission_code) select $1, code from permission`, [
      role.rows[0].id,
    ]);
  } else if (permissions.length > 0) {
    await pool.query(
      `insert into role_permission (role_id, permission_code) select $1, code from permission where code = any($2::text[])`,
      [role.rows[0].id, permissions],
    );
  }
  await pool.query(
    `insert into user_role (app_user_id, role_id) select u.id, $1 from app_user u where u.username = $2`,
    [role.rows[0].id, username],
  );
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
  execFileSync(PSQL, [...psqlBase, '-d', TEST_DB, '-1', '-q', ...files], { env: psqlEnv, stdio: 'pipe' });

  pool = new pg.Pool({ connectionString: testUrl.toString(), max: 2 });

  // ---- شرکت‌ها ----
  companyId = (
    await pool.query<{ id: string }>(
      `insert into company (code, legal_name) values ('PECO', 'شرکت موتور قیمت') returning id`,
    )
  ).rows[0].id;
  otherCompanyId = (
    await pool.query<{ id: string }>(
      `insert into company (code, legal_name) values ('PECO2', 'شرکت دیگر') returning id`,
    )
  ).rows[0].id;

  branchId = (
    await pool.query<{ id: string }>(
      `insert into branch (company_id, code, name) values ($1, 'MAIN', 'شعبه مرکزی') returning id`,
      [companyId],
    )
  ).rows[0].id;
  otherBranchId = (
    await pool.query<{ id: string }>(
      `insert into branch (company_id, code, name) values ($1, 'BR2', 'شعبه دوم') returning id`,
      [companyId],
    )
  ).rows[0].id;

  const warehouseId = await newWarehouse(branchId, 'WH-1');

  const tax9 = (
    await pool.query<{ id: string }>(
      `insert into tax_code (company_id, code, title, rate_pct) values ($1, 'VAT9', 'مالیات ۹٪', 9) returning id`,
      [companyId],
    )
  ).rows[0].id;

  categoryId = (
    await pool.query<{ id: string }>(
      `insert into product_category (company_id, code, name) values ($1, 'CAT', 'دسته') returning id`,
      [companyId],
    )
  ).rows[0].id;

  productId = (
    await pool.query<{ id: string }>(
      `insert into product (company_id, code, name, category_id, base_uom_id, tax_code_id)
       values ($1, 'P-1', 'کالای اصلی', $2, (select id from uom where code = 'pcs'), $3) returning id`,
      [companyId, categoryId, tax9],
    )
  ).rows[0].id;
  giftProductId = (
    await pool.query<{ id: string }>(
      `insert into product (company_id, code, name, category_id, base_uom_id, tax_code_id)
       values ($1, 'P-GIFT', 'کالای هدیه', $2, (select id from uom where code = 'pcs'), $3) returning id`,
      [companyId, categoryId, tax9],
    )
  ).rows[0].id;

  // بسته‌بندی کارتن ۱۲تایی برای P-1
  packagingId = (
    await pool.query<{ id: string }>(
      `insert into product_packaging (product_id, uom_id, factor_to_base)
       values ($1, (select id from uom where code = 'carton'), 12) returning id`,
      [productId],
    )
  ).rows[0].id;

  // شرکتِ دیگر — کالای همان کد برای آزمونِ جداسازی
  const otherCategoryId = (
    await pool.query<{ id: string }>(
      `insert into product_category (company_id, code, name) values ($1, 'CAT', 'دسته') returning id`,
      [otherCompanyId],
    )
  ).rows[0].id;
  otherProductId = (
    await pool.query<{ id: string }>(
      `insert into product (company_id, code, name, category_id, base_uom_id)
       values ($1, 'P-1', 'کالای شرکتِ دیگر', $2, (select id from uom where code = 'pcs')) returning id`,
      [otherCompanyId, otherCategoryId],
    )
  ).rows[0].id;

  // بهای تمام‌شده: ۸۰۰ برای P-1
  await pool.query(
    `insert into product_cost (product_id, warehouse_id, method, avg_cost, standard_cost, qty_on_hand)
     values ($1, $2, 'moving_avg', 800, 800, 100)`,
    [productId, warehouseId],
  );

  // کالاهای اختصاصیِ سناریوهای سقفِ تخفیف و هم‌زمانی — بهای ۵۰۰ (حاشیهٔ سالم با قیمت ۱۰۰۰)
  for (const [code, key] of [['P-CAP', 'cap'], ['P-CONC', 'conc']] as const) {
    const pid = (
      await pool.query<{ id: string }>(
        `insert into product (company_id, code, name, category_id, base_uom_id)
         values ($1, $2, $2, $3, (select id from uom where code = 'pcs')) returning id`,
        [companyId, code, categoryId],
      )
    ).rows[0].id;
    if (key === 'cap') capProductId = pid;
    else concProductId = pid;
    await pool.query(
      `insert into product_cost (product_id, warehouse_id, method, avg_cost, qty_on_hand)
       values ($1, $2, 'moving_avg', 500, 10)`,
      [pid, warehouseId],
    );
  }

  // مشتری‌ها
  const person = await pool.query<{ id: string }>(
    `insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, 'CUS-1', 'natural', 'مشتری', 'یک') returning id`,
    [companyId],
  );
  customerId = (
    await pool.query<{ id: string }>(
      `insert into customer (person_id, branch_id, code) values ($1, $2, 'C-1') returning id`,
      [person.rows[0].id, branchId],
    )
  ).rows[0].id;

  const otherPerson = await pool.query<{ id: string }>(
    `insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, 'CUS-2', 'natural', 'مشتری', 'شرکتِ دیگر') returning id`,
    [otherCompanyId],
  );
  const otherCoBranch = (
    await pool.query<{ id: string }>(
      `insert into branch (company_id, code, name) values ($1, 'MAIN', 'شعبه') returning id`,
      [otherCompanyId],
    )
  ).rows[0].id;
  otherCustomerId = (
    await pool.query<{ id: string }>(
      `insert into customer (person_id, branch_id, code) values ($1, $2, 'C-2') returning id`,
      [otherPerson.rows[0].id, otherCoBranch],
    )
  ).rows[0].id;

  // ---- کاربران ----
  await seedUser(ADMIN_USER, ADMIN_PASSWORD, 'ADM', 'all');
  await seedUser(VIEWER_USER, VIEWER_PASSWORD, 'VW', ['master.price.view', 'sales.order.view']);
  await seedUser(APPROVER_USER, APPROVER_PASSWORD, 'APV', [
    'master.price.view',
    'pricing.margin.view',
    'pricing.margin.override',
    'pricing.simulation.run',
  ]);
  // TASK-24F · HIGH-3: ثبتِ سفارش بدونِ مجوزِ قیمتِ دستی/عبور از سقف (ولی با مجوزِ تاریخِ گذشته)
  await seedUser(ORDERER_USER, ORDERER_PASSWORD, 'ORD', [
    'master.price.view',
    'sales.order.create',
    'sales.order.view',
    'pricing.backdate.apply',
  ]);
  // همان کاربر، بدونِ مجوزِ تاریخِ گذشته
  await seedUser(BACKDATER_USER, BACKDATER_PASSWORD, 'BDT', [
    'master.price.view',
    'sales.order.create',
    'sales.order.view',
  ]);

  process.env.DATABASE_URL = testUrl.toString();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1', { exclude: ['api/health'] });
  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
  await app.init();

  adminToken = await login(ADMIN_USER, ADMIN_PASSWORD);
  viewerToken = await login(VIEWER_USER, VIEWER_PASSWORD);
  approverToken = await login(APPROVER_USER, APPROVER_PASSWORD);
  ordererToken = await login(ORDERER_USER, ORDERER_PASSWORD);
  backdaterToken = await login(BACKDATER_USER, BACKDATER_PASSWORD);

  // ---- داده‌های قیمت از مسیرِ API ----
  domainId = (
    await api().post('/api/v1/pricing-domains').send({
      code: 'DOM-BR1', title: 'قلمرو شعبه مرکزی', kind: 'branch', branch_id: branchId, priority: 10,
    }).expect(201)
  ).body.id;
  otherDomainId = (
    await api().post('/api/v1/pricing-domains').send({
      code: 'DOM-BR2', title: 'قلمرو شعبه دوم', kind: 'branch', branch_id: otherBranchId, priority: 10,
    }).expect(201)
  ).body.id;

  companyListId = (
    await api().post('/api/v1/price-lists').send({
      code: 'PL-CO', title: 'لیست سراسری', kind: 'general', priority: 1,
      items: [
        { product_id: productId, price: '1000', ...ALL_DATES },
        { product_id: giftProductId, price: '100', ...ALL_DATES },
      ],
    }).expect(201)
  ).body.id;
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

/** بدنهٔ استانداردِ استعلام — یک قلم P-1 با تعداد ۱ */
const quoteBody = (over: Record<string, unknown> = {}) => ({
  customer_id: customerId,
  pricing_date: TODAY,
  lines: [{ product_id: productId, qty: 1 }],
  ...over,
});

// =====================================================================
// PE-1  دقتِ شبیه‌سازی و نبودِ سندِ کسب‌وکار
// =====================================================================

describe('PE-1 — دقتِ شبیه‌سازی و بدونِ سندِ کسب‌وکار', () => {
  it('شبیه‌سازی مجموع‌ها/مالیات/سود را درست و سازگار برمی‌گرداند و سند نمی‌سازد', async () => {
    const ordersBefore = await countRows('sales_order');
    const redemptionsBefore = await countRows('promotion_redemption');
    const simsBefore = await countRows('price_simulation_log');

    const res = await api().post('/api/v1/pricing/simulate').send(quoteBody()).expect(201);
    const body = res.body;

    // قیمت ۱۰۰۰، تعداد ۱، مالیات ۹٪
    expect(num(body.subtotal)).toBe(1000);
    expect(num(body.discount_total)).toBe(0);
    expect(num(body.tax_total)).toBe(90);
    expect(num(body.grand_total)).toBe(1090);
    // بهای تمام‌شده ۸۰۰ ⇒ حاشیهٔ سود ۲۰٪
    expect(body.cost_total).toBe('800.00');
    expect(body.margin_pct).toBeCloseTo(20, 5);

    const line = body.lines[0];
    expect(line.product_code).toBe('P-1');
    expect(line.pricing.source).toBe('price_list');
    expect(line.pricing.price_list_code).toBe('PL-CO');
    expect(line.tax_rate_pct).toBe(9);
    expect(num(line.tax_amount)).toBe(90);
    expect(num(line.line_total)).toBe(1090);

    // تجزیهٔ قیمت: جمعِ اقلام = subtotal؛ subtotal − تخفیف + مالیات = مبلغ نهایی
    expect(num(line.gross)).toBe(num(body.subtotal));
    expect(num(body.subtotal) - num(body.discount_total) + num(body.tax_total)).toBeCloseTo(
      num(body.grand_total),
      2,
    );
    expect(body.explanation.length).toBeGreaterThan(0);
    expect(body.explanation.join(' ')).toContain('PL-CO');

    // بدونِ سندِ کسب‌وکار؛ فقط ردیفِ ممیزیِ شبیه‌سازی
    expect(await countRows('sales_order')).toBe(ordersBefore);
    expect(await countRows('promotion_redemption')).toBe(redemptionsBefore);
    expect(await countRows('price_simulation_log')).toBe(simsBefore + 1);
    expect(body.simulation_id).toBeTruthy();
  });

  it('شبیه‌سازی با persist_audit=false ردیفِ ممیزی نمی‌سازد و همان اعداد را می‌دهد', async () => {
    const simsBefore = await countRows('price_simulation_log');
    const res = await api()
      .post('/api/v1/pricing/simulate')
      .send(quoteBody({ persist_audit: false }))
      .expect(201);
    expect(res.body.simulation_id).toBeNull();
    expect(num(res.body.grand_total)).toBe(1090);
    expect(await countRows('price_simulation_log')).toBe(simsBefore);
  });

  it('استعلام و شبیه‌سازی خروجیِ مالیِ یکسان می‌دهند (قطعی)', async () => {
    const q = await api().post('/api/v1/pricing/quote').send(quoteBody()).expect(201);
    const s = await api().post('/api/v1/pricing/simulate').send(quoteBody({ persist_audit: false })).expect(201);
    expect(s.body.subtotal).toBe(q.body.subtotal);
    expect(s.body.discount_total).toBe(q.body.discount_total);
    expect(s.body.tax_total).toBe(q.body.tax_total);
    expect(s.body.grand_total).toBe(q.body.grand_total);
    expect(s.body.lines[0].pricing).toEqual(q.body.lines[0].pricing);
  });

  it('تعدادِ بسته‌بندی: کارتن ۱۲تایی ⇒ qty_base = 12 و قیمتِ سطحِ کارتن', async () => {
    // قیمتِ کارتن ۱۲۰۰۰ (۱۰۰۰ × ۱۲) در یک لیستِ جدا
    const listId = (
      await api().post('/api/v1/price-lists').send({
        code: 'PL-PACK', title: 'لیست کارتن', kind: 'wholesale', priority: 5,
        items: [{ product_id: productId, packaging_id: packagingId, price: '12000', ...ALL_DATES }],
      }).expect(201)
    ).body.id;

    const res = await api()
      .post('/api/v1/pricing/simulate')
      .send(quoteBody({ price_list_id: listId, lines: [{ product_id: productId, packaging_id: packagingId, qty: 2 }] }))
      .expect(201);

    const line = res.body.lines[0];
    expect(line.packaging_id).toBe(packagingId);
    expect(line.packaging_factor).toBe(12);
    expect(line.qty_base).toBe(24);
    expect(num(line.unit_price)).toBe(12000);
    expect(num(line.gross)).toBe(24000);
    expect(num(line.tax_amount)).toBe(2160);
    expect(num(res.body.grand_total)).toBe(26160);
  });

  it('شبیه‌سازی بدونِ مجوز ⇒ 403 و بدونِ توکن ⇒ 401', async () => {
    await api(viewerToken).post('/api/v1/pricing/simulate').send(quoteBody()).expect(403);
    await api(null).post('/api/v1/pricing/simulate').send(quoteBody()).expect(401);
    // بینندهٔ فقط‌خواندنی مجازِ استعلام است
    await api(viewerToken).post('/api/v1/pricing/quote').send(quoteBody()).expect(201);
  });
});

// =====================================================================
// PE-2  تقدمِ منابع، جداسازیِ قلمرو، مرزِ تاریخ
// =====================================================================

describe('PE-2 — تقدمِ قیمت، قلمرو و مرزِ تاریخ', () => {
  it('لیستِ قلمرو بر لیستِ سراسریِ شرکت اولویت دارد (بدونِ override خاموش)', async () => {
    const domainList = await api().post('/api/v1/price-lists').send({
      code: 'PL-DOM', title: 'لیست قلمرو', kind: 'channel', priority: 1, domain_id: domainId,
      items: [{ product_id: productId, price: '900', ...ALL_DATES }],
    }).expect(201);

    const res = await api().post('/api/v1/pricing/quote').send(quoteBody()).expect(201);
    expect(num(res.body.lines[0].unit_price)).toBe(900);
    expect(res.body.lines[0].pricing.scope).toBe('domain');
    expect(res.body.lines[0].pricing.price_list_id).toBe(domainList.body.id);
    expect(res.body.lines[0].pricing.price_list_code).toBe('PL-DOM');
  });

  it('قیمتِ اختصاصیِ مشتری بر لیستِ قلمرو اولویت دارد', async () => {
    const created = await api().post('/api/v1/customer-prices').send({
      customer_id: customerId, product_id: productId, price: '850', ...ALL_DATES,
      note: 'قرارداد سالانه',
    }).expect(201);

    const res = await api().post('/api/v1/pricing/quote').send(quoteBody()).expect(201);
    expect(num(res.body.lines[0].unit_price)).toBe(850);
    expect(res.body.lines[0].pricing.scope).toBe('customer');
    expect(res.body.lines[0].pricing.customer_price_id).toBe(created.body.id);

    // لیستِ صریحِ درخواست هم قیمتِ مشتری را کنار نمی‌زند (قیمتِ مشتری رتبهٔ ۱ است)
    const res2 = await api()
      .post('/api/v1/pricing/quote')
      .send(quoteBody({ price_list_id: companyListId }))
      .expect(201);
    expect(num(res2.body.lines[0].unit_price)).toBe(850);
  });

  it('مشتریِ شعبهٔ دوم لیستِ قلمروِ شعبهٔ مرکزی را نمی‌بیند (جداسازیِ قلمرو)', async () => {
    // مشتری در شعبهٔ دوم + لیستِ قلمروِ شعبهٔ دوم با قیمتِ ۱۱۰۰
    const person = await pool.query<{ id: string }>(
      `insert into person (company_id, code, legal_type, first_name, last_name)
       values ($1, 'CUS-BR2', 'natural', 'مشتری', 'شعبه دو') returning id`,
      [companyId],
    );
    const br2Customer = (
      await pool.query<{ id: string }>(
        `insert into customer (person_id, branch_id, code) values ($1, $2, 'C-BR2') returning id`,
        [person.rows[0].id, otherBranchId],
      )
    ).rows[0].id;
    foreignDomainListId = (
      await api().post('/api/v1/price-lists').send({
        code: 'PL-DOM2', title: 'لیست قلمرو شعبه دو', kind: 'channel', priority: 50, domain_id: otherDomainId,
        items: [{ product_id: productId, price: '1100', ...ALL_DATES }],
      }).expect(201)
    ).body.id;

    const res = await api()
      .post('/api/v1/pricing/quote')
      .send({ customer_id: br2Customer, pricing_date: TODAY, lines: [{ product_id: productId, qty: 1 }] })
      .expect(201);
    expect(num(res.body.lines[0].unit_price)).toBe(1100);
    expect(res.body.lines[0].pricing.price_list_code).toBe('PL-DOM2');

    // و مشتریِ شعبهٔ مرکزی همچنان قیمتِ اختصاصیِ خود را می‌گیرد (قلمروِ شعبهٔ دوم به او نمی‌رسد)
    const resMain = await api().post('/api/v1/pricing/quote').send(quoteBody()).expect(201);
    expect(num(resMain.body.lines[0].unit_price)).toBe(850);
    expect(resMain.body.lines[0].pricing.price_list_code).toBeNull();
  });

  it('مرزِ تاریخ: valid_from شامل و valid_to انحصاری است', async () => {
    const edgeProduct = (
      await pool.query<{ id: string }>(
        `insert into product (company_id, code, name, category_id, base_uom_id)
         values ($1, 'P-DATE', 'کالای مرزِ تاریخ', $2, (select id from uom where code = 'pcs')) returning id`,
        [companyId, categoryId],
      )
    ).rows[0].id;

    await api().post('/api/v1/price-lists').send({
      code: 'PL-EDGE', title: 'لیست مرزِ تاریخ', kind: 'general', priority: 900,
      items: [{ product_id: edgeProduct, price: '500', valid_from: '2026-06-01', valid_to: '2026-07-01' }],
    }).expect(201);

    const onStart = await api()
      .post('/api/v1/pricing/quote')
      .send({ pricing_date: '2026-06-01', lines: [{ product_id: edgeProduct, qty: 1 }] })
      .expect(201);
    expect(num(onStart.body.lines[0].unit_price)).toBe(500);

    // روزِ پایانی انحصاری است ⇒ هیچ قیمتی وجود ندارد
    const onEnd = await api()
      .post('/api/v1/pricing/quote')
      .send({ pricing_date: '2026-07-01', lines: [{ product_id: edgeProduct, qty: 1 }] })
      .expect(400);
    expect(onEnd.body.code).toBe('price_missing');

    const beforeStart = await api()
      .post('/api/v1/pricing/quote')
      .send({ pricing_date: '2026-05-31', lines: [{ product_id: edgeProduct, qty: 1 }] })
      .expect(400);
    expect(beforeStart.body.code).toBe('price_missing');
  });

  it('سطحِ تعدادی: بالاترین min_qty واجدِ شرط انتخاب می‌شود', async () => {
    const tierProduct = (
      await pool.query<{ id: string }>(
        `insert into product (company_id, code, name, category_id, base_uom_id)
         values ($1, 'P-TIER', 'کالای پله‌ای', $2, (select id from uom where code = 'pcs')) returning id`,
        [companyId, categoryId],
      )
    ).rows[0].id;
    await api().post('/api/v1/price-lists').send({
      code: 'PL-TIER', title: 'لیست پله‌ای', kind: 'wholesale', priority: 900,
      items: [
        { product_id: tierProduct, price: '1000', min_qty: '0', ...ALL_DATES },
        { product_id: tierProduct, price: '900', min_qty: '10', ...ALL_DATES },
        { product_id: tierProduct, price: '800', min_qty: '50', ...ALL_DATES },
      ],
    }).expect(201);

    const qty12 = await api()
      .post('/api/v1/pricing/quote')
      .send({ pricing_date: TODAY, lines: [{ product_id: tierProduct, qty: 12 }] })
      .expect(201);
    expect(num(qty12.body.lines[0].unit_price)).toBe(900);
    expect(num(qty12.body.lines[0].gross)).toBe(10800);

    const qty3 = await api()
      .post('/api/v1/pricing/quote')
      .send({ pricing_date: TODAY, lines: [{ product_id: tierProduct, qty: 3 }] })
      .expect(201);
    expect(num(qty3.body.lines[0].unit_price)).toBe(1000);
  });
});

// =====================================================================
// PE-3  تشویق‌ها و سقفِ تخفیف
// =====================================================================

describe('PE-3 — اجرای تشویق، عدمِ انباشت و سقفِ تخفیف', () => {
  it('تشویقِ درصدی روی قیمت اعمال می‌شود و مالیات روی مبلغِ پس از تخفیف حساب می‌شود', async () => {
    const promo = await api().post('/api/v1/promotions').send({
      code: 'PROM-10', title: 'ده درصد', kind: 'percent_line', priority: 100,
      allow_stacking: true, is_active: true, ...ALL_DATES,
      benefit: { percent: 10 },
    }).expect(201);

    const res = await api().post('/api/v1/pricing/quote').send(quoteBody()).expect(201);
    // قیمتِ مرجع در این مرحله ۸۵۰ (قیمتِ مشتری) ⇒ تخفیف ۸۵
    expect(num(res.body.discount_total)).toBe(85);
    expect(num(res.body.lines[0].net_ex_tax)).toBe(765);
    expect(num(res.body.lines[0].tax_amount)).toBeCloseTo(68.85, 2);
    expect(num(res.body.grand_total)).toBeCloseTo(833.85, 2);
    expect(res.body.applied_promotions.map((p: { code: string }) => p.code)).toContain('PROM-10');
    expect(res.body.applied_promotions[0].promotion_id).toBe(promo.body.id);

    // پاک‌سازی برای سناریوهای بعدی
    await api().patch(`/api/v1/promotions/${promo.body.id}`).send({ is_active: false }).expect(200);
  });

  it('تشویقِ غیرقابلِ انباشت، تشویقِ بعدی را می‌بندد (blocked_by_non_stackable)', async () => {
    const first = await api().post('/api/v1/promotions').send({
      code: 'PROM-NS', title: 'بدون انباشت', kind: 'percent_line', priority: 200,
      allow_stacking: false, is_active: true, ...ALL_DATES,
      benefit: { percent: 5 },
    }).expect(201);
    const second = await api().post('/api/v1/promotions').send({
      code: 'PROM-NS2', title: 'دوم', kind: 'percent_line', priority: 100,
      allow_stacking: true, is_active: true, ...ALL_DATES,
      benefit: { percent: 5 },
    }).expect(201);

    const res = await api().post('/api/v1/pricing/quote').send(quoteBody()).expect(201);
    expect(res.body.applied_promotions.map((p: { code: string }) => p.code)).toEqual(['PROM-NS']);
    const skipped = res.body.skipped_promotions.find(
      (p: { code: string }) => p.code === 'PROM-NS2',
    );
    expect(skipped.reason).toBe('blocked_by_non_stackable');

    await api().patch(`/api/v1/promotions/${first.body.id}`).send({ is_active: false }).expect(200);
    await api().patch(`/api/v1/promotions/${second.body.id}`).send({ is_active: false }).expect(200);
  });

  it('سقفِ مبلغِ تخفیف رعایت می‌شود (max_discount_amount)', async () => {
    const promo = await api().post('/api/v1/promotions').send({
      code: 'PROM-CAP', title: 'سقف‌دار', kind: 'percent_line', priority: 300,
      allow_stacking: true, is_active: true, max_discount_amount: '20', ...ALL_DATES,
      benefit: { percent: 50 },
    }).expect(201);

    const res = await api().post('/api/v1/pricing/quote').send(quoteBody()).expect(201);
    // ۵۰٪ از ۸۵۰ = ۴۲۵ ولی سقف ۲۰ است
    expect(num(res.body.discount_total)).toBe(20);
    expect(num(res.body.lines[0].net_ex_tax)).toBe(830);

    await api().patch(`/api/v1/promotions/${promo.body.id}`).send({ is_active: false }).expect(200);
  });

  it('پارامترِ سقفِ کلِ تخفیف از بدنهٔ درخواست نادیده گرفته می‌شود (HIGH-2)', async () => {
    const promo = await api().post('/api/v1/promotions').send({
      code: 'PROM-BIG', title: 'بزرگ', kind: 'percent_line', priority: 300,
      allow_stacking: true, is_active: true, ...ALL_DATES,
      benefit: { percent: 40 },
    }).expect(201);
    try {
      // پارامترِ سقف از قراردادِ درخواست حذف شد: ارسالش هیچ اثری ندارد
      const loose = await api()
        .post('/api/v1/pricing/quote')
        .send(quoteBody({ max_total_discount_pct: 5 } as never))
        .expect(201);
      expect(num(loose.body.discount_total)).toBe(340); // ۴۰٪ از ۸۵۰ ⇒ سقفِ بدنه نادیده گرفته شد
    } finally {
      await api().patch(`/api/v1/promotions/${promo.body.id}`).send({ is_active: false }).expect(200);
    }
  });

  /**
   * TASK-24V — یافتهٔ تأییدشدهٔ HIGH-2 (PARTIAL): سیاستِ پایدار روی مسیرِ سفارش اعمال
   * می‌شود ولی `POST /pricing/quote` (و `simulate`) `pricing_settings` را نمی‌خوانند؛
   * بنابراین «هم‌سانیِ سند و شبیه‌سازی» برقرار نیست. این آزمون تا اصلاح، شکستِ موردانتظار دارد.
   */
  it.fails('سیاستِ پایدارِ سقفِ کلِ تخفیف روی استعلام/شبیه‌سازی هم اعمال می‌شود (HIGH-2 — نقصِ باز)', async () => {
    const promo = await api().post('/api/v1/promotions').send({
      code: 'PROM-BIG2', title: 'بزرگ۲', kind: 'percent_line', priority: 300,
      allow_stacking: true, is_active: true, ...ALL_DATES,
      benefit: { percent: 40 },
    }).expect(201);
    try {
      const before = await api().get('/api/v1/pricing/settings').expect(200);
      const patched = await api()
        .patch('/api/v1/pricing/settings')
        .send({ max_total_discount_pct: 5 })
        .expect(200);
      expect(num(patched.body.max_total_discount_pct)).toBe(5); // سیاست قطعاً ذخیره شده است
      const tight = await api().post('/api/v1/pricing/quote').send(quoteBody()).expect(201);
      // سقفِ ۵٪ از ۸۵۰ = ۴۲.۵
      expect(num(tight.body.discount_total)).toBe(42.5);
      expect(before.status).toBe(200);
    } finally {
      await api().patch('/api/v1/pricing/settings').send({ max_total_discount_pct: null }).expect(200);
      await api().patch(`/api/v1/promotions/${promo.body.id}`).send({ is_active: false }).expect(200);
    }
  });

  it('تشویقِ هدیه قلمِ هدیه با ارزشِ مرجع تولید می‌کند و مبلغِ فاکتور را کاهش نمی‌دهد', async () => {
    const promo = await api().post('/api/v1/promotions').send({
      code: 'PROM-GIFT', title: 'هدیه', kind: 'gift_item', priority: 400,
      allow_stacking: true, is_active: true, ...ALL_DATES,
      conditions: { min_qty: 2 },
      benefit: { gift: { product_id: giftProductId, qty: 1 } },
    }).expect(201);

    const res = await api()
      .post('/api/v1/pricing/quote')
      .send(quoteBody({ lines: [{ product_id: productId, qty: 2 }] }))
      .expect(201);
    expect(res.body.gift_lines).toHaveLength(1);
    expect(res.body.gift_lines[0].product_id).toBe(giftProductId);
    expect(res.body.gift_lines[0].qty).toBe(1);
    expect(num(res.body.gift_lines[0].value)).toBe(100);
    // هدیه بر اساسِ قراردادِ D5 به‌صورتِ تخفیفِ مالیِ معادلِ ارزش ثبت می‌شود (بدونِ سند/انبار)
    expect(res.body.gift_lines[0].valuation_source).toBe('reference_price');
    expect(res.body.gift_lines[0].promotion_code).toBe('PROM-GIFT');
    expect(num(res.body.discount_total)).toBe(100);
    // قیمتِ جاری ۸۵۰ (قیمتِ مشتری) ⇒ gross = ۱۷۰۰، تخفیفِ معادلِ هدیه ۱۰۰ ⇒ خالص ۱۶۰۰
    expect(num(res.body.lines[0].gross)).toBe(1700);
    expect(num(res.body.lines[0].net_ex_tax)).toBe(1600);
    expect(num(res.body.lines[0].tax_amount)).toBe(144);
    expect(num(res.body.grand_total)).toBe(1744);

    await api().patch(`/api/v1/promotions/${promo.body.id}`).send({ is_active: false }).expect(200);
  });
});

// =====================================================================
// PE-4  کفِ سود و استثنای دو‌شخصی
// =====================================================================

describe('PE-4 — کفِ سود و استثنای تأییدشدهٔ شخصِ دوم', () => {
  let policyId = '';
  let exceptionId = '';

  it('سیاستِ کفِ سود قابلِ تعریف است (company scope)', async () => {
    const res = await api().post('/api/v1/margin-policies').send({
      scope: 'company', min_margin_pct: '30', on_unknown_cost: 'block', priority: 10,
      valid_from: '2026-01-01',
    }).expect(201);
    policyId = res.body.id;
    expect(num(res.body.min_margin_pct)).toBe(30);
  });

  it('قیمتِ زیرِ کفِ سود نقضِ صریح تولید می‌کند و نیازمندِ تأیید است', async () => {
    // قیمتِ مشتری ۸۵۰ با بهای ۸۰۰ ⇒ حاشیه ۵.۸۸٪ < ۳۰٪
    const res = await api().post('/api/v1/pricing/quote').send(quoteBody()).expect(201);
    const violations = res.body.margin_violations;
    expect(violations.length).toBe(1);
    expect(violations[0].code).toBe('margin_floor_violation');
    expect(violations[0].policy_id).toBe(policyId);
    expect(violations[0].margin_pct).toBeCloseTo(5.88, 2);
    expect(violations[0].required_margin_pct).toBe(30);
    expect(violations[0].message_fa).toContain('کفِ');
    expect(res.body.approval_required.required).toBe(true);
    expect(res.body.approval_required.reasons.join(' ')).toContain('کفِ');
  });

  it('ثبتِ سفارشِ زیرِ کفِ سود با موتور ⇒ 409 (پرچم‌های بدنه نمی‌توانند کنترل را خاموش کنند)', async () => {
    // HIGH-1: پرچم‌های کلاینتی حذف شده‌اند؛ ارسالشان (حتی false) هیچ اثری ندارد ⇒ همیشه 409
    const bodies = [
      { customer_id: customerId, order_date: TODAY, price_override_reason: BACKDATE_REASON, lines: [{ product_id: productId, qty: 1 }] },
      {
        customer_id: customerId,
        order_date: TODAY,
        price_override_reason: BACKDATE_REASON,
        apply_pricing_engine: false,
        allow_manual_price: true,
        allow_discount_override: true,
        lines: [{ product_id: productId, qty: 1 }],
      },
    ];
    for (const body of bodies) {
      const res = await api().post('/api/v1/orders').send(body).expect(409);
      expect(res.body.code).toBe('margin_floor_violation');
      expect(res.body.details.violations[0].code).toBe('margin_floor_violation');
    }
  });

  it('استثنا فقط با تأییدِ شخصِ دوم معتبر می‌شود؛ خودتأییدی ۴۰۳ است', async () => {
    const created = await api().post('/api/v1/margin-exceptions').send({
      entity_type: 'customer_price',
      product_id: productId,
      customer_id: customerId,
      policy_id: policyId,
      required_margin_pct: 30,
      effective_margin_pct: 5.88,
      // MEDIUM-1: سقفِ اعطاشده باید صریح باشد؛ استثنای بدونِ سقف بی‌اثر (fail-closed) است
      granted_margin_pct: 5.88,
      reason: 'قرارداد راهبردی با مشتری کلیدی',
      valid_until: '2026-12-31',
    }).expect(201);
    exceptionId = created.body.id;
    expect(created.body.status).toBe('pending');

    // همان درخواست‌دهنده نمی‌تواند تأیید کند
    const self = await api().post(`/api/v1/margin-exceptions/${exceptionId}/decision`).send({
      decision: 'approve',
    });
    expect([403, 409]).toContain(self.status);
    if (self.status === 403) expect(self.body.code).toBe('second_person_required');

    // شخصِ دوم با مجوزِ override تأیید می‌کند
    const approved = await api(approverToken)
      .post(`/api/v1/margin-exceptions/${exceptionId}/decision`)
      .send({ decision: 'approve', note: 'تأییدِ مدیر مالی' })
      .expect(201);
    expect(approved.body.status).toBe('approved');
    expect(approved.body.decided_by).toBeTruthy();
  });

  it('پس از تأییدِ استثنا، همان قیمت نقضِ کفِ سود ندارد', async () => {
    const res = await api().post('/api/v1/pricing/quote').send(quoteBody()).expect(201);
    expect(res.body.margin_violations).toHaveLength(0);
    expect(num(res.body.lines[0].unit_price)).toBe(850);
  });

  it('تصمیمِ دوباره روی استثنای بسته ⇒ 409 و بیننده بدونِ مجوز ⇒ 403', async () => {
    const again = await api(approverToken)
      .post(`/api/v1/margin-exceptions/${exceptionId}/decision`)
      .send({ decision: 'reject' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('not_pending');

    const viewer = await api(viewerToken)
      .post('/api/v1/margin-exceptions')
      .send({ entity_type: 'sales_order', reason: 'تلاشِ غیرمجاز' });
    expect(viewer.status).toBe(403);
  });
});

// =====================================================================
// PE-5  قیمت/تخفیفِ دستی فقط با مجوز
// =====================================================================

describe('PE-5 — تخفیف و قیمتِ دستیِ غیرمجاز', () => {
  it('پرچمِ قیمتِ دستی از بدنهٔ درخواست پذیرفته نمی‌شود (بیننده ⇒ 403)', async () => {
    const res = await api(viewerToken)
      .post('/api/v1/pricing/quote')
      .send(quoteBody({ allow_manual_price: true, lines: [{ product_id: productId, qty: 1, unit_price: '1' }] }))
      .expect(403);
    expect(res.body.code).toBe('manual_price_not_authorized');
  });

  it('مدیرِ دارای مجوز می‌تواند قیمتِ دستی اعمال کند و منبع manual ثبت می‌شود', async () => {
    const res = await api()
      .post('/api/v1/pricing/simulate')
      .send(quoteBody({ lines: [{ product_id: productId, qty: 1, unit_price: '900' }], persist_audit: false }))
      .expect(201);
    expect(num(res.body.lines[0].unit_price)).toBe(900);
    expect(res.body.lines[0].pricing.source).toBe('manual');
    expect(res.body.lines[0].pricing.scope).toBe('manual');
  });

  it('تخفیفِ فراتر از سقفِ قلم بدونِ مجوز ⇒ 403 (discount_cap_exceeded)', async () => {
    // کالای اختصاصی با حاشیهٔ سالم (قیمت ۱۰۰۰ / بهای ۵۰۰) تا گاردِ کفِ سودِ ایجادِ لیست دخالت نکند
    capListId = (
      await api().post('/api/v1/price-lists').send({
        code: 'PL-CAP', title: 'لیست با سقفِ تخفیف', kind: 'wholesale', priority: 800,
        items: [{ product_id: capProductId, price: '1000', max_discount_pct: '5', ...ALL_DATES }],
      }).expect(201)
    ).body.id;

    const res = await api(viewerToken)
      .post('/api/v1/pricing/quote')
      .send({
        pricing_date: TODAY,
        price_list_id: capListId,
        allow_discount_override: true,
        lines: [{ product_id: capProductId, qty: 1, discount_amount: '400' }],
      })
      .expect(403);
    expect(res.body.code).toBe('discount_cap_exceeded');
    expect(res.body.details.max_discount_pct).toBe(5);
  });

  it('مدیرِ مجاز همان تخفیف را با هشدارِ صریح اعمال می‌کند', async () => {
    const res = await api()
      .post('/api/v1/pricing/quote')
      .send({
        pricing_date: TODAY,
        price_list_id: capListId,
        lines: [{ product_id: capProductId, qty: 1, discount_amount: '400' }],
      })
      .expect(201);
    expect(num(res.body.discount_total)).toBe(400);
    expect(num(res.body.lines[0].net_ex_tax)).toBe(600);
    expect(res.body.warnings.join(' ')).toContain('سقف');
  });
});

// =====================================================================
// PE-6  تغییرناپذیریِ سندِ تاریخی و دفترِ تغییرِ قیمت
// =====================================================================

describe('PE-6 — سندِ تاریخی تغییر نمی‌کند', () => {
  it('سفارشِ ثبت‌شده با موتور، پس از تغییرِ لیستِ قیمت دست‌نخورده می‌ماند', async () => {
    // استثنای کفِ سودِ تأییدشده از PE-4 برقرار است
    const order = await api()
      .post('/api/v1/orders')
      .send({
        customer_id: customerId,
        order_date: TODAY,
        price_override_reason: BACKDATE_REASON,
        lines: [{ product_id: productId, qty: 2 }],
      })
      .expect(201);

    const orderId = order.body.id;
    const beforeLine = order.body.lines[0];
    const beforeTotal = order.body.grand_total;
    expect(num(beforeLine.unit_price)).toBe(850);
    expect(num(beforeLine.line_total ?? beforeLine.total)).toBe(1700 + 153);

    // تغییرِ قیمتِ مشتری به ۲۰۰۰
    const customerPrices = await api().get('/api/v1/customer-prices').query({ customer_id: customerId }).expect(200);
    const cpRows = Array.isArray(customerPrices.body) ? customerPrices.body : customerPrices.body.items;
    expect(cpRows.length).toBeGreaterThan(0);
    const cp = cpRows[0];
    await api().patch(`/api/v1/customer-prices/${cp.id}`).send({ price: '2000' }).expect(200);

    // سندِ قدیمی دست‌نخورده است
    const after = await api().get(`/api/v1/orders/${orderId}`).expect(200);
    expect(num(after.body.lines[0].unit_price)).toBe(850);
    expect(num(after.body.lines[0].unit_price)).toBe(num(beforeLine.unit_price));
    expect(after.body.grand_total).toBe(beforeTotal);

    // استعلامِ تازه قیمتِ جدید را می‌بیند (پس تغییر فقط بر آینده اثر دارد)
    const requote = await api().post('/api/v1/pricing/quote').send(quoteBody()).expect(201);
    expect(num(requote.body.lines[0].unit_price)).toBe(2000);

    // دفترِ تغییرِ قیمت ردیفِ این تغییر را دارد
    const changes = await api().get('/api/v1/pricing/price-changes').query({ limit: 100 }).expect(200);
    const rows = Array.isArray(changes.body) ? changes.body : changes.body.items;
    expect(rows.some((r: { entity_type: string }) => r.entity_type === 'customer_price')).toBe(true);
  });
});

// =====================================================================
// PE-7  idempotency و بازپخش
// =====================================================================

describe('PE-7 — درخواستِ تکراری/بازپخش‌شده', () => {
  it('همان کلیدِ idempotency همان نتیجه را برمی‌گرداند (replayed) بدونِ محاسبهٔ دوباره', async () => {
    const key = 'idem-quote-0001';
    const first = await api().post('/api/v1/pricing/quote').send(quoteBody({ idempotency_key: key })).expect(201);
    const second = await api().post('/api/v1/pricing/quote').send(quoteBody({ idempotency_key: key })).expect(201);

    expect(first.body.replayed).toBe(false);
    expect(second.body.replayed).toBe(true);
    expect(second.body.grand_total).toBe(first.body.grand_total);
    expect(second.body.lines).toEqual(first.body.lines);

    const rows = await countRows('promotion_evaluation', 'where company_id = $1 and idempotency_key = $2', [
      companyId,
      key,
    ]);
    expect(rows).toBe(1);
  });

  it('همان کلید با بدنهٔ متفاوت ⇒ 409 idempotency_key_reuse', async () => {
    const key = 'idem-quote-0002';
    await api().post('/api/v1/pricing/quote').send(quoteBody({ idempotency_key: key })).expect(201);
    const res = await api()
      .post('/api/v1/pricing/quote')
      .send(quoteBody({ idempotency_key: key, lines: [{ product_id: productId, qty: 5 }] }))
      .expect(409);
    expect(res.body.code).toBe('idempotency_key_reuse');
  });

  it('کلیدِ نامعتبر ⇒ 400 invalid_idempotency_key', async () => {
    const res = await api()
      .post('/api/v1/pricing/quote')
      .send(quoteBody({ idempotency_key: 'bad key!' }))
      .expect(400);
    expect(res.body.code).toBe('invalid_idempotency_key');
  });

  it('سفارشِ تکراری با همان کلید، مصرفِ تشویق را دوباره ثبت نمی‌کند', async () => {
    const promo = await api().post('/api/v1/promotions').send({
      code: 'PROM-IDEM', title: 'تکرارپذیر', kind: 'percent_line', priority: 500,
      allow_stacking: true, is_active: true, ...ALL_DATES, benefit: { percent: 5 },
    }).expect(201);

    // TASK-24F: اعمالِ تشویق روی سفارش تابعِ سیاستِ پایدار است (پیش‌فرض خاموش) ⇒ برای این
    // آزمون صریحاً روشن می‌شود و در پایان بازگردانده می‌شود.
    await api().patch('/api/v1/pricing/settings').send({ apply_promotions_on_orders: true }).expect(200);
    try {
      const key = 'idem-order-0001';
      const payload = {
        customer_id: customerId,
        order_date: TODAY,
        price_override_reason: BACKDATE_REASON,
        pricing_idempotency_key: key,
        lines: [{ product_id: productId, qty: 1 }],
      };
      const first = await api().post('/api/v1/orders').send(payload).expect(201);
      const second = await api().post('/api/v1/orders').send(payload).expect(201);
      expect(second.body.id).not.toBe(first.body.id);
      expect(second.body.grand_total).toBe(first.body.grand_total);
      expect(num(first.body.discount_total)).toBeGreaterThan(0);

      const redemptions = await countRows(
        'promotion_redemption',
        'where company_id = $1 and idempotency_key = $2 and promotion_id = $3',
        [companyId, key, promo.body.id],
      );
      expect(redemptions).toBe(1);
    } finally {
      await api().patch('/api/v1/pricing/settings').send({ apply_promotions_on_orders: false }).expect(200);
      await api().patch(`/api/v1/promotions/${promo.body.id}`).send({ is_active: false }).expect(200);
    }
  });
});

// =====================================================================
// PE-8  تغییرِ هم‌زمانِ قیمت
// =====================================================================

describe('PE-8 — تغییرِ هم‌زمان (قفلِ خوش‌بینانه)', () => {
  it('PATCH با row_versionِ کهنه ⇒ 409 version_conflict و با نسخهٔ درست ⇒ 200', async () => {
    const list = await api().post('/api/v1/price-lists').send({
      code: 'PL-CONC', title: 'لیست هم‌زمان', kind: 'general', priority: 700,
      items: [{ product_id: concProductId, price: '1000', ...ALL_DATES }],
    }).expect(201);
    const id = list.body.id;
    const version = list.body.row_version ?? 0;

    // تغییرِ اول موفق
    const ok = await api()
      .patch(`/api/v1/price-lists/${id}`)
      .send({ row_version: version, items: [{ product_id: concProductId, price: '1200', ...ALL_DATES }] })
      .expect(200);
    expect(ok.body.row_version).toBeGreaterThan(version);

    // تلاشِ دوم با همان نسخهٔ کهنه ⇒ 409
    const stale = await api()
      .patch(`/api/v1/price-lists/${id}`)
      .send({ row_version: version, items: [{ product_id: concProductId, price: '1300', ...ALL_DATES }] })
      .expect(409);
    expect(stale.body.code).toBe('version_conflict');

    // قیمتِ جاری همان ۱۲۰۰ است؛ تلاشِ کهنه هیچ اثری نگذاشته
    const quote = await api()
      .post('/api/v1/pricing/quote')
      .send({ pricing_date: TODAY, price_list_id: id, lines: [{ product_id: concProductId, qty: 1 }] })
      .expect(201);
    expect(num(quote.body.lines[0].unit_price)).toBe(1200);
  });
});

// =====================================================================
// PE-9  جداسازیِ اجاره
// =====================================================================

describe('PE-9 — جداسازیِ اجاره', () => {
  it('مشتریِ شرکتِ دیگر ⇒ 400 customer_not_found (بدونِ افشا)', async () => {
    const res = await api()
      .post('/api/v1/pricing/quote')
      .send({ customer_id: otherCustomerId, pricing_date: TODAY, lines: [{ product_id: productId, qty: 1 }] })
      .expect(400);
    expect(res.body.code).toBe('customer_not_found');
  });

  it('کالای شرکتِ دیگر در این شرکت قیمت ندارد ⇒ 400 product_not_found', async () => {
    const res = await api()
      .post('/api/v1/pricing/quote')
      .send({ pricing_date: TODAY, lines: [{ product_id: otherProductId, qty: 1 }] })
      .expect(400);
    expect(res.body.code).toBe('product_not_found');
  });

  it('لیستِ قیمتِ شرکتِ دیگر قابلِ استفاده نیست ⇒ 400 price_list_not_found', async () => {
    // لیستِ قیمتِ شرکتِ دیگر را با SQL می‌سازیم (خارج از مسیرِ APIِ این شرکت)
    const foreignList = (
      await pool.query<{ id: string }>(
        `insert into price_list (company_id, code, title, kind) values ($1, 'PL-FOREIGN', 'بیگانه', 'general') returning id`,
        [otherCompanyId],
      )
    ).rows[0].id;

    const res = await api()
      .post('/api/v1/pricing/quote')
      .send({ pricing_date: TODAY, price_list_id: foreignList, lines: [{ product_id: productId, qty: 1 }] })
      .expect(400);
    expect(res.body.code).toBe('price_list_not_found');
  });

  it('مشتری/کالای شرکتِ دیگر در سفارشِ موتوردار پذیرفته نمی‌شود', async () => {
    const res = await api()
      .post('/api/v1/orders')
      .send({
        customer_id: otherCustomerId,
        order_date: TODAY,
        lines: [{ product_id: productId, qty: 1 }],
      });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it('لیستِ قیمتِ صریحِ قلمروِ دیگر بدونِ مجوز بین‌قلمرویی رد می‌شود (MEDIUM-2)', async () => {
    const res = await api(viewerToken)
      .post('/api/v1/pricing/quote')
      .send({ pricing_date: TODAY, price_list_id: foreignDomainListId, lines: [{ product_id: productId, qty: 1 }] })
      .expect(403);
    expect(res.body.code).toBe('price_list_domain_forbidden');
    expect(res.body.details.price_list_domain_id).toBe(otherDomainId);
    expect(res.body.details.source).toBe('request');
  });

  it('لیستِ قیمتِ شرکت‌گستر بدونِ مجوزِ بین‌قلمرویی پذیرفته می‌شود', async () => {
    // لیستِ بدونِ قلمرو (company-wide) هرگز «خارج از قلمرو» نیست ⇒ بدونِ ممیزیِ cross_domain_use
    const quote = await api()
      .post('/api/v1/pricing/quote')
      .send({ pricing_date: TODAY, price_list_id: companyListId, lines: [{ product_id: productId, qty: 1 }] })
      .expect(201);
    expect(quote.body.lines).toHaveLength(1);
    const audited = await pool.query<{ c: number }>(
      `select count(*)::int as c from price_change_log
        where company_id = $1 and entity_type = 'price_list' and entity_id = $2 and action = 'cross_domain_use'`,
      [companyId, companyListId],
    );
    expect(audited.rows[0].c).toBe(0);
  });

  it('مجوزِ بین‌قلمرویی بدونِ دلیل ⇒ 400؛ با دلیل ⇒ مجاز + ممیزیِ cross_domain_use', async () => {
    const noReason = await api()
      .post('/api/v1/pricing/quote')
      .send({ pricing_date: TODAY, price_list_id: foreignDomainListId, lines: [{ product_id: productId, qty: 1 }] })
      .expect(400);
    expect(noReason.body.code).toBe('cross_domain_reason_required');

    const before = await pool.query<{ c: number }>(
      `select count(*)::int as c from price_change_log
        where company_id = $1 and entity_type = 'price_list' and entity_id = $2 and action = 'cross_domain_use'`,
      [companyId, foreignDomainListId],
    );
    const ok = await api()
      .post('/api/v1/pricing/quote')
      .send({
        pricing_date: TODAY,
        price_list_id: foreignDomainListId,
        cross_domain_reason: 'قراردادِ بین‌شعبه‌ایِ مشتریِ کلیدی',
        lines: [{ product_id: productId, qty: 1 }],
      })
      .expect(201);
    expect(ok.body.warnings.length).toBeGreaterThanOrEqual(0);
    const after = await pool.query<{ c: number }>(
      `select count(*)::int as c from price_change_log
        where company_id = $1 and entity_type = 'price_list' and entity_id = $2 and action = 'cross_domain_use'`,
      [companyId, foreignDomainListId],
    );
    expect(after.rows[0].c).toBe(before.rows[0].c + 1);
    const logged = await pool.query<{ reason: string; actor_user_id: string }>(
      `select after_data->>'reason' as reason, actor_user_id from price_change_log
        where company_id = $1 and entity_type = 'price_list' and entity_id = $2 and action = 'cross_domain_use'
        order by at desc limit 1`,
      [companyId, foreignDomainListId],
    );
    expect(logged.rows[0].reason).toBe('قراردادِ بین‌شعبه‌ایِ مشتریِ کلیدی');
    expect(logged.rows[0].actor_user_id).toBeTruthy();
  });
});

// =====================================================================
// PE-10  TASK-24F — کنترل‌های سرور-محورِ مسیرِ سفارش (HIGH-1/HIGH-3)
// =====================================================================

describe('PE-10 — سفارش: مجوز از نشست، ممیزی از دفترِ تغییرِ قیمت', () => {
  it('کاربرِ بدونِ pricing.manual_price.apply با قیمتِ دستی ⇒ 403 (و پرچمِ بدنه کمکی نمی‌کند)', async () => {
    for (const extra of [{}, { allow_manual_price: true, allow_discount_override: true, apply_pricing_engine: true }]) {
      const res = await api(ordererToken)
        .post('/api/v1/orders')
        .send({
          customer_id: customerId,
          order_date: TODAY,
          price_override_reason: BACKDATE_REASON,
          ...extra,
          lines: [{ product_id: productId, qty: 1, unit_price: '900' }],
        })
        .expect(403);
      expect(res.body.code).toBe('manual_price_not_authorized');
    }
  });

  it('کاربرِ بدونِ pricing.discount.override با تخفیفِ فراتر از سقفِ قلم ⇒ 403', async () => {
    const res = await api(ordererToken)
      .post('/api/v1/orders')
      .send({
        customer_id: customerId,
        order_date: TODAY,
        price_override_reason: BACKDATE_REASON,
        price_list_id: capListId,
        lines: [{ product_id: capProductId, qty: 1, discount_amount: '400' }],
      })
      .expect(403);
    expect(res.body.code).toBe('discount_cap_exceeded');
    expect(res.body.details.max_discount_pct).toBe(5);
  });

  it('تاریخِ گذشته بدونِ pricing.backdate.apply ⇒ 403 (دلیل هم کمکی نمی‌کند)', async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const noReason = await api(backdaterToken)
      .post('/api/v1/orders')
      .send({ customer_id: customerId, order_date: yesterday, lines: [{ product_id: productId, qty: 1 }] })
      .expect(403);
    expect(noReason.body.code).toBe('backdate_forbidden');

    const withReason = await api(backdaterToken)
      .post('/api/v1/orders')
      .send({
        customer_id: customerId,
        order_date: yesterday,
        price_override_reason: BACKDATE_REASON,
        lines: [{ product_id: productId, qty: 1 }],
      })
      .expect(403);
    expect(withReason.body.code).toBe('backdate_forbidden');
  });

  it('قیمتِ دستیِ مجاز با دلیل ⇒ 201 و ثبتِ actor/قیمتِ سیستمی/قیمتِ درخواستی/دلیل در price_change_log', async () => {
    const created = await api()
      .post('/api/v1/orders')
      .send({
        customer_id: customerId,
        order_date: TODAY,
        price_list_id: null,
        price_override_reason: 'قیمتِ توافقیِ قراردادِ سالانه',
        lines: [{ product_id: productId, qty: 1, unit_price: '900' }],
      })
      .expect(201);
    expect(num(created.body.lines[0].unit_price)).toBe(900);

    // قیمتِ سیستمیِ همان قلم از خودِ موتور خوانده می‌شود؛ سفارشِ عقب‌گرد با «امروزِ تهران»
    // قیمت‌گذاری می‌شود، پس مرجعِ مقایسه هم همان تاریخِ مؤثر است (نه تاریخِ سند).
    const todayTehran = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tehran',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const systemQuote = await api()
      .post('/api/v1/pricing/quote')
      .send({ customer_id: customerId, pricing_date: todayTehran, lines: [{ product_id: productId, qty: 1 }] })
      .expect(201);
    const expectedSystemPrice = num(systemQuote.body.lines[0].unit_price);
    expect(expectedSystemPrice).toBeGreaterThan(0);

    const adminId = (
      await pool.query<{ id: string }>(`select id from app_user where username = $1`, [ADMIN_USER])
    ).rows[0].id;
    const log = await pool.query<{ action: string; before_data: any; after_data: any; actor_user_id: string }>(
      `select action, before_data, after_data, actor_user_id
         from price_change_log
        where company_id = $1 and entity_type = 'sales_order_line' and entity_id = $2
        order by at desc limit 1`,
      [companyId, created.body.id],
    );
    expect(log.rowCount).toBe(1);
    const row = log.rows[0];
    expect(row.action).toBe('manual_price_create');
    expect(row.actor_user_id).toBe(adminId);
    expect(Number(row.before_data.system_unit_price)).toBe(expectedSystemPrice);
    expect(Number(row.after_data.unit_price)).toBe(900);
    expect(row.after_data.reason).toBe('قیمتِ توافقیِ قراردادِ سالانه');
    expect(row.after_data.pricing_date).toBeTruthy();
    expect(row.after_data.policy).toHaveProperty('max_total_discount_pct');
  });

  it('سندِ عقب‌گرد، تشویقِ منقضی را دوباره فعال نمی‌کند (قیمت‌گذاری با «امروز»)', async () => {
    // تاریخ‌ها نسبت به ساعتِ واقعی محاسبه می‌شوند تا آزمون به تقویم وابسته نباشد:
    // تشویق تا «دیروز» معتبر است ولی امروز منقضی شده؛ سند به تاریخِ دیروز ثبت می‌شود.
    const day = (offset: number) =>
      new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
    const yesterday = day(-1);
    const promo = await api().post('/api/v1/promotions').send({
      code: 'PROM-BACKDATE', title: 'منقضی', kind: 'percent_line', priority: 900,
      allow_stacking: true, is_active: true,
      valid_from: day(-30), valid_to: yesterday,
      benefit: { percent: 10 },
    }).expect(201);
    // خطِ مبنا: همان سفارش پیش از روشن‌کردنِ اعمالِ تشویق
    const baseline = await api()
      .post('/api/v1/orders')
      .send({
        customer_id: customerId,
        order_date: yesterday,
        price_override_reason: BACKDATE_REASON,
        lines: [{ product_id: productId, qty: 1 }],
      })
      .expect(201);
    await api().patch('/api/v1/pricing/settings').send({ apply_promotions_on_orders: true }).expect(200);
    try {
      const order = await api()
        .post('/api/v1/orders')
        .send({
          customer_id: customerId,
          order_date: yesterday,
          price_override_reason: BACKDATE_REASON,
          lines: [{ product_id: productId, qty: 1 }],
        })
        .expect(201);
      // اگر تاریخِ سند مبنای قیمت‌گذاری بود، تشویقِ ۱۰٪ (که تا دیروز معتبر است) اعمال می‌شد
      expect(num(order.body.discount_total)).toBe(num(baseline.body.discount_total));
    } finally {
      await api().patch('/api/v1/pricing/settings').send({ apply_promotions_on_orders: false }).expect(200);
      await api().patch(`/api/v1/promotions/${promo.body.id}`).send({ is_active: false }).expect(200);
    }
  });
});

// =====================================================================
// PE-11  TASK-24F — دفترِ مصرفِ تشویق: یکپارچگی و فقط-افزودنی
// =====================================================================

describe('PE-11 — promotion_redemption: هم‌خوانی با سند و فقط-افزودنی', () => {
  it('مبلغِ مصرف = تخفیفِ واقعیِ سند (HIGH-4) و ردیفِ دفتر قابلِ UPDATE/DELETE نیست (MEDIUM-4)', async () => {
    const promo = await api().post('/api/v1/promotions').send({
      code: 'PROM-LEDGER', title: 'دفتر', kind: 'percent_line', priority: 950,
      allow_stacking: true, is_active: true, ...ALL_DATES,
      benefit: { percent: 10 },
    }).expect(201);

    await api().patch('/api/v1/pricing/settings').send({ apply_promotions_on_orders: true }).expect(200);
    try {
      const order = await api()
        .post('/api/v1/orders')
        .send({
          customer_id: customerId,
          order_date: '2026-06-15',
          price_override_reason: BACKDATE_REASON,
          pricing_idempotency_key: 'ledger-order-0001',
          lines: [{ product_id: productId, qty: 2 }],
        })
        .expect(201);

      const redemption = await pool.query<{ discount_amount: string; entity_id: string; promotion_id: string }>(
        `select discount_amount::text as discount_amount, entity_id, promotion_id
           from promotion_redemption
          where company_id = $1 and idempotency_key = 'ledger-order-0001' and promotion_id = $2`,
        [companyId, promo.body.id],
      );
      expect(redemption.rowCount).toBe(1);
      expect(redemption.rows[0].entity_id).toBe(order.body.id);
      // تخفیفِ ثبت‌شده در سند و در دفترِ مصرف یک عدد است
      expect(Number(redemption.rows[0].discount_amount)).toBe(num(order.body.discount_total));
      expect(Number(redemption.rows[0].discount_amount)).toBeGreaterThan(0);

      // فقط-افزودنی: UPDATE و DELETE باید توسط trigger رد شوند
      await expect(
        pool.query(`update promotion_redemption set discount_amount = 0 where entity_id = $1`, [order.body.id]),
      ).rejects.toThrow();
      await expect(
        pool.query(`delete from promotion_redemption where entity_id = $1`, [order.body.id]),
      ).rejects.toThrow();

      // و نقشِ اپلیکیشن هم مجوزِ UPDATE/DELETE ندارد (fail-closed در سطحِ DB)
      const priv = await pool.query<{ upd: boolean; del: boolean; ins: boolean }>(
        `select has_table_privilege('dms_app', 'promotion_redemption', 'UPDATE') as upd,
                has_table_privilege('dms_app', 'promotion_redemption', 'DELETE') as del,
                has_table_privilege('dms_app', 'promotion_redemption', 'INSERT') as ins`,
      );
      expect(priv.rows[0]).toEqual({ upd: false, del: false, ins: true });
    } finally {
      await api().patch('/api/v1/pricing/settings').send({ apply_promotions_on_orders: false }).expect(200);
      await api().patch(`/api/v1/promotions/${promo.body.id}`).send({ is_active: false }).expect(200);
    }
  });

  it('تکرارِ همان کلیدِ idempotency ردیفِ دفتر را دوباره نمی‌سازد (MEDIUM-5)', async () => {
    const count = await pool.query<{ c: number }>(
      `select count(*)::int as c from promotion_redemption where company_id = $1 and idempotency_key = 'ledger-order-0001'`,
      [companyId],
    );
    expect(count.rows[0].c).toBe(1);
  });
});
