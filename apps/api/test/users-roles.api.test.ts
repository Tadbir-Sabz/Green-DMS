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
 * تست API کاربران و نقش‌ها — /users و /roles با همان گاردهای ماژول (AuthGuard +
 * PermissionsGuard روی admin.user.manage / admin.role.manage):
 * ۱) ساخت دیتابیس موقت «greendms_users_test» از صفر + همه مهاجرت‌ها
 * ۲) seed حداقلی: دو شرکت (برای اثبات جداسازی)، ادمین، کاربر فاقد مجوز، پرسنل/شعبه
 * ۳) بالا آوردن واقعی AppModule با همان ValidationPipe سراسری
 * ۴) اسناد HTTP با supertest و حذف دیتابیس در پایان (حتی در حالت شکست)
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_users_test';
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

const ADMIN_USER = 'rbac_admin';
const ADMIN_PASSWORD = 'S3cret!pass';
const VIEWER_USER = 'viewer1';
const VIEWER_PASSWORD = 'View!pass1';
const NEW_PASSWORD = 'New!pass12';

let adminToken = '';
let viewerToken = '';

let adminId = '';
let viewer1Id = '';
let newUserId = '';
let foreignUserId = '';
let adminRoleId = '';
let viewerRoleId = '';
let sysRoleId = '';
let staffId = '';
let reporterRoleId = '';

/** UUID v4 معتبر برای قیدهای isUUID در DTO و سرویس‌ها */
const randomUuid = () => '22222222-2222-4222-8222-222222222222';

/**
 * کلاینت HTTP؛ بدون آرگومان با توکن ادمین، با null بدون توکن (آزمون 401)،
 * و با توکن کاربر دیگر برای آزمون 403.
 */
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
    `insert into company (code, legal_name) values ('RBACCO', 'شرکت تست دسترسی') returning id`,
  );
  const companyId = company.rows[0].id;

  // شرکت دیگر با کاربر و نقش خودش — برای اثبات جداسازی چندشرکتی
  const other = await pool.query<{ id: string }>(
    `insert into company (code, legal_name) values ('OTHERCO', 'شرکت دیگر') returning id`,
  );
  const otherCompanyId = other.rows[0].id;
  const otherPerson = await pool.query<{ id: string }>(
    `insert into person (company_id, code, first_name, last_name)
     values ($1, 'OP-1', 'کاربر', 'دیگر') returning id`,
    [otherCompanyId],
  );
  const foreign = await pool.query<{ id: string }>(
    `insert into app_user (person_id, username, password_hash, access_level)
     values ($1, 'foreign_user', $2, 'web') returning id`,
    [otherPerson.rows[0].id, viewerHash],
  );
  foreignUserId = foreign.rows[0].id;
  const otherRole = await pool.query<{ id: string }>(
    `insert into role (company_id, code, name) values ($1, 'other_role', 'نقش شرکت دیگر') returning id`,
    [otherCompanyId],
  );

  // شعبه/شغل/پرسنل — برای آزمون ساخت کاربر از روی staff_id
  const branch = await pool.query<{ id: string }>(
    `insert into branch (company_id, code, name) values ($1, 'BR1', 'شعبه مرکزی') returning id`,
    [companyId],
  );
  const job = await pool.query<{ id: string }>(
    `insert into job_position (company_id, code, title) values ($1, 'SALES', 'ویزیتور') returning id`,
    [companyId],
  );
  const staffPerson = await pool.query<{ id: string }>(
    `insert into person (company_id, code, first_name, last_name)
     values ($1, 'STF-1', 'علی', 'ویزیتور') returning id`,
    [companyId],
  );
  const staff = await pool.query<{ id: string }>(
    `insert into staff (person_id, branch_id, job_position_id, employee_no, is_field)
     values ($1, $2, $3, 'E-1', true) returning id`,
    [staffPerson.rows[0].id, branch.rows[0].id, job.rows[0].id],
  );
  staffId = staff.rows[0].id;

  // ادمین با همه مجوزها (permission از seed مهاجرت 0022 می‌آید)
  const adminPerson = await pool.query<{ id: string }>(
    `insert into person (company_id, code, first_name, last_name)
     values ($1, 'ADM-1', 'مدیر', 'سیستم') returning id`,
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
  adminRoleId = adminRole.rows[0].id;
  await pool.query(
    `insert into role_permission (role_id, permission_code)
     select $1, code from permission`,
    [adminRoleId],
  );
  // انتساب نقش به ادمین (بدون آن PermissionsGuard مجوزی نمی‌بیند → 403)
  await pool.query(
    `insert into user_role (app_user_id, role_id)
     select u.id, $1 from app_user u where u.username = $2`,
    [adminRoleId, ADMIN_USER],
  );

  // نقش بیننده (بدون مجوز admin.*) + کاربر دارنده‌اش
  const viewerRole = await pool.query<{ id: string }>(
    `insert into role (company_id, code, name) values ($1, 'viewer', 'بیننده') returning id`,
    [companyId],
  );
  viewerRoleId = viewerRole.rows[0].id;
  await pool.query(
    `insert into role_permission (role_id, permission_code)
     select $1, code from permission where code = 'master.product.view'`,
    [viewerRoleId],
  );
  const viewerPerson = await pool.query<{ id: string }>(
    `insert into person (company_id, code, first_name, last_name)
     values ($1, 'VW-1', 'بیننده', 'آزمایشی') returning id`,
    [companyId],
  );
  const viewer = await pool.query<{ id: string }>(
    `insert into app_user (person_id, username, password_hash, access_level)
     values ($1, $2, $3, 'web') returning id`,
    [viewerPerson.rows[0].id, VIEWER_USER, viewerHash],
  );
  viewer1Id = viewer.rows[0].id;
  await pool.query('insert into user_role (app_user_id, role_id) values ($1, $2)', [
    viewer1Id,
    viewerRoleId,
  ]);

  // نقش سیستمی (برای قید حذف‌نشدن)
  const sysRole = await pool.query<{ id: string }>(
    `insert into role (company_id, code, name, is_system)
     values ($1, 'sys_frozen', 'نقش سیستمی آزمایشی', true) returning id`,
    [companyId],
  );
  sysRoleId = sysRole.rows[0].id;

  // شناسه ادمین (برای آزمون «غیرفعال‌سازی خود»)
  const adminUser = await pool.query<{ id: string }>(
    `select id from app_user where username = $1`,
    [ADMIN_USER],
  );
  adminId = adminUser.rows[0].id;

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
}, 60_000);

