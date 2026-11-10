import 'reflect-metadata';
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createProduct, setupProductMasterFixture, type Fixture } from './product-master-fixture';

/**
 * TASK-PM-01D-M4 — native PostgreSQL evidence for controlled bulk maintenance.
 * A disposable per-file database is used; no shared or production DB is touched.
 */
let fx: Fixture;
let viewerToken = '';
let adminUserId = '';
let otherCompanyId = '';
let otherProductId = '';
let otherBrandId = '';

const PREVIEW = '/api/v1/products/bulk-maintenance/preview';
const EXECUTE = '/api/v1/products/bulk-maintenance/execute';
const FIELDS = '/api/v1/products/bulk-maintenance/fields';
const statusUrl = (operationId: string): string =>
  `/api/v1/products/bulk-maintenance/operations/${operationId}`;

beforeAll(async () => {
  fx = await setupProductMasterFixture('greendms_pm_bulk_maint');

  const admin = await fx.pool.query<{ id: string }>(
    `select id from app_user where username = 'pm_admin'`,
  );
  adminUserId = admin.rows[0].id;
  const hashRow = await fx.pool.query<{ hash: string }>(
    `select password_hash as hash from app_user where username = 'pm_admin'`,
  );
  const person = await fx.pool.query<{ id: string }>(
    `insert into person (company_id, code, first_name, last_name)
     values ($1, 'NO-BULK', 'کاربر', 'بدون مجوز') returning id`,
    [fx.companyId],
  );
  await fx.pool.query(
    `insert into app_user (person_id, username, password_hash, access_level)
     values ($1, 'pm_no_bulk', $2, 'web')`,
    [person.rows[0].id, hashRow.rows[0].hash],
  );
  const role = await fx.pool.query<{ id: string }>(
    `insert into role (company_id, code, name)
     values ($1, 'pm_no_bulk_role', 'نقش بدون مجوز نگهداشت گروهی') returning id`,
    [fx.companyId],
  );
  await fx.pool.query(
    `insert into user_role (app_user_id, role_id)
     select u.id, $1 from app_user u where u.username = 'pm_no_bulk'`,
    [role.rows[0].id],
  );
  viewerToken = await fx.loginAs('pm_no_bulk', fx.adminPassword);

  await fx.pool.query(
    `insert into brand (company_id, name) values ($1, 'برند مرکزی تست') returning id`,
    [fx.companyId],
  );
  const otherCompany = await fx.pool.query<{ id: string }>(
    `insert into company (code, legal_name) values ('PMBULKOTHER', 'شرکت دیگر') returning id`,
  );
  otherCompanyId = otherCompany.rows[0].id;
  const otherCategory = await fx.pool.query<{ id: string }>(
    `insert into product_category (company_id, code, name)
     values ($1, 'OTHERCAT', 'گروه شرکت دیگر') returning id`,
    [otherCompanyId],
  );
  const otherProduct = await fx.pool.query<{ id: string }>(
    `insert into product (company_id, code, name, category_id, base_uom_id)
     values ($1, 'P-OTHER-SECRET', 'کالای محرمانه شرکت دیگر', $2, $3) returning id`,
    [otherCompanyId, otherCategory.rows[0].id, fx.uomId],
  );
  otherProductId = otherProduct.rows[0].id;
  const otherBrand = await fx.pool.query<{ id: string }>(
    `insert into brand (company_id, name) values ($1, 'برند شرکت دیگر') returning id`,
    [otherCompanyId],
  );
  otherBrandId = otherBrand.rows[0].id;
}, 180_000);

afterAll(async () => {
  await fx?.teardown();
});

type CreatedProduct = { id: string; code: string; row_version: number };
const mkProducts = async (count = 2): Promise<CreatedProduct[]> => {
  const prefix = `PB-${randomUUID().slice(0, 8)}`;
  const out: CreatedProduct[] = [];
  for (let i = 1; i <= count; i += 1) {
    out.push(
      await createProduct(fx, {
        code: `${prefix}-${i}`,
        name: `کالای ${i}`,
        min_order_qty: 1,
        distribution_kind: 'cold',
        requires_permit: false,
      }),
    );
  }
  return out;
};

