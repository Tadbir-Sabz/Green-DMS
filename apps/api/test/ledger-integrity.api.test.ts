import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';
import type { AuditService } from '../src/common/audit.service';
import { AuditService as RealAuditService } from '../src/common/audit.service';
import { postStockMovement } from '../src/modules/inventory/ledger/stock-ledger';
import type { StockMovement } from '../src/modules/inventory/ledger/stock-movement';
import { LedgerReconciliationRepository } from '../src/modules/inventory/ledger/ledger-reconciliation.repository';
import { LedgerReconciliationService } from '../src/modules/inventory/ledger/ledger-reconciliation.service';

/**
 * S8 — یکپارچگی دفتر موجودی روی پایگاه‌داده‌ی واقعی (دیتابیس موقت جداگانه).
 *
 *  ۱) ممیزی: هر حرکت یک سطر ممیزی هم‌تراکنش با همان حرکت می‌سازد (بدون تکرار).
 *  ۲) شکست ممیزی ⇒ rollback کامل حرکت و مانده.
 *  ۳) حفاظت دفتر: dms_app نمی‌تواند inventory_txn را UPDATE/DELETE/TRUNCATE کند؛
 *     مالک هم بدون پنجرهٔ نگه‌داشت نمی‌تواند.
 *  ۴) ثبت مجاز با dms_app (درج + ممیزی) کار می‌کند.
 *  ۵) جداسازی مستاجر: RLS مانع درج/خواندنِ شرکتِ دیگر می‌شود و گزارش تطبیق محدوده را رعایت می‌کند.
 *  ۶) تطبیق فقط‌خواندنی: مغایرت‌های ساختگی را طبقه‌بندی می‌کند و داده را تغییر نمی‌دهد.
 *
 * هویتِ نقشِ زمانِ اجرا: هر بررسیِ dms_app در یک تراکنش با `SET LOCAL ROLE dms_app` اجرا
 * می‌شود و پیش از هر ادعا `current_user` و `rolbypassrls=false` بررسی می‌شوند. این روش
 * روی PostgreSQL واقعی و روی PGlite آزمون کار می‌کند. دلیلِ عدم استفاده از اتصالِ LOGIN:
 * سرورِ PGlite محلی همهٔ اتصال‌ها را به‌صورتِ postgres (BYPASSRLS) اجرا می‌کند و
 * هویتِ اتصال را نگه نمی‌دارد؛ اتکا به آن، آزمونِ RLS را بی‌معنا می‌کرد.
 * بنابراین به‌جای تغییرِ رمزِ نقش، فقط SET LOCAL ROLE به‌کار می‌رود (نقش cluster-wide دست‌نخورده).
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const TEST_DB = 'greendms_ledger_integrity_test';
const PSQL = process.env.PSQL ?? 'psql';
const RUNTIME_ROLE = 'dms_app';

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
let ownerPool: pg.Pool; // اتصال مالک به دیتابیس آزمون (fixture و بررسی)
let audit: AuditService;
let reconcile: LedgerReconciliationService;

interface Fixture {
  companyId: string;
  branchId: string;
  productId: string;
  warehouseId: string;
}

let L: Fixture; // شرکت ledger: ممیزی، حفاظت، ثبت مجاز
let B: Fixture; // شرکت دیگر: جداسازی مستاجر
let R: Fixture; // شرکت تطبیق: مغایرت‌های ساختگی
let R2: { warehouseId: string; productId: string }; // انبار دوم شرکت R (بدون دفتر)
let R3: { warehouseId: string; productId: string }; // انبار سوم شرکت R (دفتر با نوع ثبت‌نشده)

const ACTOR = '0a3c1b2e-1111-4a44-8e55-000000000001';
const REQUEST_ID = 'req-s8-ledger-0001';

const movement = (f: Fixture, over: Partial<StockMovement> = {}): StockMovement => ({
  companyId: f.companyId,
  branchId: f.branchId,
  warehouseId: f.warehouseId,
  productId: f.productId,
  batchId: null,
  txnKind: 'purchase_in',
  qty: 5,
  unitCost: 10,
  sourceType: 'goods_receipt',
  sourceId: crypto.randomUUID(),
  sourceLineId: null,
  actor: { actorUserId: ACTOR, requestId: REQUEST_ID, ip: '10.0.0.1', userAgent: 'vitest' },
  ...over,
});

/**
 * اجرای دستورها با هویت dms_app در یک تراکنش. پیش از اجرا هویت و بای‌پس‌نبودنِ RLS را
 * اثبات می‌کند؛ اگر هویت درست نباشد، آزمون شکست می‌خورد (نه اینکه بی‌صدا عبور کند).
 * زمینهٔ مستاجر تراکنش‌محلی است (set_config(..., true)).
 */
