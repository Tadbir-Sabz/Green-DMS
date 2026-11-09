import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupProductMasterFixture, createProduct, type Fixture } from './product-master-fixture';

/**
 * TASK-PM-01D-M2 — native PostgreSQL import reliability evidence.
 *
 * This file uses the same disposable per-file database fixture as the rest of
 * the Product Master DB-backed family. It does not mock PostgreSQL: advisory
 * locks, unique constraints, RLS, runtime role grants, transaction rollback,
 * product_catalog_history triggers and real HTTP commits are exercised.
 */
let fx: Fixture;

beforeAll(async () => {
  fx = await setupProductMasterFixture('greendms_pm_import_reliability');
}, 180_000);

afterAll(async () => {
  await fx?.teardown();
});

const HEADER = 'code,name,category_code,base_uom_code';
const csv = (rows: string[], header = HEADER): string => [header, ...rows].join('\n');
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const idemHash = (mode: string, key: string, text: string): string =>
  createHash('sha256').update(`${mode}\u0000${key}\u0000${text}`).digest('hex');

interface ImportBody {
  import_id: string;
  total_rows: number;
  created_rows: number;
  updated_rows: number;
  failed_rows: number;
  idempotent_replay: boolean;
  status: string;
  transaction_outcome: string;
  failure_category: string;
  retryable: boolean;
  batches: Array<{
    batch_no: number;
    status: string;
    transaction_outcome: string;
    failure_category: string;
    retryable: boolean;
    reason_code?: string;
    attempts: number;
    created_rows: number;
    updated_rows: number;
    failed_rows: number;
  }>;
  errors: Array<{ row: number; code: string; message_fa: string; batch_no?: number; product_code?: string }>;
  report: Array<{ row: number; code: string; status?: string }>;
}

const postCommit = async (payload: Record<string, unknown>, token?: string) => {
  const res = await fx.api(token).post('/api/v1/products/import/commit').send(payload).expect(200);
  return res.body as ImportBody;
};

