import 'reflect-metadata';
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
 * fixture مشترکِ تست‌های Product Master — الگوی هر فایلِ تستِ DBدار:
 * دیتابیسِ موقتِ یکتا ← همهٔ مهاجرت‌ها در یک تراکنش ← seed حداقلی ← AppModule واقعی.
 * هر فایلِ تست نامِ DB یکتای خودش را می‌گیرد (ایزوله؛ هرگز DB مشترک/تولید).
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const PSQL = process.env.PSQL ?? 'psql';

export interface Fixture {
  app: INestApplication;
  pool: pg.Pool;
  companyId: string;
  categoryId: string;
  uomId: string;
  uomBoxId: string;
  token: string;
  loginAs: (username: string, password: string) => Promise<string>;
  api: (token?: string) => {
    get: (url: string) => request.Test;
    post: (url: string) => request.Test;
    patch: (url: string) => request.Test;
    put: (url: string) => request.Test;
    delete: (url: string) => request.Test;
  };
  adminUser: string;
  adminPassword: string;
  teardown: () => Promise<void>;
}

export async function setupProductMasterFixture(dbName: string): Promise<Fixture> {
  const adminUrl = new URL(process.env.DATABASE_URL ?? '');
  const testUrl = new URL(adminUrl);
  testUrl.pathname = `/${dbName}`;
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

  // ۱) دیتابیسِ موقتِ ایزوله
  const adminPool = new pg.Pool({ connectionString: adminUrl.toString(), max: 1 });
  await adminPool.query(
    'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
    [dbName],
  );
  await adminPool.query(`drop database if exists "${dbName}"`);
  await adminPool.query(`create database "${dbName}"`);

  // ۲) همهٔ مهاجرت‌ها در یک تراکنش واحد
  const files = readdirSync(path.join(ROOT, 'migrations'))
    .filter((f) => f.endsWith('.up.sql'))
    .sort()
    .flatMap((f) => ['-f', path.join(ROOT, 'migrations', f)]);
  execFileSync(PSQL, [...psqlBase, '-d', dbName, '-1', '-q', ...files], { env: psqlEnv, stdio: 'pipe' });

  // ۳) seed حداقلی
  const pool = new pg.Pool({ connectionString: testUrl.toString(), max: 4 });
  const company = await pool.query<{ id: string }>(
    `insert into company (code, legal_name) values ('PMCO', 'شرکت تست مستر کالا') returning id`,
  );
  const companyId = company.rows[0].id;
  const cat = await pool.query<{ id: string }>(
    `insert into product_category (company_id, code, name) values ($1, 'PMCAT', 'گروه تست') returning id`,
    [companyId],
  );
  const uoms = await pool.query<{ id: string; code: string }>(
    `insert into uom (code, title, decimal_places) values ('pm_piece', 'عدد', 0), ('pm_box', 'کارتن', 0) returning id, code`,
  );
  const uomId = uoms.rows.find((r) => r.code === 'pm_piece')!.id;
  const uomBoxId = uoms.rows.find((r) => r.code === 'pm_box')!.id;

  // کاربرِ ادمین با همهٔ مجوزهای master.product.*
  const password = 'S3cret!pass';
  const passwordHash = await hashPassword(password);
  const person = await pool.query<{ id: string }>(
    `insert into person (company_id, code, first_name, last_name) values ($1, 'ADM-PM', 'مدیر', 'کالا') returning id`,
    [companyId],
  );
  await pool.query(
    `insert into app_user (person_id, username, password_hash, access_level) values ($1, 'pm_admin', $2, 'web')`,
    [person.rows[0].id, passwordHash],
  );
  const role = await pool.query<{ id: string }>(
    `insert into role (company_id, code, name) values ($1, 'pm_admin_role', 'نقش مدیر کالا') returning id`,
    [companyId],
  );
  await pool.query(
    `insert into role_permission (role_id, permission_code)
     select $1, code from permission where code like 'master.product%' or code like 'master.price%'`,
    [role.rows[0].id],
  );
  await pool.query(
    `insert into user_role (app_user_id, role_id)
     select u.id, $1 from app_user u where u.username = 'pm_admin'`,
    [role.rows[0].id],
  );

  // ۴) بالا آوردنِ AppModule واقعی — با DATABASE_URLِ دیتابیسِ موقت
  process.env.DATABASE_URL = testUrl.toString();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1', { exclude: ['api/health'] });
  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
  await app.init();

  const loginAs = async (username: string, pw: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username, password: pw });
    if (res.status !== 200 || !res.body.access_token) {
      throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body).slice(0, 300)}`);
    }
    return res.body.access_token as string;
  };
  const token = await loginAs('pm_admin', password);

  const makeApi = (t?: string) => {
    const base = request(app.getHttpServer());
    const bearer = t ?? token;
    const verb =
      (method: 'get' | 'post' | 'patch' | 'put' | 'delete') =>
      (url: string): request.Test => {
        const req = base[method](url);
        return bearer ? req.set('Authorization', `Bearer ${bearer}`) : req;
      };
    return {
      get: verb('get'),
      post: verb('post'),
      patch: verb('patch'),
      put: verb('put'),
      delete: verb('delete'),
    };
  };

  const teardown = async () => {
    await app.close();
    await pool.end();
    await adminPool.query(
      'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
      [dbName],
    );
    await adminPool.query(`drop database if exists "${dbName}"`);
    await adminPool.end();
  };

  return {
    app,
    pool,
    companyId,
    categoryId: cat.rows[0].id,
    uomId,
    uomBoxId,
    token,
    loginAs,
    api: makeApi,
    adminUser: 'pm_admin',
    adminPassword: password,
    teardown,
  };
}

/** ساختِ کالای نمونه از مسیرِ API — سریع و هم‌راستا با قرارداد */
export async function createProduct(
  fx: Fixture,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; code: string; row_version: number }> {
  const res = await fx
    .api()
    .post('/api/v1/products')
    .send({
      name: 'کالای تست',
      category_id: fx.categoryId,
      base_uom_id: fx.uomId,
      ...overrides,
    })
    .expect(201);
  return res.body;
}
