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
 * آزمون‌های جداسازیِ نماها — TASK-23 (مجموعهٔ A).
 *
 * هدف: اثباتِ رفتارِ واقعیِ PostgreSQL زیرِ نقشِ زمانِ اجرای برنامه (`dms_app`
 * معادلِ واقعی — rolsuper=false/rolbypassrls=false/غیرمالک) برای همهٔ نماها و
 * materialized viewهای عمومی، پس از مهاجرت 0048:
 *   - نماهای چهارگانه با security_invoker: RLSِ نقشِ فراخوان اعمال می‌شود
 *     (مسیرهای بازگشتی: subqueryهای داخلِ تعریفِ نما هم زیرِ RLS همان فراخوان‌اند).
 *   - matviewها: RLS ندارند (پشتیبانی‌نشده) ⇒ نمایِ سایهٔ هم‌نام با قیدِ صریحِ
 *     اجاره + پس‌گیریِ گرانتِ مستقیمِ *_src.
 *   - fail-closed: بدونِ زمینه/زمینهٔ نامعتبر ⇒ صفر ردیف (نه خطا، نه نشت).
 *   - مسیرِ جایگزین وجود ندارد: هیچ نمایِ دارایِ گرانتِ برنامه، سطرِ اجارهٔ دیگر
 *     را آشکار نمی‌کند.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_view_iso_test';
const PSQL = process.env.PSQL ?? 'psql';
const RUNTIME_ROLE = 'dms_app';
const RUNTIME_PASSWORD = `T${crypto.randomBytes(12).toString('hex')}!9x`;

const adminUrl = new URL(process.env.DATABASE_URL ?? '');
const testUrl = new URL(adminUrl);
testUrl.pathname = `/${TEST_DB}`;
const appUrl = new URL(testUrl);
appUrl.username = RUNTIME_ROLE;
appUrl.password = RUNTIME_PASSWORD;

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
let ownerPool: pg.Pool;

type TenantCtx = { company: string; appUser: string } | 'none' | 'invalid';

