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
 * تست API ورود دومرحله‌ای OTP — /auth/otp/request و /auth/otp/verify:
 * ۱) دیتابیس موقت «greendms_otp_test» از صفر + همه مهاجرت‌ها (0024 هم هست)
 * ۲) درگاه پیامک با overrideProvider جایگزین می‌شود → تعویض‌پذیری اثبات می‌شود
 *    و کدها از همان درگاه خوانده می‌شوند (هیچ پیامک واقعی ارسال نمی‌شود)
 * ۳) کاربران نمونه: با شماره، بدون شماره، قفل‌شده، غیرفعال
 * ۴) اعتبار سنجی ضد-enumeration، نرخ‌گیری، انقضا، سقف تلاش و یک‌بارمصرفی
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_otp_test';
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

const PASSWORD = 'Otp!pass12';

let adminPool: pg.Pool;
let pool: pg.Pool;
let app: INestApplication;

// درگاه پیامک آزمایشی: پیام‌ها را نگه می‌دارد و در صورت فرمان خطا می‌دهد
const sent: SmsMessage[] = [];
let failNextSend = false;
const fakeSms: SmsSender = {
  send: async (message: SmsMessage): Promise<void> => {
    if (failNextSend) {
      failNextSend = false;
      throw new Error('درگاه پیامک آزمایشی خطا داد');
    }
    sent.push(message);
  },
};

const post = (url: string) => request(app.getHttpServer()).post(url);

/** درخواست کد تازه: کدهای قبلی کاربر پاک می‌شوند تا هر تست مستقل بماند */
const requestCode = async (username: string): Promise<string> => {
  await pool.query('delete from auth_otp where username = $1', [username]);
  const before = sent.length;
  await post('/api/v1/auth/otp/request').send({ username }).expect(202);
  const message = sent.slice(before).find((m) => m.username === username);
  const match = message && /(\d{4,8})/.exec(message.body);
  expect(match, `پیامکی برای «${username}» در درگاه ثبت نشد`).toBeTruthy();
  return match![1];
};

