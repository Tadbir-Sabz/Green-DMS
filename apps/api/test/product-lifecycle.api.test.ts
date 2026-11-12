import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { setupProductMasterFixture, createProduct, type Fixture } from './product-master-fixture';
import { AUDIT_SERVICE, type AuditService } from '../src/common/audit.service';
import { WaybillRepository } from '../src/modules/sales/waybill.repository';

/**
 * TASK-PM-02-C5 — focused HTTP + native PostgreSQL evidence for the central
 * lifecycle read/transition surface. The D4 guard is centralized: evidence-backed
 * active↔blocked PATCH behavior is preserved, while every transition involving
 * discontinued is BLOCKED / NOT AUTHORIZED on both PATCH and the dedicated path.
 * These tests prove the new surface, D4, RBAC/RLS, actor attribution, optimistic
 * concurrency, fail-closed audit and existing downstream behavior.
 */
let fx: Fixture;
let viewerToken = '';
let updaterToken = '';

const transitionBody = (
  target_status: string,
  row_version: number,
  confirm_sensitive = true,
): Record<string, unknown> => ({ target_status, row_version, confirm_sensitive });

beforeAll(async () => {
  fx = await setupProductMasterFixture('greendms_pm_c5_lifecycle');

  const hash = (await fx.pool.query<{ hash: string }>(
    `select password_hash as hash from app_user where username = 'pm_admin'`,
  )).rows[0].hash;

  const makeUser = async (username: string, code: string, permissions: string[]): Promise<string> => {
    const person = await fx.pool.query<{ id: string }>(
      `insert into person (company_id, code, first_name, last_name)
       values ($1, $2, 'کاربر', 'آزمون') returning id`,
      [fx.companyId, code],
    );
    await fx.pool.query(
      `insert into app_user (person_id, username, password_hash, access_level)
       values ($1, $2, $3, 'web')`,
      [person.rows[0].id, username, hash],
    );
    const role = await fx.pool.query<{ id: string }>(
      `insert into role (company_id, code, name) values ($1, $2, $3) returning id`,
      [fx.companyId, `${username}_role`, `نقش ${username}`],
    );
    for (const permission of permissions) {
      await fx.pool.query(
        `insert into role_permission (role_id, permission_code) values ($1, $2)`,
        [role.rows[0].id, permission],
      );
    }
    await fx.pool.query(
      `insert into user_role (app_user_id, role_id)
       select u.id, $1 from app_user u where u.username = $2`,
      [role.rows[0].id, username],
    );
    return fx.loginAs(username, fx.adminPassword);
  };

  viewerToken = await makeUser('pm_c5_viewer', 'C5-V', ['master.product.view']);
  updaterToken = await makeUser('pm_c5_updater', 'C5-U', ['master.product.view', 'master.product.update']);
}, 180_000);

afterAll(async () => {
  await fx?.teardown();
});

