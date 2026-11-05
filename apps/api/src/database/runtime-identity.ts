import type { Pool } from 'pg';

/**
 * هویتِ پایگاه‌دادهٔ زمانِ اجرا (GDM-13-03).
 *
 * پیش از این، اتصالِ برنامه از `APP_DATABASE_URL ?? DATABASE_URL` گرفته می‌شد. آن
 * «بازگشتِ بی‌صدا» در production یعنی برنامه با نقشِ مدیریتی/ابرکاربر کار می‌کند؛
 * ابرکاربر، نقشِ BYPASSRLS و «مالکِ جدول» هر سه **بیرونِ RLS** هستند ⇒ همهٔ
 * سیاست‌هایِ 0021/0041/0042/0043 بی‌اثر می‌شوند، بدونِ هیچ خطا یا هشداری.
 *
 * این ماژول دو کار می‌کند:
 *  ۱) `resolveDatabaseIdentity` — در production وجودِ APP_DATABASE_URL الزامی است و
 *     جداییِ هویتِ «مهاجرت» از هویتِ «زمانِ اجرا» بررسی می‌شود؛ در محیطِ توسعه همان
 *     راحتیِ قبلی حفظ می‌شود (فقط هشدارِ صریح که اتصالِ مدیریتی محافظتِ واقعی نیست).
 *  ۲) `verifyRuntimeDatabaseIdentity` — در زمانِ راه‌اندازی، هویتِ **مؤثر** را از خودِ
 *     پایگاه‌داده می‌پرسد (ابرکاربر؟ BYPASSRLS؟ مالکِ جدول؟ RLS واقعاً فعال است؟) و
 *     در production اگر امن نباشد fail-closed خطا می‌دهد.
 *
 * هیچ رمزی در کد نیست و هیچ عملیاتِ مدیریتیِ نقش (ALTER/REASSIGN) انجام نمی‌شود:
 * این ماژول فقط **می‌خواند و راستی‌آزمایی می‌کند**.
 */

export interface EnvLike {
  NODE_ENV?: string;
  APP_DATABASE_URL?: string;
  DATABASE_URL?: string;
}

export interface ResolvedDatabaseIdentity {
  /** رشتهٔ اتصالی که Poolِ برنامه از آن ساخته می‌شود */
  runtimeUrl: string;
  /** هویتِ مهاجرت/مدیریت (scripts/migrate.mjs) */
  migrationUrl: string | null;
  /** true یعنی runtimeUrl از DATABASE_URL آمده (فقط خارج از production مجاز است) */
  fellBack: boolean;
  runtimeUser: string | null;
  migrationUser: string | null;
}

export interface RuntimeIdentityReport {
  runtimeUser: string;
  isSuperuser: boolean;
  bypassRls: boolean;
  canLogin: boolean;
  /** تعدادِ جدول‌هایِ public که مالکشان همین نقش است — باید صفر باشد */
  ownedTables: number;
  /** تعدادِ رابطه‌هایِ public با RLS فعال **و** اجباری — باید بزرگ‌تر از صفر باشد */
  rlsForcedTables: number;
  /** مقدارِ app.company_id در لحظهٔ راه‌اندازی — باید خالی باشد */
  tenantGucAtStartup: string;
  /** ردیف‌هایِ دیده‌شده از یک جدولِ اجاره‌محور بدونِ زمینه — باید صفر باشد */
  visibleTenantRowsWithoutContext: number;
  /** راستی‌آزمایی اصلاً ممکن نشد (مثلاً پایگاه‌داده در دسترس نبود) */
  unverifiable: boolean;
  /** فهرستِ مشکلات با پیامِ فارسی؛ خالی یعنی سالم */
  problems: string[];
}

const PRODUCTION = 'production';

export const isProductionEnv = (env: EnvLike = process.env): boolean =>
  String(env.NODE_ENV ?? '').trim().toLowerCase() === PRODUCTION;

/** نامِ کاربریِ یک رشتهٔ اتصالِ postgres؛ بدونِ پرتاب برایِ ورودیِ نامعتبر */
const parseUser = (url: string | undefined | null): string | null => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.username ? decodeURIComponent(parsed.username) : null;
  } catch {
    return null;
  }
};

/**
 * تعیینِ هویتِ مؤثرِ زمانِ اجرا.
 * در production: نبودِ APP_DATABASE_URL یا یکی‌بودنِ نقشِ زمانِ اجرا با نقشِ مهاجرت ⇒ خطا.
 */