async function asRuntimeRole<T>(
  companyId: string,
  fn: (c: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const c = await ownerPool.connect();
  try {
    await c.query('begin');
    await c.query(`set local role ${RUNTIME_ROLE}`);
    const who = await c.query<{ u: string; bypass: boolean }>(
      `select current_user as u, (select rolbypassrls from pg_roles where rolname = current_user) as bypass`,
    );
    if (who.rows[0].u !== RUNTIME_ROLE || who.rows[0].bypass) {
      throw new Error(`هویت آزمون نادرست است: ${who.rows[0].u} (bypass=${who.rows[0].bypass})`);
    }
    await c.query(`select set_config('app.company_id', $1, true)`, [companyId]);
    const out = await fn(c);
    await c.query('commit');
    return out;
  } catch (err) {
    await c.query('rollback').catch(() => undefined);
    throw err;
  } finally {
    c.release();
  }
}

/** اجرای یک دستور با dms_app و برگرداندن خطای آن (تراکنش همیشه rollback می‌شود). */
async function attemptAsRuntimeRole(
  companyId: string,
  sql: string,
  params: unknown[] = [],
): Promise<{ code?: string; message: string } | null> {
  const c = await ownerPool.connect();
  try {
    await c.query('begin');
    await c.query(`set local role ${RUNTIME_ROLE}`);
    await c.query(`select set_config('app.company_id', $1, true)`, [companyId]);
    try {
      await c.query(sql, params);
      return null;
    } catch (e) {
      const err = e as { code?: string; message: string };
      return { code: err.code, message: err.message };
    }
  } finally {
    await c.query('rollback').catch(() => undefined);
    c.release();
  }
}

/** ثبت حرکت با تراکنش روی یک کلاینت مشخص (مالک). */
async function postIn(client: pg.PoolClient | pg.Client, m: StockMovement) {
  await client.query('begin');
  try {
    const posted = await postStockMovement(client as unknown as pg.PoolClient, audit, m);
    await client.query('commit');
    return posted;
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    throw err;
  }
}

async function makeFixture(name: string, code: string): Promise<Fixture> {
  const company = await ownerPool.query<{ id: string }>(
    `insert into company (code, legal_name) values ($1, $2) returning id`,
    [code, `شرکت ${name}`],
  );
  const companyId = company.rows[0].id;
  const branch = await ownerPool.query<{ id: string }>(
    `insert into branch (company_id, code, name) values ($1, 'MAIN', 'شعبه') returning id`,
    [companyId],
  );
  const branchId = branch.rows[0].id;
  const category = await ownerPool.query<{ id: string }>(
    `insert into product_category (company_id, code, name) values ($1, 'CAT', 'دسته') returning id`,
    [companyId],
  );
  const product = await ownerPool.query<{ id: string }>(
    `insert into product (company_id, code, name, category_id, base_uom_id)
     values ($1, 'P-1', 'کالا', $2, (select id from uom where code = 'pcs')) returning id`,
    [companyId, category.rows[0].id],
  );
  const wh = await ownerPool.query<{ id: string }>(
    `insert into warehouse (branch_id, code, name, kind) values ($1, 'WH1', 'انبار', 'main') returning id`,
    [branchId],
  );
  return { companyId, branchId, productId: product.rows[0].id, warehouseId: wh.rows[0].id };
}

async function addWarehouse(f: Fixture, code: string): Promise<string> {
  const wh = await ownerPool.query<{ id: string }>(
    `insert into warehouse (branch_id, code, name, kind) values ($1, $2, $2, 'main') returning id`,
    [f.branchId, code],
  );
  return wh.rows[0].id;
}

/** اثر انگشت وضعیت داده‌ها برای اثبات «گزارش داده را تغییر نمی‌دهد». */
async function dataFingerprint(): Promise<string> {
  const { rows } = await ownerPool.query<{ fp: string }>(`
    select md5(concat(
      (select count(*)::text from inventory_txn), '|',
      (select coalesce(sum(qty),0)::text from inventory_txn), '|',
      (select coalesce(md5(string_agg(warehouse_id||':'||product_id||':'||qty_on_hand||':'||qty_reserved,
                                      '|' order by warehouse_id, product_id)),'') from stock_balance), '|',
      (select count(*)::text from audit_log), '|',
      (select count(*)::text from stock_reservation)
    )) as fp`);
  return rows[0].fp;
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

  ownerPool = new pg.Pool({ connectionString: testUrl.toString(), max: 2 });
  audit = new RealAuditService(ownerPool);
  reconcile = new LedgerReconciliationService(new LedgerReconciliationRepository(ownerPool));

  L = await makeFixture('لجر', 'LDG');
  B = await makeFixture('مستاجر B', 'TNB');
  R = await makeFixture('تطبیق', 'REC');
  R2 = { warehouseId: await addWarehouse(R, 'WH2'), productId: R.productId };
  R3 = { warehouseId: await addWarehouse(R, 'WH3'), productId: R.productId };
}, 180_000);

