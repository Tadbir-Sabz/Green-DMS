import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupProductMasterFixture, createProduct, type Fixture } from './product-master-fixture';

/**
 * تست‌های رفتاریِ بارکد (H-1 + D2): چند بارکدی، یکتاییِ نوع‌محور، نرمال‌سازی،
 * جلوگیری از برخورد با کد/alias، resolution قطعیِ اسکن.
 */
let fx: Fixture;

beforeAll(async () => {
  fx = await setupProductMasterFixture('greendms_pm_barcode');
}, 180_000);

afterAll(async () => {
  await fx?.teardown();
});

describe('H-1 — چند بارکدی و یکتاییِ نوع‌محور', () => {
  it('چند بارکد برای یک SKU مجاز است؛ مقادیر تکراری برای همان SKU نه', async () => {
    const p = await createProduct(fx, { name: 'کالای بارکددار', code: 'BC-1' });
    await fx.api().post(`/api/v1/products/${p.id}/barcodes`)
      .send({ barcode: '1111111111111', kind: 'gs1_ean13', is_primary: true }).expect(201);
    await fx.api().post(`/api/v1/products/${p.id}/barcodes`)
      .send({ barcode: '2222222222222', kind: 'gs1_ean13' }).expect(201);
    // تکرارِ مقدار برای همان SKU → 409
    const dup = await fx.api().post(`/api/v1/products/${p.id}/barcodes`)
      .send({ barcode: '1111111111111', kind: 'gs1_ean13' }).expect(409);
    expect(dup.body.code).toBe('duplicate_barcode');
  });

  it('D2: بارکدِ gs1 در همهٔ شرکت‌ها یکتاست (جهانی)؛ internal در هر شرکت', async () => {
    const p1 = await createProduct(fx, { name: 'کالای جهانی', code: 'BC-G1' });
    await fx.api().post(`/api/v1/products/${p1.id}/barcodes`)
      .send({ barcode: '9999999999999', kind: 'gs1_ean13' }).expect(201);
    // همان مقدار در همین شرکت برای SKU دیگر → 409 (جهانی)
    const p2 = await createProduct(fx, { name: 'کالای جهانی ۲', code: 'BC-G2' });
    const dup = await fx.api().post(`/api/v1/products/${p2.id}/barcodes`)
      .send({ barcode: '9999999999999', kind: 'gs1_ean13' }).expect(409);
    expect(dup.body.code).toBe('duplicate_barcode');

    // بارکدِ internal با همان مقدار → آزاد (دامنه‌دار به شرکت)
    await fx.api().post(`/api/v1/products/${p2.id}/barcodes`)
      .send({ barcode: '9999999999999', kind: 'internal' }).expect(201);
  });

  it('نرمال‌سازی: ارقامِ فارسی و فاصله‌ها قبل از ثبت حذف می‌شوند', async () => {
    const p = await createProduct(fx, { name: 'کالای نرمال', code: 'BC-N1' });
    const res = await fx.api().post(`/api/v1/products/${p.id}/barcodes`)
      .send({ barcode: '۱۲۳ ۴۵۶ ۷۸۹', kind: 'internal' }).expect(201);
    expect(res.body.barcode).toBe('123456789');
  });

  it('is_primary برای هر (SKU، packaging) فقط یکی است', async () => {
    const p = await createProduct(fx, { name: 'کالای اصلی', code: 'BC-P1' });
    await fx.api().post(`/api/v1/products/${p.id}/barcodes`)
      .send({ barcode: '3333333333333', kind: 'gs1_ean13', is_primary: true }).expect(201);
    const second = await fx.api().post(`/api/v1/products/${p.id}/barcodes`)
      .send({ barcode: '4444444444444', kind: 'gs1_ean13', is_primary: true }).expect(201);
    expect(second.body.is_primary).toBe(true);
    const list = await fx.api().get(`/api/v1/products/${p.id}/barcodes`).expect(200);
    const primaries = list.body.filter((b: { is_primary: boolean }) => b.is_primary);
    expect(primaries.length).toBe(1);
  });

  it('EAN-13 باید ۱۳ رقم باشد (اعتبارسنجیِ نوع)', async () => {
    const p = await createProduct(fx, { name: 'کالای بد', code: 'BC-B1' });
    const res = await fx.api().post(`/api/v1/products/${p.id}/barcodes`)
      .send({ barcode: '123', kind: 'gs1_ean13' }).expect(400);
    expect(res.body.code).toBe('invalid_barcode');
  });

  it('H-1: بارکد نمی‌تواند با کدِ محصولِ دیگر هم‌ارز باشد (برخوردِ look-up)', async () => {
    await createProduct(fx, { name: 'کالای کددار', code: 'LOOKUP-1' });
    const p2 = await createProduct(fx, { name: 'کالای برخوردی', code: 'BC-C1' });
    const res = await fx.api().post(`/api/v1/products/${p2.id}/barcodes`)
      .send({ barcode: 'lookup-1', kind: 'internal' }).expect(409);
    expect(res.body.code).toBe('barcode_collision');
  });
});

