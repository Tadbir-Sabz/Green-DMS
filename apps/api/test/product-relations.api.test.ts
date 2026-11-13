import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { setupProductMasterFixture, createProduct, type Fixture } from './product-master-fixture';

/**
 * TASK-PM-02-C6 — focused HTTP + native PostgreSQL evidence for the central
 * product-to-product relation surface.
 *
 * Proven here (and only here): the two migration-0046 kinds, directed/read-only
 * semantics, viewer/updater RBAC, tenant isolation, explicit 400s for forged
 * ownership/domain fields, self-relation, duplicate, substitute cycle, priority
 * edit, delete policy, fail-closed audit and the immutable 0060 history feed.
 * NOT proven (documented as open owner decisions): reciprocal auto-creation,
 * complement cycles, cardinality rules, blocking relations to non-active
 * products, and any operational effect on price/stock/orders/documents/bundles.
 */
let fx: Fixture;
let viewerToken = '';
let updaterToken = '';

beforeAll(async () => {
  fx = await setupProductMasterFixture('greendms_pm_c6_relations');

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

  viewerToken = await makeUser('pm_c6_viewer', 'C6-V', ['master.product.view']);
  updaterToken = await makeUser('pm_c6_updater', 'C6-U', ['master.product.view', 'master.product.update']);
}, 180_000);

afterAll(async () => {
  await fx?.teardown();
});

const newProduct = (code: string) => createProduct(fx, { name: `کالای ${code}`, code });

