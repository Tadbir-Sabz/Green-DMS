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
 * آزمون‌های پویای امنیتِ RLS برای Product Master — TASK-22R (رفع HIGH-01).
 *
 * هدف: اثباتِ «رفتارِ واقعیِ PostgreSQL» زیرِ نقشِ زمانِ اجرای برنامه (`dms_app`)
 * و مکانیزمِ زمینهٔ اجارهٔ برنامه (`set_config('app.company_id', ...)` روی اتصالِ
 * اختصاصی — همان الگویِ tenant-context.ts/TenantAwarePool). نه ابرکاربر، نه متنِ
 * مهاجرت: هر ادعا با یک سناریویِ اجراییِ بین‌اجاره‌ای راستی‌آزمایی می‌شود.
 *
 * ماتریسِ الزامی (TASK-22R §۴) برای هر جدولِ تأییدشده:
 *   - A سطرِ خودش را می‌بیند، B سطرِ خودش را می‌بیند
 *   - A سطرِ B و B سطرِ A را نمی‌بیند (خواندن ⇒ نتیجهٔ خالی، نه خطا)
 *   - A نمی‌تواند سطرِ «وابسته به B» درج کند (WITH CHECK ⇒ 42501)
 *   - A نمی‌تواند سطرِ B را به‌روزرسانی/حذف کند (صفر ردیف، بدون اثر)
 *   - سطرِ فرزند نمی‌تواند به والدِ اجارهٔ دیگر بچسبد (42501)
 *   - زمینهٔ نبوده/نامعتبر ⇒ fail-closed؛ جابه‌جاییِ زمینه در همان نشست نشت نمی‌دهد
 *
 * نکتهٔ نقش: رمزِ `dms_app` تصادفی و یکبارمصرف است و در پایان به NOLOGIN
 * برمی‌گردد (الگوی db-privileges.api.test.ts). هر سناریو با یک اتصالِ اختصاصی
 * اجرا می‌شود چون set_config(..., false) نشست‌محور است.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_pm_rls_test';
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

/** زمینهٔ اجاره: 'none' = ست نشده، 'invalid' = رشتهٔ غیر UUID. */
type TenantCtx = string | 'none' | 'invalid';