// =====================================================================
// احراز هویت و مجوز (AuthGuard + PermissionsGuard)
// =====================================================================
describe('گاردها — ورود و مجوز', () => {
  it('بدون توکن GET /users → 401 با قرارداد Error', async () => {
    const res = await api(null).get('/api/v1/users').expect(401);
    expect(res.body.code).toBe('unauthorized');
    expect(res.body.message_fa).toBeTruthy();
  });

  it('بدون توکن GET /roles → 401', async () => {
    const res = await api(null).get('/api/v1/roles').expect(401);
    expect(res.body.code).toBe('unauthorized');
  });

  it('کاربر بدون admin.user.manage → 403 با جزئیات مجوز', async () => {
    const res = await api(viewerToken).get('/api/v1/users').expect(403);
    expect(res.body.code).toBe('forbidden');
    expect(res.body.details.required).toEqual(['admin.user.manage']);
  });

  it('کاربر بدون admin.role.manage → 403 روی POST /roles', async () => {
    const res = await api(viewerToken)
      .post('/api/v1/roles')
      .send({ code: 'x', name: 'اینجا مجاز نیست' })
      .expect(403);
    expect(res.body.code).toBe('forbidden');
  });
});

// =====================================================================
// GET /users — لیست، فیلترها، جداسازی شرکت، صفحه‌بندی
// =====================================================================
describe('GET /users — لیست و فیلترها', () => {
  it('فقط کاربران شرکتِ نشست را برمی‌گرداند (کاربر شرکت دیگر نیست)', async () => {
    const res = await api().get('/api/v1/users').expect(200);
    const usernames = res.body.items.map((u: { username: string }) => u.username).sort();
    expect(usernames).toEqual([ADMIN_USER, VIEWER_USER]);
    expect(res.body.has_more).toBe(false);
    expect(res.body.next_cursor).toBeNull();

    const admin = res.body.items.find((u: { username: string }) => u.username === ADMIN_USER);
    expect(admin.id).toBe(adminId);
    expect(admin.role_ids).toEqual([adminRoleId]);
    expect(admin.is_active).toBe(true);
    expect(admin.staff_id).toBeNull();
    expect(admin.locked_until).toBeNull();
    expect(admin.created_at).toBeTruthy();
  });

  it('کاربر شرکت دیگر با شناسه هم قابل دسترسی نیست (404)', async () => {
    await api().get(`/api/v1/users/${foreignUserId}`).expect(404);
  });

  it('فیلتر is_active', async () => {
    const active = await api().get('/api/v1/users').query({ is_active: 'true' }).expect(200);
    expect(active.body.items).toHaveLength(2);
    const inactive = await api().get('/api/v1/users').query({ is_active: 'false' }).expect(200);
    expect(inactive.body.items).toHaveLength(0);
  });

  it('فیلتر role با کد و با شناسه', async () => {
    const byCode = await api().get('/api/v1/users').query({ role: 'admin_full' }).expect(200);
    expect(byCode.body.items).toHaveLength(1);
    expect(byCode.body.items[0].username).toBe(ADMIN_USER);

    const byId = await api().get('/api/v1/users').query({ role: adminRoleId }).expect(200);
    expect(byId.body.items).toHaveLength(1);
  });

  it('صفحه‌بندی cursor: limit=1 صفحه اول و دوم بدون هم‌پوشانی', async () => {
    const first = await api().get('/api/v1/users').query({ limit: 1 }).expect(200);
    expect(first.body.items).toHaveLength(1);
    expect(first.body.items[0].username).toBe(ADMIN_USER); // ترتیب صعودی username
    expect(first.body.has_more).toBe(true);
    expect(first.body.next_cursor).toBeTruthy();

    const second = await api()
      .get('/api/v1/users')
      .query({ limit: 1, cursor: first.body.next_cursor })
      .expect(200);
    expect(second.body.items[0].username).toBe(VIEWER_USER);
    expect(second.body.has_more).toBe(false);
    expect(second.body.next_cursor).toBeNull();
  });
});

