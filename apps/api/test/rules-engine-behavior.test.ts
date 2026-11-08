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
 * بستهٔ رفتاریِ موتورِ قواعد و تأیید — **پیش‌نیازِ G-03** (TASK-24 §E).
 *
 * چرا این فایل پیش از اتصالِ هر عملیاتِ حساسِ قیمت به موتورِ تأیید نوشته شد:
 * G-03 در `GAP_REGISTER.md` یک یافتهٔ HIGH است با شاهدِ «هیچ فایلِ تستِ اختصاصی».
 * اتصالِ تخفیف/قیمت به گردشِ تأییدِ بدونِ آزمون، ریسکِ دور زدنِ تأیید را به مسیرِ
 * مالی منتقل می‌کند. این‌جا گذارِ وضعیت، سطوحِ تایید، رد/تأیید، اولویت/شرطِ قواعد،
 * جداسازیِ اجاره و کنترلِ دسترسی رفتارمحور قفل می‌شود (≥۱۵ سناریو، معیارِ پذیرشِ G-03).
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_rules_behavior_test';
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
let adminToken = '';
let viewerToken = '';
let admin2Token = '';
let companyId = '';
let otherCompanyId = '';
let branchId = '';
let otherBranchId = '';
let customerId = '';
let otherCustomerId = '';
let productId = '';
let adminUserId = '';
let admin2UserId = '';
let viewerUserId = '';

const ADMIN_USER = 'rb_admin';
/** تصمیم‌گیرندهٔ دوم — تأییدِ خود (self approval) در TASK-24F ممنوع شده است */
const ADMIN2_USER = 'rb_admin2';
const VIEWER_USER = 'rb_viewer';
const PASSWORD = 'S3cret!pass';

const api = (token?: string | null) => {
  const base = request(app.getHttpServer());
  const use = token === undefined ? adminToken : token;
  const verb = (method: 'get' | 'post' | 'patch') => (url: string) => {
    const req = base[method](url);
    return use ? req.set('Authorization', `Bearer ${use}`) : req;
  };
  return { get: verb('get'), post: verb('post'), patch: verb('patch') };
};

const login = async (username: string, password: string): Promise<string> => {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ username, password })
    .expect(200);
  return res.body.access_token as string;
};

/** خاموش‌کردنِ همهٔ قواعدِ بازمانده از سناریوی قبلی — هر سناریو مستقل است */
const deactivateAllRules = async (): Promise<void> => {
  const list = await api().get('/api/v1/rules?limit=200').expect(200);
  for (const r of list.body.items ?? []) {
    if (r.is_active) await api().patch(`/api/v1/rules/${r.id}`).send({ is_active: false }).expect(200);
  }
};

