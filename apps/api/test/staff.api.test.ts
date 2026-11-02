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
 * تست API پرسنل — /staff با همان گاردهای ماژول (AuthGuard + PermissionsGuard
 * روی master.staff.view/create/update — مجوزها از مهاجرت 0026 می‌آیند):
 * ۱) ساخت دیتابیس موقت «greendms_staff_test» از صفر + همه مهاجرت‌ها
 * ۲) seed حداقلی: دو شرکت (اثبات جداسازی)، سمت‌ها، حوزه‌ها، ادمینِ دارای مجوز و بیننده
 * ۳) بالا آوردن واقعی AppModule با همان ValidationPipe سراسری
 * ۴) اسناد HTTP با supertest و حذف دیتابیس در پایان (حتی در حالت شکست)
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_staff_test';
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

const ADMIN_USER = 'staff_admin';
const ADMIN_PASSWORD = 'S3cret!pass';
const VIEWER_USER = 'staff_viewer';
const VIEWER_PASSWORD = 'View!pass1';

let adminToken = '';
let viewerToken = '';
let companyId = '';
let areaId = '';
let supervisorId = '';
let fieldStaffId = '';
let otherCompanyStaffId = '';

interface StaffBody {
  id: string;
  person_id: string;
  branch_id: string;
  job_position_code: string;
  employee_no?: string;
  hire_date?: string;
  supervisor_id: string | null;
  vehicle_id: string | null;
  is_field: boolean;
  area_ids: string[];
  status: string;
  created_at: string;
}

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
    `insert into company (code, legal_name) values ('STAFFCO', 'شرکت تست پرسنل') returning id`,
  );
  companyId = company.rows[0].id;
  const branch = await pool.query<{ id: string }>(
    `insert into branch (company_id, code, name) values ($1, 'MAIN', 'شعبه مرکزی') returning id`,
    [companyId],
  );
  const branchId = branch.rows[0].id;

  // سمت‌ها (0022 فقط برای شرکت خودش سمت می‌سازد؛ اینجا برای شرکت تست ساخته می‌شود)
  await pool.query(
    `insert into job_position (company_id, code, title, department) values
       ($1, 'salesperson_cold', 'ویزیتور سرد', 'فروش'),
       ($1, 'supervisor', 'سرپرست فروشندگان', 'فروش'),
       ($1, 'courier', 'موزع / راننده', 'توزیع')`,
    [companyId],
  );
  const area = await pool.query<{ id: string }>(
    `insert into sales_area (branch_id, code, name) values ($1, 'AREA-1', 'حوزه شمال') returning id`,
    [branchId],
  );
  areaId = area.rows[0].id;

  // شرکت دیبر برای اثبات جداسازی چندشرکتی
  const other = await pool.query<{ id: string }>(
    `insert into company (code, legal_name) values ('OTHERSTAFF', 'شرکت دیگر') returning id`,
  );
  const otherBranch = await pool.query<{ id: string }>(
    `insert into branch (company_id, code, name) values ($1, 'B2', 'شعبه دوم') returning id`,
    [other.rows[0].id],
  );

  // ادمین با همه مجوزها (permission از seed مهاجرت‌ها می‌آید، شامل master.staff.* از 0026)
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

  // کاربر فاقد مجوزهای پرسنل (برای آزمون 403)
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

  // شخص‌هایی که پرسنل می‌شوند
  for (const [code, first, last] of [
    ['SUP-1', 'مریم', 'رضایی'],
    ['EMP-1', 'رضا', 'کریمی'],
    ['EMP-2', 'سعید', 'موسوی'],
  ] as const) {
    await pool.query(
      `insert into person (company_id, code, legal_type, first_name, last_name)
       values ($1, $2, 'natural', $3, $4)`,
      [companyId, code, first, last],
    );
  }

  // ۴) اپ واقعی با همان پایپ سراسری
  process.env.DATABASE_URL = testUrl.toString();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1', { exclude: ['api/health'] });
  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
  await app.init();

  adminToken = await login(ADMIN_USER, ADMIN_PASSWORD);
  viewerToken = await login(VIEWER_USER, VIEWER_PASSWORD);

  // پرسنل پایه برای فیلترها/صفحه‌بندی: سرپرست + یک میدانی (مستقیم از دیتابیس)
  const sup = await pool.query<{ id: string }>(
    `insert into staff (person_id, branch_id, job_position_id, employee_no)
     select p.id, $2, (select id from job_position where company_id = $1 and code = 'supervisor'), '1001'
       from person p where p.company_id = $1 and p.code = 'SUP-1'
     returning id`,
    [companyId, branchId],
  );
  supervisorId = sup.rows[0].id;
  const field = await pool.query<{ id: string }>(
    `insert into staff (person_id, branch_id, job_position_id, employee_no, is_field, supervisor_id)
     select p.id, $2, (select id from job_position where company_id = $1 and code = 'salesperson_cold'),
            '1002', true, $3
       from person p where p.company_id = $1 and p.code = 'EMP-1'
     returning id`,
    [companyId, branchId, supervisorId],
  );
  fieldStaffId = field.rows[0].id;

  // پرسنل شرکت دیگر — باید از نشست این شرکت کاملاً نامرئی باشد
  await pool.query(
    `insert into person (company_id, code, legal_type, first_name, last_name)
     values ((select id from company where code = 'OTHERSTAFF'), 'F-1', 'natural', 'خارجی', 'نامرئی')`,
  );
  await pool.query(
    `insert into job_position (company_id, code, title)
     values ((select id from company where code = 'OTHERSTAFF'), 'courier', 'موزع')`,
  );
  const otherStaff = await pool.query<{ id: string }>(
    `insert into staff (person_id, branch_id, job_position_id)
     select p.id, $1, jp.id
       from person p
       cross join job_position jp
       join company c on c.id = jp.company_id and c.code = 'OTHERSTAFF'
      where p.code = 'F-1'
     returning id`,
    [otherBranch.rows[0].id],
  );
  otherCompanyStaffId = otherStaff.rows[0].id;
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

