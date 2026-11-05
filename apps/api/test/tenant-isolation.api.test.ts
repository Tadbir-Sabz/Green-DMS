import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';
import request from 'supertest';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { validationPipeOptions } from '../src/common/validation';
import { hashPassword } from '../src/modules/identity-rbac/password';
import { PortalRepository } from '../src/modules/portal/portal.repository';

/**
 * جداسازیِ اجاره‌ها و اثربخشیِ RLS — با شاهدِ «رفتارِ واقعیِ دیتابیس»، نه صرفاً
 * خواندنِ تعریفِ سیاست‌ها.
 *
 * این فایل سه پرسش را با اجرای SQL واقعی پاسخ می‌دهد:
 *   ۱) آیا نقشی که اپلیکیشن با آن وصل می‌شود RLS را دور می‌زند؟ (superuser/BYPASSRLS)
 *   ۲) آیا خودِ سیاست‌های RLS برای یک نقشِ غیرِ‌دور‌زننده درست کار می‌کنند؟
 *   ۳) مسیرِ احرازِ هویتِ پورتال که «پیش از» زمینهٔ اجاره اجرا می‌شود، زیرِ نقشِ
 *      RLS‌پذیر چه رفتاری دارد؟
 * به‌علاوهٔ محافظتِ هم‌زمانیِ چرخشِ refresh (ضدِ replay) در دو سطحِ ریپازیتوری و HTTP.
 *
 * نیاز به Postgres زنده دارد (مانند سایر *.api.test.ts) و در CI اجرا می‌شود.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_tenant_isolation_test';
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
let probePool: pg.Pool | null = null;
let app: INestApplication;

const PROBE_ROLE = `rls_probe_${crypto.randomBytes(4).toString('hex')}`;
const PROBE_PASSWORD = 'Probe!pass1';

let companyA = '';
let companyB = '';
let customerA = '';
let portalUserId = '';
const PORTAL_EMAIL = `iso_${crypto.randomBytes(4).toString('hex')}@example.com`;
const PORTAL_PASSWORD = 'Portal!pass1';

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

  // max>1 تا درخواست‌های هم‌زمان واقعاً موازی اجرا شوند (نه سریال‌شده).
  pool = new pg.Pool({ connectionString: testUrl.toString(), max: 6 });

  companyA = (
    await pool.query<{ id: string }>(
      `insert into company (code, legal_name) values ('ISO_A', 'شرکت آ') returning id`,
    )
  ).rows[0].id;
  companyB = (
    await pool.query<{ id: string }>(
      `insert into company (code, legal_name) values ('ISO_B', 'شرکت ب') returning id`,
    )
  ).rows[0].id;

  // یک ردیفِ اجاره‌محور در هر شرکت (billing_invoice از مهاجرت 0039 با RLS).
  for (const [co, no] of [
    [companyA, 'ISO-A-1'],
    [companyB, 'ISO-B-1'],
  ] as const) {
    await pool.query(
      `insert into billing_invoice (company_id, invoice_no, period_start, period_end, amount)
       values ($1, $2, '2026-01-01', '2026-01-31', 1000)`,
      [co, no],
    );
  }

  // زنجیرهٔ دادهٔ آزمون مطابقِ اسکیمای واقعی: branch → person → customer → portal_user.
  // توجه: portal_user ستونِ first_name/last_name ندارد (display_name دارد) و
  // customer_id آن NOT NULL است (مهاجرت 0037)؛ customer هم به person_id و branch_id
  // NOT NULL نیاز دارد (مهاجرت 0007).
  const branchA = (
    await pool.query<{ id: string }>(
      `insert into branch (company_id, code, name) values ($1, 'HQ', 'مرکز') returning id`,
      [companyA],
    )
  ).rows[0].id;

  const personA = (
    await pool.query<{ id: string }>(
      `insert into person (company_id, code, legal_type, first_name, last_name)
       values ($1, 'ISO-P1', 'natural', 'کاربر', 'پورتال') returning id`,
      [companyA],
    )
  ).rows[0].id;

  customerA = (
    await pool.query<{ id: string }>(
      `insert into customer (person_id, branch_id, code) values ($1, $2, 'ISO-C1') returning id`,
      [personA, branchA],
    )
  ).rows[0].id;

  // کاربرِ پورتال برای شرکتِ آ (برای تستِ هم‌زمانیِ refresh).
  portalUserId = (
    await pool.query<{ id: string }>(
      `insert into portal_user (company_id, customer_id, email, password_hash, display_name)
       values ($1, $2, $3, $4, 'کاربرِ جداسازی') returning id`,
      [companyA, customerA, PORTAL_EMAIL, await hashPassword(PORTAL_PASSWORD)],
    )
  ).rows[0].id;

  process.env.DATABASE_URL = testUrl.toString();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1', { exclude: ['api/health'] });
  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
  await app.init();
}, 180_000);

afterAll(async () => {
  await app?.close();
  await probePool?.end();
  await pool?.end();
  if (adminPool) {
    await adminPool.query(
      'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
      [TEST_DB],
    );
    await adminPool.query(`drop database if exists "${TEST_DB}"`);
    // نقش‌ها cluster-wideاند؛ حتماً پاک شود تا اجرای بعدی دچار تعارض نشود.
    await adminPool.query(`drop role if exists "${PROBE_ROLE}"`);
    await adminPool.end();
  }
}, 60_000);

describe('RLS — اثربخشی زیرِ نقشِ واقعیِ اپلیکیشن', () => {
  it('نقشِ اپ superuser/BYPASSRLS است و بنابراین RLS را دور می‌زند (یافتهٔ امنیتی)', async () => {
    const { rows } = await pool.query<{ usename: string; rolsuper: boolean; rolbypassrls: boolean }>(
      `select current_user as usename, r.rolsuper, r.rolbypassrls
         from pg_roles r where r.rolname = current_user`,
    );
    // این assertion «وضعیتِ موجود» را ثبت می‌کند: جداسازیِ اجاره‌ها امروز به فیلترِ
    // company_id در لایهٔ ریپازیتوری متکی است، نه به RLS. اگر روزی نقشِ اپ به یک
    // نقشِ غیرِ‌superuser تغییر کند، این تست باید به‌همراه آن به‌روزرسانی شود.
    expect(rows[0].rolsuper || rows[0].rolbypassrls).toBe(true);

    const client = await pool.connect();
    try {
      // زمینهٔ اجاره را روی شرکتِ ب ست کن؛ با این حال ردیفِ شرکتِ آ هم دیده می‌شود.
      await client.query(`select set_config('app.company_id', $1, false)`, [companyB]);
      const res = await client.query<{ n: string }>(`select count(*)::text as n from billing_invoice`);
      expect(Number(res.rows[0].n)).toBe(2);
    } finally {
      await client.query(`select set_config('app.company_id', '', false)`);
      client.release();
    }
  });

  it('سیاستِ RLS برای نقشِ غیرِ‌دور‌زننده واقعاً اعمال می‌شود', async () => {
    await pool.query(
      `create role "${PROBE_ROLE}" login password '${PROBE_PASSWORD}' nosuperuser nobypassrls`,
    );
    await pool.query(`grant usage on schema public to "${PROBE_ROLE}"`);
    await pool.query(`grant select on billing_invoice to "${PROBE_ROLE}"`);

    const probeUrl = new URL(testUrl);
    probeUrl.username = PROBE_ROLE;
    probeUrl.password = PROBE_PASSWORD;
    probePool = new pg.Pool({ connectionString: probeUrl.toString(), max: 3 });

    const client = await probePool.connect();
    try {
      await client.query(`select set_config('app.company_id', $1, false)`, [companyA]);
      const a = await client.query<{ company_id: string }>(
        `select company_id from billing_invoice`,
      );
      expect(a.rows).toHaveLength(1);
      expect(a.rows[0].company_id).toBe(companyA);

      await client.query(`select set_config('app.company_id', $1, false)`, [companyB]);
      const b = await client.query<{ company_id: string }>(
        `select company_id from billing_invoice`,
      );
      expect(b.rows).toHaveLength(1);
      expect(b.rows[0].company_id).toBe(companyB);
    } finally {
      client.release();
    }
  });

  it('پیش از زمینهٔ اجاره، پورتال زیرِ نقشِ RLS‌پذیر نمی‌تواند کاربر را بیابد', async () => {
    // ورودِ پورتال با ایمیل انجام می‌شود، یعنی «پیش از» آنکه اجاره‌ای معلوم باشد.
    // زیرِ نقشِ RLS‌پذیر، سیاستِ portal_user به app.company_id نیاز دارد؛ پس این مسیر
    // یا خطا می‌دهد یا صفر ردیف — یعنی طراحیِ فعلی به bypass نقشِ اپ متکی است.
    expect(probePool, 'probePool باید در تستِ قبل ساخته شده باشد').toBeTruthy();
    await probePool!.query(`grant select on portal_user to "${PROBE_ROLE}"`);

    // گامِ ۱ — با زمینهٔ درست: سیاستِ portal_user برای نقشِ RLS‌پذیر کار می‌کند و
    // کاربرِ آزمون را دقیقاً با customerِ خودش برمی‌گرداند.
    const withCtx = await probePool!.connect();
    try {
      await withCtx.query(`select set_config('app.company_id', $1, false)`, [companyA]);
      const found = await withCtx.query<{ id: string; customer_id: string }>(
        `select id, customer_id from portal_user where lower(email) = lower($1)`,
        [PORTAL_EMAIL],
      );
      expect(found.rows).toHaveLength(1);
      expect(found.rows[0].id).toBe(portalUserId);
      expect(found.rows[0].customer_id).toBe(customerA);
    } finally {
      withCtx.release();
    }

    // گامِ ۲ — بدونِ زمینهٔ اجاره (اتصالِ تازه): ورودِ پورتال با ایمیل انجام می‌شود،
    // یعنی «پیش از» آنکه اجاره‌ای معلوم باشد. زیرِ نقشِ RLS‌پذیر این مسیر یا خطا
    // می‌دهد یا صفر ردیف — پس طراحیِ فعلی به bypassِ نقشِ اپ متکی است.
    const client = await probePool!.connect();
    let visible = -1;
    let threw = false;
    try {
      // اتصالِ تازه و بدونِ set_config → هیچ app.company_id ست نشده است.
      const res = await client.query<{ id: string }>(
        `select id from portal_user where lower(email) = lower($1)`,
        [PORTAL_EMAIL],
      );
      visible = res.rowCount ?? 0;
    } catch {
      threw = true;
    } finally {
      client.release();
    }
    expect(threw || visible === 0).toBe(true);
  });
});

describe('چرخشِ refresh — محافظتِ هم‌زمانی در برابرِ replay', () => {
  const makeSession = async () => {
    const refresh = crypto.randomBytes(24).toString('hex');
    const hash = crypto.createHash('sha256').update(refresh).digest('hex');
    const { rows } = await pool.query<{ id: string }>(
      `insert into portal_session (portal_user_id, company_id, refresh_hash, expires_at)
       values ($1, $2, $3, now() + interval '30 days') returning id`,
      [portalUserId, companyA, hash],
    );
    return { sessionId: rows[0].id, refresh };
  };

  it('باطل‌سازیِ اتمی: از دو فراخوانیِ هم‌زمان دقیقاً یکی rowCount=1 می‌گیرد', async () => {
    const { sessionId } = await makeSession();
    const repo = new PortalRepository(pool);
    const results = await Promise.all([repo.revokeSession(sessionId), repo.revokeSession(sessionId)]);
    expect([...results].sort()).toEqual([0, 1]);
  });

  it('دو درخواستِ هم‌زمانِ HTTP با یک refresh token → فقط یک نشستِ تازه', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/portal/auth/login')
      .send({ email: PORTAL_EMAIL, password: PORTAL_PASSWORD });
    expect(login.status).toBe(200);
    const refreshToken = login.body.refresh_token as string;
    expect(refreshToken).toBeTruthy();

    const [r1, r2] = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/portal/auth/refresh')
        .send({ refresh_token: refreshToken }),
      request(app.getHttpServer())
        .post('/api/v1/portal/auth/refresh')
        .send({ refresh_token: refreshToken }),
    ]);

    const statuses = [r1.status, r2.status].sort();
    // دقیقاً یکی موفق و یکی ۴۰۱ (refresh_reused) — بدونِ صدورِ دو نشستِ معتبر.
    expect(statuses).toEqual([200, 401]);
    const denied = r1.status === 401 ? r1 : r2;
    expect(denied.body?.code).toBe('refresh_reused');

    // توکنِ چرخش‌یافتهٔ برنده فقط یک نشستِ فعال باقی می‌گذارد.
    const { rows } = await pool.query<{ n: string }>(
      `select count(*)::text as n from portal_session
        where portal_user_id = $1 and revoked_at is null and expires_at > now()`,
      [portalUserId],
    );
    expect(Number(rows[0].n)).toBe(1);
  });

  it('استفادهٔ مجددِ ترتیبی از توکنِ مصرف‌شده رد می‌شود', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/v1/portal/auth/login')
      .send({ email: PORTAL_EMAIL, password: PORTAL_PASSWORD });
    expect(login.status).toBe(200);
    const refreshToken = login.body.refresh_token as string;

    const first = await request(app.getHttpServer())
      .post('/api/v1/portal/auth/refresh')
      .send({ refresh_token: refreshToken });
    expect(first.status).toBe(200);

    const replay = await request(app.getHttpServer())
      .post('/api/v1/portal/auth/refresh')
      .send({ refresh_token: refreshToken });
    expect(replay.status).toBe(401);
    expect(replay.body?.code).toBe('refresh_reused');
  });
});