describe('C6 — authenticated, company-scoped relation reads', () => {
  it('anonymous read/write is 401 and creates nothing', async () => {
    const a = await newProduct('C6-ANON-A');
    const b = await newProduct('C6-ANON-B');
    await fx.api('').get(`/api/v1/products/${a.id}/relations`).expect(401);
    await fx.api('').get(`/api/v1/products/${a.id}/relations/history`).expect(401);
    await fx.api('').get(`/api/v1/products/${a.id}/relations/graph`).expect(401);
    await fx.api('').post(`/api/v1/products/${a.id}/relations`)
      .send({ related_id: b.id, kind: 'substitute' }).expect(401);
    const rows = await fx.pool.query(
      `select 1 from product_relation where company_id = $1 and product_id = $2`,
      [fx.companyId, a.id],
    );
    expect(rows.rowCount).toBe(0);
  });

  it('empty overview exposes only the approved kinds and all published boundaries', async () => {
    const p = await newProduct('C6-EMPTY');
    const res = await fx.api().get(`/api/v1/products/${p.id}/relations`).expect(200);
    expect(res.body.scope).toBe('central');
    expect(res.body.product).toMatchObject({ id: p.id, code: 'C6-EMPTY', status: 'active' });
    expect(res.body.items).toEqual([]);
    expect(res.body.counts).toEqual({ outgoing: 0, incoming: 0, substitute: 0, complement: 0, truncated: false });
    expect(res.body.kinds.map((k: { kind: string }) => k.kind)).toEqual(['substitute', 'complement']);
    expect(res.body.kinds.find((k: { kind: string }) => k.kind === 'substitute').cycle_policy)
      .toBe('rejected_by_existing_rule');
    expect(res.body.kinds.find((k: { kind: string }) => k.kind === 'complement').cycle_policy)
      .toBe('no_approved_rule');
    expect(res.body.actor).toMatchObject({ can_view: true, can_update: true });
    expect(res.body.downstream_notes_fa.join(' ')).toContain('قیمت');
    expect(res.body.downstream_notes_fa.join(' ')).toContain('سفارش');
    const decisions = res.body.owner_decisions_fa.map((d: { id: string; status: string }) => `${d.id}:${d.status}`);
    expect(decisions).toEqual([
      'C6-D1:BLOCKED', 'C6-D2:UNRESOLVED', 'C6-D3:UNRESOLVED',
      'C6-D4:UNRESOLVED', 'C6-D5:UNRESOLVED', 'C6-D6:BLOCKED',
    ]);
  });

  it('unknown and foreign products are 404, never an empty 200', async () => {
    await fx.api().get(`/api/v1/products/${randomUUID()}/relations`).expect(404);
    await fx.api().post(`/api/v1/products/${randomUUID()}/relations`)
      .send({ related_id: randomUUID(), kind: 'substitute' }).expect(404);
    // A second tenant's product must not leak either.
    const otherCompany = await fx.pool.query<{ id: string }>(
      `insert into company (code, legal_name) values ('c6-other', 'شرکت دیگر')
       on conflict (code) do update set legal_name = excluded.legal_name returning id`,
    );
    const foreign = await fx.pool.query<{ id: string }>(
      `insert into product (company_id, code, name, category_id, base_uom_id)
       values ($1, 'C6-FOREIGN', 'کالای شرکت دیگر', $2, $3) returning id`,
      [otherCompany.rows[0].id, fx.categoryId, fx.uomId],
    );
    await fx.api().get(`/api/v1/products/${foreign.rows[0].id}/relations`).expect(404);
    const mine = await newProduct('C6-MINE');
    await fx.api().post(`/api/v1/products/${mine.id}/relations`)
      .send({ related_id: foreign.rows[0].id, kind: 'substitute' }).expect(404);
  });

  it('invalid ids and forged fields are explicit 400s', async () => {
    const p = await newProduct('C6-400');
    const bad = await fx.api().get('/api/v1/products/not-a-uuid/relations').expect(400);
    expect(bad.body.code).toBe('invalid_id');

    const forged = await fx.api().get(`/api/v1/products/${p.id}/relations`)
      .query({ company_id: randomUUID(), tenant_id: 't', permissions: '*' })
      .expect(400);
    expect(forged.body.code).toBe('forbidden_client_field');

    const unknown = await fx.api().get(`/api/v1/products/${p.id}/relations`)
      .query({ include_deleted: 'true' }).expect(400);
    expect(unknown.body.code).toBe('unsupported_request_field');

    const domainHeader = await fx.api().get(`/api/v1/products/${p.id}/relations`)
      .set('x-domain-id', randomUUID()).expect(400);
    expect(domainHeader.body.code).toBe('domain_context_not_supported');

    const domainQuery = await fx.api().get(`/api/v1/products/${p.id}/relations`)
      .query({ domain_id: randomUUID() }).expect(400);
    expect(domainQuery.body.code).toBe('domain_property_rejected');

    const badKind = await fx.api().post(`/api/v1/products/${p.id}/relations`)
      .send({ related_id: randomUUID(), kind: 'bundle' }).expect(400);
    expect(badKind.body.code).toBe('validation_failed');

    const noConfirmType = await fx.api().post(`/api/v1/products/${p.id}/relations`)
      .send({ related_id: randomUUID(), kind: 'substitute', confirm_add: 'yes' }).expect(400);
    expect(noConfirmType.body.code).toBe('validation_failed');

    const forgedBody = await fx.api().post(`/api/v1/products/${p.id}/relations`)
      .send({ related_id: randomUUID(), kind: 'substitute', company_id: randomUUID() }).expect(400);
    expect(forgedBody.body.code).toBe('forbidden_client_field');

    const reciprocal = await fx.api().post(`/api/v1/products/${p.id}/relations`)
      .send({ related_id: randomUUID(), kind: 'substitute', reciprocal: true }).expect(400);
    expect(reciprocal.body.code).toBe('forbidden_client_field');
    expect(reciprocal.body.details.fields).toContain('reciprocal');
  });

  it('viewer can read but cannot mutate; no control data is advertised', async () => {
    const p = await fx.api(viewerToken).get(`/api/v1/products/${(await newProduct('C6-VIEW')).id}/relations`)
      .expect(200);
    expect(p.body.actor.can_update).toBe(false);
    expect(p.body.actor.unavailable_reason_fa).toContain('master.product.update');

    const a = await newProduct('C6-VIEW-A');
    const b = await newProduct('C6-VIEW-B');
    const denied = await fx.api(viewerToken).post(`/api/v1/products/${a.id}/relations`)
      .send({ related_id: b.id, kind: 'substitute' }).expect(403);
    expect(denied.body.code ?? denied.body.message).toBeTruthy();
  });
});