describe('GET /staff — فهرست و فیلترها', () => {
  it('بدون توکن 401', async () => {
    await api(null).get('/api/v1/staff').expect(401);
  });

  it('بدون مجوز 403 با کد فارسی و نام مجوز', async () => {
    const res = await api(viewerToken).get('/api/v1/staff').expect(403);
    expect(res.body.code).toBe('forbidden');
    expect(res.body.message_fa).toContain('master.staff.view');
  });

  it('لیست 200 ← Page با next_cursor/has_more و فقط پرسنل شرکت نشست', async () => {
    const res = await api().get('/api/v1/staff').expect(200);
    expect(res.body).toHaveProperty('next_cursor');
    expect(res.body).toHaveProperty('has_more');
    const ids = res.body.items.map((s: StaffBody) => s.id);
    expect(ids).toContain(supervisorId);
    expect(ids).toContain(fieldStaffId);
    expect(ids).not.toContain(otherCompanyStaffId);
    // شکل پاسخ دقیقاً اسکیمای Staff است
    expect(res.body.items[0]).toHaveProperty('job_position_code');
    expect(res.body.items[0]).toHaveProperty('area_ids');
    expect(res.body.items[0].row_version).toBeGreaterThanOrEqual(0); // قفل خوش‌بینانه (فاز B)
    expect(res.body.items[0]).not.toHaveProperty('person_code');
  });

  it('فیلتر job_position_code و is_field و supervisor_id', async () => {
    const byPosition = await api()
      .get('/api/v1/staff')
      .query({ job_position_code: 'salesperson_cold' })
      .expect(200);
    expect(byPosition.body.items.every((s: StaffBody) => s.job_position_code === 'salesperson_cold')).toBe(true);
    expect(byPosition.body.items).toHaveLength(1);

    const fieldOnly = await api().get('/api/v1/staff').query({ is_field: 'true' }).expect(200);
    expect(fieldOnly.body.items.every((s: StaffBody) => s.is_field === true)).toBe(true);

    const bySupervisor = await api()
      .get('/api/v1/staff')
      .query({ supervisor_id: supervisorId })
      .expect(200);
    expect(bySupervisor.body.items.map((s: StaffBody) => s.id)).toContain(fieldStaffId);
  });

  it('صفحه‌بندی cursor: limit=1 ← has_more و صفحه بعد', async () => {
    const first = await api().get('/api/v1/staff').query({ limit: 1 }).expect(200);
    expect(first.body.items).toHaveLength(1);
    expect(first.body.has_more).toBe(true);

    const second = await api()
      .get('/api/v1/staff')
      .query({ limit: 1, cursor: first.body.next_cursor })
      .expect(200);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.items[0].id).not.toBe(first.body.items[0].id);
  });

  it('is_field نامعتبر ← 400 با پیام فارسی فیلد', async () => {
    const res = await api().get('/api/v1/staff').query({ is_field: 'شاید' }).expect(400);
    expect(res.body.code).toBe('validation_failed');
    expect(res.body.details.fields.is_field[0]).toMatch(/[؀-ۿ]/);
  });
});

