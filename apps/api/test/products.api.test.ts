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
 * تست API کالا — CRUD کامل روی دیتابیس موقت «greendms_api_test»:
 * ۱) ساخت دیتابیس از صفر ۲) اجرای همه مهاجرت‌ها ۳) seed حداقلی (شرکت/دسته/واحد)
 * ۴) بالا آوردن واقعی AppModule با همان ValidationPipe سراسری ۵) اسناد HTTP با supertest
 * ۶) حذف دیتابیس در پایان (حتی در حالت شکست).
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_api_test';
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

let companyId: string;
let categoryId: string;
let uomId: string;
let createdId: string;
let token: string;

/**
 * کلاینت واردشده — همه درخواست‌ها با توکن نشست ارسال می‌شوند.
 * نکته supertest v7: request(server) فقط متد HTTP دارد؛ هدر باید روی Testِ
 * ساختهشده توسط متد (get/post/...) ست شود نه روی شیء پایه.
 */
const api = () => {
  const base = request(app.getHttpServer());
  const verb = (method: 'get' | 'post' | 'patch' | 'delete') => (url: string) => {
    const req = base[method](url);
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  };
  return { get: verb('get'), post: verb('post'), patch: verb('patch'), delete: verb('delete') };
};
/** کلاینت بدون ورود — فقط برای آزمون 401 */
const anonApi = () => request(app.getHttpServer());

const ADMIN_USER = 'md_admin';
const ADMIN_PASSWORD = 'S3cret!pass';
/** UUID v4 معتبر (نسخه 4، گونه 8) — برای قیدهای isUUID در DTO و سرویس */
const uuid = () => '11111111-1111-4111-8111-111111111111';

beforeAll(async () => {
  // ۱) دیتابیس موقت تمیز
  adminPool = new pg.Pool({ connectionString: adminUrl.toString(), max: 1 });
  await adminPool.query(
    'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
    [TEST_DB],
  );
  await adminPool.query(`drop database if exists "${TEST_DB}"`);
  await adminPool.query(`create database "${TEST_DB}"`);

  // ۲) همه مهاجرت‌ها در یک تراکنش واحد (معادل psql -1)
  const files = readdirSync(path.join(ROOT, 'migrations'))
    .filter((f) => f.endsWith('.up.sql'))
    .sort()
    .flatMap((f) => ['-f', path.join(ROOT, 'migrations', f)]);
  execFileSync(PSQL, [...psqlBase, '-d', TEST_DB, '-1', '-q', ...files], {
    env: psqlEnv,
    stdio: 'pipe',
  });

  // ۳) حداقل داده وابستگی: شرکت + دسته‌بندی + واحد (واحد از seed مهاجرت 0022)
  pool = new pg.Pool({ connectionString: testUrl.toString(), max: 1 });
  const company = await pool.query<{ id: string }>(
    `insert into company (code, legal_name) values ('TESTCO', 'شرکت تست')
     returning id`,
  );
  companyId = company.rows[0].id;
  const category = await pool.query<{ id: string }>(
    `insert into product_category (company_id, code, name) values ($1, 'BEV', 'نوشیدنی')
     returning id`,
    [companyId],
  );
  categoryId = category.rows[0].id;
  const uom = await pool.query<{ id: string }>(`select id from uom where code = 'pcs'`);
  uomId = uom.rows[0].id;

  // کاربر و نقش با مجوزهای کالا (permission از seed 0022 می‌آید)
  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  const person = await pool.query<{ id: string }>(
    `insert into person (company_id, code, first_name, last_name)
     values ($1, 'ADM-1', 'مدیر', 'سیستم') returning id`,
    [companyId],
  );
  const personId = person.rows[0].id;
  await pool.query(
    `insert into app_user (person_id, username, password_hash, access_level)
     values ($1, $2, $3, 'web')`,
    [personId, ADMIN_USER, passwordHash],
  );
  const role = await pool.query<{ id: string }>(
    `insert into role (company_id, code, name) values ($1, 'tester', 'نقش تست کالا') returning id`,
    [companyId],
  );
  await pool.query(
    `insert into role_permission (role_id, permission_code)
     select $1, code from permission
      where code in ('master.product.view', 'master.product.create', 'master.product.update', 'master.product.status')`,
    [role.rows[0].id],
  );
  // انتساب نقش به کاربر (بدون user_role، PermissionsGuard مجوزی نمی‌بیند → 403)
  await pool.query(
    `insert into user_role (app_user_id, role_id)
     select u.id, $1 from app_user u where u.username = $2`,
    [role.rows[0].id, ADMIN_USER],
  );

  // ۴) اپ واقعی با همان پایپ سراسری (env باید قبل از ساخت Pool تنظیم شود)
  process.env.DATABASE_URL = testUrl.toString();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  // همان پیکربندی main.ts: نسخه‌بندی مسیر + اعتبارسنجی سراسری
  app.setGlobalPrefix('api/v1', { exclude: ['api/health'] });
  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
  await app.init();

  // ورود واقعی برای دریافت توکن نشست
  const login = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ username: ADMIN_USER, password: ADMIN_PASSWORD })
    .expect(200);
  token = login.body.access_token;
  expect(token).toBeTruthy();
}, 180_000);