async function asRuntime<T>(ctx: TenantCtx, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: appUrl.toString() });
  await client.connect();
  try {
    if (ctx === 'invalid') {
      await client.query(`select set_config('app.company_id', 'not-a-uuid', false)`);
      await client.query(`select set_config('app.user_id', 'not-a-uuid', false)`);
    } else if (ctx !== 'none') {
      // دقیقاً مکانیزمِ tenant-context.ts: هر دو GUC روی اتصالِ اختصاصیِ نشست
      await client.query(`select set_config('app.company_id', $1, false), set_config('app.user_id', $2, false)`, [
        ctx,
        crypto.randomUUID(),
      ]);
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

interface Kit {
  company: string;
  branch: string;
  person: string;
  customer: string;
  category: string;
  family: string;
  product: string; // p1 — دارای خانواده/variant (همچنین «بسته» برای D5)
  product2: string; // p2 — غیربسته (برای خطوط سند)
  product2Name: string;
  packaging: string;
  attrDef: string;
  enumValue: string;
  attrValue: string;
  alias: string;
  relation: string;
  bundle: string;
  barcode: string;
  codeSeq: string;
  importRow: string;
  priceList: string;
  priceListItem: string;
  customerPrice: string;
  series: string;
  salesOrder: string;
  salesLine: string;
  invoice: string;
  invoiceLine: string;
  creditNote: string;
  creditLine: string;
  returnReq: string;
  returnLine: string;
}

let A: Kit;
let B: Kit;
let companyC = ''; // شرکتِ سومِ بدونِ داده — برایِ سناریویِ درجِ بدونِ تداخلِ کلیدِ اصلی
let uomId = '';

const uid = () => crypto.randomBytes(6).toString('hex');

async function seedKit(q: pg.Pool | pg.Client, companyCode: string): Promise<Kit> {
  const u = uid();
  const company = (await q.query(`insert into company (code, legal_name) values ($1,$2) returning id`, [companyCode, `شرکت ${companyCode}`])).rows[0].id;
  const branch = (await q.query(`insert into branch (company_id, code, name) values ($1,'HQ',$2) returning id`, [company, `مرکز ${companyCode}`])).rows[0].id;
  const person = (await q.query(`insert into person (company_id, code, first_name, last_name) values ($1,$2,'کاربر',$3) returning id`, [company, `P-${u}`, companyCode])).rows[0].id;
  const customer = (await q.query(`insert into customer (person_id, branch_id, code) values ($1,$2,$3) returning id`, [person, branch, `C-${u}`])).rows[0].id;
  const category = (await q.query(`insert into product_category (company_id, code, name) values ($1,$2,'دسته') returning id`, [company, `CAT-${u}`])).rows[0].id;
  const family = (await q.query(`insert into product_family (company_id, code, name) values ($1,$2,'خانواده') returning id`, [company, `FAM-${u}`])).rows[0].id;
  const product = (await q.query(
    `insert into product (company_id, code, name, category_id, base_uom_id, family_id, variant_signature)
     values ($1,$2,$3,$4,$5,$6,'v1') returning id`,
    [company, `P1-${u}`, `کالای یک ${companyCode}`, category, uomId, family],
  )).rows[0].id;
  const product2 = (await q.query(
    `insert into product (company_id, code, name, category_id, base_uom_id) values ($1,$2,$3,$4,$5) returning id`,
    [company, `P2-${u}`, `کالای دو ${companyCode}`, category, uomId],
  )).rows[0].id;
  const packaging = (await q.query(
    `insert into product_packaging (product_id, uom_id, factor_to_base, is_sales_default) values ($1,$2,6,true) returning id`,
    [product2, uomId],
  )).rows[0].id;
  const attrDef = (await q.query(
    `insert into product_attribute_def (company_id, code, title, kind, is_variant_axis) values ($1,$2,'رنگ','enum',true) returning id`,
    [company, `COL-${u}`],
  )).rows[0].id;
  const enumValue = (await q.query(
    `insert into product_attribute_enum_value (def_id, value, value_norm) values ($1,'قرمز','قرمز') returning id`,
    [attrDef],
  )).rows[0].id;
  const attrValue = (await q.query(
    `insert into product_attribute_value (product_id, def_id, value_enum) values ($1,$2,$3) returning id`,
    [product, attrDef, enumValue],
  )).rows[0].id;
  const alias = (await q.query(
    `insert into product_alias (company_id, product_id, alias, alias_norm) values ($1,$2,$3,$3) returning id`,
    [company, product, `نام-${u}`],
  )).rows[0].id;
  const relation = (await q.query(
    `insert into product_relation (company_id, product_id, related_id, kind) values ($1,$2,$3,'complement') returning id`,
    [company, product, product2],
  )).rows[0].id;
  // بسته: p1 از p2 ساخته می‌شود ⇒ D5 خطوطِ سند روی p1 ممنوع است (سناریوی D5 جداگانه)
  const bundle = (await q.query(
    `insert into product_bundle (bundle_product_id, component_product_id, qty) values ($1,$2,1) returning bundle_product_id`,
    [product, product2],
  )).rows[0].bundle_product_id;
  const barcode = (await q.query(
    `insert into product_barcode (company_id, product_id, packaging_id, barcode, kind, is_primary) values ($1,$2,$3,$4,'gs1_ean13',true) returning id`,
    [company, product2, packaging, `6261${u.slice(0, 9)}`],
  )).rows[0].id;
  const codeSeq = (await q.query(
    `insert into product_code_seq (company_id, next_seq) values ($1, 1) returning company_id`,
    [company],
  )).rows[0].company_id;
  const importRow = (await q.query(
    `insert into product_import (company_id, idempotency_key, mode) values ($1,'IK-1','create') returning id`,
    [company],
  )).rows[0].id;
  const priceList = (await q.query(
    `insert into price_list (company_id, code, title) values ($1,$2,'لیست') returning id`,
    [company, `PL-${u}`],
  )).rows[0].id;
  const priceListItem = (await q.query(
    `insert into price_list_item (price_list_id, product_id, price, valid, packaging_id)
     values ($1,$2,100,'[1405-01-01,)'::daterange,$3) returning id`,
    [priceList, product2, packaging],
  )).rows[0].id;
  const customerPrice = (await q.query(
    `insert into customer_price (customer_id, product_id, price, valid, packaging_id)
     values ($1,$2,90,'[1405-01-01,)'::daterange,$3) returning id`,
    [customer, product2, packaging],
  )).rows[0].id;
  const series = (await q.query(
    `insert into document_series (branch_id, doc_kind, fiscal_year, prefix) values ($1,'invoice',1405,'INV') returning id`,
    [branch],
  )).rows[0].id;
  const salesOrder = (await q.query(
    `insert into sales_order (branch_id, doc_number, fiscal_year, customer_id) values ($1,$2,1405,$3) returning id`,
    [branch, `SO-${u}`, customer],
  )).rows[0].id;
  const salesLine = (await q.query(
    `insert into sales_order_line (sales_order_id, line_no, product_id, qty, qty_base, unit_price, line_total, packaging_id)
     values ($1,1,$2,2,2,10,20,$3) returning id`,
    [salesOrder, product2, packaging],
  )).rows[0].id;
  const invoice = (await q.query(
    `insert into invoice (branch_id, doc_number, fiscal_year, series_id, customer_id) values ($1,$2,1405,$3,$4) returning id`,
    [branch, `INV-${u}`, series, customer],
  )).rows[0].id;
  const invoiceLine = (await q.query(
    `insert into invoice_line (invoice_id, line_no, product_id, qty, unit_price, line_total, packaging_id)
     values ($1,1,$2,1,5,5,$3) returning id`,
    [invoice, product2, packaging],
  )).rows[0].id;
  const creditNote = (await q.query(
    `insert into credit_note (branch_id, doc_number, fiscal_year, invoice_id, customer_id, reason_code, amount)
     values ($1,$2,1405,$3,$4,'sales_return',5) returning id`,
    [branch, `CN-${u}`, invoice, customer],
  )).rows[0].id;
  const creditLine = (await q.query(
    `insert into credit_note_line (credit_note_id, product_id, qty, unit_price, line_total, packaging_id)
     values ($1,$2,1,5,5,$3) returning id`,
    [creditNote, product2, packaging],
  )).rows[0].id;
  const returnReq = (await q.query(
    `insert into return_request (branch_id, doc_number, customer_id, reason_code) values ($1,$2,$3,'damaged') returning id`,
    [branch, `RR-${u}`, customer],
  )).rows[0].id;
  const returnLine = (await q.query(
    `insert into return_request_line (return_request_id, product_id, qty, unit_price, packaging_id)
     values ($1,$2,1,5,$3) returning id`,
    [returnReq, product2, packaging],
  )).rows[0].id;

  return {
    company, branch, person, customer, category, family,
    product, product2, product2Name: `کالای دو ${companyCode}`, packaging,
    attrDef, enumValue, attrValue, alias, relation, bundle, barcode,
    codeSeq, importRow, priceList, priceListItem, customerPrice, series,
    salesOrder, salesLine, invoice, invoiceLine, creditNote, creditLine,
    returnReq, returnLine,
  };
}

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

  uomId = (await ownerPool.query(`insert into uom (code, title) values ('PCS','عدد') returning id`)).rows[0].id;

  A = await seedKit(ownerPool, `RLS_A_${uid()}`);
  B = await seedKit(ownerPool, `RLS_B_${uid()}`);
  companyC = (await ownerPool.query(`insert into company (code, legal_name) values ($1,'شرکت ج') returning id`, [`RLS_C_${uid()}`])).rows[0].id;

  await adminPool.query(
    `alter role ${RUNTIME_ROLE} login password '${RUNTIME_PASSWORD.replace(/'/g, "''")}'`,
  );
}, 240_000);

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
}, 60_000);

