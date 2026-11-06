import { describe, expect, it, vi } from 'vitest';
import {
  assertProductionConfig,
  collectProductionConfigProblems,
  MIN_JWT_SECRET_LENGTH,
} from '../src/config/production-config';

/**
 * TASK-19 — Phase 2B: اعتبارسنجیِ fail-closedِ پیکربندیِ production.
 * قواعد: رمزِ جای‌نگه‌دار/پیش‌فرض/کوتاه رد می‌شود؛ SMS_PROVIDER=log فقط با اذعانِ صریح؛
 * هیچ مقدارِ رمزی در پیام‌ها چاپ نمی‌شود؛ بیرونِ از production هیچ اثری نیست.
 */

const GOOD_JWT = '9f2b7c1d4e6a8b0c2d4e6f8a1b3c5d7e9f0a2b4c6d8e0f1a3b5c7d9e'; // 56 نویسه، متنوع
const PROD = { NODE_ENV: 'production' };

const healthyEnv = (): Record<string, string> => ({
  ...PROD,
  JWT_SECRET: GOOD_JWT,
  APP_DATABASE_URL: 'postgres://dms_app:S7rongRandomPw9x@postgres:5432/greendms',
  DATABASE_URL: 'postgres://dms_migrator:An0therRandomPw4z@postgres:5432/greendms',
  SMS_PROVIDER: 'http',
  SMS_GATEWAY: 'kavenegar',
  SMS_API_KEY: 'gateway-key-123',
});