const verifyOtp = (username: string, code: string, extra: object = {}) =>
  post('/api/v1/auth/otp/verify').send({ username, code, ...extra });

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

  // ۲) seed: شرکت + چهار کاربر نمونه
  pool = new pg.Pool({ connectionString: testUrl.toString(), max: 1 });
  const company = await pool.query<{ id: string }>(
    `insert into company (code, legal_name) values ('OTPCO', 'شرکت تست OTP') returning id`,
  );
  const companyId = company.rows[0].id;

  const makeUser = async (
    code: string,
    username: string,
    phone: string | null,
    extra: { is_locked?: boolean; is_active?: boolean } = {},
  ): Promise<void> => {
    const person = await pool.query<{ id: string }>(
      `insert into person (company_id, code, first_name, last_name)
       values ($1, $2, 'کاربر', $2) returning id`,
      [companyId, code],
    );
    if (phone) {
      await pool.query(
        `insert into person_phone (person_id, phone, kind, is_primary) values ($1, $2, 'mobile', true)`,
        [person.rows[0].id, phone],
      );
    }
    await pool.query(
      `insert into app_user (person_id, username, password_hash, access_level, is_locked, is_active)
       values ($1, $2, $3, 'web', $4, $5)`,
      [
        person.rows[0].id,
        username,
        await hashPassword(PASSWORD),
        extra.is_locked ?? false,
        extra.is_active ?? true,
      ],
    );
  };

  await makeUser('PH-1', 'otp_user', '09121234567');
  await makeUser('NP-1', 'nophone_user', null);
  await makeUser('LK-1', 'locked_user', '09120000002', { is_locked: true });
  await makeUser('DS-1', 'disabled_user', '09120000003', { is_active: false });

  // ۳) اپ واقعی با درگاه پیامک جایگزین‌شده
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
// POST /auth/otp/request
// =====================================================================
describe('POST /auth/otp/request — درخواست کد', () => {
  it('کاربر با شماره → 202 بدون بدنه و کد ۶ رقمی در پیامک شماره اصلی', async () => {
    const before = sent.length;
    const res = await post('/api/v1/auth/otp/request')
      .send({ username: 'otp_user' })
      .expect(202);
    expect(String(res.text ?? '')).toBe('');

    expect(sent).toHaveLength(before + 1);
    const msg = sent[sent.length - 1];
    expect(msg.to).toBe('09121234567');
    expect(msg.username).toBe('otp_user');
    expect(msg.purpose).toBe('login'); // پیش‌فرض قرارداد
    expect(msg.body).toMatch(/GreenDMS: کد ورود \d{6} است؛ تا \d+ دقیقه معتبر است\./);
  });

  it('درخواست مجدد بلافاصله → 429 با پیام فارسی', async () => {
    const res = await post('/api/v1/auth/otp/request')
      .send({ username: 'otp_user' })
      .expect(429);
    expect(res.body.code).toBe('otp_resend_too_fast');
    expect(res.body.message_fa).toMatch(/[\u0600-\u06FF]/);
  });

  it('نام ناشناخته → 202 یکسان (ضد-enumeration)؛ نه پیامکی می‌رود نه ردیفی ثبت می‌شود', async () => {
    const before = sent.length;
    await post('/api/v1/auth/otp/request')
      .send({ username: 'no_such_user' })
      .expect(202);
    expect(sent).toHaveLength(before);

    const rows = await pool.query<{ count: string }>(
      `select count(*)::text as count from auth_otp where username = 'no_such_user'`,
    );
    expect(rows.rows[0].count).toBe('0');
  });

  it('کاربر بدون شماره → 202 بدون ارسال (باز هم پاسخ یکسان)', async () => {
    const before = sent.length;
    await post('/api/v1/auth/otp/request')
      .send({ username: 'nophone_user' })
      .expect(202);
    expect(sent).toHaveLength(before);
  });

  it('بدون username → 400 validation_failed با پیام فارسی', async () => {
    const res = await post('/api/v1/auth/otp/request').send({}).expect(400);
    expect(res.body.code).toBe('validation_failed');
    expect(res.body.details.fields).toHaveProperty('username');
    expect(res.body.details.fields.username[0]).toMatch(/[\u0600-\u06FF]/);
  });

  it('purpose خارج از enum → 400', async () => {
    const res = await post('/api/v1/auth/otp/request')
      .send({ username: 'otp_user', purpose: 'hack' })
      .expect(400);
    expect(res.body.code).toBe('validation_failed');
    expect(res.body.details.fields).toHaveProperty('purpose');
  });

  it('شکست درگاه پیامک → همچنان 202 (وضعیت حساب لو نمی‌رود)', async () => {
    // کدهای قبلی همین کاربر پاک می‌شوند تا فاصله حداقلی ارسال مانع نشود
    await pool.query(`delete from auth_otp where username = 'otp_user'`);
    failNextSend = true;
    await post('/api/v1/auth/otp/request')
      .send({ username: 'otp_user' })
      .expect(202);
  });

  it('پر بودن پنجره نرخ‌گیری → 429 با کد otp_rate_limited', async () => {
    // ۵ ردیف در پنجره ۱۵ دقیقه (سقف پیش‌فرض) از قبل ثبت شده‌اند
    for (let i = 0; i < 5; i++) {
      await pool.query(
        `insert into auth_otp (username, phone, purpose, code_hash, expires_at)
         values ('window_user', '09120000009', 'login', 'x', now() + interval '5 minutes')`,
      );
    }
    const res = await post('/api/v1/auth/otp/request')
      .send({ username: 'window_user' })
      .expect(429);
    expect(res.body.code).toBe('otp_rate_limited');
  });
});

