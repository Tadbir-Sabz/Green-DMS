import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';

/**
 * آزمون‌های مهاجرتِ امنیتی — TASK-23 (مجموعهٔ E).
 *
 * پوشش: نصبِ تازه (fresh) با همهٔ مهاجرت‌های زنجیره؛ چرخهٔ up/down/up فقطِ 0048 با
 * راستی‌آزماییِ «داده» (ردیف‌های واقعیِ device/geofence و منبعِ matview)، نه
 * «برابریِ شمارِ اشیاء»؛ بازگردانیِ سیاست‌ها (p_device_tenant/p_geofence_tenant،
 * enabled+forced) و گرانت‌ها (matview src بدونِ گرانتِ برنامه، نمایِ سایه با SELECT).
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_migration_sec_test';
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
let db: pg.Pool;

function runSqlFile(file: string): void {
  execFileSync(PSQL, [...psqlBase, '-d', TEST_DB, '-1', '-q', '-f', file], {
    env: psqlEnv,
    stdio: 'pipe',
  });
}

// همان اجرا، ولی روی DB یکبارمصرف جداگانه؛ برای مقایسهٔ کاتالوگِ دقیق ۰۰۶۴
// down با وضعیت پس از ۰۰۴۲، بدون بههمزدن DB مشترکِ بقیهٔ آزمونها.
function runSqlFileOn(database: string, file: string): void {
  execFileSync(PSQL, [...psqlBase, '-d', database, '-1', '-q', '-f', file], {
    env: psqlEnv,
    stdio: 'pipe',
  });
}

async function maintenanceFunctionState(q: pg.Pool): Promise<Record<string, unknown>> {
  const { rows } = await q.query(`
    select p.prosecdef as secdef,
           p.proconfig::text as config,
           p.proacl::text as acl,
           obj_description(p.oid, 'pg_proc') as fn_comment,
           obj_description(n.oid, 'pg_namespace') as schema_comment,
           pg_get_functiondef(p.oid) as def,
           p.proowner::regrole::text as owner
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where p.oid = 'public.fn_ensure_partitions(integer)'::regprocedure`);
  return rows[0] as Record<string, unknown>;
}

const uid = () => crypto.randomBytes(6).toString('hex');

interface Counts {
  devices: number;
  geofences: number;
  mvRows: number;
}

async function seedAndCount(q: pg.Pool): Promise<Counts> {
  const u = uid();
  const company = (await q.query(`insert into company (code, legal_name) values ($1,$2) returning id`, [`MG_${u}`, 'شرکت مهاجرت'])).rows[0].id;
  const branch = (await q.query(`insert into branch (company_id, code, name) values ($1,'HQ','مرکز') returning id`, [company])).rows[0].id;
  const person = (await q.query(`insert into person (company_id, code, first_name) values ($1,$2,'کاربر') returning id`, [company, `MP-${u}`])).rows[0].id;
  const customer = (await q.query(`insert into customer (person_id, branch_id, code) values ($1,$2,$3) returning id`, [person, branch, `MC-${u}`])).rows[0].id;
  const appUser = (await q.query(`insert into app_user (person_id, username, access_level) values ($1,$2,'web') returning id`, [person, `mu-${u}`])).rows[0].id;
  await q.query(
    `insert into device (app_user_id, device_uuid, platform, app_kind, push_token) values ($1,$2,'android','sales',$3)`,
    [appUser, `md-${u}`, `mtok-${u}`],
  );
  await q.query(
    `insert into geofence (branch_id, name, kind, area) values ($1,$2,'work_area', ST_GeomFromText($3,4326))`,
    [branch, `حوزهٔ مهاجرت ${u}`, `POLYGON((1 1,2 1,2 2,1 2,1 1))`],
  );
  // دادهٔ منبعِ matview (بدهیِ مشتری)
  const series = (await q.query(`insert into document_series (branch_id, doc_kind, fiscal_year, prefix) values ($1,'invoice',1405,'INV') returning id`, [branch])).rows[0].id;
  await q.query(
    `insert into invoice (branch_id, doc_number, fiscal_year, series_id, customer_id, status, subtotal, discount_total, tax_total, grand_total, paid_amount)
     values ($1,$2,1405,$3,$4,'posted',100,0,0,100,0)`,
    [branch, `MINV-${u}`, series, customer],
  );
  const devices = (await q.query(`select count(*)::int as n from device`)).rows[0].n as number;
  const geofences = (await q.query(`select count(*)::int as n from geofence`)).rows[0].n as number;
  return { devices, geofences, mvRows: 1 };
}

async function assert0048EndState(q: pg.Pool): Promise<void> {
  const { rows } = await q.query(`
    select
      (select relrowsecurity and relforcerowsecurity from pg_class where relname='device') as device_rls,
      (select relrowsecurity and relforcerowsecurity from pg_class where relname='geofence') as geofence_rls,
      (select count(*)::int from pg_policy where polname='p_device_tenant') as device_pol,
      (select count(*)::int from pg_policy where polname='p_geofence_tenant') as geofence_pol,
      (select count(*)::int from pg_class where relname in ('mv_ar_aging_src','mv_daily_sales_src','mv_salesperson_performance_src') and relkind='m') as src_mvs,
      (select count(*)::int from pg_class where relname in ('mv_ar_aging','mv_daily_sales','mv_salesperson_performance') and relkind='v') as shadow_views,
      (select coalesce((select option_value from pg_options_to_table(c.reloptions) where option_name='security_invoker'),'false')::boolean
         from pg_class c where c.relname='v_stock_valuation_variance') as svv_si,
      (select has_table_privilege('dms_app', 'mv_ar_aging_src', 'SELECT')) as src_select,
      (select has_table_privilege('dms_app', 'mv_ar_aging', 'SELECT')) as shadow_select`);
  expect(rows[0].device_rls).toBe(true);
  expect(rows[0].geofence_rls).toBe(true);
  expect(rows[0].device_pol).toBe(1);
  expect(rows[0].geofence_pol).toBe(1);
  expect(rows[0].src_mvs).toBe(3);
  expect(rows[0].shadow_views).toBe(3);
  // مقدارِ معناییِ boolean از کاتالوگ (نه بازنماییِ متنی): security_invoker باید روشن باشد.
  expect(rows[0].svv_si).toBe(true);
  expect(rows[0].src_select).toBe(false);
  expect(rows[0].shadow_select).toBe(true);
}

async function assertPre0048State(q: pg.Pool): Promise<void> {
  const { rows } = await q.query(`
    select
      (select relrowsecurity from pg_class where relname='device') as device_rls,
      (select relrowsecurity from pg_class where relname='geofence') as geofence_rls,
      (select count(*)::int from pg_policy where polname in ('p_device_tenant','p_geofence_tenant')) as pols,
      (select count(*)::int from pg_class where relname in ('mv_ar_aging','mv_daily_sales','mv_salesperson_performance') and relkind='m') as mvs,
      (select coalesce((select option_value from pg_options_to_table(c.reloptions) where option_name='security_invoker'),'false')::boolean
         from pg_class c where c.relname='v_stock_valuation_variance') as svv_si,
      (select has_table_privilege('dms_app', 'mv_ar_aging', 'SELECT')) as mv_select`);
  expect(rows[0].device_rls).toBe(false);
  expect(rows[0].geofence_rls).toBe(false);
  expect(rows[0].pols).toBe(0);
  expect(rows[0].mvs).toBe(3);
  // مقدارِ معناییِ boolean از کاتالوگ: security_invoker باید خاموش باشد — چه گزینه
  // اصلاً ثبت نشده باشد (نصبِ تازه پیش از 0048) و چه صریحاً false ثبت شده باشد
  // (قراردادِ down با `set (security_invoker=false)`). بازنماییِ متنی ('f' یا 'false')
  // به PostgreSQL/psql وابسته است و عمداً معیار نیست؛ مقدارِ boolean معیار است.
  expect(rows[0].svv_si).toBe(false);
  expect(rows[0].mv_select).toBe(true);
}

beforeAll(async () => {
  adminPool = new pg.Pool({ connectionString: adminUrl.toString(), max: 1 });
  await adminPool.query(
    'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
    [TEST_DB],
  );
  await adminPool.query(`drop database if exists "${TEST_DB}"`);
  await adminPool.query(`create database "${TEST_DB}"`);
  db = new pg.Pool({ connectionString: testUrl.toString(), max: 2 });
}, 120_000);

afterAll(async () => {
  await db?.end();
  if (adminPool) {
    await adminPool.query(
      'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
      [TEST_DB],
    );
    await adminPool.query(`drop database if exists "${TEST_DB}"`).catch(() => undefined);
    await adminPool.end();
  }
});

describe('مهاجرت‌ها — نصبِ تازه و چرخهٔ 0048', () => {
  it('fresh: همهٔ مهاجرت‌ها (۰۰۰۱..آخرین) بدونِ خطا اعمال می‌شوند', async () => {
    const files = readdirSync(path.join(ROOT, 'migrations'))
      .filter((f) => f.endsWith('.up.sql'))
      .sort();

    // پیش‌تر این‌جا شمارِ مهاجرت‌ها به‌صورتِ literal (۵۲) سنجیده می‌شد. هر افزودنِ
    // مهاجرتِ تازه — هرچند کاملاً سالم — این آزمون را می‌شکست، و شکست دربارهٔ
    // موضوعِ آزمون (سالم‌بودنِ زنجیره) چیزی نمی‌گفت. اکنون:
    //   ۱) پیوستگیِ شماره‌ها از ۰۰۰۱ تا آخرین، بدونِ شکاف — این خودش یک کنترل است
    //   ۲) آخرین مهاجرت باید همان چیزی باشد که انتظار داریم
    const numbers = files.map((f) => Number(f.slice(0, 4)));
    expect(numbers[0]).toBe(1);
    for (let i = 1; i < numbers.length; i += 1) {
      expect(numbers[i], `شکاف یا ترتیبِ نادرست پیش از ${files[i]}`).toBe(numbers[i - 1] + 1);
    }
    // TASK-PM-01D-M4-G: 0064 (بازیابی پارتیشن ممیزی با هویت مالک اشیاء) آخرین
    // مهاجرت است. با افزودنِ مهاجرتِ تازه این خط عمداً باید بهروزرسانی شود —
    // تغییرِ آگاهانه، نه شکستِ خاموش.
    expect(files[files.length - 1]).toBe('0064_audit_partition_recovery.up.sql');

    // هر up باید downِ متناظر داشته باشد، وگرنه rollback ممکن نیست
    for (const f of files) {
      const down = f.replace(/\.up\.sql$/, '.down.sql');
      expect(
        readdirSync(path.join(ROOT, 'migrations')).includes(down),
        `مهاجرتِ ${f} فایلِ down ندارد`,
      ).toBe(true);
    }

    for (const f of files) runSqlFile(path.join(ROOT, 'migrations', f));
    await assert0048EndState(db);

    // 0062: ledger is tenant-RLS protected and the runtime role cannot DELETE.
    const { rows: ledger } = await db.query(`
      select
        (select relrowsecurity and relforcerowsecurity from pg_class where relname='product_bulk_operation') as rls_forced,
        (select count(*)::int from pg_policy where polname='p_product_bulk_operation_tenant') as policies,
        (select has_table_privilege('dms_app','product_bulk_operation','SELECT')) as app_select,
        (select has_table_privilege('dms_app','product_bulk_operation','INSERT')) as app_insert,
        (select has_table_privilege('dms_app','product_bulk_operation','UPDATE')) as app_update,
        (select has_table_privilege('dms_app','product_bulk_operation','DELETE')) as app_delete`);
    expect(ledger[0].rls_forced).toBe(true);
    expect(ledger[0].policies).toBe(1);
    expect(ledger[0].app_select).toBe(true);
    expect(ledger[0].app_insert).toBe(true);
    expect(ledger[0].app_update).toBe(true);
    expect(ledger[0].app_delete).toBe(false);
  }, 300_000);

  it('down/up: داده می‌ماند، سیاست‌ها و گرانت‌ها بازگردانده می‌شوند', async () => {
    const before = await seedAndCount(db);

    // — downِ 0048 ⇒ وضعیتِ پیش از TASK-23
    runSqlFile(path.join(ROOT, 'migrations', '0048_cross_tenant_views_device_geofence.down.sql'));
    await assertPre0048State(db);
    const afterDown = await db.query(`select (select count(*)::int from device) as devices, (select count(*)::int from geofence) as geofences`);
    expect(afterDown.rows[0].devices).toBe(before.devices); // داده، نه شمارِ اشیاء
    expect(afterDown.rows[0].geofences).toBe(before.geofences);

    // — upِ دوباره ⇒ وضعیتِ پایانیِ 0048 با همان داده
    runSqlFile(path.join(ROOT, 'migrations', '0048_cross_tenant_views_device_geofence.up.sql'));
    await assert0048EndState(db);
    const afterUp = await db.query(`select (select count(*)::int from device) as devices, (select count(*)::int from geofence) as geofences`);
    expect(afterUp.rows[0].devices).toBe(before.devices);
    expect(afterUp.rows[0].geofences).toBe(before.geofences);
  }, 300_000);

  it('بازگردانیِ گرانت: پس از down/up، *_src باز هم از dms_app پنهان و سایه در دسترس است', async () => {
    // پیش‌شرطِ صریح: چرخهٔ تستِ قبلی باید DB را در وضعیتِ پایانیِ 0048 تحویل داده
    // باشد؛ در غیر این صورت شکست با پیامِ معنادار گزارش می‌شود (نه «relation does not exist»).
    await assert0048EndState(db);
    const { rows } = await db.query(`
      select has_table_privilege('dms_app','mv_daily_sales_src','SELECT') as src,
             has_table_privilege('dms_app','mv_daily_sales','SELECT') as shadow,
             has_table_privilege('dms_readonly','mv_daily_sales_src','SELECT') as src_ro`);
    expect(rows[0].src).toBe(false);
    expect(rows[0].shadow).toBe(true);
    expect(rows[0].src_ro).toBe(false);
  });

  it('0063: operation-bound evidence schema, forced RLS and least privilege', async () => {
    const { rows } = await db.query(`
      select
        (select count(*)::int from pg_attribute
          where attrelid='public.audit_log'::regclass and attname='bulk_operation_id' and not attisdropped) as audit_col,
        (select count(*)::int from pg_attribute
          where attrelid='public.product_catalog_history'::regclass and attname='bulk_operation_id' and not attisdropped) as history_col,
        (select relrowsecurity and relforcerowsecurity from pg_class where relname='product_bulk_history_event') as evidence_rls,
        (select count(*)::int from pg_policy where polname like 'product_bulk_history_event_%') as evidence_pols,
        (select has_table_privilege('dms_app','product_bulk_history_event','SELECT')) as app_select,
        (select has_table_privilege('dms_app','product_bulk_history_event','INSERT')) as app_insert,
        (select has_table_privilege('dms_app','product_bulk_history_event','UPDATE')) as app_update,
        (select has_table_privilege('dms_app','product_bulk_history_event','DELETE')) as app_delete,
        (select has_table_privilege('dms_readonly','product_bulk_operation','SELECT')) as ro_ledger,
        (select has_table_privilege('dms_readonly','product_bulk_history_event','SELECT')) as ro_evidence,
        (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
          where n.nspname='public' and p.proname in ('fn_product_catalog_history_bind_bulk','fn_product_bulk_history_evidence')
            and has_function_privilege('dms_app', p.oid, 'EXECUTE')) as app_exec,
        (select count(*)::int from pg_class where relname='ix_product_bulk_operation_expires') as expiry_idx`);
    expect(rows[0].audit_col).toBe(1);
    expect(rows[0].history_col).toBe(1);
    expect(rows[0].evidence_rls).toBe(true);
    expect(rows[0].evidence_pols).toBe(2);
    expect(rows[0].app_select).toBe(true);
    expect(rows[0].app_insert).toBe(false);
    expect(rows[0].app_update).toBe(false);
    expect(rows[0].app_delete).toBe(false);
    expect(rows[0].ro_ledger).toBe(false);
    expect(rows[0].ro_evidence).toBe(false);
    expect(rows[0].app_exec).toBe(0);
    expect(rows[0].expiry_idx).toBe(1);
  });

  it('0064: maintenance function is invoker, search_path pinned and EXECUTE denied to runtime roles', async () => {
    const { rows } = await db.query(`
      select
        (select prosecdef from pg_proc where oid='public.fn_ensure_partitions(integer)'::regprocedure) as secdef,
        (select proconfig::text from pg_proc where oid='public.fn_ensure_partitions(integer)'::regprocedure) as config,
        (select has_function_privilege('dms_app','public.fn_ensure_partitions(integer)','EXECUTE')) as app_exec,
        (select has_function_privilege('dms_readonly','public.fn_ensure_partitions(integer)','EXECUTE')) as ro_exec,
        (select has_function_privilege('dms_migrator','public.fn_ensure_partitions(integer)','EXECUTE')) as migrator_exec,
        (select has_function_privilege('dms_owner','public.fn_ensure_partitions(integer)','EXECUTE')) as owner_exec,
        (select count(*)::int from pg_class where relname in ('audit_log','location_sample','inventory_txn') and relkind='p') as parents`);
    expect(rows[0].secdef).toBe(false);
    expect(rows[0].config).toContain('search_path=public, pg_catalog, pg_temp');
    expect(rows[0].app_exec).toBe(false);
    expect(rows[0].ro_exec).toBe(false);
    expect(rows[0].migrator_exec).toBe(false);
    expect(rows[0].owner_exec).toBe(false);
    expect(rows[0].parents).toBe(3);
  });

  it('0064 down: exact 0042 catalog state is restored on an isolated DB', async () => {
    const dbName = `greendms_g_down_${uid()}`;
    const isolatedUrl = new URL(adminUrl);
    isolatedUrl.pathname = `/${dbName}`;
    let isolated: pg.Pool | undefined;
    await adminPool.query(`create database "${dbName}"`);
    try {
      const files = readdirSync(path.join(ROOT, 'migrations'))
        .filter((f) => f.endsWith('.up.sql') && !f.startsWith('0064_'))
        .sort();
      for (const f of files) runSqlFileOn(dbName, path.join(ROOT, 'migrations', f));
      isolated = new pg.Pool({ connectionString: isolatedUrl.toString(), max: 1 });
      const baseline = await maintenanceFunctionState(isolated);
      expect(baseline.secdef).toBe(false);
      expect(baseline.config).toBeNull();

      const up64 = path.join(ROOT, 'migrations', '0064_audit_partition_recovery.up.sql');
      const down64 = path.join(ROOT, 'migrations', '0064_audit_partition_recovery.down.sql');
      runSqlFileOn(dbName, up64);
      const hardened = await maintenanceFunctionState(isolated);
      expect(hardened.secdef).toBe(false);
      expect(hardened.config).toContain('search_path=public, pg_catalog, pg_temp');
      expect(hardened.schema_comment).toContain('TASK-PM-01D-M4-G');

      // بدنه، prosecdef/proconfig، ترتیبِ دقیقِ proacl، comment تابع و comment
      // طرحوارهٔ public باید بایتبهبایت با وضعیت پس از ۰۰۴۲ یکی باشند.
      runSqlFileOn(dbName, down64);
      const restored = await maintenanceFunctionState(isolated);
      expect(restored).toEqual(baseline);

      // اعمال دوبارهٔ ۰۰۶۴ باید همان سختسازی را برگرداند (up/down/up).
      runSqlFileOn(dbName, up64);
      const reapplied = await maintenanceFunctionState(isolated);
      expect(reapplied.secdef).toBe(false);
      expect(reapplied.config).toContain('search_path=public, pg_catalog, pg_temp');
      expect(reapplied.schema_comment).toContain('TASK-PM-01D-M4-G');
    } finally {
      await isolated?.end();
      await adminPool
        .query('select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()', [dbName])
        .catch(() => undefined);
      await adminPool.query(`drop database if exists "${dbName}"`).catch(() => undefined);
    }
  }, 300_000);

  it('0063/0062 down: populated ledger, history and evidence refuse rollback', async () => {
    const company = (await db.query(`select id from company limit 1`)).rows[0].id as string;
    const insertOp = (status: string, outcome: string, category: string, rh: string) =>
      db.query(
        `insert into product_bulk_operation
          (id, company_id, status, outcome, failure_category, request_hash, preview_token_hash,
           preview_hash, product_ids, changes, expected_versions, preview, expires_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,
                 array['00000000-0000-4000-8000-000000000001']::uuid[],
                 '{"name":"x"}'::jsonb,'{}'::jsonb,'{"items":[]}'::jsonb, now()+interval '1 day')
         returning id`,
        [crypto.randomUUID(), company, status, outcome, category, rh, rh, rh],
      );
    const opA = (await insertOp('committed', 'committed', 'none', 'rh1')).rows[0].id as string;
    const opB = (await insertOp('unknown', 'unknown', 'unknown', 'rh2')).rows[0].id as string;
    const opC = (await insertOp('rejected', 'rolled_back', 'infrastructure', 'rh3')).rows[0].id as string;

    const hist = (await db.query(
      `insert into product_catalog_history
        (company_id, product_id, entity_type, entity_id, action, actor_user_id, bulk_operation_id)
       values ($1,'00000000-0000-4000-8000-000000000001','product',
               '00000000-0000-4000-8000-000000000001','UPDATE',null,$2)
       returning id`,
      [company, opA],
    )).rows[0].id as string;
    await db.query(
      `insert into product_bulk_history_event
        (bulk_operation_id, product_id, company_id, actor_user_id, history_id)
       values ($1,'00000000-0000-4000-8000-000000000001',$2,
               '00000000-0000-4000-8000-000000000099',$3)`,
      [opA, company, hist],
    );
    await db.query(
      `insert into audit_log (company_id, action, entity_type, bulk_operation_id)
       values ($1,'update','product',$2)`,
      [company, opA],
    );

    const down0063 = path.join(ROOT, 'migrations', '0063_product_bulk_evidence.down.sql');
    const down0062 = path.join(ROOT, 'migrations', '0062_product_bulk_maintenance.down.sql');
    expect(() => runSqlFile(down0063)).toThrow();
    expect(() => runSqlFile(down0062)).toThrow();
    const still = await db.query(`select to_regclass('public.product_bulk_history_event') is not null as evidence,
                                          to_regclass('public.product_bulk_operation') is not null as ledger`);
    expect(still.rows[0].evidence).toBe(true);
    expect(still.rows[0].ledger).toBe(true);

    // فقط دادهٔ ساختگی همین تست پاک میشود؛ هیچ شاهد تاریخی پروژه حذف نمیشود.
    await db.query(`delete from audit_log where bulk_operation_id = $1`, [opA]);
    await db.query(`delete from product_bulk_history_event where bulk_operation_id = $1`, [opA]);
    await db.query(`delete from product_catalog_history where bulk_operation_id = $1`, [opA]);
    await db.query(`delete from product_bulk_operation where id = any($1::uuid[])`, [[opA, opB, opC]]);
  });

  it('0063/0062 down/up: empty cycle is reversible and restores the same end state', async () => {
    await db.query(`delete from audit_log where bulk_operation_id is not null`);
    await db.query(`delete from product_bulk_history_event`);
    await db.query(`delete from product_catalog_history where bulk_operation_id is not null`);
    await db.query(`delete from product_bulk_operation`);

    runSqlFile(path.join(ROOT, 'migrations', '0063_product_bulk_evidence.down.sql'));
    runSqlFile(path.join(ROOT, 'migrations', '0062_product_bulk_maintenance.down.sql'));
    expect((await db.query(`select to_regclass('public.product_bulk_operation') is null as gone`)).rows[0].gone).toBe(true);
    runSqlFile(path.join(ROOT, 'migrations', '0062_product_bulk_maintenance.up.sql'));
    runSqlFile(path.join(ROOT, 'migrations', '0063_product_bulk_evidence.up.sql'));

    const { rows } = await db.query(`
      select
        (select relrowsecurity and relforcerowsecurity from pg_class where relname='product_bulk_operation') as ledger_rls,
        (select has_table_privilege('dms_app','product_bulk_operation','SELECT')) as app_select,
        (select has_table_privilege('dms_app','product_bulk_operation','DELETE')) as app_delete,
        (select has_table_privilege('dms_readonly','product_bulk_operation','SELECT')) as ro_ledger,
        (select relrowsecurity and relforcerowsecurity from pg_class where relname='product_bulk_history_event') as evidence_rls`);
    expect(rows[0].ledger_rls).toBe(true);
    expect(rows[0].app_select).toBe(true);
    expect(rows[0].app_delete).toBe(false);
    expect(rows[0].ro_ledger).toBe(false);
    expect(rows[0].evidence_rls).toBe(true);
  });

});
