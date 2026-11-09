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
 * پوشش: نصبِ تازه (fresh) با همهٔ ۴۹ مهاجرت؛ چرخهٔ up/down/up فقطِ 0048 با
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
    // TASK-24Y: 0053 (معماریِ تأیید) آخرین مهاجرت است. با افزودنِ مهاجرتِ تازه
    // این خط عمداً باید به‌روزرسانی شود — تغییرِ آگاهانه، نه شکستِ خاموش.
    expect(files[files.length - 1]).toBe('0058_invoice_empty_user_scope.up.sql');

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
});
