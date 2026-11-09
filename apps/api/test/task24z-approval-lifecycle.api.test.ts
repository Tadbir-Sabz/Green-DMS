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
import { businessToday, businessDateOf, shiftBusinessDate } from '../src/common/business-date';
import {
  composeApprovalPolicy,
  composeStages,
  detectConflicts,
  governanceTier,
  type ApprovalPolicyRow,
} from '../src/modules/rules-engine/approval-policy';
import {
  FINGERPRINT_FIELDS,
  fingerprintOf,
  fingerprintMatches,
} from '../src/modules/rules-engine/entity-fingerprint';

/**
 * TASK-24Z — آزمونِ چرخهٔ عمرِ **واقعیِ** تأیید.
 *
 * تفاوتِ بنیادی با فایلِ TASK-24Y:
 *   • هیچ اتصالِ تأییدی با SQLِ خام ساخته نمی‌شود. اگر مسیرِ محصول اتصال نسازد،
 *     آزمون شکست می‌خورد — همان اتفاقی که یافتهٔ A-1 را کشف‌پذیر می‌کند.
 *   • برای هر سه عملیاتِ تحتِ حاکمیت (سفارش، مرجوعی، خرید) چرخهٔ کامل از HTTP
 *     اجرا می‌شود: ساختِ موجودیت → سیاست → ارسال → تصمیم → اجرا → عدمِ بازمصرف.
 *   • کنترل‌های منفی **دائمی** هستند (نه ویرایشِ موقتِ کد): هر کنترل منفی یک
 *     حملهٔ واقعی را اجرا می‌کند و انتظار دارد رد شود.
 *
 * پیش‌نیاز: PostgreSQLِ یک‌بارمصرف (همان الگوی فایلِ 24Y).
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_task24z_lifecycle_test';
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

const ADMIN_USER = 'z_admin';
const ADMIN_PASSWORD = 'S3cret!pass';
const MAKER_USER = 'z_maker';
const MAKER_PASSWORD = 'Maker!pass1';
const CHECKER_USER = 'z_checker';
const CHECKER_PASSWORD = 'Check!pass1';

let adminToken = '';
let makerToken = '';
let checkerToken = '';
let otherToken = '';
let companyId = '';
let company2Id = '';
let branchId = '';
let customerId = '';
let productId = '';
let supplierId = '';
let checkerRoleId = '';
let otherRoleId = '';
let checkerUserId = '';
let makerUserId = '';
let foreignToken = '';

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

const seedUserWithRole = async (
  company: string,
  username: string,
  password: string,
  code: string,
  permissions: string[] | 'all',
): Promise<{ userId: string; roleId: string }> => {
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
  return { userId: user.rows[0].id, roleId: role.rows[0].id };
};

/** زنجیرهٔ تأیید با مراحلِ معین؛ هر مرحله به یک نقش گره می‌خورد (بدونِ مرحلهٔ بی‌تأییدکننده). */
const createChain = async (
  company: string,
  entity: string,
  steps: Array<{ step_no: number; roleId: string | null; min?: number | null; max?: number | null }>,
): Promise<string> => {
  const chain = (
    await pool.query<{ id: string }>(
      `insert into approval_chain (company_id, code, entity)
       values ($1, $2, $3) returning id`,
      [company, `CH-${Math.random().toString(36).slice(2, 10)}`, entity],
    )
  ).rows[0].id;
  for (const s of steps) {
    await pool.query(
      `insert into approval_step_def (approval_chain_id, step_no, approver_role_id, min_amount, max_amount)
       values ($1, $2, $3, $4, $5)`,
      [chain, s.step_no, s.roleId, s.min ?? null, s.max ?? null],
    );
  }
  return chain;
};

const resetApprovalData = async (): Promise<void> => {
  await pool.query(`set app.approval_history_maintenance = 'on'`);
  await pool.query(`delete from approval_notification where company_id = $1`, [companyId]);
  await pool.query(`delete from approval_binding where company_id = $1`, [companyId]);
  await pool.query(
    `delete from approval_decision where approval_request_id in
       (select id from approval_request where approval_chain_id in
          (select id from approval_chain where company_id = $1))`,
    [companyId],
  );
  await pool.query(
    `delete from approval_request where approval_chain_id in
       (select id from approval_chain where company_id = $1)`,
    [companyId],
  );
  await pool.query(`delete from approval_policy where company_id = $1`, [companyId]);
  await pool.query(
    `delete from approval_step_def where approval_chain_id in
       (select id from approval_chain where company_id = $1)`,
    [companyId],
  );
  await pool.query(`delete from approval_chain where company_id = $1`, [companyId]);
  await pool.query(`reset app.approval_history_maintenance`);
};

const createOrder = async (token: string): Promise<string> => {
  const res = await api(token)
    .post('/api/v1/orders')
    .send({
      customer_id: customerId,
      order_date: businessToday(),
      lines: [{ product_id: productId, qty: 1 }],
    });
  expect(res.status).toBe(201);
  return res.body.id as string;
};

const createReturn = async (token: string): Promise<string> => {
  const res = await api(token)
    .post('/api/v1/returns')
    .send({
      customer_id: customerId,
      reason_code: 'damaged',
      lines: [{ product_id: productId, qty: 1 }],
    });
  expect(res.status).toBe(201);
  return res.body.id as string;
};

const createPurchaseOrder = async (token: string): Promise<string> => {
  const res = await api(token)
    .post('/api/v1/purchase-orders')
    .send({
      branch_id: branchId,
      supplier_id: supplierId,
      warehouse_id: await warehouseId(),
      order_date: businessToday(),
      lines: [{ product_id: productId, qty: 10, unit_price: '1000' }],
    });
  expect(res.status).toBe(201);
  return res.body.id as string;
};

