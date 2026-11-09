import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
  resolveApprovalPolicy,
  policyMatches,
  policyStrictness,
  validatePolicyInput,
  type ApprovalPolicyRow,
} from '../src/modules/rules-engine/approval-policy';

/**
 * TASK-24Y — آزمونِ معماریِ تأییدِ سازمانی.
 *
 * هدفِ این فایل اثباتِ **رفتار** است، نه وجودِ ستون. هر ادعا از مسیرِ HTTP یا از
 * مسیرِ توابعِ موتور روی PostgreSQLِ یک‌بارمصرف اجرا می‌شود. هیچ ادعایی با
 * `select count(*) from information_schema` اثبات نمی‌شود.
 *
 * پوشش:
 *   1) حل‌کنندهٔ سیاست (خالص، بدون DB) — مرکزی بر قلمرو مقدم، fail-closed
 *   2) جداسازیِ شرکت (cross-company isolation)
 *   3) محدودیتِ خودتأییدی روی POST /orders/:id/approve
 *   4) تفکیل: دامنه، انقضا، عدمِ واگذاریِ به خود
 *   5) انقضا/ارتقا
 *   6) تغییرناپذیریِ تصمیم
 *   7) مصرفِ اتمیکِ تأیید (یک تأیید = یک عملیات)
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_task24y_approval_test';
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

const ADMIN_USER = 'y_admin';
const ADMIN_PASSWORD = 'S3cret!pass';
/** سازندهٔ سفارش — بدونِ مجوزِ تأیید */
const MAKER_USER = 'y_maker';
const MAKER_PASSWORD = 'Maker!pass1';
/** تأییدکننده — شخصِ دوم */
const CHECKER_USER = 'y_checker';
const CHECKER_PASSWORD = 'Check!pass1';

let adminToken = '';
let otherToken = '';
let makerToken = '';
let checkerToken = '';
let companyId = '';
let company2Id = '';
let branchId = '';
let customerId = '';
let productId = '';

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

/** ساختِ زنجیرهٔ تأیید با مراحلِ معین. */
const createChain = async (
  company: string,
  entity: string,
  steps: number[] = [1],
  approverRoleId?: string | null,
): Promise<string> => {
  const chain = (
    await pool.query<{ id: string }>(
      `insert into approval_chain (company_id, code, entity)
       values ($1, $2, $3) returning id`,
      [company, `CH-${Math.random().toString(36).slice(2, 10)}`, entity],
    )
  ).rows[0].id;
  for (const stepNo of steps) {
    await pool.query(
      `insert into approval_step_def (approval_chain_id, step_no, approver_role_id, min_amount)
       values ($1, $2, $3, null)`,
      [chain, stepNo, approverRoleId ?? null],
    );
  }
  return chain;
};

/** پاک‌سازیِ کاملِ سیاست/گردش‌ها بین آزمون‌ها. */
const resetApprovalData = async (): Promise<void> => {
  const c = companyId;
  // پاک‌سازیِ داده‌های آزمون از راهِ خروجِ صریحِ نگهداشت (نه با تضعیفِ تریگر):
  // تریگر همچنان اعمال می‌شود و I-1 مصونیت را روی مسیرِ عادی اثبات می‌کند.
  await pool.query(`set app.approval_history_maintenance = 'on'`);
  await pool.query(`delete from approval_notification where company_id = $1`, [c]);
  await pool.query(`delete from approval_binding where company_id = $1`, [c]);
  await pool.query(
    `delete from approval_decision where approval_request_id in
       (select id from approval_request where approval_chain_id in
          (select id from approval_chain where company_id = $1))`,
    [c],
  );
  await pool.query(
    `delete from approval_request where approval_chain_id in
       (select id from approval_chain where company_id = $1)`,
    [c],
  );
  await pool.query(`delete from approval_policy where company_id = $1`, [c]);
  await pool.query(`delete from approval_delegation where company_id = $1`, [c]);
  await pool.query(
    `delete from approval_step_def where approval_chain_id in
       (select id from approval_chain where company_id = $1)`,
    [c],
  );
  await pool.query(`delete from approval_chain where company_id = $1`, [c]);
  await pool.query(`reset app.approval_history_maintenance`);
};

const createOrder = async (token: string): Promise<string> => {
  const res = await api(token)
    .post('/api/v1/orders')
    .send({
      customer_id: customerId,
      order_date: new Date().toISOString().slice(0, 10),
      lines: [{ product_id: productId, qty: 1 }],
    });
  expect(res.status).toBe(201);
  return res.body.id as string;
};

