import { describe, expect, it, vi } from 'vitest';
import {
  isProductionEnv,
  resolveDatabaseIdentity,
  verifyRuntimeDatabaseIdentity,
} from '../src/database/runtime-identity';

/**
 * GDM-13-03 — هویتِ پایگاه‌دادهٔ زمانِ اجرا.
 *
 * در production: APP_DATABASE_URL الزامی، بدونِ بازگشتِ بی‌صدا به نقشِ مدیریتی، و
 * راستی‌آزماییِ هویتِ مؤثر (ابرکاربر/BYPASSRLS/مالکیتِ جدول/RLSِ واقعی) با fail-closed.
 * بیرون از production: راحتیِ توسعه حفظ می‌شود (فقط هشدار).
 */

const PROD = { NODE_ENV: 'production' };
const DEV = { NODE_ENV: 'test' };
const APP_URL = 'postgres://dms_app:app-secret@db:5432/greendms';
const ADMIN_URL = 'postgres://dms:admin-secret@db:5432/greendms';

/** pool ساختگی با پاسخِ pg_roles/pg_class و پرس‌وجویِ عملیِ RLS */
function fakePool(
  identity: Partial<{
    runtime_user: string;
    is_superuser: boolean;
    bypass_rls: boolean;
    can_login: boolean;
    owned_tables: number;
    rls_forced_tables: number;
    tenant_guc: string;
  }> = {},
  visibleRows = 0,
  opts: { reject?: boolean } = {},
) {
  const row = {
    runtime_user: 'dms_app',
    is_superuser: false,
    bypass_rls: false,
    can_login: true,
    owned_tables: 0,
    rls_forced_tables: 139,
    tenant_guc: '',
    ...identity,
  };
  return {
    query: vi.fn(async (sql: string) => {
      if (opts.reject) throw new Error('connect ECONNREFUSED');
      return String(sql).includes('from branch')
        ? { rows: [{ n: visibleRows }] }
        : { rows: [row] };
    }),
  };
}

describe('GDM-13-03 · resolveDatabaseIdentity', () => {
  it('در production بدونِ APP_DATABASE_URL ⇒ خطایِ فارسی و fail-closed (بدونِ بازگشتِ بی‌صدا)', () => {
    expect(() => resolveDatabaseIdentity({ ...PROD, DATABASE_URL: ADMIN_URL })).toThrowError(
      /APP_DATABASE_URL الزامی است/,
    );
    expect(() => resolveDatabaseIdentity({ ...PROD, DATABASE_URL: ADMIN_URL })).toThrowError(/dms_app/);
    expect(isProductionEnv(PROD)).toBe(true);
    expect(isProductionEnv({ NODE_ENV: 'Production ' })).toBe(true);
  });

  it('در production هیچ رشتهٔ اتصالی نباشد ⇒ خطایِ روشن', () => {
    expect(() => resolveDatabaseIdentity(PROD)).toThrowError(/APP_DATABASE_URL/);
  });

  it('یکی‌بودنِ نقشِ زمانِ اجرا و نقشِ مهاجرت در production ⇒ نقضِ جداسازی', () => {
    expect(() =>
      resolveDatabaseIdentity({ ...PROD, APP_DATABASE_URL: ADMIN_URL, DATABASE_URL: ADMIN_URL }),
    ).toThrowError(/جداسازیِ هویت‌ها نقض شده/);
  });

  it('productionِ سالم ⇒ هویتِ زمانِ اجرا از APP_DATABASE_URL و مهاجرت جدا', () => {
    const id = resolveDatabaseIdentity({ ...PROD, APP_DATABASE_URL: APP_URL, DATABASE_URL: ADMIN_URL });
    expect(id.runtimeUrl).toBe(APP_URL);
    expect(id.migrationUrl).toBe(ADMIN_URL);
    expect(id.fellBack).toBe(false);
    expect(id.runtimeUser).toBe('dms_app');
    expect(id.migrationUser).toBe('dms');
  });

  it('بیرون از production راحتیِ توسعه حفظ می‌شود (بازگشت به DATABASE_URL با پرچمِ fellBack)', () => {
    const id = resolveDatabaseIdentity({ ...DEV, DATABASE_URL: ADMIN_URL });
    expect(id.runtimeUrl).toBe(ADMIN_URL);
    expect(id.fellBack).toBe(true);
    expect(() => resolveDatabaseIdentity({ ...DEV, DATABASE_URL: ADMIN_URL })).not.toThrow();
  });
});

describe('GDM-13-03 · verifyRuntimeDatabaseIdentity', () => {
  it('هویتِ سالم ⇒ بدونِ مشکل و با شاهدِ عملیِ RLS', async () => {
    const pool = fakePool();
    const report = await verifyRuntimeDatabaseIdentity(pool as never, {
      ...PROD,
      APP_DATABASE_URL: APP_URL,
      DATABASE_URL: ADMIN_URL,
    });
    expect(report.problems).toEqual([]);
    expect(report).toMatchObject({
      runtimeUser: 'dms_app',
      isSuperuser: false,
      bypassRls: false,
      ownedTables: 0,
      unverifiable: false,
    });
    expect(report.rlsForcedTables).toBeGreaterThan(0);
    expect(report.visibleTenantRowsWithoutContext).toBe(0);
  });

  it('هر هویتِ ناامن در production ⇒ fail-closed', async () => {
    const cases: Array<[Record<string, unknown>, RegExp, number]> = [
      [{ is_superuser: true }, /ابرکاربر/, 0],
      [{ bypass_rls: true }, /BYPASSRLS/, 0],
      [{ owned_tables: 7 }, /مالکِ 7 جدول/, 0],
      [{ rls_forced_tables: 0 }, /RLSِ فعال و اجباری ندارد/, 0],
      [{ tenant_guc: 'dddddddd-0000-4000-8000-000000000009' }, /app\.company_id خالی نیست/, 0],
      [{}, /RLS دربارهٔ این نقش اعمال نمی‌شود/, 3], // پرس‌وجویِ عملی ردیف برگرداند
    ];
    for (const [identity, pattern, visible] of cases) {
      const pool = fakePool(identity as never, visible);
      await expect(
        verifyRuntimeDatabaseIdentity(pool as never, {
          ...PROD,
          APP_DATABASE_URL: APP_URL,
          DATABASE_URL: ADMIN_URL,
        }),
      ).rejects.toThrowError(pattern);
    }
  });

  it('راستی‌آزماییِ ناموفق (پایگاه‌داده در دسترس نیست) در production ⇒ fail-closed', async () => {
    const pool = fakePool({}, 0, { reject: true });
    await expect(
      verifyRuntimeDatabaseIdentity(pool as never, {
        ...PROD,
        APP_DATABASE_URL: APP_URL,
        DATABASE_URL: ADMIN_URL,
      }),
    ).rejects.toThrowError(/راستی‌آزماییِ هویتِ زمانِ اجرا ممکن نشد/);
  });

  it('همان هویتِ ناامن بیرون از production ⇒ پرتاب نمی‌کند، فقط هشدار (راحتیِ توسعه)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const pool = fakePool({ is_superuser: true });
    const report = await verifyRuntimeDatabaseIdentity(pool as never, { ...DEV, DATABASE_URL: ADMIN_URL });
    expect(report.isSuperuser).toBe(true);
    expect(report.problems.length).toBeGreaterThan(0);
    expect(warn).toHaveBeenCalled();
    expect(warn.mock.calls.map((c) => String(c[0])).join('\n')).toContain('production برنامه بالا نمی‌آید');
    warn.mockRestore();
  });
});