let cachedWarehouse: string | null = null;
const warehouseId = async (): Promise<string> => {
  if (cachedWarehouse) return cachedWarehouse;
  const { rows } = await pool.query<{ id: string }>(
    `select id from warehouse where branch_id = $1 limit 1`,
    [branchId],
  );
  cachedWarehouse = rows[0].id;
  return cachedWarehouse;
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
    `insert into company (code, legal_name, currency) values ('Z1', 'شرکتِ آزمون ۲۴Z', 'IRR') returning id`,
  );
  companyId = company.rows[0].id;
  const company2 = await pool.query<{ id: string }>(
    `insert into company (code, legal_name, currency) values ('Z2', 'شرکتِ دوم ۲۴Z', 'IRR') returning id`,
  );
  company2Id = company2.rows[0].id;

  const branch = await pool.query<{ id: string }>(
    `insert into branch (company_id, code, name) values ($1, 'ZB1', 'شعبهٔ آزمون') returning id`,
    [companyId],
  );
  branchId = branch.rows[0].id;

  const person = await pool.query<{ id: string }>(
    `insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, 'Z-CUST', 'natural', 'مشتری', 'آزمون') returning id`,
    [companyId],
  );
  customerId = (
    await pool.query<{ id: string }>(
      `insert into customer (person_id, branch_id, code) values ($1, $2, 'Z-C1') returning id`,
      [person.rows[0].id, branchId],
    )
  ).rows[0].id;

  const uom = await pool.query<{ id: string }>(`select id from uom where code = 'pcs' limit 1`);
  const uomId =
    uom.rows[0]?.id ??
    (await pool.query<{ id: string }>(`insert into uom (code, title) values ('pcs', 'عدد') returning id`))
      .rows[0].id;

  const category = await pool.query<{ id: string }>(
    `insert into product_category (company_id, code, name) values ($1, 'Z-CAT', 'دستهٔ آزمون') returning id`,
    [companyId],
  );
  productId = (
    await pool.query<{ id: string }>(
      `insert into product (company_id, code, name, category_id, base_uom_id)
       values ($1, 'Z-P1', 'کالای آزمون', $2, $3) returning id`,
      [companyId, category.rows[0].id, uomId],
    )
  ).rows[0].id;

  await pool.query(
    `insert into warehouse (branch_id, code, name, kind) values ($1, 'ZW1', 'انبارِ آزمون', 'main')`,
    [branchId],
  );

  const supplierPerson = await pool.query<{ id: string }>(
    `insert into person (company_id, code, legal_type, legal_name)
     values ($1, 'Z-SUP', 'legal', 'تأمین‌کنندهٔ آزمون') returning id`,
    [companyId],
  );
  supplierId = (
    await pool.query<{ id: string }>(
      `insert into supplier (company_id, person_id, code) values ($1, $2, 'Z-S1') returning id`,
      [companyId, supplierPerson.rows[0].id],
    )
  ).rows[0].id;

  const admin = await seedUserWithRole(companyId, ADMIN_USER, ADMIN_PASSWORD, 'Z-ADM', 'all');
  void admin;
  await seedUserWithRole(company2Id, 'z_other', 'Other!pass1', 'Z-OTH', 'all');
  const maker = await seedUserWithRole(companyId, MAKER_USER, MAKER_PASSWORD, 'Z-MKR', [
    'sales.order.create', 'sales.order.view', 'sales.order.approve',
    'sales.return.request', 'sales.return.view', 'sales.return.approve',
    'ap.purchase.request', 'ap.purchase.view', 'ap.purchase.approve',
    // عمداً مجوزِ تصمیم هم داده می‌شود تا هر ۴۰۳ از نگهبانِ جداسازیِ وظایف
    // بیاید، نه از گاردِ مجوز (وگرنه آزمون به دلیلِ اشتباه سبز می‌شود).
    'rules.view', 'rules.approval.decide',
  ]);
  makerUserId = maker.userId;
  const checker = await seedUserWithRole(companyId, CHECKER_USER, CHECKER_PASSWORD, 'Z-CHK', [
    // مجوزِ ساخت هم داده می‌شود تا سناریوی «سازنده = تأییدکننده» قابلِ ساخت باشد
    'sales.order.create',
    'sales.order.view', 'sales.order.approve',
    'sales.return.view', 'sales.return.approve',
    'ap.purchase.view', 'ap.purchase.approve',
    'rules.view', 'rules.manage', 'rules.approval.decide',
  ]);
  checkerRoleId = checker.roleId;
  checkerUserId = checker.userId;

  // کاربرِ **شرکتِ دوم** — برای اثباتِ جداسازیِ واقعیِ شرکت‌ها
  await seedUserWithRole(company2Id, 'z_foreign', 'Foreign!pass1', 'Z-FRG', 'all');
  const other = await seedUserWithRole(companyId, 'z_unrelated', 'Unrel!pass1', 'Z-UNR', [
    'sales.order.view', 'rules.view', 'rules.approval.decide',
  ]);
  otherRoleId = other.roleId;

  process.env.DATABASE_URL = testUrl.toString();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1', { exclude: ['api/health'] });
  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
  await app.init();

  adminToken = await login(ADMIN_USER, ADMIN_PASSWORD);
  makerToken = await login(MAKER_USER, MAKER_PASSWORD);
  checkerToken = await login(CHECKER_USER, CHECKER_PASSWORD);
  otherToken = await login('z_unrelated', 'Unrel!pass1');
  foreignToken = await login('z_foreign', 'Foreign!pass1');

  // لیستِ قیمت برای عبور از موتورِ قیمت
  await api(adminToken)
    .post('/api/v1/price-lists')
    .send({ code: 'ZL-1', title: 'لیستِ آزمون', currency: 'IRR', valid_from: '2020-01-01' });
  const pl = await pool.query<{ id: string }>(`select id from price_list where company_id = $1`, [companyId]);
  await pool.query(
    `insert into price_list_item (price_list_id, product_id, price, min_qty, valid)
     values ($1, $2, 1000, 0, daterange('2020-01-01', null))`,
    [pl.rows[0].id, productId],
  );
}, 120_000);

afterAll(async () => {
  await app?.close();
  await pool?.end();
  if (adminPool) {
    await adminPool.query(
      `select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()`,
      [TEST_DB],
    );
    await adminPool.query(`drop database if exists ${TEST_DB}`);
    await adminPool.end();
  }
}, 60_000);

beforeEach(async () => {
  await resetApprovalData();
});

// =====================================================================
// 1 — ترکیبِ سیاست (Phase C) — خالص
// =====================================================================
describe('1 — ترکیبِ سیاست', () => {
  const mk = (over: Partial<ApprovalPolicyRow>): ApprovalPolicyRow => ({
    id: 'p1', company_id: 'c1', operation: 'sales.order.approve', scope: 'operation',
    domain_id: null, min_amount: null, max_amount: null, min_risk_score: null,
    approval_chain_id: 'chain-a', expires_in_hours: null, on_expiry: 'escalate',
    is_active: true, priority: 100, ...over,
  });

  it('C-1 · سیاستِ قلمروِ سخت‌گیرانه‌تر **دور ریخته نمی‌شود** (یافتهٔ C-1 بسته شد)', () => {
    const central = mk({ id: 'cen', scope: 'central', min_amount: '0', approval_chain_id: 'CENTRAL' });
    const domain = mk({ id: 'dom', scope: 'domain', domain_id: 'd1', min_amount: '0', approval_chain_id: 'DOMAIN' });
    const ctx = { operation: 'sales.order.approve', amount: 10_000, riskScore: 0, domainId: 'd1' };

    const composed = composeApprovalPolicy([central, domain], ctx)!;
    // پیش‌تر: یک برنده (CENTRAL) و زنجیرهٔ قلمرو کاملاً دور ریخته می‌شد.
    expect(composed.chainIds).toHaveLength(2);
    expect(composed.chainIds).toContain('CENTRAL');
    expect(composed.chainIds).toContain('DOMAIN');
    expect(composed.matchedPolicyIds).toHaveLength(2);
  });

  it('C-2 · مراحلِ همهٔ لایه‌ها در یک توالی ادغام می‌شوند و هیچ مرحله‌ای حذف نمی‌شود', () => {
    const central = mk({ id: 'cen', scope: 'central', approval_chain_id: 'CENTRAL' });
    const domain = mk({ id: 'dom', scope: 'domain', domain_id: 'd1', approval_chain_id: 'DOMAIN' });
    const stages = new Map([
      ['CENTRAL', [{ approver_staff_id: null, approver_role_id: 'role-central', min_amount: null, max_amount: null, is_mandatory: true }]],
      ['DOMAIN', [
        { approver_staff_id: null, approver_role_id: 'role-dom-1', min_amount: null, max_amount: null, is_mandatory: true },
        { approver_staff_id: null, approver_role_id: 'role-dom-2', min_amount: null, max_amount: null, is_mandatory: true },
      ]],
    ]);
    const composed = composeApprovalPolicy(
      [central, domain],
      { operation: 'sales.order.approve', amount: 100, riskScore: 0, domainId: 'd1' },
      stages,
    )!;
    // ۳ مرحله، نه ۱ — یعنی «سخت‌گیرانه‌تر شدنِ قلمرو» واقعاً اثر دارد.
    expect(composed.stages).toHaveLength(3);
    expect(composed.stages.map((s) => s.policy_scope)).toEqual(['central', 'domain', 'domain']);
    // گام‌ها پیوسته و از ۱
    expect(composed.stages.map((s) => s.step_no)).toEqual([1, 2, 3]);
  });

  it('C-3 · سیاستِ مرکزی هرگز با آستانهٔ بزرگ در قلمرو دور زده نمی‌شود', () => {
    const central = mk({ id: 'cen', scope: 'central', min_amount: '0', approval_chain_id: 'CENTRAL' });
    const attack = mk({ id: 'atk', scope: 'domain', domain_id: 'd1', min_amount: '999999999', approval_chain_id: 'WEAK' });
    const composed = composeApprovalPolicy(
      [central, attack],
      { operation: 'sales.order.approve', amount: 1e9, riskScore: 0, domainId: 'd1' },
    )!;
    // لایهٔ حاکم مرکزی است، هرچند سیاستِ حمله «عددی سخت‌گیرانه‌تر» به نظر می‌رسد.
    expect(governanceTier(central)).toBeGreaterThan(governanceTier(attack));
    expect(composed.decidingPolicyId).toBe('cen');
    expect(composed.centralApplied).toBe(true);
  });

  it('C-4 · تعارضِ بازهٔ مبلغ صریحاً تشخیص داده می‌شود (حدس زده نمی‌شود)', () => {
    const a = mk({ id: 'a', scope: 'central', min_amount: '500', max_amount: null });
    const b = mk({ id: 'b', scope: 'domain', domain_id: 'd1', min_amount: null, max_amount: '100' });
    const conflicts = detectConflicts([a, b]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].code).toBe('amount_range_unsatisfiable');
  });

  it('C-5 · هیچ سیاستِ منطبقی نیست ⇒ null (fail-closed)', () => {
    expect(composeApprovalPolicy([], { operation: 'sales.order.approve', amount: 1, riskScore: 0, domainId: null })).toBeNull();
    const disabled = mk({ id: 'x', scope: 'central', is_active: false });
    expect(composeApprovalPolicy([disabled], { operation: 'sales.order.approve', amount: 1, riskScore: 0, domainId: null })).toBeNull();
  });

  it('C-6 · سخت‌گیرانه‌ترین مهلت و auto_reject در ترکیب برنده‌اند', () => {
    const a = mk({ id: 'a', scope: 'central', expires_in_hours: 48, on_expiry: 'escalate' });
    const b = mk({ id: 'b', scope: 'domain', domain_id: 'd1', expires_in_hours: 2, on_expiry: 'auto_reject' });
    const composed = composeApprovalPolicy([a, b], { operation: 'sales.order.approve', amount: 1, riskScore: 0, domainId: 'd1' })!;
    expect(composed.expiresInHours).toBe(2);
    expect(composed.onExpiry).toBe('auto_reject');
  });

  it('C-7 · مرحلهٔ تکراری دو بار شمرده نمی‌شود (بدونِ تأییدِ دوباره)', () => {
    const same = { approver_staff_id: null, approver_role_id: 'r1', min_amount: null, max_amount: null, is_mandatory: true };
    const a = mk({ id: 'a', scope: 'central', approval_chain_id: 'A' });
    const b = mk({ id: 'b', scope: 'domain', domain_id: 'd1', approval_chain_id: 'B' });
    const stages = composeStages([
      { policy: a, stages: [same] },
      { policy: b, stages: [same] },
    ]);
    expect(stages).toHaveLength(1);
  });
});