const createRule = (over: Record<string, unknown> = {}) =>
  api()
    .post('/api/v1/rules')
    .send({
      code: `R-${Math.random().toString(36).slice(2, 8)}`,
      title: 'قاعدهٔ تست',
      entity: 'sales_order',
      event: 'before_save',
      effect: 'warn',
      message_fa: 'پیامِ تست',
      ...over,
    });

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
  const hash = await hashPassword(PASSWORD);

  const company = await pool.query<{ id: string }>(
    `insert into company (code, legal_name) values ('RBCO', 'شرکت تست قواعد') returning id`,
  );
  companyId = company.rows[0].id;
  const other = await pool.query<{ id: string }>(
    `insert into company (code, legal_name) values ('RBCO2', 'شرکت دوم') returning id`,
  );
  otherCompanyId = other.rows[0].id;

  branchId = (
    await pool.query<{ id: string }>(
      `insert into branch (company_id, code, name) values ($1, 'MAIN', 'شعبه مرکزی') returning id`,
      [companyId],
    )
  ).rows[0].id;
  otherBranchId = (
    await pool.query<{ id: string }>(
      `insert into branch (company_id, code, name) values ($1, 'MAIN', 'شعبه دوم') returning id`,
      [otherCompanyId],
    )
  ).rows[0].id;

  const uom = await pool.query<{ id: string }>(`select id from uom where code = 'pcs'`);
  const category = await pool.query<{ id: string }>(
    `insert into product_category (company_id, code, name) values ($1, 'CAT', 'دسته') returning id`,
    [companyId],
  );
  productId = (
    await pool.query<{ id: string }>(
      `insert into product (company_id, code, name, category_id, base_uom_id)
       values ($1, 'P-1', 'کالا', $2, $3) returning id`,
      [companyId, category.rows[0].id, uom.rows[0].id],
    )
  ).rows[0].id;

  const customerPerson = await pool.query<{ id: string }>(
    `insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, 'CU-1', 'natural', 'مشتری', 'تست') returning id`,
    [companyId],
  );
  customerId = (
    await pool.query<{ id: string }>(
      `insert into customer (person_id, branch_id, code) values ($1, $2, 'C-1') returning id`,
      [customerPerson.rows[0].id, branchId],
    )
  ).rows[0].id;

  const otherPerson = await pool.query<{ id: string }>(
    `insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, 'CU-2', 'natural', 'مشتری', 'دوم') returning id`,
    [otherCompanyId],
  );
  otherCustomerId = (
    await pool.query<{ id: string }>(
      `insert into customer (person_id, branch_id, code) values ($1, $2, 'C-1') returning id`,
      [otherPerson.rows[0].id, otherBranchId],
    )
  ).rows[0].id;

  const adminPerson = await pool.query<{ id: string }>(
    `insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, 'ADM-1', 'natural', 'مدیر', 'قواعد') returning id`,
    [companyId],
  );
  adminUserId = (
    await pool.query<{ id: string }>(
      `insert into app_user (person_id, username, password_hash, access_level)
       values ($1, $2, $3, 'web') returning id`,
      [adminPerson.rows[0].id, ADMIN_USER, hash],
    )
  ).rows[0].id;

  const viewerPerson = await pool.query<{ id: string }>(
    `insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, 'VW-1', 'natural', 'بیننده', 'قواعد') returning id`,
    [companyId],
  );
  viewerUserId = (
    await pool.query<{ id: string }>(
      `insert into app_user (person_id, username, password_hash, access_level)
       values ($1, $2, $3, 'web') returning id`,
      [viewerPerson.rows[0].id, VIEWER_USER, hash],
    )
  ).rows[0].id;

  const adminRole = await pool.query<{ id: string }>(
    `insert into role (company_id, code, name) values ($1, 'admin_full', 'مدیر کامل') returning id`,
    [companyId],
  );
  await pool.query(`insert into role_permission (role_id, permission_code) select $1, code from permission`, [
    adminRole.rows[0].id,
  ]);
  await pool.query(`insert into user_role (app_user_id, role_id) values ($1, $2)`, [
    adminUserId,
    adminRole.rows[0].id,
  ]);

  const viewerRole = await pool.query<{ id: string }>(
    `insert into role (company_id, code, name) values ($1, 'viewer', 'بیننده') returning id`,
    [companyId],
  );
  await pool.query(
    `insert into role_permission (role_id, permission_code)
     select $1, code from permission where code in ('rules.view', 'sales.order.view')`,
    [viewerRole.rows[0].id],
  );
  await pool.query(`insert into user_role (app_user_id, role_id) values ($1, $2)`, [
    viewerUserId,
    viewerRole.rows[0].id,
  ]);

  process.env.DATABASE_URL = testUrl.toString();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1', { exclude: ['api/health'] });
  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
  await app.init();

  const admin2Person = await pool.query<{ id: string }>(
    `insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, 'ADM-2', 'natural', 'مدیر', 'دوم') returning id`,
    [companyId],
  );
  admin2UserId = (
    await pool.query<{ id: string }>(
      `insert into app_user (person_id, username, password_hash, access_level)
       values ($1, $2, $3, 'web') returning id`,
      [admin2Person.rows[0].id, ADMIN2_USER, hash],
    )
  ).rows[0].id;
  await pool.query(`insert into user_role (app_user_id, role_id) values ($1, $2)`, [
    admin2UserId,
    adminRole.rows[0].id,
  ]);

  adminToken = await login(ADMIN_USER, PASSWORD);
  viewerToken = await login(VIEWER_USER, PASSWORD);
  admin2Token = await login(ADMIN2_USER, PASSWORD);
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

