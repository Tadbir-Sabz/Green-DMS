import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupProductMasterFixture, createProduct, type Fixture } from './product-master-fixture';

/**
 * تست‌های رفتاریِ snapshot اسناد (M-1/§D + D3): ثبت در لحظهٔ درجِ خط،
 * تغییرناپذیری پس از تغییرِ کاتالوگ، fallback نمایشی برای ردیف‌های legacy.
 */
let fx: Fixture;

beforeAll(async () => {
  fx = await setupProductMasterFixture('greendms_pm_snap');
}, 180_000);

afterAll(async () => {
  await fx?.teardown();
});

/** ساختِ زنجیرهٔ حداقلیِ سفارش (مشتری/شعبه) و درجِ مستقیمِ خطِ سفارش */
async function seedOrderLine(productId: string, packagingId?: string | null) {
  const branch = await fx.pool.query<{ id: string }>(
    `insert into branch (company_id, code, name) values ($1, 'BR-SNAP-' || gen_random_uuid()::text, 'شعبه') returning id`,
    [fx.companyId],
  );
  const custPerson = await fx.pool.query<{ id: string }>(
    `insert into person (company_id, code, first_name, last_name) values ($1, 'PP-' || gen_random_uuid()::text, 'مشتری', 'تست') returning id`,
    [fx.companyId],
    );
    const customer = await fx.pool.query<{ id: string }>(
      `insert into customer (person_id, branch_id, code) values ($1, $2, 'CS-' || gen_random_uuid()::text) returning id`,
      [custPerson.rows[0].id, branch.rows[0].id],
    );
  const order = await fx.pool.query<{ id: string }>(
    `insert into sales_order (branch_id, customer_id, status, doc_number, fiscal_year) values ($1, $2, 'draft', gen_random_uuid()::text, 1405) returning id`,
    [branch.rows[0].id, customer.rows[0].id],
  );
  const line = await fx.pool.query<{ id: string }>(
    `insert into sales_order_line (sales_order_id, line_no, product_id, packaging_id, qty, qty_base, unit_price, line_total)
     values ($1, 1, $2, $3, 2, 24, 100, 200) returning id`,
    [order.rows[0].id, productId, packagingId ?? null],
  );
  return { orderId: order.rows[0].id, lineId: line.rows[0].id };
}

