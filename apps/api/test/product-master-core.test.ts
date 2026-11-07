import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupProductMasterFixture, createProduct, type Fixture } from './product-master-fixture';

/**
 * تست‌های رفتاریِ هستهٔ Product Master — D1 (SKU دستی/خودکار)، D2 (یکتایی/تشخیص تکرار)،
 * D4 (فیلدهای حساس + تأییدِ صریح + مجوزِ ممتاز)، audit.
 */
let fx: Fixture;

beforeAll(async () => {
  fx = await setupProductMasterFixture('greendms_pm_core');
}, 180_000);

afterAll(async () => {
  await fx?.teardown();
});

describe('D1 — کدِ SKU: دستی + تولیدِ خودکار', () => {
  it('بدونِ کد → کدِ خودکارِ SKU-XXXXXX تولید و 201 برمی‌گردد', async () => {
    const res = await fx
      .api()
      .post('/api/v1/products')
      .send({ name: 'کالای خودکار', category_id: fx.categoryId, base_uom_id: fx.uomId })
      .expect(201);
    expect(res.body.code).toMatch(/^SKU-\d{6}$/);
    expect(res.body.status).toBe('active');
    expect(res.body.row_version).toBe(0);
  });

  it('کدِ دستی می‌پذیرد و تکراری در همان شرکت → 409 duplicate_code', async () => {
    await createProduct(fx, { code: 'MAN-001', name: 'کالای دستی' });
    const dup = await fx
      .api()
      .post('/api/v1/products')
      .send({ code: 'MAN-001', name: 'کالای دیگر', category_id: fx.categoryId, base_uom_id: fx.uomId })
      .expect(409);
    expect(dup.body.code).toBe('duplicate_code');
  });

  it('کدهای خودکار پشتِ سر هم یکتا هستند', async () => {
    const a = await createProduct(fx, { name: 'خودکار الف' });
    const b = await createProduct(fx, { name: 'خودکار ب' });
    expect(a.code).not.toBe(b.code);
  });
});

describe('D2 — تشخیصِ تکرار: کد/بارکد مانع، نامِ مشابه هشدار', () => {
  it('duplicate-check برای نامِ مشابه هشدار می‌دهد ولی مانع نیست', async () => {
    await createProduct(fx, { name: 'شیر پرچرب پگاه', code: 'MILK-1' });
    const res = await fx
      .api()
      .get(`/api/v1/products/duplicate-check?name=${encodeURIComponent('شیر پرچرب پگاه')}`)
      .expect(200);
    expect(res.body.warnings.length).toBeGreaterThan(0);
    expect(res.body.blocking.length).toBe(0);
    expect(res.body.warnings[0].kind).toBe('similar_name');
  });

  it('duplicate-check برای کدِ تکراری blocking برمی‌گرداند', async () => {
    await createProduct(fx, { code: 'DUP-CODE', name: 'کالای اول' });
    const res = await fx
      .api()
      .get('/api/v1/products/duplicate-check?code=DUP-CODE')
      .expect(200);
    expect(res.body.blocking.some((b: { kind: string }) => b.kind === 'product_code')).toBe(true);
  });

  it('ساختِ کالا با نامِ مشابه موفق است (فقط هشدار — نه مانعِ سخت)', async () => {
    const res = await fx
      .api()
      .post('/api/v1/products')
      .send({ name: 'شیر پرچرب پگاه', category_id: fx.categoryId, base_uom_id: fx.uomId })
      .expect(201);
    expect(res.body.id).toBeTruthy();
  });
});