// =====================================================================
// 2 — اثرانگشتِ موجودیت (Phase H) — خالص
// =====================================================================
describe('2 — اثرانگشتِ موجودیت', () => {
  it('H-1 · فیلدهای تصمیم‌ساز برای هر سه عملیات تعریف شده‌اند', () => {
    for (const op of ['sales.order.approve', 'sales.return.approve', 'ap.purchase.approve']) {
      expect(FINGERPRINT_FIELDS[op]?.length ?? 0).toBeGreaterThan(0);
      expect(fingerprintOf(op, {})).not.toBeNull();
    }
  });

  it('H-2 · تغییرِ مبلغ اثرانگشت را عوض می‌کند', () => {
    const a = fingerprintOf('sales.order.approve', { customer_id: 'c', branch_id: 'b', grand_total: '1000', order_date: '2026-01-01' });
    const b = fingerprintOf('sales.order.approve', { customer_id: 'c', branch_id: 'b', grand_total: '2000', order_date: '2026-01-01' });
    expect(a).not.toBe(b);
  });

  it('H-3 · تغییرِ فرادادهٔ بی‌ربط اثرانگشت را عوض **نمی‌کند**', () => {
    const base = { customer_id: 'c', branch_id: 'b', grand_total: '1000', order_date: '2026-01-01' };
    const a = fingerprintOf('sales.order.approve', base);
    const b = fingerprintOf('sales.order.approve', { ...base, updated_at: '2030-01-01', row_version: 99, note: 'x' });
    expect(a).toBe(b);
  });

  it('H-4 · numeric با صفرِ اعشاریِ اضافه یک اثرانگشت می‌دهد (1000.00 == 1000)', () => {
    const a = fingerprintOf('sales.order.approve', { customer_id: 'c', branch_id: 'b', grand_total: '1000.00', order_date: '2026-01-01' });
    const b = fingerprintOf('sales.order.approve', { customer_id: 'c', branch_id: 'b', grand_total: 1000, order_date: '2026-01-01' });
    expect(a).toBe(b);
  });

  it('H-5 · اثرانگشتِ غایب هرگز «منطبق» نیست (fail-closed)', () => {
    expect(fingerprintMatches(null, 'abc')).toBe(false);
    expect(fingerprintMatches('abc', null)).toBe(false);
    expect(fingerprintMatches('abc', 'abd')).toBe(false);
    expect(fingerprintMatches('abc', 'abc')).toBe(true);
  });

  it('H-6 · عملیاتِ ناشناخته اثرانگشت ندارد ⇒ اجرا باید رد شود', () => {
    expect(fingerprintOf('mystery.operation', { a: 1 })).toBeNull();
  });
});

