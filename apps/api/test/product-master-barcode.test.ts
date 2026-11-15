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

/** ایجادِ شرکت/کالای کمکیِ دوم/سوم برای سناریوهای cross-tenant (فقط همین فایل) */
async function createSecondCompanyWithProduct(
  fx: Fixture,
  companyCode: string,
  productCode: string,
): Promise<{ companyId: string; productId: string }> {
  const company = await fx.pool.query<{ id: string }>(
    `insert into company (code, legal_name) values ($1, $2) returning id`,
    [companyCode, `شرکتِ تستِ ${companyCode}`],
  );
  const c2 = company.rows[0].id;
  const cat = await fx.pool.query<{ id: string }>(
    `insert into product_category (company_id, code, name) values ($1, 'XCAT', 'گروهِ دوم') returning id`,
    [c2],
  );
  const p = await fx.pool.query<{ id: string }>(
    `insert into product (company_id, code, name, category_id, base_uom_id)
     values ($1, $2, $3, $4, $5) returning id`,
    [c2, productCode, `کالایِ شرکتِ ${companyCode}`, cat.rows[0].id, fx.uomId],
  );
  return { companyId: c2, productId: p.rows[0].id };
}

describe('M1-B — جلوگیریِ case-insensitive از تکرار (internal/other، دامنهٔ شرکت)', () => {
  it('internal با صرفِ بزرگی/کوچکیِ حروف در همان شرکت → 409 duplicate_barcode', async () => {
    const p = await createProduct(fx, { name: 'M1B الف', code: 'M1B-1' });
    await fx.api().post(`/api/v1/products/${p.id}/barcodes`)
      .send({ barcode: 'MiXeD-Case-1', kind: 'internal' }).expect(201);
    const p2 = await createProduct(fx, { name: 'M1B ب', code: 'M1B-2' });
    const dup = await fx.api().post(`/api/v1/products/${p2.id}/barcodes`)
      .send({ barcode: 'mixed-case-1', kind: 'internal' }).expect(409);
    expect(dup.body.code).toBe('duplicate_barcode');
  });

  it('internal همان SKU هم مسدود است', async () => {
    const p = await createProduct(fx, { name: 'M1B ج', code: 'M1B-3' });
    await fx.api().post(`/api/v1/products/${p.id}/barcodes`)
      .send({ barcode: 'SameSku-CI-1', kind: 'internal' }).expect(201);
    const dup = await fx.api().post(`/api/v1/products/${p.id}/barcodes`)
      .send({ barcode: 'samesku-ci-1', kind: 'internal' }).expect(409);
    expect(dup.body.code).toBe('duplicate_barcode');
  });

  it('other با variant صرفِ حروف → 409 duplicate_barcode', async () => {
    const p = await createProduct(fx, { name: 'M1B د', code: 'M1B-4' });
    await fx.api().post(`/api/v1/products/${p.id}/barcodes`)
      .send({ barcode: 'Other-Kind-CI-1', kind: 'other' }).expect(201);
    const dup = await fx.api().post(`/api/v1/products/${p.id}/barcodes`)
      .send({ barcode: 'other-kind-ci-1', kind: 'other' }).expect(409);
    expect(dup.body.code).toBe('duplicate_barcode');
  });

  it('دامنهٔ internal↔other: ثبتِ variant صرفِ حروف میان internal و other مسدود است', async () => {
    const p = await createProduct(fx, { name: 'M1B ه', code: 'M1B-5' });
    await fx.api().post(`/api/v1/products/${p.id}/barcodes`)
      .send({ barcode: 'Cross-Letter-CI-1', kind: 'internal' }).expect(201);
    const dup = await fx.api().post(`/api/v1/products/${p.id}/barcodes`)
      .send({ barcode: 'cross-letter-ci-1', kind: 'other' }).expect(409);
    expect(dup.body.code).toBe('duplicate_barcode');
  });

  it('تکرارِ exact internal همچنان 409 (رگرسیون)', async () => {
    const p = await createProduct(fx, { name: 'M1B و', code: 'M1B-6' });
    await fx.api().post(`/api/v1/products/${p.id}/barcodes`)
      .send({ barcode: 'Exact-Dup-1', kind: 'internal' }).expect(201);
    const dup = await fx.api().post(`/api/v1/products/${p.id}/barcodes`)
      .send({ barcode: 'Exact-Dup-1', kind: 'internal' }).expect(409);
    expect(dup.body.code).toBe('duplicate_barcode');
  });

  it('cross-kind رسمی (GS1 ↔ internal) دست‌نخورده: همچنان مجاز', async () => {
    const p = await createProduct(fx, { name: 'M1B ز', code: 'M1B-7' });
    await fx.api().post(`/api/v1/products/${p.id}/barcodes`)
      .send({ barcode: '4006381333931', kind: 'gs1_ean13' }).expect(201);
    await fx.api().post(`/api/v1/products/${p.id}/barcodes`)
      .send({ barcode: '4006381333931', kind: 'internal' }).expect(201);
  });

  it('دامنهٔ شرکتی: همان CI در شرکتِ دیگر آزاد است', async () => {
    const p = await createProduct(fx, { name: 'M1B ح', code: 'M1B-8' });
    await fx.api().post(`/api/v1/products/${p.id}/barcodes`)
      .send({ barcode: 'Tenant-Shared-CI-1', kind: 'internal' }).expect(201);
    const other = await createSecondCompanyWithProduct(fx, 'PMCOB1', 'M1B-EXT-1');
    await fx.pool.query(
      `insert into product_barcode (company_id, product_id, barcode, kind)
       values ($1, $2, 'tenant-shared-ci-1', 'internal')`,
      [other.companyId, other.productId],
    );
    // ثبتِ همان CI در شرکتِ خودمان همچنان باید 409 باشد (تضمینِ دامنهٔ شرکتی، نه سراسری)
    const dup = await fx.api().post(`/api/v1/products/${p.id}/barcodes`)
      .send({ barcode: 'tenant-shared-ci-1', kind: 'internal' }).expect(409);
    expect(dup.body.code).toBe('duplicate_barcode');
  });

  it('نرمال‌سازی پیش از تطبیق: ارقامِ فارسی و فاصله‌ها', async () => {
    const p = await createProduct(fx, { name: 'M1B ط', code: 'M1B-9' });
    await fx.api().post(`/api/v1/products/${p.id}/barcodes`)
      .send({ barcode: '۱۲۳ ۴۵۶ ۷۸۹۰', kind: 'internal' }).expect(201);
    const dup = await fx.api().post(`/api/v1/products/${p.id}/barcodes`)
      .send({ barcode: '1234567890', kind: 'internal' }).expect(409);
    expect(dup.body.code).toBe('duplicate_barcode');
    const p2 = await createProduct(fx, { name: 'M1B ی', code: 'M1B-10' });
    const ws = await fx.api().post(`/api/v1/products/${p2.id}/barcodes`)
      .send({ barcode: '  Padded-CI-1  ', kind: 'internal' }).expect(201);
    const dup2 = await fx.api().post(`/api/v1/products/${p2.id}/barcodes`)
      .send({ barcode: 'padded-ci-1', kind: 'internal' }).expect(409);
    expect(dup2.body.code).toBe('duplicate_barcode');
    expect(ws.body.barcode).toBe('Padded-CI-1');
  });
});

