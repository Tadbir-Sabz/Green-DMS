import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProduct, setupProductMasterFixture, type Fixture } from './product-master-fixture';
import { parseCsv } from '../src/common/csv';

/**
 * TASK-PM-01D-M3 — native PostgreSQL evidence for the filtered CSV export.
 * The fixture is a disposable per-file database; no shared/production DB is used.
 */
let fx: Fixture;
let viewerToken = '';

const csvText = (res: request.Response): string =>
  typeof res.text === 'string' ? res.text : Buffer.from(res.body ?? '').toString('utf8');

beforeAll(async () => {
  fx = await setupProductMasterFixture('greendms_pm_export');
  const hashRow = await fx.pool.query<{ hash: string }>(
    `select password_hash as hash from app_user where username = 'pm_admin'`,
  );
  const person = await fx.pool.query<{ id: string }>(
    `insert into person (company_id, code, first_name, last_name)
     values ($1, 'NO-EXPORT', 'کاربر', 'بدون مجوز') returning id`,
    [fx.companyId],
  );
  await fx.pool.query(
    `insert into app_user (person_id, username, password_hash, access_level)
     values ($1, 'pm_no_export', $2, 'web')`,
    [person.rows[0].id, hashRow.rows[0].hash],
  );
  const role = await fx.pool.query<{ id: string }>(
    `insert into role (company_id, code, name)
     values ($1, 'pm_no_export_role', 'نقش بدون مجوز') returning id`,
    [fx.companyId],
  );
  await fx.pool.query(
    `insert into user_role (app_user_id, role_id)
     select u.id, $1 from app_user u where u.username = 'pm_no_export'`,
    [role.rows[0].id],
  );
  viewerToken = await fx.loginAs('pm_no_export', fx.adminPassword);
}, 180_000);

afterAll(async () => {
  await fx?.teardown();
});

describe('GET /products/export — central catalog portability', () => {
  it('exports a consistent filtered CSV with resolved reference codes and one primary barcode', async () => {
    const first = await createProduct(fx, {
      code: 'P-EX-001',
      name: 'کالا، «صادراتی»',
      name_latin: 'Portable, "A"',
    });
    await createProduct(fx, { code: 'P-EX-002', name: '=SUM(A1:A2)' });
    await fx.api().post(`/api/v1/products/${first.id}/barcodes`).send({
      barcode: 'BAR-SECONDARY', kind: 'other', is_primary: false,
    }).expect(201);
    await fx.api().post(`/api/v1/products/${first.id}/barcodes`).send({
      barcode: 'BAR-PRIMARY', kind: 'other', is_primary: true,
    }).expect(201);

    const res = await fx.api()
      .get('/api/v1/products/export')
      .query({ q: 'P-EX', sort: 'code_asc' })
      .expect(200);

    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/products-\d{8}\.csv/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-product-export-row-count']).toBe('2');
    expect(res.headers['x-product-export-truncated']).toBe('false');
    expect(res.headers['x-product-export-max-rows']).toBe('10000');

    const csv = csvText(res);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(3);
    expect(rows[0][0]).toBe('code');
    expect(rows[0].length).toBe(20);
    const byCode = Object.fromEntries(rows.slice(1).map((r) => [r[0], r]));
    expect(byCode['P-EX-001'][1]).toBe('کالا، «صادراتی»');
    expect(byCode['P-EX-001'][2]).toBe('Portable, "A"');
    expect(byCode['P-EX-001'][3]).toBe('PMCAT');
    expect(byCode['P-EX-001'][6]).toBe('pm_piece');
    expect(byCode['P-EX-001'][8]).toBe('BAR-PRIMARY');
    expect(byCode['P-EX-001'][9]).toBe('active');
    expect(byCode['P-EX-002'][1]).toBe("'=SUM(A1:A2)");
  });

  it('bounds the snapshot and visibly marks truncation instead of a silent partial file', async () => {
    const res = await fx.api()
      .get('/api/v1/products/export')
      .query({ q: 'P-EX', limit: 1, sort: 'code_desc' })
      .expect(200);
    expect(res.headers['x-product-export-truncated']).toBe('true');
    expect(res.headers['x-product-export-row-count']).toBe('1');
    expect(res.headers['x-product-export-max-rows']).toBe('1');
    const rows = parseCsv(csvText(res));
    expect(rows).toHaveLength(2);
    expect(rows[1][0]).toBe('P-EX-002');
  });

  it('never exports another company’s product, even when queried by its exact code', async () => {
    const other = await fx.pool.query<{ id: string }>(
      `insert into company (code, legal_name) values ('PMOTHER', 'شرکت دیگر') returning id`,
    );
    const category = await fx.pool.query<{ id: string }>(
      `insert into product_category (company_id, code, name)
       values ($1, 'OTHERCAT', 'گروه شرکت دیگر') returning id`,
      [other.rows[0].id],
    );
    await fx.pool.query(
      `insert into product (company_id, code, name, category_id, base_uom_id)
       values ($1, 'P-OTHER-SECRET', 'کالای محرمانه', $2, $3)`,
      [other.rows[0].id, category.rows[0].id, fx.uomId],
    );

    const res = await fx.api()
      .get('/api/v1/products/export')
      .query({ q: 'P-OTHER-SECRET' })
      .expect(200);
    expect(res.headers['x-product-export-row-count']).toBe('0');
    expect(res.headers['x-product-export-truncated']).toBe('false');
    expect(csvText(res)).not.toContain('P-OTHER-SECRET');
    expect(parseCsv(csvText(res))).toHaveLength(1); // header only
  });

  it('records a company-scoped export audit event without product data in the payload', async () => {
    await fx.api().get('/api/v1/products/export').query({ status: 'active' }).expect(200);
    const { rows } = await fx.pool.query<{
      company_id: string;
      action: string;
      entity_type: string;
      after_data: { row_count: number; truncated: boolean; filters: Record<string, unknown> };
    }>(
      `select company_id, action, entity_type, after_data from audit_log
       where company_id = $1 and action = 'export' and entity_type = 'product_catalog'
       order by at desc limit 1`,
      [fx.companyId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('export');
    expect(rows[0].after_data.truncated).toBe(false);
    expect(rows[0].after_data.filters.status).toBe('active');
    expect(typeof rows[0].after_data.row_count).toBe('number');
    expect(JSON.stringify(rows[0].after_data)).not.toContain('P-EX-001');
  });

  it('rejects unauthenticated, unauthorized and invalid-boundary requests', async () => {
    await request(fx.app.getHttpServer()).get('/api/v1/products/export').expect(401);
    const forbidden = await fx.api(viewerToken).get('/api/v1/products/export').expect(403);
    expect(forbidden.body.code).toBe('forbidden');
    await fx.api().get('/api/v1/products/export').query({ limit: 10001 }).expect(400);
    await fx.api().get('/api/v1/products/export').query({ status: 'invented' }).expect(400);
  });
});