// =====================================================================
// 3 — چرخهٔ کاملِ سه عملیات از مسیرِ HTTP (Phase A) — **هستهٔ پذیرش**
// =====================================================================
describe('3 — چرخهٔ کاملِ تأیید (بدونِ SQLِ خام)', () => {
  /**
   * OPS-1: سفارشِ فروش — ساخت → سیاست → ارسال → تصمیم → اجرا → عدمِ بازمصرف
   */
  it('OPS-1 · سفارش: چرخهٔ کامل با اتصالِ واقعی و اجرای دقیقاً یک‌بار', async () => {
    const chain = await createChain(companyId, 'sales_order', [{ step_no: 1, roleId: checkerRoleId }]);
    const pol = await api(adminToken)
      .post('/api/v1/rules-engine/approval-policies')
      .send({ operation: 'sales.order.approve', scope: 'central', approval_chain_id: chain });
    expect(pol.status).toBe(201);

    const orderId = await createOrder(makerToken);

    // دروازه پیش از گردش بسته است
    const before = await api(checkerToken).post(`/api/v1/orders/${orderId}/approve`).send({});
    expect(before.status).toBe(409);
    expect(before.body.code).toBe('approval_required');

    // ارسال به گردش از مسیرِ محصول
    const sub = await api(makerToken).post(`/api/v1/orders/${orderId}/request-approval`).send({});
    expect(sub.status).toBe(201);
    const reqId = sub.body.approval_request_id as string;
    const record = await api(checkerToken).get(`/api/v1/rules-engine/approvals/${reqId}`).expect(200);
    expect(record.body.snapshot_steps).toHaveLength(1);
    expect(record.body.snapshot_steps[0].approver_role_id).toBe(checkerRoleId);
    expect(record.body.policy_snapshot.policies.map((p: { id: string }) => p.id)).toContain(pol.body.id);
    expect(record.body.policy_snapshot.source_chains[0].id).toBe(chain);
    expect(record.body.binding).toMatchObject({ operation: 'sales.order.approve', consumed_at: null, superseded_at: null });
    await api(foreignToken).get(`/api/v1/rules-engine/approvals/${reqId}`).expect(404);

    // اتصال ساخته شد — توسط خودِ محصول، نه آزمون
    expect(await countRows(
      `select count(*)::int as c from approval_binding where approval_request_id = $1 and consumed_at is null`,
      [reqId],
    )).toBe(1);
    // اثرانگشت ذخیره شده است
    expect(await countRows(
      `select count(*)::int as c from approval_binding where approval_request_id = $1 and entity_fingerprint is not null`,
      [reqId],
    )).toBe(1);

    // تصمیمِ مجاز
    const dec = await api(checkerToken)
      .post(`/api/v1/rules-engine/approvals/${reqId}/decision`)
      .send({ step_no: 1, decision: 'approved' });
    expect(dec.status).toBe(201);

    // اجرا
    const ok = await api(checkerToken).post(`/api/v1/orders/${orderId}/approve`).send({});
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('approved');

    // مصرفِ دقیقاً یک‌بار
    expect(await countRows(
      `select count(*)::int as c from approval_binding where approval_request_id = $1 and consumed_at is not null`,
      [reqId],
    )).toBe(1);

    // بازمصرف ممکن نیست
    const replay = await api(checkerToken).post(`/api/v1/orders/${orderId}/approve`).send({});
    expect(replay.status).toBe(409);
    expect(replay.body.code).toBe('approval_required');
  });

  it('OPS-2 · مرجوعی: چرخهٔ کامل با اتصالِ واقعی', async () => {
    const chain = await createChain(companyId, 'return_request', [{ step_no: 1, roleId: checkerRoleId }]);
    await api(adminToken).post('/api/v1/rules-engine/approval-policies').send({
      operation: 'sales.return.approve', scope: 'central', approval_chain_id: chain,
    });

    const retId = await createReturn(makerToken);
    const before = await api(checkerToken).post(`/api/v1/returns/${retId}/approve`).send({});
    expect(before.status).toBe(409);
    expect(before.body.code).toBe('approval_required');

    const sub = await api(makerToken).post(`/api/v1/returns/${retId}/request-approval`).send({});
    expect(sub.status).toBe(201);
    const reqId = sub.body.approval_request_id as string;
    expect(await countRows(`select count(*)::int as c from approval_binding where approval_request_id = $1`, [reqId])).toBe(1);

    const dec = await api(checkerToken)
      .post(`/api/v1/rules-engine/approvals/${reqId}/decision`)
      .send({ step_no: 1, decision: 'approved' });
    expect(dec.status).toBe(201);

    const ok = await api(checkerToken).post(`/api/v1/returns/${retId}/approve`).send({});
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('approved');
    expect(await countRows(
      `select count(*)::int as c from approval_binding where approval_request_id = $1 and consumed_at is not null`,
      [reqId],
    )).toBe(1);
  });

  it('OPS-3 · سفارشِ خرید: چرخهٔ کامل با اتصالِ واقعی', async () => {
    const chain = await createChain(companyId, 'purchase_order', [{ step_no: 1, roleId: checkerRoleId }]);
    await api(adminToken).post('/api/v1/rules-engine/approval-policies').send({
      operation: 'ap.purchase.approve', scope: 'central', approval_chain_id: chain,
    });

    const poId = await createPurchaseOrder(makerToken);
    const before = await api(checkerToken).post(`/api/v1/purchase-orders/${poId}/approve`).send({});
    expect(before.status).toBe(409);
    expect(before.body.code).toBe('approval_required');

    const sub = await api(makerToken).post(`/api/v1/purchase-orders/${poId}/request-approval`).send({});
    expect(sub.status).toBe(201);
    const reqId = sub.body.approval_request_id as string;
    expect(await countRows(`select count(*)::int as c from approval_binding where approval_request_id = $1`, [reqId])).toBe(1);

    const dec = await api(checkerToken)
      .post(`/api/v1/rules-engine/approvals/${reqId}/decision`)
      .send({ step_no: 1, decision: 'approved' });
    expect(dec.status).toBe(201);

    const ok = await api(checkerToken).post(`/api/v1/purchase-orders/${poId}/approve`).send({});
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('approved');
  });

  it('OPS-4 · زنجیرهٔ دومرحله‌ای: تصمیمِ اول گردش را نمی‌بندد', async () => {
    const chain = await createChain(companyId, 'sales_order', [
      { step_no: 1, roleId: checkerRoleId },
      { step_no: 2, roleId: otherRoleId },
    ]);
    await api(adminToken).post('/api/v1/rules-engine/approval-policies').send({
      operation: 'sales.order.approve', scope: 'central', approval_chain_id: chain,
    });
    const orderId = await createOrder(makerToken);
    const sub = await api(makerToken).post(`/api/v1/orders/${orderId}/request-approval`).send({});
    expect(sub.status).toBe(201);
    const reqId = sub.body.approval_request_id as string;

    const d1 = await api(checkerToken)
      .post(`/api/v1/rules-engine/approvals/${reqId}/decision`)
      .send({ step_no: 1, decision: 'approved' });
    expect(d1.status).toBe(201);

    // هنوز بسته نشده؛ دروازه بسته است
    const early = await api(checkerToken).post(`/api/v1/orders/${orderId}/approve`).send({});
    expect(early.status).toBe(409);

    const d2 = await api(otherToken)
      .post(`/api/v1/rules-engine/approvals/${reqId}/decision`)
      .send({ step_no: 2, decision: 'approved' });
    expect(d2.status).toBe(201);

    const ok = await api(checkerToken).post(`/api/v1/orders/${orderId}/approve`).send({});
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('approved');
  });
});