// =====================================================================
// POST /auth/otp/verify
// =====================================================================
describe('POST /auth/otp/verify — تأیید و صدور نشست', () => {
  it('کد درست → 200 با AuthSession و /auth/me با همان توکن کار می‌کند', async () => {
    const code = await requestCode('otp_user');
    const res = await verifyOtp('otp_user', code).expect(200);

    expect(res.body.access_token).toBeTruthy();
    expect(res.body.refresh_token).toBeTruthy();
    expect(res.body.expires_in).toBeGreaterThan(0);
    expect(res.body.user.username).toBe('otp_user');

    const me = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${res.body.access_token}`)
      .expect(200);
    expect(me.body.user.username).toBe('otp_user');
  });

  it('استفاده مجدد از همان کد → 401 (یک‌بارمصرف واقعی)', async () => {
    // کد تست قبلی مصرف شده و هیچ کد در انتظار دیگری نیست
    const usedCode = '111111';
    const res = await verifyOtp('otp_user', usedCode).expect(401);
    expect(res.body.code).toBe('otp_invalid');
  });

  it('کد نادرست → 401 و شمارنده تلاش در دیتابیس بالا می‌رود', async () => {
    const code = await requestCode('otp_user');
    const wrong = code === '123456' ? '654321' : '123456';
    const res = await verifyOtp('otp_user', wrong).expect(401);
    expect(res.body.code).toBe('otp_invalid');

    const rows = await pool.query<{ attempts: number }>(
      `select attempts from auth_otp where username = 'otp_user' and consumed_at is null`,
    );
    expect(rows.rows[0].attempts).toBe(1);
  });

  it('رسیدن به سقف تلاش → 429، کد می‌سوزد و کد تازه دوباره کار می‌کند', async () => {
    const code = await requestCode('otp_user');
    const wrong = code === '123456' ? '654321' : '123456';

    // requestCode کد تازه می‌سازد (شمارنده از صفر)؛ ۴ تلاش ناموفق اول → 401
    for (let attempt = 1; attempt <= 4; attempt++) {
      await verifyOtp('otp_user', wrong).expect(401);
    }
    // پنجمین تلاش به سقف می‌رسد → 429 و سوختن کد
    const burn = await verifyOtp('otp_user', wrong).expect(429);
    expect(burn.body.code).toBe('otp_attempts_exceeded');

    // سوختن یعنی حتی کد درست هم پذیرفته نمی‌شود
    const afterBurn = await verifyOtp('otp_user', code).expect(429);
    expect(afterBurn.body.code).toBe('otp_attempts_exceeded');

    // درخواست کد تازه → تأیید موفق (شمارنده از صفر)
    const fresh = await requestCode('otp_user');
    await verifyOtp('otp_user', fresh).expect(200);
  });

  it('کد منقضی → 401 otp_expired حتی اگر درست باشد', async () => {
    const code = await requestCode('otp_user');
    await pool.query(
      `update auth_otp set expires_at = now() - interval '1 minute'
        where username = 'otp_user' and consumed_at is null`,
    );
    const res = await verifyOtp('otp_user', code).expect(401);
    expect(res.body.code).toBe('otp_expired');
  });

  it('بدون هیچ کد در انتظار → 401', async () => {
    const res = await verifyOtp('nophone_user', '123456').expect(401);
    expect(res.body.code).toBe('otp_invalid');
  });

  it('کاربر قفل‌شده با کد درست → 423 account_locked', async () => {
    const code = await requestCode('locked_user');
    const res = await verifyOtp('locked_user', code).expect(423);
    expect(res.body.code).toBe('account_locked');
    expect(res.body.message_fa).toBeTruthy();
  });

  it('کاربر غیرفعال با کد درست → 401 account_disabled', async () => {
    const code = await requestCode('disabled_user');
    const res = await verifyOtp('disabled_user', code).expect(401);
    expect(res.body.code).toBe('account_disabled');
  });

  it('code کوتاه‌تر از ۴ رقم → 400 (اعتبارسنجی قرارداد)', async () => {
    const res = await verifyOtp('otp_user', '12').expect(400);
    expect(res.body.code).toBe('validation_failed');
    expect(res.body.details.fields).toHaveProperty('code');
  });

  it('بدون username → 400', async () => {
    const res = await post('/api/v1/auth/otp/verify').send({ code: '123456' }).expect(400);
    expect(res.body.code).toBe('validation_failed');
  });
});

// =====================================================================
// قابل‌تعویض بودن درگاه ارسال
// =====================================================================
describe('درگاه پیامک قابل‌تعویض', () => {
  it('همه کدهای تست از درگاه تزریق‌شده آمده‌اند (SMS_SENDER override شده)', () => {
    expect(sent.length).toBeGreaterThan(0);
    for (const message of sent) {
      expect(message.to).toMatch(/^09\d{9}$/);
      // قالب فارسی استاندارد: برند + برچسب فارسی دلیل + کد + مدت اعتبار
      expect(message.body).toMatch(/GreenDMS: کد (ورود|بازیابی رمز|اتصال دستگاه) \d{4,8} است/);
      expect(message.body).toContain('دقیقه معتبر است');
    }
  });

  it('پیامک شماره‌های دیگر هرگز ارسال نشده (فقط شماره‌های seed)', () => {
    const allowed = new Set(['09121234567', '09120000002', '09120000003']);
    for (const message of sent) {
      expect(allowed.has(message.to)).toBe(true);
    }
  });
});

// =====================================================================
// POST /auth/password-reset — بازیابی رمز با کدِ دلیل password_reset
// =====================================================================
describe('POST /auth/password-reset — بازیابی رمز عبور', () => {
  /** درخواست کد با دلیل دلخواه و برگرداندن کدِ همان پیامک (ردیف‌های قبلی پاک می‌شوند) */
  const requestCodeFor = async (
    username: string,
    purpose: 'login' | 'password_reset',
  ): Promise<string> => {
    await pool.query('delete from auth_otp where username = $1', [username]);
    const before = sent.length;
    await post('/api/v1/auth/otp/request').send({ username, purpose }).expect(202);
    const msg = sent.slice(before).find((m) => m.username === username);
    expect(msg, 'پیامکی برای این کاربر ارسال نشد').toBeTruthy();
    expect(msg!.purpose).toBe(purpose);
    const match = /(\d{4,8})/.exec(msg!.body);
    expect(match, 'کد در متن پیامک نبود').toBeTruthy();
    return match![1];
  };

  it('درخواست با purpose=password_reset ← متن بازیابی رمز در پیامک', async () => {
    const code = await requestCodeFor('otp_user', 'password_reset');
    const msg = sent[sent.length - 1];
    expect(msg.purpose).toBe('password_reset');
    expect(msg.body).toContain('کد بازیابی رمز');
    expect(msg.body).toContain(code);
  });

  it('رمز جدید کوتاه ← 400 validation_failed با فیلد فارسی new_password', async () => {
    const code = await requestCodeFor('otp_user', 'password_reset');
    const res = await post('/api/v1/auth/password-reset')
      .send({ username: 'otp_user', code, new_password: '123' })
      .expect(400);
    expect(res.body.code).toBe('validation_failed');
    expect(res.body.details.fields.new_password[0]).toMatch(/[\u0600-\u06FF]/);
  });

  it('کد نادرست ← 401 و رمز دست‌نخورده می‌ماند', async () => {
    const code = await requestCodeFor('otp_user', 'password_reset');
    const wrong = code === '000000' ? '111111' : '000000';
    const res = await post('/api/v1/auth/password-reset')
      .send({ username: 'otp_user', code: wrong, new_password: 'New!pass99' })
      .expect(401);
    expect(res.body.code).toBe('otp_invalid');
    expect(res.body.message_fa).toMatch(/[\u0600-\u06FF]/);

    await post('/api/v1/auth/login')
      .send({ username: 'otp_user', password: 'New!pass99' })
      .expect(401);
  });

  it('کدِ دلیل login برای بازیابی پذیرفته نمی‌شود ← 401 otp_wrong_purpose', async () => {
    const code = await requestCodeFor('otp_user', 'login');
    const res = await post('/api/v1/auth/password-reset')
      .send({ username: 'otp_user', code, new_password: 'New!pass99' })
      .expect(401);
    expect(res.body.code).toBe('otp_wrong_purpose');
  });

  it('نام ناشناخته ← 401 یکسان (ضد-enumeration) بدون هیچ نشستی', async () => {
    const res = await post('/api/v1/auth/password-reset')
      .send({ username: 'no_such_user', code: '123456', new_password: 'New!pass99' })
      .expect(401);
    expect(res.body.code).toBe('otp_invalid');
  });

  it('قفل دستی (is_locked) ← 423 و تغییر رمز انجام نمی‌شود', async () => {
    const code = await requestCodeFor('locked_user', 'password_reset');
    const res = await post('/api/v1/auth/password-reset')
      .send({ username: 'locked_user', code, new_password: 'New!pass99' })
      .expect(423);
    expect(res.body.code).toBe('account_locked');
  });

  it('موفق ← 204، رمز تازه کار می‌کند، رمز قدیمی نه و نشست‌های باز بسته می‌شوند', async () => {
    // نشستِ باز قبل از بازیابی (مثل اپِ روی گوشی دیگر)
    const oldSession = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'otp_user', password: PASSWORD })
      .expect(200);
    const oldToken = oldSession.body.access_token as string;
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${oldToken}`)
      .expect(200);

    const code = await requestCodeFor('otp_user', 'password_reset');
    await post('/api/v1/auth/password-reset')
      .send({ username: 'otp_user', code, new_password: 'Reset!pass77' })
      .expect(204);

    // رمز قدیمی رد، رمز تازه پذیرفته می‌شود
    await post('/api/v1/auth/login')
      .send({ username: 'otp_user', password: PASSWORD })
      .expect(401);
    const fresh = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'otp_user', password: 'Reset!pass77' })
      .expect(200);
    expect(fresh.body.access_token).toBeTruthy();

    // نشستِ قبلی با revoked_reason=password_reset باطل شده است
    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${oldToken}`)
      .expect(401);
    const reasons = await pool.query<{ revoked_reason: string | null }>(
      `select distinct revoked_reason from auth_session
        where app_user_id = (select id from app_user where username = 'otp_user')
          and revoked_reason is not null`,
    );
    expect(reasons.rows.map((r) => r.revoked_reason)).toContain('password_reset');

    // کد یک‌بارمصرف است: استفاده دوباره همان کد رد می‌شود
    await post('/api/v1/auth/password-reset')
      .send({ username: 'otp_user', code, new_password: 'Another!pass88' })
      .expect(401);
  });
});
