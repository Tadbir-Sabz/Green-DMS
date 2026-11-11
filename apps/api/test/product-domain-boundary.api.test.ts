import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createProduct, setupProductMasterFixture, type Fixture } from './product-master-fixture';

/**
 * TASK-PM-02 — شواهد PostgreSQL بومی + HTTP واقعی برای مرز مرکزی/دامنهای.
 * هر فایل دیتابیس یکبارمصرف خودش را میسازد؛ هیچ DB مشترک/تولیدی لمس نمیشود.
 * مثبت · منفی · مرز · چندشرکتی/چنددامنهای.
 */
let fx: Fixture;
let viewerToken = '';

beforeAll(async () => {
  fx = await setupProductMasterFixture('greendms_pm02_boundary');
  const hashRow = await fx.pool.query<{ hash: string }>(
    `select password_hash as hash from app_user where username = 'pm_admin'`,
  );
  const person = await fx.pool.query<{ id: string }>(
    `insert into person (company_id, code, first_name, last_name)
     values ($1, 'NO-BOUNDARY', 'کاربر', 'بدون مجوز') returning id`,
    [fx.companyId],
  );
  await fx.pool.query(
    `insert into app_user (person_id, username, password_hash, access_level)
     values ($1, 'pm_no_boundary', $2, 'web')`,
    [person.rows[0].id, hashRow.rows[0].hash],
  );
  const role = await fx.pool.query<{ id: string }>(
    `insert into role (company_id, code, name)
     values ($1, 'pm_no_boundary_role', 'نقش بدون مجوز') returning id`,
    [fx.companyId],
  );
  await fx.pool.query(
    `insert into user_role (app_user_id, role_id)
     select u.id, $1 from app_user u where u.username = 'pm_no_boundary'`,
    [role.rows[0].id],
  );
  viewerToken = await fx.loginAs('pm_no_boundary', fx.adminPassword);
}, 180_000);

afterAll(async () => {
  await fx?.teardown();
});