describe('C5 — authenticated, company-scoped lifecycle read model', () => {
  it('anonymous read/write is 401', async () => {
    const p = await createProduct(fx, { name: 'کالای احراز', code: 'C5-AUTH' });
    await fx.api('').get(`/api/v1/products/${p.id}/lifecycle`).expect(401);
    await fx.api('').post(`/api/v1/products/${p.id}/lifecycle/transitions`)
      .send(transitionBody('blocked', p.row_version)).expect(401);
  });

  it('read shows exact current state, 12-row matrix, actor and immutable history', async () => {
    const p = await createProduct(fx, { name: 'کالای چرخه', code: 'C5-READ' });
    const res = await fx.api().get(`/api/v1/products/${p.id}/lifecycle`).expect(200);
    expect(res.body.scope).toBe('central');
    expect(res.body.status).toBe('active');
    expect(res.body.row_version).toBe(p.row_version);
    expect(res.body.policy.two_person_approval).toBe('BLOCKED');
    expect(res.body.actor.can_transition).toBe(true);
    expect(res.body.available_actions.map((a: { target_status: string }) => a.target_status).sort()).toEqual(['blocked']);
    expect(res.body.available_actions.every((a: { target_status: string }) => a.target_status !== 'discontinued')).toBe(true);
    expect(res.body.transitions).toHaveLength(12);
    expect(res.body.transitions.filter((r: { supported: boolean }) => r.supported)).toHaveLength(2);
    expect(res.body.transitions.filter(
      (r: { supported: boolean; source_status: string; target_status: string }) =>
        r.supported && (r.source_status === 'discontinued' || r.target_status === 'discontinued'),
    )).toEqual([]);
    expect(res.body.transitions.filter(
      (r: { rejection_code: string }) => r.rejection_code === 'lifecycle_transition_blocked',
    )).toHaveLength(5);
    expect(res.body.downstream_notes_fa.join(' ')).toContain('قیمت');
    expect(res.body.owner_decisions_fa.join(' ')).toContain('BLOCKED');
    expect(res.body.history.items[0]).toMatchObject({
      action: 'INSERT', to_status: 'active', actor_label_fa: 'مدیر کالا',
    });
    expect(res.body.history.items[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.body.history.items[0].actor_user_id).toBeTruthy();
    expect(res.body.history.items[0].before_data).toBeUndefined();
    expect(res.body.history.items[0].after_data).toBeUndefined();
  });

  it('read surface rejects forged ownership/tenant/authorization query fields', async () => {
    const p = await createProduct(fx, { name: 'کالای کوئری', code: 'C5-Q' });
    const res = await fx.api()
      .get(`/api/v1/products/${p.id}/lifecycle`)
      .query({ company_id: randomUUID(), tenant_id: 'tenant', permissions: '*' })
      .expect(400);
    expect(res.body.code).toBe('forbidden_client_field');
    expect(res.body.details.fields).toContain('company_id');
  });

  it('viewer sees state and explicit unavailable reason but no action control data', async () => {
    const p = await createProduct(fx, { name: 'کالای فقطخواندنی', code: 'C5-VIEW' });
    const res = await fx.api(viewerToken).get(`/api/v1/products/${p.id}/lifecycle`).expect(200);
    expect(res.body.actor.can_transition).toBe(false);
    expect(res.body.available_actions).toEqual([]);
    expect(res.body.actor.unavailable_reason_fa).toContain('مجوز');
    await fx.api(viewerToken).post(`/api/v1/products/${p.id}/lifecycle/transitions`)
      .send(transitionBody('blocked', p.row_version)).expect(403);
  });

  it('cross-company product is 404 and domain context fails closed', async () => {
    const other = await fx.pool.query<{ id: string }>(
      `insert into company (code, legal_name) values ('C5CO2', 'شرکت دیگر C5') returning id`,
    );
    const p = await fx.pool.query<{ id: string }>(
      `insert into product (company_id, code, name, category_id, base_uom_id)
       values ($1, 'C5-OTHER', 'کالای شرکت دیگر', $2, $3) returning id`,
      [other.rows[0].id, fx.categoryId, fx.uomId],
    );
    const read = await fx.api().get(`/api/v1/products/${p.rows[0].id}/lifecycle`).expect(404);
    expect(read.body.code).toBe('product_not_found');
    await fx.api().post(`/api/v1/products/${p.rows[0].id}/lifecycle/transitions`)
      .send(transitionBody('blocked', 0)).expect(404);
    const local = await createProduct(fx, { name: 'کالای دامنه', code: 'C5-DOMAIN' });
    const domainHeader = await fx.api()
      .get(`/api/v1/products/${local.id}/lifecycle`)
      .set('x-domain-id', randomUUID())
      .expect(400);
    expect(['domain_context_not_supported', 'domain_property_rejected']).toContain(domainHeader.body.code);
  });
});

describe('C5 — D4 transitions, concurrency, audit and downstream compatibility', () => {
  it('valid active→blocked and blocked→active are transactional and attributable', async () => {
    const p = await createProduct(fx, { name: 'کالای گذار', code: 'C5-TRANS' });
    const admin = await fx.pool.query<{ id: string }>(
      `select id from app_user where username = 'pm_admin'`,
    );
    const first = await fx.api().post(`/api/v1/products/${p.id}/lifecycle/transitions`)
      .send(transitionBody('blocked', p.row_version)).expect(200);
    expect(first.body).toMatchObject({
      from_status: 'active', status: 'blocked', action_id: 'block',
      audit: { committed: true, action: 'product_lifecycle.transition', actor_source: 'session' },
    });
    expect(first.body.row_version).toBe(p.row_version + 1);

    const audit = await fx.pool.query(
      `select actor_user_id, before_data, after_data from audit_log
        where entity_type='product' and entity_id=$1 and action='product_lifecycle.transition'`,
      [p.id],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].actor_user_id).toBe(admin.rows[0].id);
    expect(audit.rows[0].before_data.status).toBe('active');
    expect(audit.rows[0].after_data.status).toBe('blocked');

    const history = await fx.pool.query(
      `select actor_user_id, before_data->>'status' as before_status, after_data->>'status' as after_status
         from product_catalog_history
        where company_id=$1 and product_id=$2 and entity_type='product' and action='UPDATE'
          and (before_data->>'status') is distinct from (after_data->>'status')`,
      [fx.companyId, p.id],
    );
    expect(history.rows).toHaveLength(1);
    expect(history.rows[0]).toMatchObject({
      actor_user_id: admin.rows[0].id, before_status: 'active', after_status: 'blocked',
    });

    const read = await fx.api().get(`/api/v1/products/${p.id}/lifecycle`).expect(200);
    expect(read.body.status).toBe('blocked');
    expect(read.body.row_version).toBe(first.body.row_version);
    expect(read.body.history.items[0]).toMatchObject({
      action: 'UPDATE', from_status: 'active', to_status: 'blocked', actor_label_fa: 'مدیر کالا',
    });
    expect(read.body.history.items[0].actor_user_id).toBe(admin.rows[0].id);

    const second = await fx.api().post(`/api/v1/products/${p.id}/lifecycle/transitions`)
      .send(transitionBody('active', first.body.row_version)).expect(200);
    expect(second.body.from_status).toBe('blocked');
    expect(second.body.status).toBe('active');
    expect(second.body.row_version).toBe(first.body.row_version + 1);
    expect(second.body.action_id).toBe('activate');
  });

  it('existing pricing/waybill behavior is preserved after a lifecycle transition', async () => {
    const p = await createProduct(fx, { name: 'کالای downstream', code: 'C5-DOWN' });
    const waybills = new WaybillRepository(fx.pool);
    expect(await waybills.productsValid(fx.companyId, [p.id])).toBe(true);
    const blocked = await fx.api().post(`/api/v1/products/${p.id}/lifecycle/transitions`)
      .send(transitionBody('blocked', p.row_version)).expect(200);
    expect(await waybills.productsValid(fx.companyId, [p.id])).toBe(false);
    await fx.api().post(`/api/v1/products/${p.id}/lifecycle/transitions`)
      .send(transitionBody('active', blocked.body.row_version)).expect(200);
    expect(await waybills.productsValid(fx.companyId, [p.id])).toBe(true);
    // Order/procurement/invoice/attachment ownership reads are unchanged: same
    // product identity remains visible with the new central status.
    const row = await fx.pool.query<{ status: string; deleted_at: null }>(
      `select status, deleted_at from product where id=$1 and company_id=$2`,
      [p.id, fx.companyId],
    );
    expect(row.rows[0]).toEqual({ status: 'active', deleted_at: null });
  });

  it('unsupported transitions and invalid targets fail with explicit safe errors', async () => {
    const p = await createProduct(fx, { name: 'کالای گذار نامعتبر', code: 'C5-INVALID' });
    const unchanged = await fx.api().post(`/api/v1/products/${p.id}/lifecycle/transitions`)
      .send(transitionBody('active', p.row_version)).expect(400);
    expect(unchanged.body.code).toBe('lifecycle_transition_unchanged');
    const invalid = await fx.api().post(`/api/v1/products/${p.id}/lifecycle/transitions`)
      .send(transitionBody('archived', p.row_version)).expect(400);
    expect(invalid.body.code).toBe('validation_failed');
    const discontinued = await fx.api().post(`/api/v1/products/${p.id}/lifecycle/transitions`)
      .send(transitionBody('discontinued', p.row_version)).expect(400);
    expect(discontinued.body.code).toBe('lifecycle_transition_blocked');
    expect(discontinued.body.message_fa).toContain('BLOCKED');
    const genericDiscontinued = await fx.api().patch(`/api/v1/products/${p.id}`)
      .send({ status: 'discontinued', confirm_sensitive: true, row_version: p.row_version }).expect(400);
    expect(genericDiscontinued.body.code).toBe('lifecycle_transition_blocked');
    const unchangedAfterBlocked = await fx.pool.query<{ status: string; row_version: number }>(
      `select status, row_version from product where id=$1 and company_id=$2`,
      [p.id, fx.companyId],
    );
    expect(unchangedAfterBlocked.rows[0]).toEqual({ status: 'active', row_version: p.row_version });
    const missingVersion = await fx.api().post(`/api/v1/products/${p.id}/lifecycle/transitions`)
      .send({ target_status: 'blocked', confirm_sensitive: true }).expect(400);
    expect(missingVersion.body.code).toBe('validation_failed');
    const unknown = await fx.api().post(`/api/v1/products/${p.id}/lifecycle/transitions`)
      .send({ ...transitionBody('blocked', p.row_version), reason: 'تست' }).expect(400);
    expect(unknown.body.code).toBe('unsupported_request_field');
  });

  it('a legacy discontinued product is read-only and cannot be transitioned by any write path', async () => {
    const p = await createProduct(fx, { name: 'کالای متوقف قدیمی', code: 'C5-LEGACY' });
    // Simulate a pre-C5 row already carrying the existing enum value; this is
    // fixture data, not an API transition or a new lifecycle policy.
    await fx.pool.query(
      `update product set status = 'discontinued' where id=$1 and company_id=$2`,
      [p.id, fx.companyId],
    );
    const read = await fx.api().get(`/api/v1/products/${p.id}/lifecycle`).expect(200);
    expect(read.body.status).toBe('discontinued');
    expect(read.body.available_actions).toEqual([]);
    expect(read.body.transitions.every((r: { supported: boolean; source_status: string; target_status: string }) =>
      !r.supported || (r.source_status !== 'discontinued' && r.target_status !== 'discontinued'))).toBe(true);

    const dedicated = await fx.api().post(`/api/v1/products/${p.id}/lifecycle/transitions`)
      .send(transitionBody('active', read.body.row_version)).expect(400);
    expect(dedicated.body.code).toBe('lifecycle_transition_blocked');
    const generic = await fx.api().patch(`/api/v1/products/${p.id}`)
      .send({ status: 'active', confirm_sensitive: true, row_version: read.body.row_version }).expect(400);
    expect(generic.body.code).toBe('lifecycle_transition_blocked');
    const row = await fx.pool.query<{ status: string; row_version: number }>(
      `select status, row_version from product where id=$1 and company_id=$2`,
      [p.id, fx.companyId],
    );
    expect(row.rows[0]).toEqual({ status: 'discontinued', row_version: read.body.row_version });
  });

  it('client-supplied identity, ownership, authorization and audit metadata are rejected', async () => {
    const p = await createProduct(fx, { name: 'کالای تزریق', code: 'C5-INJECT' });
    for (const field of [
      'company_id', 'tenant_id', 'actor_user_id', 'permissions', 'approved_by',
      'audit_metadata', 'request_id', 'created_by', 'status', 'action',
    ]) {
      const res = await fx.api().post(`/api/v1/products/${p.id}/lifecycle/transitions`)
        .send({ ...transitionBody('blocked', p.row_version), [field]: 'forged' }).expect(400);
      expect(res.body.code, field).toBe('forbidden_client_field');
      expect(res.body.details.fields, field).toContain(field);
    }
    const status = await fx.api().get(`/api/v1/products/${p.id}`).expect(200);
    expect(status.body.status).toBe('active');
  });

  it('missing confirmation, missing privileged status permission and stale version are rejected', async () => {
    const p = await createProduct(fx, { name: 'کالای D4', code: 'C5-D4' });
    const noConfirm = await fx.api().post(`/api/v1/products/${p.id}/lifecycle/transitions`)
      .send({ target_status: 'blocked', row_version: p.row_version }).expect(400);
    expect(noConfirm.body.code).toBe('sensitive_change_requires_confirmation');

    const noStatusPermission = await fx.api(updaterToken)
      .post(`/api/v1/products/${p.id}/lifecycle/transitions`)
      .send(transitionBody('blocked', p.row_version)).expect(403);
    expect(noStatusPermission.body.code).toBe('status_change_forbidden');

    const first = await fx.api().post(`/api/v1/products/${p.id}/lifecycle/transitions`)
      .send(transitionBody('blocked', p.row_version)).expect(200);
    const stale = await fx.api().post(`/api/v1/products/${p.id}/lifecycle/transitions`)
      .send(transitionBody('active', p.row_version)).expect(409);
    expect(stale.body.code).toBe('version_conflict');
    expect(stale.body.message_fa).not.toContain('select');
    expect(first.body.status).toBe('blocked');
  });

  it('two concurrent transitions using one row_version produce exactly one winner', async () => {
    const p = await createProduct(fx, { name: 'کالای همزمانی', code: 'C5-RACE' });
    const [a, b] = await Promise.all([
      fx.api().post(`/api/v1/products/${p.id}/lifecycle/transitions`)
        .send(transitionBody('blocked', p.row_version)),
      fx.api().post(`/api/v1/products/${p.id}/lifecycle/transitions`)
        .send(transitionBody('blocked', p.row_version)),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.code).toBe('version_conflict');
    const row = await fx.pool.query<{ status: string }>(
      `select status from product where id=$1 and company_id=$2`,
      [p.id, fx.companyId],
    );
    expect(row.rows[0].status).toBe('blocked');
  });

  it('an audit failure rolls back the product update and the 0060 history event', async () => {
    const p = await createProduct(fx, { name: 'کالای ممیزی', code: 'C5-AUDIT' });
    const audit = fx.app.get<AuditService>(AUDIT_SERVICE);
    const original = audit.recordRequired.bind(audit);
    const spy = vi.spyOn(audit, 'recordRequired').mockImplementation((entry, client) => {
      if (entry.action === 'product_lifecycle.transition') {
        return Promise.reject(new Error('audit unavailable'));
      }
      return original(entry, client);
    });
    try {
      const res = await fx.api().post(`/api/v1/products/${p.id}/lifecycle/transitions`)
        .send(transitionBody('blocked', p.row_version)).expect(500);
      expect(res.body.code).toBe('lifecycle_transition_failed');
      expect(res.body.message_fa).not.toContain('audit unavailable');
      const product = await fx.pool.query<{ status: string; row_version: number }>(
        `select status, row_version from product where id=$1 and company_id=$2`,
        [p.id, fx.companyId],
      );
      expect(product.rows[0]).toEqual({ status: 'active', row_version: p.row_version });
      const history = await fx.pool.query<{ count: number }>(
        `select count(*)::int as count from product_catalog_history
          where company_id=$1 and product_id=$2 and entity_type='product' and action='UPDATE'
            and (before_data->>'status') is distinct from (after_data->>'status')`,
        [fx.companyId, p.id],
      );
      expect(history.rows[0].count).toBe(0);
      const auditRow = await fx.pool.query<{ count: number }>(
        `select count(*)::int as count from audit_log
          where entity_type='product' and entity_id=$1 and action='product_lifecycle.transition'`,
        [p.id],
      );
      expect(auditRow.rows[0].count).toBe(0);
    } finally {
      spy.mockRestore();
    }
  });
});