describe('C6 — relation writes preserve the approved model', () => {
  it('creates a directed substitute and audits it without creating the inverse', async () => {
    const a = await newProduct('C6-W-A');
    const b = await newProduct('C6-W-B');
    const created = await fx.api().post(`/api/v1/products/${a.id}/relations`)
      .send({ related_id: b.id, kind: 'substitute', priority: 10, confirm_add: true })
      .expect(201);
    expect(created.body).toMatchObject({
      product_id: a.id, related_id: b.id, kind: 'substitute', kind_label_fa: 'جایگزین',
      priority: 10, direction: 'outgoing', editable: true, removable: true,
    });
    expect(created.body.related).toMatchObject({ id: b.id, code: 'C6-W-B', status: 'active', warning_fa: null });

    // No reciprocal/auto-inverse row may exist (C6-D2 stays open).
    const inverse = await fx.pool.query(
      `select 1 from product_relation where company_id = $1 and product_id = $2 and related_id = $3`,
      [fx.companyId, b.id, a.id],
    );
    expect(inverse.rowCount).toBe(0);

    // The reverse view of B shows the same relation as incoming and read-only.
    const incoming = await fx.api().get(`/api/v1/products/${b.id}/relations`).expect(200);
    expect(incoming.body.counts).toMatchObject({ outgoing: 0, incoming: 1, substitute: 1, complement: 0 });
    expect(incoming.body.items[0]).toMatchObject({
      id: created.body.id, direction: 'incoming', editable: false, removable: false,
    });

    const audit = await fx.pool.query(
      `select action, entity_type, entity_id, after_data from audit_log
        where company_id = $1 and entity_type = 'product_relation' and entity_id = $2`,
      [fx.companyId, created.body.id],
    );
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0].action).toBe('create');
    expect(audit.rows[0].after_data).toMatchObject({ kind: 'substitute', priority: 10 });

    const history = await fx.pool.query(
      `select action from product_catalog_history
        where company_id = $1 and entity_type = 'product_relation' and entity_id = $2`,
      [fx.companyId, created.body.id],
    );
    expect(history.rows.map((r) => r.action)).toEqual(['INSERT']);
  });

  it('rejects self-relation, duplicate and substitute cycles with stable codes', async () => {
    const a = await newProduct('C6-R-A');
    const b = await newProduct('C6-R-B');
    const c = await newProduct('C6-R-C');

    const self = await fx.api().post(`/api/v1/products/${a.id}/relations`)
      .send({ related_id: a.id, kind: 'substitute', confirm_add: true }).expect(400);
    expect(self.body.code).toBe('self_relation');

    await fx.api().post(`/api/v1/products/${a.id}/relations`)
      .send({ related_id: b.id, kind: 'substitute', confirm_add: true }).expect(201);
    const dup = await fx.api().post(`/api/v1/products/${a.id}/relations`)
      .send({ related_id: b.id, kind: 'substitute', confirm_add: true }).expect(409);
    expect(dup.body.code).toBe('duplicate_relation');

    // A→B exists; B→A must be refused as a substitute cycle.
    const cycle = await fx.api().post(`/api/v1/products/${b.id}/relations`)
      .send({ related_id: a.id, kind: 'substitute', confirm_add: true }).expect(400);
    expect(cycle.body.code).toBe('relation_cycle');

    // Complementary cycles are NOT blocked: no approved rule exists (C6-D3).
    await fx.api().post(`/api/v1/products/${b.id}/relations`)
      .send({ related_id: a.id, kind: 'complement', confirm_add: true }).expect(201);
    await fx.api().post(`/api/v1/products/${a.id}/relations`)
      .send({ related_id: b.id, kind: 'complement', confirm_add: true }).expect(201);

    // Longer substitute path C→A→B must also refuse B→C.
    await fx.api().post(`/api/v1/products/${c.id}/relations`)
      .send({ related_id: a.id, kind: 'substitute', confirm_add: true }).expect(201);
    const longCycle = await fx.api().post(`/api/v1/products/${b.id}/relations`)
      .send({ related_id: c.id, kind: 'substitute', confirm_add: true }).expect(400);
    expect(longCycle.body.code).toBe('relation_cycle');
  });

  it('warns about non-active related products without blocking them (C6-D5)', async () => {
    const a = await newProduct('C6-S-A');
    const b = await newProduct('C6-S-B');
    await fx.pool.query(`update product set status = 'blocked' where id = $1 and company_id = $2`, [b.id, fx.companyId]);
    const created = await fx.api().post(`/api/v1/products/${a.id}/relations`)
      .send({ related_id: b.id, kind: 'complement', confirm_add: true }).expect(201);
    expect(created.body.related.status).toBe('blocked');
    expect(created.body.related.status_label_fa).toBe('مسدود');
    expect(created.body.related.warning_fa).toContain('مسدود');
  });

  it('edits priority in place, records before/after, and refuses a no-op edit', async () => {
    const a = await newProduct('C6-P-A');
    const b = await newProduct('C6-P-B');
    const created = await fx.api().post(`/api/v1/products/${a.id}/relations`)
      .send({ related_id: b.id, kind: 'complement', priority: 100, confirm_add: true }).expect(201);

    const updated = await fx.api().patch(`/api/v1/products/${a.id}/relations/${created.body.id}`)
      .send({ priority: 5 }).expect(200);
    expect(updated.body.priority).toBe(5);

    const unchanged = await fx.api().patch(`/api/v1/products/${a.id}/relations/${created.body.id}`)
      .send({ priority: 5 }).expect(400);
    expect(unchanged.body.code).toBe('relation_unchanged');

    const wrongField = await fx.api().patch(`/api/v1/products/${a.id}/relations/${created.body.id}`)
      .send({ kind: 'substitute' }).expect(400);
    expect(wrongField.body.code).toBe('unsupported_request_field');

    const audit = await fx.pool.query(
      `select before_data, after_data from audit_log
        where company_id = $1 and entity_type = 'product_relation' and entity_id = $2 and action = 'update'`,
      [fx.companyId, created.body.id],
    );
    expect(audit.rows[0].before_data).toMatchObject({ priority: 100 });
    expect(audit.rows[0].after_data).toMatchObject({ priority: 5 });

    const history = await fx.api().get(`/api/v1/products/${a.id}/relations/history`).expect(200);
    expect(history.body.items[0]).toMatchObject({ action: 'UPDATE', event_label_fa: 'ویرایش رابطه', priority: 5 });
    expect(history.body.items[0].after_data).toBeUndefined();
    expect(history.body.items[0].before_data).toBeUndefined();
  });

  it('deletes only an outgoing relation of this product, with audit and history', async () => {
    const a = await newProduct('C6-D-A');
    const b = await newProduct('C6-D-B');
    const created = await fx.api().post(`/api/v1/products/${a.id}/relations`)
      .send({ related_id: b.id, kind: 'substitute', confirm_add: true }).expect(201);

    // Deleting through the wrong product is a 404 (no cross-product deletion).
    await fx.api().delete(`/api/v1/products/${b.id}/relations/${created.body.id}`).expect(404);

    const removed = await fx.api().delete(`/api/v1/products/${a.id}/relations/${created.body.id}`).expect(200);
    expect(removed.body).toEqual({ deleted: true, relation_id: created.body.id });

    await fx.api().delete(`/api/v1/products/${a.id}/relations/${created.body.id}`).expect(404);

    const audit = await fx.pool.query(
      `select before_data from audit_log
        where company_id = $1 and entity_type = 'product_relation' and entity_id = $2 and action = 'delete'`,
      [fx.companyId, created.body.id],
    );
    expect(audit.rows[0].before_data).toMatchObject({ kind: 'substitute' });
    const history = await fx.pool.query(
      `select action from product_catalog_history
        where company_id = $1 and entity_type = 'product_relation' and entity_id = $2 order by id`,
      [fx.companyId, created.body.id],
    );
    expect(history.rows.map((r) => r.action)).toEqual(['INSERT', 'DELETE']);
  });

  it('filters by kind and direction without leaking other products', async () => {
    const a = await newProduct('C6-F-A');
    const b = await newProduct('C6-F-B');
    const c = await newProduct('C6-F-C');
    await fx.api().post(`/api/v1/products/${a.id}/relations`)
      .send({ related_id: b.id, kind: 'substitute', confirm_add: true }).expect(201);
    await fx.api().post(`/api/v1/products/${a.id}/relations`)
      .send({ related_id: c.id, kind: 'complement', confirm_add: true }).expect(201);
    await fx.api().post(`/api/v1/products/${c.id}/relations`)
      .send({ related_id: a.id, kind: 'complement', confirm_add: true }).expect(201);

    const onlyComplement = await fx.api()
      .get(`/api/v1/products/${a.id}/relations`).query({ kind: 'complement', direction: 'both' }).expect(200);
    // A→C (complement) is outgoing and C→A (complement) is the explicitly stored
    // incoming row: the same counterpart appears on both sides, never a duplicate
    // of the outgoing substitute to C6-F-B.
    expect(
      onlyComplement.body.items.map((i: { related: { code: string }; direction: string }) => `${i.related.code}:${i.direction}`),
    ).toEqual(['C6-F-C:outgoing', 'C6-F-C:incoming']);

    const outgoingOnly = await fx.api()
      .get(`/api/v1/products/${a.id}/relations`).query({ direction: 'outgoing' }).expect(200);
    expect(outgoingOnly.body.items.every((i: { direction: string }) => i.direction === 'outgoing')).toBe(true);
    expect(outgoingOnly.body.items).toHaveLength(2);

    const incomingOnly = await fx.api()
      .get(`/api/v1/products/${a.id}/relations`).query({ direction: 'incoming' }).expect(200);
    expect(incomingOnly.body.items).toHaveLength(1);
    expect(incomingOnly.body.items[0]).toMatchObject({ direction: 'incoming', kind: 'complement' });

    const badDirection = await fx.api()
      .get(`/api/v1/products/${a.id}/relations`).query({ direction: 'sideways' }).expect(400);
    expect(badDirection.body.code).toBe('validation_failed');
  });
});

