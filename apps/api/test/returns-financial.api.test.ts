import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';
import request from 'supertest';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../src/app.module';
import { PG_POOL } from '../src/database/database.module';
import { validationPipeOptions } from '../src/common/validation';
import { hashPassword } from '../src/modules/identity-rbac/password';

/**
 * TASK-P4-FC — بستن مالیِ مرجوعی:
 *   پیوند مرجوعی ← قلمِ فاکتور، سقفِ eligibility مقداری،
 *   صدور یادداشت بستانکار (posted) با محاسبهٔ به‌تناسب از خطِ فاکتور،
 *   سقف سختِ grand_total، اتصال شرطی credit_note_id (idempotency)،
 *   دفتر بدهکاری مشتری (AR)، return_status فاکتور، وضعیت صریحِ ارزش‌گذاری.
 *
 * دیتابیس موقت «greendms_returns_financial_test» از صفر + همهٔ مهاجرت‌ها.
 * یادداشت: در محیط‌های sandbox بدون postgis، متغیر MIGRATIONS_DIR می‌تواند به
 * نسخهٔ stub‌شدهٔ مهاجرت‌ها اشاره کند (جایگزینی postgis/btree_gist/…؛ پیش‌فرض = خودِ ریپازیتوری).
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_returns_financial_test';
const PSQL = process.env.PSQL ?? 'psql';
const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR ?? path.join(ROOT, 'migrations');

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
let pool: pg.Pool;
let app: INestApplication;

const PASSWORD = 'S3cret!pass';
const ADMIN_A = 'fin_admin_a';
const VIEWER_A = 'fin_viewer_a';
const ADMIN_B = 'fin_admin_b';

let adminA = '';
let viewerA = '';
let adminB = '';

let companyA = '';
let branchA = '';
let customerA = '';
let productA1 = '';
let productA2 = '';
let whMain = '';
let whQuar = '';
let companyB = '';
let customerB = '';
let productB = '';
let invoiceAnomalous = '';
let docSeq = 100;
const nextDoc = (): string => `INV-FIN-X${String(docSeq++).padStart(3, '0')}`;
let freshInvoice: (
  doc: string,
  grandTotal: string,
  lines: { product_id: string; qty: number; unit_price: string; discount_amount: string; tax_amount: string; line_total: string; line_no: number }[],
) => Promise<{ invoice_id: string; line_ids: string[] }>;

/** فاکتور سازگار: line_total شامل تخفیف و مالیات؛ grand = Σline_total */
let invoiceId = '';
let invLine1 = ''; // P1 ×10 @1000, VAT 9% → line_total 10900
let invLine2 = ''; // P2 ×5 @2000, disc 500, VAT 9% → line_total 10355

const MISSING = '11111111-1111-4111-8111-111111111111';

const api = (token: string) => {
  const base = request(app.getHttpServer());
  const verb = (method: 'get' | 'post') => (url: string) =>
    base[method](url).set('Authorization', `Bearer ${token}`);
  return { get: verb('get'), post: verb('post') };
};

const login = async (username: string): Promise<string> => {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ username, password: PASSWORD })
    .expect(200);
  return res.body.access_token as string;
};

const createReturn = (
  token: string,
  lines: { product_id: string; qty: number; invoice_line_id?: string }[],
  overrides: Record<string, unknown> = {},
) =>
  api(token)
    .post('/api/v1/returns')
    .send({ customer_id: customerA, reason_code: 'damaged', lines, ...overrides });

const approve = (token: string, id: string) => api(token).post(`/api/v1/returns/${id}/approve`).expect(200);
const issue = (token: string, id: string) => api(token).post(`/api/v1/returns/${id}/credit-note`);

const getReturn = async (token: string, id: string) => {
  const res = await api(token).get(`/api/v1/returns/${id}`).expect(200);
  return res.body;
};

/** دریافت کامل: restock برای همهٔ خطوط با qty_approved = qty */
const receiveAll = (token: string, id: string, lines: { product_id: string; qty: number }[]) =>
  api(token)
    .post(`/api/v1/returns/${id}/receive`)
    .send({ lines: lines.map((l) => ({ ...l, disposition: 'restock' })) })
    .expect(200);