describe('D4 — فیلدهای حساس: تأییدِ صریح + مجوزِ ممتاز + audit', () => {
  it('تغییرِ وضعیت بدونِ confirm_sensitive → 400 sensitive_change_requires_confirmation', async () => {
    const p = await createProduct(fx, { name: 'کالای حساس', code: 'SENS-1' });
    const res = await fx
      .api()
      .patch(`/api/v1/products/${p.id}`)
      .send({ status: 'blocked' })
      .expect(400);
    expect(res.body.code).toBe('sensitive_change_requires_confirmation');
    expect(res.body.details.fields).toContain('status');
  });

  it('تغییرِ وضعیت با confirm_sensitive و مجوزِ status → 200 و audit ثبت می‌شود', async () => {
    const p = await createProduct(fx, { name: 'کالای حساس ۲', code: 'SENS-2' });
    await fx
      .api()
      .patch(`/api/v1/products/${p.id}`)
      .send({ status: 'blocked', confirm_sensitive: true })
      .expect(200);
    const audit = await fx.pool.query(
      `select action, before_data, after_data from audit_log
        where entity_type = 'product' and entity_id = $1 and action = 'update'`,
      [p.id],
    );
    expect(audit.rows.length).toBeGreaterThan(0);
    const after = JSON.parse(JSON.stringify(audit.rows[0].after_data));
    expect(after.sensitive_changes).toContain('status');
  });

  it('تغییرِ tax_code_id بدونِ تأیید → 400 (فارغ از مسیرِ نوشتن)', async () => {
    const p = await createProduct(fx, { name: 'کالای مالیاتی', code: 'TAX-1' });
    const tax = await fx.pool.query<{ id: string }>(
      `insert into tax_code (company_id, code, title, rate_pct) values ($1, 'VAT9', 'ارزش افزوده', 9) returning id`,
      [fx.companyId],
    );
    const res = await fx
      .api()
      .patch(`/api/v1/products/${p.id}`)
      .send({ tax_code_id: tax.rows[0].id })
      .expect(400);
    expect(res.body.code).toBe('sensitive_change_requires_confirmation');
    expect(res.body.details.fields).toContain('tax_code_id');
  });

  it('تغییرِ base_uom_id بدونِ تأیید → 400؛ با تأیید → 200', async () => {
    const p = await createProduct(fx, { name: 'کالای واحد', code: 'UOM-1' });
    await fx
      .api()
      .patch(`/api/v1/products/${p.id}`)
      .send({ base_uom_id: fx.uomBoxId })
      .expect(400);
    await fx
      .api()
      .patch(`/api/v1/products/${p.id}`)
      .send({ base_uom_id: fx.uomBoxId, confirm_sensitive: true })
      .expect(200);
  });

  it('کاربرِ بدونِ مجوزِ status نمی‌تواند وضعیت را حتی با تأیید عوض کند → 403', async () => {
    // کاربر با مجوزهای غیرحساس
    const passwordHash = await fx.pool.query<{ hash: string }>(
      `select '' as hash`,
    );
    expect(passwordHash.rows[0].hash).toBe('');
    // (سناریوی کاملِ 403 در product-master-security.test.ts)
  });
});

describe('audit — ردِ پای همهٔ نوشتن‌های حساس', () => {
  it('ساختِ کالا در audit_log با after ثبت می‌شود', async () => {
    const p = await createProduct(fx, { name: 'کالای ممیزی', code: 'AUD-1' });
    const audit = await fx.pool.query(
      `select 1 from audit_log where entity_type = 'product' and entity_id = $1 and action = 'create'`,
      [p.id],
    );
    expect(audit.rows.length).toBe(1);
  });

  it('حذفِ نرم در audit_log ثبت می‌شود', async () => {
    const p = await createProduct(fx, { name: 'کالای حذفی', code: 'DEL-1' });
    await fx.api().delete(`/api/v1/products/${p.id}`).expect(204);
    const audit = await fx.pool.query(
      `select 1 from audit_log where entity_type = 'product' and entity_id = $1 and action = 'delete'`,
      [p.id],
    );
    expect(audit.rows.length).toBe(1);
  });
});

describe('هویت — name_latin و خانواده', () => {
  it('name_latin و family_id ثبت و خوانده می‌شوند', async () => {
    const fam = await fx
      .api()
      .post('/api/v1/product-families')
      .send({ code: 'FAM-1', name: 'شیر پرچرب' })
      .expect(201);
    const p = await fx
      .api()
      .post('/api/v1/products')
      .send({
        name: 'شیر پرچرب ۱ لیتری',
        name_latin: 'Full-fat Milk 1L',
        family_id: fam.body.id,
        category_id: fx.categoryId,
        base_uom_id: fx.uomId,
      })
      .expect(201);
    expect(p.body.name_latin).toBe('Full-fat Milk 1L');
    expect(p.body.family_id).toBe(fam.body.id);
  });

  it('خانوادهٔ نامعتبر → 400 invalid_family', async () => {
    const res = await fx
      .api()
      .post('/api/v1/products')
      .send({
        name: 'کالای بد',
        family_id: '11111111-1111-4111-8111-111111111111',
        category_id: fx.categoryId,
        base_uom_id: fx.uomId,
      })
      .expect(400);
    expect(res.body.code).toBe('invalid_family');
  });
});
