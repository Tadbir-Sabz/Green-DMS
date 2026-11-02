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
import type { SmsMessage, SmsSender } from '../src/modules/identity-rbac/sms-sender';
import { SMS_SENDER } from '../src/modules/identity-rbac/tokens';

/**
 * تست API دستگاه‌های مجاز — /devices و device_bind در /auth/otp/verify:
 * ۱) دیتابیس موقت «greendms_devices_test» از صفر + همه مهاجرت‌ها (0012 device و 0025 دلیل ابطال)
 * ۲) ثبت/فهرست/ابطال دستگاه با جداسازی کامل بین دو کاربر
 * ۳) باندینگ فقط با کد پیامکی purpose=device_bind و مالکیت/ابطال دستگاه
 * ۴) ابطال دستگاه نشست‌های باز آن را می‌بندد (refresh → 401)
 * ۵) صفحه‌بندی cursor و پوشش اسکیمای Device در پاسخ‌ها
 * ۶) تزریق بین دو کاربر واقعی: کدِ یکی دستگاه دیگری را نمی‌بندد و کد نمی‌سوزد؛
 *    کد قربانی با نام کاربر مهاجم پذیرفته نمی‌شود؛ ابطال دستگاه، نشستِ متصل
 *    به همان دستگاه را در همان لحظه می‌بندد (نه فقط با refresh بعدی)
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_devices_test';
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

const PASSWORD = 'Device!pass12';
const OWNER = 'dev_owner';
const OTHER = 'dev_other';

let adminPool: pg.Pool;
let pool: pg.Pool;
let app: INestApplication;

/** درگاه پیامک آزمایشی: کدها را نگه می‌دارد (بدون ارسال واقعی) */
const sent: SmsMessage[] = [];
const fakeSms: SmsSender = {
  send: async (message: SmsMessage): Promise<void> => {
    sent.push(message);
  },
};

const post = (url: string) => request(app.getHttpServer()).post(url);

const login = async (username: string): Promise<{ access: string; refresh: string }> => {
  const res = await post('/api/v1/auth/login').send({ username, password: PASSWORD }).expect(200);
  return { access: res.body.access_token, refresh: res.body.refresh_token };
};

/** درخواست کد تازه: ردیف‌های قبلی کاربر پاک می‌شوند تا نرخ‌گیری بین تست‌ها مزاحم نشود */
const requestCode = async (
  username: string,
  purpose: string,
  extra: object = {},
): Promise<string> => {
  await pool.query('delete from auth_otp where username = $1', [username]);
  const before = sent.length;
  await post('/api/v1/auth/otp/request').send({ username, purpose, ...extra }).expect(202);
  const message = sent.slice(before).find((m) => m.username === username);
  const match = message && /(\d{4,8})/.exec(message.body);
  expect(match, `پیامکی برای «${username}» در درگاه ثبت نشد`).toBeTruthy();
  return match![1];
};

const verifyOtp = (username: string, code: string, extra: object = {}) =>
  post('/api/v1/auth/otp/verify').send({ username, code, ...extra });

/**
 * هدر Bearer کاربر. توکن را **پیش از** ساخت زنجیره درخواست بگیرید: اگر await داخل
 * زنجیره supertest باشد، سرور آزمایشی پیش از dispatch بسته می‌شود و درخواست
 * با «address of null» می‌شکند (race در serverStates سوپرتست).
 */
const bearerOf = async (username: string): Promise<string> =>
  `Bearer ${(await login(username)).access}`;