// ---------------------------------------------------------------------------
// ماتریسِ ده‌گانهٔ جدول‌های 0046 — خواندن/نوشتنِ بین‌اجاره‌ای زیرِ dms_app
// ---------------------------------------------------------------------------

interface TableCase {
  table: string;
  /** مالکیت: مستقیم (company_id)، زنجیرهٔ والد، یا هر دو */
  kind: 'direct' | 'chain' | 'hybrid';
  idA: () => string;
  idB: () => string;
  /** شرطِ شناساییِ سطر (برای جدول‌های بدون ستون id) */
  where: (id: string) => [string, unknown[]];
  /** ستونِ بی‌خطر برایِ به‌روزرسانیِ آزمایشی (set x = x) */
  noopCol: string;
  /** درجِ سطرِ «مالکِ B» از زمینهٔ A ⇒ باید 42501 */
  insertOwnedByB: () => [string, unknown[]];
  /** درجِ سطرِ «والدِ B» از زمینهٔ A (چسبیدن به والدِ بیگانه) ⇒ باید 42501 */
  insertForeignParent?: () => [string, unknown[]];
  /** به‌روزرسانیِ سطرِ A برایِ چسباندن به والدِ B ⇒ باید 42501 */
  updateForeignParent?: () => [string, unknown[]];
}