// =====================================================================
// POST /users — ساخت
// =====================================================================
describe('POST /users — اعتبارسنجی و ساخت', () => {
  it('بدون username → 400 validation_failed با فیلد فارسی', async () => {
    const res = await api().post('/api/v1/users').send({}).expect(400);
    expect(res.body.code).toBe('validation_failed');
    expect(res.body.message_fa).toContain('نامعتبر');
    expect(res.body.details.fields).toHaveProperty('username');
    expect(res.body.details.fields.username[0]).toMatch(/[\u0600-\u06FF]/);
  });

  it('role_ids غیر uuid → 400 با فیلد فارسی', async () => {
    const res = await api()
      .post('/api/v1/users')
      .send({ username: 'bad_role_user', role_ids: ['not-a-uuid'] })
      .expect(400);
    expect(res.body.code).toBe('validation_failed');
    expect(res.body.details.fields).toHaveProperty('role_ids');
    expect(res.body.details.fields.role_ids[0]).toMatch(/[\u0600-\u06FF]/);
  });

  it('نقش متعلق به شرکت دیگر → 400 invalid_role با فهرست missing', async () => {
    const otherRole = await pool.query<{ id: string }>(
      `select id from role where code = 'other_role'`,
    );
    const res = await api()
      .post('/api/v1/users')
      .send({ username: 'cross_user', role_ids: [otherRole.rows[0].id] })
      .expect(400);
    expect(res.body.code).toBe('invalid_role');
    expect(res.body.details.missing).toEqual([otherRole.rows[0].id]);
  });

  it('پرسنل ناموجود (staff_id) → 400 invalid_staff', async () => {
    const res = await api()
      .post('/api/v1/users')
      .send({ username: 'no_staff_user', staff_id: randomUuid() })
      .expect(400);
    expect(res.body.code).toBe('invalid_staff');
  });

  it('ساخت موفق → 201 با شخص تازه، نقش‌ها و فیلدهای readOnly قرارداد', async () => {
    const res = await api()
      .post('/api/v1/users')
      .send({
        username: 'newuser',
        password: NEW_PASSWORD,
        role_ids: [viewerRoleId],
        first_name: 'کاربر',
        last_name: 'تازه',
      })
      .expect(201);
    newUserId = res.body.id;
    expect(newUserId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.username).toBe('newuser');
    expect(res.body.role_ids).toEqual([viewerRoleId]);
    expect(res.body.is_active).toBe(true);
    expect(res.body.staff_id).toBeNull();
    expect(res.body.locked_until).toBeNull();
    expect(res.body.last_login_at).toBeNull();
    expect(res.body.created_at).toBeTruthy();
    // فقط-خواندنی‌ها را نباید پذیرفت (whitelist آن‌ها را حذف می‌کند)
    expect(res.body.is_system).toBeUndefined();
  });

  it('کاربر تازه می‌تواند وارد شود و /auth/me نقش و مجوزش را ببیند', async () => {
    const token = await login('newuser', NEW_PASSWORD);
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body.roles).toEqual(['viewer']);
    expect(me.body.permissions).toContain('master.product.view');
  });

  it('نام کاربری تکراری → 409 username_taken', async () => {
    const res = await api()
      .post('/api/v1/users')
      .send({ username: 'newuser', password: NEW_PASSWORD })
      .expect(409);
    expect(res.body.code).toBe('username_taken');
    expect(res.body.message_fa).toContain('قبلاً ثبت');
  });

  it('ساخت از روی پرسنل موجود (staff_id) → staff_id در پاسخ می‌آید', async () => {
    const res = await api()
      .post('/api/v1/users')
      .send({ username: 'staffuser', password: NEW_PASSWORD, staff_id: staffId })
      .expect(201);
    expect(res.body.staff_id).toBe(staffId);
    expect(res.body.role_ids).toEqual([]);
  });
});