beforeAll(async () => {
  // ۱) دیتابیس موقت تمیز + همه مهاجرت‌ها در یک تراکنش
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

  // ۲) seed: شرکت + دو کاربر (هر دو شماره موبایل دارند تا device_bind بشود)
  pool = new pg.Pool({ connectionString: testUrl.toString(), max: 1 });
  const company = await pool.query<{ id: string }>(
    `insert into company (code, legal_name) values ('DEVCOS', 'شرکت تست دستگاه') returning id`,
  );
  const companyId = company.rows[0].id;

  const makeUser = async (code: string, username: string, phone: string): Promise<void> => {
    const person = await pool.query<{ id: string }>(
      `insert into person (company_id, code, first_name, last_name)
       values ($1, $2, 'کاربر', $2) returning id`,
      [companyId, code],
    );
    await pool.query(
      `insert into person_phone (person_id, phone, kind, is_primary) values ($1, $2, 'mobile', true)`,
      [person.rows[0].id, phone],
    );
    await pool.query(
      `insert into app_user (person_id, username, password_hash, access_level)
       values ($1, $2, $3, 'web')`,
      [person.rows[0].id, username, await hashPassword(PASSWORD)],
    );
    await pool.query(
      `insert into user_role (app_user_id, role_id)
       select u.id, $1 from app_user u where u.username = $2`,
      [roleId, username],
    );
  };

  // نقش واحد با همه مجوزها برای هر دو کاربر (قید یکتایی نقش اجازه ساخت دوباره نمی‌دهد)
  const role = await pool.query<{ id: string }>(
    `insert into role (company_id, code, name) values ($1, 'admin_full', 'مدیر کامل') returning id`,
    [companyId],
  );
  const roleId = role.rows[0].id;
  await pool.query(
    `insert into role_permission (role_id, permission_code) select $1, code from permission`,
    [roleId],
  );

  await makeUser('DVP-1', OWNER, '09121110001');
  await makeUser('DVP-2', OTHER, '09121110002');

  // ۳) اپ واقعی با درگاه پیامک آزمایشی
  process.env.DATABASE_URL = testUrl.toString();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_SENDER)
    .useValue(fakeSms)
    .compile();
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

// =====================================================================
// A) نگهبان مسیرها: همه‌چیز احراز هویت می‌خواهد
// =====================================================================
describe('A — احراز هویت /devices', () => {
  it('بدون توکن هر سه مسیر 401 می‌دهند', async () => {
    await request(app.getHttpServer()).get('/api/v1/devices').expect(401);
    await post('/api/v1/devices')
      .send({ device_uuid: 'unauth-1', platform: 'android', app_kind: 'sales' })
      .expect(401);
    await request(app.getHttpServer())
      .delete('/api/v1/devices/00000000-0000-4000-8000-000000000000')
      .expect(401);
  });

  it('توکن نامعتبر هم 401 می‌دهد', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/devices')
      .set('Authorization', 'Bearer not.a.valid.jwt')
      .expect(401);
  });
});

