import { describe, expect, it } from 'vitest';
import { sign, verify } from 'jsonwebtoken';

/**
 * تستِ خالصِ «جداسازیِ توکنِ پورتال از توکنِ کارکنان» (بدونِ DB) — همان کاری که
 * PortalAuthGuard (با audience:'portal' + typ==='portal_access') و AuthGuard کارکنان
 * (با typ==='access') انجام می‌دهند. این ویژگیِ امنیتیِ کلیدیِ پورتالِ جدا است:
 * توکنِ یکی هرگز روی APIِ دیگری اعتبار نمی‌یابد.
 */

const SECRET = 'test-portal-secret-0123456789abcdef';

const portalToken = (): string =>
  sign(
    { sub: 'pu-1', sid: 'ps-1', cid: 'c-1', cust: 'cust-1', em: 'buyer@corp.test', typ: 'portal_access' },
    SECRET,
    { algorithm: 'HS256', expiresIn: 900, audience: 'portal' },
  );

const staffToken = (): string =>
  sign(
    { sub: 'u-1', sid: 's-1', cid: 'c-1', usr: 'admin', typ: 'access' },
    SECRET,
    { algorithm: 'HS256', expiresIn: 900 },
  );

describe('جداسازیِ audience توکنِ پورتال از کارکنان', () => {
  it('توکنِ پورتال با audience=portal راستی‌آزمایی می‌شود و claims درست دارد', () => {
    const p = verify(portalToken(), SECRET, {
      algorithms: ['HS256'],
      audience: 'portal',
    }) as Record<string, unknown>;
    expect(p.typ).toBe('portal_access');
    expect(p.cust).toBe('cust-1');
    expect(p.aud).toBe('portal');
  });

  it('توکنِ کارکنان (بدونِ audience=portal) روی گاردِ پورتال رد می‌شود', () => {
    expect(() =>
      verify(staffToken(), SECRET, { algorithms: ['HS256'], audience: 'portal' }),
    ).toThrow();
  });

  it('توکنِ پورتال به‌عنوان access کارکنان پذیرفته نمی‌شود (typ متفاوت)', () => {
    const p = verify(portalToken(), SECRET, { algorithms: ['HS256'] }) as Record<string, unknown>;
    // گارد کارکنان typ==='access' می‌طلبد؛ پورتال 'portal_access' است → رد می‌شود
    expect(p.typ).not.toBe('access');
    expect(p.typ).toBe('portal_access');
  });

  it('توکن با رمزِ اشتباه رد می‌شود', () => {
    expect(() =>
      verify(portalToken(), 'wrong-secret-value-000000000000000', {
        algorithms: ['HS256'],
        audience: 'portal',
      }),
    ).toThrow();
  });

  it('توکنِ منقضی رد می‌شود', () => {
    const expired = sign(
      { sub: 'pu-1', sid: 'ps-1', cid: 'c-1', cust: 'cust-1', em: 'b@c.d', typ: 'portal_access' },
      SECRET,
      { algorithm: 'HS256', expiresIn: -10, audience: 'portal' },
    );
    expect(() =>
      verify(expired, SECRET, { algorithms: ['HS256'], audience: 'portal' }),
    ).toThrow();
  });
});