// =====================================================================
// GET /users/{id}
// =====================================================================
describe('GET /users/{id}', () => {
  it('شناسه درست → 200', async () => {
    const res = await api().get(`/api/v1/users/${newUserId}`).expect(200);
    expect(res.body.username).toBe('newuser');
  });

  it('شناسه ناقص → 400 invalid_id (نه پیام پیش‌فرض Nest)', async () => {
    const res = await api().get('/api/v1/users/abc').expect(400);
    expect(res.body.code).toBe('invalid_id');
    expect(res.body.message_fa).toBeTruthy();
  });

  it('ناموجود → 404 با کد not_found', async () => {
    const res = await api().get(`/api/v1/users/${randomUuid()}`).expect(404);
    expect(res.body.code).toBe('not_found');
  });
});

// =====================================================================
// PATCH /users/{id} — نقش، فعالیت، قفل حساب
// =====================================================================
describe('PATCH /users/{id}', () => {
  it('جایگزینی نقش‌ها → 200 با role_ids جدید', async () => {
    const res = await api()
      .patch(`/api/v1/users/${newUserId}`)
      .send({ role_ids: [adminRoleId] })
      .expect(200);
    expect(res.body.role_ids).toEqual([adminRoleId]);
  });

  it('تغییر نام کاربری معتبر → 200 و ورود با نام تازه', async () => {
    const res = await api()
      .patch(`/api/v1/users/${newUserId}`)
      .send({ username: 'newuser2' })
      .expect(200);
    expect(res.body.username).toBe('newuser2');
    await login('newuser2', NEW_PASSWORD);
  });

  it('نام کاربری متعلق به کاربر دیگر → 409 username_taken', async () => {
    const res = await api()
      .patch(`/api/v1/users/${newUserId}`)
      .send({ username: VIEWER_USER })
      .expect(409);
    expect(res.body.code).toBe('username_taken');
  });

  it('is_active=false → غیرفعالی فوری: ورود 401 و نشست باز هم باطل', async () => {
    const token = await login('newuser2', NEW_PASSWORD);
    await api()
      .patch(`/api/v1/users/${newUserId}`)
      .send({ is_active: false })
      .expect(200);

    // ورود مجدد رد می‌شود
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'newuser2', password: NEW_PASSWORD })
      .expect(401);
    expect(res.body.code).toBe('account_disabled');

    // نشستِ قبلی (هنوز در اعتبارش) هم بلااثر شده است
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);

    // برگرداندن برای ادامه تست‌ها
    await api().patch(`/api/v1/users/${newUserId}`).send({ is_active: true }).expect(200);
    await login('newuser2', NEW_PASSWORD);
  });

  it('قفل دستی is_locked=true → ورود با 423 رد می‌شود؛ با false باز می‌شود', async () => {
    await api().patch(`/api/v1/users/${newUserId}`).send({ is_locked: true }).expect(200);

    const lockedRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'newuser2', password: NEW_PASSWORD })
      .expect(423);
    expect(lockedRes.body.code).toBe('account_locked');

    await api().patch(`/api/v1/users/${newUserId}`).send({ is_locked: false }).expect(200);
    await login('newuser2', NEW_PASSWORD);
  });

  it('شناسه ناموجود → 404', async () => {
    await api()
      .patch(`/api/v1/users/${randomUuid()}`)
      .send({ is_active: true })
      .expect(404);
  });
});

