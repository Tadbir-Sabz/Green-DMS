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
 * تست API اشخاص — /persons با همان گاردهای ماژول (AuthGuard + PermissionsGuard
 * روی master.person.view/create/update):
 * ۱) ساخت دیتابیس موقت «greendms_persons_test» از صفر + همه مهاجرت‌ها
 * ۲) seed حداقلی: دو شرکت (برای اثبات جداسازی)، ادمینِ دارای مجوز، کاربر فاقد مجوز
 * ۳) بالا آوردن واقعی AppModule با همان ValidationPipe سراسری
 * ۴) اسناد HTTP با supertest و حذف دیتابیس در پایان (حتی در حالت شکست)
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_persons_test';
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

const ADMIN_USER = 'person_admin';
const ADMIN_PASSWORD = 'S3cret!pass';
const VIEWER_USER = 'person_viewer';
const VIEWER_PASSWORD = 'View!pass1';

let adminToken = '';
let viewerToken = '';
let naturalPersonId = '';
let legalPersonId = '';

interface PersonBody {
  id: string;
  code: string;
  legal_type: string;
  first_name?: string | null;
  last_name?: string | null;
  legal_name?: string | null;
  national_id?: string | null;
  economic_code?: string | null;
  is_active: boolean;
  created_at: string;
}