afterAll(async () => {
  // اول پول اتصال خودِ اپ را ببند تا terminate پشت‌سرش خطای اتصال ندهد
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

const baseProduct = () => ({
  code: 'P-9001',
  name: 'کالای تست آب معدنی نیم‌لیتری',
  category_id: categoryId,
  base_uom_id: uomId,
});

describe('GET /api/v1/products — لیست', () => {
  it('روی دیتابیس خالی آیتم‌های صفحه‌بندی‌شده برمی‌گرداند', async () => {
    const res = await api().get('/api/v1/products').expect(200);
    expect(res.body).toEqual({ items: [], next_cursor: null, has_more: false });
  });

  it('بدون توکن → 401 با قرارداد Error', async () => {
    const res = await anonApi().get('/api/v1/products').expect(401);
    expect(res.body.code).toBe('unauthorized');
    expect(res.body.message_fa).toBeTruthy();
  });

  it('شرکت از نشست می‌آید؛ company_id در query نادیده گرفته می‌شود (درز چندشرکتی ندارد)', async () => {
    const other = await pool.query<{ id: string }>(
      `insert into company (code, legal_name) values ('OTHERCO', 'شرکت دیگر') returning id`,
    );
    await pool.query(
      `insert into product (company_id, code, name, category_id, base_uom_id)
       values ($1, 'P-OTHER', 'کالای شرکت دیگر', $2, $3)`,
      [other.rows[0].id, categoryId, uomId],
    );
    const res = await api()
      .get('/api/v1/products')
      .query({ company_id: other.rows[0].id })
      .expect(200);
    expect(res.body.items.some((p: { code: string }) => p.code === 'P-OTHER')).toBe(false);
  });
});

describe('POST /api/v1/products — اعتبارسنجی', () => {
  it('بدون name پاسخ 400 با کد validation_failed و فیلد فارسی می‌دهد', async () => {
    const res = await api().post('/api/v1/products').send({ code: 'P-X' }).expect(400);
    expect(res.body.code).toBe('validation_failed');
    expect(res.body.message_fa).toContain('نامعتبر');
    expect(res.body.details.fields).toHaveProperty('name');
    // پیام جزئی هر فیلد هم باید فارسی باشد (details قرارداد فارسی بماند)
    expect(res.body.details.fields.name[0]).toMatch(/[\u0600-\u06FF]/);
  });

  it('category_id غیر uuid را رد می‌کند', async () => {
    const res = await api()
      .post('/api/v1/products')
      .send({ ...baseProduct(), category_id: 'not-a-uuid' })
      .expect(400);
    expect(res.body.code).toBe('validation_failed');
    expect(res.body.details.fields).toHaveProperty('category_id');
    expect(res.body.details.fields.category_id[0]).toMatch(/[\u0600-\u06FF]/);
  });
});

describe('POST /api/v1/products — ساخت', () => {
  it('ساخت موفق → 201 با row_version صفر و وضعیت active', async () => {
    const res = await api().post('/api/v1/products').send(baseProduct()).expect(201);
    createdId = res.body.id;
    expect(createdId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.code).toBe('P-9001');
    expect(res.body.status).toBe('active');
    expect(res.body.row_version).toBe(0);
    expect(res.body.distribution_kind).toBe('both'); // مقدار پیش‌فرض DDL
    expect(res.body.created_at).toBeTruthy();
  });

  it('کد تکراری در همان شرکت → 409 duplicate_code', async () => {
    const res = await api().post('/api/v1/products').send(baseProduct()).expect(409);
    expect(res.body.code).toBe('duplicate_code');
    expect(res.body.message_fa).toContain('قبلاً ثبت');
  });

  it('دسته‌بندی متعلق به شرکت دیگر → 400 invalid_category', async () => {
    const res = await api()
      .post('/api/v1/products')
      .send({ ...baseProduct(), code: 'P-9002', category_id: uuid() })
      .expect(400);
    expect(res.body.code).toBe('invalid_category');
  });

  it('انقضادار بدون ردیابی بچ (قید دیتابیس) → 400 check_violation', async () => {
    const res = await api()
      .post('/api/v1/products')
      .send({
        ...baseProduct(),
        code: 'P-9003',
        is_expiry_tracked: true,
        is_batch_tracked: false,
      })
      .expect(400);
    expect(res.body.code).toBe('check_violation');
    expect(res.body.message_fa).toContain('ck_product_batch');
  });
});

describe('GET /api/v1/products/{id}', () => {
  it('شناسه درست → 200', async () => {
    const res = await api().get(`/api/v1/products/${createdId}`).expect(200);
    expect(res.body.code).toBe('P-9001');
  });

  it('ناموجود → 404 با کد not_found', async () => {
    const res = await api().get(`/api/v1/products/${uuid()}`).expect(404);
    expect(res.body.code).toBe('not_found');
  });

  it('شناسه ناقص → 400 با کد invalid_id (فرمت قرارداد، نه پیام پیش‌فرض Nest)', async () => {
    const res = await api().get('/api/v1/products/abc').expect(400);
    expect(res.body.code).toBe('invalid_id');
    expect(res.body.message_fa).toBeTruthy();
  });
});

describe('GET /api/v1/products — فیلترها', () => {
  it('q فقط کالای تطبیق‌آمیز را برمی‌گرداند', async () => {
    const res = await api().get('/api/v1/products').query({ q: 'آب معدنی' }).expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].code).toBe('P-9001');
  });

  it('فیلتر status', async () => {
    const res = await api().get('/api/v1/products').query({ status: 'active' }).expect(200);
    expect(res.body.items.some((p: { code: string }) => p.code === 'P-9001')).toBe(true);
    const none = await api().get('/api/v1/products').query({ status: 'blocked' }).expect(200);
    expect(none.body.items).toHaveLength(0);
  });
});