// =====================================================================
// DELETE /users/{id} — غیرفعال‌سازی (حذف فیزیکی ممنوع)
// =====================================================================
describe('DELETE /users/{id}', () => {
  it('غیرفعال‌سازی خود → 409 self_deactivate', async () => {
    const res = await api().delete(`/api/v1/users/${adminId}`).expect(409);
    expect(res.body.code).toBe('self_deactivate');
    expect(res.body.message_fa).toBeTruthy();
  });

  it('حذف ناموجود → 404', async () => {
    const res = await api().delete(`/api/v1/users/${randomUuid()}`).expect(404);
    expect(res.body.code).toBe('not_found');
  });

  it('غیرفعال‌سازی → 204؛ ردیف برای ممیزی می‌ماند ولی ورود و نشست بلااثرند', async () => {
    await api().delete(`/api/v1/users/${newUserId}`).expect(204);

    // حذف فیزیکی نشده: هنوز دیده می‌شود، فقط is_active=false
    const after = await api().get(`/api/v1/users/${newUserId}`).expect(200);
    expect(after.body.username).toBe('newuser2');
    expect(after.body.is_active).toBe(false);

    const list = await api()
      .get('/api/v1/users')
      .query({ is_active: 'false' })
      .expect(200);
    expect(list.body.items.map((u: { id: string }) => u.id)).toContain(newUserId);

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'newuser2', password: NEW_PASSWORD })
      .expect(401);
    expect(loginRes.body.code).toBe('account_disabled');
  });
});

// =====================================================================
// GET /roles — لیست با مجوزها
// =====================================================================
describe('GET /roles — لیست', () => {
  it('نقش‌های شرکت با permission_codes و is_system درست برمی‌گردند', async () => {
    const res = await api().get('/api/v1/roles').expect(200);
    const byCode = Object.fromEntries(
      res.body.items.map((r: { code: string }) => [r.code, r]),
    );

    expect(Object.keys(byCode).sort()).toEqual(['admin_full', 'sys_frozen', 'viewer']);
    expect(byCode.admin_full.permission_codes).toContain('admin.user.manage');
    expect(byCode.admin_full.permission_codes).toContain('admin.role.manage');
    expect(byCode.admin_full.is_system).toBe(false);
    expect(byCode.viewer.permission_codes).toEqual(['master.product.view']);
    expect(byCode.sys_frozen.is_system).toBe(true);
    expect(res.body.has_more).toBe(false);
  });

  it('کاربر شرکت دیگر نقش‌های این شرکت را نمی‌بیند', async () => {
    // نشست ادمین این شرکت است؛ نقش other_role نباید در لیست باشد
    const res = await api().get('/api/v1/roles').expect(200);
    expect(
      res.body.items.some((r: { code: string }) => r.code === 'other_role'),
    ).toBe(false);
  });
});

