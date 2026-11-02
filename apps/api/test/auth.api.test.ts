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
 * تست API احراز هویت و RBAC — روی دیتابیس موقت «greendms_auth_test»:
 * ۱) ساخت دیتابیس از صفر و اجرای همه مهاجرت‌ها (شامل 0004 و seed 0022 و 0023)
 * ۲) کاربران نمونه: مدیر (همه مجوزها)، بیننده (بدون مجوز کالا)، کاربر قفل‌شدنی، کاربر آزمون چرخش
 * ۳) ورود، نشست، چرخش refresh، خروج، قفل حساب و 403 مجوز — همه با AppModule واقعی
 * ۴) حذف دیتابیس در پایان (حتی در حالت شکست)
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_auth_test';
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

const ADMIN_PASSWORD = 'Adm1n!pass';
const VIEWER_PASSWORD = 'View3r!pass';
const LOCK_PASSWORD = 'L0ck3d!pass';
const REUSE_PASSWORD = 'Reus3!pass';

const api = () => request(app.getHttpServer());
const login = async (username: string, password: string): Promise<Record<string, unknown>> => {
  const res = await api().post('/api/v1/auth/login').send({ username, password }).expect(200);
  return res.body as Record<string, unknown>;
};
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

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

  // شرکت + پیش‌نیازهای کالا
  const company = await pool.query<{ id: string }>(
    `insert into company (code, legal_name) values ('AUTHCO', 'شرکت تست احراز هویت') returning id`,
  );
  companyId = company.rows[0].id;
  const category = await pool.query<{ id: string }>(
    `insert into product_category (company_id, code, name) values ($1, 'BEV', 'نوشیدنی') returning id`,
    [companyId],
  );
  categoryId = category.rows[0].id;
  const uom = await pool.query<{ id: string }>(`select id from uom where code = 'pcs'`);
  uomId = uom.rows[0].id;

  // کاربران نمونه با رمزهای هش‌شده (scrypt)
  const makeUser = async (
    username: string,
    password: string,
    personCode: string,
  ): Promise<string> => {
    const person = await pool.query<{ id: string }>(
      `insert into person (company_id, code, first_name, last_name)
       values ($1, $2, 'کاربر', $2) returning id`,
      [companyId, personCode],
    );
    const personId = person.rows[0].id;
    await pool.query(
      `insert into app_user (person_id, username, password_hash, access_level)
       values ($1, $2, $3, 'web')`,
      [personId, username, await hashPassword(password)],
    );
    return personId;
  };

  await makeUser('admin_auth', ADMIN_PASSWORD, 'P-ADM');
  await makeUser('viewer_auth', VIEWER_PASSWORD, 'P-VIEW');
  await makeUser('lock_auth', LOCK_PASSWORD, 'P-LOCK');
  await makeUser('reuse_auth', REUSE_PASSWORD, 'P-REUSE');

  // نقش مدیر: همه مجوزها | نقش بیننده: فقط داشبورد گزارش‌ها
  const fullRole = await pool.query<{ id: string }>(
    `insert into role (company_id, code, name) values ($1, 'admin_full', 'مدیر کامل') returning id`,
    [companyId],
  );
  await pool.query(
    `insert into role_permission (role_id, permission_code)
     select $1, code from permission`,
    [fullRole.rows[0].id],
  );
  const viewerRole = await pool.query<{ id: string }>(
    `insert into role (company_id, code, name) values ($1, 'viewer', 'بیننده') returning id`,
    [companyId],
  );
  await pool.query(
    `insert into role_permission (role_id, permission_code) values ($1, 'reports.dashboard.view')`,
    [viewerRole.rows[0].id],
  );
  await pool.query(
    `insert into user_role (app_user_id, role_id)
     select u.id, r.id from app_user u, role r
      where r.company_id = $1 and u.username in ('admin_auth', 'reuse_auth')
        and ((r.code = 'admin_full' and u.username = 'admin_auth')
             or (r.code = 'viewer' and u.username = 'reuse_auth'))`,
    [companyId],
  );
  // کاربر بیننده واقعی هم فقط نقش بیننده بگیرد
  await pool.query(
    `insert into user_role (app_user_id, role_id)
     select u.id, r.id from app_user u join role r on r.company_id = $1 and r.code = 'viewer'
      where u.username = 'viewer_auth'`,
    [companyId],
  );

  process.env.DATABASE_URL = testUrl.toString();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1', { exclude: ['api/health'] });
  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
  await app.init();
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