const preview = (ids: string[], changes: Record<string, unknown>, token?: string) =>
  fx.api(token).post(PREVIEW).send({ product_ids: ids, changes });

const execute = (operationId: string, previewToken: string, confirm = true, token?: string) =>
  fx.api(token).post(EXECUTE).send({
    operation_id: operationId,
    preview_token: previewToken,
    confirm,
  });

const getStatus = (operationId: string, token?: string) =>
  fx.api(token).get(statusUrl(operationId));

const reconcile = (operationId: string, token?: string) =>
  fx.api(token).post(`${statusUrl(operationId)}/reconcile`);

const versions = async (ids: string[]): Promise<Map<string, number>> => {
  const { rows } = await fx.pool.query(
    `select id, row_version::int as row_version from product where id = any($1::uuid[])`,
    [ids],
  );
  return new Map((rows as Array<{ id: string; row_version: number }>).map((r) => [r.id, r.row_version]));
};

const auditCount = async (operationId: string): Promise<number> => {
  const { rows } = await fx.pool.query(
    `select count(*)::int as n from audit_log
      where bulk_operation_id = $1 and entity_type = 'product' and action = 'update'`,
    [operationId],
  );
  return (rows[0] as { n: number }).n;
};

const historyCount = async (ids: string[], name: string): Promise<number> => {
  const { rows } = await fx.pool.query(
    `select count(*)::int as n from product_catalog_history
      where entity_type = 'product' and action = 'UPDATE'
        and product_id = any($1::uuid[]) and actor_user_id = $2::uuid
        and after_data->>'name' = $3`,
    [ids, adminUserId, name],
  );
  return (rows[0] as { n: number }).n;
};

const ledgerStatus = async (operationId: string): Promise<string> => {
  const { rows } = await fx.pool.query(
    `select status from product_bulk_operation where id = $1`,
    [operationId],
  );
  return (rows[0] as { status: string }).status;
};