const cases: TableCase[] = [
  {
    table: 'product_family', kind: 'direct',
    idA: () => A.family, idB: () => B.family,
    where: (id) => [`id = $1`, [id]],
    noopCol: 'name',
    insertOwnedByB: () => [`insert into product_family (company_id, code, name) values ($1,'X','x')`, [B.company]],
  },
  {
    table: 'product_alias', kind: 'hybrid',
    idA: () => A.alias, idB: () => B.alias,
    where: (id) => [`id = $1`, [id]],
    noopCol: 'alias_norm',
    insertOwnedByB: () => [`insert into product_alias (company_id, product_id, alias, alias_norm) values ($1,$2,'x','x')`, [B.company, A.product]],
    insertForeignParent: () => [`insert into product_alias (company_id, product_id, alias, alias_norm) values ($1,$2,'x2','x2')`, [A.company, B.product]],
  },
  {
    table: 'product_attribute_def', kind: 'direct',
    idA: () => A.attrDef, idB: () => B.attrDef,
    where: (id) => [`id = $1`, [id]],
    noopCol: 'title',
    insertOwnedByB: () => [`insert into product_attribute_def (company_id, code, title, kind) values ($1,'X','x','text')`, [B.company]],
  },
  {
    table: 'product_attribute_enum_value', kind: 'chain',
    idA: () => A.enumValue, idB: () => B.enumValue,
    where: (id) => [`id = $1`, [id]],
    noopCol: 'value',
    insertOwnedByB: () => [`insert into product_attribute_enum_value (def_id, value, value_norm) values ($1,'x','x')`, [B.attrDef]],
  },
  {
    table: 'product_attribute_value', kind: 'chain',
    idA: () => A.attrValue, idB: () => B.attrValue,
    where: (id) => [`id = $1`, [id]],
    noopCol: 'value_text',
    insertOwnedByB: () => [`insert into product_attribute_value (product_id, def_id, value_text) values ($1,$2,'x')`, [B.product, A.attrDef]],
    insertForeignParent: () => [`insert into product_attribute_value (product_id, def_id, value_text) values ($1,$2,'y')`, [A.product, B.attrDef]],
  },
  {
    table: 'product_relation', kind: 'hybrid',
    idA: () => A.relation, idB: () => B.relation,
    where: (id) => [`id = $1`, [id]],
    noopCol: 'kind',
    insertOwnedByB: () => [`insert into product_relation (company_id, product_id, related_id, kind) values ($1,$2,$3,'substitute')`, [B.company, A.product, A.product2]],
    insertForeignParent: () => [`insert into product_relation (company_id, product_id, related_id, kind) values ($1,$2,$3,'substitute')`, [A.company, A.product, B.product]],
  },
  {
    // جدولِ بدونِ ستونِ id — کلیدِ اصلیِ ترکیبی
    table: 'product_bundle', kind: 'chain',
    idA: () => A.bundle, idB: () => B.bundle,
    where: (id) => [`bundle_product_id = $1`, [id]],
    noopCol: 'qty',
    insertOwnedByB: () => [`insert into product_bundle (bundle_product_id, component_product_id, qty) values ($1,$2,1)`, [B.product, A.product2]],
    insertForeignParent: () => [`insert into product_bundle (bundle_product_id, component_product_id, qty) values ($1,$2,2)`, [A.product2, B.product]],
  },
  {
    table: 'product_barcode', kind: 'hybrid',
    idA: () => A.barcode, idB: () => B.barcode,
    where: (id) => [`id = $1`, [id]],
    noopCol: 'barcode',
    insertOwnedByB: () => [`insert into product_barcode (company_id, product_id, barcode, kind) values ($1,$2,'X-1','internal')`, [B.company, A.product2]],
    insertForeignParent: () => [`insert into product_barcode (company_id, product_id, packaging_id, barcode, kind) values ($1,$2,$3,'X-2','internal')`, [A.company, B.product2, A.packaging]],
  },
  {
    table: 'product_code_seq', kind: 'direct',
    idA: () => A.codeSeq, idB: () => B.codeSeq,
    where: (id) => [`company_id = $1`, [id]],
    noopCol: 'next_seq',
    // شرکتِ C بدونِ ردیف است تا خطایِ 42501 با 23505 (تداخلِ کلیدِ اصلی) قاطی نشود
    insertOwnedByB: () => [`insert into product_code_seq (company_id, next_seq) values ($1, 1)`, [companyC]],
  },
  {
    table: 'product_import', kind: 'direct',
    idA: () => A.importRow, idB: () => B.importRow,
    where: (id) => [`id = $1`, [id]],
    noopCol: 'idempotency_key',
    insertOwnedByB: () => [`insert into product_import (company_id, idempotency_key, mode) values ($1,'IK-X','create')`, [B.company]],
  },
];