beforeAll(async () => {
  adminPool = new pg.Pool({ connectionString: adminUrl.toString() });

  await adminPool.query(`drop database if exists ${TEST_DB}`);
  await adminPool.query(`create database ${TEST_DB}`);

  const migDir = path.join(ROOT, 'migrations');
  const ups = readdirSync(migDir).filter((f) => f.endsWith('.up.sql')).sort();
  for (const f of ups) {
    execFileSync(PSQL, [...psqlBase, '-d', TEST_DB, '-1', '-q', '-f', path.join(migDir, f)], {
      env: psqlEnv,
      stdio: 'pipe',
    });
  }

  pool = new pg.Pool({ connectionString: testUrl.toString() });

  const company = await pool.query<{ id: string }>(
    `insert into company (code, legal_name) values ('YCO', 'شرکت آزمون') returning id`,
  );
  companyId = company.rows[0].id;
  const company2 = await pool.query<{ id: string }>(
    `insert into company (code, legal_name) values ('YCO2', 'شرکت دوم') returning id`,
  );
  company2Id = company2.rows[0].id;

  branchId = (
    await pool.query<{ id: string }>(
      `insert into branch (company_id, code, name) values ($1, 'YB', 'شعبه') returning id`,
      [companyId],
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
      `insert into product_category (company_id, code, name) values ($1, 'YCAT', 'دسته') returning id`,
      [companyId],
    )
  ).rows[0].id;

  productId = (
    await pool.query<{ id: string }>(
      `insert into product (company_id, code, name, category_id, base_uom_id, tax_code_id)
       values ($1, 'Y-P1', 'کالای آزمون', $2, (select id from uom where code = 'pcs'), $3) returning id`,
      [companyId, categoryId, tax9],
    )
  ).rows[0].id;

  const personId = (
    await pool.query<{ id: string }>(
      `insert into person (company_id, code, legal_type, first_name, last_name)
       values ($1, 'Y-C1', 'natural', 'مشتری', 'آزمون') returning id`,
      [companyId],
    )
  ).rows[0].id;
  customerId = (
    await pool.query<{ id: string }>(
      `insert into customer (person_id, branch_id, code) values ($1, $2, 'Y-C1') returning id`,
      [personId, branchId],
    )
  ).rows[0].id;

  await seedUser(companyId, ADMIN_USER, ADMIN_PASSWORD, 'Y-ADM', 'all');
  // کاربرِ شرکتِ دوم — برای اثباتِ جداسازیِ واقعی (نه فقط نبودِ داده)
  await seedUser(company2Id, 'y_other', 'Other!pass1', 'Y-OTH', 'all');
  await seedUser(companyId, MAKER_USER, MAKER_PASSWORD, 'Y-MKR', [
    'sales.order.create',
    'sales.order.view',
    'sales.order.approve',
    // TASK-24Y: مرجوعی و خرید هم از همان دروازه استفاده می‌کنند
    'sales.return.request',
    'sales.return.view',
    'ap.purchase.request',
    'ap.purchase.view',
    // عمداً مجوزِ تأییدِ مرجوعی هم داده می‌شود تا ۴۰۳ حتماً از نگهبانِ
    // خودتأییدی بیاید، نه از گاردِ مجوز. وگرنه آزمون به دلیلِ اشتباه سبز می‌شود.
    'sales.return.approve',
  ]);
  await seedUser(companyId, CHECKER_USER, CHECKER_PASSWORD, 'Y-CHK', [
    'sales.order.view',
    'sales.order.approve',
    'rules.view',
    'rules.manage',
    'rules.approval.decide',
    'ap.purchase.approve',
    'ap.purchase.view',
    'sales.return.view',
    'sales.return.approve',
  ]);

  process.env.DATABASE_URL = testUrl.toString();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1', { exclude: ['api/health'] });
  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
  await app.init();

  adminToken = await login(ADMIN_USER, ADMIN_PASSWORD);
  makerToken = await login(MAKER_USER, MAKER_PASSWORD);
  checkerToken = await login(CHECKER_USER, CHECKER_PASSWORD);
  otherToken = await login('y_other', 'Other!pass1');

  // موتورِ قیمت اجازهٔ سفارشِ بی‌قیمت نمی‌دهد (کنترلِ واقعی) ⇒ لیستِ قیمت لازم است
  await api(adminToken)
    .post('/api/v1/price-lists')
    .send({
      code: 'YL-1',
      title: 'لیستِ آزمون',
      kind: 'general',
      priority: 1,
      items: [{ product_id: productId, price: '1000', valid_from: '2020-01-01', valid_to: '2099-12-31' }],
    })
    .expect(201);

  // ---- TASK-24Y: پیش‌نیازهای مرجوعی و خرید (بدونِ آن‌ها آزمونِ دروازه خالی می‌شد)
  const seriesId = (
    await pool.query<{ id: string }>(
      `insert into document_series (branch_id, doc_kind, fiscal_year, prefix)
       values ($1, 'invoice', 1403, 'YINV') returning id`,
      [branchId],
    )
  ).rows[0].id;
  await pool.query(
    `insert into invoice (branch_id, doc_number, fiscal_year, series_id, customer_id,
                          subtotal, discount_total, tax_total, grand_total, status)
     values ($1, 'Y-1000', 1403, $2, $3, '1000', '0', '0', '1000', 'posted')`,
    [branchId, seriesId, customerId],
  );

  // سفارشِ خرید پیش‌نویس با سازندهٔ MAKER — برای آزمونِ دروازهٔ خرید
  const makerUserId = (
    await pool.query<{ id: string }>(`select id from app_user where username = $1`, [MAKER_USER])
  ).rows[0].id;
  const supplierPerson = await pool.query<{ id: string }>(
    `insert into person (company_id, code, legal_type, legal_name)
     values ($1, 'Y-SUP-P', 'legal', 'تأمین‌کنندهٔ آزمون') returning id`,
    [companyId],
  );
  const supplier = await pool.query<{ id: string }>(
    `insert into supplier (company_id, person_id, code) values ($1, $2, 'Y-SUP') returning id`,
    [companyId, supplierPerson.rows[0].id],
  ).catch(() => ({ rows: [] as { id: string }[] }));
  if (supplier.rows.length > 0) {
    const warehouse = await pool.query<{ id: string }>(
      `insert into warehouse (branch_id, code, name, kind)
       values ($1, 'Y-WH', 'انبار آزمون', 'main') returning id`,
      [branchId],
    ).catch(() => ({ rows: [] as { id: string }[] }));
    if (warehouse.rows.length > 0) {
      await pool.query(
        `insert into purchase_order (branch_id, doc_number, fiscal_year, supplier_id, warehouse_id,
                                     currency, subtotal, discount_total, tax_total, grand_total,
                                     status, created_by)
         values ($1, 'YPO-1', 1403, $2, $3, 'IRR', '1000', '0', '0', '1000', 'draft', $4)`,
        [branchId, supplier.rows[0].id, warehouse.rows[0].id, makerUserId],
      );
    }
  }
}, 240_000);

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

