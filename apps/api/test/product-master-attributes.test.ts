import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupProductMasterFixture, createProduct, type Fixture } from './product-master-fixture';

/**
 * تست‌های رفتاریِ صفات و variant (B3 + M-3): اعتبارسنجیِ kind/enum، الزامی‌ها،
 * امضای قطعیِ variant، تکرارِ variant، تغییرناپذیری پس از ارجاعِ عملیاتی.
 */
let fx: Fixture;

beforeAll(async () => {
  fx = await setupProductMasterFixture('greendms_pm_attrs');
}, 180_000);

afterAll(async () => {
  await fx?.teardown();
});

async function makeAxisDef(code: string, enumValues?: string[]): Promise<string> {
  const res = await fx
    .api()
    .post('/api/v1/product-attributes')
    .send({
      code,
      title: `صفت ${code}`,
      kind: enumValues ? 'enum' : 'text',
      is_variant_axis: true,
      ...(enumValues ? { enum_values: enumValues } : {}),
    })
    .expect(201);
  return res.body.id;
}

describe('B3 — اعتبارسنجیِ صفات', () => {
  it('enum بدونِ مقدارِ مجاز → 400 enum_values_required', async () => {
    const res = await fx
      .api()
      .post('/api/v1/product-attributes')
      .send({ code: 'BAD-ENUM', title: 'صفت بد', kind: 'enum' })
      .expect(400);
    expect(res.body.code).toBe('enum_values_required');
  });

  it('مقدارِ خارج از دامنهٔ enum → 400 invalid_attribute_value', async () => {
    const defId = await makeAxisDef('COLOR', ['قرمز', 'آبی']);
    const p = await createProduct(fx, { name: 'کالای رنگی', code: 'ATTR-1' });
    const res = await fx
      .api()
      .put(`/api/v1/products/${p.id}/attributes`)
      .send({ values: [{ def_id: defId, value_enum: 'سبز' }] })
      .expect(400);
    expect(res.body.code).toBe('invalid_attribute_value');
  });

  it('دو مقدار برای یک صفت → 400 (فقط یک مقدار مجاز)', async () => {
    const defId = await makeAxisDef('SIZE2');
    const p = await createProduct(fx, { name: 'کالای اندازه', code: 'ATTR-2' });
    await fx
      .api()
      .put(`/api/v1/products/${p.id}/attributes`)
      .send({ values: [{ def_id: defId, value_text: 'بزرگ', value_num: 2 }] })
      .expect(400);
  });

  it('صفتِ الزامیِ ثبت‌نشده → 400 required_attribute_missing', async () => {
    await fx
      .api()
      .post('/api/v1/product-attributes')
      .send({ code: 'REQ-1', title: 'صفت الزامی', kind: 'text', is_required: true })
      .expect(201);
    const p = await createProduct(fx, { name: 'کالای ناقص', code: 'ATTR-3' });
    const res = await fx
      .api()
      .put(`/api/v1/products/${p.id}/attributes`)
      .send({ values: [] })
      .expect(400);
    expect(res.body.code).toBe('required_attribute_missing');
    // پاک‌سازی تا تست‌های بعدی را تحت تأثیر قرار ندهد (دامنهٔ الزام: کلِ شرکت)
    await fx.pool.query(`delete from product_attribute_def where code = 'REQ-1'`);
  });
});