describe('POST /products/bulk-maintenance/preview — authorization and field policy', () => {
  it('exposes only the server-owned central field whitelist', async () => {
    const res = await fx.api().get(FIELDS).expect(200);
    expect(res.body.supported_fields.map((f: { key: string }) => f.key)).toEqual([
      'name',
      'name_latin',
      'brand_id',
      'min_order_qty',
      'weight_gr',
      'volume_cm3',
      'distribution_kind',
      'is_returnable_container',
      'requires_permit',
    ]);
    expect(JSON.stringify(res.body.supported_fields)).not.toContain('status');
    expect(JSON.stringify(res.body.supported_fields)).not.toContain('tax_code_id');
    await request(fx.app.getHttpServer()).get(FIELDS).expect(401);
    const forbidden = await fx.api(viewerToken).get(FIELDS).expect(403);
    expect(forbidden.body.code).toBe('forbidden');
  });

  it('rejects unauthenticated/unauthorized writes, protected fields, invalid values and unbounded selections', async () => {
    const [p] = await mkProducts(1);
    await request(fx.app.getHttpServer())
      .post(PREVIEW)
      .send({ product_ids: [p.id], changes: { name: 'تازه' } })
      .expect(401);
    const forbidden = await preview([p.id], { name: 'تازه' }, viewerToken).expect(403);
    expect(forbidden.body.code).toBe('forbidden');

    for (const changes of [
      { status: 'blocked' },
      { tax_code_id: null },
      { base_uom_id: fx.uomId },
      { company_id: otherCompanyId },
      { domain_id: randomUUID() },
      { category_id: fx.categoryId },
    ]) {
      const res = await preview([p.id], changes).expect(400);
      expect(res.body.code).toBe('protected_field');
    }
    for (const changes of [
      { name: '' },
      { min_order_qty: -1 },
      { weight_gr: 1.5 },
      { distribution_kind: 'frozen' },
      { requires_permit: 'yes' },
      { brand_id: 'not-a-uuid' },
      { unsupported: 1 },
    ]) {
      const res = await preview([p.id], changes).expect(400);
      expect(['invalid_value', 'unsupported_field']).toContain(res.body.code);
    }
    const brandCross = await preview([p.id], { brand_id: otherBrandId }).expect(400);
    expect(brandCross.body.code).toBe('invalid_reference');
    await preview([], { name: 'تازه' }).expect(400);
    await preview([p.id, p.id], { name: 'تازه' }).expect(400);
    await preview(Array.from({ length: 101 }, () => randomUUID()), { name: 'تازه' }).expect(400);
    await preview(['not-a-uuid'], { name: 'تازه' }).expect(400);
    const after = await versions([p.id]);
    expect(after.get(p.id)).toBe(p.row_version);
    expect(await historyCount([p.id], 'تازه')).toBe(0);
  });

  it('creates an exact product-read-only preview; only a durable ledger row is inserted', async () => {
    const ps = await mkProducts(2);
    const ids = ps.map((p) => p.id);
    const before = await versions(ids);
    const res = await preview(ids, { name: 'نام تازه', distribution_kind: 'both' }).expect(200);
    expect(res.body.status).toBe('preview_created');
    expect(res.body.eligible_count).toBe(2);
    expect(res.body.rejected_count).toBe(0);
    expect(res.body.preview_token).toMatch(/^[a-f0-9]{64}$/);
    expect(res.body.items).toHaveLength(2);
    const firstItem = res.body.items.find(
      (item: { product_id: string }) => item.product_id === ps[0].id,
    );
    const diffs = firstItem.changes as Array<Record<string, unknown>>;
    expect(diffs.find((d) => d.field === 'name')).toMatchObject({
      before: 'کالای 1',
      after: 'نام تازه',
      before_label: 'کالای 1',
      after_label: 'نام تازه',
      changed: true,
    });
    expect(diffs.find((d) => d.field === 'distribution_kind')).toMatchObject({
      before: 'cold',
      after: 'both',
      before_label: 'سرد',
      after_label: 'سرد و گرم',
      changed: true,
    });
    const after = await versions(ids);
    expect(after).toEqual(before);
    expect(await historyCount(ids, 'نام تازه')).toBe(0);
    expect(await auditCount(res.body.operation_id)).toBe(0);
    expect(await ledgerStatus(res.body.operation_id)).toBe('preview_created');
    const ledger = await fx.pool.query(
      `select preview_token_hash from product_bulk_operation where id = $1`,
      [res.body.operation_id],
    );
    expect((ledger.rows[0] as { preview_token_hash: string }).preview_token_hash).toBe(
      createHash('sha256').update(res.body.preview_token, 'utf8').digest('hex'),
    );
    const created = await getStatus(res.body.operation_id).expect(200);
    expect(created.body.status).toBe('preview_created');
  });

  it('rejects cross-company IDs and cross-company references without leaking or writing', async () => {
    const [own] = await mkProducts(1);
    const res = await preview([own.id, otherProductId], { name: 'نام تازه' }).expect(200);
    expect(res.body.eligible_count).toBe(1);
    expect(res.body.rejected_count).toBe(1);
    const rejected = res.body.items.find(
      (item: { product_id: string }) => item.product_id === otherProductId,
    );
    expect(rejected).toMatchObject({ status: 'rejected', reason_code: 'not_found', code: '—' });
    const run = await execute(res.body.operation_id, res.body.preview_token).expect(200);
    expect(run.body.status).toBe('rejected');
    expect(run.body.reason_code).toBe('ineligible_selection');
    expect(run.body.updated_count).toBe(0);
    expect(await versions([own.id])).toEqual(new Map([[own.id, own.row_version]]));
    const other = await fx.pool.query(`select name from product where id = $1`, [otherProductId]);
    expect((other.rows[0] as { name: string }).name).toBe('کالای محرمانه شرکت دیگر');
    expect(await auditCount(res.body.operation_id)).toBe(0);
  });
});