// ---------------------------------------------------------------
// §1  CRUD و اعتبارسنجیِ قاعده
// ---------------------------------------------------------------

describe('G03-01..05 — چرخهٔ عمرِ قاعده', () => {
  it('create → 201 با شناسه و شرط/اکشن‌های بازگردانده‌شده', async () => {
    const res = await createRule({
      code: 'R-BASE',
      title: 'قاعدهٔ پایه',
      conditions: [{ group_no: 1, field: 'grand_total', operator: 'gt', value: 1000 }],
      actions: [{ action_type: 'send_sms', params: { to: 'x' } }],
    }).expect(201);
    expect(res.body.code).toBe('R-BASE');
    expect(res.body.effect).toBe('warn');
    expect(res.body.conditions).toHaveLength(1);
    expect(res.body.actions[0].action_type).toBe('send_sms');

    const got = await api().get(`/api/v1/rules/${res.body.id}`).expect(200);
    expect(got.body.id).toBe(res.body.id);
  });

  it('فهرستِ صفحه‌بندی‌شده شاملِ قاعدهٔ ساخته‌شده', async () => {
    const res = await api().get('/api/v1/rules?limit=50').expect(200);
    expect(res.body.items.map((r: { code: string }) => r.code)).toContain('R-BASE');
  });

  it('PATCH اثر/پیام را تغییر می‌دهد', async () => {
    const created = await createRule({ code: 'R-PATCH' }).expect(201);
    const patched = await api()
      .patch(`/api/v1/rules/${created.body.id}`)
      .send({ effect: 'block', message_fa: 'مسدود' })
      .expect(200);
    expect(patched.body.effect).toBe('block');
    expect(patched.body.message_fa).toBe('مسدود');
  });

  it('اثرِ نامعتبر → 400 validation_failed', async () => {
    const res = await createRule({ effect: 'not_a_effect' }).expect(400);
    expect(res.body.code).toBe('validation_failed');
  });

  it('کدِ تکراری → 409', async () => {
    await createRule({ code: 'R-DUP' }).expect(201);
    const dup = await createRule({ code: 'R-DUP' });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('duplicate_code');
  });
});

// ---------------------------------------------------------------
// §2  ارزیابیِ واقعی در جریانِ سفارش
// ---------------------------------------------------------------

const orderBody = (over: Record<string, unknown> = {}) => ({
  customer_id: customerId,
  order_date: new Date().toISOString().slice(0, 10),
  lines: [{ product_id: productId, qty: 1, unit_price: '5000', discount_amount: '0' }],
  // TASK-24F: قیمتِ دستیِ واگرا بدونِ دلیلِ صریح پذیرفته نمی‌شود (مسیرِ یگانهٔ موتورِ قیمت)
  price_override_reason: 'توافقِ قیمتِ آزمونِ قواعد',
  ...over,
});