describe('collectProductionConfigProblems', () => {
  it('بیرون از production همیشه خالی است (راحتیِ توسعه)', () => {
    expect(collectProductionConfigProblems({ NODE_ENV: 'test' })).toEqual([]);
    expect(collectProductionConfigProblems({ NODE_ENV: 'development', JWT_SECRET: 'x' })).toEqual([]);
  });

  it('پیکربندیِ سالم ⇒ بدون مشکل', () => {
    expect(collectProductionConfigProblems(healthyEnv())).toEqual([]);
  });

  it('نبودِ JWT_SECRET ⇒ مشکل', () => {
    const env = healthyEnv();
    delete env.JWT_SECRET;
    expect(collectProductionConfigProblems(env).join('\n')).toMatch(/JWT_SECRET/);
  });

  it('JWT_SECRET جای‌نگه‌دار/پیش‌فرض ⇒ مشکل', () => {
    for (const bad of ['CHANGE_ME_IN_PRODUCTION', 'REPLACE_WITH_RANDOM_64_CHARS', 'changeme']) {
      const env = { ...healthyEnv(), JWT_SECRET: bad };
      expect(collectProductionConfigProblems(env).length).toBeGreaterThan(0);
    }
  });

  it(`JWT_SECRET کوتاه‌تر از ${MIN_JWT_SECRET_LENGTH} ⇒ مشکل`, () => {
    const env = { ...healthyEnv(), JWT_SECRET: 'abc123def456' };
    expect(collectProductionConfigProblems(env).join('\n')).toMatch(/کوتاه/);
  });

  it('JWT_SECRET تک‌نویسه ⇒ مشکل (تنوع ندارد)', () => {
    const env = { ...healthyEnv(), JWT_SECRET: 'a'.repeat(64) };
    expect(collectProductionConfigProblems(env).join('\n')).toMatch(/تنوع/);
  });

  it('هرگز مقدارِ رمز را در پیام نمی‌آورد (فقط نامِ متغیر)', () => {
    const secret = 'abc123'; // کوتاه ⇒ مشکل، ولی نباید در پیام بیاید
    const env = { ...healthyEnv(), JWT_SECRET: secret };
    const messages = collectProductionConfigProblems(env).join('\n');
    expect(messages).toMatch(/JWT_SECRET/);
    expect(messages).not.toContain(secret);

    const appPw = 'dms_app_local';
    const env2 = {
      ...healthyEnv(),
      APP_DATABASE_URL: `postgres://dms_app:${appPw}@postgres:5432/greendms`,
    };
    const messages2 = collectProductionConfigProblems(env2).join('\n');
    expect(messages2).toMatch(/APP_DATABASE_URL/);
    expect(messages2).not.toContain(appPw);
  });

  it('رمزِ پیش‌فرضِ شناخته‌شده در URLها ⇒ مشکل', () => {
    for (const pw of ['dms', 'dms_app_local', 'CHANGE_ME_DB_PASSWORD', '']) {
      const env = {
        ...healthyEnv(),
        DATABASE_URL: `postgres://dms:${pw}@postgres:5432/greendms`,
      };
      expect(collectProductionConfigProblems(env).join('\n')).toMatch(/DATABASE_URL/);
    }
  });

  it('URL نامعتبر ⇒ مشکل', () => {
    const env = { ...healthyEnv(), APP_DATABASE_URL: 'not-a-url' };
    expect(collectProductionConfigProblems(env).join('\n')).toMatch(/APP_DATABASE_URL/);
  });

  it('SMS_PROVIDER=log بدونِ اذعان ⇒ مشکل (ظاهرسازیِ تحویلِ OTP ممنوع)', () => {
    const env = { ...healthyEnv(), SMS_PROVIDER: 'log' };
    delete env.SMS_API_KEY;
    expect(collectProductionConfigProblems(env).join('\n')).toMatch(/SMS_ALLOW_LOG_PROVIDER/);
  });

  it('SMS_PROVIDER=log با SMS_ALLOW_LOG_PROVIDER=true ⇒ قابلِ قبول (دمو/CI)', () => {
    const env = { ...healthyEnv(), SMS_PROVIDER: 'log', SMS_ALLOW_LOG_PROVIDER: 'true' };
    expect(collectProductionConfigProblems(env)).toEqual([]);
  });

  it('SMS_PROVIDER=http بدونِ درگاه/کلید ⇒ مشکل', () => {
    const env = { ...healthyEnv(), SMS_GATEWAY: '', SMS_API_KEY: '' };
    expect(collectProductionConfigProblems(env).join('\n')).toMatch(/SMS_GATEWAY/);
  });

  it('PSP_ENDPOINT فعال با وب‌هوکِ جای‌نگه‌دار ⇒ مشکل', () => {
    const env = { ...healthyEnv(), PSP_ENDPOINT: 'https://psp.example', PSP_WEBHOOK_SECRET: 'REPLACE_WITH_RANDOM_SECRET' };
    expect(collectProductionConfigProblems(env).join('\n')).toMatch(/PSP_WEBHOOK_SECRET/);
  });

  it('MINIO_ENDPOINT فعال با رمزِ پیش‌فرض ⇒ مشکل', () => {
    const env = { ...healthyEnv(), MINIO_ENDPOINT: 'minio:9000', MINIO_ACCESS_KEY: 'minio', MINIO_SECRET_KEY: 'minio123' };
    expect(collectProductionConfigProblems(env).join('\n')).toMatch(/MINIO_SECRET_KEY/);
  });
});

describe('assertProductionConfig', () => {
  it('در production ناامن می‌اندازد (fail-closed)', () => {
    expect(() => assertProductionConfig({ ...PROD })).toThrow(/ناامن/);
  });

  it('با DMS_ACCEPT_INSECURE_LOCAL_SETUP=true فقط هشدار می‌دهد', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(() =>
      assertProductionConfig({ ...PROD, DMS_ACCEPT_INSECURE_LOCAL_SETUP: 'true' }),
    ).not.toThrow();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('پیکربندیِ سالم بی‌صدا عبور می‌کند', () => {
    expect(() => assertProductionConfig(healthyEnv())).not.toThrow();
  });

  it('بیرون از production هیچ کاری نمی‌کند', () => {
    expect(() => assertProductionConfig({ NODE_ENV: 'test' })).not.toThrow();
  });
});