describe('PATCH /api/v1/products/{id} — قفل خوش‌بینانه', () => {
  it('بروزرسانی نام → 200 و row_version با تریگر trg_touch از ۰ به ۱ می‌رود', async () => {
    const res = await api()
      .patch(`/api/v1/products/${createdId}`)
      .send({ name: 'کالای تست آب معدنی (ویرایش‌شده)' })
      .expect(200);
    expect(res.body.name).toContain('ویرایش‌شده');
    expect(res.body.row_version).toBe(1);
  });

  it('ارسال row_version کهنه → 409 version_conflict', async () => {
    const res = await api()
      .patch(`/api/v1/products/${createdId}`)
      .send({ name: 'تغییر هم‌زمان', row_version: 0 })
      .expect(409);
    expect(res.body.code).toBe('version_conflict');
  });

  it('بدون row_version (ویرایش معمولی) مجاز است', async () => {
    // D4 (مصوبهٔ مالک): تغییرِ وضعیت «حساس» است — بدونِ تأییدِ صریح رد می‌شود
    await api()
      .patch(`/api/v1/products/${createdId}`)
      .send({ status: 'blocked' })
      .expect(400);
    const res = await api()
      .patch(`/api/v1/products/${createdId}`)
      .send({ status: 'blocked', confirm_sensitive: true })
      .expect(200);
    expect(res.body.status).toBe('blocked');
    expect(res.body.row_version).toBe(2);
    // برگرداندن برای تست‌های بعدی
    await api().patch(`/api/v1/products/${createdId}`).send({ status: 'active', confirm_sensitive: true }).expect(200);
  });
});

describe('صفحه‌بندی cursor', () => {
  it('ساخت کالای دوم با کد کوچک‌تر', async () => {
    await api()
      .post('/api/v1/products')
      .send({ ...baseProduct(), code: 'P-9000', name: 'کالای تست دوغ پاکتی' })
      .expect(201);
  });

  it('limit=1 → یک آیتم، has_more و cursor', async () => {
    const res = await api()
      .get('/api/v1/products')
      .query({ q: 'P-90', limit: 1 })
      .expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].code).toBe('P-9000'); // مرتب‌سازی صعودی کد
    expect(res.body.has_more).toBe(true);
    expect(res.body.next_cursor).toBeTruthy();
  });

  it('صفحه دوم با cursor → بدون هم‌پوشانی و پایان', async () => {
    const first = await api()
      .get('/api/v1/products')
      .query({ q: 'P-90', limit: 1 })
      .expect(200);
    const res = await api()
      .get('/api/v1/products')
      .query({ q: 'P-90', limit: 1, cursor: first.body.next_cursor })
      .expect(200);
    expect(res.body.items[0].code).toBe('P-9001');
    expect(res.body.has_more).toBe(false);
    expect(res.body.next_cursor).toBeNull();
  });
});

describe('DELETE /api/v1/products/{id} — حذف نرم', () => {
  it('حذف موفق → 204 بدون بدنه', async () => {
    const list = await api().get('/api/v1/products').query({ q: 'P-9000' }).expect(200);
    const target = list.body.items[0];
    await api().delete(`/api/v1/products/${target.id}`).expect(204);
  });

  it('بعد از حذف، GET → 404 و از لیست هم خارج می‌شود', async () => {
    const list = await api().get('/api/v1/products').query({ q: 'P-9000' }).expect(200);
    expect(list.body.items).toHaveLength(0);
    const gone = await api().delete(`/api/v1/products/${uuid()}`).expect(404);
    expect(gone.body.code).toBe('not_found');
  });
});
