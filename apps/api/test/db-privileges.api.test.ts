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
  const personA = (await ownerPool.query(`insert into person (company_id, code, legal_type, first_name, last_name) values ($1,'PA','natural','کاربر','آ') returning id`, [companyA])).rows[0].id;
  const personB = (await ownerPool.query(`insert into person (company_id, code, legal_type, first_name, last_name) values ($1,'PB','natural','کاربر','ب') returning id`, [companyB])).rows[0].id;
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
    expect(info.acl ?? '').not.toMatch(/=X\//);
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
    expect(rows[0].acl ?? '').not.toMatch(/=X\//);
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
    const id = await asRuntime('none', async (c) =>
      (
        await c.query(
          `insert into onboarding_attempt (client_ip, company_code, admin_email, outcome, reason_code)
           values ('9.9.9.9','PRIV_X','x@example.com','rejected_rate_limit','ip_hour_limit') returning id`,
        )
      ).rows[0].id,
    );
    expect(id).toBeTruthy();
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
