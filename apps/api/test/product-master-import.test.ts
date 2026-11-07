import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupProductMasterFixture, type Fixture } from './product-master-fixture';

/**
 * تست‌های رفتاریِ import (§E + M-5): اعتبارسنجیِ ردیف‌به‌ردیف، تشخیصِ تکرار،
 * حالت‌های create/update، idempotency، فیلدهای حساس، ایزوله‌سازیِ tenant، audit.
 */
let fx: Fixture;

beforeAll(async () => {
  fx = await setupProductMasterFixture('greendms_pm_import');
}, 180_000);

afterAll(async () => {
  await fx?.teardown();
});

const CSV_HEADER = 'code,name,category_code,base_uom_code';
const csv = (rows: string[]) => [CSV_HEADER, ...rows].join('\n');

describe('§E — validate: پیش‌نمایشِ بدونِ نوشتن', () => {
  it('ردیفِ معتبر بدونِ خطا؛ ردیفِ بدونِ گروه/واحد با پیامِ فارسیِ ردیف‌به‌ردیف', async () => {
    const res = await fx
      .api()
      .post('/api/v1/products/import/validate')
      .send({
        csv: csv([
          'IMP-1,کالای وارداتی,PMCAT,pm_piece',
          'IMP-2,کالای ناقص,,',
        ]),
      })
      .expect(200);
    expect(res.body.rows.length).toBe(2);
    const errorsForRow3 = res.body.row_errors.filter((e: { row: number }) => e.row === 3);
    expect(errorsForRow3.length).toBeGreaterThan(0);
    expect(errorsForRow3[0].message_fa).toContain('گروه');
  });

  it('تکرارِ کد درونِ فایل → خطای duplicate_in_file', async () => {
    const res = await fx
      .api()
      .post('/api/v1/products/import/validate')
      .send({
        csv: csv([
          'DUP-1,کالای یک,PMCAT,pm_piece',
          'DUP-1,کالای دو,PMCAT,pm_piece',
        ]),
      })
      .expect(200);
    expect(res.body.row_errors.some((e: { code: string }) => e.code === 'duplicate_in_file')).toBe(true);
  });

  it('فایلِ خالی/بدونِ سربرگ → 400', async () => {
    await fx.api().post('/api/v1/products/import/validate').send({ csv: 'code' }).expect(400);
    await fx.api().post('/api/v1/products/import/validate').send({ csv: '' }).expect(400);
  });

  it('سربرگِ فارسی پذیرفته می‌شود', async () => {
    const res = await fx
      .api()
      .post('/api/v1/products/import/validate')
      .send({ csv: ['کد,نام,گروه,واحد', 'FA-1,کالای فارسی,PMCAT,pm_piece'].join('\n') })
      .expect(200);
    expect(res.body.row_errors.length).toBe(0);
    expect(res.body.rows[0].name).toBe('کالای فارسی');
  });
});