beforeEach(async () => {
  await resetApprovalData();
});

// =====================================================================
// 1 — حل‌کنندهٔ سیاست (خالص)
// =====================================================================
describe('1 — حل‌کنندهٔ سیاست', () => {
  const mk = (over: Partial<ApprovalPolicyRow>): ApprovalPolicyRow => ({
    id: 'p1',
    company_id: 'c1',
    operation: 'sales.order.approve',
    scope: 'operation',
    domain_id: null,
    min_amount: null,
    max_amount: null,
    min_risk_score: null,
    approval_chain_id: 'chain-a',
    expires_in_hours: null,
    on_expiry: 'escalate',
    is_active: true,
    priority: 100,
    ...over,
  });
  const ctx = { operation: 'sales.order.approve', amount: 100, riskScore: 10, domainId: null };

  it('P-1 · هیچ سیاستی ⇒ null (فراخوان باید fail-closed کند)', () => {
    expect(resolveApprovalPolicy([], ctx)).toBeNull();
    expect(resolveApprovalPolicy([mk({ is_active: false })], ctx)).toBeNull();
    expect(resolveApprovalPolicy([mk({ operation: 'other.op' })], ctx)).toBeNull();
  });

  it('P-2 · آستانهٔ مبلغ رعایت می‌شود (زیرِ آستانه منطبق نیست)', () => {
    const p = mk({ min_amount: '500' });
    expect(policyMatches(p, { ...ctx, amount: 499 })).toBe(false);
    expect(policyMatches(p, { ...ctx, amount: 500 })).toBe(true);
    // عملیاتِ بی‌مبلغ نمی‌تواند سیاستِ مبلغ‌دار را برانگیزد
    expect(policyMatches(p, { ...ctx, amount: null })).toBe(false);
  });

  it('P-3 · سیاستِ مرکزی بر قلمرو مقدم است', () => {
    const central = mk({ id: 'cen', scope: 'central', approval_chain_id: 'chain-central', min_amount: '0' });
    const domain = mk({ id: 'dom', scope: 'domain', domain_id: 'd1', approval_chain_id: 'chain-domain', min_amount: '10000' });
    // هر دو سیاست باید واقعاً منطبق باشند، وگرنه مقایسهٔ تقدم هرگز اجرا نمی‌شود.
    const highCtx = { ...ctx, amount: 50_000, domainId: 'd1' };
    expect(policyMatches(central, highCtx)).toBe(true);
    expect(policyMatches(domain, highCtx)).toBe(true);
    const resolved = resolveApprovalPolicy([central, domain], highCtx);
    expect(resolved?.chainId).toBe('chain-central');
    expect(resolved?.centralApplied).toBe(true);
    // حتی وقتی سیاستِ قلمرو آستانهٔ مبلغِ بزرگ‌تر دارد، مرکزی برنده است:
    // تقدم ساختاری است، نه نتیجهٔ یک مقایسهٔ عددی.
    expect(policyStrictness(domain)).toBeGreaterThan(policyStrictness(central));
    expect(resolved?.chainId).toBe('chain-central');
  });

  it('P-4 · سیاستِ قلمرو فقط روی همان قلمرو اثر دارد', () => {
    const domain = mk({ scope: 'domain', domain_id: 'd1' });
    expect(policyMatches(domain, { ...ctx, domainId: 'd1' })).toBe(true);
    expect(policyMatches(domain, { ...ctx, domainId: 'd2' })).toBe(false);
    expect(policyMatches(domain, { ...ctx, domainId: null })).toBe(false);
  });

  it('P-5 · سیاستِ قلمرو سخت‌گیرانه‌تر بر سیاستِ مرکزیِ سست مقدم است (وقتی مرکزی وجود ندارد)', () => {
    const loose = mk({ id: 'loose', approval_chain_id: 'chain-loose', expires_in_hours: 720 });
    const strict = mk({ id: 'strict', approval_chain_id: 'chain-strict', expires_in_hours: 2 });
    expect(resolveApprovalPolicy([loose, strict], ctx)?.chainId).toBe('chain-strict');
  });

  it('P-6 · اعتبارسنجیِ پیکربندی، پیکربندیِ ناقص را رد می‌کند', () => {
    expect(validatePolicyInput({ operation: '', scope: 'central' })).toBe('operation_required');
    expect(validatePolicyInput({ operation: 'x', scope: 'domain' })).toBe('domain_required_for_domain_scope');
    expect(validatePolicyInput({ operation: 'x', scope: 'central', domainId: 'd1' })).toBe('domain_only_for_domain_scope');
    expect(
      validatePolicyInput({ operation: 'x', scope: 'central', minAmount: 100, maxAmount: 50 }),
    ).toBe('amount_range_inverted');
    expect(validatePolicyInput({ operation: 'x', scope: 'central', minRiskScore: 101 })).toBe('risk_score_out_of_range');
    expect(validatePolicyInput({ operation: 'x', scope: 'central', expiresInHours: 0 })).toBe('expires_in_hours_must_be_positive');
    expect(validatePolicyInput({ operation: 'x', scope: 'central' })).toBeNull();
  });
});

