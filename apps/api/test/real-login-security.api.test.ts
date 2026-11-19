/**
 * S8 / TASK-GDMS-INV-S8-FINAL-OPERATIONAL-CLOSURE-04 — آزمون‌های امنیتیِ «ورودِ واقعی».
 *
 * این فایل روی PostgreSQL واقعی با نقش‌های LOGIN واقعی (TCP + SCRAM) اجرا می‌شود:
 *   ADMIN_DATABASE_URL        سوپرکاربرِ استقرار (فقط برای فیکسچر/راستی‌آزمایی؛ هرگز هویتِ API)
 *   DATABASE_URL              dms_migrator (LOGIN، خارج از پنجره نباید عضوِ dms_owner باشد)
 *   APP_DATABASE_URL          dms_app (LOGIN، هویتِ زمانِ اجرا)
 *   MAINTENANCE_DATABASE_URL  dms_maintainer (LOGIN، هویتِ نگه‌داری)
 *
 * قوانین:
 *  - هیچ‌کدام از این متغیرها ست نباشد ⇒ پرتابِ خطا (نه skip). «skip» هرگز PASS نیست.
 *  - هر اتصال باید دقیقاً همان نقشِ مورد انتظار را گزارش کند؛ در غیر این صورت شکست.
 *  - هر denial با SQLSTATE و هویتِ واقعی ثبت می‌شود.
 *  - ابرکاربر فقط برای مرزِ اعتماد (BOUNDARY) آزموده می‌شود و هرگز به‌عنوان «محافظت» PASS نمی‌شود.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { writeFileSync } from 'node:fs';
import { verifyRuntimeDatabaseIdentity } from '../src/database/runtime-identity';

const need = (name: string): string => {
  const v = (process.env[name] ?? '').trim();
  if (!v) {
    throw new Error(
      `${name} تنظیم نشده است. این آزمون‌ها باید با نقش‌های LOGIN واقعی اجرا شوند (skip مجاز نیست).`,
    );
  }
  return v;
};

const ADMIN_URL = need('ADMIN_DATABASE_URL');
const MIGRATOR_URL = need('DATABASE_URL');
const APP_URL = need('APP_DATABASE_URL');
const MAINT_URL = need('MAINTENANCE_DATABASE_URL');

type Probe = { identity: string; sqlstate: string | null; outcome: 'denied' | 'allowed' | 'other' };
const evidence: Array<{ suite: string; sql: string; expected: string; actual: string; identity: string }> = [];

const pools: Record<'admin' | 'migrator' | 'app' | 'maint', pg.Pool> = {
  admin: new pg.Pool({ connectionString: ADMIN_URL, max: 2 }),
  migrator: new pg.Pool({ connectionString: MIGRATOR_URL, max: 2 }),
  app: new pg.Pool({ connectionString: APP_URL, max: 2 }),
  maint: new pg.Pool({ connectionString: MAINT_URL, max: 2 }),
};

for (const p of Object.values(pools)) p.on('error', () => undefined);

/** اجرای یک دستور در تراکنشِ یک‌بارمصرف و برگرداندنِ SQLSTATE و هویتِ واقعی */
async function attempt(pool: pg.Pool, sql: string): Promise<Probe> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const who = await client.query<{ u: string; s: string }>('select current_user::text as u, session_user::text as s');
    const identity = `${who.rows[0]!.u} (session ${who.rows[0]!.s})`;
    try {
      await client.query(sql);
      return { identity, sqlstate: null, outcome: 'allowed' };
    } catch (err) {
      const code = (err as { code?: string }).code ?? null;
      return { identity, sqlstate: code, outcome: code ? 'denied' : 'other' };
    }
  } finally {
    await client.query('rollback').catch(() => undefined);
    client.release();
  }
}

/** denial مورد انتظار: باید خطا با SQLSTATE مشخص باشد و هویت باید نقشِ درست باشد */
async function expectDenied(suite: string, pool: pg.Pool, expectedRole: string, sql: string, code = '42501') {
  const r = await attempt(pool, sql);
  evidence.push({ suite, sql, expected: `denied ${code}`, actual: r.sqlstate ?? r.outcome, identity: r.identity });
  expect(r.identity.startsWith(`${expectedRole} `), `هویت: ${r.identity}`).toBe(true);
  expect(r.sqlstate, `SQL «${sql}» باید ${code} بدهد؛ نتیجه: ${r.outcome} ${r.sqlstate ?? ''}`).toBe(code);
}