describe('ماتریسِ جدول‌های 0046 — خواندنِ بین‌اجاره‌ای زیرِ dms_app', () => {
  for (const c of cases) {
    it(`${c.table}: A فقط سطرِ خودش، B فقط سطرِ خودش، متقابل صفر ردیف`, async () => {
      const [wA, pA] = c.where(c.idA());
      const [wB, pB] = c.where(c.idB());

      const rowsA = await asRuntime(A.company, (cl) =>
        cl.query(`select 1 as ok from ${c.table} where ${wA}`, pA),
      );
      expect(rowsA.rows.length, `${c.table}: A must see own row`).toBe(1);
      const crossA = await asRuntime(A.company, (cl) =>
        cl.query(`select 1 as ok from ${c.table} where ${wB}`, pB),
      );
      expect(crossA.rows.length, `${c.table}: A must NOT see B row`).toBe(0);

      const rowsB = await asRuntime(B.company, (cl) =>
        cl.query(`select 1 as ok from ${c.table} where ${wB}`, pB),
      );
      expect(rowsB.rows.length, `${c.table}: B must see own row`).toBe(1);
      const crossB = await asRuntime(B.company, (cl) =>
        cl.query(`select 1 as ok from ${c.table} where ${wA}`, pA),
      );
      expect(crossB.rows.length, `${c.table}: B must NOT see A row`).toBe(0);
    });

    it(`${c.table}: نبودِ زمینه و زمینهٔ نامعتبر fail-closed است (صفر ردیف)`, async () => {
      const [wA, pA] = c.where(c.idA());
      const [wB, pB] = c.where(c.idB());
      for (const ctx of ['none', 'invalid'] as const) {
        for (const [w, p, label] of [[wA, pA, 'A'], [wB, pB, 'B']] as const) {
          const r = await asRuntime(ctx, (cl) => cl.query(`select 1 as ok from ${c.table} where ${w}`, p));
          expect(r.rows.length, `${c.table}/${ctx}/${label}`).toBe(0);
        }
      }
    });
  }

  it('جابه‌جاییِ زمینهٔ اجاره در همان نشست: سطرهایِ A پس از سوییچ به B ناپدید می‌شوند', async () => {
    const client = new pg.Client({ connectionString: appUrl.toString() });
    await client.connect();
    try {
    await client.query(`select set_config('app.company_id', $1, false), set_config('app.user_id', $2, false)`, [
      A.company,
      crypto.randomUUID(),
    ]);
    const before = await client.query(`select count(*)::int as n from product_family`);
      expect(before.rows[0].n).toBeGreaterThanOrEqual(1);
      const ownA = await client.query(`select 1 as ok from product_family where id = $1`, [A.family]);
      expect(ownA.rows.length).toBe(1);

      await client.query(`select set_config('app.company_id', $1, false), set_config('app.user_id', $2, false)`, [
        B.company,
        crypto.randomUUID(),
      ]);
      const ownAAfter = await client.query(`select 1 as ok from product_family where id = $1`, [A.family]);
      expect(ownAAfter.rows.length, 'A rows must vanish after switching context to B').toBe(0);
      const ownB = await client.query(`select 1 as ok from product_family where id = $1`, [B.family]);
      expect(ownB.rows.length).toBe(1);
    } finally {
      await client.end();
    }
  });
});

describe('ماتریسِ نوشتنِ بین‌اجاره‌ای — درج/به‌روزرسانی/حذف', () => {
  for (const c of cases) {
    it(`${c.table}: درج با مالکیتِ B از زمینهٔ A ⇒ 42501`, async () => {
      const [sql, params] = c.insertOwnedByB();
      const code = await expectRlsDenied(
        asRuntime(A.company, (cl) => cl.query(sql, params)),
        `${c.table}/insert-owned-by-B`,
      );
      expect(code, `${c.table}: insert with B ownership`).toBe('42501');
    });

    if (c.insertForeignParent) {
      it(`${c.table}: چسبیدنِ سطرِ فرزند به والدِ اجارهٔ دیگر ⇒ 42501`, async () => {
        const [sql, params] = c.insertForeignParent!();
        const code = await expectRlsDenied(
          asRuntime(A.company, (cl) => cl.query(sql, params)),
          `${c.table}/insert-foreign-parent`,
        );
        expect(code, `${c.table}: attach to foreign parent`).toBe('42501');
      });
    }

    it(`${c.table}: به‌روزرسانی/حذفِ سطرِ B از زمینهٔ A ⇒ صفر ردیف، بدون اثر`, async () => {
      const [wB, pB] = c.where(c.idB());
      const upd = await asRuntime(A.company, (cl) =>
        cl.query(`update ${c.table} set ${c.noopCol} = ${c.noopCol} where ${wB}`, pB),
      );
      expect(upd.rowCount, `${c.table}: cross update must touch 0 rows`).toBe(0);

      const del = await asRuntime(A.company, (cl) =>
        cl.query(`delete from ${c.table} where ${wB}`, pB),
      );
      expect(del.rowCount, `${c.table}: cross delete must touch 0 rows`).toBe(0);

      // مالکِ واقعی (B) باید همچنان سطرش را ببیند — یعنی تغییری رخ نداده
      const still = await asRuntime(B.company, (cl) =>
        cl.query(`select 1 as ok from ${c.table} where ${wB}`, pB),
      );
      expect(still.rows.length, `${c.table}: B row must survive`).toBe(1);
    });
  }
});