describe('POST /api/v1/auth/login', () => {
  it('رمز اشتباه → 401 با کد invalid_credentials', async () => {
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ username: 'admin_auth', password: 'wrong-pass' })
      .expect(401);
    expect(res.body.code).toBe('invalid_credentials');
    expect(res.body.message_fa).toBeTruthy();
  });

  it('کاربر ناموجود → 401 با همان پیام (افشای وجود حساب نیست)', async () => {
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ username: 'ghost_user', password: 'whatever' })
      .expect(401);
    expect(res.body.code).toBe('invalid_credentials');
  });

  it('بدون password → 401 password_required (OTP هنوز فعال نیست)', async () => {
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ username: 'admin_auth' })
      .expect(401);
    expect(res.body.code).toBe('password_required');
  });

  it('بدون username → 400 validation_failed با پیام فارسی جزئی', async () => {
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ password: 'x' })
      .expect(400);
    expect(res.body.code).toBe('validation_failed');
    expect(res.body.details.fields).toHaveProperty('username');
    expect(res.body.details.fields.username[0]).toMatch(/[\u0600-\u06FF]/);
  });

  it('ورود موفق → 200 با access_token، refresh_token، expires_in و user', async () => {
    const body = await login('admin_auth', ADMIN_PASSWORD);
    expect(body.access_token).toBeTruthy();
    expect(body.refresh_token).toBeTruthy();
    expect(body.expires_in).toBe(900); // پیش‌فرض JWT_ACCESS_TTL=15m
    const user = body.user as Record<string, unknown>;
    expect(user.username).toBe('admin_auth');
    expect(user.is_active).toBe(true);
    expect(user.last_login_at).toBeTruthy();
  });
});

describe('GET /api/v1/auth/me', () => {
  it('بدون توکن → 401', async () => {
    await api().get('/api/v1/auth/me').expect(401);
  });

  it('با توکن → کاربر + نقش‌ها + مجوزها', async () => {
    const body = await login('admin_auth', ADMIN_PASSWORD);
    const res = await api()
      .get('/api/v1/auth/me')
      .set(bearer(String(body.access_token)))
      .expect(200);
    expect(res.body.user.username).toBe('admin_auth');
    expect(res.body.roles).toContain('admin_full');
    expect(res.body.permissions).toContain('master.product.view');
  });
});

describe('قفل حساب پس از تلاش‌های ناموفق', () => {
  it('چهار تلاش ناموفق → هنوز 401 (حساب باز است)', async () => {
    for (let i = 0; i < 4; i++) {
      const res = await api()
        .post('/api/v1/auth/login')
        .send({ username: 'lock_auth', password: 'bad' })
        .expect(401);
      expect(res.body.code).toBe('invalid_credentials');
    }
    const check = await pool.query<{ failed_attempts: number; locked_until: string | null }>(
      `select failed_attempts, locked_until from app_user where username = 'lock_auth'`,
    );
    expect(check.rows[0].failed_attempts).toBe(4);
    expect(check.rows[0].locked_until).toBeNull();
  });

  it('تلاش پنجم → 423 account_locked و ثبت locked_until', async () => {
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ username: 'lock_auth', password: 'bad' })
      .expect(423);
    expect(res.body.code).toBe('account_locked');
    const check = await pool.query<{ locked_until: string | null }>(
      `select locked_until from app_user where username = 'lock_auth'`,
    );
    expect(check.rows[0].locked_until).not.toBeNull();
  });

  it('رمز درست هم تا پایان قفل → 423', async () => {
    const res = await api()
      .post('/api/v1/auth/login')
      .send({ username: 'lock_auth', password: LOCK_PASSWORD })
      .expect(423);
    expect(res.body.code).toBe('account_locked');
  });

  it('پس از باز شدن قفل (مدیر) → ورود موفق و صفرشدن شمارنده', async () => {
    await pool.query(
      `update app_user set locked_until = null, failed_attempts = 0 where username = 'lock_auth'`,
    );
    const body = await login('lock_auth', LOCK_PASSWORD);
    expect(body.access_token).toBeTruthy();
    const check = await pool.query<{ failed_attempts: number }>(
      `select failed_attempts from app_user where username = 'lock_auth'`,
    );
    expect(check.rows[0].failed_attempts).toBe(0);
  });
});