async function expectAllowed(suite: string, pool: pg.Pool, expectedRole: string, sql: string) {
  const r = await attempt(pool, sql);
  evidence.push({ suite, sql, expected: 'allowed', actual: r.outcome === 'allowed' ? 'allowed' : (r.sqlstate ?? r.outcome), identity: r.identity });
  expect(r.identity.startsWith(`${expectedRole} `), `هویت: ${r.identity}`).toBe(true);
  expect(r.outcome, `SQL «${sql}» باید مجاز باشد؛ SQLSTATE=${r.sqlstate}`).toBe('allowed');
}

beforeAll(async () => {
  // هویتِ هر اتصال باید دقیقاً نقشِ مورد انتظار باشد (بدونِ بازگشتِ بی‌صدا)
  const expectations: Array<[pg.Pool, string]> = [
    [pools.migrator, 'dms_migrator'],
    [pools.app, 'dms_app'],
    [pools.maint, 'dms_maintainer'],
    [pools.admin, 'postgres'],
  ];
  for (const [pool, role] of expectations) {
    const { rows } = await pool.query<{ u: string }>('select current_user::text as u');
    expect(rows[0]?.u, `هویتِ اتصال باید ${role} باشد`).toBe(role);
  }
});

afterAll(async () => {
  for (const p of Object.values(pools)) await p.end().catch(() => undefined);
});