afterAll(async () => {
  await ownerPool?.end();
  if (adminPool) {
    await adminPool.query(
      'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
      [TEST_DB],
    );
    await adminPool.query(`drop database if exists "${TEST_DB}"`);
    await adminPool.end();
  }
}, 180_000);

describe('S8 ۱: ممیزی هم‌تراکنش حرکت موجودی', () => {
  it('هر حرکت دقیقاً یک سطر ممیزی با هویت، مانده‌ها و request id می‌سازد', async () => {
    const client = await ownerPool.connect();
    try {
      await postIn(client, movement(L, { txnKind: 'purchase_in', qty: 10 }));
      const posted = await postIn(
        client,
        movement(L, { txnKind: 'adjust_out', qty: -2, sourceType: 'stock_adjustment', warehouseId: L.warehouseId }),
      );

      const rows = await ownerPool.query<{
        company_id: string;
        action: string;
        entity_type: string;
        request_id: string;
        actor_user_id: string;
        before_data: Record<string, string>;
        after_data: Record<string, string>;
      }>(
        `select company_id, action, entity_type, request_id, actor_user_id, before_data, after_data
           from audit_log
          where entity_type = 'inventory_txn' and after_data->>'inventory_txn_id' = $1`,
        [posted.txnId],
      );

      expect(rows.rowCount).toBe(1); // بدون ممیزی تکراری
      const a = rows.rows[0];
      expect(a.company_id).toBe(L.companyId);
      expect(a.action).toBe('create');
      expect(a.request_id).toBe(REQUEST_ID);
      expect(a.actor_user_id).toBe(ACTOR);
      expect(a.after_data).toMatchObject({
        domain: 'inventory',
        company_id: L.companyId,
        warehouse_id: L.warehouseId,
        product_id: L.productId,
        txn_kind: 'adjust_out',
        direction: 'out',
        qty: '-2',
        source_type: 'stock_adjustment',
      });
      expect(a.before_data.qty_on_hand).toBe(posted.beforeQty);
      expect(a.after_data.qty_on_hand).toBe(posted.afterQty);
      expect(Number(a.after_data.qty_on_hand)).toBe(Number(a.before_data.qty_on_hand) - 2);
    } finally {
      client.release();
    }
  });
});

