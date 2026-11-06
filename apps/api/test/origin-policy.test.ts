import { describe, expect, it } from 'vitest';
import {
  corsOptionsFor,
  DEV_DEFAULT_ORIGINS,
  parseOriginList,
  resolveCorsOrigins,
} from '../src/common/origin-policy';

/**
 * TASK-19 — Phase 2C: سیاستِ صریحِ originهای مجاز.
 * رگرسیون‌های «مجاز/ردشده» — بدونِ بازتابِ خاستگاهِ ناشناس وقتی credentials روشن است.
 */

describe('parseOriginList', () => {
  it('originهای معتبر را نرمال‌شده برمی‌گرداند', () => {
    const { origins, invalid } = parseOriginList(
      'https://app.example.com, http://localhost:3000,https://app.example.com',
    );
    expect(origins).toEqual(['https://app.example.com', 'http://localhost:3000']);
    expect(invalid).toEqual([]);
  });

  it('ورودی‌های نامعتبر را جدا می‌کند: بدون scheme، ستاره، مسیر، userinfo', () => {
    const { origins, invalid } = parseOriginList(
      'app.example.com,*,https://a.example.com/path,https://u:p@b.example.com,https://ok.example.com',
    );
    expect(origins).toEqual(['https://ok.example.com']);
    expect(invalid).toEqual([
      'app.example.com',
      '*',
      'https://a.example.com/path',
      'https://u:p@b.example.com',
    ]);
  });

  it('ورودیِ خالی/فاصله را نادیده می‌گیرد', () => {
    expect(parseOriginList('  , ,')).toEqual({ origins: [], invalid: [] });
    expect(parseOriginList(undefined)).toEqual({ origins: [], invalid: [] });
  });
});

describe('resolveCorsOrigins — production (fail-closed)', () => {
  const PROD = { NODE_ENV: 'production' };

  it('بدونِ ALLOWED_ORIGINS می‌اندازد', () => {
    expect(() => resolveCorsOrigins({ ...PROD })).toThrow(/ALLOWED_ORIGINS/);
  });

  it('ورودیِ نامعتبر در production می‌اندازد و نامِ ورودی را نشان می‌دهد', () => {
    expect(() => resolveCorsOrigins({ ...PROD, ALLOWED_ORIGINS: 'app.example.com' })).toThrow(
      /app\.example\.com/,
    );
  });

  it('پیکربندیِ معتبر دقیقاً همان فهرست است', () => {
    expect(resolveCorsOrigins({ ...PROD, ALLOWED_ORIGINS: 'https://app.example.com' })).toEqual([
      'https://app.example.com',
    ]);
  });
});

describe('resolveCorsOrigins — توسعه', () => {
  it('بدونِ env از پیش‌فرضِ محلی استفاده می‌کند', () => {
    expect(resolveCorsOrigins({ NODE_ENV: 'development' })).toEqual([...DEV_DEFAULT_ORIGINS]);
  });

  it('ورودیِ نامعتبر را با هشدار حذف می‌کند و معتبرها را نگه می‌دارد', () => {
    const origins = resolveCorsOrigins({
      NODE_ENV: 'development',
      ALLOWED_ORIGINS: 'http://localhost:5173,not-a-url',
    });
    expect(origins).toEqual(['http://localhost:5173']);
  });

  it('اگر همه نامعتبر بودند، پیش‌فرضِ محلی برمی‌گردد', () => {
    expect(resolveCorsOrigins({ NODE_ENV: 'development', ALLOWED_ORIGINS: 'x,,' })).toEqual([
      ...DEV_DEFAULT_ORIGINS,
    ]);
  });
});

describe('corsOptionsFor (همان شیءِ سیم‌کشیِ main.ts)', () => {
  it('credentials روشن است و origin فهرستِ صریح است (هرگز true/ستاره نیست)', () => {
    const opts = corsOptionsFor({ NODE_ENV: 'production', ALLOWED_ORIGINS: 'https://app.example.com' });
    expect(opts.credentials).toBe(true);
    expect(Array.isArray(opts.origin)).toBe(true);
    expect(opts.origin).toEqual(['https://app.example.com']);
    expect(opts.origin).not.toContain('*');
  });
});
