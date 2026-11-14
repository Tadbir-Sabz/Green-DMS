import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupProductMasterFixture, createProduct, type Fixture } from './product-master-fixture';

/**
 * TASK-PM-02-C14-IDENTITY-INTEGRITY-02 — تست‌های رفتاری (DB-backed).
 *
 * قراردادِ این تسک: لایهٔ اپلیکیشن روی `lower(code)` و `lower(barcode)` مقایسه می‌کند؛
 * قیدِ case-sensitive دیتابیس (`uq_product_code`) و تمامِ تصمیم‌های مالک (D-C11-3 و …)
 * دست‌نخورده می‌مانند. این تست‌ها فقط رفتارِ اپلیکیشن را قفل می‌کنند.
 */
let fx: Fixture;

beforeAll(async () => {
  fx = await setupProductMasterFixture('greendms_pm_identity_integrity');
}, 180_000);

afterAll(async () => {
  await fx?.teardown();
});

const CSV_HEADER = 'code,name,category_code,base_uom_code';
const csv = (rows: string[]) => [CSV_HEADER, ...rows].join('\n');

describe('C14-IDENTITY-02 — کدِ دستی', () => {
  it('کدِ متفاوت در case با کالای موجود → 409 duplicate_code (نه ساختِ موازی)', async () => {
    await createProduct(fx, { name: 'کالای پایه', code: 'ID-CASE-1' });
    const res = await fx.api().post('/api/v1/products').send({
      name: 'دیگر',
      code: 'id-case-1',
      category_id: fx.categoryId,
      base_uom_id: fx.uomId,
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('duplicate_code');
  });

  it('کد با نویسهٔ کنترلی → 400 invalid_code و چیزی ذخیره نمی‌شود', async () => {
    const res = await fx.api().post('/api/v1/products').send({
      name: 'کالای بد',
      code: 'ID-CTRL-\u0007X',
      category_id: fx.categoryId,
      base_uom_id: fx.uomId,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_code');
    const saved = await fx.pool.query(
      `select 1 from product where company_id = $1 and code = 'ID-CTRL-\u0007X'`,
      [fx.companyId],
    );
    expect(saved.rows.length).toBe(0);
  });

  it('کد با فاصلهٔ ابتدا/انتها → 400 invalid_code', async () => {
    const res = await fx.api().post('/api/v1/products').send({
      name: 'کالای فضادار',
      code: ' ID-SPACE-1 ',
      category_id: fx.categoryId,
      base_uom_id: fx.uomId,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_code');
  });
});

describe('C14-IDENTITY-02 — ورودِ گروهی (CSV)', () => {
  it('validate: کد با نویسهٔ کنترلی → خطای ردیفِ invalid_code', async () => {
    const res = await fx
      .api()
      .post('/api/v1/products/import/validate')
      .send({ csv: csv(['BAD\u0007CTRL-1,کالای بد,PMCAT,pm_piece']) })
      .expect(200);
    const hit = (res.body.row_errors as { row: number; code: string }[]).find((e) => e.code === 'invalid_code');
    expect(hit).toBeTruthy();
  });

  it('validate: تکرارِ درون‌فایلی فقط در case («CASE-IN-1»/«case-in-1») → duplicate_in_file', async () => {
    const res = await fx
      .api()
      .post('/api/v1/products/import/validate')
      .send({ csv: csv(['CASE-IN-1,کالا یک,PMCAT,pm_piece', 'case-in-1,کالا دو,PMCAT,pm_piece']) })
      .expect(200);
    const hit = (res.body.row_errors as { row: number; code: string }[]).find((e) => e.code === 'duplicate_in_file');
    expect(hit).toBeTruthy();
  });

  it('commit mode=update با کدِ متفاوت در case → همان کالای موجود بروز می‌شود (نه ساختِ موازی)', async () => {
    await createProduct(fx, { name: 'کالای CI', code: 'CI-UP-1' });
    const res = await fx
      .api()
      .post('/api/v1/products/import/commit')
      .send({
        csv: csv(['ci-up-1,نام تازهٔ CI,PMCAT,pm_piece']),
        mode: 'update',
        idempotency_key: 'k-ci-up-1',
      })
      .expect(200);
    expect(res.body.updated_rows).toBe(1);
    expect(res.body.failed_rows).toBe(0);
    const rows = await fx.pool.query(
      `select name from product where company_id = $1 and lower(code) = 'ci-up-1'`,
      [fx.companyId],
    );
    expect(rows.rows.length).toBe(1);
    expect(rows.rows[0].name).toBe('نام تازهٔ CI');
  });

  it('commit mode=create با کدِ متفاوت در case نسبت به کالای موجود → ردِ duplicate_code', async () => {
    await createProduct(fx, { name: 'کالای CI ساخت', code: 'CI-CR-1' });
    const res = await fx
      .api()
      .post('/api/v1/products/import/commit')
      .send({
        csv: csv(['ci-cr-1,کالای تکراری,PMCAT,pm_piece']),
        mode: 'create',
        idempotency_key: 'k-ci-cr-1',
      })
      .expect(200);
    expect(res.body.created_rows).toBe(0);
    expect(res.body.failed_rows).toBe(1);
    const errors = (res.body.errors ?? res.body.row_errors ?? []) as { code: string }[];
    expect(errors.some((e) => e.code === 'duplicate_code')).toBe(true);
  });
});

describe('C14-IDENTITY-02 — بارکد', () => {
  it('افزودنِ بارکد با نویسهٔ کنترلی → 400 invalid_barcode', async () => {
    const p = await createProduct(fx, { name: 'کالای بارکدِ بد', code: 'ID-BC-CTRL-1' });
    const res = await fx
      .api()
      .post(`/api/v1/products/${p.id}/barcodes`)
      .send({ barcode: '12\u000034567890', kind: 'internal' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_barcode');
  });

  it('اسکنِ بارکدِ internal با case متفاوت پیدا می‌شود (lower/lower)', async () => {
    const p = await createProduct(fx, { name: 'کالای اسکن CI', code: 'ID-SCAN-CI-1' });
    await fx
      .api()
      .post(`/api/v1/products/${p.id}/barcodes`)
      .send({ barcode: 'CaseInternal-999-AbC', kind: 'internal' })
      .expect(201);
    const found = await fx.api().get('/api/v1/products/scan/caseinternal-999-abc');
    expect(found.status).toBe(200);
    expect(found.body.product.id).toBe(p.id);
  });
});