describe('§D — snapshot در لحظهٔ درجِ خط', () => {
  it('نام/کد/واحدِ خط در لحظهٔ درج ثبت می‌شود', async () => {
    const p = await createProduct(fx, { name: 'ماست ساده', code: 'SNAP-1' });
    const { lineId } = await seedOrderLine(p.id);
    const row = await fx.pool.query(
      `select product_name, product_code, uom_title, packaging_factor from sales_order_line where id = $1`,
      [lineId],
    );
    expect(row.rows[0].product_name).toBe('ماست ساده');
    expect(row.rows[0].product_code).toBe('SNAP-1');
    expect(row.rows[0].uom_title).toBe('عدد');
    expect(Number(row.rows[0].packaging_factor)).toBe(1);
  });

  it('تغییرِ نامِ محصول، تاریخِ سند را بازنویسی نمی‌کند', async () => {
    const p = await createProduct(fx, { name: 'کالای قدیمی', code: 'SNAP-2' });
    const { lineId } = await seedOrderLine(p.id);
    await fx.pool.query(`update product set name = 'کالای جدید' where id = $1`, [p.id]);
    const row = await fx.pool.query(
      `select product_name from sales_order_line where id = $1`,
      [lineId],
    );
    expect(row.rows[0].product_name).toBe('کالای قدیمی');
  });

  it('view مشترکِ نمایش: snapshot_source + fallback برای ردیفِ legacy (NULL)', async () => {
    const p = await createProduct(fx, { name: 'کالای view', code: 'SNAP-3' });
    const { lineId } = await seedOrderLine(p.id);

    // ردیفِ legacy (قبل از deploy): snapshotها NULL — با نقشِ replica تریگرِ پرکننده دور زده می‌شود
    await fx.pool.query(`set session_replication_role = replica`);
    await fx.pool.query(`update sales_order_line set product_name = null, product_code = null, uom_title = null where id = $1`, [lineId]);
    await fx.pool.query(`reset session_replication_role`);
    const view = await fx.pool.query(
      `select product_name, product_code, snapshot_source from v_document_line_display where line_id = $1`,
      [lineId],
    );
    expect(view.rows[0].snapshot_source).toBe('catalog');
    expect(view.rows[0].product_name).toBe('کالای view');
  });

  it('D3: qty_base ثبت‌شده با تغییرِ فاکتورِ تبدیل عوض نمی‌شود', async () => {
    const p = await createProduct(fx, { name: 'کالای تبدیل', code: 'SNAP-4' });
    const pack = await fx.api().post('/api/v1/packaging/product-packaging')
      .send({
        product_id: p.id,
        uom_id: fx.uomBoxId,
        factor_to_base: 12,
        confirm_sensitive: true,
      })
      .expect(201);
    const { lineId } = await seedOrderLine(p.id, pack.body.id);

    // snapshot سطحِ بسته‌بندی
    const row = await fx.pool.query(
      `select packaging_factor, uom_title, packaging_label, qty_base from sales_order_line where id = $1`,
      [lineId],
    );
    expect(Number(row.rows[0].packaging_factor)).toBe(12);
    expect(row.rows[0].uom_title).toBe('کارتن');
    expect(row.rows[0].packaging_label).toContain('×12');

    // تغییرِ فاکتورِ تبدیل در کاتالوگ — خطِ قبلی نباید تغییر کند
    await fx.pool.query(`update product_packaging set factor_to_base = 24 where id = $1`, [pack.body.id]);
    const after = await fx.pool.query(
      `select packaging_factor, qty_base from sales_order_line where id = $1`,
      [lineId],
    );
    expect(Number(after.rows[0].packaging_factor)).toBe(12);
    expect(Number(after.rows[0].qty_base)).toBe(24); // مقدارِ نهاییِ ثبت‌شده — هرگز بازمحاسبه نمی‌شود
  });

  it('snapshot فاکتور: ستون‌های لنگرِ واحد (qty_base/packaging) روی invoice_line', async () => {
    const p = await createProduct(fx, { name: 'کالای فاکتور', code: 'SNAP-5' });
    const branch = await fx.pool.query<{ id: string }>(
      `insert into branch (company_id, code, name) values ($1, 'BR-INV-' || gen_random_uuid()::text, 'شعبه ۲') returning id`,
      [fx.companyId],
    );
    const custPerson = await fx.pool.query<{ id: string }>(
      `insert into person (company_id, code, first_name, last_name) values ($1, 'PP-' || gen_random_uuid()::text, 'مشتری', 'تست') returning id`,
      [fx.companyId],
      );
      const customer = await fx.pool.query<{ id: string }>(
      `insert into customer (person_id, branch_id, code) values ($1, $2, 'CI-' || gen_random_uuid()::text) returning id`,
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
    await fx.pool.query(
      `insert into invoice_line (invoice_id, line_no, product_id, qty, unit_price, line_total)
       values ($1, 1, $2, 3, 100, 300)`,
      [inv.rows[0].id, p.id],
    );
    const row = await fx.pool.query(
      `select product_name, qty_base, uom_title, packaging_factor from invoice_line where invoice_id = $1`,
      [inv.rows[0].id],
    );
    expect(row.rows[0].product_name).toBe('کالای فاکتور');
    expect(Number(row.rows[0].qty_base)).toBe(3); // qty × factor(1) — یک‌بار نوشته می‌شود
    expect(row.rows[0].uom_title).toBe('عدد');
  });
});
