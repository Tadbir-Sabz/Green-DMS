import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';
import { IntegrationsQueue, type ClaimedJob } from '../src/modules/integrations/queue/integrations.queue';
import { runAsJobTenant } from '../src/database/job-context';

/**
 * اثباتِ «جداسازیِ واقعیِ اجاره‌ها در پایگاه‌داده» زیرِ نقشِ زمانِ اجرایِ برنامه.
 *
 * تفاوتِ کلیدی با tenant-isolation.api.test.ts: آن فایل با یک نقشِ کاوشگرِ
 * ساختِ‌آزمون کار می‌کرد و نشان می‌داد سیاست‌ها درست‌اند؛ این فایل **همان نقشی** را
 * به‌کار می‌برد که مهاجرت 0041 برایِ زمانِ اجرا تعریف کرده (`dms_app`) و پرسش‌هایِ
 * پذیرشِ P0 را پاسخ می‌دهد:
 *   ۱) آیا `dms_app` ابرکاربر/BYPASSRLS است یا مالکِ جدولِ محافظت‌شده؟ (تصعیدِ امتیاز)
 *   ۲) آیا اجارهٔ A می‌تواند دادهٔ B را بخواند/به‌روزرسانی کند/حذف کند؟
 *   ۳) نبودِ زمینهٔ اجاره ⇒ fail-closed؟
 *   ۴) زمینهٔ نامعتبر (غیر UUID) ⇒ fail-closed؟
 *   ۵) آیا ورودِ پرتال بدونِ دسترسیِ نامحدود به `portal_user` کار می‌کند؟
 *   ۶) آیا تابعِ ممتاز (`fn_portal_find_login`) قابلِ سوءاستفاده است؟
 *   ۷) آیا پوششِ RLS واقعاً گسترش یافته (نه فقط رویِ چند جدول)؟
 *
 * رمزِ نقش **تصادفی و یکبارمصرف** است و هرگز در مخزن نیست: مهاجرت نقش را NOLOGIN
 * می‌سازد و این آزمون با اتصالِ مدیریتی (که برایِ ساختِ دیتابیسِ یکبارمصرف لازم است)
 * آن را LOGIN + رمزِ تصادفی می‌کند و در پایان به NOLOGIN برمی‌گرداند.
 *
 * هر سناریو با یک `pg.Client` «غیراجتماعی» (dedicated) اجرا می‌شود: `set_config(...,
 * false)` نشست‌محور است، پس اگر اتصال از استخر برگردد، GUC به سناریویِ بعدی نشت
 * می‌کند و نتیجهٔ آزمون بی‌معنا می‌شود (درسِ گرفته‌شده از یک شکستِ واقعی).
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_db_privileges_test';
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
let ownerPool: pg.Pool; // اتصالِ مدیریتی به دیتابیسِ آزمون (برایِ fixture)

let companyA = '';
let companyB = '';
let branchA = '';
let branchB = '';
let customerA = '';
let customerB = '';
let portalEmailA = '';
let portalEmailB = '';
let invoiceA = '';
let invoiceB = '';
let attachmentA = '';
let attachmentB = '';
let sessionA = '';

/** زمینهٔ اجاره: 'none' = ست نشده، 'invalid' = رشتهٔ غیر UUID. */
type TenantCtx = string | 'none' | 'invalid';