// =====================================================================
// 4 — کنترل‌های منفیِ دائمی (Phase J)
// =====================================================================
describe('4 — کنترل‌های منفی', () => {
  const resubmissionFixture = async () => {
    const chain = await createChain(companyId, 'sales_order', [{ step_no: 1, roleId: checkerRoleId }]);
    await api(adminToken).post('/api/v1/rules-engine/approval-policies').send({
      operation: 'sales.order.approve', scope: 'central', approval_chain_id: chain,
    }).expect(201);
    const orderId = await createOrder(makerToken);
    const submitted = await api(makerToken).post(`/api/v1/orders/${orderId}/request-approval`).send({}).expect(201);
    return { orderId, requestId: submitted.body.approval_request_id as string };
  };

  it('R4 · expired and returned requests get fresh workflows, never reopen', async () => {
    const { orderId, requestId } = await resubmissionFixture();
    // Expiry clock fault injection; request and binding are created over HTTP.
    await pool.query(`update approval_request set expires_at = now() - interval '1 second' where id = $1`, [requestId]);
    const expired = await api(checkerToken).post(`/api/v1/rules-engine/approvals/${requestId}/decision`)
      .send({ step_no: 1, decision: 'approved' });
    expect(expired.status).toBe(409);
    expect(expired.body.code).toBe('approval_expired');
    const second = await api(makerToken).post(`/api/v1/orders/${orderId}/request-approval`).send({}).expect(201);
    expect((await api(checkerToken).get(`/api/v1/rules-engine/approvals/${requestId}`)).body.status).toBe('expired');
    await api(checkerToken).post(`/api/v1/rules-engine/approvals/${second.body.approval_request_id}/decision`)
      .send({ step_no: 1, decision: 'returned' }).expect(201);
    const third = await api(makerToken).post(`/api/v1/orders/${orderId}/request-approval`).send({}).expect(201);
    expect(new Set([requestId, second.body.approval_request_id, third.body.approval_request_id]).size).toBe(3);
    const previous = await api(checkerToken).get(`/api/v1/rules-engine/approvals/${second.body.approval_request_id}`).expect(200);
    expect(previous.body.binding.superseded_at).toBeTruthy();
    expect(previous.body.decisions[0].decision).toBe('returned');
    expect(previous.body.policy_snapshot.version).toBe(1);

  });

  it('R5 · request transition DB failure rolls back decision; retry and concurrent final decisions are safe', async () => {
    const { requestId } = await resubmissionFixture();
    await pool.query(`create function r1_fail_request() returns trigger language plpgsql as $$
      begin raise exception 'R1 injected request transition failure'; end $$;
      create trigger r1_fail_request before update on approval_request
      for each row execute function r1_fail_request()`);
    try {
      const failed = await api(checkerToken).post(`/api/v1/rules-engine/approvals/${requestId}/decision`)
        .send({ step_no: 1, decision: 'approved' });
      expect(failed.status).toBe(500);
      expect(await countRows(`select count(*)::int as c from approval_decision where approval_request_id = $1`, [requestId])).toBe(0);
    } finally {
      await pool.query('drop trigger r1_fail_request on approval_request; drop function r1_fail_request()');
    }
    const results = await Promise.all([1, 2].map(() => api(checkerToken)
      .post(`/api/v1/rules-engine/approvals/${requestId}/decision`).send({ step_no: 1, decision: 'approved' })));
    expect(results.map(r => r.status).sort()).toEqual([201, 409]);
    expect(await countRows(`select count(*)::int as c from approval_decision where approval_request_id = $1`, [requestId])).toBe(1);
  });

  it('R6 · business transition DB failure rolls back consumption; same approval retries successfully', async () => {
    const { requestId, orderId } = await resubmissionFixture();
    await api(checkerToken).post(`/api/v1/rules-engine/approvals/${requestId}/decision`)
      .send({ step_no: 1, decision: 'approved' }).expect(201);
    await pool.query(`create function r1_fail_order() returns trigger language plpgsql as $$
      begin if new.status = 'approved' then raise exception 'R1 injected execution failure'; end if; return new; end $$;
      create trigger r1_fail_order before update on sales_order for each row execute function r1_fail_order()`);
    try {
      await api(checkerToken).post(`/api/v1/orders/${orderId}/approve`).send({}).expect(500);
      expect(await countRows(`select count(*)::int as c from approval_binding where approval_request_id = $1 and consumed_at is null`, [requestId])).toBe(1);
      expect((await pool.query(`select status from sales_order where id = $1`, [orderId])).rows[0].status).toBe('pending_approval');
    } finally {
      await pool.query('drop trigger r1_fail_order on sales_order; drop function r1_fail_order()');
    }
    await api(checkerToken).post(`/api/v1/orders/${orderId}/approve`).send({}).expect(200);
    await api(checkerToken).post(`/api/v1/orders/${orderId}/approve`).send({}).expect(409);
  });

  it('CLOSE-E2 · another submitter does not let the document creator approve their own document', async () => {
    const chain = await createChain(companyId, 'sales_order', [{ step_no: 1, roleId: checkerRoleId }]);
    await api(adminToken).post('/api/v1/rules-engine/approval-policies').send({
      operation: 'sales.order.approve', scope: 'central', approval_chain_id: chain,
    }).expect(201);
    const orderId = await createOrder(checkerToken);
    const sub = await api(adminToken).post('/api/v1/rules-engine/approvals').send({
      approval_chain_id: chain, entity_type: 'sales_order', entity_id: orderId, requested_by: makerUserId,
    }).expect(201);
    const decision = await api(checkerToken).post(`/api/v1/rules-engine/approvals/${sub.body.id}/decision`)
      .send({ step_no: 1, decision: 'approved' });
    expect(decision.status).toBe(403);
    expect(decision.body.code).toBe('self_approval_forbidden');
    expect(await countRows(`select count(*)::int as c from approval_decision where approval_request_id = $1`, [sub.body.id])).toBe(0);
  });

  it('CLOSE-E1 · assigned role without eligible users cannot create a dangling workflow', async () => {
    const role = (await pool.query<{ id: string }>(`insert into role(company_id,code,name)
      values ($1,'empty-role','بدون عضو') returning id`, [companyId])).rows[0].id;
    const chain = await createChain(companyId, 'sales_order', [{ step_no: 1, roleId: role }]);
    await api(adminToken).post('/api/v1/rules-engine/approval-policies').send({
      operation: 'sales.order.approve', scope: 'central', approval_chain_id: chain,
    }).expect(201);
    const orderId = await createOrder(makerToken);
    const result = await api(makerToken).post(`/api/v1/orders/${orderId}/request-approval`).send({});
    expect(result.status).toBe(409);
    expect(result.body.code).toBe('approval_no_eligible_approver');
    expect(await countRows(`select count(*)::int as c from approval_binding where entity_id = $1`, [orderId])).toBe(0);
  });

  it('CLOSE-P1 · generic submission cannot lower the stored amount to evade a policy threshold', async () => {
    const central = await createChain(companyId, 'sales_order', [{ step_no: 1, roleId: checkerRoleId }]);
    const extra = await createChain(companyId, 'sales_order', [{ step_no: 1, roleId: otherRoleId }]);
    await api(adminToken).post('/api/v1/rules-engine/approval-policies').send({
      operation: 'sales.order.approve', scope: 'central', approval_chain_id: central,
    }).expect(201);
    await api(adminToken).post('/api/v1/rules-engine/approval-policies').send({
      operation: 'sales.order.approve', scope: 'operation', approval_chain_id: extra, min_amount: 500,
    }).expect(201);
    const orderId = await createOrder(makerToken);
    const created = await api(adminToken).post('/api/v1/rules-engine/approvals').send({
      approval_chain_id: central, entity_type: 'sales_order', entity_id: orderId,
      requested_by: makerUserId, amount: 1,
    }).expect(201);
    expect(Number(created.body.amount)).toBeGreaterThanOrEqual(500);
    const first = await api(checkerToken).post(`/api/v1/rules-engine/approvals/${created.body.id}/decision`)
      .send({ step_no: 1, decision: 'approved' }).expect(201);
    expect(first.body.status).toBe('pending');
    await api(checkerToken).post(`/api/v1/orders/${orderId}/approve`).send({}).expect(409);
  });

  it('R1 · rejected request is superseded, never reopened, with immutable decisions', async () => {
    const chain = await createChain(companyId, 'sales_order', [{ step_no: 1, roleId: checkerRoleId }]);
    await api(adminToken).post('/api/v1/rules-engine/approval-policies').send({
      operation: 'sales.order.approve', scope: 'central', approval_chain_id: chain,
    }).expect(201);
    const orderId = await createOrder(makerToken);
    const first = await api(makerToken).post(`/api/v1/orders/${orderId}/request-approval`).send({}).expect(201);
    const oldId = first.body.approval_request_id;
    await api(checkerToken).post(`/api/v1/rules-engine/approvals/${oldId}/decision`)
      .send({ step_no: 1, decision: 'rejected', comment: 'اصلاح لازم است' }).expect(201);
    const retried = await api(makerToken).post(`/api/v1/orders/${orderId}/request-approval`).send({}).expect(201);
    const newId = retried.body.approval_request_id;
    expect(newId).not.toBe(oldId);
    const history = await api(checkerToken).get(`/api/v1/rules-engine/approvals/${oldId}`).expect(200);
    expect(history.body.status).toBe('rejected');
    expect(history.body.decisions).toHaveLength(1);
    expect(history.body.decisions[0].decision).toBe('rejected');
    const before = await api(checkerToken).post(`/api/v1/orders/${orderId}/approve`).send({});
    expect(before.status).toBe(409);
    await api(checkerToken).post(`/api/v1/rules-engine/approvals/${newId}/decision`)
      .send({ step_no: 1, decision: 'approved' }).expect(201);
    await api(checkerToken).post(`/api/v1/orders/${orderId}/approve`).send({}).expect(200);
    const oldBinding = await pool.query(`select superseded_at, consumed_at from approval_binding where approval_request_id = $1`, [oldId]);
    expect(oldBinding.rows[0].superseded_at).toBeTruthy();
    expect(oldBinding.rows[0].consumed_at).toBeNull();
  });

  it('R2 · concurrent duplicate submission creates exactly one request and binding', async () => {
    const chain = await createChain(companyId, 'sales_order', [{ step_no: 1, roleId: checkerRoleId }]);
    await api(adminToken).post('/api/v1/rules-engine/approval-policies').send({
      operation: 'sales.order.approve', scope: 'central', approval_chain_id: chain,
    }).expect(201);
    const orderId = await createOrder(makerToken);
    const results = await Promise.all([1, 2].map(() => api(makerToken)
      .post(`/api/v1/orders/${orderId}/request-approval`).send({})));
    expect(results.map(r => r.status).sort()).toEqual([201, 409]);
    expect(results.find(r => r.status === 409)?.body.code).toBe('approval_already_submitted');
    expect(await countRows(`select count(*)::int as c from approval_binding where entity_id = $1`, [orderId])).toBe(1);
  });

  it('R3 · changed approved document requires fresh decisions; previous approval cannot execute', async () => {
    const chain = await createChain(companyId, 'sales_order', [{ step_no: 1, roleId: checkerRoleId }]);
    await api(adminToken).post('/api/v1/rules-engine/approval-policies').send({
      operation: 'sales.order.approve', scope: 'central', approval_chain_id: chain,
    }).expect(201);
    const orderId = await createOrder(makerToken);
    const first = await api(makerToken).post(`/api/v1/orders/${orderId}/request-approval`).send({}).expect(201);
    await api(checkerToken).post(`/api/v1/rules-engine/approvals/${first.body.approval_request_id}/decision`)
      .send({ step_no: 1, decision: 'approved' }).expect(201);
    // Fault injection only: bindings and decisions are exclusively HTTP-created.
    await pool.query(`update sales_order_line set unit_price = unit_price + 1 where sales_order_id = $1`, [orderId]);
    const next = await api(makerToken).post(`/api/v1/orders/${orderId}/request-approval`).send({}).expect(201);
    expect(next.body.approval_request_id).not.toBe(first.body.approval_request_id);
    await api(checkerToken).post(`/api/v1/orders/${orderId}/approve`).send({}).expect(409);
    await api(checkerToken).post(`/api/v1/rules-engine/approvals/${next.body.approval_request_id}/decision`)
      .send({ step_no: 1, decision: 'approved' }).expect(201);
    await api(checkerToken).post(`/api/v1/orders/${orderId}/approve`).send({}).expect(200);
  });

  it('NC-C2 · all matching policy chains survive persistence and require decisions', async () => {
    const central = await createChain(companyId, 'sales_order', [{ step_no: 1, roleId: checkerRoleId }]);
    const operation = await createChain(companyId, 'sales_order', [{ step_no: 1, roleId: otherRoleId }]);
    for (const [scope, chain] of [['central', central], ['operation', operation]]) {
      const policy = await api(adminToken).post('/api/v1/rules-engine/approval-policies').send({
        operation: 'sales.order.approve', scope, approval_chain_id: chain,
      });
      expect(policy.status).toBe(201);
    }
    const orderId = await createOrder(makerToken);
    const submitted = await api(makerToken).post(`/api/v1/orders/${orderId}/request-approval`).send({});
    expect(submitted.status).toBe(201);
    const requestId = submitted.body.approval_request_id;
    const first = await api(checkerToken).post(`/api/v1/rules-engine/approvals/${requestId}/decision`)
      .send({ step_no: 1, decision: 'approved' });
    expect(first.status).toBe(201);
    expect(first.body.status).toBe('pending');
    const blocked = await api(checkerToken).post(`/api/v1/orders/${orderId}/approve`).send({});
    expect(blocked.status).toBe(409);
    const second = await api(otherToken).post(`/api/v1/rules-engine/approvals/${requestId}/decision`)
      .send({ step_no: 2, decision: 'approved' });
    expect(second.status).toBe(201);
    expect(second.body.status).toBe('approved');
    const results = await Promise.all([1, 2].map(() =>
      api(checkerToken).post(`/api/v1/orders/${orderId}/approve`).send({})));
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
  });

  it('NC-A1 · هیچ درخواستی بدونِ اتصال ساخته نمی‌شود (Endpoint به lifecycle وصل است)', async () => {
    const chain = await createChain(companyId, 'sales_order', [{ step_no: 1, roleId: checkerRoleId }]);
    await api(adminToken).post('/api/v1/rules-engine/approval-policies').send({
      operation: 'sales.order.approve', scope: 'central', approval_chain_id: chain,
    });
    const orderId = await createOrder(makerToken);

    // مسیرِ «عمومیِ» ساختِ درخواست هم باید اتصال بسازد، نه فقط request-approval
    const created = await api(adminToken).post('/api/v1/rules-engine/approvals').send({
      approval_chain_id: chain,
      entity_type: 'sales_order',
      entity_id: orderId,
      requested_by: makerUserId,
      amount: 1000,
    });
    expect(created.status).toBe(201);
    const reqId = created.body.id as string;
    expect(await countRows(
      `select count(*)::int as c from approval_binding where approval_request_id = $1`,
      [reqId],
    )).toBe(1);
  });

  it('NC-A2 · درخواستِ تأیید برای موجودیتِ ناموجود ۴۰۴ می‌دهد (نه تأییدِ بی‌موجودیت)', async () => {
    // پیش از TASK-24Z این فراخوانی ۲۰۱ می‌داد و یک درخواستِ تأییدِ یتیم
    // (بدونِ موجودیتِ واقعی) می‌ساخت که هرگز نمی‌توانست مصرف شود.
    const chain = await createChain(companyId, 'sales_order', [{ step_no: 1, roleId: checkerRoleId }]);
    await api(adminToken).post('/api/v1/rules-engine/approval-policies').send({
      operation: 'sales.order.approve', scope: 'central', approval_chain_id: chain,
    });
    // با admin فراخوانی می‌شود تا ۴۰۳ گاردِ مجوز، آزمون را از مسیرِ
    // «موجودیتِ ناموجود» منحرف نکند (خطای درست باید ۴۰۴ باشد، نه ۴۰۳).
    const res = await api(adminToken).post('/api/v1/rules-engine/approvals').send({
      approval_chain_id: chain,
      entity_type: 'sales_order',
      entity_id: '00000000-0000-4000-8000-000000000000',
      requested_by: makerUserId,
      amount: 1000,
    });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('entity_not_found_for_operation');
  });

  it('NC-B1 · مرحلهٔ بی‌تأییدکننده گردش نمی‌سازد (allow-all ممنوع)', async () => {
    const chain = await createChain(companyId, 'sales_order', [{ step_no: 1, roleId: null }]);
    await api(adminToken).post('/api/v1/rules-engine/approval-policies').send({
      operation: 'sales.order.approve', scope: 'central', approval_chain_id: chain,
    });
    const orderId = await createOrder(makerToken);
    const res = await api(makerToken).post(`/api/v1/orders/${orderId}/request-approval`).send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('approval_step_unassigned');
    expect(await countRows(`select count(*)::int as c from approval_request where entity_id = $1`, [orderId])).toBe(0);
  });

  it('NC-B2 · خودتأییدی در تصمیم ممنوع است', async () => {
    const chain = await createChain(companyId, 'sales_order', [{ step_no: 1, roleId: checkerRoleId }]);
    await api(adminToken).post('/api/v1/rules-engine/approval-policies').send({
      operation: 'sales.order.approve', scope: 'central', approval_chain_id: chain,
    });
    // سازنده = همان کسی که نقشِ تأیید دارد ⇒ باید ۴۰۳ بگیرد
    const selfChainOrder = await createOrder(checkerToken);
    const sub = await api(checkerToken).post(`/api/v1/orders/${selfChainOrder}/request-approval`).send({});
    expect(sub.status).toBe(201);
    const dec = await api(checkerToken)
      .post(`/api/v1/rules-engine/approvals/${sub.body.approval_request_id}/decision`)
      .send({ step_no: 1, decision: 'approved' });
    expect(dec.status).toBe(403);
    expect(dec.body.code).toBe('self_approval_forbidden');
  });

  it('NC-B3 · کاربرِ بی‌نقش نمی‌تواند تصمیم بگیرد', async () => {
    const chain = await createChain(companyId, 'sales_order', [{ step_no: 1, roleId: checkerRoleId }]);
    await api(adminToken).post('/api/v1/rules-engine/approval-policies').send({
      operation: 'sales.order.approve', scope: 'central', approval_chain_id: chain,
    });
    const orderId = await createOrder(makerToken);
    const sub = await api(makerToken).post(`/api/v1/orders/${orderId}/request-approval`).send({});
    const dec = await api(otherToken)
      .post(`/api/v1/rules-engine/approvals/${sub.body.approval_request_id}/decision`)
      .send({ step_no: 1, decision: 'approved' });
    expect(dec.status).toBe(403);
    expect(dec.body.code).toBe('approver_not_authorized');
  });

  it('NC-E1 · جداسازیِ شرکت: حدسِ UUID از شرکتِ دیگر ۴۰۴ می‌دهد', async () => {
    const chain = await createChain(companyId, 'sales_order', [{ step_no: 1, roleId: checkerRoleId }]);
    await api(adminToken).post('/api/v1/rules-engine/approval-policies').send({
      operation: 'sales.order.approve', scope: 'central', approval_chain_id: chain,
    });
    const orderId = await createOrder(makerToken);
    const sub = await api(makerToken).post(`/api/v1/orders/${orderId}/request-approval`).send({});
    const reqId = sub.body.approval_request_id as string;

    // کاربرِ **شرکتِ دوم** (نه کاربرِ بی‌نقشِ همین شرکت)
    const seen = await api(foreignToken).get(`/api/v1/rules-engine/approvals/${reqId}`);
    expect([403, 404]).toContain(seen.status);
    const decided = await api(foreignToken)
      .post(`/api/v1/rules-engine/approvals/${reqId}/decision`)
      .send({ step_no: 1, decision: 'approved' });
    expect([403, 404]).toContain(decided.status);
    const inbox = await api(foreignToken).get('/api/v1/rules-engine/approvals/inbox');
    expect(inbox.status).toBe(200);
    expect((inbox.body as Array<{ id: string }>).some((r) => r.id === reqId)).toBe(false);
  });

  it('NC-F1 · اتصالِ عملیاتِ دیگر، این عملیات را مجاز نمی‌کند', async () => {
    const chain = await createChain(companyId, 'sales_order', [{ step_no: 1, roleId: checkerRoleId }]);
    await api(adminToken).post('/api/v1/rules-engine/approval-policies').send({
      operation: 'sales.order.approve', scope: 'central', approval_chain_id: chain,
    });
    const orderA = await createOrder(makerToken);
    const sub = await api(makerToken).post(`/api/v1/orders/${orderA}/request-approval`).send({});
    await api(checkerToken)
      .post(`/api/v1/rules-engine/approvals/${sub.body.approval_request_id}/decision`)
      .send({ step_no: 1, decision: 'approved' });

    // سفارشِ دوم هیچ اتصالی ندارد ⇒ نباید با تأییدِ سفارشِ اول اجرا شود
    const orderB = await createOrder(makerToken);
    const wrong = await api(checkerToken).post(`/api/v1/orders/${orderB}/approve`).send({});
    expect(wrong.status).toBe(409);
    expect(wrong.body.code).toBe('approval_required');
  });

  it('NC-H1 · تغییرِ مبلغ پس از تأیید ⇒ اجرا رد می‌شود (اثرانگشت)', async () => {
    const chain = await createChain(companyId, 'sales_order', [{ step_no: 1, roleId: checkerRoleId }]);
    await api(adminToken).post('/api/v1/rules-engine/approval-policies').send({
      operation: 'sales.order.approve', scope: 'central', approval_chain_id: chain,
    });
    const orderId = await createOrder(makerToken);
    const sub = await api(makerToken).post(`/api/v1/orders/${orderId}/request-approval`).send({});
    const reqId = sub.body.approval_request_id as string;
    await api(checkerToken)
      .post(`/api/v1/rules-engine/approvals/${reqId}/decision`)
      .send({ step_no: 1, decision: 'approved' });

    // موجودیت پس از تأیید تغییر می‌کند — یکی از فیلدهای **تصمیم‌ساز** (تاریخِ سفارش)
    await pool.query(`update sales_order set order_date = order_date - 1 where id = $1`, [orderId]);

    const res = await api(checkerToken).post(`/api/v1/orders/${orderId}/approve`).send({});
    if (res.body.code !== 'entity_changed_since_approval') console.error('NCH1', res.status, JSON.stringify(res.body).slice(0,300));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('entity_changed_since_approval');

    // و اتصال مصرف **نشده** باقی می‌ماند (تأیید هدر نرفته است)
    expect(await countRows(
      `select count(*)::int as c from approval_binding where approval_request_id = $1 and consumed_at is null`,
      [reqId],
    )).toBe(1);
  });

  it('NC-H2 · line-only price edits invalidate approval even if header total is unchanged', async () => {
    const chain = await createChain(companyId, 'sales_order', [{ step_no: 1, roleId: checkerRoleId }]);
    await api(adminToken).post('/api/v1/rules-engine/approval-policies').send({
      operation: 'sales.order.approve', scope: 'central', approval_chain_id: chain,
    }).expect(201);
    const orderId = await createOrder(makerToken);
    const sub = await api(makerToken).post(`/api/v1/orders/${orderId}/request-approval`).send({}).expect(201);
    const requestId = sub.body.approval_request_id;
    await api(checkerToken).post(`/api/v1/rules-engine/approvals/${requestId}/decision`)
      .send({ step_no: 1, decision: 'approved' }).expect(201);
    await pool.query(`update sales_order_line set unit_price = unit_price + 1 where sales_order_id = $1`, [orderId]);
    const res = await api(checkerToken).post(`/api/v1/orders/${orderId}/approve`).send({});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('entity_changed_since_approval');
  });

  it('NC-D1 · گذارِ کسب‌وکارِ ناموفق، تأیید را نمی‌سوزاند (اتمیک‌بودن)', async () => {
    const chain = await createChain(companyId, 'sales_order', [{ step_no: 1, roleId: checkerRoleId }]);
    await api(adminToken).post('/api/v1/rules-engine/approval-policies').send({
      operation: 'sales.order.approve', scope: 'central', approval_chain_id: chain,
    });
    const orderId = await createOrder(makerToken);
    const sub = await api(makerToken).post(`/api/v1/orders/${orderId}/request-approval`).send({});
    const reqId = sub.body.approval_request_id as string;
    await api(checkerToken)
      .post(`/api/v1/rules-engine/approvals/${reqId}/decision`)
      .send({ step_no: 1, decision: 'approved' });

    // وضعیت را به چیزی تغییر می‌دهیم که گذارِ approve برایش مجاز نیست
    await pool.query(`update sales_order set status = 'cancelled' where id = $1`, [orderId]);
    const failed = await api(checkerToken).post(`/api/v1/orders/${orderId}/approve`).send({});
    expect(failed.status).toBe(409);

    // تأیید نباید سوخته باشد
    expect(await countRows(
      `select count(*)::int as c from approval_binding where approval_request_id = $1 and consumed_at is null`,
      [reqId],
    )).toBe(1);

    // بازگرداندن وضعیت ⇒ همان تأیید باید هنوز کار کند
    await pool.query(`update sales_order set status = 'pending_approval' where id = $1`, [orderId]);
    const retried = await api(checkerToken).post(`/api/v1/orders/${orderId}/approve`).send({});
    expect(retried.status).toBe(200);
    expect(retried.body.status).toBe('approved');
  });

  it('NC-D2 · تفکیلِ منقضی تصمیم را مجاز نمی‌کند', async () => {
    const chain = await createChain(companyId, 'sales_order', [{ step_no: 1, roleId: checkerRoleId }]);
    await api(adminToken).post('/api/v1/rules-engine/approval-policies').send({
      operation: 'sales.order.approve', scope: 'central', approval_chain_id: chain,
    });
    const orderId = await createOrder(makerToken);
    const sub = await api(makerToken).post(`/api/v1/orders/${orderId}/request-approval`).send({});
    const reqId = sub.body.approval_request_id as string;

    // تفکیلِ منقضی: بازه در گذشته
    await pool.query(
      `insert into approval_delegation
         (company_id, delegator_id, delegate_id, operation, valid_from, valid_to, reason, created_by)
       values ($1, $2, $3, 'sales.order.approve', now() - interval '10 days', now() - interval '5 days', 'منقضی', $4)`,
      [companyId, checkerUserId, (await pool.query(`select id from app_user where username = 'z_unrelated'`)).rows[0].id, checkerUserId],
    );
    const dec = await api(otherToken)
      .post(`/api/v1/rules-engine/approvals/${reqId}/decision`)
      .send({ step_no: 1, decision: 'approved' });
    expect(dec.status).toBe(403);
    expect(dec.body.code).toBe('approver_not_authorized');
  });

  it('NC-D3 · تفکیلِ معتبر **واقعاً** اجازهٔ تصمیم می‌دهد (B-2 بسته شد)', async () => {
    const chain = await createChain(companyId, 'sales_order', [{ step_no: 1, roleId: checkerRoleId }]);
    await api(adminToken).post('/api/v1/rules-engine/approval-policies').send({
      operation: 'sales.order.approve', scope: 'central', approval_chain_id: chain,
    });
    const orderId = await createOrder(makerToken);
    const sub = await api(makerToken).post(`/api/v1/orders/${orderId}/request-approval`).send({});
    const reqId = sub.body.approval_request_id as string;

    const unrelatedId = (await pool.query<{ id: string }>(`select id from app_user where username = 'z_unrelated'`)).rows[0].id;
    // تفکیلِ فعال و در بازه
    await pool.query(
      `insert into approval_delegation
         (company_id, delegator_id, delegate_id, operation, valid_from, valid_to, reason, created_by)
       values ($1, $2, $3, 'sales.order.approve', now() - interval '1 day', now() + interval '5 days', 'واگذاریِ آزمون', $4)`,
      [companyId, checkerUserId, unrelatedId, checkerUserId],
    );
    // نماینده نباید گردش را ببیند؟ می‌بیند؛ مهم این است که **بتواند تصمیم بگیرد**
    const dec = await api(otherToken)
      .post(`/api/v1/rules-engine/approvals/${reqId}/decision`)
      .send({ step_no: 1, decision: 'approved' });
    expect(dec.status).toBe(201);

    // زمینهٔ تفکیل در تاریخچهٔ تصمیم ثبت شده است (حسابرسی)
    const meta = await pool.query<{ meta: { delegated_from?: string } | null }>(
      `select meta from approval_decision where approval_request_id = $1`,
      [reqId],
    );
    expect(meta.rows[0].meta?.delegated_from).toBe(checkerUserId);
    const detail = await api(otherToken).get(`/api/v1/rules-engine/approvals/${reqId}`).expect(200);
    expect(detail.body.decisions[0].meta.delegated_from).toBe(checkerUserId);

  });

  it('NC-D4 · تفکیل خودتأییدی را مجاز نمی‌کند', async () => {
    const chain = await createChain(companyId, 'sales_order', [{ step_no: 1, roleId: checkerRoleId }]);
    await api(adminToken).post('/api/v1/rules-engine/approval-policies').send({
      operation: 'sales.order.approve', scope: 'central', approval_chain_id: chain,
    });
    // سازنده = z_unrelated (و نمایندهٔ checker است)
    const unrelatedToken = otherToken;
    // سفارش را z_unrelated می‌سازد — ولی مجوزِ ساخت ندارد؛ پس با maker می‌سازیم و
    // تفکیل را طوری می‌گذاریم که نماینده همان درخواست‌دهنده باشد.
    const orderId = await createOrder(makerToken);
    const sub = await api(makerToken).post(`/api/v1/orders/${orderId}/request-approval`).send({});
    const reqId = sub.body.approval_request_id as string;

    // تفکیل: checker ⇒ maker (یعنی درخواست‌دهنده نمایندهٔ تأییدکننده است)
    await pool.query(
      `insert into approval_delegation
         (company_id, delegator_id, delegate_id, operation, valid_from, valid_to, reason, created_by)
       values ($1, $2, $3, 'sales.order.approve', now() - interval '1 day', now() + interval '5 days', 'خودتأییدی', $4)`,
      [companyId, checkerUserId, makerUserId, checkerUserId],
    );
    const dec = await api(makerToken)
      .post(`/api/v1/rules-engine/approvals/${reqId}/decision`)
      .send({ step_no: 1, decision: 'approved' });
    expect(dec.status).toBe(403);
    expect(dec.body.code).toBe('self_approval_forbidden');
    void unrelatedToken;
  });

  it('NC-C1 · سیاستِ غیرفعال عملیات را حاکم نمی‌کند (بدونِ سیاست ⇒ سازگاریِ عقب‌رو)', async () => {
    const chain = await createChain(companyId, 'sales_order', [{ step_no: 1, roleId: checkerRoleId }]);
    const pol = await api(adminToken).post('/api/v1/rules-engine/approval-policies').send({
      operation: 'sales.order.approve', scope: 'central', approval_chain_id: chain,
    });
    await api(adminToken).patch(`/api/v1/rules-engine/approval-policies/${pol.body.id}/status`).send({ is_active: false });
    // سیاستِ مرکزی قابلِ غیرفعال‌سازی نیست (کنترلِ حاکمیت) — اگر رد شد، همین انتظار درست است
    const stillActive = await countRows(
      `select count(*)::int as c from approval_policy where company_id = $1 and is_active`,
      [companyId],
    );
    if (stillActive === 0) {
      const orderId = await createOrder(makerToken);
      const res = await api(checkerToken).post(`/api/v1/orders/${orderId}/approve`).send({});
      // بدونِ سیاست، رفتارِ عقب‌رو: تأیید مستقیم مجاز است (خودتأییدی همچنان ممنوع)
      expect(res.status).toBe(200);
    } else {
      const orderId = await createOrder(makerToken);
      const res = await api(checkerToken).post(`/api/v1/orders/${orderId}/approve`).send({});
      expect(res.status).toBe(409);
    }
  });
});