// =====================================================================
// B) ثبت، فهرست، صفحه‌بندی و جداسازی کاربران
// =====================================================================
describe('B — ثبت و فهرست دستگاه‌ها', () => {
  let ownerToken = '';
  let otherToken = '';
  let deviceB = '';

  it('پیش از ثبت، فهرست خالی است', async () => {
    ownerToken = (await login(OWNER)).access;
    otherToken = (await login(OTHER)).access;
    const res = await request(app.getHttpServer())
      .get('/api/v1/devices')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(res.body).toMatchObject({ items: [], next_cursor: null, has_more: false });
  });

  it('POST /devices دستگاه را با is_trusted=false ثبت می‌کند', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/devices')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        device_uuid: 'a1b2c3d4-owner-phone',
        platform: 'android',
        app_kind: 'sales',
        app_version: '1.4.0',
        os_version: '14',
      })
      .expect(201);
    expect(res.body).toMatchObject({
      device_uuid: 'a1b2c3d4-owner-phone',
      platform: 'android',
      app_kind: 'sales',
      app_version: '1.4.0',
      is_trusted: false,
      revoked_at: null,
    });
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.created_at).toBeTruthy();
  });

  it('بدنه ناقص با code=validation_failed و پیام فارسی رد می‌شود', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/devices')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ platform: 'android' })
      .expect(400);
    expect(res.body.code).toBe('validation_failed');
    expect(res.body.message_fa).toBeTruthy();
    expect(res.body.message_fa).not.toBe('Bad Request');
  });

  it('platform خارج از enum قرارداد رد می‌شود', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/devices')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ device_uuid: 'x-1', platform: 'ios', app_kind: 'sales' })
      .expect(400);
    expect(res.body.code).toBe('validation_failed');
  });

  it('ثبت همان device_uuid دوباره 409 device_exists می‌دهد', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/devices')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ device_uuid: 'a1b2c3d4-owner-phone', platform: 'android', app_kind: 'sales' })
      .expect(409);
    expect(res.body.code).toBe('device_exists');
  });

  it('دستگاه کاربر دیگر برای این کاربر 409 device_taken می‌دهد', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/devices')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ device_uuid: 'a1b2c3d4-owner-phone', platform: 'android', app_kind: 'sales' })
      .expect(409);
    expect(res.body.code).toBe('device_taken');
  });

  it('هر کاربر فقط دستگاه‌های خودش را می‌بیند', async () => {
    // دستگاه دوم مالک + دستگاه کاربر دیگر
    const a = await request(app.getHttpServer())
      .post('/api/v1/devices')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ device_uuid: 'e5f6-owner-tablet', platform: 'android', app_kind: 'delivery' })
      .expect(201);
    deviceB = a.body.id;
    const c = await request(app.getHttpServer())
      .post('/api/v1/devices')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ device_uuid: 'c7d8-other-phone', platform: 'android', app_kind: 'telesales' })
      .expect(201);

    const mine = await request(app.getHttpServer())
      .get('/api/v1/devices')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    const uuids = mine.body.items.map((d: { device_uuid: string }) => d.device_uuid);
    expect(uuids).toContain('a1b2c3d4-owner-phone');
    expect(uuids).toContain('e5f6-owner-tablet');
    expect(uuids).not.toContain('c7d8-other-phone');

    const theirs = await request(app.getHttpServer())
      .get('/api/v1/devices')
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(200);
    expect(theirs.body.items.map((d: { id: string }) => d.id)).toEqual([c.body.id]);
  });

  it('صفحه‌بندی cursor دستگاه‌های تکراری نشان نمی‌دهد', async () => {
    const page1 = await request(app.getHttpServer())
      .get('/api/v1/devices?limit=1')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(page1.body.items).toHaveLength(1);
    expect(page1.body.has_more).toBe(true);
    expect(page1.body.next_cursor).toBeTruthy();

    const page2 = await request(app.getHttpServer())
      .get(`/api/v1/devices?limit=1&cursor=${encodeURIComponent(page1.body.next_cursor)}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(page2.body.items).toHaveLength(1);
    expect(page2.body.items[0].id).not.toBe(page1.body.items[0].id);
    expect(page2.body.has_more).toBe(false);
    expect(page2.body.next_cursor).toBeNull();
  });

  it('DELETE شناسه خراب 400 و ناموجود 404 می‌دهد', async () => {
    await request(app.getHttpServer())
      .delete('/api/v1/devices/نه-uuid')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(400);
    await request(app.getHttpServer())
      .delete('/api/v1/devices/00000000-0000-4000-8000-000000000001')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(404);
  });

  it('ابطال دستگاه مالک دیگر 404 می‌دهد (درز ندارد)', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/devices/${deviceB}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(404);
    expect(res.body.code).toBe('device_not_found');
    // دستگاه سر جایش است
    const still = await request(app.getHttpServer())
      .get('/api/v1/devices')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(still.body.items.some((d: { id: string }) => d.id === deviceB)).toBe(true);
  });
});

// =====================================================================
// C) device_bind: باندینگ فقط با کد پیامکی و مالکیت درست
// =====================================================================
describe('C — باندینگ دستگاه با کد پیامکی', () => {
  let ownerDevice = '';
  let otherDevice = '';
  let boundRefresh = '';

  it('device_id برای purpose غیر device_bind پذیرفته نمی‌شود', async () => {
    const ownerAuth = await bearerOf(OWNER);
    const otherAuth = await bearerOf(OTHER);
    const devices = await request(app.getHttpServer())
      .get('/api/v1/devices')
      .set('Authorization', ownerAuth)
      .expect(200);
    ownerDevice = devices.body.items.find(
      (d: { device_uuid: string }) => d.device_uuid === 'a1b2c3d4-owner-phone',
    ).id;
    const others = await request(app.getHttpServer())
      .get('/api/v1/devices')
      .set('Authorization', otherAuth)
      .expect(200);
    otherDevice = others.body.items[0].id;

    const code = await requestCode(OWNER, 'login');
    const res = await verifyOtp(OWNER, code, { device_id: ownerDevice }).expect(400);
    expect(res.body.code).toBe('device_bind_purpose');
  });

  it('device_id ناشناخته با 400 رد می‌شود و کد نمی‌سوزد', async () => {
    const code = await requestCode(OWNER, 'device_bind', { device_id: ownerDevice });
    const res = await verifyOtp(OWNER, code, {
      device_id: '00000000-0000-4000-8000-000000000099',
    }).expect(400);
    expect(res.body.code).toBe('device_not_registered');
    // همان کد هنوز معتبر است → با دستگاه درست بسته می‌شود
    const ok = await verifyOtp(OWNER, code, { device_id: ownerDevice }).expect(200);
    expect(ok.body.access_token).toBeTruthy();
    boundRefresh = ok.body.refresh_token;
  });

  it('باندینگ موفق is_trusted را true و نشست را قابل تازه‌سازی می‌کند', async () => {
    const ownerAuth = await bearerOf(OWNER);
    const res = await request(app.getHttpServer())
      .get('/api/v1/devices')
      .set('Authorization', ownerAuth)
      .expect(200);
    const row = res.body.items.find((d: { id: string }) => d.id === ownerDevice);
    expect(row.is_trusted).toBe(true);

    const refreshed = await post('/api/v1/auth/refresh')
      .send({ refresh_token: boundRefresh })
      .expect(200);
    expect(refreshed.body.access_token).toBeTruthy();
  });

  it('device_id متعلق به کاربر دیگر با 403 رد می‌شود', async () => {
    const code = await requestCode(OWNER, 'device_bind', { device_id: ownerDevice });
    const res = await verifyOtp(OWNER, code, { device_id: otherDevice }).expect(403);
    expect(res.body.code).toBe('device_not_owned');
  });

  it('device_bind بدون device_id هم کار می‌کند (باندینگ اختیاری)', async () => {
    const code = await requestCode(OTHER, 'device_bind');
    const res = await verifyOtp(OTHER, code).expect(200);
    expect(res.body.access_token).toBeTruthy();
    expect(res.body.user.username).toBe(OTHER);
  });
});

// =====================================================================
// D) ابطال: نشست‌ها می‌بندد، ردیف می‌ماند، دوباره قابل ثبت است
// =====================================================================
describe('D — ابطال دستگاه از راه دور', () => {
  let ownerToken = '';
  let ownerDevice = '';
  let revokedRefresh = '';

  it('کد device_bind روی دستگاه باطل‌شده 403 device_revoked می‌دهد', async () => {
    // نشستی روی دستگاه می‌سازیم تا بعد از ابطال بسته‌شدن را بسنجیم
    const code = await requestCode(OWNER, 'device_bind');
    const ownerAuth = await bearerOf(OWNER);
    const devices = await request(app.getHttpServer())
      .get('/api/v1/devices')
      .set('Authorization', ownerAuth)
      .expect(200);
    ownerDevice = devices.body.items.find(
      (d: { device_uuid: string }) => d.device_uuid === 'a1b2c3d4-owner-phone',
    ).id;
    const session = await verifyOtp(OWNER, code, { device_id: ownerDevice }).expect(200);
    revokedRefresh = session.body.refresh_token;
    ownerToken = session.body.access_token;

    // اکنون ابطال
    await request(app.getHttpServer())
      .delete(`/api/v1/devices/${ownerDevice}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);

    const next = await requestCode(OWNER, 'device_bind', { device_id: ownerDevice });
    const res = await verifyOtp(OWNER, next, { device_id: ownerDevice }).expect(403);
    expect(res.body.code).toBe('device_revoked');
  });

  it('نشست‌های دستگاه باطل‌شده می‌بندد (refresh → 401)', async () => {
    const res = await post('/api/v1/auth/refresh')
      .send({ refresh_token: revokedRefresh })
      .expect(401);
    expect(res.body.code).toBe('invalid_refresh_token');
  });

  it('دستگاه باطل‌شده در فهرست revoked_at دارد و is_trusted آن false است', async () => {
    const ownerAuth = await bearerOf(OWNER);
    const res = await request(app.getHttpServer())
      .get('/api/v1/devices')
      .set('Authorization', ownerAuth)
      .expect(200);
    const row = res.body.items.find((d: { id: string }) => d.id === ownerDevice);
    expect(row.revoked_at).toBeTruthy();
    expect(row.is_trusted).toBe(false);
  });

  it('DELETE تکراری هم 204 است (idempotent) و ابطال دوباره ثبت نمی‌شود', async () => {
    const token = (await login(OWNER)).access;
    await request(app.getHttpServer())
      .delete(`/api/v1/devices/${ownerDevice}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    const res = await request(app.getHttpServer())
      .get('/api/v1/devices')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const row = res.body.items.find((d: { id: string }) => d.id === ownerDevice);
    // فقط یک ردیف برای همان device_uuid می‌ماند (revive همان ردیف را برمی‌گرداند)
    const same = res.body.items.filter(
      (d: { device_uuid: string }) => d.device_uuid === 'a1b2c3d4-owner-phone',
    );
    expect(same).toHaveLength(1);
    expect(row.revoked_at).toBeTruthy();
  });

  it('ثبت مجدد دستگاه باطل‌شده همان ردیف را دوباره فعال می‌کند', async () => {
    const ownerAuth = await bearerOf(OWNER);
    const res = await request(app.getHttpServer())
      .post('/api/v1/devices')
      .set('Authorization', ownerAuth)
      .send({
        device_uuid: 'a1b2c3d4-owner-phone',
        platform: 'android',
        app_kind: 'sales',
        app_version: '1.4.1',
      })
      .expect(201);
    expect(res.body.id).toBe(ownerDevice);
    expect(res.body.revoked_at).toBeNull();
    expect(res.body.is_trusted).toBe(false); // باندینگ باید دوباره با کد پیامکی انجام شود
    expect(res.body.app_version).toBe('1.4.1');
  });
});

// =====================================================================
// E) تزریق بین دو کاربر واقعی: مالکیت دستگاه + فوریت بستن نشست
// =====================================================================
describe('E — تزریق دستگاه بین دو کاربر', () => {
  let attackerDevice = ''; // دستگاه کاربر اول (OWNER)
  let victimDevice = ''; // دستگاه کاربر دوم (OTHER)
  let attackerAccess = ''; // نشستی که کاربر اول روی دستگاه خودش بسته است
  let victimAccess = ''; // نشستِ متصل به دستگاه قربانی
  let victimRefresh = '';

  it('هر دو کاربر دستگاه خودشان را با is_trusted=false ثبت می‌کنند', async () => {
    // توکن‌ها پیش از ساخت زنجیره درخواست گرفته می‌شوند (race سوپرتست)
    const attackerAuth = await bearerOf(OWNER);
    const victimAuth = await bearerOf(OTHER);
    const mine = await request(app.getHttpServer())
      .post('/api/v1/devices')
      .set('Authorization', attackerAuth)
      .send({ device_uuid: 'inject-owner-01', platform: 'android', app_kind: 'sales' })
      .expect(201);
    attackerDevice = mine.body.id;

    const theirs = await request(app.getHttpServer())
      .post('/api/v1/devices')
      .set('Authorization', victimAuth)
      .send({ device_uuid: 'inject-other-01', platform: 'android', app_kind: 'delivery' })
      .expect(201);
    victimDevice = theirs.body.id;

    expect(mine.body.is_trusted).toBe(false);
    expect(theirs.body.is_trusted).toBe(false);
    expect(attackerDevice).not.toBe(victimDevice);
  });

  it('کد device_bind کاربر اول، دستگاه کاربر دوم را نمی‌بندد و کد نمی‌سوزد', async () => {
    // مهاجم کدی برای دستگاهِ خودش می‌گیرد و با آن دستگاهِ قربانی را هدف می‌گیرد
    const code = await requestCode(OWNER, 'device_bind', { device_id: attackerDevice });
    const injected = await verifyOtp(OWNER, code, { device_id: victimDevice }).expect(403);
    expect(injected.body.code).toBe('device_not_owned');

    // دستگاه قربانی دست‌نخورده می‌ماند: نه مورد اعتماد می‌شود، نه باطل
    const victimAuth = await bearerOf(OTHER);
    const before = await request(app.getHttpServer())
      .get('/api/v1/devices')
      .set('Authorization', victimAuth)
      .expect(200);
    const row = before.body.items.find((d: { id: string }) => d.id === victimDevice);
    expect(row).toBeTruthy();
    expect(row.is_trusted).toBe(false);
    expect(row.revoked_at).toBeNull();

    // کد مصرف نشده است: همان کد با دستگاهِ خودِ مهاجم بسته می‌شود و نشست می‌گیرد
    const ok = await verifyOtp(OWNER, code, { device_id: attackerDevice }).expect(200);
    expect(ok.body.user.username).toBe(OWNER);
    attackerAccess = ok.body.access_token;

    const mineAfter = await request(app.getHttpServer())
      .get('/api/v1/devices')
      .set('Authorization', `Bearer ${attackerAccess}`)
      .expect(200);
    expect(
      mineAfter.body.items.find((d: { id: string }) => d.id === attackerDevice).is_trusted,
    ).toBe(true);
  });

  it('کد قربانی با نام کاربر مهاجم پذیرفته نمی‌شود و کد دست‌نخورده می‌ماند', async () => {
    await pool.query('delete from auth_otp where username = $1', [OWNER]); // مهاجم کدِ در انتظار نداشته باشد
    const victimCode = await requestCode(OTHER, 'device_bind');

    // مهاجم کدِ قربانی را با نام خودش و دستگاهِ قربانی می‌فرستد → رد می‌شود
    const res = await verifyOtp(OWNER, victimCode, { device_id: victimDevice }).expect(401);
    expect(res.body.code).toBe('otp_invalid');

    // کد قربانی هنوز سالم است: خودِ او با دستگاهِ خودش باندینگ را کامل می‌کند
    const legit = await verifyOtp(OTHER, victimCode, { device_id: victimDevice }).expect(200);
    expect(legit.body.user.username).toBe(OTHER);
    victimAccess = legit.body.access_token;
    victimRefresh = legit.body.refresh_token;
  });

  it('نشستِ متصل به دستگاه، device_id همان دستگاه را دارد و همان لحظه کار می‌کند', async () => {
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${victimAccess}`)
      .expect(200);
    expect(me.body.user.username).toBe(OTHER);

    const devices = await request(app.getHttpServer())
      .get('/api/v1/devices')
      .set('Authorization', `Bearer ${victimAccess}`)
      .expect(200);
    expect(devices.body.items.find((d: { id: string }) => d.id === victimDevice).is_trusted).toBe(
      true,
    );

    // نشستِ همین دستگاه در دیتابیس با device_id ثبت شده است (پایهٔ ابطال 0025)
    const sessions = await pool.query<{ id: string; revoked_at: string | null }>(
      'select id, revoked_at from auth_session where device_id = $1',
      [victimDevice],
    );
    expect(sessions.rows).toHaveLength(1);
    expect(sessions.rows[0].revoked_at).toBeNull();
  });

  it('ابطال دستگاه، نشستِ متصل را در همان لحظه می‌بندد (بدون نیاز به refresh)', async () => {
    // پیش از ابطال، نشست کاملاً زنده است
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${victimAccess}`)
      .expect(200);

    const victimAuth = await bearerOf(OTHER);
    await request(app.getHttpServer())
      .delete(`/api/v1/devices/${victimDevice}`)
      .set('Authorization', victimAuth)
      .expect(204);

    // همان لحظه، با همان توکنی که ثانیه‌ای پیش کار می‌کرد:
    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${victimAccess}`)
      .expect(401);
    expect(me.body.code).toBe('session_revoked');

    // هر مسیر محافظت‌شدهٔ دیگری هم همان لحظه بسته می‌شود
    await request(app.getHttpServer())
      .get('/api/v1/devices')
      .set('Authorization', `Bearer ${victimAccess}`)
      .expect(401);

    // و refresh هم دیگر کار نمی‌کند
    const refreshed = await post('/api/v1/auth/refresh')
      .send({ refresh_token: victimRefresh })
      .expect(401);
    expect(refreshed.body.code).toBe('invalid_refresh_token');

    // دلیل ابطال در دیتابیس همان device_revoked است (مهاجرت 0025)
    const row = await pool.query<{ revoked_reason: string }>(
      `select revoked_reason from auth_session
        where device_id = $1 and revoked_at is not null
        order by revoked_at desc limit 1`,
      [victimDevice],
    );
    expect(row.rows[0]?.revoked_reason).toBe('device_revoked');

    // ابطالِ دستگاهِ قربانی روی نشستِ مهاجم اثری ندارد (دستگاهش هنوز باطل نشده)
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${attackerAccess}`)
      .expect(200);
  });
});