/** اجرای یک سناریو با اتصالِ «تازه و اختصاصی» به‌عنوانِ نقشِ زمانِ اجرا. */
async function asRuntime<T>(
  ctx: TenantCtx,
  fn: (client: pg.Client) => Promise<T>,
): Promise<T> {
  const client = new pg.Client({ connectionString: appUrl.toString() });
  await client.connect();
  try {
    if (ctx === 'invalid') {
      await client.query(`select set_config('app.company_id', 'not-a-uuid', false)`);
    } else if (ctx !== 'none') {
      await client.query(`select set_config('app.company_id', $1, false)`, [ctx]);
    }
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** خطایِ نقضِ RLS در پستگرس: 42501 (insufficient_privilege). */
async function expectRlsDenied(promise: Promise<unknown>, label: string): Promise<string> {
  try {
    await promise;
  } catch (err) {
    return (err as { code?: string }).code ?? '';
  }
  throw new Error(`expected RLS denial for ${label}, but it succeeded`);
}

let personA = '';
let personB = '';
let phoneA = '';
let phoneB = '';
let appUserA = '';
let appUserB = '';
let roleA = '';
let permissionCode = '';
let authSessionA = '';
const otpUser = 'priv_otp_user';

beforeAll(async () => {
  adminPool = new pg.Pool({ connectionString: adminUrl.toString(), max: 1 });
  await adminPool.query(
    'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
    [TEST_DB],
  );
  await adminPool.query(`drop database if exists "${TEST_DB}"`);
  await adminPool.query(`create database "${TEST_DB}"`);

  // همهٔ مهاجرت‌ها به‌ترتیب — شاملِ 0040 (ممیزیِ استقرار) و 0041 (امتیازات)
  const files = readdirSync(path.join(ROOT, 'migrations'))
    .filter((f) => f.endsWith('.up.sql'))
    .sort()
    .flatMap((f) => ['-f', path.join(ROOT, 'migrations', f)]);
  execFileSync(PSQL, [...psqlBase, '-d', TEST_DB, '-1', '-q', ...files], {
    env: psqlEnv,
    stdio: 'pipe',
  });

  ownerPool = new pg.Pool({ connectionString: testUrl.toString(), max: 2 });

  // --- fixture: دو اجارهٔ کامل در هر دو دستهٔ scoping ---
  companyA = (await ownerPool.query(`insert into company (code, legal_name) values ('PRIV_A','شرکت آ') returning id`)).rows[0].id;
  companyB = (await ownerPool.query(`insert into company (code, legal_name) values ('PRIV_B','شرکت ب') returning id`)).rows[0].id;
  branchA = (await ownerPool.query(`insert into branch (company_id, code, name) values ($1,'HQ','مرکز آ') returning id`, [companyA])).rows[0].id;
  branchB = (await ownerPool.query(`insert into branch (company_id, code, name) values ($1,'HQ','مرکز ب') returning id`, [companyB])).rows[0].id;
  personA = (await ownerPool.query(`insert into person (company_id, code, legal_type, first_name, last_name) values ($1,'PA','natural','کاربر','آ') returning id`, [companyA])).rows[0].id;
  personB = (await ownerPool.query(`insert into person (company_id, code, legal_type, first_name, last_name) values ($1,'PB','natural','کاربر','ب') returning id`, [companyB])).rows[0].id;
  customerA = (await ownerPool.query(`insert into customer (person_id, branch_id, code) values ($1,$2,'CA') returning id`, [personA, branchA])).rows[0].id;
  customerB = (await ownerPool.query(`insert into customer (person_id, branch_id, code) values ($1,$2,'CB') returning id`, [personB, branchB])).rows[0].id;
  invoiceA = (await ownerPool.query(`insert into billing_invoice (company_id, invoice_no, period_start, period_end, amount) values ($1,'PA-1','2026-01-01','2026-01-31',1000) returning id`, [companyA])).rows[0].id;
  invoiceB = (await ownerPool.query(`insert into billing_invoice (company_id, invoice_no, period_start, period_end, amount) values ($1,'PB-1','2026-01-01','2026-01-31',2000) returning id`, [companyB])).rows[0].id;
  attachmentA = (await ownerPool.query(`insert into attachment (company_id, owner_type, owner_id, file_name, content_type, size_bytes, storage_key, sha256) values ($1,'pod',$2,'a.png','image/png',33,'PRIV_A/pod/a.png',${`'${crypto.createHash('sha256').update('a').digest('hex')}'`}) returning id`, [companyA, customerA])).rows[0].id;
  attachmentB = (await ownerPool.query(`insert into attachment (company_id, owner_type, owner_id, file_name, content_type, size_bytes, storage_key, sha256) values ($1,'pod',$2,'b.png','image/png',33,'PRIV_B/pod/b.png',${`'${crypto.createHash('sha256').update('b').digest('hex')}'`}) returning id`, [companyB, customerB])).rows[0].id;

  portalEmailA = `priv_a_${crypto.randomBytes(4).toString('hex')}@example.com`;
  portalEmailB = `priv_b_${crypto.randomBytes(4).toString('hex')}@example.com`;
  const portalUserA = (await ownerPool.query(`insert into portal_user (company_id, customer_id, email, password_hash, display_name) values ($1,$2,$3,'x','کاربر آ') returning id`, [companyA, customerA, portalEmailA])).rows[0].id;
  await ownerPool.query(`insert into portal_user (company_id, customer_id, email, password_hash, display_name) values ($1,$2,$3,'x','کاربر ب')`, [companyB, customerB, portalEmailB]);
  sessionA = (await ownerPool.query(`insert into portal_session (portal_user_id, company_id, refresh_hash, expires_at) values ($1,$2,$3, now() + interval '1 day') returning id`, [portalUserA, companyA, crypto.createHash('sha256').update('r').digest('hex')])).rows[0].id;

  // یک تنظیم برای هر شرکت + یک تنظیمِ «واقعاً سراسری» (company_id تهی)
  await ownerPool.query(`insert into setting (key, scope_type, scope_id, company_id, value) values ('priv.key.a','company',$1,$1,'{"v":"A"}'::jsonb)`, [companyA]);
  await ownerPool.query(`insert into setting (key, scope_type, scope_id, company_id, value) values ('priv.key.b','company',$1,$1,'{"v":"B"}'::jsonb)`, [companyB]);
  await ownerPool.query(`insert into setting (key, scope_type, scope_id, value) values ('priv.global','global',null,'{"v":"GLOBAL"}'::jsonb)`);

  // ممیزیِ استقرار: دو ردیف از دو اجارهٔ متفاوت + یک ردیفِ پیش‌از‌اجاره
  await ownerPool.query(`insert into onboarding_attempt (client_ip, company_code, outcome, company_id) values ('1.1.1.1','PRIV_A','created',$1)`, [companyA]);
  await ownerPool.query(`insert into onboarding_attempt (client_ip, company_code, outcome, company_id) values ('2.2.2.2','PRIV_B','created',$1)`, [companyB]);

  // --- fixture برایِ سیاست‌هایِ «زنجیرهٔ والد» (مهاجرت 0042) ---
  // person_phone هیچ ستونِ اجاره‌ای ندارد: مالکیتش فقط از راهِ person_id → person.company_id
  // قابلِ اثبات است. دو ردیفِ هم‌نوع برایِ دو اجاره ⇒ آزمونِ خواندن/نوشتنِ بین‌اجاره‌ای.
  phoneA = (await ownerPool.query(`insert into person_phone (person_id, kind, phone) values ($1,'mobile','09120000001') returning id`, [personA])).rows[0].id;
  phoneB = (await ownerPool.query(`insert into person_phone (person_id, kind, phone) values ($1,'mobile','09120000002') returning id`, [personB])).rows[0].id;

  // جدولِ پارتیشن‌شدهٔ audit_log: یک ردیفِ هر اجاره + یک ردیفِ سراسری (company_id تهی).
  await ownerPool.query(`insert into audit_log (company_id, action, entity_type, entity_id, at) values ($1,'create','invoice',$2, now())`, [companyA, invoiceA]);
  await ownerPool.query(`insert into audit_log (company_id, action, entity_type, entity_id, at) values ($1,'create','invoice',$2, now())`, [companyB, invoiceB]);
  await ownerPool.query(`insert into audit_log (company_id, action, entity_type, at) values (null,'login','auth', now())`);

  // --- fixture برایِ هویتِ پیش‌اجاره (0043)، OTP (0045) و صفِ یکپارچه‌سازی (0044) ---
  appUserA = (await ownerPool.query(`insert into app_user (person_id, username, password_hash, access_level) values ($1,'priv_user_a','x','web') returning id`, [personA])).rows[0].id;
  appUserB = (await ownerPool.query(`insert into app_user (person_id, username, password_hash, access_level) values ($1,'priv_user_b','x','web') returning id`, [personB])).rows[0].id;
  roleA = (await ownerPool.query(`insert into role (company_id, code, name) values ($1,'priv_role','نقش آ') returning id`, [companyA])).rows[0].id;
  permissionCode = (await ownerPool.query(`select code from permission order by code limit 1`)).rows[0].code;
  await ownerPool.query(`insert into user_role (app_user_id, role_id) values ($1,$2)`, [appUserA, roleA]);
  await ownerPool.query(`insert into role_permission (role_id, permission_code) values ($1,$2)`, [roleA, permissionCode]);
  authSessionA = (await ownerPool.query(`insert into auth_session (app_user_id, refresh_token_hash, expires_at) values ($1,$2, now() + interval '1 day') returning id`, [appUserA, crypto.randomBytes(24).toString('hex')])).rows[0].id;
  await ownerPool.query(`insert into user_scope (app_user_id, scope_type, scope_id) values ($1,'branch',$2)`, [appUserA, branchA]);

  // شغلِ صف برایِ هر دو اجاره — از راهِ «خودِ» enqueue برنامه تا ستون‌ها/قیدها واقعی باشند
  const queue = new IntegrationsQueue(ownerPool as never);
  await queue.enqueue({ type: 'psp.charge', payload: { branch_id: branchA, terminal_id: 'T-A', psp: 'privpsp', amount: '1000' } });
  await queue.enqueue({ type: 'psp.charge', payload: { branch_id: branchB, terminal_id: 'T-B', psp: 'privpsp', amount: '2000' } });

  // --- فعال‌سازیِ نقشِ زمانِ اجرا: LOGIN + رمزِ تصادفیِ یکبارمصرف ---
  await adminPool.query(
    `alter role ${RUNTIME_ROLE} login password '${RUNTIME_PASSWORD.replace(/'/g, "''")}'`,
  );
}, 180_000);

afterAll(async () => {
  await ownerPool?.end();
  if (adminPool) {
    await adminPool.query(
      'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
      [TEST_DB],
    );
    await adminPool.query(`drop database if exists "${TEST_DB}"`);
    // نقش cluster-wide است: به وضعیتِ پیش‌فرضِ مهاجرت (NOLOGIN) برمی‌گردد تا
    // اجرایِ بعدی/موازی دچار تعارض نشود. خودِ نقش حذف نمی‌شود چون مهاجرت ساخته‌اش.
    await adminPool.query(`alter role ${RUNTIME_ROLE} nologin`).catch(() => undefined);
    await adminPool.end();
  }
}, 60_000);

describe('نقشِ زمانِ اجرا (dms_app) — حداقلِ امتیاز و نبودِ تصعید', () => {
  it('ابرکاربر/BYPASSRLS نیست و createdb/createrole هم ندارد', async () => {
    const { rows } = await asRuntime('none', (c) =>
      c.query<{ usename: string; rolsuper: boolean; rolbypassrls: boolean; rolcreatedb: boolean; rolcreaterole: boolean }>(
        `select current_user as usename, r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole
           from pg_roles r where r.rolname = current_user`,
      ),
    );
    expect(rows[0].usename).toBe(RUNTIME_ROLE);
    expect(rows[0].rolsuper).toBe(false);
    expect(rows[0].rolbypassrls).toBe(false);
    expect(rows[0].rolcreatedb).toBe(false);
    expect(rows[0].rolcreaterole).toBe(false);
  });

  it('مالکِ هیچ جدولی در طرحوارهٔ public نیست (مالک بودن ⇒ عبور از RLS)', async () => {
    const { rows } = await asRuntime('none', (c) =>
      c.query<{ owned: number }>(
        `select count(*)::int as owned
           from pg_class cl join pg_namespace n on n.oid = cl.relnamespace
           join pg_roles r on r.oid = cl.relowner
          where n.nspname = 'public' and cl.relkind in ('r','p') and r.rolname = $1`,
        [RUNTIME_ROLE],
      ),
    );
    expect(rows[0].owned).toBe(0);
  });

  it('FORCE ROW LEVEL SECURITY رویِ جدول‌هایِ اجاره‌محور فعال است', async () => {
    const { rows } = await asRuntime('none', (c) =>
      c.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
        `select cl.relname, cl.relrowsecurity, cl.relforcerowsecurity
           from pg_class cl join pg_namespace n on n.oid = cl.relnamespace
          where n.nspname = 'public'
            and cl.relname in ('billing_invoice','customer','portal_user','attachment','setting','company')
          order by cl.relname`,
      ),
    );
    expect(rows.length).toBe(6);
    for (const r of rows) {
      expect(r.relrowsecurity, `${r.relname} rls`).toBe(true);
      expect(r.relforcerowsecurity, `${r.relname} force`).toBe(true);
    }
  });

  it('پوششِ RLS از چند جدول به ده‌ها جدولِ اجاره‌محور گسترش یافته است', async () => {
    const { rows } = await asRuntime('none', (c) =>
      c.query<{ rls_tables: number; policies: number }>(
        `select
           (select count(*)::int from pg_class cl join pg_namespace n on n.oid = cl.relnamespace
             where n.nspname = 'public' and cl.relkind in ('r','p') and cl.relrowsecurity) as rls_tables,
           (select count(*)::int from pg_policies pol join pg_class cl on cl.relname = pol.tablename
             join pg_namespace n on n.oid = cl.relnamespace where n.nspname = 'public') as policies`,
      ),
    );
    // پیش از مهاجرت 0041 فقط ۵ جدول RLS داشتند؛ اکنون باید ده‌ها جدول پوشش داشته باشند
    expect(rows[0].rls_tables).toBeGreaterThanOrEqual(65);
    expect(rows[0].policies).toBeGreaterThanOrEqual(65);
  });
});

describe('جداسازیِ اجاره‌ها — خواندن زیرِ نقشِ واقعی', () => {
  it('اجارهٔ A فقط سطرهایِ خودش را می‌بیند (هر دو دستهٔ company_id و branch_id)', async () => {
    const r = await asRuntime(companyA, async (c) => ({
      branch: (await c.query(`select id from branch`)).rows.map((x) => x.id),
      person: (await c.query(`select id from person`)).rows.map((x) => x.id),
      customer: (await c.query(`select id from customer`)).rows.map((x) => x.id),
      invoice: (await c.query(`select id from billing_invoice`)).rows.map((x) => x.id),
      attachment: (await c.query(`select id from attachment`)).rows.map((x) => x.id),
      portalUser: (await c.query(`select id from portal_user`)).rows.map((x) => x.id),
      session: (await c.query(`select id from portal_session`)).rows.map((x) => x.id),
    }));
    expect(r.branch).toEqual([branchA]);
    expect(r.customer).toEqual([customerA]); // دستهٔ branch_id: از راهِ شعبه محدود شد
    expect(r.invoice).toEqual([invoiceA]);
    expect(r.attachment).toEqual([attachmentA]);
    expect(r.session).toEqual([sessionA]);
    expect(r.portalUser.length).toBe(1);
    expect(r.person.length).toBe(1);
    for (const list of Object.values(r)) {
      expect(list).not.toContain(branchB);
      expect(list).not.toContain(customerB);
      expect(list).not.toContain(invoiceB);
      expect(list).not.toContain(attachmentB);
    }
  });

  it('اجارهٔ B متقابلاً فقط دادهٔ خودش را می‌بیند', async () => {
    const r = await asRuntime(companyB, async (c) => ({
      customer: (await c.query(`select id from customer`)).rows.map((x) => x.id),
      invoice: (await c.query(`select id from billing_invoice`)).rows.map((x) => x.id),
      attachment: (await c.query(`select id from attachment`)).rows.map((x) => x.id),
    }));
    expect(r.customer).toEqual([customerB]);
    expect(r.invoice).toEqual([invoiceB]);
    expect(r.attachment).toEqual([attachmentB]);
  });

  it('تنظیمات: تنظیمِ سراسری و تنظیمِ همان شرکت دیده می‌شود، تنظیمِ شرکتِ دیگر نه', async () => {
    const asA = await asRuntime(companyA, async (c) =>
      (await c.query<{ key: string }>(`select key from setting order by key`)).rows.map((x) => x.key),
    );
    expect(asA).toContain('priv.global'); // company_id تهی = واقعاً سراسری
    expect(asA).toContain('priv.key.a'); // تنظیمِ همان اجاره
    expect(asA).not.toContain('priv.key.b'); // تنظیمِ اجارهٔ دیگر نشت نمی‌کند

    const asB = await asRuntime(companyB, async (c) =>
      (await c.query<{ key: string }>(`select key from setting order by key`)).rows.map((x) => x.key),
    );
    expect(asB).toContain('priv.global');
    expect(asB).toContain('priv.key.b');
    expect(asB).not.toContain('priv.key.a');
  });
});

describe('جداسازیِ اجاره‌ها — نوشتن زیرِ نقشِ واقعی', () => {
  it('به‌روزرسانیِ رکوردِ اجارهٔ دیگر: صفر ردیف (بدونِ خطا، بدونِ اثر)', async () => {
    const res = await asRuntime(companyA, async (c) => {
      const inv = await c.query(`update billing_invoice set amount = 1 where id = $1`, [invoiceB]);
      const att = await c.query(`update attachment set file_name = 'hacked' where id = $1`, [attachmentB]);
      const cus = await c.query(`update customer set code = 'HACK' where id = $1`, [customerB]);
      return { inv: inv.rowCount, att: att.rowCount, cus: cus.rowCount };
    });
    expect(res.inv).toBe(0);
    expect(res.att).toBe(0);
    expect(res.cus).toBe(0);
  });

  it('حذفِ رکوردِ اجارهٔ دیگر: صفر ردیف', async () => {
    const n = await asRuntime(companyA, async (c) =>
      (await c.query(`delete from billing_invoice where id = $1`, [invoiceB])).rowCount,
    );
    expect(n).toBe(0);
    // رکورد هنوز در جای خود است (از دیدِ مالک/مدیر)
    const still = await ownerPool.query(`select 1 from billing_invoice where id = $1`, [invoiceB]);
    expect(still.rowCount).toBe(1);
  });

  it('درجِ رکورد با company_id اجارهٔ دیگر ⇒ رد با 42501', async () => {
    const code = await asRuntime(companyA, (c) =>
      expectRlsDenied(
        c.query(
          `insert into billing_invoice (company_id, invoice_no, period_start, period_end, amount)
           values ($1,'X-1','2026-01-01','2026-01-31',1)`,
          [companyB],
        ),
        'cross-tenant insert',
      ),
    );
    expect(code).toBe('42501');
  });

  it('درجِ رکوردِ متعلق به همان اجاره مجاز است (کمینه‌امتیاز، نه انسدادِ کامل)', async () => {
    const id = await asRuntime(companyA, async (c) =>
      (
        await c.query(
          `insert into billing_invoice (company_id, invoice_no, period_start, period_end, amount)
           values ($1,'A-OK-1','2026-02-01','2026-02-28',10) returning id`,
          [companyA],
        )
      ).rows[0].id,
    );
    expect(id).toBeTruthy();
  });

  it('یک اجاره نمی‌تواند تنظیمِ سراسری بسازد یا ویرایش کند', async () => {
    const insertGlobal = await asRuntime(companyA, (c) =>
      expectRlsDenied(
        c.query(`insert into setting (key, scope_type, scope_id, value) values ('priv.evil','global',null,'{}'::jsonb)`),
        'global setting insert',
      ),
    );
    expect(insertGlobal).toBe('42501');
    const updateGlobal = await asRuntime(companyA, (c) =>
      expectRlsDenied(
        c.query(`update setting set value = '{"hacked":true}'::jsonb where key = 'priv.global'`),
        'global setting update',
      ),
    );
    expect(updateGlobal).toBe('42501');
  });
});

describe('شکستِ بسته (fail-closed) — زمینهٔ اجارهٔ نبوده یا نامعتبر', () => {
  it('بدونِ زمینهٔ اجاره: هیچ سطری از هیچ جدولِ اجاره‌محوری دیده نمی‌شود', async () => {
    const counts = await asRuntime('none', async (c) => ({
      branch: (await c.query(`select count(*)::int n from branch`)).rows[0].n,
      customer: (await c.query(`select count(*)::int n from customer`)).rows[0].n,
      invoice: (await c.query(`select count(*)::int n from billing_invoice`)).rows[0].n,
      attachment: (await c.query(`select count(*)::int n from attachment`)).rows[0].n,
      portalUser: (await c.query(`select count(*)::int n from portal_user`)).rows[0].n,
      company: (await c.query(`select count(*)::int n from company`)).rows[0].n,
    }));
    for (const [k, v] of Object.entries(counts)) expect(v, k).toBe(0);
  });

  it('بدونِ زمینهٔ اجاره: نوشتن هم رد می‌شود (42501)', async () => {
    const code = await asRuntime('none', (c) =>
      expectRlsDenied(
        c.query(
          `insert into billing_invoice (company_id, invoice_no, period_start, period_end, amount)
           values ($1,'NOCTX','2026-01-01','2026-01-31',1)`,
          [companyA],
        ),
        'insert without tenant context',
      ),
    );
    expect(code).toBe('42501');
  });

  it('زمینهٔ نامعتبر (رشتهٔ غیر UUID): هم خواندن و هم نوشتن fail-closed', async () => {
    const n = await asRuntime('invalid', (c) =>
      c.query(`select count(*)::int n from billing_invoice`).then((r) => r.rows[0].n),
    );
    expect(n).toBe(0);
    const code = await asRuntime('invalid', (c) =>
      expectRlsDenied(
        c.query(
          `insert into billing_invoice (company_id, invoice_no, period_start, period_end, amount)
           values ($1,'BADCTX','2026-01-01','2026-01-31',1)`,
          [companyA],
        ),
        'insert with invalid tenant context',
      ),
    );
    expect(code).toBe('42501');
  });

  it('UUID معتبر ولی ناموجود (اجارهٔ حذف‌شده/بیگانه) ⇒ صفر ردیف', async () => {
    const ghost = '99999999-9999-4999-8999-999999999999';
    const n = await asRuntime(ghost, (c) =>
      c.query(`select count(*)::int n from billing_invoice`).then((r) => r.rows[0].n),
    );
    expect(n).toBe(0);
  });

  it('fn_current_company_id برایِ زمینهٔ نبوده/نامعتبر تهی می‌دهد', async () => {
    const none = await asRuntime('none', (c) =>
      c.query<{ v: string | null }>(`select fn_current_company_id() as v`).then((r) => r.rows[0].v),
    );
    const invalid = await asRuntime('invalid', (c) =>
      c.query<{ v: string | null }>(`select fn_current_company_id() as v`).then((r) => r.rows[0].v),
    );
    const valid = await asRuntime(companyA, (c) =>
      c.query<{ v: string | null }>(`select fn_current_company_id() as v`).then((r) => r.rows[0].v),
    );
    expect(none).toBeNull();
    expect(invalid).toBeNull();
    expect(valid).toBe(companyA);
  });
});

describe('احرازِ هویتِ پرتال — بدونِ دسترسیِ نامحدود به portal_user', () => {
  it('انتخابِ مستقیم از portal_user «پیش از اجاره» هیچ ردیفی نمی‌دهد (RLS)', async () => {
    const n = await asRuntime('none', (c) =>
      c
        .query(`select count(*)::int n from portal_user where lower(email) = lower($1)`, [portalEmailA])
        .then((r) => r.rows[0].n),
    );
    expect(n).toBe(0);
  });

  it('ولی fn_portal_find_login همان کاربر را «دقیقاً یک سطر» برمی‌گرداند', async () => {
    const rows = await asRuntime('none', (c) =>
      c.query(
        `select id, company_id, customer_id, email, is_active, failed_attempts
           from fn_portal_find_login($1)`,
        [portalEmailA],
      ).then((r) => r.rows),
    );
    expect(rows.length).toBe(1);
    expect(rows[0].company_id).toBe(companyA);
    expect(rows[0].customer_id).toBe(customerA); // نشست به «مشتری + شرکت» مقید است
    expect(rows[0].is_active).toBe(true);
  });

  it('ایمیلِ ناموجود ⇒ صفر ردیف (بدونِ خطا، بدونِ افشا)', async () => {
    const rows = await asRuntime('none', (c) =>
      c.query(`select * from fn_portal_find_login($1)`, ['nobody@example.com']).then((r) => r.rows),
    );
    expect(rows.length).toBe(0);
  });

  it('تابعِ ممتاز ابزارِ بازیابیِ دلخواهِ دادهٔ بین‌اجاره‌ای نیست: پارامترِ company_id ندارد', async () => {
    const info = await asRuntime('none', (c) =>
      c
        .query<{ nargs: number; result: string; prosecdef: boolean; config: string[] | null; acl: string | null }>(
          `select p.pronargs::int as nargs,
                  pg_get_function_result(p.oid) as result,
                  p.prosecdef,
                  p.proconfig as config,
                  p.proacl::text as acl
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'fn_portal_find_login'`,
        )
        .then((r) => r.rows[0]),
    );
    expect(info.nargs).toBe(1); // فقط ایمیل ⇒ امکانِ انتخابِ اجارهٔ دلخواه نیست
    expect(info.prosecdef).toBe(true);
    expect(info.config?.some((c) => c.startsWith('search_path='))).toBe(true); // پین‌شده
    // EXECUTE به PUBLIC داده نشده (در غیرِ این صورت '=X/' در acl ظاهر می‌شد)
    // مدخلِ PUBLIC در acl «گیرندهٔ تهی» دارد (=X/owner)؛ عبارتِ =X/ به‌تنهایی
    // مدخلِ هر نقشِ دیگر (مثلِ postgres=X/postgres) را هم می‌گیرد و گمراه است.
    expect(info.acl ?? '').not.toMatch(/(^|[{,])=X\//);
    expect(info.acl ?? '').toContain(`${RUNTIME_ROLE}=X`);
    // ستون‌هایِ خروجی محدودند: هیچ ستونِ اضافه‌ای (مثلِ last_login_at) نشت نمی‌کند
    expect(info.result).toContain('password_hash');
    expect(info.result).not.toContain('last_login_at');
    expect(info.result).not.toContain('created_at');
  });

  it('نقشِ فقط‌خواندن نمی‌تواند تابعِ ورودِ پرتال را صدا بزند', async () => {
    const { rows } = await asRuntime('none', (c) =>
      c.query<{ can: boolean }>(
        `select has_function_privilege('dms_readonly', 'fn_portal_find_login(text)', 'execute') as can`,
      ),
    );
    expect(rows[0].can).toBe(false);
  });

  it('fn_provision_company هم SECURITY DEFINER با search_path پین‌شده و بدونِ EXECUTE عمومی است', async () => {
    const { rows } = await asRuntime('none', (c) =>
      c.query<{ prosecdef: boolean; config: string[] | null; acl: string | null }>(
        `select p.prosecdef, p.proconfig as config, p.proacl::text as acl
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'fn_provision_company'`,
      ),
    );
    expect(rows[0].prosecdef).toBe(true);
    expect(rows[0].config?.some((x) => x.startsWith('search_path='))).toBe(true);
    expect(rows[0].acl ?? '').not.toMatch(/(^|[{,])=X\//);
    expect(rows[0].acl ?? '').toContain(`${RUNTIME_ROLE}=X`);
  });

  it('پس از ورود، نشستِ پرتال به همان شرکت+مشتری مقید می‌ماند', async () => {
    const own = await asRuntime(companyA, (c) =>
      c.query(`select company_id, portal_user_id from portal_session`).then((r) => r.rows),
    );
    expect(own.length).toBe(1);
    expect(own[0].company_id).toBe(companyA);
    const other = await asRuntime(companyB, (c) =>
      c.query(`select count(*)::int n from portal_session`).then((r) => r.rows[0].n),
    );
    expect(other).toBe(0); // اجارهٔ ب نشستِ اجارهٔ آ را نمی‌بیند
  });
});

describe('ممیزیِ استقرار — نوشتن مجاز، خواندنِ تاریخچهٔ دیگران ممنوع', () => {
  it('نقشِ برنامه می‌تواند تلاش را ثبت کند (پیش از وجودِ اجاره)', async () => {
    // نکتهٔ ظریفِ RLS: «INSERT ... RETURNING» به سیاستِ SELECT هم نیاز دارد، چون
    // RETURNING سطر را بازمی‌خواند. این جدول عمداً سیاستِ SELECT ندارد، پس RETURNING
    // زیرِ نقشِ برنامه رد می‌شود — و این دقیقاً خواستهٔ ماست. کدِ تولیدی
    // (OnboardingRepository.recordAttempt) هم RETURNING ندارد، پس مسیرِ واقعی سالم است.
    await asRuntime('none', (c) =>
      c.query(
        `insert into onboarding_attempt (client_ip, company_code, admin_email, outcome, reason_code)
         values ('9.9.9.9','PRIV_X','x@example.com','rejected_rate_limit','ip_hour_limit')`,
      ),
    );
    const seen = await ownerPool.query(
      `select count(*)::int n from onboarding_attempt where company_code = 'PRIV_X'`,
    );
    expect(seen.rows[0].n).toBe(1);

    // و RETURNING واقعاً زیرِ نقشِ برنامه رد می‌شود (سنجهٔ صریحِ همان قاعده)
    const code = await asRuntime('none', (c) =>
      expectRlsDenied(
        c.query(
          `insert into onboarding_attempt (client_ip, company_code, outcome)
           values ('9.9.9.8','PRIV_Y','failed') returning id`,
        ),
        'audit insert with RETURNING',
      ),
    );
    expect(code).toBe('42501');
  });

  it('اما نمی‌تواند هیچ رکوردِ ممیزی را بخواند (سیاستِ SELECT تعریف نشده)', async () => {
    const n = await asRuntime('none', (c) =>
      c.query(`select count(*)::int n from onboarding_attempt`).then((r) => r.rows[0].n),
    );
    expect(n).toBe(0);
    const evenOwn = await asRuntime(companyA, (c) =>
      c.query(`select count(*)::int n from onboarding_attempt`).then((r) => r.rows[0].n),
    );
    expect(evenOwn).toBe(0);
    // ولی واقعاً در DB هست (از دیدِ مالک)
    const real = await ownerPool.query(`select count(*)::int n from onboarding_attempt`);
    expect(real.rows[0].n).toBeGreaterThanOrEqual(2);
  });

  it('خواندن با RLS رد می‌شود نه با ACL: امتیازِ SELECT هست ولی صفر ردیف برمی‌گردد', async () => {
    // طراحیِ عمدی: «نخواندنِ» ممیزی از راهِ نبودِ سیاستِ SELECT در RLS تضمین می‌شود
    // (deny-by-default)، نه از راهِ REVOKE. این یکنواخت‌تر است و با بقیهٔ جدول‌ها
    // یک سازوکار دارد. این آزمون هر دو نیمه را ثابت می‌کند.
    const priv = await asRuntime('none', (c) =>
      c
        .query<{ sel: boolean; ins: boolean }>(
          `select has_table_privilege($1, 'onboarding_attempt', 'select') as sel,
                  has_table_privilege($1, 'onboarding_attempt', 'insert') as ins`,
          [RUNTIME_ROLE],
        )
        .then((r) => r.rows[0]),
    );
    expect(priv.ins).toBe(true); // نوشتنِ ممیزی مجاز است
    const rows = await asRuntime(companyA, (c) =>
      c.query(`select * from onboarding_attempt`).then((r) => r.rows),
    );
    expect(rows).toEqual([]); // ولی هیچ ردیفی دیده نمی‌شود
    expect(priv.sel).toBe(true); // امتیاز هست؛ آنچه جلوی نشت را می‌گیرد RLS است
  });
});

describe('سیاست‌هایِ زنجیرهٔ والد (0042) — جداولِ فرزند بدونِ ستونِ اجاره', () => {
  it('اجارهٔ A سطرِ فرزندِ اجارهٔ B را نمی‌بیند (person_phone → person)', async () => {
    const seen = await asRuntime(companyA, async (c) =>
      (await c.query(`select id from person_phone`)).rows.map((x) => x.id),
    );
    expect(seen).toEqual([phoneA]);
    expect(seen).not.toContain(phoneB);
  });

  it('درجِ سطرِ فرزند زیرِ والدِ اجارهٔ دیگر ⇒ رد با 42501', async () => {
    const code = await asRuntime(companyA, (c) =>
      expectRlsDenied(
        c.query(
          `insert into person_phone (person_id, kind, phone) values ($1,'mobile','09129999999')`,
          [personB],
        ),
        'cross-tenant child insert',
      ),
    );
    expect(code).toBe('42501');
  });

  it('به‌روزرسانی و حذفِ سطرِ فرزندِ اجارهٔ دیگر ⇒ صفر ردیف، بدونِ اثر', async () => {
    const r = await asRuntime(companyA, async (c) => ({
      updated: (await c.query(`update person_phone set kind = 'fax' where id = $1`, [phoneB]))
        .rowCount,
      deleted: (await c.query(`delete from person_phone where id = $1`, [phoneB])).rowCount,
    }));
    expect(r.updated).toBe(0);
    expect(r.deleted).toBe(0);
    const stillThere = await ownerPool.query(`select kind from person_phone where id = $1`, [
      phoneB,
    ]);
    expect(stillThere.rows[0].kind).toBe('mobile');
  });

  it('درجِ سطرِ فرزند برایِ والدِ همان اجاره مجاز است (کمینه‌امتیاز، نه انسداد)', async () => {
    const id = await asRuntime(companyA, async (c) =>
      (
        await c.query(
          `insert into person_phone (person_id, kind, phone) values ($1,'landline','02112345678') returning id`,
          [personA],
        )
      ).rows[0].id,
    );
    expect(id).toBeTruthy();
  });

  it('زمینهٔ اجاره نباشد، جدولِ فرزند هم صفر ردیف است (fail-closedِ گذرا از والد)', async () => {
    const n = await asRuntime('none', async (c) =>
      (await c.query(`select count(*)::int n from person_phone`)).rows[0].n,
    );
    expect(n).toBe(0);
  });

  it('زمینهٔ نامعتبر (غیر UUID) هم برایِ جداولِ فرزند fail-closed است', async () => {
    const n = await asRuntime('bogus-not-a-uuid', async (c) =>
      (await c.query(`select count(*)::int n from person_phone`)).rows[0].n,
    );
    expect(n).toBe(0);
  });

  it('مسیرِ مالکیتِ هر سیاستِ فرزند، «کلیدِ خارجیِ واقعیِ» همان جدول است (نه حدس)', async () => {
    const { rows } = await ownerPool.query(`
      with child_policies as (
        -- ruleutils متنِ سیاست را با نامِ «واجدِ شرایطِ» طرحواره رندر می‌کند
        -- (FROM public.delivery pp WHERE ...)، پس الگو باید public. اختیاری را هم بپذیرد.
        select p.tablename as child, p.qual
          from pg_policies p
         where p.schemaname = 'public'
           and p.policyname = 'p_' || p.tablename || '_tenant'
           and p.qual ~* 'from (?:public\\.)?([a-z_]+) pp'
      ),
      declared_fk as (
        select con.conrelid::regclass::text as child,
               con.confrelid::regclass::text as parent
          from pg_constraint con
         where con.contype = 'f'
      )
      select cp.child,
             (regexp_match(cp.qual, 'from (?:public\\.)?([a-z_]+) pp', 'i'))[1] as policy_parent,
             exists (select 1 from declared_fk f
                      where f.child = cp.child
                        and f.parent = (regexp_match(cp.qual, 'from (?:public\\.)?([a-z_]+) pp', 'i'))[1]) as fk_verified
        from child_policies cp
       order by cp.child`);
    if (rows.length === 0) {
      const sample = await ownerPool.query(
        `select tablename, left(qual, 160) as qual from pg_policies
          where schemaname = 'public' and policyname like 'p_%_tenant' limit 3`,
      );
      throw new Error(`no child policy matched the pattern; sample=${JSON.stringify(sample.rows)}`);
    }
    expect(rows.length).toBeGreaterThanOrEqual(67);
    const unverified = rows.filter((r: any) => !r.fk_verified).map((r: any) => r.child);
    expect(unverified).toEqual([]);
  });

  it('پوششِ واقعی از کاتالوگ: همهٔ جداولِ هدف RLS + FORCE + سیاست دارند', async () => {
    const { rows } = await ownerPool.query(`
      select count(*)::int n
        from pg_class c
        join pg_namespace ns on ns.oid = c.relnamespace
       where ns.nspname = 'public' and c.relkind = 'r'
         and c.relrowsecurity and c.relforcerowsecurity
         and exists (select 1 from pg_policy p where p.polrelid = c.oid)`);
    // 0041: ۷۱ جدول · 0042: ۶۸ فرزند + ۳ پارتیشن‌شده ⇒ دستِ‌کم ۱۳۹ والد
    expect(rows[0].n).toBeGreaterThanOrEqual(139);
  });
});

describe('پارتیشن‌ها (0042) — دسترسیِ مستقیم نمی‌تواند جداسازی را دور بزند', () => {
  const partName = () =>
    `audit_log_${new Date().toISOString().slice(0, 7).replace('-', '_')}`;

  const partitionsQuery = `
      select c.relname as part, c.relrowsecurity, c.relforcerowsecurity,
             exists (select 1 from pg_policy p where p.polrelid = c.oid) as has_policy
        from pg_inherits i
        join pg_class c on c.oid = i.inhrelid
        join pg_class par on par.oid = i.inhparent
       where par.relname in ('audit_log','inventory_txn','location_sample')`;

  it('هر پارتیشنِ موجودِ سه جدولِ پرحجم، RLS و سیاستِ خودش را دارد', async () => {
    const { rows } = await ownerPool.query(partitionsQuery);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.relrowsecurity, `partition ${r.part} lacks RLS`).toBe(true);
      expect(r.relforcerowsecurity, `partition ${r.part} lacks FORCE`).toBe(true);
      expect(r.has_policy, `partition ${r.part} lacks a policy`).toBe(true);
    }
  });

  it('پارتیشنِ «تازه» که fn_ensure_partitions می‌سازد هم سخت می‌شود', async () => {
    const before = (await ownerPool.query(partitionsQuery)).rows.length;
    await ownerPool.query(`select fn_ensure_partitions(6)`);
    const { rows } = await ownerPool.query(partitionsQuery);
    expect(rows.length).toBeGreaterThanOrEqual(before);
    for (const r of rows) {
      expect(r.relrowsecurity, `new partition ${r.part} lacks RLS`).toBe(true);
      expect(r.relforcerowsecurity, `new partition ${r.part} lacks FORCE`).toBe(true);
      expect(r.has_policy, `new partition ${r.part} lacks a policy`).toBe(true);
    }
  });

  it('خواندنِ مستقیمِ پارتیشنِ جاری: فقط سطرِ همان اجاره + سطرِ سراسری (NULL)', async () => {
    const r = await asRuntime(companyA, async (c) =>
      (await c.query(`select company_id from ${partName()}`)).rows.map((x) => x.company_id),
    );
    expect(r).toContain(companyA);
    expect(r).toContain(null);
    expect(r).not.toContain(companyB);
  });

  it('اجارهٔ B متقابلاً سطرِ A را در همان پارتیشن نمی‌بیند', async () => {
    const r = await asRuntime(companyB, async (c) =>
      (await c.query(`select company_id from ${partName()}`)).rows.map((x) => x.company_id),
    );
    expect(r).toContain(companyB);
    expect(r).not.toContain(companyA);
  });

  it('بدونِ زمینهٔ اجاره، فقط سطرهایِ سراسریِ ممیزی دیده می‌شوند', async () => {
    const r = await asRuntime('none', async (c) =>
      (await c.query(`select company_id from ${partName()}`)).rows.map((x) => x.company_id),
    );
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((x) => x === null)).toBe(true);
  });

  it('درجِ ممیزی با company_id اجارهٔ دیگر ⇒ 42501؛ درجِ سراسری (NULL) مجاز است', async () => {
    const code = await asRuntime(companyA, (c) =>
      expectRlsDenied(
        c.query(
          `insert into audit_log (company_id, action, entity_type, at)
           values ($1,'create','invoice', now())`,
          [companyB],
        ),
        'cross-tenant audit insert',
      ),
    );
    expect(code).toBe('42501');
    await asRuntime('none', (c) =>
      c.query(`insert into audit_log (company_id, action, entity_type, at)
               values (null,'login','auth', now())`),
    );
  });

  it('سه جدولِ پارتیشن‌شده هم RLS + FORCE + سیاست دارند', async () => {
    const { rows } = await ownerPool.query(`
      select c.relname, c.relrowsecurity, c.relforcerowsecurity,
             exists (select 1 from pg_policy p where p.polrelid = c.oid) as has_policy
        from pg_class c
       where c.relname in ('audit_log','inventory_txn','location_sample')`);
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.relrowsecurity).toBe(true);
      expect(r.relforcerowsecurity).toBe(true);
      expect(r.has_policy).toBe(true);
    }
  });
});