describe('G03-06..12 — ارزیابیِ قاعده روی سفارش', () => {
  it('قاعدهٔ block ⇒ سفارش 400 rule_blocked با پیامِ فارسیِ قاعده', async () => {
    await deactivateAllRules();
    await createRule({
      code: 'R-BLOCK',
      effect: 'block',
      message_fa: 'سفارشِ بالای سقف مسدود است',
      conditions: [{ group_no: 1, field: 'grand_total', operator: 'gte', value: 1000 }],
    }).expect(201);
    const res = await api().post('/api/v1/orders').send(orderBody()).expect(400);
    expect(res.body.code).toBe('rule_blocked');
    expect(res.body.message_fa).toBe('سفارشِ بالای سقف مسدود است');
  });

  it('قاعدهٔ require_approval ⇒ سفارش 409 require_approval (بدونِ دور زدن)', async () => {
    await deactivateAllRules();
    const rule = await createRule({
      code: 'R-APPROVAL',
      effect: 'require_approval',
      message_fa: 'نیازمندِ تأییدِ مدیر',
      conditions: [{ group_no: 1, field: 'subtotal', operator: 'gt', value: 100 }],
    }).expect(201);
    expect(rule.body.effect).toBe('require_approval');
    const res = await api().post('/api/v1/orders').send(orderBody()).expect(409);
    expect(res.body.code).toBe('require_approval');
  });

  it('قاعدهٔ warn ⇒ سفارش ثبت می‌شود (جریان متوقف نمی‌شود)', async () => {
    await deactivateAllRules();
    await createRule({
      code: 'R-WARN',
      effect: 'warn',
      conditions: [{ group_no: 1, field: 'grand_total', operator: 'gt', value: 1 }],
    }).expect(201);
    const res = await api().post('/api/v1/orders').send(orderBody()).expect(201);
    expect(res.body.grand_total).toBeDefined();
  });

  it('شرطِ نامطابق، قاعده را اجرا نمی‌کند (gt)', async () => {
    await deactivateAllRules();
    await createRule({
      code: 'R-NOMATCH',
      effect: 'block',
      message_fa: 'نباید اجرا شود',
      conditions: [{ group_no: 1, field: 'grand_total', operator: 'gt', value: 999_999_999 }],
    }).expect(201);
    await api().post('/api/v1/orders').send(orderBody()).expect(201);
  });

  it('قاعدهٔ غیرفعال ارزیابی نمی‌شود', async () => {
    await deactivateAllRules();
    const created = await createRule({
      code: 'R-INACTIVE',
      effect: 'block',
      message_fa: 'غیرفعال',
      is_active: false,
      conditions: [{ group_no: 1, field: 'grand_total', operator: 'gte', value: 0 }],
    }).expect(201);
    expect(created.body.is_active).toBe(false);
    await api().post('/api/v1/orders').send(orderBody()).expect(201);
  });

  it('OR بین گروه‌ها و AND درونِ گروه (یک شرطِ نادرست گروه را رد می‌کند)', async () => {
    await deactivateAllRules();
    await createRule({
      code: 'R-GROUPS',
      effect: 'block',
      message_fa: 'گروه‌ها',
      conditions: [
        { group_no: 1, field: 'grand_total', operator: 'gt', value: 1 },
        { group_no: 1, field: 'discount_pct', operator: 'gt', value: 90 },
        { group_no: 2, field: 'line_count', operator: 'gte', value: 1 },
      ],
    }).expect(201);
    // گروه ۱ نادرست (شرط دوم)، گروه ۲ درست ⇒ منطبق (OR) ⇒ مسدود
    const blocked = await api().post('/api/v1/orders').send(orderBody()).expect(400);
    expect(blocked.body.code).toBe('rule_blocked');
  });

  it('قاعدهٔ منقضی ارزیابی نمی‌شود (valid_to)', async () => {
    await deactivateAllRules();
    await createRule({
      code: 'R-EXPIRED',
      effect: 'block',
      message_fa: 'منقضی',
      valid_from: '2020-01-01',
      valid_to: '2020-12-31',
      conditions: [{ group_no: 1, field: 'grand_total', operator: 'gte', value: 0 }],
    }).expect(201);
    await api().post('/api/v1/orders').send(orderBody()).expect(201);
  });
});

// ---------------------------------------------------------------
// §3  گردشِ تأیید
// ---------------------------------------------------------------

const seedChain = async (code: string, entity: string, steps: { step_no: number; min?: number | null; max?: number | null }[]) => {
  const chain = await pool.query<{ id: string }>(
    `insert into approval_chain (company_id, code, entity, is_active) values ($1,$2,$3,true) returning id`,
    [companyId, code, entity],
  );
  for (const s of steps) {
    await pool.query(
      `insert into approval_step_def (approval_chain_id, step_no, min_amount, max_amount)
       values ($1,$2,$3,$4)`,
      [chain.rows[0].id, s.step_no, s.min ?? null, s.max ?? null],
    );
  }
  return chain.rows[0].id;
};