export function resolveDatabaseIdentity(env: EnvLike = process.env): ResolvedDatabaseIdentity {
  const appUrl = env.APP_DATABASE_URL?.trim() || '';
  const migrationUrl = env.DATABASE_URL?.trim() || '';
  const production = isProductionEnv(env);

  if (production && !appUrl) {
    throw new Error(
      [
        'پیکربندیِ ناامنِ پایگاه‌داده: در محیطِ production متغیرِ APP_DATABASE_URL الزامی است.',
        'بازگشتِ بی‌صدا به DATABASE_URL مجاز نیست، چون آن نقش مدیریتی/ابرکاربر است و',
        'PostgreSQL برایِ ابرکاربر، نقشِ BYPASSRLS و مالکِ جدول هیچ RLS‌ای اعمال نمی‌کند؛',
        'یعنی جداسازیِ اجاره فقط «به ظاهر» برقرار می‌شود.',
        'اقدامِ لازم: نقشِ زمانِ اجرا را یک‌بار (دستی و بیرون از مهاجرت‌ها) فعال کنید:',
        "  alter role dms_app login password '<رمزِ تولیدشده>';",
        'سپس APP_DATABASE_URL=postgres://dms_app:<رمز>@<میزبان>:5432/<پایگاه‌داده> را ست کنید',
        'و DATABASE_URL را فقط برایِ مهاجرت (npm run db:migrate) نگه دارید.',
      ].join('\n'),
    );
  }

  const runtimeUrl = appUrl || migrationUrl;
  if (!runtimeUrl) {
    throw new Error(
      'هیچ رشتهٔ اتصالی برایِ پایگاه‌داده یافت نشد: APP_DATABASE_URL (و در محیطِ توسعه DATABASE_URL) را ست کنید.',
    );
  }

  const runtimeUser = parseUser(runtimeUrl);
  const migrationUser = parseUser(migrationUrl);
  if (production && appUrl && migrationUrl && runtimeUser && runtimeUser === migrationUser) {
    throw new Error(
      [
        'جداسازیِ هویت‌ها نقض شده است: APP_DATABASE_URL و DATABASE_URL به یک نقش اشاره می‌کنند',
        `(${runtimeUser}). نقشِ زمانِ اجرا باید غیرِابرکاربر، غیرِBYPASSRLS و مالکِ هیچ جدولی نباشد`,
        'و از نقشِ مهاجرت جدا باشد. یک نقشِ اختصاصیِ زمانِ اجرا (مانند dms_app) بسازید.',
      ].join('\n'),
    );
  }

  return {
    runtimeUrl,
    migrationUrl: migrationUrl || null,
    fellBack: !appUrl,
    runtimeUser,
    migrationUser,
  };
}

const INSPECT_SQL = `
  select current_user                                  as runtime_user,
         r.rolsuper                                    as is_superuser,
         r.rolbypassrls                                as bypass_rls,
         r.rolcanlogin                                 as can_login,
         coalesce((select count(*)::int
                     from pg_class c
                     join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public'
                      and c.relkind in ('r', 'p')
                      and pg_get_userbyid(c.relowner) = current_user), 0) as owned_tables,
         coalesce((select count(*)::int
                     from pg_class c
                     join pg_namespace n on n.oid = c.relnamespace
                    where n.nspname = 'public'
                      and c.relkind in ('r', 'p')
                      and c.relrowsecurity
                      and c.relforcerowsecurity), 0)   as rls_forced_tables,
         coalesce(current_setting('app.company_id', true), '') as tenant_guc
    from pg_roles r
   where r.rolname = current_user`;

/** پرس‌وجویِ عملی: بدونِ زمینهٔ اجاره، یک جدولِ اجاره‌محور باید صفر ردیف بدهد */
const TENANT_PROBE_SQL = `select count(*)::int as n from branch`;

const emptyReport = (): RuntimeIdentityReport => ({
  runtimeUser: '',
  isSuperuser: false,
  bypassRls: false,
  canLogin: false,
  ownedTables: 0,
  rlsForcedTables: 0,
  tenantGucAtStartup: '',
  visibleTenantRowsWithoutContext: 0,
  unverifiable: true,
  problems: [],
});

/** فقط یک بار در هر فرآیند هشدار بده (تست‌ها و چند بار bootstrap نویز نسازند) */
const warned = new Set<string>();
const warnOnce = (key: string, message: string): void => {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
};

/**
 * راستی‌آزماییِ هویتِ مؤثرِ زمانِ اجرا رویِ اتصالِ واقعی.
 * در production هر مشکل ⇒ پرتاب (fail-closed)؛ بیرون از production ⇒ هشدارِ فارسی.
 */