describe('POST /staff — ساخت پرسنل', () => {
  it('ساخت 201 با سمت، حوزه و سرپرست', async () => {
    const person = await pool.query<{ id: string }>(
      `insert into person (company_id, code, legal_type, first_name, last_name)
       values ($1, 'EMP-3', 'natural', 'نگار', 'احمدی') returning id`,
      [companyId],
    );
    const res = await api()
      .post('/api/v1/staff')
      .send({
        person_id: person.rows[0].id,
        job_position_code: 'courier',
        employee_no: '1003',
        hire_date: '2024-05-01',
        supervisor_id: supervisorId,
        is_field: true,
        area_ids: [areaId],
      })
      .expect(201);
    expect(res.body.job_position_code).toBe('courier');
    expect(res.body.status).toBe('active');
    expect(res.body.hire_date).toBe('2024-05-01');
    expect(res.body.area_ids).toEqual([areaId]);
    expect(res.body.branch_id).toBeTruthy(); // شعبه پیش‌فرض شرکت
    expect(res.body.row_version).toBe(0); // نسخهٔ اولیه هنگام ساخت
  });

  it('بدون توکن 401 و بدون مجوز 403', async () => {
    await api(null).post('/api/v1/staff').send({ person_id: 'x' }).expect(401);
    await api(viewerToken).post('/api/v1/staff').send({ person_id: 'x' }).expect(403);
  });

  it('بدون person_id ← 400 فیلد الزامی فارسی', async () => {
    const res = await api().post('/api/v1/staff').send({ job_position_code: 'courier' }).expect(400);
    expect(res.body.code).toBe('validation_failed');
    expect(res.body.details.fields.person_id[0]).toContain('الزامی');
  });

  it('بدون سمت ← 400 job_position_required با پیام فارسی', async () => {
    const person = await pool.query<{ id: string }>(
      `insert into person (company_id, code, legal_type, first_name, last_name)
       values ($1, 'EMP-4', 'natural', 'بدون', 'سمت') returning id`,
      [companyId],
    );
    const res = await api()
      .post('/api/v1/staff')
      .send({ person_id: person.rows[0].id })
      .expect(400);
    expect(res.body.code).toBe('job_position_required');
    expect(res.body.message_fa).toMatch(/[؀-ۿ]/);
  });

  it('سمت ناشناخته ← 400 job_position_not_found', async () => {
    const person = await pool.query<{ id: string }>(
      `insert into person (company_id, code, legal_type, first_name, last_name)
       values ($1, 'EMP-5', 'natural', 'سمت', 'ناموجود') returning id`,
      [companyId],
    );
    const res = await api()
      .post('/api/v1/staff')
      .send({ person_id: person.rows[0].id, job_position_code: 'astronaut' })
      .expect(400);
    expect(res.body.code).toBe('job_position_not_found');
  });

  it('شخص شرکت دیگر ← 400 person_not_found (درز چندشرکتی بسته است)', async () => {
    const foreign = await pool.query<{ id: string }>(
      `select id from person where code = 'F-1'`,
    );
    const res = await api()
      .post('/api/v1/staff')
      .send({ person_id: foreign.rows[0].id, job_position_code: 'courier' })
      .expect(400);
    expect(res.body.code).toBe('person_not_found');
  });

  it('شخصِ قبلاً پرسنل‌شده ← 409 duplicate_person', async () => {
    const sup = await pool.query<{ id: string }>(
      `select id from person where company_id = $1 and code = 'SUP-1'`,
      [companyId],
    );
    const res = await api()
      .post('/api/v1/staff')
      .send({ person_id: sup.rows[0].id, job_position_code: 'courier' })
      .expect(409);
    expect(res.body.code).toBe('duplicate_person');
    expect(res.body.message_fa).toMatch(/[؀-ۿ]/);
  });

  it('حوزه شرکت دیگر ← 400 area_not_found', async () => {
    const person = await pool.query<{ id: string }>(
      `insert into person (company_id, code, legal_type, first_name, last_name)
       values ($1, 'EMP-6', 'natural', 'حوزه', 'نامعتبر') returning id`,
      [companyId],
    );
    const otherArea = await pool.query<{ id: string }>(
      `insert into sales_area (branch_id, code, name)
       select b.id, 'X-AREA', 'حوزه دیگر' from branch b join company c on c.id = b.company_id
        where c.code = 'OTHERSTAFF' returning id`,
    );
    const res = await api()
      .post('/api/v1/staff')
      .send({
        person_id: person.rows[0].id,
        job_position_code: 'courier',
        area_ids: [otherArea.rows[0].id],
      })
      .expect(400);
    expect(res.body.code).toBe('area_not_found');
  });
});