async function asRuntime<T>(ctx: TenantCtx, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: appUrl.toString() });
  await client.connect();
  try {
    if (ctx === 'invalid') {
      await client.query(`select set_config('app.company_id', 'not-a-uuid', false), set_config('app.user_id', 'not-a-uuid', false)`);
    } else if (ctx !== 'none') {
      // دقیقاً مکانیزمِ tenant-context.ts: هر دو GUC (company + user با user_scope)
      await client.query(`select set_config('app.company_id', $1, false), set_config('app.user_id', $2, false)`, [
        ctx.company,
        ctx.appUser,
      ]);
    }
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** fail-closed: یا صفر ردیف برمی‌گردد یا خطا (بدونِ هیچ داده‌ای). */
async function expectFailClosed(promise: Promise<pg.QueryResult>, label: string): Promise<void> {
  try {
    const res = await promise;
    expect(res.rowCount, label).toBe(0);
  } catch (err) {
    expect(['42501', '42504', '42704', '22023', '22P02'], `${label}: ${(err as Error).message}`).toContain(
      (err as { code?: string }).code ?? '',
    );
  }
}

const uid = () => crypto.randomBytes(6).toString('hex');

interface Kit {
  company: string;
  branch: string;
  appUser: string;
  customer: string;
  warehouse: string;
  product: string;
  staff: string;
  invoice: string;
  varianceRows: number;
  exposureRows: number;
  liveRows: number;
  trialRows: number;
  mvAgingRows: number;
}

async function seedKit(q: pg.Pool, companyCode: string, uomId: string): Promise<Kit> {
  const u = uid();
  const company = (await q.query(`insert into company (code, legal_name) values ($1,$2) returning id`, [companyCode, `شرکت ${companyCode}`])).rows[0].id;
  const branch = (await q.query(`insert into branch (company_id, code, name) values ($1,'HQ',$2) returning id`, [company, `مرکز ${companyCode}`])).rows[0].id;
  const person = (await q.query(`insert into person (company_id, code, first_name, last_name) values ($1,$2,'کاربر',$3) returning id`, [company, `P-${u}`, companyCode])).rows[0].id;
  const customer = (await q.query(`insert into customer (person_id, branch_id, code) values ($1,$2,$3) returning id`, [person, branch, `C-${u}`])).rows[0].id;
  const warehouse = (await q.query(`insert into warehouse (branch_id, code, name) values ($1,$2,'انبار') returning id`, [branch, `W-${u}`])).rows[0].id;
  const category = (await q.query(`insert into product_category (company_id, code, name) values ($1,$2,'دسته') returning id`, [company, `CAT-${u}`])).rows[0].id;
  const product = (await q.query(
    `insert into product (company_id, code, name, category_id, base_uom_id) values ($1,$2,$3,$4,$5) returning id`,
    [company, `PV-${u}`, `کالای ${companyCode}`, category, uomId],
  )).rows[0].id;

  // v_stock_valuation_variance: مغایرتِ ارزشِ موجودی
  await q.query(`insert into stock_balance (warehouse_id, product_id, qty_on_hand, qty_reserved, qty_on_hand_value) values ($1,$2,10,0,999)`, [warehouse, product]);
  await q.query(`insert into product_cost (product_id, warehouse_id, method, avg_cost, qty_on_hand, value_on_hand) values ($1,$2,'moving_avg',10,10,100)`, [product, warehouse]);

  // v_customer_exposure: بدهی + چکِ در جریان
  await q.query(`insert into customer_credit (customer_id, credit_limit, extra_limit, cheque_allowed, max_overdue_days, block_on_overdue) values ($1,1000,0,true,30,false)`, [customer]);
  const series = (await q.query(`insert into document_series (branch_id, doc_kind, fiscal_year, prefix) values ($1,'invoice',1405,'INV') returning id`, [branch])).rows[0].id;
  const invoice = (await q.query(
    `insert into invoice (branch_id, doc_number, fiscal_year, series_id, customer_id, status, subtotal, discount_total, tax_total, grand_total, paid_amount)
     values ($1,$2,1405,$3,$4,'posted',100,0,0,100,0) returning id`,
    [branch, `INV-${u}`, series, customer],
  )).rows[0].id;
  await q.query(
    `insert into cheque (branch_id, customer_id, direction, serial_no, bank_name, amount, due_date, status) values ($1,$2,'received',$3,'بانک',50,CURRENT_DATE,'in_hand')`,
    [branch, customer, `CH-${u}`],
  );

  // v_live_locations: نمونهٔ موقعیتِ نیرویِ میدانی
  const jobPos = (await q.query(`insert into job_position (company_id, code, title) values ($1,$2,'کارشناس') returning id`, [company, `JP-${u}`])).rows[0].id;
  const staff = (await q.query(`insert into staff (person_id, branch_id, job_position_id, is_field, status) values ($1,$2,$3,true,'active') returning id`, [person, branch, jobPos])).rows[0].id;
  await q.query(`insert into location_sample (staff_id, geo, is_mocked, recorded_at) values ($1, ST_SetSRID(ST_MakePoint(51.4,35.7),4326)::geography, false, now())`, [staff]);

  // v_trial_balance: یک سندِ حسابداریِ posted
  const glAcc = (await q.query(`insert into gl_account (company_id, code, level, title, nature, account_type, is_postable, currency) values ($1,$2,1,'صندوق','debit','asset',true,'IRR') returning id`, [company, `GL-${u}`])).rows[0].id;
  const fiscal = (await q.query(`insert into fiscal_period (company_id, fiscal_year, period_no, start_date, end_date, status) values ($1,1405,1,'1405-01-01','1405-12-29','open') returning id`, [company])).rows[0].id;
  const entry = (await q.query(
    `insert into journal_entry (company_id, doc_number, fiscal_period_id, entry_date, description, source_type, total_debit, total_credit, status)
     values ($1,$2,$3,'1405-07-01','آزمون','manual',100,100,'posted') returning id`,
    [company, `JE-${u}`, fiscal],
  )).rows[0].id;
  const glAcc2 = (await q.query(`insert into gl_account (company_id, code, level, title, nature, account_type, is_postable, currency) values ($1,$2,1,'بانک','credit','asset',true,'IRR') returning id`, [company, `GL2-${u}`])).rows[0].id;
  await q.query(`insert into journal_line (entry_id, line_no, account_id, description, debit, credit, dimensions) values ($1,1,$2,'آزمون',100,0,'{}'), ($1,2,$3,'آزمون',0,100,'{}')`, [entry, glAcc, glAcc2]);

  // p_invoice_scope: نشستِ برنامه به user_scope نیاز دارد (الگوی F-3 مستند)
  const appUser = (await q.query(`insert into app_user (person_id, username, access_level) values ($1,$2,'web') returning id`, [person, `vu-${u}`])).rows[0].id;
  await q.query(`insert into user_scope (app_user_id, scope_type, scope_id) values ($1,'branch',$2)`, [appUser, branch]);

  // mv_salesperson_performance: تورِ فروشنده (grain فروشنده)
  await q.query(`insert into tour (branch_id, salesperson_id, tour_date, kind, status) values ($1,$2,$3,'warm','completed')`, [branch, staff, '1405-07-01']);

  return {
    company, branch, appUser, customer, warehouse, product, staff, invoice,
    varianceRows: 1, exposureRows: 1, liveRows: 1, trialRows: 2, mvAgingRows: 1,
  };
}

let A: Kit;
let B: Kit;

beforeAll(async () => {
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

  ownerPool = new pg.Pool({ connectionString: testUrl.toString(), max: 4 });
  const uomId = (await ownerPool.query(`insert into uom (code, title) values ('PCS','عدد') returning id`)).rows[0].id;
  A = await seedKit(ownerPool, `VI_A_${uid()}`, uomId);
  B = await seedKit(ownerPool, `VI_B_${uid()}`, uomId);
  await ownerPool.query(`refresh materialized view mv_ar_aging_src`);
  await ownerPool.query(`refresh materialized view mv_daily_sales_src`);
  await ownerPool.query(`refresh materialized view mv_salesperson_performance_src`);

  await adminPool.query(
    `alter role ${RUNTIME_ROLE} login password '${RUNTIME_PASSWORD.replace(/'/g, "''")}'`,
  );
}, 300_000);

afterAll(async () => {
  await ownerPool?.end();
  if (adminPool) {
    await adminPool.query(
      'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
      [TEST_DB],
    );
    await adminPool.query(`drop database if exists "${TEST_DB}"`).catch(() => undefined);
    await adminPool.query(`alter role ${RUNTIME_ROLE} nologin`).catch(() => undefined);
    await adminPool.end();
  }
});

describe('پیش‌نیاز نقشِ زمانِ اجرا — معادلِ واقعیِ dms_app', () => {
  it('نه superuser است، نه BYPASSRLS، و مالکِ نماها/جداول نیست', async () => {
    const { rows } = await ownerPool.query(`
      select r.rolsuper, r.rolbypassrls,
             (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
               where n.nspname='public' and c.relkind in ('v','m','r') and c.relowner = r.oid) as owned_objects
        from pg_roles r where r.rolname = $1`, [RUNTIME_ROLE]);
    expect(rows[0].rolsuper).toBe(false);
    expect(rows[0].rolbypassrls).toBe(false);
    expect(Number(rows[0].owned_objects)).toBe(0);
  });
});

describe('نماهای چهارگانه — security_invoker و جداسازیِ دو اجاره', () => {
  const views: Array<{ name: string; countCol: string; key: keyof Kit }> = [
    { name: 'v_stock_valuation_variance', countCol: 'product_id', key: 'varianceRows' },
    { name: 'v_customer_exposure', countCol: 'customer_id', key: 'exposureRows' },
    { name: 'v_live_locations', countCol: 'staff_id', key: 'liveRows' },
    { name: 'v_trial_balance', countCol: 'account_code', key: 'trialRows' },
  ];

  for (const v of views) {
    it(`${v.name}: A فقط سطرِ خودش را می‌بیند و هیچ سطری از B نمی‌بیند`, async () => {
      const rowsA = await asRuntime(A, (c) => c.query(`select * from ${v.name}`));
      const rowsB = await asRuntime(B, (c) => c.query(`select * from ${v.name}`));
      expect(rowsA.rowCount).toBe(A[v.key] as number);
      expect(rowsB.rowCount).toBe(B[v.key] as number);
      // هیچ هم‌پوشانی بین ردیف‌های دیده‌شده نیست (کلیدهای یکتا نگه داشته می‌شوند)
      const aKeys = new Set(rowsA.rows.map((r: Record<string, unknown>) => String(r[v.countCol])));
      const bKeys = new Set(rowsB.rows.map((r: Record<string, unknown>) => String(r[v.countCol])));
      for (const k of bKeys) expect(aKeys.has(k)).toBe(false);
    });

    it(`${v.name}: بدونِ زمینه یا زمینهٔ نامعتبر ⇒ fail-closed`, async () => {
      await expectFailClosed(asRuntime('none', (c) => c.query(`select * from ${v.name}`)), `${v.name}/none`);
      await expectFailClosed(asRuntime('invalid', (c) => c.query(`select * from ${v.name}`)), `${v.name}/invalid`);
    });
  }

  it('v_live_locations: مختصاتِ B از هیچ مسیری برای A قابل‌دیدن نیست', async () => {
    const rows = await asRuntime(A, (c) =>
      c.query(`select staff_id, lat, lng from v_live_locations`),
    );
    expect(rows.rows.every((r: Record<string, unknown>) => String(r.staff_id) === A.staff)).toBe(true);
  });

  it('v_document_line_display (0047) همچنان security_invoker دارد', async () => {
    const { rows } = await ownerPool.query(
      `select coalesce((select option_value from pg_options_to_table(c.reloptions) where option_name='security_invoker'),'f') as si
         from pg_class c where c.relname = 'v_document_line_display'`,
    );
    expect(rows[0].si).toBe('true');
  });
});

describe('matviewها — نمایِ سایهٔ اجاره‌محور و پس‌گیریِ گرانتِ مستقیم', () => {
  const mvs = ['mv_ar_aging', 'mv_daily_sales', 'mv_salesperson_performance'];

  for (const mv of mvs) {
    it(`${mv}_src: خواندنِ مستقیم برای dms_app/dms_readonly ممنوع است`, async () => {
      const code = await asRuntime(A, async (c) => {
        try { await c.query(`select * from ${mv}_src`); return ''; }
        catch (err) { return (err as { code?: string }).code ?? ''; }
      });
      expect(code).toBe('42501');
    });

    it(`${mv}: نمایِ هم‌نام فقط سطرهایِ اجارهٔ جاری را می‌دهد`, async () => {
      const rowsA = await asRuntime(A, (c) => c.query(`select * from ${mv}`));
      const rowsB = await asRuntime(B, (c) => c.query(`select * from ${mv}`));
      for (const r of rowsA.rows) expect(String(r.company_id)).toBe(A.company);
      for (const r of rowsB.rows) expect(String(r.company_id)).toBe(B.company);
      expect(rowsA.rowCount).toBeGreaterThanOrEqual(1);
      expect(rowsB.rowCount).toBeGreaterThanOrEqual(1);
    });

    it(`${mv}: بدونِ زمینه ⇒ صفر ردیف (fail-closed)`, async () => {
      const none = await asRuntime('none', (c) => c.query(`select * from ${mv}`));
      expect(none.rowCount).toBe(0);
    });
  }

  it('mv_ar_aging: ردیفِ B (بدهیِ مشتریِ B) در نتیجهٔ A نیست', async () => {
    const rows = await asRuntime(A, (c) => c.query(`select customer_id from mv_ar_aging`));
    expect(rows.rowCount).toBeGreaterThanOrEqual(1);
    expect(rows.rows.every((r: Record<string, unknown>) => String(r.customer_id) !== B.customer)).toBe(true);
  });
});

describe('مسیرِ جایگزین وجود ندارد — هیچ نمایِ دارایِ گرانت، بین‌اجاره نشت نمی‌کند', () => {
  it('برای هر نمایِ در دسترسِ dms_app، دیدِ A و B ناسازگار نیست', async () => {
    const { rows: views } = await ownerPool.query<{ relname: string }>(`
      select c.relname from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('v','m')
         and has_table_privilege($1, c.oid, 'SELECT')
         and c.relname not in ('geography_columns','geometry_columns')
       order by 1`, [RUNTIME_ROLE]);
    expect(views.length).toBeGreaterThanOrEqual(8);
    for (const v of views) {
      const rowsA = await asRuntime(A, (c) => c.query(`select * from ${v.relname}`));
      // هیچ نمایی نباید شناسه‌هایِ متعلقِ به B را به A نشان دهد
      const flat = JSON.stringify(rowsA.rows);
      expect(flat.includes(B.company), `${v.relname} leaked B.company`).toBe(false);
      expect(flat.includes(B.customer), `${v.relname} leaked B.customer`).toBe(false);
    }
  });
});