// =====================================================================
// 2 — API سیاست: اعتبارسنجی و جداسازی
// =====================================================================
describe('2 — API سیاستِ تأیید', () => {
  it('S-1 · سیاستِ قلمرو بدونِ domain_id ⇒ 400', async () => {
    const chain = await createChain(companyId, 'sales.order.approve');
    const res = await api(adminToken).post('/api/v1/rules-engine/approval-policies').send({
      operation: 'sales.order.approve',
      scope: 'domain',
      approval_chain_id: chain,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('domain_required_for_domain_scope');
  });

  it('S-2 · سیاستِ معتبر ثبت و خوانده می‌شود', async () => {
    const chain = await createChain(companyId, 'sales.order.approve');
    const created = await api(adminToken).post('/api/v1/rules-engine/approval-policies').send({
      operation: 'sales.order.approve',
      scope: 'central',
      min_amount: 0,
      approval_chain_id: chain,
      expires_in_hours: 48,
      on_expiry: 'escalate',
    });
    expect(created.status).toBe(201);
    const list = await api(adminToken).get('/api/v1/rules-engine/approval-policies?operation=sales.order.approve');
    expect(list.status).toBe(200);
    expect(list.body.length).toBe(1);
    expect(list.body[0].scope).toBe('central');
  });

  it('S-3 · سیاستِ مرکزی قابلِ غیرفعال‌سازی نیست', async () => {
    const chain = await createChain(companyId, 'sales.order.approve');
    const created = await api(adminToken).post('/api/v1/rules-engine/approval-policies').send({
      operation: 'sales.order.approve',
      scope: 'central',
      approval_chain_id: chain,
    });
    const res = await api(adminToken)
      .patch(`/api/v1/rules-engine/approval-policies/${created.body.id}/status`)
      .send({ is_active: false });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('policy_not_deactivatable');
    expect(await countRows(`select count(*)::int as c from approval_policy where is_active`)).toBe(1);
  });

  it('S-4 · سیاستِ شرکتِ دیگر در فهرستِ این شرکت دیده نمی‌شود', async () => {
    const chain2 = await createChain(company2Id, 'sales.order.approve');
    await pool.query(
      `insert into approval_policy (company_id, operation, scope, approval_chain_id)
       values ($1, 'sales.order.approve', 'central', $2)`,
      [company2Id, chain2],
    );
    const list = await api(adminToken).get('/api/v1/rules-engine/approval-policies');
    expect(list.status).toBe(200);
    expect(list.body.length).toBe(0);
  });
});

// =====================================================================
// 3 — خودتأییدی و دروازهٔ عملیات
// =====================================================================
describe('3 — جداسازیِ وظایف روی تأییدِ سفارش', () => {
  it('O-1 · سازنده نمی‌تواند سفارشِ خودش را تأیید کند ⇒ 403', async () => {
    const orderId = await createOrder(makerToken);
    const res = await api(makerToken).post(`/api/v1/orders/${orderId}/approve`).send({});
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('self_approval_forbidden');
    // وضعیت دست‌نخورده
    const { rows } = await pool.query<{ status: string }>(`select status from sales_order where id = $1`, [orderId]);
    expect(rows[0].status).not.toBe('approved');
  });

  it('O-2 · شخصِ دوم با مجوز می‌تواند (نبودِ سیاست ⇒ سازگاریِ عقب‌رو)', async () => {
    const orderId = await createOrder(makerToken);
    const res = await api(checkerToken).post(`/api/v1/orders/${orderId}/approve`).send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');
  });

  it('O-3 · با وجودِ سیاست ولی بدونِ گردشِ تأیید ⇒ 409 approval_required (دروازه بسته)', async () => {
    const chain = await createChain(companyId, 'sales.order.approve');
    await pool.query(
      `insert into approval_policy (company_id, operation, scope, approval_chain_id)
       values ($1, 'sales.order.approve', 'central', $2)`,
      [companyId, chain],
    );
    const orderId = await createOrder(makerToken);
    const res = await api(checkerToken).post(`/api/v1/orders/${orderId}/approve`).send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('approval_required');
    const { rows } = await pool.query<{ status: string }>(`select status from sales_order where id = $1`, [orderId]);
    expect(rows[0].status).not.toBe('approved');
  });

  it('O-4 · پس از تأییدِ واقعیِ گردش، دروازه باز می‌شود و فقط یک بار', async () => {
    const role = (await pool.query<{ id: string }>(`select id from role where company_id = $1 and code = 'role_Y-CHK'`, [companyId])).rows[0].id;
    const chain = await createChain(companyId, 'sales.order.approve', [1], role);
    await pool.query(
      `insert into approval_policy (company_id, operation, scope, approval_chain_id)
       values ($1, 'sales.order.approve', 'central', $2)`,
      [companyId, chain],
    );
    const orderId = await createOrder(makerToken);

    const submitted = await api(makerToken).post(`/api/v1/orders/${orderId}/request-approval`).send({});
    expect(submitted.status).toBe(201);
    const requestId = submitted.body.approval_request_id;
    const decided = await api(checkerToken)
      .post(`/api/v1/rules-engine/approvals/${requestId}/decision`)
      .send({ step_no: 1, decision: 'approved' });
    expect(decided.status).toBe(201);

    const ok = await api(checkerToken).post(`/api/v1/orders/${orderId}/approve`).send({});
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('approved');

    // اتصال مصرف شده و دیگر درخواستِ دوم را باز نمی‌کند
    const consumed = await countRows(
      `select count(*)::int as c from approval_binding where approval_request_id = $1 and consumed_at is not null`,
      [requestId],
    );
    expect(consumed).toBe(1);
  });

  it('O-5 · تأییدِ گردشِ رد‌شده دروازه را باز نمی‌کند', async () => {
    const role = (await pool.query<{ id: string }>(`select id from role where company_id = $1 and code = 'role_Y-CHK'`, [companyId])).rows[0].id;
    const chain = await createChain(companyId, 'sales.order.approve', [1], role);
    // دروازه فقط وقتی فعال است که سیاست وجود داشته باشد (پیوندِ صریحِ سیاست ↔ اجرا)
    await pool.query(
      `insert into approval_policy (company_id, operation, scope, approval_chain_id)
       values ($1, 'sales.order.approve', 'central', $2)`,
      [companyId, chain],
    );
    const orderId = await createOrder(makerToken);
    const submitted = await api(makerToken).post(`/api/v1/orders/${orderId}/request-approval`).send({});
    expect(submitted.status).toBe(201);
    const requestId = submitted.body.approval_request_id;
    const decided = await api(checkerToken)
      .post(`/api/v1/rules-engine/approvals/${requestId}/decision`)
      .send({ step_no: 1, decision: 'rejected' });
    expect(decided.status).toBe(201);

    const res = await api(checkerToken).post(`/api/v1/orders/${orderId}/approve`).send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('approval_required');
  });
});

// =====================================================================
// 4 — تفکیل
// =====================================================================
describe('4 — تفکیلِ تأیید', () => {
  it('D-1 · واگذاری به خود رد می‌شود', async () => {
    const me = (await pool.query<{ id: string }>(`select id from app_user where username = $1`, [CHECKER_USER])).rows[0].id;
    const res = await api(checkerToken).post('/api/v1/rules-engine/approval-delegations').send({
      delegate_id: me,
      valid_to: new Date(Date.now() + 86_400_000).toISOString(),
      reason: 'آزمون',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('delegation_to_self');
  });

  it('D-2 · پایانِ واگذاری در گذشته رد می‌شود', async () => {
    const other = (await pool.query<{ id: string }>(`select id from app_user where username = $1`, [MAKER_USER])).rows[0].id;
    const res = await api(checkerToken).post('/api/v1/rules-engine/approval-delegations').send({
      delegate_id: other,
      valid_to: new Date(Date.now() - 86_400_000).toISOString(),
      reason: 'آزمون',
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('delegation_in_the_past');
  });

  it('D-3 · واگذاریِ معتبر ثبت و لغو می‌شود', async () => {
    const other = (await pool.query<{ id: string }>(`select id from app_user where username = $1`, [MAKER_USER])).rows[0].id;
    const created = await api(checkerToken).post('/api/v1/rules-engine/approval-delegations').send({
      delegate_id: other,
      operation: 'sales.order.approve',
      valid_to: new Date(Date.now() + 86_400_000).toISOString(),
      reason: 'مرخصی',
    });
    expect(created.status).toBe(201);
    const list = await api(checkerToken).get('/api/v1/rules-engine/approval-delegations');
    expect(list.status).toBe(200);
    expect(list.body.length).toBe(1);
    const revoked = await api(checkerToken).delete(`/api/v1/rules-engine/approval-delegations/${created.body.id}`);
    expect(revoked.status).toBe(200);
    expect(revoked.body.is_active).toBe(false);
    expect(await countRows(`select count(*)::int as c from approval_delegation where is_active`)).toBe(0);
  });
});

// =====================================================================
// 5 — انقضا و ارتقا
// =====================================================================
describe('5 — انقضا و ارتقا', () => {
  it('E-1 · درخواستِ گذشته از مهلت با سیاستِ auto_reject منقضی می‌شود', async () => {
    const chain = await createChain(companyId, 'expiry.test');
    const makerId = (await pool.query<{ id: string }>(`select id from app_user where username = $1`, [MAKER_USER])).rows[0].id;
    const policy = await pool.query<{ id: string }>(
      `insert into approval_policy (company_id, operation, scope, approval_chain_id, expires_in_hours, on_expiry)
       values ($1, 'expiry.test', 'central', $2, 1, 'auto_reject') returning id`,
      [companyId, chain],
    );
    const req = await pool.query<{ id: string }>(
      `insert into approval_request
         (approval_chain_id, entity_type, entity_id, requested_by, current_step, status, expires_at, policy_id)
       values ($1, 't', gen_random_uuid(), $2, 1, 'pending', now() - interval '2 hours', $3) returning id`,
      [chain, makerId, policy.rows[0].id],
    );
    const res = await api(adminToken).post('/api/v1/rules-engine/approvals/run-expiry').send({});
    expect(res.status).toBe(200);
    expect(res.body.expired).toBe(1);
    const { rows } = await pool.query<{ status: string; escalated_at: string | null }>(
      `select status, escalated_at from approval_request where id = $1`,
      [req.rows[0].id],
    );
    expect(rows[0].status).toBe('expired');
    expect(rows[0].escalated_at).toBeNull();
    expect(await countRows(`select count(*)::int as c from approval_notification where kind = 'expired'`)).toBe(1);
  });

  it('E-2 · سیاستِ escalate ⇒ escalated_at پر می‌شود', async () => {
    const chain = await createChain(companyId, 'expiry.test');
    const makerId = (await pool.query<{ id: string }>(`select id from app_user where username = $1`, [MAKER_USER])).rows[0].id;
    const policy = await pool.query<{ id: string }>(
      `insert into approval_policy (company_id, operation, scope, approval_chain_id, expires_in_hours, on_expiry)
       values ($1, 'expiry.test', 'central', $2, 1, 'escalate') returning id`,
      [companyId, chain],
    );
    const req = await pool.query<{ id: string }>(
      `insert into approval_request
         (approval_chain_id, entity_type, entity_id, requested_by, current_step, status, expires_at, policy_id)
       values ($1, 't', gen_random_uuid(), $2, 1, 'pending', now() - interval '2 hours', $3) returning id`,
      [chain, makerId, policy.rows[0].id],
    );
    const res = await api(adminToken).post('/api/v1/rules-engine/approvals/run-expiry').send({});
    expect(res.status).toBe(200);
    expect(res.body.escalated).toBe(1);
    const { rows } = await pool.query<{ status: string; escalated_at: string | null }>(
      `select status, escalated_at from approval_request where id = $1`,
      [req.rows[0].id],
    );
    expect(rows[0].status).toBe('expired');
    expect(rows[0].escalated_at).not.toBeNull();
  });

  it('E-3 · درخواستِ بدونِ مهلت هرگز منقضی نمی‌شود', async () => {
    const chain = await createChain(companyId, 'expiry.test');
    const makerId = (await pool.query<{ id: string }>(`select id from app_user where username = $1`, [MAKER_USER])).rows[0].id;
    await pool.query(
      `insert into approval_request (approval_chain_id, entity_type, entity_id, requested_by, current_step, status)
       values ($1, 't', gen_random_uuid(), $2, 1, 'pending')`,
      [chain, makerId],
    );
    const res = await api(adminToken).post('/api/v1/rules-engine/approvals/run-expiry').send({});
    expect(res.status).toBe(200);
    expect(res.body.expired).toBe(0);
    expect(res.body.escalated).toBe(0);
  });
});

// =====================================================================
// 6 — تغییرناپذیری و جداسازی
// =====================================================================
describe('6 — مصونیتِ تاریخچه و جداسازیِ شرکت', () => {
  it('I-1 · UPDATE و DELETE روی approval_decision مسدود است', async () => {
    const chain = await createChain(companyId, 'immut.test');
    const makerId = (await pool.query<{ id: string }>(`select id from app_user where username = $1`, [MAKER_USER])).rows[0].id;
    const req = await pool.query<{ id: string }>(
      `insert into approval_request (approval_chain_id, entity_type, entity_id, requested_by, current_step, status)
       values ($1, 't', gen_random_uuid(), $2, 1, 'pending') returning id`,
      [chain, makerId],
    );
    const dec = await pool.query<{ id: string }>(
      `insert into approval_decision (approval_request_id, step_no, decided_by, decision)
       values ($1, 1, $2, 'approved') returning id`,
      [req.rows[0].id, makerId],
    );
    await expect(
      pool.query(`update approval_decision set decision = 'rejected' where id = $1`, [dec.rows[0].id]),
    ).rejects.toThrow(/تغییرناپذیر/);
    await expect(
      pool.query(`delete from approval_decision where id = $1`, [dec.rows[0].id]),
    ).rejects.toThrow(/تغییرناپذیر/);
    expect(await countRows(`select count(*)::int as c from approval_decision where id = $1`, [dec.rows[0].id])).toBe(1);
  });

  it('I-2 · کارتابلِ شرکتِ دیگر درخواستِ این شرکت را نشان نمی‌دهد', async () => {
    const chain = await createChain(companyId, 'inbox.test');
    const makerId = (await pool.query<{ id: string }>(`select id from app_user where username = $1`, [MAKER_USER])).rows[0].id;
    await pool.query(
      `insert into approval_request (approval_chain_id, entity_type, entity_id, requested_by, current_step, status)
       values ($1, 't', gen_random_uuid(), $2, 1, 'pending')`,
      [chain, makerId],
    );
    // درخواست‌های شرکتِ جاری در کارتابلِ همین شرکت دیده می‌شوند…
    const inbox = await api(checkerToken).get('/api/v1/rules-engine/approvals/inbox');
    expect(inbox.status).toBe(200);
    expect(inbox.body.length).toBe(1);
    // …ولی کاربرِ شرکتِ دوم — با همان مجوزهای کامل — هیچ‌چیز نمی‌بیند.
    const otherInbox = await api(otherToken).get('/api/v1/rules-engine/approvals/inbox');
    expect(otherInbox.status).toBe(200);
    expect(otherInbox.body.length).toBe(0);
    // و فهرستِ ارسالیِ شرکتِ دوم هم خالی است
    const otherSubmitted = await api(otherToken).get('/api/v1/rules-engine/approvals/submitted');
    expect(otherSubmitted.status).toBe(200);
    expect(otherSubmitted.body.length).toBe(0);
  });

  it('I-3 · اعلانِ شرکتِ دیگر در فهرستِ این شرکت دیده نمی‌شود', async () => {
    const otherUser = (await pool.query<{ id: string }>(`select id from app_user where username = 'y_other'`)).rows[0].id;
    await pool.query(
      `insert into approval_notification (company_id, kind, recipient_user_id, payload)
       values ($1, 'assigned', $2, '{}'::jsonb)`,
      [company2Id, otherUser],
    );
    const list = await api(adminToken).get('/api/v1/rules-engine/approval-notifications');
    expect(list.status).toBe(200);
    expect(list.body.length).toBe(0);
    // و کاربرِ شرکتِ دوم همان اعلان را می‌بیند — یعنی فیلتر، شرکت‌محور است نه خالی‌بودنِ جدول
    const otherList = await api(otherToken).get('/api/v1/rules-engine/approval-notifications');
    expect(otherList.status).toBe(200);
    expect(otherList.body.length).toBe(1);
  });
});

// =====================================================================
// 7 — همان دروازه روی مرجوعی و خرید (قابلِ استفادهٔ مجدد، نه تکرارِ منطق)
// =====================================================================
describe('7 — دروازهٔ مشترک روی مرجوعی و سفارشِ خرید', () => {
  it('R-1 · مرجوعی: سازنده نمی‌تواند تأیید کند ⇒ 403', async () => {
    // پیش‌نیاز صریح است: اگر فاکتور ساخته نشود آزمون شکست می‌خورد، نه اینکه
    // بی‌صدا رد شود. «آزمونِ سبزِ خالی» بدتر از نبودِ آزمون است.
    const inv = await pool.query<{ id: string }>(
      `insert into invoice (branch_id, doc_number, fiscal_year, series_id, customer_id,
                            subtotal, discount_total, tax_total, grand_total, status)
       values ($1, 'Y-1001', 1403,
               (select id from document_series where branch_id = $1 and doc_kind = 'invoice' limit 1),
               $2, '1000', '0', '0', '1000', 'posted')
       returning id`,
      [branchId, customerId],
    );
    const created = await api(makerToken).post('/api/v1/returns').send({
      customer_id: customerId,
      invoice_id: inv.rows[0].id,
      reason_code: 'damaged',
      lines: [{ product_id: productId, qty: 1, unit_price: '1000', disposition: 'scrap' }],
    });
    expect(created.status).toBe(201);
    const res = await api(makerToken).post(`/api/v1/returns/${created.body.id}/approve`).send({});
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('self_approval_forbidden');
  });

  it('R-2 · مرجوعی: شخصِ دوم بدونِ سیاست تأیید می‌شود (سازگاریِ عقب‌رو)', async () => {
    const row = await pool.query<{ id: string }>(
      `select r.id from return_request r
         join branch b on b.id = r.branch_id
        where b.company_id = $1 and r.status = 'submitted' limit 1`,
      [companyId],
    );
    expect(row.rows.length).toBeGreaterThan(0);
    const res = await api(checkerToken).post(`/api/v1/returns/${row.rows[0].id}/approve`).send({});
    expect(res.status).toBe(200);
  });

  it('P-7 · خرید: با سیاست ولی بدونِ گردش ⇒ 409 approval_required', async () => {
    const chain = await createChain(companyId, 'ap.purchase.approve');
    await pool.query(
      `insert into approval_policy (company_id, operation, scope, approval_chain_id)
       values ($1, 'ap.purchase.approve', 'central', $2)`,
      [companyId, chain],
    );
    const po = await pool.query<{ id: string }>(
      `select po.id from purchase_order po
         join branch b on b.id = po.branch_id
        where b.company_id = $1 and po.status = 'draft' limit 1`,
      [companyId],
    );
    expect(po.rows.length).toBeGreaterThan(0);
    const res = await api(checkerToken).post(`/api/v1/purchase-orders/${po.rows[0].id}/approve`).send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('approval_required');
  });
});