describe('concurrency and idempotency (native PostgreSQL)', () => {
  it('serializes same-key duplicate submissions and replays the committed report', async () => {
    const { rows } = await fx.pool.query<{ key: string }>(
      'select hashtextextended($1, 0)::text as key',
      [`catalog:${fx.companyId}`],
    );
    const lockClient = await fx.pool.connect();
    await lockClient.query('begin');
    await lockClient.query('select pg_advisory_xact_lock($1::bigint)', [rows[0].key]);

    const payload = {
      csv: csv(['CONC-SAME,کالای همزمان,PMCAT,pm_piece']),
      mode: 'create',
      idempotency_key: 'concurrent-same-key',
    };
    const first = fx.api().post('/api/v1/products/import/commit').send(payload);
    await wait(200);
    const second = fx.api().post('/api/v1/products/import/commit').send(payload);
    await wait(100);
    await lockClient.query('rollback');
    lockClient.release();

    const [firstRes, secondRes] = await Promise.all([first, second]);
    expect(firstRes.status).toBe(200);
    expect(secondRes.status).toBe(200);
    const firstBody = firstRes.body as ImportBody;
    const secondBody = secondRes.body as ImportBody;
    expect([firstBody.idempotent_replay, secondBody.idempotent_replay].sort()).toEqual([false, true]);
    expect(firstBody.import_id).toBe(secondBody.import_id);
    const products = await fx.pool.query<{ n: number }>(
      `select count(*)::int as n from product where company_id = $1 and code = 'CONC-SAME'`,
      [fx.companyId],
    );
    expect(products.rows[0].n).toBe(1);
    const imports = await fx.pool.query<{ n: number }>(
      `select count(*)::int as n from product_import where company_id = $1 and idempotency_key = $2`,
      [fx.companyId, idemHash('create', 'concurrent-same-key', payload.csv)],
    );
    expect(imports.rows[0].n).toBe(1);
  });

  it('detects conflicting create imports targeting the same product code', async () => {
    const body = csv(['RACE-CODE,کالای رقابتی,PMCAT,pm_piece']);
    const [a, b] = await Promise.all([
      postCommit({ csv: body, mode: 'create', idempotency_key: 'race-a' }),
      postCommit({ csv: body, mode: 'create', idempotency_key: 'race-b' }),
    ]);
    const results = [a, b];
    expect(results.filter((r) => r.created_rows === 1)).toHaveLength(1);
    const failed = results.find((r) => r.failed_rows === 1);
    expect(failed).toBeDefined();
    expect(failed?.errors.some((e) => e.code === 'duplicate_code')).toBe(true);
    expect(failed?.transaction_outcome).toBe('rolled_back');
    expect(failed?.batches[0]?.status).toBe('rolled_back');
    const products = await fx.pool.query<{ n: number }>(
      `select count(*)::int as n from product where company_id = $1 and code = 'RACE-CODE'`,
      [fx.companyId],
    );
    expect(products.rows[0].n).toBe(1);
  });

  it('serializes concurrent updates and keeps product history consistent', async () => {
    const target = await createProduct(fx, { code: 'UPD-RACE', name: 'نام اول' });
    const [a, b] = await Promise.all([
      postCommit({
        csv: csv(['UPD-RACE,نام دوم,PMCAT,pm_piece']),
        mode: 'update',
        idempotency_key: 'update-race-a',
      }),
      postCommit({
        csv: csv(['UPD-RACE,نام سوم,PMCAT,pm_piece']),
        mode: 'update',
        idempotency_key: 'update-race-b',
      }),
    ]);
    expect(a.updated_rows).toBe(1);
    expect(b.updated_rows).toBe(1);
    const saved = await fx.pool.query<{ name: string }>(
      'select name from product where company_id = $1 and code = $2',
      [fx.companyId, 'UPD-RACE'],
    );
    expect(['نام دوم', 'نام سوم']).toContain(saved.rows[0].name);
    const history = await fx.pool.query<{ n: number }>(
      `select count(*)::int as n from product_catalog_history
        where company_id = $1 and entity_type = 'product' and product_id = $2 and action = 'UPDATE'`,
      [fx.companyId, target.id],
    );
    expect(history.rows[0].n).toBe(2);
  });

  it('replays a terminal unknown outcome without replaying product writes', async () => {
    const text = csv(['UNSAFE-REPLAY,کالای پخش نشده,PMCAT,pm_piece']);
    const key = 'terminal-unknown-replay';
    const hash = idemHash('create', key, text);
    const inserted = await fx.pool.query<{ id: string }>(
      `insert into product_import
         (company_id, idempotency_key, mode, total_rows, created_rows, updated_rows,
          failed_rows, report, created_by, status, failure_category, retryable,
          transaction_outcome, last_batch_no, attempts)
       values ($1, $2, 'create', 1, 0, 0, 1, '[]'::jsonb, null,
               'failed', 'infrastructure', false, 'unknown', 1, 1)
       returning id`,
      [fx.companyId, hash],
    );
    const importId = inserted.rows[0].id;
    await fx.pool.query(
      `insert into product_import_batch
         (company_id, import_id, batch_no, status, transaction_outcome,
          failure_category, retryable, reason_code, total_rows, created_rows,
          updated_rows, failed_rows, report, attempts)
       values ($1, $2, 1, 'failed', 'unknown', 'infrastructure', false,
               'infrastructure_error', 1, 0, 0, 1, $3::jsonb, 1)`,
      [fx.companyId, importId, JSON.stringify([{
        row: 2,
        code: 'infrastructure_error',
        message_fa: 'نتیجهٔ تراکنش نامشخص است.',
        status: 'failed',
        failure_category: 'infrastructure',
        retryable: false,
        transaction_outcome: 'unknown',
        batch_no: 1,
        import_id: importId,
      }])],
    );

    const result = await postCommit({ csv: text, mode: 'create', idempotency_key: key });
    expect(result.import_id).toBe(importId);
    expect(result.idempotent_replay).toBe(true);
    expect(result.status).toBe('failed');
    expect(result.transaction_outcome).toBe('unknown');
    expect(result.retryable).toBe(false);
    expect(result.batches[0]?.status).toBe('failed');
    const products = await fx.pool.query<{ n: number }>(
      `select count(*)::int as n from product where company_id = $1 and code = 'UNSAFE-REPLAY'`,
      [fx.companyId],
    );
    expect(products.rows[0].n).toBe(0);
  });
});

