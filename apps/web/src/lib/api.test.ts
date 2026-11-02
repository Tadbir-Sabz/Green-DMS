import { beforeEach, describe, expect, it } from 'vitest';
import { TOKEN_KEY, USERNAME_KEY, REFRESH_KEY, EXPIRES_KEY, clearSession, errorMessage, getToken, setSession } from './api';

/**
 * لایهٔ کمکی API — پیام خطا باید با envelope جدید سرور
 * { code, message_fa, details, request_id } سازگار باشد و نشست در localStorage نگه داشته شود.
 */
describe('errorMessage — پیام فارسی خطا', () => {
  it('message_fa سرور (envelope فاز B) را ترجیح می‌دهد', () => {
    expect(errorMessage({ code: 'not_found', message_fa: 'سفارش یافت نشد' })).toBe('سفارش یافت نشد');
  });

  it('اگر message_fa نبود به message انگلیسی سرور برمی‌گردد', () => {
    expect(errorMessage({ message: 'Network error' })).toBe('Network error');
  });

  it('برای خطای بدون پیام، پیش‌فرض فارسی نشان داده می‌شود', () => {
    expect(errorMessage(undefined)).toBe('خطای ناشناخته‌ای رخ داد.');
    expect(errorMessage({})).toBe('خطای ناشناخته‌ای رخ داد.');
    expect(errorMessage(null)).toBe('خطای ناشناخته‌ای رخ داد.');
  });

  it('message غیررشته‌ای (مثلاً عدد) نادیده گرفته می‌شود', () => {
    expect(errorMessage({ message: 42 })).toBe('خطای ناشناخته‌ای رخ داد.');
  });

  it('جزئیات (details) در پیام خام اثری ندارد — فقط متن نمایش داده می‌شود', () => {
    const err = { code: 'validation_failed', message_fa: 'فیلدها نامعتبر‌اند', details: { fields: { name: ['الزامی'] } } };
    expect(errorMessage(err)).toBe('فیلدها نامعتبر‌اند');
  });
});

describe('نشست کاربر در localStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('setSession توکن‌ها و انقضا را ذخیره می‌کند و getToken همان را برمی‌گرداند', () => {
    setSession('access-123', 'admin', 'refresh-456', 900);
    expect(getToken()).toBe('access-123');
    expect(localStorage.getItem(USERNAME_KEY)).toBe('admin');
    expect(localStorage.getItem(REFRESH_KEY)).toBe('refresh-456');
    const expiresAt = Number(localStorage.getItem(EXPIRES_KEY));
    expect(expiresAt).toBeGreaterThan(Date.now());
  });

  it('بدون refresh، کلید refresh پاک می‌شود (نشست قبلی جا نماند)', () => {
    setSession('a', 'u', 'r', 900);
    setSession('b', 'u', null);
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
    expect(getToken()).toBe('b');
  });

  it('clearSession همه کلیدها را حذف می‌کند', () => {
    setSession('a', 'u', 'r', 900);
    clearSession();
    expect(getToken()).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(USERNAME_KEY)).toBeNull();
    expect(localStorage.getItem(EXPIRES_KEY)).toBeNull();
  });
});