/** پرس‌وجو در یک زمینهٔ اجاره و بازگرداندنِ «سطرها» (نه شیءِ Result). */
async function qRows(scope: string, sql: string, params: unknown[] = []): Promise<any[]> {
  return asRuntime(scope, async (c) => (await c.query(sql, params)).rows);
}

describe('هویتِ پیش‌اجاره (0043) — ورودِ کارمند بدونِ دسترسیِ نامحدود به جدول‌ها', () => {
  it('دسترسیِ مستقیم به پنج جدولِ هویت، پیش از اجاره: صفر ردیف', async () => {
    const r = await asRuntime('none', async (c) => ({
      app_user: (await c.query(`select count(*)::int n from app_user`)).rows[0].n,
      auth_session: (await c.query(`select count(*)::int n from auth_session`)).rows[0].n,
      user_scope: (await c.query(`select count(*)::int n from user_scope`)).rows[0].n,
      user_role: (await c.query(`select count(*)::int n from user_role`)).rows[0].n,
      role_permission: (await c.query(`select count(*)::int n from role_permission`)).rows[0].n,
    }));
    expect(Object.values(r)).toEqual([0, 0, 0, 0, 0]);
  });

  it('با زمینهٔ اجاره، همان جداول فقط دادهٔ همان اجاره را می‌دهند', async () => {
    const r = await asRuntime(companyA, async (c) => ({
      users: (await c.query(`select id from app_user`)).rows.map((x) => x.id),
      sessions: (await c.query(`select id from auth_session`)).rows.map((x) => x.id),
      roles: (await c.query(`select role_id from user_role`)).rows.map((x) => x.role_id),
      perms: (await c.query(`select permission_code from role_permission`)).rows.map((x) => x.permission_code),
      scopes: (await c.query(`select scope_id from user_scope`)).rows.map((x) => x.scope_id),
    }));
    expect(r.users).toEqual([appUserA]);
    expect(r.sessions).toEqual([authSessionA]);
    expect(r.roles).toEqual([roleA]);
    expect(r.perms).toEqual([permissionCode]);
    expect(r.scopes).toEqual([branchA]);
  });

  it('اجارهٔ B کاربر/نشستِ A را نمی‌بیند', async () => {
    const users = await qRows(companyB, `select id from app_user`);
    const sessions = await qRows(companyB, `select id from auth_session`);
    expect(users.map((x) => x.id)).toEqual([appUserB]);
    expect(sessions.map((x) => x.id)).not.toContain(authSessionA);
  });

  it('fn_auth_find_user پیش از اجاره «دقیقاً یک سطر» با اجارهٔ درست برمی‌گرداند', async () => {
    const rows = await qRows('none', `select * from fn_auth_find_user($1, null)`, ['priv_user_a']);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(appUserA);
    expect(rows[0].company_id).toBe(companyA);
    expect(rows[0].username).toBe('priv_user_a');
    const cols = Object.keys(rows[0]).sort();
    expect(cols).toEqual(
      [
        'access_level', 'company_id', 'created_at', 'failed_attempts', 'id', 'is_active',
        'is_locked', 'last_login_at', 'locked_until', 'password_hash', 'person_active',
        'staff_id', 'username',
      ].sort(),
    );
    expect(cols).not.toContain('mfa_secret_enc');
    expect(cols).not.toContain('refresh_token_hash');
  });

  it('تابع ابزارِ بازیابیِ دلخواه نیست: بدونِ پارامتر یا با الگویِ % هیچ ردیفی نمی‌دهد', async () => {
    expect(await qRows('none', `select * from fn_auth_find_user(null, null)`)).toHaveLength(0);
    expect(await qRows('none', `select * from fn_auth_find_user($1, null)`, ['%'])).toHaveLength(0);
    const byId = await qRows('none', `select * from fn_auth_find_user(null, $1)`, [appUserB]);
    // یافتنِ کاربر با «شناسهٔ خودش» برایِ اعتبارسنجیِ نشست لازم است، ولی فقط همان یک کاربر
    expect(byId).toHaveLength(1);
    expect(byId[0].id).toBe(appUserB);
  });

  it('توابعِ هویت: SECURITY DEFINER، search_path پین‌شده، بدونِ پارامترِ company و بدونِ EXECUTE عمومی', async () => {
    const rows = await qRows(
      'none',
      `select p.proname, p.prosecdef, p.proconfig::text as cfg,
              pg_get_function_identity_arguments(p.oid) as args, p.proacl::text as acl
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname like 'fn\\_auth\\_%'`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(12);
    for (const f of rows) {
      expect(f.prosecdef, `${f.proname} must be SECURITY DEFINER`).toBe(true);
      expect(f.cfg, `${f.proname} must pin search_path`).toContain('search_path=public, pg_temp');
      expect(String(f.args).toLowerCase(), `${f.proname} must not take a company`).not.toContain('company');
      expect(f.acl ?? '', `${f.proname} must not be PUBLIC-executable`).not.toMatch(/(^|[{,])=X\//);
      expect(String(f.acl), `${f.proname} must not grant EXECUTE to dms_readonly`).not.toContain('dms_readonly=X');
    }
  });

  it('ویوهایِ شکلِ خروجی مستقیماً خواندنی نیستند (تنها مسیر، تابع است)', async () => {
    const code = await asRuntime('none', (c) =>
      expectRlsDenied(c.query(`select * from v_auth_user limit 1`), 'direct view read'),
    );
    expect(code).toBe('42501');
  });

  it('نقش‌ها و مجوزها پیش از اجاره از راهِ تابع خوانده می‌شوند (ساختِ توکن)', async () => {
    const rows = await qRows(
      'none',
      `select role_id, role_code, permission_code from fn_auth_roles_permissions($1)`,
      [appUserA],
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].role_id).toBe(roleA);
    expect(rows.map((x) => x.permission_code)).toContain(permissionCode);
    const empty = await qRows(
      'none',
      `select * from fn_auth_roles_permissions($1)`,
      ['00000000-0000-4000-8000-000000000000'],
    );
    expect(empty).toHaveLength(0);
  });

  it('چرخهٔ نشست: ساخت پیش از اجاره، سپس مالکیتِ نشست به همان اجاره مقید می‌ماند', async () => {
    const hash = crypto.randomBytes(24).toString('hex');
    const created = await qRows(
      'none',
      `select fn_auth_create_session($1,$2,$3,$4,$5,$6) as id`,
      [appUserA, hash, 'dev-1', '10.0.0.1', 'vitest', new Date(Date.now() + 3600_000).toISOString()],
    );
    const sid = created[0].id as string;
    expect(sid).toBeTruthy();

    const byHash = await qRows('none', `select * from fn_auth_find_session(null, $1)`, [hash]);
    expect(byHash).toHaveLength(1);
    expect(byHash[0].company_id).toBe(companyA);
    expect(byHash[0].app_user_id).toBe(appUserA);
    expect(Object.keys(byHash[0])).not.toContain('refresh_token_hash');

    expect(await qRows(companyA, `select id from auth_session where id = $1`, [sid])).toHaveLength(1);
    // انتقالِ اجاره: نشستِ A برایِ B نامرئی است
    expect(await qRows(companyB, `select id from auth_session where id = $1`, [sid])).toHaveLength(0);
  });

  it('نوشتنِ چرخهٔ ورود از راهِ تابع، فقط همان کاربر را تغییر می‌دهد', async () => {
    await qRows('none', `select fn_auth_login_success($1)`, [appUserB]);
    const after = await ownerPool.query(
      `select id, last_login_at from app_user where id = any($1::uuid[])`,
      [[appUserA, appUserB]],
    );
    const a = after.rows.find((x) => x.id === appUserA);
    const b = after.rows.find((x) => x.id === appUserB);
    expect(b?.last_login_at).toBeTruthy();
    expect(a?.last_login_at).toBeFalsy(); // ورودِ B هرگز رویِ A اثر نمی‌گذارد
  });
});

describe('auth_otp (0045) — پنجرهٔ پیش‌اجارهٔ OTP بدونِ خواندنِ مستقیمِ جدول', () => {
  it('خواندنِ مستقیمِ auth_otp صفر ردیف است و نوشتنِ مستقیم 42501 (حتی با زمینهٔ اجاره)', async () => {
    for (const scope of ['none', companyA]) {
      // سیاستِ «ردِ کامل»: SELECT هرگز خطا نمی‌دهد، فقط «صفر ردیف» می‌شود (رفتارِ واقعیِ RLS)
      expect(await qRows(scope, `select id from auth_otp`)).toHaveLength(0);
      const code = await asRuntime(scope, (c) =>
        expectRlsDenied(
          c.query(`insert into auth_otp (username, purpose, code_hash, expires_at)
                   values ('x','login','h', now())`),
          'direct auth_otp insert',
        ),
      );
      expect(code).toBe('42501');
    }
  });

  it('چرخهٔ کاملِ OTP از راهِ توابع: صدور، یافتن، تلاش، نرخ، مصرفِ اتمیک', async () => {
    await qRows('none', `select fn_otp_issue($1,$2,$3,$4,$5)`, [
      otpUser, '09120000000', 'login', 'hash-1', 120,
    ]);
    const pending = await qRows('none', `select * from fn_otp_find_pending($1)`, [otpUser]);
    expect(pending).toHaveLength(1);
    expect(pending[0].code_hash).toBe('hash-1');
    const id = pending[0].id as string;

    const attempts = await qRows('none', `select fn_otp_attempt($1) as n`, [id]);
    expect(Number(attempts[0].n)).toBe(1);

    const rate = await qRows(
      'none',
      `select last_sent_at, count_since from fn_otp_rate($1,'login', now() - interval '1 hour')`,
      [otpUser],
    );
    expect(Number(rate[0].count_since)).toBeGreaterThanOrEqual(1);
    expect(rate[0].last_sent_at).toBeTruthy();

    const first = await qRows('none', `select fn_otp_consume($1) as ok`, [id]);
    expect(first[0].ok).toBe(true);
    const second = await qRows('none', `select fn_otp_consume($1) as ok`, [id]);
    expect(second[0].ok).toBe(false); // رقابت/تکرار ⇒ فقط اولین برنده است

    // حتی پس از صدور، جدول به‌صورتِ مستقیم خواندنی نیست
    expect(await qRows('none', `select id from auth_otp`)).toHaveLength(0);
  });

  it('username ناموجود ⇒ صفر ردیف و بدونِ خطا (طراحیِ «بی‌اثر و بی‌صدا» حفظ شد)', async () => {
    expect(
      await qRows('none', `select * from fn_otp_find_pending($1)`, ['no_such_user_anywhere']),
    ).toHaveLength(0);
  });

  it('توابعِ OTP هم SECURITY DEFINER با search_path پین‌شده و بدونِ EXECUTE عمومی‌اند', async () => {
    const rows = await qRows(
      'none',
      `select p.proname, p.prosecdef, p.proconfig::text as cfg, p.proacl::text as acl
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname like 'fn\\_otp\\_%'`,
    );
    expect(rows).toHaveLength(5);
    for (const f of rows) {
      expect(f.prosecdef).toBe(true);
      expect(f.cfg).toContain('search_path=public, pg_temp');
      expect(f.acl ?? '').not.toMatch(/(^|[{,])=X\//);
    }
  });
});

describe('کارگرِ صفِ یکپارچه‌سازی (0044) — زمینهٔ اجاره از رکوردِ پایدار', () => {
  let claimed: ClaimedJob[] = [];

  it('نقشِ برنامه شغل‌هایِ سررسیده را برمی‌دارد و اجارهٔ هرکدام مشتق می‌شود', async () => {
    claimed = await asRuntime('none', async (c) => {
      const { rows } = await c.query<ClaimedJob>(
        `select kind, job_id, company_id, branch_id, attempt_count, payload
           from fn_job_claim_integration($1)`,
        [10],
      );
      return rows;
    });
    expect(claimed.length).toBeGreaterThanOrEqual(2);
    expect(claimed.map((j) => j.company_id).sort()).toEqual([companyA, companyB].sort());
    for (const j of claimed) {
      expect(j.company_id).toBeTruthy();
      expect(j.branch_id).toBeTruthy();
      // هویتِ اجاره از رکوردِ پایدار آمده، نه از payloadِ قابلِ دستکاری
      expect(JSON.stringify(j.payload)).not.toContain(String(j.company_id));
    }
  });

  it('داخلِ زمینهٔ اجارهٔ A: شغلِ A به‌روزرسانی می‌شود و شغلِ B صفر ردیف می‌خورد', async () => {
    const jobA = claimed.find((j) => j.company_id === companyA) as ClaimedJob;
    const jobB = claimed.find((j) => j.company_id === companyB) as ClaimedJob;
    const jobPool = new pg.Pool({ connectionString: appUrl.toString(), max: 2 });
    try {
      const r = await runAsJobTenant(jobPool as never, companyA, async () => {
        const own = await jobPool.query(
          `update psp_transaction set status = 'failed' where id = $1`,
          [jobA.job_id],
        );
        const foreign = await jobPool.query(
          `update psp_transaction set status = 'failed' where id = $1`,
          [jobB.job_id],
        );
        return { own: own.rowCount ?? 0, foreign: foreign.rowCount ?? 0 };
      });
      expect(r.own).toBe(1);
      expect(r.foreign).toBe(0);
    } finally {
      await jobPool.end();
    }
    const still = await ownerPool.query(`select status from psp_transaction where id = $1`, [
      jobB.job_id,
    ]);
    expect(still.rows[0].status).toBe('sending'); // شغلِ B دست‌نخورده ماند
  });

  it('بدونِ زمینهٔ اجاره، نوشتنِ وضعیتِ شغل ممکن نیست (fail-closed، موفقِ بی‌صدا نداریم)', async () => {
    const jobA = claimed.find((j) => j.company_id === companyA) as ClaimedJob;
    const n = await asRuntime('none', async (c) =>
      (await c.query(`update psp_transaction set status = 'success' where id = $1`, [jobA.job_id]))
        .rowCount ?? 0,
    );
    expect(n).toBe(0);
  });

  it('پس از پایانِ job، connectionِ بازگشتی به استخر زمینهٔ اجاره را نشت نمی‌دهد', async () => {
    const jobPool = new pg.Pool({ connectionString: appUrl.toString(), max: 1 });
    try {
      await runAsJobTenant(jobPool as never, companyA, async () => {
        const inside = await jobPool.query(`select count(*)::int n from app_user`);
        expect(inside.rows[0].n).toBe(1);
      });
      const leaked = await jobPool.connect(); // همان تک‌connectionِ استخر
      try {
        expect((await leaked.query(`select count(*)::int n from app_user`)).rows[0].n).toBe(0);
        expect(
          (await leaked.query(`select current_setting('app.company_id', true) as v`)).rows[0].v ?? '',
        ).toBe('');
      } finally {
        leaked.release();
      }
    } finally {
      await jobPool.end();
    }
  });

  it('fn_job_mark_dead با kindِ ناشناخته خطایِ صریح می‌دهد (نامِ جدول از بیرون نمی‌آید)', async () => {
    const code = await asRuntime('none', async (c) => {
      try {
        await c.query(`select fn_job_mark_dead($1, $2, $3)`, [
          'drop table app_user; --',
          claimed[0].job_id,
          'x',
        ]);
        return 'no-error';
      } catch (err) {
        return (err as { code?: string }).code ?? '';
      }
    });
    expect(code).toBe('22023');
  });
});