describe('per-batch atomicity, rollback and retry (native PostgreSQL)', () => {
  it('rolls back one failed batch, continues later batches and leaves no partial history', async () => {
    const target = await createProduct(fx, { code: 'PF-TARGET', name: 'نام قدیم' });
    const holder = await createProduct(fx, { code: 'PF-HOLDER' });
    await fx.api().post(`/api/v1/products/${holder.id}/barcodes`)
      .send({ barcode: 'PF-BC-CONFLICT', kind: 'other' }).expect(201);

    const rows: string[] = [];
    for (let i = 1; i <= 100; i += 1) rows.push(`PF-${i},کالای ${i},,PMCAT,pm_piece`);
    rows.push(`${target.code},نام جدید,PF-BC-CONFLICT,PMCAT,pm_piece`);
    for (let i = 102; i <= 200; i += 1) rows.push(`PF-${i},کالای ${i},,PMCAT,pm_piece`);
    rows.push('PF-201,کالای دسته سوم,,PMCAT,pm_piece');
    const header = 'code,name,barcode,category_code,base_uom_code';
    const result = await postCommit({
      csv: csv(rows, header),
      mode: 'upsert',
      idempotency_key: 'partial-mid-file-failure',
    });

    expect(result.total_rows).toBe(201);
    expect(result.created_rows).toBe(101);
    expect(result.updated_rows).toBe(0);
    expect(result.failed_rows).toBe(100);
    expect(result.transaction_outcome).toBe('partial');
    expect(result.failure_category).toBe('business');
    expect(result.batches.map((b) => b.status)).toEqual(['committed', 'rolled_back', 'committed']);
    expect(result.errors.some((e) => e.code === 'duplicate_barcode')).toBe(true);
    expect(result.errors.every((e) => e.batch_no != null)).toBe(true);

    const saved = await fx.pool.query<{ name: string }>(
      'select name from product where company_id = $1 and code = $2',
      [fx.companyId, target.code],
    );
    expect(saved.rows[0].name).toBe('نام قدیم');
    const counts = await fx.pool.query<{ batch2: number; batch3: number; target: number }>(
      `select
         count(*) filter (where code = 'PF-102')::int as batch2,
         count(*) filter (where code = 'PF-201')::int as batch3,
         count(*) filter (where code = 'PF-TARGET')::int as target
       from product where company_id = $1`,
      [fx.companyId],
    );
    expect(counts.rows[0]).toEqual({ batch2: 0, batch3: 1, target: 1 });
    const history = await fx.pool.query<{
      rolled_back_row: number; committed_row: number; target_update: number;
    }>(
      `select
         count(*) filter (where after_data->>'code' = 'PF-102')::int as rolled_back_row,
         count(*) filter (where after_data->>'code' = 'PF-201')::int as committed_row,
         count(*) filter (where action = 'UPDATE' and before_data->>'code' = 'PF-TARGET')::int as target_update
       from product_catalog_history where company_id = $1 and entity_type = 'product'`,
      [fx.companyId],
    );
    expect(history.rows[0]).toEqual({ rolled_back_row: 0, committed_row: 1, target_update: 0 });
    const barcodes = await fx.pool.query<{ n: number }>(
      'select count(*)::int as n from product_barcode where barcode = $1',
      ['PF-BC-CONFLICT'],
    );
    expect(barcodes.rows[0].n).toBe(1);
  });

  it('retries a real PostgreSQL serialization conflict without duplicating success', async () => {
    await fx.pool.query('create sequence if not exists pm_import_conflict_seq');
    await fx.pool.query(`
      create or replace function pm_import_conflict_trigger() returns trigger
      language plpgsql as $$
      begin
        if NEW.code = 'RETRY-1' and nextval('pm_import_conflict_seq') = 1 then
          raise exception 'injected serialization failure' using errcode = '40001';
        end if;
        return NEW;
      end $$`);
    await fx.pool.query(`
      create trigger pm_import_conflict
      before insert on product for each row
      execute function pm_import_conflict_trigger()`);
    try {
      const result = await postCommit({
        csv: csv(['RETRY-1,کالای تلاش مجدد,PMCAT,pm_piece']),
        mode: 'create',
        idempotency_key: 'serialization-retry',
      });
      expect(result.created_rows).toBe(1);
      expect(result.failed_rows).toBe(0);
      expect(result.status).toBe('completed');
      expect(result.batches[0]?.attempts).toBe(2);
      expect(result.batches[0]?.status).toBe('committed');
      const products = await fx.pool.query<{ n: number }>(
        `select count(*)::int as n from product where company_id = $1 and code = 'RETRY-1'`,
        [fx.companyId],
      );
      expect(products.rows[0].n).toBe(1);
      const history = await fx.pool.query<{ n: number }>(
        `select count(*)::int as n from product_catalog_history
          where company_id = $1 and entity_type = 'product' and after_data->>'code' = 'RETRY-1'`,
        [fx.companyId],
      );
      expect(history.rows[0].n).toBe(1);
    } finally {
      await fx.pool.query('drop trigger if exists pm_import_conflict on product');
      await fx.pool.query('drop function if exists pm_import_conflict_trigger()');
      await fx.pool.query('drop sequence if exists pm_import_conflict_seq');
    }
  });

  it('resumes an interrupted import without replaying already committed batches', async () => {
    const rows: string[] = [];
    for (let i = 1; i <= 100; i += 1) rows.push(`RESUME-${i},کالای ${i},PMCAT,pm_piece`);
    rows.push('RESUME-101,کالای ادامه,PMCAT,pm_piece');
    const text = csv(rows);
    const key = 'resume-interrupted';
    const hash = idemHash('create', key, text);

    await fx.pool.query(
      `insert into product (company_id, code, name, category_id, base_uom_id)
       select $1, 'RESUME-' || i, 'کالای ' || i, $2, $3
       from generate_series(1, 100) i`,
      [fx.companyId, fx.categoryId, fx.uomId],
    );
    const inserted = await fx.pool.query<{ id: string }>(
      `insert into product_import
         (company_id, idempotency_key, mode, total_rows, created_rows, updated_rows,
          failed_rows, report, created_by, status, failure_category, retryable,
          transaction_outcome, last_batch_no, attempts)
       values ($1, $2, 'create', 101, 100, 0, 0, '[]'::jsonb, null,
               'processing', 'none', false, 'partial', 1, 1)
       returning id`,
      [fx.companyId, hash],
    );
    const importId = inserted.rows[0].id;
    const report = rows.slice(0, 100).map((_, i) => ({
      row: i + 2,
      code: 'created',
      message_fa: 'کالا ایجاد شد.',
      status: 'created',
      product_code: `RESUME-${i + 1}`,
      failure_category: 'none',
      retryable: false,
      transaction_outcome: 'committed',
      batch_no: 1,
      import_id: importId,
    }));
    await fx.pool.query(
      `insert into product_import_batch
         (company_id, import_id, batch_no, status, transaction_outcome,
          failure_category, retryable, total_rows, created_rows, updated_rows,
          failed_rows, report, attempts)
       values ($1, $2, 1, 'committed', 'committed', 'none', false,
               100, 100, 0, 0, $3::jsonb, 1)`,
      [fx.companyId, importId, JSON.stringify(report)],
    );

    const result = await postCommit({ csv: text, mode: 'create', idempotency_key: key });
    expect(result.import_id).toBe(importId);
    expect(result.idempotent_replay).toBe(false);
    expect(result.created_rows).toBe(101);
    expect(result.failed_rows).toBe(0);
    expect(result.errors).toEqual([]);
    expect(result.batches.map((b) => b.status)).toEqual(['committed', 'committed']);
    expect(result.batches[0]?.attempts).toBe(1);
    const products = await fx.pool.query<{ first: number; last: number }>(
      `select
         count(*) filter (where code = 'RESUME-1')::int as first,
         count(*) filter (where code = 'RESUME-101')::int as last
       from product where company_id = $1`,
      [fx.companyId],
    );
    expect(products.rows[0]).toEqual({ first: 1, last: 1 });
  });
});