const createApproval = (chainId: string, entityId: string, amount: number | null) =>
  api()
    .post('/api/v1/rules-engine/approvals')
    .send({
      approval_chain_id: chainId,
      entity_type: 'sales_order',
      entity_id: entityId,
      requested_by: adminUserId,
      amount,
    });

describe('G03-13..19 — گردشِ تأیید و کنترلِ دسترسی', () => {
  it('ساختِ درخواست با گامِ درست بر اساسِ مبلغ', async () => {
    const chainId = await seedChain('CH-AMOUNT', 'sales_order', [
      { step_no: 1, min: 0, max: 1000 },
      { step_no: 2, min: 1000, max: null },
    ]);
    const req = await createApproval(chainId, '11111111-1111-4111-8111-111111111111', 2500).expect(201);
    expect(req.body.current_step).toBe(2);
    expect(req.body.status).toBe('pending');
  });

  it('تأییدِ دو‌مرحله‌ای: مرحله ۱ ⇒ pending/step 2، مرحله ۲ ⇒ approved', async () => {
    const chainId = await seedChain('CH-TWO', 'sales_order', [{ step_no: 1 }, { step_no: 2 }]);
    const req = await createApproval(chainId, '22222222-2222-4222-8222-222222222222', 500).expect(201);
    const id = req.body.id as string;
    const step1 = await api(admin2Token)
      .post(`/api/v1/approvals/${id}/decision`)
      .send({ decision: 'approve' })
      .expect(201);
    expect(step1.body.status).toBe('pending');
    expect(step1.body.current_step).toBe(2);
    const step2 = await api(admin2Token)
      .post(`/api/v1/approvals/${id}/decision`)
      .send({ decision: 'approve' })
      .expect(201);
    expect(step2.body.status).toBe('approved');
    expect(step2.body.closed_at).toBeTruthy();
    // مسیرِ جزئیات در قرارداد `/rules-engine/approvals/{id}` است (نه `/approvals/{id}`)
    const decisions = await api().get(`/api/v1/rules-engine/approvals/${id}`).expect(200);
    expect(decisions.body.decisions).toHaveLength(2);
    expect(decisions.body.decisions.map((d: { decision: string }) => d.decision).sort()).toEqual([
      'approved',
      'approved',
    ]);
  });

  it('رد ⇒ rejected و بسته‌شدنِ فوری', async () => {
    const chainId = await seedChain('CH-REJECT', 'sales_order', [{ step_no: 1 }, { step_no: 2 }]);
    const req = await createApproval(chainId, '33333333-3333-4333-8333-333333333333', 100).expect(201);
    const res = await api(admin2Token)
      .post(`/api/v1/approvals/${req.body.id}/decision`)
      .send({ decision: 'reject', note: 'دلیلِ رد' })
      .expect(201);
    expect(res.body.status).toBe('rejected');
  });

  it('تصمیم روی درخواستِ بسته‌شده ⇒ 409 not_pending', async () => {
    const chainId = await seedChain('CH-CLOSED', 'sales_order', [{ step_no: 1 }]);
    const req = await createApproval(chainId, '44444444-4444-4444-8444-444444444444', 10).expect(201);
    await api(admin2Token)
      .post(`/api/v1/approvals/${req.body.id}/decision`)
      .send({ decision: 'approve' })
      .expect(201);
    const again = await api(admin2Token)
      .post(`/api/v1/approvals/${req.body.id}/decision`)
      .send({ decision: 'approve' })
      .expect(409);
    expect(again.body.code).toBe('not_pending');
  });

  it('بدونِ مجوزِ rules.approval.decide ⇒ 403', async () => {
    const chainId = await seedChain('CH-RBAC', 'sales_order', [{ step_no: 1 }]);
    const req = await createApproval(chainId, '55555555-5555-4555-8555-555555555555', 10).expect(201);
    const res = await api(viewerToken)
      .post(`/api/v1/approvals/${req.body.id}/decision`)
      .send({ decision: 'approve' })
      .expect(403);
    expect(res.body.code).toBe('forbidden');
  });

  it('دو درخواستِ باز برای یک موجودیت مجاز نیست (ایندکسِ یکتا)', async () => {
    const chainId = await seedChain('CH-UNIQ', 'sales_order', [{ step_no: 1 }]);
    const entityId = '66666666-6666-4666-8666-666666666666';
    await createApproval(chainId, entityId, 10).expect(201);
    const dup = await createApproval(chainId, entityId, 20);
    expect(dup.status).toBeGreaterThanOrEqual(400);
  });

  it('زنجیرهٔ ناموجود ⇒ 404 و شناسهٔ نامعتبر ⇒ 400', async () => {
    const missingChain = await createApproval('77777777-7777-4777-8777-777777777777', '88888888-8888-4888-8888-888888888888', 1);
    expect(missingChain.status).toBe(404);
    // شناسهٔ نامعتبر به‌صورتِ «یافت‌نشد» پاسخ می‌گیرد (بدونِ افشایِ ساختارِ داخلی)
    const badId = await api().get('/api/v1/rules-engine/approvals/not-a-uuid').expect(404);
    expect(badId.body.code).toBe('not_found');
  });

  // TASK-24V · G-23 — رگرسیونِ «قفل‌شدنِ زنجیرهٔ چندمرحله‌ای»:
  // پیش‌تر در هر تصمیم، گام از روی باندِ مبلغ بازمحاسبه می‌شد و چون findCurrentStep همیشه
  // نخستین گامِ سازگار را برمی‌گرداند، گامِ ۲ در زنجیرهٔ بی‌باند هرگز قابلِ تصمیم نبود (۴۰۹ دائمی).
  it('زنجیرهٔ بی‌باندِ دو‌مرحله‌ای تا انتها پیش می‌رود و گام‌ها به‌ترتیب مصرف می‌شوند', async () => {
    const chainId = await seedChain('CH-NOBAND', 'sales_order', [{ step_no: 1 }, { step_no: 2 }]);
    const req = await createApproval(chainId, '99999999-9999-4999-8999-999999999901', 777).expect(201);
    const first = await api(admin2Token)
      .post(`/api/v1/approvals/${req.body.id}/decision`)
      .send({ decision: 'approve' })
      .expect(201);
    expect(first.body.current_step).toBe(2);
    expect(first.body.status).toBe('pending');
    const second = await api(admin2Token)
      .post(`/api/v1/approvals/${req.body.id}/decision`)
      .send({ decision: 'approve' })
      .expect(201);
    expect(second.body.status).toBe('approved');
    // ناسازگاریِ باند نباید به‌عنوان ۴۰۹ در گام‌های بعدی برگردد
    expect(second.body.code).toBeUndefined();
  });

  it('زنجیرهٔ تشدیدِ باندی (۰..۱۰۰۰ / ۱۰۰۰..۵۰۰۰ / ۵۰۰۰..∞) با مبلغِ ۲۵۰۰ در همهٔ گام‌ها کامل می‌شود', async () => {
    const chainId = await seedChain('CH-LADDER', 'sales_order', [
      { step_no: 1, min: 0, max: 1000 },
      { step_no: 2, min: 1000, max: 5000 },
      { step_no: 3, min: 5000, max: null },
    ]);
    const req = await createApproval(chainId, '99999999-9999-4999-8999-999999999902', 2500).expect(201);
    // گامِ ورود برای ۲۵۰۰ گامِ ۲ است
    expect(req.body.current_step).toBe(2);
    const d1 = await api(admin2Token)
      .post(`/api/v1/approvals/${req.body.id}/decision`)
      .send({ decision: 'approve' })
      .expect(201);
    expect(d1.body.current_step).toBe(3);
    const d2 = await api(admin2Token)
      .post(`/api/v1/approvals/${req.body.id}/decision`)
      .send({ decision: 'approve' })
      .expect(201);
    expect(d2.body.status).toBe('approved');
  });

  it('مبلغِ دستکاری‌شده پس از ثبت (در نخستین تصمیم) با ۴۰۹ amount_band_mismatch رد می‌شود', async () => {
    const chainId = await seedChain('CH-TAMPER', 'sales_order', [
      { step_no: 1, min: 0, max: 1000 },
      { step_no: 2, min: 1000, max: null },
    ]);
    const req = await createApproval(chainId, '99999999-9999-4999-8999-999999999903', 100).expect(201);
    expect(req.body.current_step).toBe(1);
    // افزایشِ مبلغ به باندِ گامِ ۲ ⇒ گامِ جاری (۱) دیگر پاسخِ باند نیست ⇒ fail-closed
    await pool.query(`update approval_request set amount = 9000 where id = $1`, [req.body.id]);
    const res = await api(admin2Token)
      .post(`/api/v1/approvals/${req.body.id}/decision`)
      .send({ decision: 'approve' })
      .expect(409);
    expect(res.body.code).toBe('amount_band_mismatch');
    expect(res.body.details?.expected_step).toBe(2);
  });
});