describe('S8 ۲: شکست ممیزی حرکت را rollback می‌کند', () => {
  it('اگر ممیزی شکست بخورد، نه سطر دفتر و نه تغییر مانده commit نمی‌شود', async () => {
    const before = await ownerPool.query<{ n: string; q: string }>(
      `select (select count(*)::text from inventory_txn where warehouse_id = $1 and product_id = $2) as n,
              (select qty_on_hand::text from stock_balance where warehouse_id = $1 and product_id = $2) as q`,
      [L.warehouseId, L.productId],
    );
    const auditBefore = await ownerPool.query<{ n: string }>(
      `select count(*)::text as n from audit_log where entity_type = 'inventory_txn'`,
    );

    const failingAudit = {
      recordRequired: async () => {
        throw new Error('simulated audit failure');
      },
    } as unknown as AuditService;

    const client = await ownerPool.connect();
    try {
      await client.query('begin');
      await expect(
        postStockMovement(
          client,
          failingAudit,
          movement(L, { warehouseId: L.warehouseId, qty: 7, txnKind: 'purchase_in' }),
        ),
      ).rejects.toThrow('simulated audit failure');
      await client.query('rollback');
    } finally {
      client.release();
    }

    const after = await ownerPool.query<{ n: string; q: string }>(
      `select (select count(*)::text from inventory_txn where warehouse_id = $1 and product_id = $2) as n,
              (select qty_on_hand::text from stock_balance where warehouse_id = $1 and product_id = $2) as q`,
      [L.warehouseId, L.productId],
    );
    const auditAfter = await ownerPool.query<{ n: string }>(
      `select count(*)::text as n from audit_log where entity_type = 'inventory_txn'`,
    );

    expect(after.rows[0]).toEqual(before.rows[0]);
    expect(auditAfter.rows[0].n).toBe(auditBefore.rows[0].n);
  });
});

describe('S8 ۳: حفاظت دفتر inventory_txn', () => {
  let txnId: string;

  beforeAll(async () => {
    const client = await ownerPool.connect();
    try {
      txnId = (await postIn(client, movement(L, { warehouseId: L.warehouseId, qty: 4 }))).txnId;
    } finally {
      client.release();
    }
  });

  it('dms_app نمی‌تواند سطر دفتر را UPDATE کند (محدودیت privilege، نه تریگر)', async () => {
    const err = await attemptAsRuntimeRole(L.companyId, `update inventory_txn set qty = qty where id = $1`, [txnId]);
    expect(err?.code).toBe('42501');
    expect(err?.message).toMatch(/permission denied for table inventory_txn/);
  });

  it('dms_app نمی‌تواند سطر دفتر را DELETE کند (محدودیت privilege، نه تریگر)', async () => {
    const err = await attemptAsRuntimeRole(L.companyId, `delete from inventory_txn where id = $1`, [txnId]);
    expect(err?.code).toBe('42501');
    expect(err?.message).toMatch(/permission denied for table inventory_txn/);
  });

  it('dms_app نمی‌تواند inventory_txn را TRUNCATE کند', async () => {
    const err = await attemptAsRuntimeRole(L.companyId, `truncate inventory_txn`);
    expect(err?.code).toBe('42501');
    expect(err?.message).toMatch(/permission denied for table inventory_txn/);
  });

  it('مالک هم بدون پنجرهٔ نگه‌داشت نمی‌تواند سطر دفتر را به‌روزرسانی کند (تریگر)', async () => {
    await expect(ownerPool.query(`update inventory_txn set qty = qty where id = $1`, [txnId])).rejects.toThrow(
      /inventory_txn/,
    );
  });

  it('سطر دفتر پس از تلاش‌های ناموفق دست‌نخورده است', async () => {
    const { rows } = await ownerPool.query<{ qty: string }>(`select qty::text from inventory_txn where id = $1`, [txnId]);
    expect(rows[0].qty).toBe('4.0000');
  });
});