// =====================================================================
// POST /roles — ساخت با نگاشت مجوز
// =====================================================================
describe('POST /roles — اعتبارسنجی و ساخت', () => {
  it('بدون name → 400 validation_failed با فیلد فارسی', async () => {
    const res = await api().post('/api/v1/roles').send({ code: 'norole' }).expect(400);
    expect(res.body.code).toBe('validation_failed');
    expect(res.body.details.fields).toHaveProperty('name');
    expect(res.body.details.fields.name[0]).toMatch(/[\u0600-\u06FF]/);
  });

  it('الگوی مجوز ناموجود → 400 invalid_permission با فهرست missing', async () => {
    const res = await api()
      .post('/api/v1/roles')
      .send({ code: 'badperm', name: 'نقش نامعتبر', permission_codes: ['nope.perm'] })
      .expect(400);
    expect(res.body.code).toBe('invalid_permission');
    expect(res.body.details.missing).toEqual(['nope.perm']);
  });

  it('ساخت موفق → 201 با permission_codes دقیق و is_system=false', async () => {
    const res = await api()
      .post('/api/v1/roles')
      .send({
        code: 'reporter',
        name: 'کارشناس گزارش',
        permission_codes: ['admin.audit.view'],
      })
      .expect(201);
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.code).toBe('reporter');
    expect(res.body.permission_codes).toEqual(['admin.audit.view']);
    expect(res.body.is_system).toBe(false);
    reporterRoleId = res.body.id;
  });

  it('کد تکراری → 409 duplicate_code', async () => {
    const res = await api()
      .post('/api/v1/roles')
      .send({ code: 'reporter', name: 'تکراری' })
      .expect(409);
    expect(res.body.code).toBe('duplicate_code');
  });

  it('اثر RBAC: نسبت نقش تازه به کاربر → /auth/me مجوز جدید را می‌بیند', async () => {
    await api()
      .patch(`/api/v1/users/${viewer1Id}`)
      .send({ role_ids: [viewerRoleId, reporterRoleId] })
      .expect(200);

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(200);
    expect(me.body.permissions).toContain('admin.audit.view');
    expect(me.body.permissions).toContain('master.product.view');
    expect(me.body.roles.sort()).toEqual(['reporter', 'viewer']);
  });
});

// =====================================================================
// PATCH /roles/{id}
// =====================================================================
describe('PATCH /roles/{id}', () => {
  it('ویرایش نام و جایگزینی permission_codes → 200', async () => {
    const res = await api()
      .patch(`/api/v1/roles/${reporterRoleId}`)
      .send({
        name: 'کارشناس گزارش (بازبینی‌شده)',
        permission_codes: ['admin.audit.view', 'master.product.view'],
      })
      .expect(200);
    expect(res.body.name).toContain('بازبینی');
    expect(res.body.permission_codes).toEqual(['admin.audit.view', 'master.product.view']);
  });

  it('permission ناموجود در PATCH → 400 invalid_permission', async () => {
    const res = await api()
      .patch(`/api/v1/roles/${reporterRoleId}`)
      .send({ permission_codes: ['nope.perm'] })
      .expect(400);
    expect(res.body.code).toBe('invalid_permission');
  });

  it('تغییر کد نقش سیستمی → 409 system_role', async () => {
    const res = await api()
      .patch(`/api/v1/roles/${sysRoleId}`)
      .send({ code: 'sys_changed' })
      .expect(409);
    expect(res.body.code).toBe('system_role');
  });

  it('ویرایش نام نقش سیستمی مجاز است (فقط کد ثابت می‌ماند)', async () => {
    const res = await api()
      .patch(`/api/v1/roles/${sysRoleId}`)
      .send({ name: 'نقش سیستمی (ویرایش‌نام)' })
      .expect(200);
    expect(res.body.code).toBe('sys_frozen');
    expect(res.body.name).toContain('ویرایش‌نام');
  });

  it('شناسه ناموجود → 404', async () => {
    await api()
      .patch(`/api/v1/roles/${randomUuid()}`)
      .send({ name: 'ناموجود' })
      .expect(404);
  });
});

// =====================================================================
// DELETE /roles/{id}
// =====================================================================
describe('DELETE /roles/{id}', () => {
  it('نقش دارای کاربر → 409 role_in_use', async () => {
    const res = await api().delete(`/api/v1/roles/${adminRoleId}`).expect(409);
    expect(res.body.code).toBe('role_in_use');
    expect(res.body.message_fa).toContain('کاربر');
  });

  it('نقش سیستمی → 409 system_role', async () => {
    const res = await api().delete(`/api/v1/roles/${sysRoleId}`).expect(409);
    expect(res.body.code).toBe('system_role');
  });

  it('نقش بدون کاربر → 204 و سپس 404', async () => {
    const created = await api()
      .post('/api/v1/roles')
      .send({ code: 'temp_role', name: 'نقش موقت' })
      .expect(201);
    await api().delete(`/api/v1/roles/${created.body.id}`).expect(204);

    const gone = await api().get(`/api/v1/roles/${created.body.id}`).expect(404);
    expect(gone.body.code).toBe('not_found');
  });

  it('شناسه ناموجود → 404', async () => {
    await api().delete(`/api/v1/roles/${randomUuid()}`).expect(404);
  });
});