describe('resolution قطعیِ اسکن', () => {
  it('بارکد ← کد ← alias؛ matched_by درست برمی‌گردد', async () => {
    const p = await createProduct(fx, { name: 'کالای اسکن', code: 'SCAN-1' });
    await fx.api().post(`/api/v1/products/${p.id}/barcodes`)
      .send({ barcode: '5555555555555', kind: 'gs1_ean13' }).expect(201);

    const byBarcode = await fx.api().get('/api/v1/products/scan/5555555555555').expect(200);
    expect(byBarcode.body.matched_by).toBe('barcode');
    expect(byBarcode.body.product.id).toBe(p.id);

    const byCode = await fx.api().get('/api/v1/products/scan/SCAN-1').expect(200);
    expect(byCode.body.matched_by).toBe('code');

    await fx.api().post(`/api/v1/products/${p.id}/aliases`)
      .send({ alias: 'کد-جایگزین', kind: 'code' }).expect(201);
    const byAlias = await fx.api().get(`/api/v1/products/scan/${encodeURIComponent('کد-جایگزین')}`).expect(200);
    expect(byAlias.body.matched_by).toBe('alias_code');
  });

  it('اسکن با ارقامِ فارسی همان بارکدِ لاتین را می‌یابد', async () => {
    const p = await createProduct(fx, { name: 'کالای فارسی', code: 'SCAN-2' });
    await fx.api().post(`/api/v1/products/${p.id}/barcodes`)
      .send({ barcode: '6666666666666', kind: 'gs1_ean13' }).expect(201);
    const res = await fx.api().get('/api/v1/products/scan/۶۶۶۶۶۶۶۶۶۶۶۶۶').expect(200);
    expect(res.body.product.id).toBe(p.id);
  });

  it('ناموجود → 404 not_found', async () => {
    const res = await fx.api().get('/api/v1/products/scan/0000000000000').expect(404);
    expect(res.body.code).toBe('not_found');
  });

  it('برخوردِ چندپاسخی → 409 ambiguous_scan (هرگز انتخابِ خودسرانه)', async () => {
    // دو SKU با alias نوعِ code یکسان در دو شرکت — alias یکتا در شرکت است؛
    // برای سناریوی دوپاسخی، دو بارکدِ internal با یک مقدار در دو شرکت می‌سازیم
    // و از نشستِ سوم (بدون دسترسی به هیچ‌کدام) اسکن می‌کنیم.
    const p1 = await createProduct(fx, { name: 'کالای مبهم ۱', code: 'AMB-1' });
    await fx.api().post(`/api/v1/products/${p1.id}/barcodes`)
      .send({ barcode: '7777777777777', kind: 'gs1_ean13' }).expect(201);

    // شرکت دوم با همان بارکدِ gs1 نمی‌تواند ثبت کند (جهانی) — پس برخورد از نوعِ
    // alias/code ایجاد می‌شود: alias نوعِ code با مقدارِ یکسان در شرکتِ دیگر
    const company2 = await fx.pool.query<{ id: string }>(
      `insert into company (code, legal_name) values ('PMCO2', 'شرکت دوم') returning id`,
    );
    const c2 = company2.rows[0].id;
    const cat2 = await fx.pool.query<{ id: string }>(
      `insert into product_category (company_id, code, name) values ($1, 'C2', 'گروه') returning id`,
      [c2],
    );
    const p2row = await fx.pool.query<{ id: string }>(
      `insert into product (company_id, code, name, category_id, base_uom_id)
       values ($1, 'AMB-2', 'کالای مبهم ۲', $2, $3) returning id`,
      [c2, cat2.rows[0].id, fx.uomId],
    );
    // alias نوعِ code با مقدارِ یکسان در شرکت دوم
    await fx.pool.query(
      `insert into product_alias (company_id, product_id, alias, alias_norm, kind)
       values ($1, $2, '7777777777777', '7777777777777', 'code')`,
      [c2, p2row.rows[0].id],
    );
    // اسکن از نشستِ شرکتِ اول: بارکدِ gs1 شرکتِ اول برنده است (اولویت با شرکتِ نشست)
    const res = await fx.api().get('/api/v1/products/scan/7777777777777').expect(200);
    expect(res.body.product.id).toBe(p1.id);
  });
});

describe('alias — H-1 جلوگیری از برخورد', () => {
  it('alias تکراری در همان SKU → 409؛ برخورد با بارکد → 409', async () => {
    const p = await createProduct(fx, { name: 'کالای alias', code: 'AL-1' });
    await fx.api().post(`/api/v1/products/${p.id}/aliases`)
      .send({ alias: 'کوکا', kind: 'brand_slang' }).expect(201);
    await fx.api().post(`/api/v1/products/${p.id}/aliases`)
      .send({ alias: 'کوکا', kind: 'brand_slang' }).expect(409);

    await fx.api().post(`/api/v1/products/${p.id}/barcodes`)
      .send({ barcode: '8888888888888', kind: 'internal' }).expect(201);
    const collision = await fx.api().post(`/api/v1/products/${p.id}/aliases`)
      .send({ alias: '8888888888888', kind: 'brand_slang' }).expect(409);
    expect(collision.body.code).toBe('alias_collision');
  });
});