describe('S8 ۴: ثبت مجاز با نقش زمان‌اجرا', () => {
  it('dms_app می‌تواند حرکت مجاز ثبت کند و دقیقاً یک ممیزی هم‌تراکنش بنویسد', async () => {
    const result = await asRuntimeRole(L.companyId, async (c) => {
      const posted = await postStockMovement(
        c as unknown as pg.PoolClient,
        audit,
        movement(L, { warehouseId: L.warehouseId, qty: 3, txnKind: 'purchase_in' }),
      );
      const n = await c.query<{ n: string }>(
        `select count(*)::text as n from audit_log
          where entity_type = 'inventory_txn' and after_data->>'inventory_txn_id' = $1`,
        [posted.txnId],
      );
      return { txnId: posted.txnId, auditRows: n.rows[0].n };
    });
    expect(result.txnId).toMatch(/^\d+$/);
    expect(result.auditRows).toBe('1');
  });
});

describe('S8 ۵: جداسازی مستاجر', () => {
  it('dms_app با زمینهٔ شرکت B نمی‌تواند حرکت را در انبار شرکت R ثبت کند (RLS)', async () => {
    const err = await attemptAsRuntimeRole(
      B.companyId,
      `insert into inventory_txn (branch_id, warehouse_id, product_id, txn_kind, qty, unit_cost, source_type, source_id)
       values ($1, $2, $3, 'purchase_in', 1, 0, 'goods_receipt', $4)`,
      [R.branchId, R.warehouseId, R.productId, crypto.randomUUID()],
    );
    expect(err).not.toBeNull();
    expect(err?.code).toBe('42501'); // نقض سیاست RLS (WITH CHECK)
  });

  it('dms_app با زمینهٔ شرکت B سطر دفتر شرکت L را نمی‌بیند؛ با زمینهٔ L می‌بیند (کنترل مثبت)', async () => {
    const seenByB = await asRuntimeRole(B.companyId, async (c) =>
      (await c.query<{ n: string }>(`select count(*)::text as n from inventory_txn where warehouse_id = $1`, [L.warehouseId])).rows[0].n,
    );
    const seenByL = await asRuntimeRole(L.companyId, async (c) =>
      (await c.query<{ n: string }>(`select count(*)::text as n from inventory_txn where warehouse_id = $1`, [L.warehouseId])).rows[0].n,
    );
    expect(seenByB).toBe('0');
    expect(Number(seenByL)).toBeGreaterThan(0);
  });

  it('گزارش تطبیق شرکت B هیچ کلیدی از شرکت R را برنمی‌گرداند', async () => {
    const report = await reconcile.reconcile(B.companyId);
    expect(report.company_id).toBe(B.companyId);
    expect(report.findings.every((f) => f.company_id === B.companyId)).toBe(true);
    expect(report.findings.some((f) => f.warehouse_id === R.warehouseId)).toBe(false);
  });

  it('انبار شرکت دیگر در فیلتر تطبیق، کلید بررسی‌شده تولید نمی‌کند', async () => {
    const report = await reconcile.reconcile(B.companyId, { warehouseId: R.warehouseId });
    expect(report.checked_keys).toBe(0);
    expect(report.finding_count).toBe(0);
  });
});