describe('tenant RLS and runtime DB-role permissions (native PostgreSQL)', () => {
  it('isolates reports across companies and keeps history immutable for dms_app', async () => {
    const created = await postCommit({
      csv: csv(['RLS-IMPORT,کالای RLS,PMCAT,pm_piece']),
      mode: 'create',
      idempotency_key: 'rls-import-report',
    });

    const hashResult = await fx.pool.query<{ password_hash: string }>(
      `select password_hash from app_user where username = 'pm_admin'`,
    );
    const otherCompany = await fx.pool.query<{ id: string }>(
      `insert into company (code, legal_name) values ('OTHERCO', 'شرکت دیگر') returning id`,
    );
    const otherCompanyId = otherCompany.rows[0].id;
    const person = await fx.pool.query<{ id: string }>(
      `insert into person (company_id, code, first_name, last_name)
       values ($1, 'OTH-ADM', 'مدیر', 'دیگر') returning id`,
      [otherCompanyId],
    );
    await fx.pool.query(
      `insert into app_user (person_id, username, password_hash, access_level)
       values ($1, 'pm_other_admin', $2, 'web')`,
      [person.rows[0].id, hashResult.rows[0].password_hash],
    );
    const role = await fx.pool.query<{ id: string }>(
      `insert into role (company_id, code, name) values ($1, 'pm_other_role', 'نقش دیگر') returning id`,
      [otherCompanyId],
    );
    await fx.pool.query(
      `insert into role_permission (role_id, permission_code)
       select $1, code from permission where code like 'master.product%'`,
      [role.rows[0].id],
    );
    await fx.pool.query(
      `insert into user_role (app_user_id, role_id)
       select u.id, $1 from app_user u where u.username = 'pm_other_admin'`,
      [role.rows[0].id],
    );
    const otherToken = await fx.loginAs('pm_other_admin', fx.adminPassword);

    await fx.api().get(`/api/v1/products/import/report/${created.import_id}`).expect(200);
    await fx.api(otherToken).get(`/api/v1/products/import/report/${created.import_id}`).expect(404);

    const client = await fx.pool.connect();
    try {
      await client.query('begin');
      await client.query('set local role dms_app');
      await client.query(`select set_config('app.company_id', $1, true)`, [fx.companyId]);
      const own = await client.query<{ n: number }>(
        'select count(*)::int as n from product_import_batch where company_id = $1',
        [fx.companyId],
      );
      expect(own.rows[0].n).toBeGreaterThan(0);

      await client.query(`select set_config('app.company_id', $1, true)`, [otherCompanyId]);
      const other = await client.query<{ n: number }>(
        'select count(*)::int as n from product_import_batch where import_id = $1',
        [created.import_id],
      );
      expect(other.rows[0].n).toBe(0);

      await client.query('savepoint test_history_insert');
      await expect(client.query(
        `insert into product_catalog_history (company_id, entity_type, action)
         values ($1, 'product', 'INSERT')`,
        [fx.companyId],
      )).rejects.toMatchObject({ code: '42501' });
      await client.query('rollback to savepoint test_history_insert');

      await client.query('savepoint test_rls_insert');
      await expect(client.query(
        `insert into product_import_batch
           (company_id, import_id, batch_no, status, transaction_outcome)
         values ($1, $2, 999, 'committed', 'committed')`,
        [fx.companyId, created.import_id],
      )).rejects.toMatchObject({ code: '42501' });
      await client.query('rollback to savepoint test_rls_insert');
      await client.query('rollback');
    } finally {
      client.release();
    }
  });
});