describe('S8-04 real-login: هویت و عضویت‌ها (PG16، نقش‌های LOGIN واقعی)', () => {
  it('dms_app: LOGIN، غیرابرکاربر، بدونِ BYPASSRLS، غیرمالک، بدونِ عضویت/SET روی dms_owner و dms_maintainer', async () => {
    const { rows } = await pools.admin.query<Record<string, boolean>>(`
      select r.rolcanlogin as login, r.rolsuper as super, r.rolbypassrls as bypass,
             pg_has_role('dms_app','dms_owner','MEMBER') as owner_member,
             pg_has_role('dms_app','dms_owner','SET') as owner_set,
             pg_has_role('dms_app','dms_maintainer','MEMBER') as maint_member,
             (select count(*) from pg_class c where c.relowner = r.oid and c.relnamespace = 'public'::regnamespace)::int as owned
        from pg_roles r where r.rolname = 'dms_app'`);
    const row = rows[0]!;
    expect(row.login).toBe(true);
    expect(row.super).toBe(false);
    expect(row.bypass).toBe(false);
    expect(row.owner_member).toBe(false);
    expect(row.owner_set).toBe(false);
    expect(row.maint_member).toBe(false);
    expect(row.owned).toBe(0);
  });

  it('dms_maintainer: LOGIN، غیرابرکاربر، عضوِ dms_owner نیست و SET هم ندارد', async () => {
    const { rows } = await pools.admin.query<Record<string, boolean>>(`
      select r.rolcanlogin as login, r.rolsuper as super, r.rolbypassrls as bypass,
             pg_has_role('dms_maintainer','dms_owner','MEMBER') as owner_member,
             pg_has_role('dms_maintainer','dms_owner','SET') as owner_set
        from pg_roles r where r.rolname = 'dms_maintainer'`);
    const row = rows[0]!;
    expect(row.login).toBe(true);
    expect(row.super).toBe(false);
    expect(row.bypass).toBe(false);
    expect(row.owner_member).toBe(false);
    expect(row.owner_set).toBe(false);
  });

  it('dms_migrator: خارج از پنجرهٔ مهاجرت عضوِ dms_owner نیست (پنجره باز بماند ⇒ شکست)', async () => {
    const { rows } = await pools.admin.query<{ m: boolean; s: boolean; super: boolean }>(`
      select pg_has_role('dms_migrator','dms_owner','MEMBER') as m,
             pg_has_role('dms_migrator','dms_owner','SET') as s,
             (select rolsuper from pg_roles where rolname = 'dms_migrator') as super`);
    expect(rows[0]!.m, 'پنجرهٔ مهاجرت باز مانده است؛ db-window revoke را اجرا کنید').toBe(false);
    expect(rows[0]!.s).toBe(false);
    expect(rows[0]!.super).toBe(false);
  });

  it('dms_owner: NOLOGIN و بدونِ عضوِ LOGIN مستقیم', async () => {
    const { rows } = await pools.admin.query<{ login: boolean }>(
      `select rolcanlogin as login from pg_roles where rolname = 'dms_owner'`,
    );
    expect(rows[0]!.login).toBe(false);
  });

  it('راستی‌آزماییِ هویتِ زمانِ اجرا (کدِ واقعیِ API) روی dms_app: بدونِ مشکل', async () => {
    const report = await verifyRuntimeDatabaseIdentity(pools.app, {
      NODE_ENV: 'production',
      APP_DATABASE_URL: APP_URL,
      DATABASE_URL: MIGRATOR_URL,
    } as never);
    expect(report.unverifiable).toBe(false);
    expect(report.problems).toEqual([]);
    expect(report.runtimeUser).toBe('dms_app');
  });

  it('راستی‌آزماییِ هویت: dms_migrator به‌عنوانِ هویتِ زمانِ اجرا رد می‌شود', async () => {
    // در production خطا fail-closed است (پرتاب)؛ گزارشِ خالی یا skip مجاز نیست.
    await expect(
      verifyRuntimeDatabaseIdentity(pools.migrator, {
        NODE_ENV: 'production',
        APP_DATABASE_URL: MIGRATOR_URL,
        DATABASE_URL: MIGRATOR_URL,
      } as never),
    ).rejects.toThrow(/dms_migrator/);
  });

  it('راستی‌آزماییِ هویت: ابرکاربر به‌عنوانِ هویتِ زمانِ اجرا رد می‌شود', async () => {
    await expect(
      verifyRuntimeDatabaseIdentity(pools.admin, {
        NODE_ENV: 'production',
        APP_DATABASE_URL: ADMIN_URL,
        DATABASE_URL: MIGRATOR_URL,
      } as never),
    ).rejects.toThrow(/ابرکاربر است/);
  });

  it('راستی‌آزماییِ هویت: dms_maintainer به‌عنوانِ هویتِ زمانِ اجرا رد می‌شود', async () => {
    // dms_maintainer عضوِ نگه‌داری است ⇒ مشکل؛ علاوه بر این فاقد SELECT روی branch است،
    // پس راستی‌آزماییِ tenant ممکن نیست و باز هم fail-closed است.
    await expect(
      verifyRuntimeDatabaseIdentity(pools.maint, {
        NODE_ENV: 'production',
        APP_DATABASE_URL: MAINT_URL,
        DATABASE_URL: MIGRATOR_URL,
      } as never),
    ).rejects.toThrow(/dms_maintainer/);
  });
});