describe('C6 — bounded traversal and downstream neutrality', () => {
  it('graph traversal is depth/node bounded and never invents symmetry', async () => {
    const a = await newProduct('C6-G-A');
    const b = await newProduct('C6-G-B');
    const c = await newProduct('C6-G-C');
    await fx.api().post(`/api/v1/products/${a.id}/relations`)
      .send({ related_id: b.id, kind: 'substitute', confirm_add: true }).expect(201);
    await fx.api().post(`/api/v1/products/${b.id}/relations`)
      .send({ related_id: c.id, kind: 'substitute', confirm_add: true }).expect(201);

    const depth1 = await fx.api().get(`/api/v1/products/${a.id}/relations/graph`)
      .query({ depth: 1 }).expect(200);
    expect(depth1.body.nodes.map((n: { code: string }) => n.code)).toEqual(['C6-G-A', 'C6-G-B']);
    expect(depth1.body.nodes[0]).toMatchObject({ code: 'C6-G-A', depth: 0 });

    const depth2 = await fx.api().get(`/api/v1/products/${a.id}/relations/graph`)
      .query({ depth: 2 }).expect(200);
    expect(depth2.body.nodes.map((n: { code: string }) => n.code)).toEqual(['C6-G-A', 'C6-G-B', 'C6-G-C']);
    expect(depth2.body.technical_limits).toEqual({ max_depth: 3, max_nodes: 100, requested_depth: 2 });
    expect(depth2.body.semantics_fa).toContain('متقارن');

    // Traversal is outgoing-only: starting from C yields C alone.
    const fromLeaf = await fx.api().get(`/api/v1/products/${c.id}/relations/graph`)
      .query({ depth: 3 }).expect(200);
    expect(fromLeaf.body.nodes.map((n: { code: string }) => n.code)).toEqual(['C6-G-C']);

    const tooDeep = await fx.api().get(`/api/v1/products/${a.id}/relations/graph`)
      .query({ depth: 99 }).expect(400);
    expect(tooDeep.body.code).toBe('validation_failed');
  });

  it('creating a relation changes no product, price, stock, document or bundle row', async () => {
    const a = await newProduct('C6-N-A');
    const b = await newProduct('C6-N-B');
    const beforeProducts = await fx.pool.query(
      `select id, status, row_version from product where company_id = $1 order by id`,
      [fx.companyId],
    );
    // `product_bundle` is tenant-scoped by RLS on both product ids (no company_id
    // column); scope the count through the owning product instead.
    const bundleCount = async (): Promise<number> => (await fx.pool.query<{ n: number }>(
      `select count(*)::int as n from product_bundle b
         join product p on p.id = b.bundle_product_id and p.company_id = $1`,
      [fx.companyId],
    )).rows[0].n;
    const beforeBundles = await bundleCount();
    await fx.api().post(`/api/v1/products/${a.id}/relations`)
      .send({ related_id: b.id, kind: 'substitute', confirm_add: true }).expect(201);
    const afterProducts = await fx.pool.query(
      `select id, status, row_version from product where company_id = $1 order by id`,
      [fx.companyId],
    );
    expect(afterProducts.rows).toEqual(beforeProducts.rows);
    expect(await bundleCount()).toBe(beforeBundles);
  });

  it('relation rows obey tenant isolation and RLS stays enforced', async () => {
    const rel = await fx.pool.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relrowsecurity, relforcerowsecurity from pg_class where oid = 'public.product_relation'::regclass`,
    );
    expect(rel.rows[0]).toMatchObject({ relrowsecurity: true, relforcerowsecurity: true });
    const policies = await fx.pool.query(
      `select polname from pg_policy where polrelid = 'public.product_relation'::regclass order by polname`,
    );
    expect(policies.rowCount).toBeGreaterThan(0);
  });
});