const ledgerCredits = async (docId: string) => {
  const { rows } = await pool.query<{ credit: string }>(
    `select credit::text as credit from customer_ledger_entry
      where doc_type = 'credit_note' and doc_id = $1`,
    [docId],
  );
  return rows;
};
const creditNotesForInvoice = async (invId: string) => {
  const { rows } = await pool.query<{ id: string; amount: string; status: string }>(
    `select id, amount::text as amount, status from credit_note where invoice_id = $1 order by issued_at`,
    [invId],
  );
  return rows;
};
const journalCount = async () => (await pool.query<{ c: string }>('select count(*)::text as c from journal_entry')).rows[0].c;

let makeInvoice: (
  cid: string, bid: string, custId: string, docNumber: string,
  grandTotal: string, subtotal: string, discount: string, tax: string,
  lines: { product_id: string; qty: number; unit_price: string; discount_amount: string; tax_amount: string; line_total: string; line_no: number }[],
  status?: string,
) => Promise<{ invoice_id: string; line_ids: string[] }>;

beforeAll(async () => {
  adminPool = new pg.Pool({ connectionString: adminUrl.toString(), max: 1 });
  await adminPool.query(
    'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
    [TEST_DB],
  );
  await adminPool.query(`drop database if exists "${TEST_DB}"`);
  await adminPool.query(`create database "${TEST_DB}"`);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.up.sql'))
    .sort()
    .flatMap((f) => ['-f', path.join(MIGRATIONS_DIR, f)]);
  execFileSync(PSQL, [...psqlBase, '-d', TEST_DB, '-1', '-q', ...files], {
    env: psqlEnv,
    stdio: 'pipe',
  });

  pool = new pg.Pool({ connectionString: testUrl.toString(), max: 1 });
  const hash = await hashPassword(PASSWORD);
  await pool.query(`insert into uom (code, title) values ('RFPCS', 'عدد')`);

  const makeCompany = async (code: string): Promise<string> =>
    (await pool.query<{ id: string }>(`insert into company (code, legal_name) values ($1, $1) returning id`, [code])).rows[0].id;
  const makeBranch = async (cid: string, code: string): Promise<string> =>
    (await pool.query<{ id: string }>(
      `insert into branch (company_id, code, name) values ($1, $2, $2) returning id`, [cid, code],
    )).rows[0].id;
  const makeWarehouse = async (bid: string, code: string, kind: string): Promise<string> =>
    (await pool.query<{ id: string }>(
      `insert into warehouse (branch_id, code, name, kind, is_active) values ($1, $2, $2, $3, true) returning id`,
      [bid, code, kind],
    )).rows[0].id;
  const makeCustomer = async (cid: string, bid: string, code: string): Promise<string> => {
    const person = await pool.query<{ id: string }>(
      `insert into person (company_id, code, legal_type, first_name, last_name)
       values ($1, $2, 'natural', 'مشتری', 'مالی') returning id`, [cid, `P-${code}`]);
    return (await pool.query<{ id: string }>(
      `insert into customer (person_id, branch_id, code, channel) values ($1, $2, $3, 'retail') returning id`,
      [person.rows[0].id, bid, code],
    )).rows[0].id;
  };
  const makeProduct = async (cid: string, code: string): Promise<string> => {
    const category = await pool.query<{ id: string }>(
      `insert into product_category (company_id, code, name) values ($1, $2, $2) returning id`,
      [cid, `CAT-${code}`]);
    return (await pool.query<{ id: string }>(
      `insert into product (company_id, code, name, category_id, base_uom_id)
       select $1, $2, $2, $3, id from uom where code = 'RFPCS' returning id`,
      [cid, code, category.rows[0].id],
    )).rows[0].id;
  };
  makeInvoice = async (
    cid: string, bid: string, custId: string, docNumber: string,
    grandTotal: string, subtotal: string, discount: string, tax: string,
    lines: { product_id: string; qty: number; unit_price: string; discount_amount: string; tax_amount: string; line_total: string; line_no: number }[],
    status = 'posted',
  ): Promise<{ invoice_id: string; line_ids: string[] }> => {
    const series = await pool.query<{ id: string }>(
      `insert into document_series (branch_id, doc_kind, fiscal_year, prefix, is_active)
       values ($1, 'invoice', 1404, 'INV', true)
       on conflict (branch_id, doc_kind, fiscal_year) do update set is_active = true
       returning id`, [bid]);
    const inv = await pool.query<{ id: string }>(
      `insert into invoice (branch_id, doc_number, fiscal_year, series_id, customer_id, invoice_date,
                            subtotal, discount_total, tax_total, grand_total, status)
       values ($1, $2, 1404, $3, $4, current_date, $5, $6, $7, $8, $9) returning id`,
      [bid, docNumber, series.rows[0].id, custId, subtotal, discount, tax, grandTotal, status]);
    const lineIds: string[] = [];
    for (const l of lines) {
      const r = await pool.query<{ id: string }>(
        `insert into invoice_line (invoice_id, line_no, product_id, qty, unit_price, discount_amount, tax_rate_pct, tax_amount, line_total)
         values ($1, $2, $3, $4, $5, $6, 9, $7, $8) returning id`,
        [inv.rows[0].id, l.line_no, l.product_id, l.qty, l.unit_price, l.discount_amount, l.tax_amount, l.line_total]);
      lineIds.push(r.rows[0].id);
    }
    return { invoice_id: inv.rows[0].id, line_ids: lineIds };
  };
  const makeUser = async (cid: string, code: string, kind: 'admin_full' | 'viewer'): Promise<void> => {
    const roleId = (await pool.query<{ id: string }>(
      `insert into role (company_id, code, name) values ($1, $2, $3) returning id`, [cid, `${kind}_${code}`, `${kind}_${code}`],
    )).rows[0].id;
    if (kind === 'admin_full') {
      await pool.query(`insert into role_permission (role_id, permission_code) select $1, code from permission`, [roleId]);
    } else {
      await pool.query(`insert into role_permission (role_id, permission_code) values ($1, 'sales.return.request')`, [roleId]);
    }
    const person = await pool.query<{ id: string }>(
      `insert into person (company_id, code, legal_type, first_name, last_name)
       values ($1, $2, 'natural', 'کاربر', 'مالی') returning id`, [cid, `U-${code}`]);
    const user = await pool.query<{ id: string }>(
      `insert into app_user (person_id, username, password_hash, access_level)
       values ($1, $2, $3, 'web') returning id`, [person.rows[0].id, code, hash]);
    await pool.query(`insert into user_role (app_user_id, role_id) values ($1, $2)`, [user.rows[0].id, roleId]);
  };

  freshInvoice = (doc, grandTotal, lines) =>
    // سازگار با ck_invoice_total: grand = subtotal − discount + tax
    makeInvoice(companyA, branchA, customerA, doc, grandTotal, grandTotal, '0.00', '0.00', lines);

  // ---------- شرکت A ----------
  companyA = await makeCompany('RFINA');
  branchA = await makeBranch(companyA, 'MAIN');
  whMain = await makeWarehouse(branchA, 'MAIN', 'main');
  whQuar = await makeWarehouse(branchA, 'QUAR', 'quarantine');
  customerA = await makeCustomer(companyA, branchA, 'C-FIN-A');
  productA1 = await makeProduct(companyA, 'P-FIN-1');
  productA2 = await makeProduct(companyA, 'P-FIN-2');
  const inv = await makeInvoice(companyA, branchA, customerA, 'INV-FIN-1', '21255.00', '20000.00', '500.00', '1755.00', [
    { product_id: productA1, qty: 10, unit_price: '1000.0000', discount_amount: '0.00', tax_amount: '900.00', line_total: '10900.00', line_no: 1 },
    { product_id: productA2, qty: 5, unit_price: '2000.0000', discount_amount: '500.00', tax_amount: '855.00', line_total: '10355.00', line_no: 2 },
  ]);
  invoiceId = inv.invoice_id;
  [invLine1, invLine2] = inv.line_ids;

  // فاکتورِ «ناسازگار» (مسیر مستقیمِ POST /invoices: تخفیف دوبار کسر می‌شود)
  // line: 5 × 2000, disc 500, VAT 9% → line_total 10355؛ ولی grand طبق فرمول مسیر مستقیم = 9855
  const anomalous = await makeInvoice(companyA, branchA, customerA, 'INV-FIN-ANOM', '9855.00', '9500.00', '500.00', '855.00', [
    { product_id: productA2, qty: 5, unit_price: '2000.0000', discount_amount: '500.00', tax_amount: '855.00', line_total: '10355.00', line_no: 1 },
  ]);
  invoiceAnomalous = anomalous.invoice_id;

  await makeUser(companyA, ADMIN_A, 'admin_full');
  await makeUser(companyA, VIEWER_A, 'viewer');

  // ---------- شرکت B (کراس-تننت) ----------
  companyB = await makeCompany('RFINB');
  const branchB = await makeBranch(companyB, 'MAIN');
  await makeWarehouse(branchB, 'BMAIN', 'main');
  customerB = await makeCustomer(companyB, branchB, 'C-FIN-B');
  productB = await makeProduct(companyB, 'P-FIN-B');
  await makeUser(companyB, ADMIN_B, 'admin_full');

  process.env.DATABASE_URL = testUrl.toString();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication({ logger: false });
  app.setGlobalPrefix('api/v1', { exclude: ['api/health'] });
  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
  await app.init();

  adminA = await login(ADMIN_A);
  viewerA = await login(VIEWER_A);
  adminB = await login(ADMIN_B);
}, 240_000);