// =====================================================================
// 5 — تاریخِ کسب‌وکار (Phase F)
// =====================================================================
describe('5 — تاریخِ کسب‌وکار', () => {
  it('F-1 · businessToday با منطقهٔ تهران محاسبه می‌شود، نه UTC', () => {
    // ۲۱:۰۰ UTC = ۰۰:۳۰ روزِ بعد به وقتِ تهران
    const at = new Date('2026-11-08T21:00:00Z');
    expect(businessDateOf(at)).toBe('2026-11-09');
    // ۲۰:۰۰ UTC = ۲۳:۳۰ همان روز به وقتِ تهران
    expect(businessDateOf(new Date('2026-11-08T20:00:00Z'))).toBe('2026-11-08');
  });

  it('F-2 · shiftBusinessDate درست جابه‌جا می‌کند', () => {
    expect(shiftBusinessDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftBusinessDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftBusinessDate('2028-02-28', 1)).toBe('2028-02-29'); // کبیسه
  });

  it('F-3 · سفارش با تاریخِ کسب‌وکارِ امروز پذیرفته می‌شود (مستقل از ساعتِ اجرا)', async () => {
    // این آزمون همان باگِ T-1 را می‌بندد: اگر آزمون از toISOString استفاده کند،
    // در پنجرهٔ ۲۰:۳۰–۲۴:۰۰ UTC شکست می‌خورد.
    const orderId = await createOrder(makerToken);
    expect(orderId).toBeTruthy();
  });
});