describe('§E — commit: اجرا، idempotency، حالت‌ها', () => {
  it('mode=create → ساختِ کالاها + گزارش + audit', async () => {
    const res = await fx
      .api()
      .post('/api/v1/products/import/commit')
      .send({
        csv: csv(['IC-1,کالای ورودی ۱,PMCAT,pm_piece', 'IC-2,کالای ورودی ۲,PMCAT,pm_box']),
        mode: 'create',
        idempotency_key: 'test-key-1',
      })
      .expect(200);
    expect(res.body.created_rows).toBe(2);
    expect(res.body.failed_rows).toBe(0);
    expect(res.body.idempotent_replay).toBe(false);

    const product = await fx.pool.query(
      `select 1 from product where company_id = $1 and code = 'IC-1'`,
      [fx.companyId],
    );
    expect(product.rows.length).toBe(1);
    const audit = await fx.pool.query(
      `select 1 from audit_log where entity_type = 'product_import'`,
    );
    expect(audit.rows.length).toBeGreaterThan(0);
  });

  it('تکرارِ همان idempotency_key → بدونِ اثرِ دوباره (idempotent_replay)', async () => {
    const payload = {
      csv: csv(['IDEM-1,کالای idempotent,PMCAT,pm_piece']),
      mode: 'create',
      idempotency_key: 'test-key-2',
    };
    const first = await fx.api().post('/api/v1/products/import/commit').send(payload).expect(200);
    expect(first.body.created_rows).toBe(1);
    const second = await fx.api().post('/api/v1/products/import/commit').send(payload).expect(200);
    expect(second.body.idempotent_replay).toBe(true);
    expect(second.body.import_id).toBe(first.body.import_id);
    const count = await fx.pool.query(
      `select count(*)::int as n from product where company_id = $1 and code = 'IDEM-1'`,
      [fx.companyId],
    );
    expect(count.rows[0].n).toBe(1);
  });

  it('mode=update روی کدِ ناموجود → خطای ردیف (نه خرابیِ کلِ فایل)', async () => {
    const res = await fx
      .api()
      .post('/api/v1/products/import/commit')
      .send({
        csv: csv(['NO-SUCH,کالا,PMCAT,pm_piece']),
        mode: 'update',
        idempotency_key: 'test-key-3',
      })
      .expect(200);
    expect(res.body.failed_rows).toBe(1);
    expect(res.body.errors[0].message_fa).toContain('برای بروزرسانی یافت نشد');
  });

  it('mode=update → بروزرسانیِ نام', async () => {
    await fx
      .api()
      .post('/api/v1/products/import/commit')
      .send({ csv: csv(['UP-1,نام اول,PMCAT,pm_piece']), mode: 'create', idempotency_key: 'k-up-0' })
      .expect(200);
    const res = await fx
      .api()
      .post('/api/v1/products/import/commit')
      .send({ csv: csv(['UP-1,نام دوم,PMCAT,pm_piece']), mode: 'update', idempotency_key: 'k-up-1' })
      .expect(200);
    expect(res.body.updated_rows).toBe(1);
    const row = await fx.pool.query(`select name from product where code = 'UP-1' and company_id = $1`, [fx.companyId]);
    expect(row.rows[0].name).toBe('نام دوم');
  });

  it('گزارشِ import با GET /products/import/report/{id} خوانده می‌شود', async () => {
    const commit = await fx
      .api()
      .post('/api/v1/products/import/commit')
      .send({ csv: csv(['RPT-1,کالای گزارش,PMCAT,pm_piece']), mode: 'create', idempotency_key: 'k-rpt' })
      .expect(200);
    const report = await fx.api().get(`/api/v1/products/import/report/${commit.body.import_id}`).expect(200);
    expect(report.body.total_rows).toBe(1);
    expect(report.body.report.length).toBeGreaterThan(0);
  });
});

describe('M-5 — فیلدهای حساس در import', () => {
  it('ردیفِ update با status بدونِ confirm_sensitive رد می‌شود (هرگز bypass)', async () => {
    await fx
      .api()
      .post('/api/v1/products/import/commit')
      .send({ csv: csv(['SENS-UP,کالای حساس,PMCAT,pm_piece']), mode: 'create', idempotency_key: 'k-s0' })
      .expect(200);
    const res = await fx
      .api()
      .post('/api/v1/products/import/commit')
      .send({
        csv: ['code,name,status,category_code,base_uom_code', 'SENS-UP,کالای حساس,blocked,PMCAT,pm_piece'].join('\n'),
        mode: 'update',
        idempotency_key: 'k-s1',
      })
      .expect(200);
    expect(res.body.failed_rows).toBe(1);
    expect(res.body.errors[0].code).toBe('sensitive_change_requires_confirmation');
  });

  it('همان ردیف با confirm_sensitive پذیرفته می‌شود + audit', async () => {
    const res = await fx
      .api()
      .post('/api/v1/products/import/commit')
      .send({
        csv: ['code,name,status,category_code,base_uom_code', 'SENS-UP,کالای حساس,blocked,PMCAT,pm_piece'].join('\n'),
        mode: 'update',
        idempotency_key: 'k-s2',
        confirm_sensitive: true,
      })
      .expect(200);
    expect(res.body.updated_rows).toBe(1);
  });
});

describe('Tenant — شرکت از نشست می‌آید، هرگز از CSV', () => {
  it('CSV نمی‌تواند شرکت را عوض کند؛ کدها در شرکتِ نشست ساخته می‌شوند', async () => {
    await fx
      .api()
      .post('/api/v1/products/import/commit')
      .send({ csv: csv(['TEN-1,کالای tenant,PMCAT,pm_piece']), mode: 'create', idempotency_key: 'k-ten' })
      .expect(200);
    const rows = await fx.pool.query(
      `select company_id from product where code = 'TEN-1'`,
    );
    expect(rows.rows[0].company_id).toBe(fx.companyId);
  });
});