export async function verifyRuntimeDatabaseIdentity(
  pool: Pool,
  env: EnvLike = process.env,
): Promise<RuntimeIdentityReport> {
  const identity = resolveDatabaseIdentity(env);
  const production = isProductionEnv(env);

  if (identity.fellBack) {
    warnOnce(
      'runtime-identity-fallback',
      [
        '[PG_POOL] هشدار: APP_DATABASE_URL ست نشده و اتصالِ برنامه از DATABASE_URL گرفته می‌شود.',
        'این اتصال معمولاً مدیریتی/ابرکاربر است ⇒ RLS دربارهٔ آن اعمال نمی‌شود و جداسازیِ',
        'اجاره «واقعی» نیست. این حالت فقط برایِ توسعهٔ محلی قابلِ قبول است؛ در production',
        'برنامه بالا نمی‌آید (به .env.production.example و docs/db-privilege-architecture.md ببینید).',
      ].join('\n'),
    );
  }

  const report = emptyReport();
  try {
    const { rows } = await pool.query<{
      runtime_user: string;
      is_superuser: boolean;
      bypass_rls: boolean;
      can_login: boolean;
      owned_tables: number;
      rls_forced_tables: number;
      tenant_guc: string;
    }>(INSPECT_SQL);
    const row = rows[0];
    if (!row) {
      report.problems.push('نقشِ زمانِ اجرا در pg_roles یافت نشد.');
    } else {
      report.runtimeUser = row.runtime_user;
      report.isSuperuser = !!row.is_superuser;
      report.bypassRls = !!row.bypass_rls;
      report.canLogin = !!row.can_login;
      report.ownedTables = Number(row.owned_tables ?? 0);
      report.rlsForcedTables = Number(row.rls_forced_tables ?? 0);
      report.tenantGucAtStartup = String(row.tenant_guc ?? '');
    }
    const probe = await pool.query<{ n: number }>(TENANT_PROBE_SQL);
    report.visibleTenantRowsWithoutContext = Number(probe.rows[0]?.n ?? 0);
    report.unverifiable = false;
  } catch (err) {
    report.unverifiable = true;
    report.problems.push(
      `راستی‌آزماییِ هویتِ زمانِ اجرا ممکن نشد: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (report.isSuperuser) {
    report.problems.push(
      `نقشِ زمانِ اجرا (${report.runtimeUser}) ابرکاربر است ⇒ RLS هرگز اعمال نمی‌شود.`,
    );
  }
  if (report.bypassRls) {
    report.problems.push(
      `نقشِ زمانِ اجرا (${report.runtimeUser}) امتیازِ BYPASSRLS دارد ⇒ جداسازیِ اجاره بی‌اثر است.`,
    );
  }
  if (report.ownedTables > 0) {
    report.problems.push(
      `نقشِ زمانِ اجرا مالکِ ${report.ownedTables} جدولِ محافظت‌شده است ⇒ مالک بیرونِ RLS است.`,
    );
  }
  if (!report.unverifiable && report.rlsForcedTables === 0) {
    report.problems.push(
      'هیچ جدولی RLSِ فعال و اجباری ندارد ⇒ مهاجرت‌هایِ 0041/0042/0043 رویِ این پایگاه‌داده اعمال نشده‌اند.',
    );
  }
  if (report.tenantGucAtStartup !== '') {
    report.problems.push(
      `در لحظهٔ راه‌اندازی app.company_id خالی نیست («${report.tenantGucAtStartup}») ⇒ زمینهٔ اجاره نشت کرده است.`,
    );
  }
  if (report.visibleTenantRowsWithoutContext > 0) {
    report.problems.push(
      'خواندنِ جدولِ اجاره‌محور بدونِ زمینهٔ اجاره ردیف برگرداند ⇒ RLS دربارهٔ این نقش اعمال نمی‌شود.',
    );
  }

  if (report.problems.length > 0) {
    const detail = report.problems.join('\n');
    if (production) {
      throw new Error(
        [
          'راه‌اندازی متوقف شد: هویتِ پایگاه‌دادهٔ زمانِ اجرا امن نیست (fail-closed).',
          detail,
          'راهنما: APP_DATABASE_URL باید به نقشِ غیرِابرکاربر، غیرِBYPASSRLS و بدونِ مالکیتِ جدول',
          '(پیش‌فرضِ معماری: dms_app از مهاجرتِ 0041) اشاره کند و از نقشِ مهاجرت جدا باشد.',
        ].join('\n'),
      );
    }
    warnOnce(
      'runtime-identity-problems',
      `[PG_POOL] هویتِ زمانِ اجرا امن نیست (در production برنامه بالا نمی‌آید):\n${detail}`,
    );
  }

  return report;
}