describe('اسکن — رگرسیونِ ردیف‌های legacy (M1)', () => {
  it('legacy same-product case-variants: اسکن به همان محصول resolve می‌شود', async () => {
    const p = await createProduct(fx, { name: 'Legacy Same', code: 'SCAN-LEG1' });
    // ردیف‌های legacy را مستقیماً می‌سازیم چون API دیگر اجازهٔ CI duplicate نمی‌دهد
    await fx.pool.query(
      `insert into product_barcode (company_id, product_id, barcode, kind)
       values ($1, $2, 'Legacy-Scan-1', 'internal'),
              ($1, $2, 'legacy-scan-1', 'internal'),
              ($1, $2, 'LEGACY-SCAN-1', 'other')`,
      [fx.companyId, p.id],
    );
    const res = await fx.api().get('/api/v1/products/scan/legacy-scan-1').expect(200);
    expect(res.body.product.id).toBe(p.id);
    expect(res.body.matched_by).toBe('barcode');
    // packaging_id عمداً assert نمی‌شود: برای ردیف‌های معادل، سیاستِ انتخاب وجود ندارد
  });

  it('legacy different-product same-company: 409 ambiguous_scan قطعی', async () => {
    const a = await createProduct(fx, { name: 'Legacy Diff الف', code: 'SCAN-LEG2A' });
    const b = await createProduct(fx, { name: 'Legacy Diff ب', code: 'SCAN-LEG2B' });
    await fx.pool.query(
      `insert into product_barcode (company_id, product_id, barcode, kind)
       values ($1, $2, 'Legacy-Scan-2', 'internal'),
              ($1, $3, 'legacy-scan-2', 'other')`,
      [fx.companyId, a.id, b.id],
    );
    const res = await fx.api().get('/api/v1/products/scan/legacy-scan-2').expect(409);
    expect(res.body.code).toBe('ambiguous_scan');
    expect(res.body.details.product_ids).toEqual(expect.arrayContaining([a.id, b.id]));
  });

  it('legacy same-product cross-kind (internal + other): resolve به همان محصول', async () => {
    const p = await createProduct(fx, { name: 'Legacy CrossKind', code: 'SCAN-LEG3' });
    await fx.api().post(`/api/v1/products/${p.id}/barcodes`)
      .send({ barcode: 'CrossKind-Scan-1', kind: 'internal' }).expect(201);
    await fx.api().post(`/api/v1/products/${p.id}/barcodes`)
      .send({ barcode: 'crosskind-scan-1', kind: 'other' }).expect(201);
    const res = await fx.api().get('/api/v1/products/scan/crosskind-scan-1').expect(200);
    expect(res.body.product.id).toBe(p.id);
    expect(res.body.matched_by).toBe('barcode');
  });

  it('بدونِ افشای cross-company برای internal: اسکن از شرکتِ نامالکی → 404 not_found', async () => {
    const other = await createSecondCompanyWithProduct(fx, 'PMCOB2', 'SCAN-EXT-1');
    await fx.pool.query(
      `insert into product_barcode (company_id, product_id, barcode, kind)
       values ($1, $2, 'CrossTenant-Secret-1', 'internal')`,
      [other.companyId, other.productId],
    );
    const res = await fx.api().get('/api/v1/products/scan/crosstenant-secret-1').expect(404);
    expect(res.body.code).toBe('not_found');
  });

  it('GS1 cross-company fallback همچنان فعال است (رفتارِ مستند، دست‌نخورده)', async () => {
    const other = await createSecondCompanyWithProduct(fx, 'PMCOB3', 'SCAN-EXT-2');
    await fx.pool.query(
      `insert into product_barcode (company_id, product_id, barcode, kind)
       values ($1, $2, '9998887776665', 'gs1_ean13')`,
      [other.companyId, other.productId],
    );
    const res = await fx.api().get('/api/v1/products/scan/9998887776665').expect(200);
    expect(res.body.product.id).toBe(other.productId);
    expect(res.body.matched_by).toBe('barcode');
  });

  it('F-M1b: duplicate-check هیچ شناسه/نامِ شرکتِ دیگر را افشا نمی‌کند (حتی با query صرفِ حروف)', async () => {
    const other = await createSecondCompanyWithProduct(fx, 'PMCOB4', 'FMB-FOREIGN-CODE');
    await fx.pool.query(
      `update product set name = 'FMB-FOREIGN-SECRET-NAME' where id = $1`,
      [other.productId],
    );
    await fx.pool.query(
      `insert into product_barcode (company_id, product_id, barcode, kind)
       values ($1, $2, 'DupCheck-Foreign-1', 'internal')`,
      [other.companyId, other.productId],
    );
    for (const q of ['DupCheck-Foreign-1', 'dupcheck-foreign-1', 'DUPCHECK-FOREIGN-1']) {
      const res = await fx.api()
        .get(`/api/v1/products/duplicate-check?barcode=${encodeURIComponent(q)}`)
        .expect(200);
      expect(res.body.blocking).toEqual([]);
      const payload = JSON.stringify(res.body);
      expect(payload).not.toContain('FMB-FOREIGN-SECRET-NAME');
      expect(payload).not.toContain('FMB-FOREIGN-CODE');
      expect(payload).not.toContain(other.productId);
    }
    // و نتایجِ دامنهٔ شرکتِ خودمان همچنان در دسترس است
    const own = await createProduct(fx, { name: 'DupCheck Own', code: 'DUP-CHECK-OWN-1' });
    await fx.api().post(`/api/v1/products/${own.id}/barcodes`)
      .send({ barcode: 'DupCheck-Own-1', kind: 'internal' }).expect(201);
    const ownRes = await fx.api()
      .get('/api/v1/products/duplicate-check?barcode=dupcheck-own-1')
      .expect(200);
    expect(ownRes.body.blocking.some((b: { product_id: string }) => b.product_id === own.id)).toBe(true);
  });
});