describe('S8 ۶: تطبیق فقط‌خواندنی مانده با دفتر و رزرو', () => {
  // کلیدها در شرکت R:
  //  - R.warehouse / R.product: ثبت درست ۵ واحد، سپس مانده دستکاری‌شده به ۸ (مغایرت دفتر، critical)
  //    و qty_reserved=2 بدون رزرو فعال (missing_reservation_functionality)
  //  - R2: مانده ۴ بدون هیچ سابقهٔ دفتری (historical_data_limitation)
  //  - R3: دفتر با نوع sale_out (ثبت‌نشده) و مانده‌ای نیست (unsupported_movement_type)
  beforeAll(async () => {
    const client = await ownerPool.connect();
    try {
      await postIn(client, movement(R, { warehouseId: R.warehouseId, qty: 5 }));
    } finally {
      client.release();
    }
    await ownerPool.query(
      `update stock_balance set qty_on_hand = 8, qty_reserved = 2
        where warehouse_id = $1 and product_id = $2`,
      [R.warehouseId, R.productId],
    );
    await ownerPool.query(
      `insert into stock_balance (warehouse_id, product_id, qty_on_hand) values ($1, $2, 4)`,
      [R2.warehouseId, R2.productId],
    );
    await ownerPool.query(
      `insert into inventory_txn (branch_id, warehouse_id, product_id, txn_kind, qty, source_type, source_id)
       values ($1, $2, $3, 'sale_out', -1, 'invoice', $4)`,
      [R.branchId, R3.warehouseId, R3.productId, crypto.randomUUID()],
    );
  });

  it('مغایرت‌ها را با طبقه‌بندی و شدت درست گزارش می‌کند', async () => {
    const report = await reconcile.reconcile(R.companyId);
    expect(report.checked_keys).toBe(3);
    expect(report.finding_count).toBe(4);

    const byKey = (wh: string, metric: string) =>
      report.findings.find((f) => f.warehouse_id === wh && f.metric === metric);

    const onHand = byKey(R.warehouseId, 'qty_on_hand');
    expect(onHand).toMatchObject({
      classification: 'ledger_discrepancy',
      severity: 'critical',
      ledger_qty: 5,
      recorded_balance: 8,
      difference: 3,
      reference_source: 'inventory_txn',
    });

    expect(byKey(R.warehouseId, 'qty_reserved')).toMatchObject({
      classification: 'missing_reservation_functionality',
      severity: 'medium',
      difference: 2,
      reference_source: 'stock_reservation',
    });

    expect(byKey(R2.warehouseId, 'qty_on_hand')).toMatchObject({
      classification: 'historical_data_limitation',
      severity: 'medium',
      ledger_qty: 0,
      recorded_balance: 4,
      difference: 4,
    });

    expect(byKey(R3.warehouseId, 'qty_on_hand')).toMatchObject({
      classification: 'unsupported_movement_type',
      severity: 'high',
      ledger_qty: -1,
      recorded_balance: 0,
      difference: 1,
    });
  });

  it('خلاصه و ترتیب گزارش قطعی و درست‌اند', async () => {
    const report = await reconcile.reconcile(R.companyId);
    expect(report.summary.byClassification).toEqual({
      ledger_discrepancy: 1,
      missing_reservation_functionality: 1,
      historical_data_limitation: 1,
      unsupported_movement_type: 1,
    });
    expect(report.summary.bySeverity).toEqual({ critical: 1, high: 1, medium: 2, low: 0 });
    expect(report.findings[0].severity).toBe('critical');
    expect(report.mode).toBe('read_only');
    expect(report.domain).toBe('inventory');
  });

  it('فیلتر انبار فقط همان انبار را گزارش می‌کند', async () => {
    const report = await reconcile.reconcile(R.companyId, { warehouseId: R2.warehouseId });
    expect(report.checked_keys).toBe(1);
    expect(report.findings.map((f) => f.warehouse_id)).toEqual([R2.warehouseId]);
  });

  it('تطبیق هیچ داده‌ای را تغییر نمی‌دهد و مغایرت را اصلاح نمی‌کند', async () => {
    const fpBefore = await dataFingerprint();
    const balanceBefore = await ownerPool.query<{ q: string }>(
      `select qty_on_hand::text as q from stock_balance where warehouse_id = $1 and product_id = $2`,
      [R.warehouseId, R.productId],
    );

    await reconcile.reconcile(R.companyId);
    await reconcile.reconcile(R.companyId, { warehouseId: R.warehouseId });

    expect(await dataFingerprint()).toBe(fpBefore);
    expect(balanceBefore.rows[0].q).toBe('8.0000'); // بدون اصلاح خودکار
  });
});