// ---------------------------------------------------------------
// §4  جداسازیِ اجاره و استثناها
// ---------------------------------------------------------------

describe('G03-20..23 — جداسازیِ اجاره و استثنا', () => {
  it('قاعدهٔ شرکتِ دیگر برای این شرکت قابلِ مشاهده نیست (404)', async () => {
    const foreign = await pool.query<{ id: string }>(
      `insert into rule (company_id, code, title, entity, event, effect, message_fa, valid)
       values ($1, 'FOREIGN', 'بیگانه', 'sales_order', 'before_save', 'warn', 'بیگانه',
               daterange(current_date, null)) returning id`,
      [otherCompanyId],
    );
    const res = await api().get(`/api/v1/rules/${foreign.rows[0].id}`).expect(404);
    expect(res.body.code).toBe('not_found');
  });

  it('درخواستِ تأییدِ شرکتِ دیگر از مسیرِ این شرکت دیده نمی‌شود (404)', async () => {
    const foreignChain = await pool.query<{ id: string }>(
      `insert into approval_chain (company_id, code, entity) values ($1, 'FOREIGN-CH', 'sales_order') returning id`,
      [otherCompanyId],
    );
    const foreignReq = await pool.query<{ id: string }>(
      `insert into approval_request (approval_chain_id, entity_type, entity_id, requested_by)
       values ($1, 'sales_order', gen_random_uuid(), gen_random_uuid()) returning id`,
      [foreignChain.rows[0].id],
    );
    // مسیرِ واقعیِ جزئیات: /rules-engine/approvals/{id} — مسیرِ `/approvals/{id}` در قرارداد وجود ندارد
    const res = await api().get(`/api/v1/rules-engine/approvals/${foreignReq.rows[0].id}`).expect(404);
    expect(res.body.code).toBe('not_found');
  });

  it('ثبت و فهرستِ آیتمِ استثنا (exception-item) کار می‌کند', async () => {
    const created = await api()
      .post('/api/v1/rules-engine/exception-items')
      .send({ branch_id: branchId, kind: 'discount_override', severity: 'high', params: { note: 'تست' } })
      .expect(201);
    expect(created.body.id ?? created.body.branch_id).toBeDefined();
    const list = await api().get(`/api/v1/rules-engine/exception-items?branch_id=${branchId}`).expect(200);
    const items = Array.isArray(list.body) ? list.body : (list.body.items ?? []);
    expect(items.length).toBeGreaterThan(0);
  });

  it('شعبهٔ شرکتِ دیگر در فهرستِ استثنا ⇒ 404 (بدونِ افشا)', async () => {
    const res = await api().get(`/api/v1/rules-engine/exception-items?branch_id=${otherBranchId}`).expect(404);
    expect(res.body.code).toBe('not_found');
  });

  it('مشتری/سفارشِ شرکتِ دیگر در ثبتِ سفارش پذیرفته نمی‌شود', async () => {
    const res = await api()
      .post('/api/v1/orders')
      .send({
        customer_id: otherCustomerId,
        order_date: new Date().toISOString().slice(0, 10),
        lines: [{ product_id: productId, qty: 1, unit_price: '100' }],
      })
      .expect(400);
    expect(res.body.code).toBe('customer_not_found');
  });
});