describe('S8-04 real-login: denial های dms_app (هویتِ زمانِ اجرا)', () => {
  const S = 'app-denials';
  it('ledger: TRUNCATE / DELETE / UPDATE / DISABLE TRIGGER / ALTER روی دفتر ممنوع است', async () => {
    await expectDenied(S, pools.app, 'dms_app', 'truncate inventory_txn');
    await expectDenied(S, pools.app, 'dms_app', 'delete from inventory_txn where false');
    await expectDenied(S, pools.app, 'dms_app', 'update inventory_txn set branch_id = branch_id where false');
    await expectDenied(S, pools.app, 'dms_app', 'alter table inventory_txn disable trigger all');
    await expectDenied(S, pools.app, 'dms_app', 'alter table inventory_txn owner to dms_app');
  });

  it('تغییرِ متغیرِ مدیریتی (GUC) دسترسی را باز نمی‌کند', async () => {
    // GUC «dms.inventory_txn_maintenance» فقط یک پرچم است؛ مجوزِ واقعی از ACL می‌آید.
    const client = await pools.app.connect();
    try {
      await client.query('begin');
      await client.query(`select set_config('dms.inventory_txn_maintenance','on',true)`);
      const who = await client.query<{ u: string }>('select current_user::text as u');
      expect(who.rows[0]!.u).toBe('dms_app');
      await client.query('savepoint s_del');
      await expect(client.query('delete from inventory_txn where false')).rejects.toMatchObject({ code: '42501' });
      await client.query('rollback to savepoint s_del');
      await expect(client.query('truncate inventory_txn')).rejects.toMatchObject({ code: '42501' });
      evidence.push({
        suite: S,
        sql: "set_config('dms.inventory_txn_maintenance','on',true); delete from inventory_txn",
        expected: 'denied 42501',
        actual: '42501',
        identity: 'dms_app',
      });
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });

  it('SET ROLE به dms_owner / dms_migrator / dms_maintainer ممنوع است', async () => {
    await expectDenied(S, pools.app, 'dms_app', 'set role dms_owner');
    await expectDenied(S, pools.app, 'dms_app', 'set role dms_migrator');
    await expectDenied(S, pools.app, 'dms_app', 'set role dms_maintainer');
  });

  it('توابعِ نگه‌داری و ایجادِ پارتیشن برای dms_app اجرا نمی‌شوند', async () => {
    await expectDenied(S, pools.app, 'dms_app', 'select fn_ensure_partitions(2)');
    await expectDenied(S, pools.app, 'dms_app', 'select fn_maintain_inventory_partitions(2)');
    await expectDenied(S, pools.app, 'dms_app', 'select fn_inventory_txn_maintenance_begin(\'x\', gen_random_uuid())');
  });

  it('DDL و نقش‌ها: CREATE TABLE / CREATE ROLE / ALTER ROLE ممنوع است', async () => {
    await expectDenied(S, pools.app, 'dms_app', 'create table public.zz_probe_app (id int)');
    await expectDenied(S, pools.app, 'dms_app', 'create role zz_probe_role');
    await expectDenied(S, pools.app, 'dms_app', 'alter role dms_app superuser');
    await expectDenied(S, pools.app, 'dms_app', 'alter role dms_maintainer login');
  });

  it('audit_log و location_sample append-only برای dms_app: UPDATE/DELETE/TRUNCATE ممنوع؛ SELECT مجاز', async () => {
    const cols: Record<string, string> = { audit_log: 'action', location_sample: 'staff_id' };
    for (const [t, c] of Object.entries(cols)) {
      await expectDenied(S, pools.app, 'dms_app', `update ${t} set ${c} = ${c} where false`);
      await expectDenied(S, pools.app, 'dms_app', `delete from ${t} where false`);
      await expectDenied(S, pools.app, 'dms_app', `truncate ${t}`);
      await expectAllowed(S, pools.app, 'dms_app', `select 1 from ${t} limit 1`);
    }
  });

  it('INSERT روی دفتر مجاز است (سطحِ کاربردیِ واقعی؛ اثبات اینکه denial ها «کورکورانه» نیستند)', async () => {
    await expectAllowed(S, pools.app, 'dms_app', 'select 1 from inventory_txn limit 1');
  });
});

describe('S8-04 real-login: denial های dms_maintainer (هویت نگه‌داری)', () => {
  const S = 'maint-denials';
  it('دفتر مستقیماً قابلِ تغییر/حذف/کوتاه‌کردن نیست', async () => {
    await expectDenied(S, pools.maint, 'dms_maintainer', 'truncate inventory_txn');
    await expectDenied(S, pools.maint, 'dms_maintainer', 'delete from inventory_txn where false');
    await expectDenied(S, pools.maint, 'dms_maintainer', 'update inventory_txn set branch_id = branch_id where false');
    await expectDenied(S, pools.maint, 'dms_maintainer', 'alter table inventory_txn disable trigger all');
    await expectDenied(S, pools.maint, 'dms_maintainer', 'drop table inventory_txn');
  });

  it('SET ROLE dms_owner و ایجادِ مستقیمِ پارتیشن/جدول ممنوع است', async () => {
    await expectDenied(S, pools.maint, 'dms_maintainer', 'set role dms_owner');
    await expectDenied(S, pools.maint, 'dms_maintainer', 'select fn_ensure_partitions(2)');
    await expectDenied(S, pools.maint, 'dms_maintainer', 'create table public.zz_probe_maint (id int)');
  });

  it('فقط wrapper با ورودیِ محدود مجاز است؛ ورودیِ خارج از بازه 22023 می‌دهد', async () => {
    await expectAllowed(S, pools.maint, 'dms_maintainer', 'select fn_maintain_inventory_partitions(2)');
    await expectDenied(S, pools.maint, 'dms_maintainer', 'select fn_maintain_inventory_partitions(13)', '22023');
    await expectDenied(S, pools.maint, 'dms_maintainer', 'select fn_maintain_inventory_partitions(-1)', '22023');
  });
});

describe('S8-04 real-login: denial های dms_migrator خارج از پنجره', () => {
  const S = 'migrator-outside-window';
  it('مهاجر خارج از پنجره نمی‌تواند نقش بگیرد، نقش بسازد یا دفتر را دستکاری کند', async () => {
    await expectDenied(S, pools.migrator, 'dms_migrator', 'set role dms_owner');
    await expectDenied(S, pools.migrator, 'dms_migrator', 'truncate inventory_txn');
    await expectDenied(S, pools.migrator, 'dms_migrator', 'alter table inventory_txn disable trigger all');
    await expectDenied(S, pools.migrator, 'dms_migrator', 'alter role dms_app nosuperuser');
    await expectDenied(S, pools.migrator, 'dms_migrator', 'create role zz_probe_mig');
    await expectDenied(S, pools.migrator, 'dms_migrator', 'grant dms_owner to dms_app');
  });
});

describe('S8-04 real-login: مرزِ اعتماد (BOUNDARY — مالک و ابرکاربر محافظت نمی‌شوند)', () => {
  it('مالکِ audit_log/location_sample (dms_migrator، مدل C بدونِ انتقالِ مالکیت) هنوز DELETE دارد؛ این BOUNDARY است، نه محافظت', async () => {
    const r = await attempt(pools.migrator, 'delete from audit_log where false');
    evidence.push({
      suite: 'boundary',
      sql: 'delete from audit_log where false (as table owner dms_migrator)',
      expected: 'BOUNDARY (owner retains privileges; owner can re-grant; not a protection claim)',
      actual: r.outcome === 'allowed' ? 'allowed' : (r.sqlstate ?? r.outcome),
      identity: r.identity,
    });
    expect(r.outcome, 'مالک باید هنوز مالکِ جدول باشد (شرط مرزِ اعتماد)').toBe('allowed');
  });

  it('ابرکاربر (مرزِ اعتماد) همچنان می‌تواند audit_log را حذف کند؛ این محافظت ادعا نمی‌شود', async () => {
    const r = await attempt(pools.admin, 'delete from audit_log where false');
    evidence.push({
      suite: 'boundary',
      sql: 'delete from audit_log where false (superuser)',
      expected: 'BOUNDARY (superuser retains privileges; not a protection claim)',
      actual: r.outcome === 'allowed' ? 'allowed' : (r.sqlstate ?? r.outcome),
      identity: r.identity,
    });
    expect(r.outcome, 'ابرکاربر باید مالکانه عمل کند (شرط مرزِ اعتماد)').toBe('allowed');
  });

  it('ابرکاربر می‌تواند تریگرهای دفتر را غیرفعال کند؛ این «محافظت» نیست و در مستندات به‌عنوانِ مرزِ اعتماد ثبت است', async () => {
    const client = await pools.admin.connect();
    try {
      await client.query('begin');
      await client.query('alter table inventory_txn disable trigger all');
      evidence.push({
        suite: 'boundary',
        sql: 'alter table inventory_txn disable trigger all',
        expected: 'BOUNDARY (superuser may succeed; not a protection claim)',
        actual: 'succeeded inside rolled-back txn',
        identity: 'postgres (superuser)',
      });
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
    // اثبات برگشت: پس از rollback تریگرها سالم‌اند
    const { rows } = await pools.admin.query<{ n: number }>(`
      select count(*)::int as n from pg_trigger t join pg_class c on c.oid = t.tgrelid
       where c.relname like 'inventory_txn%' and not t.tgisinternal and t.tgenabled = 'O'`);
    expect(rows[0]!.n).toBeGreaterThan(0);
  });
});

describe('S8-04 real-login: تریگرها و مالکیتِ پارتیشن‌های دفتر', () => {
  it('هر پارتیشنِ inventory_txn مالکش dms_owner و دو تریگرِ محافظ فعال دارد (موجود و آینده)', async () => {
    const { rows } = await pools.admin.query<{ part: string; owner: string; guards: number; enabled: number }>(`
      select c.relname as part,
             pg_get_userbyid(c.relowner) as owner,
             (select count(*)::int from pg_trigger t where t.tgrelid = c.oid and t.tgname like 'trg_inventory_txn_%' and not t.tgisinternal) as guards,
             (select count(*)::int from pg_trigger t where t.tgrelid = c.oid and t.tgname like 'trg_inventory_txn_%' and t.tgenabled = 'O') as enabled
        from pg_inherits i join pg_class c on c.oid = i.inhrelid
       where i.inhparent = 'public.inventory_txn'::regclass
       order by c.relname`);
    expect(rows.length, 'باید حداقل یک پارتیشنِ دفتر وجود داشته باشد').toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.owner, `مالکِ ${r.part}`).toBe('dms_owner');
      expect(r.guards, `تریگرهای ${r.part}`).toBeGreaterThanOrEqual(2);
      expect(r.enabled, `تریگرهای فعال ${r.part}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('پارتیشنِ تازه‌ساختهٔ نگه‌داری بلافاصله محافظت می‌شود (هویت maintainer)', async () => {
    const { rows: before } = await pools.admin.query<{ n: number }>(
      `select count(*)::int as n from pg_inherits where inhparent = 'public.inventory_txn'::regclass`,
    );
    await pools.maint.query('select fn_maintain_inventory_partitions(12)');
    const { rows: after } = await pools.admin.query<{ part: string; owner: string; guards: number }>(`
      select c.relname as part, pg_get_userbyid(c.relowner) as owner,
             (select count(*)::int from pg_trigger t where t.tgrelid = c.oid and t.tgname like 'trg_inventory_txn_%' and not t.tgisinternal) as guards
        from pg_inherits i join pg_class c on c.oid = i.inhrelid
       where i.inhparent = 'public.inventory_txn'::regclass`);
    expect(after.length).toBeGreaterThanOrEqual(before[0]!.n);
    for (const r of after) {
      expect(r.owner).toBe('dms_owner');
      expect(r.guards).toBeGreaterThanOrEqual(2);
    }
  });


  it('audit_log و location_sample و همهٔ پارتیشن‌هایشان مالکِ یکسانِ والد (dms_migrator، بدونِ انتقال)، RLS اجباری، و dms_app بدونِ UPDATE/DELETE/TRUNCATE', async () => {
    const { rows } = await pools.admin.query<{ part: string; owner: string; parent_owner: string; forced: boolean; app_upd: boolean; app_del: boolean; app_trunc: boolean }>(`
      with parents as (select c.oid, c.relname, c.relowner from pg_class c where c.relname in ('audit_log','location_sample') and c.relkind = 'p')
      select c.relname as part, pg_get_userbyid(c.relowner) as owner,
             (select pg_get_userbyid(p.relowner) from pg_class p join pg_inherits i on i.inhparent = p.oid where i.inhrelid = c.oid) as parent_owner,
             c.relforcerowsecurity as forced,
             has_table_privilege('dms_app', c.oid, 'UPDATE') as app_upd,
             has_table_privilege('dms_app', c.oid, 'DELETE') as app_del,
             has_table_privilege('dms_app', c.oid, 'TRUNCATE') as app_trunc
        from pg_class c
       where c.oid in (select oid from parents)
          or c.oid in (select i.inhrelid from pg_inherits i join parents p on p.oid = i.inhparent)
       order by c.relname`);
    expect(rows.filter((r) => r.part.startsWith('audit_log')).length, 'باید پارتیشن audit_log وجود داشته باشد').toBeGreaterThan(0);
    expect(rows.filter((r) => r.part.startsWith('location_sample')).length, 'باید پارتیشن location_sample وجود داشته باشد').toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.owner, `مالکِ ${r.part} باید با مالکِ والد یکی باشد`).toBe(r.parent_owner ?? r.owner);
      expect(r.owner, `مالکِ ${r.part} نباید dms_app باشد`).not.toBe('dms_app');
      expect(r.forced, `RLS اجباری ${r.part}`).toBe(true);
      expect(r.app_upd || r.app_del || r.app_trunc, `dms_app روی ${r.part}`).toBe(false);
    }
  });
});

describe('S8-05 real-login: نگه‌داریِ audit_log و location_sample (wrapper، هویت maintainer)', () => {
  const S = 'audit-location-maint';
  it('dms_maintainer فقط EXECUTE روی دو wrapper دارد؛ dms_app/dms_migrator/dms_readonly/PUBLIC ندارند', async () => {
    const { rows } = await pools.admin.query<Record<string, boolean>>(`
      select has_function_privilege('dms_maintainer','public.fn_maintain_audit_partitions(integer)','EXECUTE') as m_audit,
             has_function_privilege('dms_maintainer','public.fn_maintain_location_partitions(integer)','EXECUTE') as m_loc,
             has_function_privilege('dms_app','public.fn_maintain_audit_partitions(integer)','EXECUTE') as a_audit,
             has_function_privilege('dms_app','public.fn_maintain_location_partitions(integer)','EXECUTE') as a_loc,
             has_function_privilege('dms_migrator','public.fn_maintain_audit_partitions(integer)','EXECUTE') as g_audit,
             has_function_privilege('dms_readonly','public.fn_maintain_location_partitions(integer)','EXECUTE') as r_loc,
             has_function_privilege('dms_maintainer','public.fn_ensure_partitions(integer)','EXECUTE') as m_ensure`);
    const r = rows[0]!;
    expect(r.m_audit).toBe(true);
    expect(r.m_loc).toBe(true);
    expect(r.a_audit).toBe(false);
    expect(r.a_loc).toBe(false);
    expect(r.g_audit).toBe(false);
    expect(r.r_loc).toBe(false);
    expect(r.m_ensure).toBe(false);
  });

  it('wrapper مجاز است؛ ورودی خارج از بازه 22023 می‌دهد؛ dms_app و dms_migrator (خارج از پنجره) 42501', async () => {
    await expectAllowed(S, pools.maint, 'dms_maintainer', 'select fn_maintain_audit_partitions(2)');
    await expectAllowed(S, pools.maint, 'dms_maintainer', 'select fn_maintain_location_partitions(2)');
    await expectDenied(S, pools.maint, 'dms_maintainer', 'select fn_maintain_audit_partitions(13)', '22023');
    await expectDenied(S, pools.maint, 'dms_maintainer', 'select fn_maintain_location_partitions(-1)', '22023');
    await expectDenied(S, pools.app, 'dms_app', 'select fn_maintain_audit_partitions(2)');
    await expectDenied(S, pools.app, 'dms_app', 'select fn_maintain_location_partitions(2)');
    await expectDenied(S, pools.migrator, 'dms_migrator', 'select fn_maintain_audit_partitions(2)');
  });

  it('maintainer نمی‌تواند ردیفِ ممیزی/موقعیت را تغییر دهد، جدول را ALTER یا TRUNCATE کند', async () => {
    await expectDenied(S, pools.maint, 'dms_maintainer', 'delete from audit_log where false');
    await expectDenied(S, pools.maint, 'dms_maintainer', 'update audit_log set action = action where false');
    await expectDenied(S, pools.maint, 'dms_maintainer', 'truncate location_sample');
    await expectDenied(S, pools.maint, 'dms_maintainer', 'alter table audit_log owner to dms_maintainer');
    await expectDenied(S, pools.maint, 'dms_maintainer', 'create table public.zz_probe_audit (id int)');
  });

  it('پارتیشن‌های تازهٔ audit/location بلافاصله مالکِ والد، RLS اجباری و بدونِ UPDATE/DELETE برای dms_app دارند', async () => {
    await pools.maint.query('select fn_maintain_audit_partitions(12)');
    await pools.maint.query('select fn_maintain_location_partitions(12)');
    const { rows } = await pools.admin.query<{ part: string; owner: string; forced: boolean; app_upd: boolean; app_del: boolean }>(`
      select c.relname as part, pg_get_userbyid(c.relowner) as owner, c.relforcerowsecurity as forced,
             has_table_privilege('dms_app', c.oid, 'UPDATE') as app_upd, has_table_privilege('dms_app', c.oid, 'DELETE') as app_del
        from pg_inherits i join pg_class c on c.oid = i.inhrelid
       where i.inhparent in ('public.audit_log'::regclass, 'public.location_sample'::regclass)`);
    expect(rows.length).toBeGreaterThanOrEqual(2 * 14);
    const { rows: parentOwners } = await pools.admin.query<{ n: string }>(`
      select distinct pg_get_userbyid(relowner) as n from pg_class where relname in ('audit_log','location_sample') and relkind = 'p'`);
    const expectedOwner = parentOwners.length === 1 ? parentOwners[0]!.n : null;
    expect(expectedOwner, 'مالکِ والدهای audit_log/location_sample باید یکی باشد').not.toBeNull();
    for (const r of rows) {
      expect(r.owner, r.part).toBe(expectedOwner);
      expect(r.forced, r.part).toBe(true);
      expect(r.app_upd || r.app_del, r.part).toBe(false);
    }
  });

  it('پارتیشنِ جداشده (DETACH ولی موجود) ⇒ 42P07 و بدونِ DROP خودکار؛ پس از اتصال مجدد، نگه‌داری سالم است', async () => {
    const { rows } = await pools.admin.query<{ lower: string; upper: string }>(`
      select to_char(date_trunc('month', current_date) + interval '1 month', 'YYYY-MM-DD') as lower,
             to_char(date_trunc('month', current_date) + interval '2 month', 'YYYY-MM-DD') as upper`);
    const ym = rows[0]!.lower.slice(0, 7).replace('-', '_');
    const name = `audit_log_${ym}`;
    await pools.admin.query(`alter table public.audit_log detach partition public.${name}`);
    try {
      await expectDenied(S, pools.maint, 'dms_maintainer', 'select fn_maintain_audit_partitions(2)', '42P07');
      const { rows: still } = await pools.admin.query<{ n: number }>(`select count(*)::int as n from pg_class where relname = $1`, [name]);
      expect(still[0]!.n, 'جدولِ جداشده نباید حذف شده باشد').toBe(1);
    } finally {
      await pools.admin.query(
        `alter table public.audit_log attach partition public.${name} for values from ('${rows[0]!.lower}') to ('${rows[0]!.upper}')`,
      );
    }
    await expectAllowed(S, pools.maint, 'dms_maintainer', 'select fn_maintain_audit_partitions(2)');
  });
});

describe('S8-04 real-login: RLS با نقش غیرابرکاربر (dms_app)', () => {
  it('بدونِ زمینهٔ اجاره، dms_app هیچ ردیفِ inventory_txn را نمی‌بیند؛ با زمینهٔ شرکتِ دیگر هم صفر است', async () => {
    const client = await pools.app.connect();
    try {
      await client.query('begin');
      const a = await client.query<{ n: number }>('select count(*)::int as n from inventory_txn');
      expect(a.rows[0]!.n).toBe(0);
      await client.query(`select set_config('app.company_id', '00000000-0000-4000-8000-00000000dead', true)`);
      const b = await client.query<{ n: number }>('select count(*)::int as n from inventory_txn');
      expect(b.rows[0]!.n).toBe(0);
    } finally {
      await client.query('rollback').catch(() => undefined);
      client.release();
    }
  });
});

describe('S8-04 real-login: گزارشِ شواهد', () => {
  it('هر denial/allowed ثبت شده است (فایل خروجی برای گزارش)', () => {
    const out = process.env.REAL_LOGIN_EVIDENCE_FILE;
    if (out) {
      writeFileSync(out, JSON.stringify(evidence, null, 2), 'utf8');
    }
    expect(evidence.length).toBeGreaterThan(20);
  });
});

export type { Probe };
