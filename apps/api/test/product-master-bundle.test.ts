import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupProductMasterFixture, createProduct, type Fixture } from './product-master-fixture';

/**
 * تست‌های رفتاریِ D5 — bundle فقط کاتالوگ در P1:
 * ترکیبِ تعریف/نمایش می‌شود؛ سفارش/فاکتور روی SKU بسته رد می‌شود (service + hard-guard).
 */
let fx: Fixture;

beforeAll(async () => {
  fx = await setupProductMasterFixture('greendms_pm_bundle');
}, 180_000);

afterAll(async () => {
  await fx?.teardown();
});

async function makeBundle() {
  const component = await createProduct(fx, { name: 'جزء بسته', code: 'CMP-1-' + Math.random().toString(36).slice(2, 8) });
  const bundle = await createProduct(fx, { name: 'بستهٔ پذیرایی', code: 'BDL-1-' + Math.random().toString(36).slice(2, 8) });
  const res = await fx
    .api()
    .put(`/api/v1/products/${bundle.id}/bundle`)
    .send({
      items: [{ component_product_id: component.id, qty: 2 }],
      confirm_sensitive: true,
    })
    .expect(200);
  return { component, bundle, setResponse: res };
}

describe('D5 — ترکیبِ کاتالوگیِ بسته', () => {
  it('تنظیمِ ترکیب بدونِ confirm_sensitive → 400 (اجزا حساس — D4)', async () => {
    const component = await createProduct(fx, { name: 'جزء ۲', code: 'CMP-2-' + Math.random().toString(36).slice(2, 8) });
    const bundle = await createProduct(fx, { name: 'بسته ۲', code: 'BDL-2-' + Math.random().toString(36).slice(2, 8) });
    const res = await fx
      .api()
      .put(`/api/v1/products/${bundle.id}/bundle`)
      .send({ items: [{ component_product_id: component.id, qty: 1 }] })
      .expect(400);
    expect(res.body.code).toBe('sensitive_change_requires_confirmation');
  });

  it('تنظیمِ ترکیب با تأیید → 200؛ خوانشِ ترکیب درست است', async () => {
    const { component, bundle, setResponse } = await makeBundle();
    expect(setResponse.body.length).toBe(1);
    expect(setResponse.body[0].component_product_id).toBe(component.id);
    const list = await fx.api().get(`/api/v1/products/${bundle.id}/bundle`).expect(200);
    expect(list.body[0].component_code).toBe(component.code);
    expect(Number(list.body[0].qty)).toBe(2);
  });

  it('خودارجاع/جزءِ تکراری/بستهٔ تو در تو → 400', async () => {
    const a = await createProduct(fx, { name: 'الف', code: 'BDL-A-' + Math.random().toString(36).slice(2, 8) });
    // خودارجاع
    await fx.api().put(`/api/v1/products/${a.id}/bundle`)
      .send({ items: [{ component_product_id: a.id, qty: 1 }], confirm_sensitive: true })
      .expect(400);
    // جزءِ تکراری
    const c = await createProduct(fx, { name: 'جیم', code: 'BDL-C-' + Math.random().toString(36).slice(2, 8) });
    await fx.api().put(`/api/v1/products/${a.id}/bundle`)
      .send({
        items: [
          { component_product_id: c.id, qty: 1 },
          { component_product_id: c.id, qty: 2 },
        ],
        confirm_sensitive: true,
      })
      .expect(400);
    // بستهٔ تو در تو
    await fx.api().put(`/api/v1/products/${a.id}/bundle`)
      .send({ items: [{ component_product_id: c.id, qty: 1 }], confirm_sensitive: true })
      .expect(200);
    const outer = await createProduct(fx, { name: 'بیرونی', code: 'BDL-O-' + Math.random().toString(36).slice(2, 8) });
    const res = await fx.api().put(`/api/v1/products/${outer.id}/bundle`)
      .send({ items: [{ component_product_id: a.id, qty: 1 }], confirm_sensitive: true })
      .expect(400);
    expect(res.body.code).toBe('nested_bundle_forbidden');
  });

  it('D5: سفارش روی SKU بسته → 400 bundle_not_orderable', async () => {
    const { bundle } = await makeBundle();
    // مشتری/شعبه
    const branch = await fx.pool.query<{ id: string }>(
      `insert into branch (company_id, code, name) values ($1, 'BR-BDL-' || gen_random_uuid()::text, 'شعبه') returning id`,
      [fx.companyId],
    );
    const custPerson = await fx.pool.query<{ id: string }>(
      `insert into person (company_id, code, first_name, last_name) values ($1, 'PP-' || gen_random_uuid()::text, 'مشتری', 'تست') returning id`,
      [fx.companyId],
      );
      const customer = await fx.pool.query<{ id: string }>(
      `insert into customer (person_id, branch_id, code) values ($1, $2, 'CB-' || gen_random_uuid()::text) returning id`,
      [custPerson.rows[0].id, branch.rows[0].id],
      );
    // hard-guard سطحِ DB: درجِ مستقیمِ خطِ سفارش روی SKU بسته باید رد شود
    const order = await fx.pool.query<{ id: string }>(
      `insert into sales_order (branch_id, customer_id, status, doc_number, fiscal_year) values ($1, $2, 'draft', gen_random_uuid()::text, 1405) returning id`,
      [branch.rows[0].id, customer.rows[0].id],
    );
    await expect(
      fx.pool.query(
        `insert into sales_order_line (sales_order_id, line_no, product_id, qty, qty_base, unit_price, line_total)
         values ($1, 1, $2, 1, 1, 100, 100)`,
        [order.rows[0].id, bundle.id],
      ),
    ).rejects.toThrow();
  });

  it('D5: خطِ فاکتور روی SKU بسته رد می‌شود (hard-guard سطحِ DB)', async () => {
    const { bundle } = await makeBundle();
    const branch = await fx.pool.query<{ id: string }>(
      `insert into branch (company_id, code, name) values ($1, 'BR-BDL2-' || gen_random_uuid()::text, 'شعبه ۲') returning id`,
      [fx.companyId],
    );
    const custPerson = await fx.pool.query<{ id: string }>(
      `insert into person (company_id, code, first_name, last_name) values ($1, 'PP-' || gen_random_uuid()::text, 'مشتری', 'تست') returning id`,
      [fx.companyId],
      );
      const customer = await fx.pool.query<{ id: string }>(
      `insert into customer (person_id, branch_id, code) values ($1, $2, 'CB2-' || gen_random_uuid()::text) returning id`,
      [custPerson.rows[0].id, branch.rows[0].id],
      );
    const series = await fx.pool.query<{ id: string }>(
      `insert into document_series (branch_id, doc_kind, fiscal_year) values ($1, 'invoice', 1405) returning id`,
      [branch.rows[0].id],
    );
    const inv = await fx.pool.query<{ id: string }>(
      `insert into invoice (branch_id, customer_id, series_id, doc_number, fiscal_year, invoice_date, subtotal, grand_total)
       values ($1, $2, $3, gen_random_uuid()::text, 1405, current_date, 100, 100) returning id`,
      [branch.rows[0].id, customer.rows[0].id, series.rows[0].id],
    );
    await expect(
      fx.pool.query(
        `insert into invoice_line (invoice_id, line_no, product_id, qty, unit_price, line_total)
         values ($1, 1, $2, 1, 100, 100)`,
        [inv.rows[0].id, bundle.id],
      ),
    ).rejects.toThrow(/P5|بسته/);
  });

  it('SKU عادی بدونِ محدودیت سفارش می‌خورد (کنترلِ منفی)', async () => {
    const p = await createProduct(fx, { name: 'کالای عادی', code: 'NORMAL-1-' + Math.random().toString(36).slice(2, 8) });
    const branch = await fx.pool.query<{ id: string }>(
      `insert into branch (company_id, code, name) values ($1, 'BR-N-' || gen_random_uuid()::text, 'شعبه ۳') returning id`,
      [fx.companyId],
    );
    const custPerson = await fx.pool.query<{ id: string }>(
      `insert into person (company_id, code, first_name, last_name) values ($1, 'PP-' || gen_random_uuid()::text, 'مشتری', 'تست') returning id`,
      [fx.companyId],
      );
      const customer = await fx.pool.query<{ id: string }>(
      `insert into customer (person_id, branch_id, code) values ($1, $2, 'CN-' || gen_random_uuid()::text) returning id`,
      [custPerson.rows[0].id, branch.rows[0].id],
      );
    const order = await fx.pool.query<{ id: string }>(
      `insert into sales_order (branch_id, customer_id, status, doc_number, fiscal_year) values ($1, $2, 'draft', gen_random_uuid()::text, 1405) returning id`,
      [branch.rows[0].id, customer.rows[0].id],
    );
    await fx.pool.query(
      `insert into sales_order_line (sales_order_id, line_no, product_id, qty, qty_base, unit_price, line_total)
       values ($1, 1, $2, 1, 1, 100, 100)`,
      [order.rows[0].id, p.id],
    );
  });
});