describe('TASK-PM-02 central/domain boundary over real HTTP + native PostgreSQL', () => {
  it('POSITIVE: an active central product returns an explicit unresolved domain scope', async () => {
    const p = await createProduct(fx, { code: 'PM02-SCOPE-1', name: 'کالای مرزی' });
    const res = await fx.api().get(`/api/v1/products/${p.id}/domain-scope`).expect(200);
    expect(res.body).toMatchObject({
      product_id: p.id,
      scope: 'central',
      central_status: 'active',
      central_status_label_fa: 'فعال (مرکزی)',
      domain_context: 'unresolved',
      domain_membership: 'unresolved',
      domain_availability: 'unresolved',
      available: false,
      state: 'domain_identity_unresolved',
      central_status_is_domain_availability: false,
    });
    expect(res.body.owner_decisions.map((d: { id: string }) => d.id)).toEqual([
      'PM-B1', 'PM-B2', 'PM-B3', 'PM-B4', 'PM-B5', 'PM-B6', 'PM-B7', 'PM-B8',
    ]);
    expect(res.body).not.toHaveProperty('items');
    expect(res.body).not.toHaveProperty('domains');
  });

  it('POSITIVE/BOUNDARY: a blocked central lifecycle still does not create domain availability', async () => {
    const p = await createProduct(fx, { code: 'PM02-SCOPE-2', name: 'کالای مسدود' });
    await fx.api()
      .patch(`/api/v1/products/${p.id}`)
      .send({ status: 'blocked', confirm_sensitive: true, row_version: p.row_version })
      .expect(200);
    const res = await fx.api().get(`/api/v1/products/${p.id}/domain-scope`).expect(200);
    expect(res.body.central_status).toBe('blocked');
    expect(res.body.domain_availability).toBe('unresolved');
    expect(res.body.domain_membership).toBe('unresolved');
    expect(res.body.available).toBe(false);
  });

  it('NEGATIVE: domain_id in a central product create is rejected and nothing is persisted', async () => {
    const res = await fx.api()
      .post('/api/v1/products')
      .send({
        name: 'کالای قاچاق',
        code: 'PM02-SMUGGLE-1',
        category_id: fx.categoryId,
        base_uom_id: fx.uomId,
        domain_id: randomUUID(),
      })
      .expect(400);
    expect(res.body.code).toBe('domain_property_rejected');
    expect(res.body.details.fields).toContain('domain_id');
    expect(res.body.message_fa).toContain('سراسری کالا');
    const list = await fx.api().get('/api/v1/products').query({ q: 'PM02-SMUGGLE-1' }).expect(200);
    expect(list.body.items).toHaveLength(0);
  });

  it('NEGATIVE: a nested domain property cannot hide behind DTO whitelisting', async () => {
    const res = await fx.api()
      .post('/api/v1/products')
      .send({
        name: 'کالای تو در تو',
        category_id: fx.categoryId,
        base_uom_id: fx.uomId,
        attributes: [{ def_id: randomUUID(), domain_availability: true }],
      })
      .expect(400);
    expect(res.body.code).toBe('domain_property_rejected');
    expect(res.body.details.fields).toContain('domain_availability');
  });

  it('NEGATIVE: a Persian domain column in an update is rejected with the same envelope', async () => {
    const p = await createProduct(fx, { code: 'PM02-PERSIAN-1', name: 'کالای فارسی' });
    const res = await fx.api()
      .patch(`/api/v1/products/${p.id}`)
      .send({ 'وضعیت عرضه': 'فعال', name: 'کالای فارسی ۲' })
      .expect(400);
    expect(res.body.code).toBe('domain_property_rejected');
    expect(res.body.details.fields).toContain('وضعیت عرضه');
    const after = await fx.api().get(`/api/v1/products/${p.id}`).expect(200);
    expect(after.body.name).toBe('کالای فارسی');
  });

  it('NEGATIVE: an English and a Persian domain CSV header are both rejected before any write', async () => {
    for (const header of ['domain_id', 'دامنه']) {
      const res = await fx.api()
        .post('/api/v1/products/import/validate')
        .send({ csv: `code,name,category_code,base_uom_code,${header}\nPM02-X,شیر,PMCAT,pm_piece,A` })
        .expect(400);
      expect(res.body.code).toBe('domain_property_rejected');
      expect(res.body.details.fields).toContain(header);
      expect(res.body.details.source).toBe('csv_header');
    }
  });

  it('POSITIVE/BOUNDARY: a valid CSV and a data cell containing «دامنه» are accepted', async () => {
    const res = await fx.api()
      .post('/api/v1/products/import/validate')
      .send({ csv: 'code,name,category_code,base_uom_code\nPM02-OK,شیر دامنهدار,PMCAT,pm_piece' })
      .expect(200);
    expect(res.body.row_errors).toEqual([]);
    expect(res.body.headers).toContain('name');
  });

  it('NEGATIVE: x-domain-id cannot scope a central domain-scope read', async () => {
    const p = await createProduct(fx, { code: 'PM02-HEADER-1', name: 'کالای هدر' });
    const res = await fx.api()
      .get(`/api/v1/products/${p.id}/domain-scope`)
      .set('x-domain-id', randomUUID())
      .expect(400);
    expect(res.body.code).toBe('domain_context_not_supported');
    expect(res.body.details.source).toBe('x-domain-id');
  });

  it('NEGATIVE: a viewer without master.product.view gets 403 on the domain-scope read', async () => {
    const p = await createProduct(fx, { code: 'PM02-VIEWER-1', name: 'کالای بیننده' });
    await fx.api(viewerToken).get(`/api/v1/products/${p.id}/domain-scope`).expect(403);
  });

  it('CROSS-COMPANY: another company product is a non-leaking 404', async () => {
    const other = await fx.pool.query<{ id: string }>(
      `insert into company (code, legal_name) values ('PM02OTHER', 'شرکت دیگر') returning id`,
    );
    const category = await fx.pool.query<{ id: string }>(
      `insert into product_category (company_id, code, name)
       values ($1, 'OTHERCAT', 'گروه شرکت دیگر') returning id`,
      [other.rows[0].id],
    );
    const foreign = await fx.pool.query<{ id: string }>(
      `insert into product (company_id, code, name, category_id, base_uom_id)
       values ($1, 'PM02-FOREIGN', 'کالای شرکت دیگر', $2, $3) returning id`,
      [other.rows[0].id, category.rows[0].id, fx.uomId],
    );
    const res = await fx.api()
      .get(`/api/v1/products/${foreign.rows[0].id}/domain-scope`)
      .expect(404);
    expect(res.body.code).toBe('product_not_found');
    expect(String(res.body.message_fa)).not.toContain('شرکت دیگر');
  });

  it('NEGATIVE: a malformed product id is 400, not a server error', async () => {
    const res = await fx.api().get('/api/v1/products/not-a-uuid/domain-scope').expect(400);
    expect(res.body.code).toBe('invalid_id');
  });

  it('audits rejected domain-scoped attempts with actor and field names, never raw values', async () => {
    const marker = 'PM02-AUDIT-' + randomUUID();
    await fx.api()
      .post('/api/v1/products')
      .send({
        name: 'کالای ممیزی',
        category_id: fx.categoryId,
        base_uom_id: fx.uomId,
        domain_id: marker,
      })
      .expect(400);
    const audit = await fx.pool.query<{ action: string; after_data: unknown; actor_user_id: string }>(
      `select action, after_data, actor_user_id::text from audit_log
        where action = 'domain_boundary_rejected' order by at desc limit 5`,
    );
    expect(audit.rows.length).toBeGreaterThan(0);
    const entry = audit.rows[0];
    expect(entry.actor_user_id).toBeTruthy();
    expect(String(JSON.stringify(entry.after_data))).toContain('domain_property_rejected');
    expect(String(JSON.stringify(entry.after_data))).not.toContain(marker);
  });
});