describe('GET/PATCH /staff/{id} — جزئیات و ویرایش', () => {
  it('جزئیات 200 و شناسه نامعتبر 400', async () => {
    const res = await api().get(`/api/v1/staff/${fieldStaffId}`).expect(200);
    expect(res.body.id).toBe(fieldStaffId);
    expect(res.body.job_position_code).toBe('salesperson_cold');
    expect(res.body.supervisor_id).toBe(supervisorId);

    await api().get('/api/v1/staff/not-a-uuid').expect(400);
  });

  it('شناسه ناموجود 404 (از جمله پرسنل شرکت دیگر)', async () => {
    await api().get('/api/v1/staff/00000000-0000-4000-8000-000000000000').expect(404);
    const res = await api().get(`/api/v1/staff/${otherCompanyStaffId}`).expect(404);
    expect(res.body.code).toBe('not_found');
  });

  it('PATCH وضعیت به inactive ← نگاشت روی قرارداد و بازتاب در GET', async () => {
    const res = await api()
      .patch(`/api/v1/staff/${fieldStaffId}`)
      .send({ status: 'inactive' })
      .expect(200);
    expect(res.body.status).toBe('inactive');

    const read = await api().get(`/api/v1/staff/${fieldStaffId}`).expect(200);
    expect(read.body.status).toBe('inactive');

    // برگرداندن به حالت فعال برای بقیه تست‌ها
    await api().patch(`/api/v1/staff/${fieldStaffId}`).send({ status: 'active' }).expect(200);
  });

  it('PATCH حوزه‌ها جایگزین می‌شود و سرپرست قابل تغییر است', async () => {
    const area2 = await pool.query<{ id: string }>(
      `insert into sales_area (branch_id, code, name) values ($1, 'AREA-2', 'حوزه جنوب') returning id`,
      [
        (
          await pool.query<{ id: string }>(`select id from branch where company_id = $1`, [companyId])
        ).rows[0].id,
      ],
    );
    const res = await api()
      .patch(`/api/v1/staff/${fieldStaffId}`)
      .send({ area_ids: [area2.rows[0].id], employee_no: '2002' })
      .expect(200);
    expect(res.body.area_ids).toEqual([area2.rows[0].id]);
    expect(res.body.employee_no).toBe('2002');
  });

  it('سرپرستِ خودِ پرسنل ← 400 supervisor_self', async () => {
    const res = await api()
      .patch(`/api/v1/staff/${fieldStaffId}`)
      .send({ supervisor_id: fieldStaffId })
      .expect(400);
    expect(res.body.code).toBe('supervisor_self');
    expect(res.body.message_fa).toMatch(/[؀-ۿ]/);
  });

  it('بدون مجوز 403 و شناسه نامعتبر 400', async () => {
    await api(viewerToken)
      .patch(`/api/v1/staff/${fieldStaffId}`)
      .send({ is_field: false })
      .expect(403);
    await api().patch('/api/v1/staff/nope').send({ is_field: false }).expect(400);
  });
});