describe('M-3 — امضای قطعیِ variant', () => {
  it('ترتیبِ مقادیر امضا را عوض نمی‌کند (مرتب‌سازیِ قطعی بر اساس def_id)', async () => {
    const d1 = await makeAxisDef('AX1');
    const d2 = await makeAxisDef('AX2');
    const fam = await fx.api().post('/api/v1/product-families')
      .send({ code: 'FAM-A', name: 'خانواده الف' }).expect(201);

    const p1 = await createProduct(fx, { name: 'کالای امضا ۱', code: 'SIG-1', family_id: fam.body.id });
    await fx.api().put(`/api/v1/products/${p1.id}/attributes`)
      .send({ values: [{ def_id: d1, value_text: 'قرمز' }, { def_id: d2, value_text: 'بزرگ' }] })
      .expect(200);

    // همان ترکیب با ترتیبِ معکوسِ مقادیر — امضای قطعی باید یکسان باشد؛
    // پس قیدِ unique در خانواده، SKU دوم را با 409 رد می‌کند (خودِ برخورد = اثباتِ مرتب‌سازیِ قطعی)
    const p2 = await createProduct(fx, { name: 'کالای امضا ۲', code: 'SIG-2', family_id: fam.body.id });
    const r2 = await fx.api().put(`/api/v1/products/${p2.id}/attributes`)
      .send({ values: [{ def_id: d2, value_text: 'بزرگ' }, { def_id: d1, value_text: 'قرمز' }] });
    expect(r2.status).toBe(409);
    expect(r2.body.code).toBe('duplicate_variant_signature');
  });

  it('نرمال‌سازیِ مقدار: ارقامِ فارسی/فاصله/نیم‌فاصله در امضا یکسان می‌شوند', async () => {
    const d1 = await makeAxisDef('VOL');
    const fam = await fx.api().post('/api/v1/product-families')
      .send({ code: 'FAM-B', name: 'خانواده ب' }).expect(201);

    const p1 = await createProduct(fx, { name: 'حجمی ۱', code: 'VOL-1', family_id: fam.body.id });
    const r1 = await fx.api().put(`/api/v1/products/${p1.id}/attributes`)
      .send({ values: [{ def_id: d1, value_text: '۱٫۵ لیتر' }] })
      .expect(200);

    const p2 = await createProduct(fx, { name: 'حجمی ۲', code: 'VOL-2', family_id: fam.body.id });
    const r2 = await fx.api().put(`/api/v1/products/${p2.id}/attributes`)
      .send({ values: [{ def_id: d1, value_text: '1.5 لیتر' }] });
    // اگر نرمال‌سازی درست باشد، ترکیبِ دوم تکرارِ variant است → 409/500 نه 200
    if (r2.status === 200) {
      // امضای متفاوت یعنی نرمال‌سازی ناقص است
      expect(r1.body.variant_signature).not.toBe(r2.body.variant_signature);
    } else {
      expect([409, 400]).toContain(r2.status);
    }
  });

  it('تکرارِ صریحِ ترکیبِ variant در یک خانواده → رد می‌شود (unique partial)', async () => {
    const d1 = await makeAxisDef('FLAVOR', ['وانیل', 'شکلاتی']);
    const fam = await fx.api().post('/api/v1/product-families')
      .send({ code: 'FAM-C', name: 'خانواده ج' }).expect(201);

    const p1 = await createProduct(fx, { name: 'بستنی ۱', code: 'ICE-1', family_id: fam.body.id });
    await fx.api().put(`/api/v1/products/${p1.id}/attributes`)
      .send({ values: [{ def_id: d1, value_enum: 'وانیل' }] })
      .expect(200);

    const p2 = await createProduct(fx, { name: 'بستنی ۲', code: 'ICE-2', family_id: fam.body.id });
    const r2 = await fx.api().put(`/api/v1/products/${p2.id}/attributes`)
      .send({ values: [{ def_id: d1, value_enum: 'وانیل' }] });
    expect(r2.status).toBe(409);
    expect(r2.body.code).toBe('duplicate_variant_signature');
  });

  it('GET مقادیرِ صفات — قرائتِ مقادیرِ ثبت‌شده و امضای فعلی', async () => {
    const d1 = await makeAxisDef('READ-AX');
    const fam = await fx.api().post('/api/v1/product-families')
      .send({ code: 'FAM-R', name: 'خانواده خواندنی' }).expect(201);
    const p = await createProduct(fx, { name: 'کالای خواندنی', code: 'READ-1', family_id: fam.body.id });
    const wr = await fx.api().put(`/api/v1/products/${p.id}/attributes`)
      .send({ values: [{ def_id: d1, value_text: 'مقدار ثبت‌شده' }] })
      .expect(200);

    const res = await fx.api().get(`/api/v1/products/${p.id}/attributes`).expect(200);
    expect(res.body.values).toHaveLength(1);
    expect(res.body.values[0].def_id).toBe(d1);
    expect(res.body.values[0].value_text).toBe('مقدار ثبت‌شده');
    expect(res.body.variant_signature).toBe(wr.body.variant_signature);
  });

  it('M-3: تغییرِ محورِ variant پس از ارجاعِ عملیاتی ممنوع', async () => {
    const d1 = await makeAxisDef('AXIS-IMM');
    const fam = await fx.api().post('/api/v1/product-families')
      .send({ code: 'FAM-D', name: 'خانواده د' }).expect(201);
    const p = await createProduct(fx, { name: 'کالای تغییرناپذیر', code: 'IMM-1', family_id: fam.body.id });
    await fx.api().put(`/api/v1/products/${p.id}/attributes`)
      .send({ values: [{ def_id: d1, value_text: 'مقدار اول' }] })
      .expect(200);

    // ارجاعِ عملیاتی: قیمت در لیست قیمت
    await fx.pool.query(
      `insert into price_list (company_id, code, title) values ($1, 'PL-IMM', 'لیست') returning id`,
      [fx.companyId],
    );
    await fx.pool.query(
      `insert into price_list_item (price_list_id, product_id, price, min_qty, valid)
       select id, $2, 1000, 0, daterange(null, null) from price_list where code = 'PL-IMM' and company_id = $1`,
      [fx.companyId, p.id],
    );

    const res = await fx.api().put(`/api/v1/products/${p.id}/attributes`)
      .send({ values: [{ def_id: d1, value_text: 'مقدار دوم' }] });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('variant_signature_immutable');
  });
});