/** کلاینت HTTP؛ بدون آرگومان با توکن ادمین، با null بدون توکن (آزمون 401) */
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

  // ۳) seed حداقلی
  pool = new pg.Pool({ connectionString: testUrl.toString(), max: 1 });
  const adminHash = await hashPassword(ADMIN_PASSWORD);
  const viewerHash = await hashPassword(VIEWER_PASSWORD);

  const company = await pool.query<{ id: string }>(
    `insert into company (code, legal_name) values ('PERSONCO', 'شرکت تست اشخاص') returning id`,
  );
  const companyId = company.rows[0].id;

  // شرکت دیگر با شخص خودش — برای اثبات جداسازی چندشرکتی
  const other = await pool.query<{ id: string }>(
    `insert into company (code, legal_name) values ('OTHERCO', 'شرکت دیگر') returning id`,
  );
  const otherCompanyId = other.rows[0].id;
  await pool.query(
    `insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, 'FOREIGN-1', 'natural', 'خارجی', 'شرکت دیگر')`,
    [otherCompanyId],
  );

  // ادمین با همه مجوزها (permission از seed مهاجرت 0022 می‌آید)
  const adminPerson = await pool.query<{ id: string }>(
    `insert into person (company_id, code, legal_type, first_name, last_name)
     values ($1, 'ADM-1', 'natural', 'مدیر', 'سیستم') returning id`,
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
    `insert into role_permission (role_id, permission_code)
     select $1, code from permission`,
    [adminRole.rows[0].id],
  );
  await pool.query(
    `insert into user_role (app_user_id, role_id)
     select u.id, $1 from app_user u where u.username = $2`,
    [adminRole.rows[0].id, ADMIN_USER],
  );

  // کاربر فاقد مجوزهای اشخاص (برای آزمون 403)
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
     values ($1, 'VW-1', 'natural', 'بیننده', 'آزمایشی') returning id`,
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

  // ۴) اپ واقعی با همان پایپ سراسری
  process.env.DATABASE_URL = testUrl.toString();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1', { exclude: ['api/health'] });
  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
  await app.init();

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
});

describe('GET /persons — فهرست و جست‌وجو', () => {
  it('بدون توکن 401', async () => {
    await api(null).get('/api/v1/persons').expect(401);
  });

  it('بدون مجوز 403 با کد فارسی', async () => {
    const res = await api(viewerToken).get('/api/v1/persons').expect(403);
    expect(res.body.code).toBe('forbidden');
    expect(res.body.message_fa).toContain('master.person.view');
  });

  it('لیست 200 ← Page با next_cursor/has_more و اشخاص شرکت نشست', async () => {
    const res = await api().get('/api/v1/persons').expect(200);
    expect(res.body).toHaveProperty('next_cursor');
    expect(res.body).toHaveProperty('has_more');
    expect(Array.isArray(res.body.items)).toBe(true);
    // فقط شخصِ همین شرکت (پیش‌نویس ADM-1) دیده می‌شود
    const codes = res.body.items.map((p: PersonBody) => p.code);
    expect(codes).toContain('ADM-1');
    expect(codes).not.toContain('FOREIGN-1');
    // فیلدهای readOnly سرور تولید می‌کند
    expect(res.body.items[0]).toHaveProperty('id');
    expect(res.body.items[0]).toHaveProperty('created_at');
    expect(res.body.items[0]).not.toHaveProperty('deleted_at');
    expect(res.body.items[0]).not.toHaveProperty('row_version');
  });

  it('فیلتر legal_type و جست‌وجوی q', async () => {
    const legal = await api()
      .get('/api/v1/persons')
      .query({ legal_type: 'legal' })
      .expect(200);
    expect(
      legal.body.items.every((p: PersonBody) => p.legal_type === 'legal'),
    ).toBe(true);

    const search = await api().get('/api/v1/persons').query({ q: 'مدیر' }).expect(200);
    expect(
      search.body.items.some(
        (p: PersonBody) => (p.first_name ?? '').includes('مدیر') || (p.last_name ?? '').includes('مدیر'),
      ),
    ).toBe(true);
  });

  it('فیلتر legal_type نامعتبر 400 با پیام فارسی فیلد', async () => {
    const res = await api()
      .get('/api/v1/persons')
      .query({ legal_type: 'real' })
      .expect(400);
    expect(res.body.code).toBe('validation_failed');
    expect(res.body.details.fields.legal_type[0]).toMatch(/[؀-ۿ]/);
  });

  it('صفحه‌بندی cursor: limit=1 ← has_more و صفحه بعد', async () => {
    const first = await api().get('/api/v1/persons').query({ limit: 1 }).expect(200);
    expect(first.body.items).toHaveLength(1);
    expect(first.body.has_more).toBe(true);
    expect(typeof first.body.next_cursor).toBe('string');

    const second = await api()
      .get('/api/v1/persons')
      .query({ limit: 1, cursor: first.body.next_cursor })
      .expect(200);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.items[0].code).not.toBe(first.body.items[0].code);
  });
});

describe('POST /persons — ساخت شخص', () => {
  it('شخص حقیقی 201', async () => {
    const res = await api()
      .post('/api/v1/persons')
      .send({
        code: 'C-100',
        legal_type: 'natural',
        first_name: 'سارا',
        last_name: 'مرادی',
        national_id: '0084575941',
      })
      .expect(201);
    naturalPersonId = res.body.id;
    expect(res.body.code).toBe('C-100');
    expect(res.body.legal_type).toBe('natural');
    expect(res.body.is_active).toBe(true);
    expect(res.body).not.toHaveProperty('deleted_at');
  });

  it('شخص حقوقی 201 با کد اقتصادی', async () => {
    const res = await api()
      .post('/api/v1/persons')
      .send({
        code: 'L-100',
        legal_type: 'legal',
        legal_name: 'شرکت پخش نمونه',
        economic_code: '411377665512',
      })
      .expect(201);
    legalPersonId = res.body.id;
    expect(res.body.legal_type).toBe('legal');
    expect(res.body.legal_name).toBe('شرکت پخش نمونه');
  });

  it('بدون توکن 401 و بدون مجوز 403', async () => {
    await api(null)
      .post('/api/v1/persons')
      .send({ code: 'X-1', legal_type: 'natural', first_name: 'نام' })
      .expect(401);
    await api(viewerToken)
      .post('/api/v1/persons')
      .send({ code: 'X-1', legal_type: 'natural', first_name: 'نام' })
      .expect(403);
  });

  it('بدون legal_type 400 ← فیلد الزامی فارسی', async () => {
    const res = await api().post('/api/v1/persons').send({ code: 'X-2' }).expect(400);
    expect(res.body.code).toBe('validation_failed');
    expect(res.body.details.fields.legal_type[0]).toContain('الزامی');
  });

  it('بدون کد 400 ← فیلد الزامی فارسی', async () => {
    const res = await api()
      .post('/api/v1/persons')
      .send({ legal_type: 'natural', first_name: 'بدون' })
      .expect(400);
    expect(res.body.details.fields.code[0]).toContain('الزامی');
  });

  it('کد تکراری در شرکت 409 duplicate_code', async () => {
    const res = await api()
      .post('/api/v1/persons')
      .send({ code: 'C-100', legal_type: 'natural', first_name: 'تکراری' })
      .expect(409);
    expect(res.body.code).toBe('duplicate_code');
    expect(res.body.message_fa).toMatch(/[؀-ۿ]/);
  });

  it('شناسه ملی تکراری 409 duplicate_national_id', async () => {
    const res = await api()
      .post('/api/v1/persons')
      .send({
        code: 'C-101',
        legal_type: 'natural',
        first_name: 'کپی',
        national_id: '0084575941',
      })
      .expect(409);
    expect(res.body.code).toBe('duplicate_national_id');
  });

  it('حقوقی بدون نام حقوقی 400 با جزئیات فیلد', async () => {
    const res = await api()
      .post('/api/v1/persons')
      .send({ code: 'L-101', legal_type: 'legal' })
      .expect(400);
    expect(res.body.code).toBe('missing_legal_name');
    expect(res.body.details.fields.legal_name).toBeTruthy();
  });

  it('حقیقی بدون هیچ نامی 400 با جزئیات فیلد', async () => {
    const res = await api()
      .post('/api/v1/persons')
      .send({ code: 'C-102', legal_type: 'natural' })
      .expect(400);
    expect(res.body.code).toBe('missing_name');
    expect(res.body.details.fields.first_name).toBeTruthy();
  });
});

describe('GET/PATCH /persons/{id} — جزئیات و ویرایش', () => {
  it('جزئیات 200 و شناسه ناموجود 404 و شناسه نامعتبر 400', async () => {
    const ok = await api().get(`/api/v1/persons/${naturalPersonId}`).expect(200);
    expect(ok.body.code).toBe('C-100');

    await api()
      .get('/api/v1/persons/11111111-1111-4111-8111-111111111111')
      .expect(404);
    const bad = await api().get('/api/v1/persons/not-a-uuid').expect(400);
    expect(bad.body.code).toBe('invalid_id');
  });

  it('شخص شرکت دیگر با توکن این شرکت 404 (جداسازی چندشرکتی)', async () => {
    const foreign = await pool.query<{ id: string }>(
      `select id from person where code = 'FOREIGN-1'`,
    );
    await api().get(`/api/v1/persons/${foreign.rows[0].id}`).expect(404);
    await api()
      .patch(`/api/v1/persons/${foreign.rows[0].id}`)
      .send({ first_name: 'دست‌کاری' })
      .expect(404);
  });

  it('ویرایش 200 ← فیلدها اعمال می‌شوند', async () => {
    const res = await api()
      .patch(`/api/v1/persons/${naturalPersonId}`)
      .send({ last_name: 'مرادی‌فرد', is_active: false, economic_code: '1234567890' })
      .expect(200);
    expect(res.body.last_name).toBe('مرادی‌فرد');
    expect(res.body.is_active).toBe(false);
    expect(res.body.economic_code).toBe('1234567890');
    expect(res.body.first_name).toBe('سارا'); // فیلدهای ارسال‌نشده دست نمی‌خورند
  });

  it('تغییر نوع به حقوقی بدون نام حقوقی 400 ← قاعده نام روی وضعیت ادغام‌شده', async () => {
    const res = await api()
      .patch(`/api/v1/persons/${naturalPersonId}`)
      .send({ legal_type: 'legal' })
      .expect(400);
    expect(res.body.code).toBe('missing_legal_name');
  });

  it('پاک‌کردن فیلد با null ← 200 و مقدار null در پاسخ', async () => {
    const res = await api()
      .patch(`/api/v1/persons/${naturalPersonId}`)
      .send({ national_id: null, economic_code: null })
      .expect(200);
    expect(res.body.national_id).toBeNull();
    expect(res.body.economic_code).toBeNull();
    expect(res.body.first_name).toBe('سارا');
  });

  it('بدون مجوز 403', async () => {
    await api(viewerToken)
      .patch(`/api/v1/persons/${naturalPersonId}`)
      .send({ first_name: 'نفوذ' })
      .expect(403);
  });

  it('در قرارداد DELETE نیست ← 404 (روت ثبت نشده است)', async () => {
    await api().delete(`/api/v1/persons/${naturalPersonId}`).expect(404);
  });
});