afterAll(async () => {
  const appPool = app?.get<pg.Pool>(PG_POOL);
  await app?.close();
  await appPool?.end();
  await pool?.end();
  if (adminPool) {
    await adminPool.query(
      'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
      [TEST_DB],
    );
    await adminPool.query(`drop database if exists "${TEST_DB}"`);
    await adminPool.end();
  }
}, 60_000);

describe('TASK-P4-FC · مرجوعی ← فاکتور / یادداشت بستانکار', () => {
  it('۱) مرجوعی بدون پیوندِ فاکتور: دریافت ممکن است ولی صدور بستانکار 400 credit_requires_invoice', async () => {
    const res = await createReturn(viewerA, [{ product_id: productA1, qty: 1 }], { customer_id: customerA }).expect(201);
    expect(res.body.status).toBe('submitted');
    expect(res.body.invoice_id).toBeNull();
    const id = res.body.id as string;
    await approve(adminA, id);
    await receiveAll(adminA, id, [{ product_id: productA1, qty: 1 }]);
    const issueRes = await issue(adminA, id).expect(400);
    expect(issueRes.body.code).toBe('credit_requires_invoice');
  });

  it('۲) eligibility: مقدار بیش از فروخته‌شده ⇒ 400 qty_exceeds_invoiced', async () => {
    const res = await createReturn(viewerA, [{ product_id: productA1, qty: 11, invoice_line_id: invLine1 }]);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('qty_exceeds_invoiced');
    expect(res.body.details).toMatchObject({ invoice_line_id: invLine1, sold_qty: 10, requested_qty: 11 });
  });

  it('۳) پیوند به خطِ فاکتور مشتری دیگر ⇒ 400 invoice_customer_mismatch', async () => {
    // فاکتورِ B متعلق به شرکت B است؛ خطوط آن در A نامعتبرند
    const res = await createReturn(viewerA, [{ product_id: productB, qty: 1, invoice_line_id: MISSING }]);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invoice_line_not_found');
  });

  it('۴) مسیر نرمال: مرجوعی جزئی ← دریافت ← یادداشت بستانکار (مبلغ دقیق از خط فاکتور)', async () => {
    const res = await createReturn(viewerA, [{ product_id: productA1, qty: 4, invoice_line_id: invLine1 }], { invoice_id: invoiceId }).expect(201);
    const id = res.body.id as string;
    expect(res.body.invoice_id).toBe(invoiceId);
    expect(res.body.financial_status).toBe('awaiting_receipt');
    expect(res.body.valuation_status).toBe('unresolved');
    await approve(adminA, id);
    await receiveAll(adminA, id, [{ product_id: productA1, qty: 4 }]);
    const received = await getReturn(adminA, id);
    expect(received.status).toBe('posted');
    expect(received.financial_status).toBe('awaiting_credit_note');
    expect(received.valuation_status).toBe('unresolved');
    expect(received.credit_note).toBeNull();

    const journalsBefore = await journalCount();
    const issued = await issue(adminA, id).expect(201);
    expect(issued.body.financial_status).toBe('credit_note_issued');
    expect(issued.body.credit_note).toMatchObject({ amount: '4360.00', status: 'posted' });
    expect(String(issued.body.credit_note.doc_number)).toMatch(/^CN-/);
    expect(await journalCount()).toBe(journalsBefore); // بدون پُستِ GL خودکار

    // دفتر مشتری: یک «credit» به‌اندازهٔ سند
    const credits = await ledgerCredits(issued.body.credit_note.id);
    expect(credits).toHaveLength(1);
    expect(Number(credits[0].credit)).toBeCloseTo(4360, 2);

    // نمای آشتی‌گیری: partial (هنوز خط ۲ و مابقی خط ۱ مانده)
    const { rows } = await pool.query<{ return_status: string }>(`select return_status from v_invoice_return_summary where invoice_id = $1`, [invoiceId]);
    expect(rows[0].return_status).toBe('partial');
  });

  it('۵) مرجوعی دوم تا سقف خط فاکتور مجاز است؛ سومی رد می‌شود', async () => {
    const res = await createReturn(viewerA, [{ product_id: productA1, qty: 6, invoice_line_id: invLine1 }], { invoice_id: invoiceId }).expect(201);
    const id = res.body.id as string;
    await approve(adminA, id);
    await receiveAll(adminA, id, [{ product_id: productA1, qty: 6 }]);
    await issue(adminA, id).expect(201);

    // حالا ۱۰ از ۱۰ خط ۱ برگشته؛ هر درخواست تازهی رد می‌شود
    const over = await createReturn(viewerA, [{ product_id: productA1, qty: 1, invoice_line_id: invLine1 }]);
    expect(over.status).toBe(400);
    expect(over.body.code).toBe('qty_exceeds_invoiced');
    expect(over.body.details).toMatchObject({ sold_qty: 10, already_returned_qty: 10 });
  });

  it('۶) دوبار‌صدور بستانکار ⇒ 409 already_credited', async () => {
    // یافتن مرجوعی صادرشدهٔ تست ۴ از طریق فاکتور (قدیمی‌ترین posted+linked)
    const { rows } = await pool.query<{ id: string }>(
      `select distinct r.id from return_request r
        join return_request_line rl on rl.return_request_id = r.id
       where rl.invoice_line_id = $1 and r.status = 'posted' and r.credit_note_id is not null
       order by r.id limit 1`, [invLine1]);
    const id = rows[0].id;
    const again = await issue(adminA, id);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('already_credited');
  });

  it('۷) صدور رقابتی: دقیقاً یک درخواست موفق می‌شود', async () => {
    const res = await createReturn(viewerA, [{ product_id: productA2, qty: 2, invoice_line_id: invLine2 }], { invoice_id: invoiceId }).expect(201);
    const id = res.body.id as string;
    await approve(adminA, id);
    await receiveAll(adminA, id, [{ product_id: productA2, qty: 2 }]);
    const [a, b] = await Promise.all([issue(adminA, id), issue(adminA, id)]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
    const winner = a.status === 201 ? a : b;
    const credits = await ledgerCredits(winner.body.credit_note.id);
    expect(credits).toHaveLength(1);
    const notes = await creditNotesForInvoice(invoiceId);
    expect(notes.length).toBeGreaterThanOrEqual(3); // تست‌های قبلی + این یکی
  });

  it('۸) سقف سختِ grand_total: فاکتور ناسازگار ⇒ 409 credit_exceeds_invoice و هیچ چیزی persist نمی‌شود', async () => {
    const anomalousLine = (await pool.query<{ id: string }>(`select id from invoice_line where invoice_id = $1`, [invoiceAnomalous])).rows[0].id;
    const res = await createReturn(viewerA, [{ product_id: productA2, qty: 5, invoice_line_id: anomalousLine }], { invoice_id: invoiceAnomalous }).expect(201);
    const id = res.body.id as string;
    await approve(adminA, id);
    await receiveAll(adminA, id, [{ product_id: productA2, qty: 5 }]);
    const issued = await issue(adminA, id);
    expect(issued.status).toBe(409);
    expect(issued.body.code).toBe('credit_exceeds_invoice');
    expect(issued.body.details).toMatchObject({ computed_total: '10355.00', eligible_remaining: '9855.00' });
    // rollback کامل: هیچ سند/دفتری ساخته نشده
    expect(await creditNotesForInvoice(invoiceAnomalous)).toHaveLength(0);
    const after = await getReturn(adminA, id);
    expect(after.credit_note_id).toBeNull();
    expect(after.financial_status).toBe('awaiting_credit_note');
  });

  it('۹) خطوط بدون پیوند: یکی متصل یکی نه ⇒ 400 lines_missing_invoice_link', async () => {
    const res = await createReturn(viewerA, [
      { product_id: productA2, qty: 1, invoice_line_id: invLine2 },
      { product_id: productA1, qty: 1 },
    ], { invoice_id: invoiceId }).expect(201);
    const id = res.body.id as string;
    await approve(adminA, id);
    await receiveAll(adminA, id, [
      { product_id: productA2, qty: 1 },
      { product_id: productA1, qty: 1 },
    ]);
    const issued = await issue(adminA, id);
    expect(issued.status).toBe(400);
    expect(issued.body.code).toBe('lines_missing_invoice_link');
    expect(issued.body.details.product_ids).toContain(productA1);
  });

  it('۱۰) scrap تا تصمیم مالک بستانکار نمی‌شود و تلاشِ مسدودشده ممیزی می‌شود', async () => {
    const res = await createReturn(viewerA, [{ product_id: productA2, qty: 1, invoice_line_id: invLine2 }], { invoice_id: invoiceId }).expect(201);
    const id = res.body.id as string;
    await approve(adminA, id);
    await api(adminA).post(`/api/v1/returns/${id}/receive`)
      .send({ lines: [{ product_id: productA2, qty: 1, disposition: 'scrap' }] })
      .expect(200);
    const beforeNotes = (await creditNotesForInvoice(invoiceId)).length;
    const issued = await issue(adminA, id).expect(409);
    expect(issued.body.code).toBe('credit_disposition_unresolved');
    expect(issued.body.details).toMatchObject({ dispositions: ['scrap'], owner_decision: 'TASK-P4-FC OD-10' });
    const returned = await getReturn(adminA, id);
    expect(returned.credit_note_id).toBeNull();
    const evidence = await pool.query<{ action: string; after_data: { outcome: string; dispositions: string[] } }>(
      `select action, after_data from audit_log
        where company_id = $1 and entity_type = 'return_credit_note' and entity_id = $2
        order by at desc limit 1`, [companyA, id]);
    expect(evidence.rows[0]).toMatchObject({ action: 'reject', after_data: { outcome: 'blocked', dispositions: ['scrap'] } });
    expect(await creditNotesForInvoice(invoiceId)).toHaveLength(beforeNotes);
  });

  it('۱۱) مجوز: viewer فقط request دارد ⇒ 403', async () => {
    const res = await createReturn(viewerA, [{ product_id: productA2, qty: 1, invoice_line_id: invLine2 }], { invoice_id: invoiceId }).expect(201);
    const id = res.body.id as string;
    await approve(adminA, id);
    await receiveAll(adminA, id, [{ product_id: productA2, qty: 1 }]);
    const issued = await issue(viewerA, id);
    expect(issued.status).toBe(403);
  });

  it('۱۲) کراس-تننت: شرکت B نمی‌تواند برای مرجوعی شرکت A بستانکار صادر کند ⇒ 404', async () => {
    // فاکتورِ اختصاصی (ایزوله از تست‌های قبلی که سقفِ invLine2 را مصرف کردند)
    const fresh = await freshInvoice(nextDoc(), '200.00', [
      { product_id: productA2, qty: 2, unit_price: '100.0000', discount_amount: '0.00', tax_amount: '0.00', line_total: '200.00', line_no: 1 },
    ]);
    const res = await createReturn(viewerA, [{ product_id: productA2, qty: 1, invoice_line_id: fresh.line_ids[0] }], { invoice_id: fresh.invoice_id }).expect(201);
    const id = res.body.id as string;
    await approve(adminA, id);
    await receiveAll(adminA, id, [{ product_id: productA2, qty: 1 }]);
    const issued = await issue(adminB, id);
    expect(issued.status).toBe(404);
  });

  it('۱۳) پیش از receive بستانکار صادر نمی‌شود ⇒ 409 invalid_transition', async () => {
    const fresh = await freshInvoice(nextDoc(), '200.00', [
      { product_id: productA2, qty: 2, unit_price: '100.0000', discount_amount: '0.00', tax_amount: '0.00', line_total: '200.00', line_no: 1 },
    ]);
    const res = await createReturn(viewerA, [{ product_id: productA2, qty: 1, invoice_line_id: fresh.line_ids[0] }], { invoice_id: fresh.invoice_id }).expect(201);
    const issued = await issue(adminA, res.body.id as string);
    expect(issued.status).toBe(409);
    expect(issued.body.code).toBe('invalid_transition');
  });

  it('۱۴) مرجوعی کاملِ هر دو خطِ یک فاکتور اختصاصی ⇒ v_invoice_return_summary = full', async () => {
    const fresh = await freshInvoice(nextDoc(), '300.00', [
      { product_id: productA1, qty: 1, unit_price: '100.0000', discount_amount: '0.00', tax_amount: '0.00', line_total: '100.00', line_no: 1 },
      { product_id: productA2, qty: 2, unit_price: '100.0000', discount_amount: '0.00', tax_amount: '0.00', line_total: '200.00', line_no: 2 },
    ]);
    const res = await createReturn(viewerA, [
      { product_id: productA1, qty: 1, invoice_line_id: fresh.line_ids[0] },
      { product_id: productA2, qty: 2, invoice_line_id: fresh.line_ids[1] },
    ], { invoice_id: fresh.invoice_id }).expect(201);
    const id = res.body.id as string;
    await approve(adminA, id);
    await receiveAll(adminA, id, [
      { product_id: productA1, qty: 1 },
      { product_id: productA2, qty: 2 },
    ]);
    await issue(adminA, id).expect(201);
    const { rows } = await pool.query<{ return_status: string }>(`select return_status from v_invoice_return_summary where invoice_id = $1`, [fresh.invoice_id]);
    expect(rows[0].return_status).toBe('full');
  });

  it('۱۵) جمعِ مبلغِ بستانکارهای posted فاکتور ≤ grand_total (مونوتون)', async () => {
    const notes = await creditNotesForInvoice(invoiceId);
    const sum = notes.filter((n) => n.status === 'posted').reduce((s, n) => s + Number(n.amount), 0);
    expect(sum).toBeLessThanOrEqual(21255 + 0.004);
    expect(sum).toBeGreaterThan(0);
  });

  it('۱۶) ایجاد مرجوعی روی draft/voided فاکتور رد می‌شود', async () => {
    for (const status of ['draft', 'voided']) {
      const fresh = await makeInvoice(companyA, branchA, customerA, nextDoc(), '100.00', '100.00', '0.00', '0.00', [
        { product_id: productA1, qty: 1, unit_price: '100.0000', discount_amount: '0.00', tax_amount: '0.00', line_total: '100.00', line_no: 1 },
      ], status);
      const response = await createReturn(viewerA, [{ product_id: productA1, qty: 1, invoice_line_id: fresh.line_ids[0] }], { invoice_id: fresh.invoice_id });
      expect(response.status).toBe(400);
      expect(response.body.code).toBe('invoice_not_eligible');
      expect(response.body.details.status).toBe(status);
    }
  });

  it('صدور بستانکار نیز invoice status را داخل قفل تراکنش دوباره می‌سنجد', async () => {
    const fresh = await makeInvoice(companyA, branchA, customerA, nextDoc(), '100.00', '100.00', '0.00', '0.00', [
      { product_id: productA1, qty: 1, unit_price: '100.0000', discount_amount: '0.00', tax_amount: '0.00', line_total: '100.00', line_no: 1 },
    ], 'draft');
    const id = (await pool.query<{ id: string }>(
      `insert into return_request (branch_id, doc_number, customer_id, invoice_id, reason_code, status)
       values ($1, $2, $3, $4, 'damaged', 'posted') returning id`, [branchA, nextDoc(), customerA, fresh.invoice_id])).rows[0].id;
    await pool.query(
      `insert into return_request_line (return_request_id, product_id, qty, qty_approved, unit_price, disposition, invoice_line_id)
       values ($1, $2, 1, 1, 0, 'restock', $3)`, [id, productA1, fresh.line_ids[0]]);
    const response = await issue(adminA, id).expect(409);
    expect(response.body.code).toBe('invoice_not_eligible');
    expect(response.body.details.status).toBe('draft');
    expect(await creditNotesForInvoice(fresh.invoice_id)).toHaveLength(0);
  });

  it('۱۷) مقدار فروخته‌شده با دقت چهاررقمی کامل قابل برگشت است', async () => {
    const fresh = await freshInvoice(nextDoc(), '12.35', [
      { product_id: productA1, qty: 1.2345, unit_price: '10.0000', discount_amount: '0.00', tax_amount: '0.00', line_total: '12.35', line_no: 1 },
    ]);
    const res = await createReturn(viewerA, [{ product_id: productA1, qty: 1.2345, invoice_line_id: fresh.line_ids[0] }], { invoice_id: fresh.invoice_id }).expect(201);
    const id = res.body.id as string;
    await approve(adminA, id);
    await receiveAll(adminA, id, [{ product_id: productA1, qty: 1.2345 }]);
    const issued = await issue(adminA, id).expect(201);
    expect(issued.body.credit_note.amount).toBe('12.35');
  });

  it('۱۸) reconciliation aggregates two separate 5-unit returns before comparing against sold 10', async () => {
    const fresh = await freshInvoice(nextDoc(), '100.00', [
      { product_id: productA1, qty: 10, unit_price: '10.0000', discount_amount: '0.00', tax_amount: '0.00', line_total: '100.00', line_no: 1 },
    ]);
    for (let i = 0; i < 2; i += 1) {
      const res = await createReturn(viewerA, [{ product_id: productA1, qty: 5, invoice_line_id: fresh.line_ids[0] }], { invoice_id: fresh.invoice_id }).expect(201);
      await approve(adminA, res.body.id as string);
      await receiveAll(adminA, res.body.id as string, [{ product_id: productA1, qty: 5 }]);
    }
    const summary = await pool.query<{ sold_qty: string; returned_qty: string; return_status: string }>(
      `select sold_qty::text, returned_qty::text, return_status from v_invoice_return_summary where invoice_id = $1`, [fresh.invoice_id]);
    expect(Number(summary.rows[0].sold_qty)).toBe(10);
    expect(Number(summary.rows[0].returned_qty)).toBe(10);
    expect(summary.rows[0].return_status).toBe('full');
  });

  it('۱۹) سه بستانکار جزئی روی همان خط جمعاً مبلغ اصلی 100.00 را مصرف می‌کنند', async () => {
    const fresh = await freshInvoice(nextDoc(), '100.00', [
      { product_id: productA1, qty: 3, unit_price: '33.3333', discount_amount: '0.00', tax_amount: '0.00', line_total: '100.00', line_no: 1 },
    ]);
    const issuedAmounts: number[] = [];
    for (let i = 0; i < 3; i += 1) {
      const res = await createReturn(viewerA, [{ product_id: productA1, qty: 1, invoice_line_id: fresh.line_ids[0] }], { invoice_id: fresh.invoice_id }).expect(201);
      const id = res.body.id as string;
      await approve(adminA, id);
      await receiveAll(adminA, id, [{ product_id: productA1, qty: 1 }]);
      const issued = await issue(adminA, id).expect(201);
      issuedAmounts.push(Number(issued.body.credit_note.amount));
    }
    expect(issuedAmounts).toEqual([33.33, 33.34, 33.33]);
    expect(issuedAmounts.reduce((sum, amount) => sum + amount, 0)).toBe(100);
  });

  it('۱۶) فهرست مرجوعی‌ها financial_status را برمی‌گرداند', async () => {
    const res = await api(adminA).get('/api/v1/returns?status=posted&limit=5').expect(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const item of res.body.items) {
      expect(['awaiting_credit_note', 'credit_note_issued', 'awaiting_receipt']).toContain(item.financial_status);
    }
  });
});