describe('POST /products/bulk-maintenance/execute — transaction, replay and evidence', () => {
  it('commits all eligible products once, correlates audit/history and replays idempotently', async () => {
    const ps = await mkProducts(2);
    const ids = ps.map((p) => p.id);
    const before = await versions(ids);
    const pre = await preview(ids, { name: 'نام نهایی', requires_permit: true }).expect(200);
    const run = await execute(pre.body.operation_id, pre.body.preview_token).expect(200);
    expect(run.body.status).toBe('committed');
    expect(run.body.outcome).toBe('committed');
    expect(run.body.updated_count).toBe(2);
    expect(run.body.idempotent_replay).toBe(false);
    expect(run.body.lifecycle.map((e: { state: string }) => e.state)).toEqual([
      'preview_created',
      'accepted',
      'committed',
    ]);
    expect(run.body.items).toHaveLength(2);
    expect(run.body.items[0].product_url).toContain('?tab=history');

    const after = await versions(ids);
    for (const p of ps) expect(after.get(p.id)).toBe((before.get(p.id) ?? 0) + 1);
    const productRows = await fx.pool.query(
      `select name, requires_permit from product where id = any($1::uuid[])`,
      [ids],
    );
    for (const r of productRows.rows as Array<{ name: string; requires_permit: boolean }>) {
      expect(r.name).toBe('نام نهایی');
      expect(r.requires_permit).toBe(true);
    }
    expect(await historyCount(ids, 'نام نهایی')).toBe(2);
    expect(await auditCount(pre.body.operation_id)).toBe(1);
    const audit = await fx.pool.query(
      `select after_data from audit_log where bulk_operation_id = $1`,
      [pre.body.operation_id],
    );
    const payload = (audit.rows[0] as { after_data: Record<string, unknown> }).after_data;
    expect(payload.operation_id).toBe(pre.body.operation_id);
    expect(payload.updated_count).toBe(2);
    expect(JSON.stringify(payload)).not.toContain('نام نهایی');
    expect(JSON.stringify(payload)).not.toContain('کالای 1');

    const history = await fx.api().get(`/api/v1/products/${ids[0]}/history`).expect(200);
    expect(
      (history.body.items as Array<{ action: string; after_data: { name?: string } }>).some(
        (e) => e.action === 'UPDATE' && e.after_data?.name === 'نام نهایی',
      ),
    ).toBe(true);

    const replay = await execute(pre.body.operation_id, pre.body.preview_token).expect(200);
    expect(replay.body.status).toBe('committed');
    expect(replay.body.idempotent_replay).toBe(true);
    expect(replay.body.updated_count).toBe(2);
    expect(await versions(ids)).toEqual(after);
    expect(await auditCount(pre.body.operation_id)).toBe(1);
    expect(await historyCount(ids, 'نام نهایی')).toBe(2);
    const status = await getStatus(pre.body.operation_id).expect(200);
    expect(status.body.status).toBe('committed');
    expect(status.body.lifecycle.map((e: { state: string }) => e.state)).toContain('accepted');
  });

  it('distinguishes stale and expired previews before any write', async () => {
    const ps = await mkProducts(2);
    const ids = ps.map((p) => p.id);
    const pre = await preview(ids, { name: 'نام تازه' }).expect(200);
    await fx.pool.query(`update product set name = $1 where id = $2`, ['تغییر بیرونی', ids[0]]);
    const stale = await getStatus(pre.body.operation_id).expect(200);
    expect(stale.body.status).toBe('preview_stale');
    expect(stale.body.reason_code).toBe('preview_stale');
    const run = await execute(pre.body.operation_id, pre.body.preview_token).expect(200);
    expect(run.body.status).toBe('rejected');
    expect(run.body.reason_code).toBe('preview_stale');
    expect(run.body.updated_count).toBe(0);
    expect(await auditCount(pre.body.operation_id)).toBe(0);
    expect(await historyCount(ids, 'نام تازه')).toBe(0);

    const [p2] = await mkProducts(1);
    const pre2 = await preview([p2.id], { name: 'نام منقضی' }).expect(200);
    await fx.pool.query(
      `update product_bulk_operation set expires_at = now() - interval '1 second' where id = $1`,
      [pre2.body.operation_id],
    );
    const expired = await getStatus(pre2.body.operation_id).expect(200);
    expect(expired.body.status).toBe('preview_expired');
    const expiredRun = await execute(pre2.body.operation_id, pre2.body.preview_token).expect(200);
    expect(expiredRun.body.status).toBe('rejected');
    expect(expiredRun.body.reason_code).toBe('preview_expired');
    expect(await versions([p2.id])).toEqual(new Map([[p2.id, p2.row_version]]));
  });

  it('rolls back every product on a real row_version conflict and keeps audit/history consistent', async () => {
    const ps = await mkProducts(2);
    const ids = ps.map((p) => p.id);
    const before = await versions(ids);
    const pre = await preview(ids, { name: 'نام برگشتی' }).expect(200);

    // A deterministic in-transaction concurrent modification: updating the
    // first eligible product (server sorts IDs) bumps the second product's
    // real row_version before its turn in the same all-or-nothing transaction.
    const orderedIds = [...ids].sort();
    await fx.pool.query(`
      create or replace function pm_bulk_conflict_probe() returns trigger
      language plpgsql as $$
      begin
        if TG_OP = 'UPDATE' and NEW.id = '${orderedIds[0]}'::uuid and pg_trigger_depth() = 1 then
          update product set name = name where id = '${orderedIds[1]}'::uuid;
        end if;
        return NEW;
      end $$;
      create trigger trg_pm_bulk_conflict_probe before update on product
        for each row execute function pm_bulk_conflict_probe();
    `);
    try {
      const run = await execute(pre.body.operation_id, pre.body.preview_token).expect(200);
      expect(run.body.status).toBe('rejected');
      expect(run.body.outcome).toBe('rolled_back');
      expect(run.body.reason_code).toBe('version_conflict');
      expect(run.body.updated_count).toBe(0);
      expect(await versions(ids)).toEqual(before);
      expect(await auditCount(pre.body.operation_id)).toBe(0);
      expect(await historyCount(ids, 'نام برگشتی')).toBe(0);
      expect(await ledgerStatus(pre.body.operation_id)).toBe('rejected');
    } finally {
      await fx.pool.query(`
        drop trigger if exists trg_pm_bulk_conflict_probe on product;
        drop function if exists pm_bulk_conflict_probe();
      `);
    }
  });

  it('serializes concurrent execute calls and never applies the same operation twice', async () => {
    const ps = await mkProducts(2);
    const ids = ps.map((p) => p.id);
    const before = await versions(ids);
    const pre = await preview(ids, { name: 'نام همزمان' }).expect(200);
    const [first, second] = await Promise.all([
      execute(pre.body.operation_id, pre.body.preview_token),
      execute(pre.body.operation_id, pre.body.preview_token),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.status).toBe('committed');
    expect(second.body.status).toBe('committed');
    const after = await versions(ids);
    for (const p of ps) expect(after.get(p.id)).toBe((before.get(p.id) ?? 0) + 1);
    expect(await auditCount(pre.body.operation_id)).toBe(1);
    expect(await historyCount(ids, 'نام همزمان')).toBe(2);
  });

  it('requires explicit confirmation and rejects a crafted execute payload', async () => {
    const [p] = await mkProducts(1);
    const pre = await preview([p.id], { name: 'نام تأییدشده' }).expect(200);
    const noConfirm = await execute(pre.body.operation_id, pre.body.preview_token, false).expect(400);
    expect(noConfirm.body.message_fa).toBeTruthy();
    const badToken = await fx.api()
      .post(EXECUTE)
      .send({
        operation_id: pre.body.operation_id,
        preview_token: 'b'.repeat(64),
        confirm: true,
      })
      .expect(403);
    expect(badToken.body.code).toBe('invalid_preview_token');
    const crafted = await fx.api()
      .post(EXECUTE)
      .send({
        operation_id: pre.body.operation_id,
        preview_token: pre.body.preview_token,
        confirm: true,
        changes: { status: 'blocked', name: 'حمله' },
      })
      .expect(200);
    // Extra body keys are ignored by validation and never become new changes.
    expect(crafted.body.status).toBe('committed');
    const row = await fx.pool.query(`select name, status from product where id = $1`, [p.id]);
    expect((row.rows[0] as { name: string; status: string })).toMatchObject({
      name: 'نام تأییدشده',
      status: 'active',
    });
  });
});

describe('reconciliation — read-only GET and explicit POST /operations/:id/reconcile', () => {
  it('fails closed on ambiguous evidence and never blindly reruns', async () => {
    const [p] = await mkProducts(1);
    const pre = await preview([p.id], { name: 'نام نامشخص' }).expect(200);
    await fx.pool.query(`update product set name = $1 where id = $2`, ['تغییر بیرونی', p.id]);
    await fx.pool.query(
      `update product_bulk_operation
        set status = 'unknown', outcome = 'unknown', failure_category = 'unknown',
            reason_code = 'commit_outcome_unknown', message_fa = 'نتیجه نامشخص'
        where id = $1`,
      [pre.body.operation_id],
    );
    const run = await execute(pre.body.operation_id, pre.body.preview_token).expect(200);
    expect(run.body.status).toBe('unknown');
    expect(run.body.outcome).toBe('unknown');
    expect(run.body.reconciled).toBe(false);
    expect(run.body.retryable).toBe(false);
    expect(run.body.reconciliation_hint_fa).toContain('اجرای مجدد');
    expect(run.body.lifecycle.map((e: { state: string }) => e.state)).toContain('unknown');
    const status = await getStatus(pre.body.operation_id).expect(200);
    expect(status.body.status).toBe('unknown');
    expect(await historyCount([p.id], 'نام نامشخص')).toBe(0);
  });

  it('reconciles a durable unknown with rolled-back evidence or committed evidence', async () => {
    const [rollbackProduct] = await mkProducts(1);
    const preRollback = await preview([rollbackProduct.id], { name: 'نام رولبک' }).expect(200);
    await fx.pool.query(
      `update product_bulk_operation
        set status = 'unknown', outcome = 'unknown', failure_category = 'unknown'
        where id = $1`,
      [preRollback.body.operation_id],
    );
    const rolledBack = await execute(preRollback.body.operation_id, preRollback.body.preview_token).expect(200);
    expect(rolledBack.body.status).toBe('rejected');
    expect(rolledBack.body.outcome).toBe('rolled_back');
    expect(rolledBack.body.reconciled).toBe(true);
    expect(await versions([rollbackProduct.id])).toEqual(
      new Map([[rollbackProduct.id, rollbackProduct.row_version]]),
    );

    const [committedProduct] = await mkProducts(1);
    const preCommitted = await preview([committedProduct.id], { name: 'نام ثبتشده' }).expect(200);
    await execute(preCommitted.body.operation_id, preCommitted.body.preview_token).expect(200);
    await fx.pool.query(
      `update product_bulk_operation
        set status = 'unknown', outcome = 'unknown', failure_category = 'unknown'
        where id = $1`,
      [preCommitted.body.operation_id],
    );
    const readOnlyStatus = await getStatus(preCommitted.body.operation_id).expect(200);
    expect(readOnlyStatus.body.status).toBe('unknown');
    expect(readOnlyStatus.body.reconciled).toBe(false);
    const reconciled = await reconcile(preCommitted.body.operation_id).expect(200);
    expect(reconciled.body.status).toBe('committed');
    expect(reconciled.body.reconciled).toBe(true);
    expect(reconciled.body.updated_count).toBe(1);
    expect(await versions([committedProduct.id])).toEqual(
      new Map([[committedProduct.id, committedProduct.row_version + 1]]),
    );
    expect(await auditCount(preCommitted.body.operation_id)).toBe(1);
    expect(await historyCount([committedProduct.id], 'نام ثبتشده')).toBe(1);
  });
});