describe('POST /api/v1/auth/refresh — چرخش و تشخیص سوءاستفاده', () => {
  it('refresh موفق → 200 و توکن تازه', async () => {
    const first = await login('reuse_auth', REUSE_PASSWORD);
    const second = await api()
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: first.refresh_token })
      .expect(200);
    expect(second.body.refresh_token).not.toBe(first.refresh_token);
    expect(second.body.access_token).toBeTruthy();
  });

  it('استفاده مجدد از refresh قبلاً چرخش‌شده → 401 refresh_reused', async () => {
    const first = await login('reuse_auth', REUSE_PASSWORD);
    const rotated = await api()
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: first.refresh_token })
      .expect(200);

    // تکرار همان توکن قدیمی ← نشانه سرقت احتمالی
    const reuse = await api()
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: first.refresh_token })
      .expect(401);
    expect(reuse.body.code).toBe('refresh_reused');

    // همه نشست‌های کاربر باطل شده‌اند؛ حتی توکنِ تازه هم دیگر کار نمی‌کند
    const after = await api()
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: rotated.body.refresh_token })
      .expect(401);
    expect(after.body.code).toBe('invalid_refresh_token');
  });

  it('refresh_token نامعتبر → 401', async () => {
    const res = await api()
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: 'not-a-real-token' })
      .expect(401);
    expect(res.body.code).toBe('invalid_refresh_token');
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('خروج → 204 و بی‌اعتباری همان access token', async () => {
    const body = await login('admin_auth', ADMIN_PASSWORD);
    const token = String(body.access_token);

    await api().get('/api/v1/auth/me').set(bearer(token)).expect(200);
    await api().post('/api/v1/auth/logout').set(bearer(token)).expect(204);

    const res = await api().get('/api/v1/auth/me').set(bearer(token)).expect(401);
    expect(res.body.code).toBe('session_revoked');
  });

  it('refresh با توکن نشستِ خارج‌شده → 401', async () => {
    const body = await login('admin_auth', ADMIN_PASSWORD);
    await api().post('/api/v1/auth/logout').set(bearer(String(body.access_token))).expect(204);
    const res = await api()
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: body.refresh_token })
      .expect(401);
    expect(res.body.code).toBe('invalid_refresh_token');
  });
});

describe('RBAC — کنترل مجوز روی /api/v1/products', () => {
  it('کاربر بدون مجوز کالا → 403 با کد forbidden و مجوزهای لازم', async () => {
    const body = await login('viewer_auth', VIEWER_PASSWORD);
    const res = await api()
      .get('/api/v1/products')
      .set(bearer(String(body.access_token)))
      .expect(403);
    expect(res.body.code).toBe('forbidden');
    expect(res.body.details.required).toContain('master.product.view');
    expect(res.body.message_fa).toContain('master.product.view');
  });

  it('کاربر دارای مجوز → 200 و دیدن محصولات شرکت خودش', async () => {
    await pool.query(
      `insert into product (company_id, code, name, category_id, base_uom_id)
       values ($1, 'P-AUTH1', 'کالای تست احراز هویت', $2, $3)`,
      [companyId, categoryId, uomId],
    );
    const body = await login('admin_auth', ADMIN_PASSWORD);
    const res = await api()
      .get('/api/v1/products')
      .set(bearer(String(body.access_token)))
      .expect(200);
    expect(res.body.items.some((p: { code: string }) => p.code === 'P-AUTH1')).toBe(true);
  });

  it('ساخت بدون مجوز create → 403 حتی اگر مجوز view را داشته باشد', async () => {
    const body = await login('viewer_auth', VIEWER_PASSWORD);
    const res = await api()
      .post('/api/v1/products')
      .set(bearer(String(body.access_token)))
      .send({ code: 'P-NOPE', name: 'نباید ساخته شود', category_id: categoryId, base_uom_id: uomId })
      .expect(403);
    expect(res.body.code).toBe('forbidden');
    expect(res.body.details.required).toContain('master.product.create');
  });
});