// ---------------------------------------------------------------------------
// جدول‌های «تغییریافته» توسط 0046 — ستون‌های کلیدِ خارجیِ جدید نباید به والدِ
// بیگانه بچسبند (family_id و packaging_id).
// ---------------------------------------------------------------------------

describe('ستون‌های جدیدِ 0046 — اتصال به والدِ اجارهٔ دیگر مسدود است', () => {
  it('product.family_id: به‌روزرسانی به خانوادهٔ B ⇒ 42501', async () => {
    const code = await expectRlsDenied(
      asRuntime(A.company, (cl) =>
        cl.query(`update product set family_id = $1 where id = $2`, [B.family, A.product]),
      ),
      'product.family_id-attach',
    );
    expect(code).toBe('42501');
  });

  it('price_list_item.packaging_id: چسباندن به بسته‌بندیِ B ⇒ 42501', async () => {
    const code = await expectRlsDenied(
      asRuntime(A.company, (cl) =>
        cl.query(`update price_list_item set packaging_id = $1 where id = $2`, [B.packaging, A.priceListItem]),
      ),
      'price_list_item.packaging-attach',
    );
    expect(code).toBe('42501');
  });

  it('customer_price.packaging_id: چسباندن به بسته‌بندیِ B ⇒ 42501', async () => {
    const code = await expectRlsDenied(
      asRuntime(A.company, (cl) =>
        cl.query(`update customer_price set packaging_id = $1 where id = $2`, [B.packaging, A.customerPrice]),
      ),
      'customer_price.packaging-attach',
    );
    expect(code).toBe('42501');
  });

  for (const [table, docCol] of [
    ['sales_order_line', 'sales_order_id'],
    ['invoice_line', 'invoice_id'],
    ['credit_note_line', 'credit_note_id'],
    ['return_request_line', 'return_request_id'],
  ] as const) {
    it(`${table}.packaging_id: درجِ خط با بسته‌بندیِ B ⇒ 42501`, async () => {
      const doc =
        table === 'sales_order_line' ? A.salesOrder
          : table === 'invoice_line' ? A.invoice
            : table === 'credit_note_line' ? A.creditNote
              : A.returnReq;
      const lineNoCol = table === 'credit_note_line' || table === 'return_request_line' ? '' : 'line_no,';
      const lineNoVal = table === 'credit_note_line' || table === 'return_request_line' ? '' : '2,';
      const extraCols = table === 'sales_order_line' ? ', qty_base, line_total' : table === 'invoice_line' || table === 'credit_note_line' ? ', line_total' : '';
      const extraVals = table === 'sales_order_line' ? ', 1, 10' : table === 'invoice_line' || table === 'credit_note_line' ? ', 10' : '';
      const code = await expectRlsDenied(
        asRuntime(A.company, (cl) =>
          cl.query(
            `insert into ${table} (${docCol}, ${lineNoCol} product_id, qty, unit_price${extraCols}, packaging_id)
             values ($1, ${lineNoVal} $2, 1, 10${extraVals}, $3)`,
            [doc, A.product2, B.packaging],
          ),
        ),
        `${table}/packaging-attach-insert`,
      );
      expect(code).toBe('42501');
    });
  }

  it('سناریوی مرزی: بسته‌بندیِ NULL (قیمت/بارکدِ پایه) همچنان مجاز است', async () => {
    const r = await asRuntime(A.company, (cl) =>
      cl.query(
        `insert into price_list_item (price_list_id, product_id, price, valid, packaging_id)
         values ($1,$2,50,'[1405-01-01,)'::daterange,null) returning id`,
        [A.priceList, A.product2],
      ),
    );
    expect(r.rows.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// پوششِ کاتالوگ — RLS/FORCE/سیاست برای همهٔ جدول‌های 0046 (L-01: پویا، نه فهرستِ ثابت)
// ---------------------------------------------------------------------------

describe('پوششِ کاتالوگِ RLS برای جدول‌های Product Master', () => {
  const tables1046 = [
    'product_family', 'product_alias', 'product_attribute_def', 'product_attribute_enum_value',
    'product_attribute_value', 'product_relation', 'product_bundle', 'product_barcode',
    'product_code_seq', 'product_import',
  ];

  it('هر ۱۰ جدولِ 0046: RLS فعال + FORCE + دستِ‌کم یک سیاست', async () => {
    const { rows } = await ownerPool.query(
      `select c.relname,
              c.relrowsecurity as rls, c.relforcerowsecurity as forced,
              (select count(*)::int from pg_policy p where p.polrelid = c.oid) as pols
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = any($1)`,
      [tables1046],
    );
    expect(rows.length).toBe(10);
    for (const r of rows) {
      expect(r.rls, `${r.relname} rls`).toBe(true);
      expect(r.forced, `${r.relname} force`).toBe(true);
      expect(r.pols, `${r.relname} policy count`).toBeGreaterThanOrEqual(1);
    }
  });

  it('سیاست‌های ۱۰ جدول به fn_current_company_id یا والدِ محافظت‌شده متصل‌اند (نه مقدارِ ثابت)', async () => {
    const { rows } = await ownerPool.query(
      `select polname, pg_get_expr(polqual, polrelid) as qual
         from pg_policy
        where polrelid = any($1::regclass[])`,
      [tables1046.map((t) => `public.${t}`)],
    );
    expect(rows.length).toBeGreaterThanOrEqual(10);
    for (const r of rows) {
      const q = String(r.qual);
      const usesFn = q.includes('fn_current_company_id');
      const usesParent = /exists\s*\(\s*select\s+1\s+from\s+(product|product_attribute_def|product_packaging)/i.test(q);
      expect(usesFn || usesParent, `${r.polname} must derive tenant from fn or protected parent`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// رگرسیون‌های Product Master زیرِ dms_app — D1..D5 و مکانیزم‌های 0046
// ---------------------------------------------------------------------------

describe('رگرسیون — مکانیزم‌های Product Master زیرِ نقشِ برنامه', () => {
  it('snapshot سند: نام/کدِ کالا از کاتالوگِ همان اجاره پر می‌شود', async () => {
    const r = await asRuntime(A.company, (cl) =>
      cl.query(`select product_name, product_code, packaging_factor, snapshot_source from v_document_line_display where line_id = $1`, [A.salesLine]),
    );
    expect(r.rows.length).toBe(1);
    expect(r.rows[0].product_name).toBe(A.product2Name);
    expect(Number(r.rows[0].packaging_factor)).toBe(6);
    expect(r.rows[0].snapshot_source).toBe('snapshot');
  });

  it('snapshot نشت نمی‌کند: ارجاعِ بین‌اجاره‌ای به کالای B هرگز نامِ B را کپی نمی‌کند', async () => {
    // وکتورِ product_id روی خطوطِ سند از پیش از 0046 وجود داشته (قرارداد 0042)؛
    // آنچه 0046 افزوده مکانیزمِ snapshot است و باید fail-closed باشد.
    let inserted = false;
    try {
      await asRuntime(A.company, (cl) =>
        cl.query(
          `insert into invoice_line (invoice_id, line_no, product_id, qty, unit_price, line_total)
           values ($1, 99, $2, 1, 1, 1) returning id`,
          [A.invoice, B.product],
        ),
      );
      inserted = true;
    } catch {
      inserted = false; // اگر مرز سخت‌تر شد (42501) هم قابل‌قبول است
    }
    if (inserted) {
      const owner = await ownerPool.query(
        `select product_name, product_code from invoice_line where invoice_id = $1 and line_no = 99`,
        [A.invoice],
      );
      expect(owner.rows.length).toBe(1);
      expect(owner.rows[0].product_name, 'cross-tenant product name must not leak into snapshot').toBeNull();
      expect(owner.rows[0].product_code, 'cross-tenant product code must not leak into snapshot').toBeNull();
      await ownerPool.query(`delete from invoice_line where invoice_id = $1 and line_no = 99`, [A.invoice]);
    }
  });

  it('v_document_line_display زیرِ security_invoker: فقط خطوطِ همان اجاره دیده می‌شود', async () => {
    const rA = await asRuntime(A.company, (cl) => cl.query(`select line_id from v_document_line_display`));
    const idsA = rA.rows.map((x) => x.line_id);
    expect(idsA).toContain(A.salesLine);
    expect(idsA).not.toContain(B.salesLine);
    expect(idsA).not.toContain(B.invoiceLine);

    const rB = await asRuntime(B.company, (cl) => cl.query(`select line_id from v_document_line_display`));
    const idsB = rB.rows.map((x) => x.line_id);
    expect(idsB).toContain(B.salesLine);
    expect(idsB).not.toContain(A.salesLine);
  });

  it('D5: خطِ سند روی SKU «بسته» زیرِ dms_app هم رد می‌شود (trg_*_no_bundle)', async () => {
    const code = await expectRlsDenied(
      asRuntime(A.company, (cl) =>
        cl.query(
          `insert into sales_order_line (sales_order_id, line_no, product_id, qty, qty_base, unit_price, line_total)
           values ($1, 7, $2, 1, 1, 1, 1)`,
          [A.salesOrder, A.product], // A.product = بسته
        ),
      ),
      'D5-bundle-line-rejected',
    );
    expect(code).toBe('P0001'); // پیامِ D5 از fn_reject_bundle_line
  });

  it('idempotencyِ import در دامنهٔ شرکت است: کلیدِ یکسان در A و B مجاز، تکرار در همان شرکت ممنوع', async () => {
    // مالک (seed) همان 'IK-1' را برای هر دو شرکت درج کرده — یعنی قیدِ یکتایی per-company است.
    const dupA = await asRuntime(A.company, (cl) =>
      cl.query(`insert into product_import (company_id, idempotency_key, mode) values ($1,'IK-1','create')`, [A.company]),
    ).then(() => 'ok').catch((e: { code?: string }) => e.code ?? '');
    expect(dupA).toBe('23505'); // همان شرکت + همان کلید ⇒ یکتایی

    const viaCtx = await asRuntime(A.company, (cl) =>
      cl.query(`insert into product_import (company_id, idempotency_key, mode) values ($1,'IK-2','create') returning id`, [A.company]),
    );
    expect(viaCtx.rows.length).toBe(1);
  });

  it('D1: شمارندهٔ SKU (product_code_seq) فقط برایِ خودِ اجاره قابلِ به‌روزرسانی است', async () => {
    const r = await asRuntime(A.company, (cl) =>
      cl.query(`update product_code_seq set next_seq = next_seq + 1 where company_id = $1 returning next_seq`, [A.company]),
    );
    expect(r.rows.length).toBe(1);
    expect(Number(r.rows[0].next_seq)).toBe(2);

    const cross = await asRuntime(A.company, (cl) =>
      cl.query(`update product_code_seq set next_seq = 99 where company_id = $1`, [B.company]),
    );
    expect(cross.rowCount).toBe(0);
  });

  it('D2: یکتاییِ جهانیِ بارکدِ gs1 حفظ شده (index سراسری، مستقل از RLS)', async () => {
    const code = await asRuntime(A.company, (cl) =>
      cl.query(`insert into product_barcode (company_id, product_id, barcode, kind) values ($1,$2,$3,'gs1_ean13')`, [A.company, A.product2, '9999000000001']),
    ).then(() => 'ok').catch((e: { code?: string }) => e.code ?? '');
    expect(code).toBe('ok');
    const dup = await asRuntime(B.company, (cl) =>
      cl.query(`insert into product_barcode (company_id, product_id, barcode, kind) values ($1,$2,$3,'gs1_ean13')`, [B.company, B.product2, '9999000000001']),
    ).then(() => 'ok').catch((e: { code?: string }) => e.code ?? '');
    expect(dup).toBe('23505');
  });

  it('خانواده/صفات/alias/روابط: خواندن و نوشتنِ همان‌اجاره‌ای زیرِ dms_app کار می‌کند', async () => {
    const r = await asRuntime(A.company, (cl) =>
      cl.query(
        `select (select count(*)::int from product_family where company_id = $1) as fam,
                (select count(*)::int from product_attribute_def where company_id = $1) as defs,
                (select count(*)::int from product_alias where company_id = $1) as aliases,
                (select count(*)::int from product_relation where company_id = $1) as rels,
                (select count(*)::int from product where company_id = $1) as prods`,
        [A.company],
      ),
    );
    expect(r.rows[0]).toEqual({ fam: 1, defs: 1, aliases: 1, rels: 1, prods: 2 });

    const ins = await asRuntime(A.company, (cl) =>
      cl.query(`insert into product_alias (company_id, product_id, alias, alias_norm) values ($1,$2,'تازه','تازه') returning id`, [A.company, A.product]),
    );
    expect(ins.rows.length).toBe(1);
  });
});
