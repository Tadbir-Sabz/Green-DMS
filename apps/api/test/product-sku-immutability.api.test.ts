import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { hashPassword } from '../src/modules/identity-rbac/password';
import {
  setupProductMasterFixture,
  createProduct,
  type Fixture,
} from './product-master-fixture';

/**
 * TASK-PM-02-C14-IDENTITY-INTEGRITY-03 — تست‌های رفتاری (DB-backed) برای
 * تغییرناپذیریِ SKU در PATCH /products/:id و قراردادِ فاصله در ورود CSV.
 *
 * تصمیم (مستندشده در گزارشِ تسک ۰۳): تغییرِ SKU یک عملیاتِ کسب‌وکاریِ پشتیبانی‌شده
 * نیست؛ هر درصدی از کلیدِ `code` در بدنهٔ PATCH قبل از ValidationPipe با
 * 400 `{ code: 'code_immutable' }` رد می‌شود و هیچ تغییری اعمال نمی‌شود.
 * تست‌ها رفتارِ واقعیِ API را می‌سنجند (نه هلپرها).
 *
 * نکته: نگاشتِ قطعیِ 23505ِ دیتابیس (race بین چکِ اپلیکیشن و INSERT) در تستِ
 * قطعی قابلِ بازتولید نیست؛ لایهٔ اپلیکیشن فقط مسیرِ create و update را با
 * mapDbError می‌پوشاند — هرگز ردیف 23505 خام به کلاینت نمی‌رسد (واحدهای پوشش
 * دهندهٔ mapDbError ادعا نمی‌شوند؛ فقط رفتارِ قابلِ مشاهده از API تست می‌شود).
 */
let fx: Fixture;

beforeAll(async () => {
  fx = await setupProductMasterFixture('greendms_pm_sku_immutability');
}, 180_000);

afterAll(async () => {
  await fx?.teardown();
});

const getProductCode = async (id: string): Promise<string | undefined> => {
  const { rows } = await fx.pool.query<{ code: string }>(
    'select code from product where company_id = $1 and id = $2',
    [fx.companyId, id],
  );
  return rows[0]?.code;
};

const getProductName = async (id: string): Promise<string | undefined> => {
  const { rows } = await fx.pool.query<{ name: string }>(
    'select name from product where company_id = $1 and id = $2',
    [fx.companyId, id],
  );
  return rows[0]?.name;
};

describe('C14-IDENTITY-03 — PATCH /products/:id و کلید code', () => {
  it('درخواست معتبرِ بدونِ code → 200 و SKU ثابت می‌ماند', async () => {
    const p = await createProduct(fx, { name: 'کالای سالم', code: 'SKU-KEEP-1' });
    const res = await fx
      .api()
      .patch(`/api/v1/products/${p.id}`)
      .send({ name: 'کالای سالمِ به‌روز', row_version: p.row_version });
    expect(res.status).toBe(200);
    expect(res.body.code).toBe('SKU-KEEP-1');
    expect(await getProductName(p.id)).toBe('کالای سالمِ به‌روز');
    expect(await getProductCode(p.id)).toBe('SKU-KEEP-1');
  });

  it('تغییرِ SKU حتی با مقدارِ تازه و بلااستفاده → 400 code_immutable؛ هیچ تغییری اعمال نمی‌شود', async () => {
    const p = await createProduct(fx, { name: 'کالای تغییرناپذیر', code: 'SKU-LOCK-1' });
    const res = await fx
      .api()
      .patch(`/api/v1/products/${p.id}`)
      .send({ name: 'نباید اعمال شود', code: 'SKU-FRESH-999' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('code_immutable');
    expect(res.body.details?.field).toBe('code');
    expect(await getProductCode(p.id)).toBe('SKU-LOCK-1');
    expect(await getProductName(p.id)).toBe('کالای تغییرناپذیر');
  });

  it('کلیدِ code حتی برابرِ مقدارِ فعلی هم رد می‌شود (تصمیم: هر code⇒400)', async () => {
    const p = await createProduct(fx, { name: 'کالای بازخوانی', code: 'SKU-SAME-1' });
    const res = await fx
      .api()
      .patch(`/api/v1/products/${p.id}`)
      .send({ code: 'SKU-SAME-1' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('code_immutable');
  });

  it('نویسهٔ کنترلی در code → 400 code_immutable', async () => {
    const p = await createProduct(fx, { name: 'کالای کنترلی', code: 'SKU-CTRL-1' });
    const res = await fx
      .api()
      .patch(`/api/v1/products/${p.id}`)
      .send({ code: 'SKU-BAD-\u0007X' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('code_immutable');
    expect(await getProductCode(p.id)).toBe('SKU-CTRL-1');
  });

  it('ZWNJ در code → 400 code_immutable', async () => {
    const p = await createProduct(fx, { name: 'کالای زی‌ان‌جی', code: 'SKU-ZWNJ-1' });
    const res = await fx
      .api()
      .patch(`/api/v1/products/${p.id}`)
      .send({ code: 'SKU\u200d-ZWNJ-2' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('code_immutable');
  });

  it('BOM در code → 400 code_immutable', async () => {
    const p = await createProduct(fx, { name: 'کالای BOM', code: 'SKU-BOM-1' });
    const res = await fx
      .api()
      .patch(`/api/v1/products/${p.id}`)
      .send({ code: '\uFEFFSKU-BOM-2' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('code_immutable');
  });

  it('BIDI (U+202E) در code → 400 code_immutable', async () => {
    const p = await createProduct(fx, { name: 'کالای BIDI', code: 'SKU-BIDI-1' });
    const res = await fx
      .api()
      .patch(`/api/v1/products/${p.id}`)
      .send({ code: 'SKU-\u202EBIDI-2' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('code_immutable');
  });

  it('فاصلهٔ ابتدا/انتها در code → 400 code_immutable', async () => {
    const p = await createProduct(fx, { name: 'کالای فاصله', code: 'SKU-SPACE-1' });
    const res = await fx
      .api()
      .patch(`/api/v1/products/${p.id}`)
      .send({ code: ' SKU-SPACE-2 ' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('code_immutable');
    expect(await getProductCode(p.id)).toBe('SKU-SPACE-1');
  });

  it('کدِ تکراریِ دقیقِ کالای دیگر → 400 code_immutable (نه 409)', async () => {
    await createProduct(fx, { name: 'کالای اول', code: 'SKU-DUP-EXACT' });
    const p2 = await createProduct(fx, { name: 'کالای دوم', code: 'SKU-DUP-OTHER' });
    const res = await fx
      .api()
      .patch(`/api/v1/products/${p2.id}`)
      .send({ code: 'SKU-DUP-EXACT' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('code_immutable');
    expect(await getProductCode(p2.id)).toBe('SKU-DUP-OTHER');
  });

  it('کدِ تکراریِ case-variant کالای دیگر → 400 code_immutable', async () => {
    await createProduct(fx, { name: 'کالای بزرگ', code: 'SKU-CASE-VAR' });
    const p2 = await createProduct(fx, { name: 'کالای کوچک', code: 'SKU-CASE-OTHER' });
    const res = await fx
      .api()
      .patch(`/api/v1/products/${p2.id}`)
      .send({ code: 'sku-case-var' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('code_immutable');
    expect(await getProductCode(p2.id)).toBe('SKU-CASE-OTHER');
  });

  it('ساختِ کالای تکراریِ دقیق (کنترل: مسیر create دست‌نخورده) → 409 duplicate_code', async () => {
    await createProduct(fx, { name: 'کالای مرجع', code: 'SKU-DUP-CREATE' });
    const res = await fx.api().post('/api/v1/products').send({
      name: 'تلاش تکراری',
      code: 'SKU-DUP-CREATE',
      category_id: fx.categoryId,
      base_uom_id: fx.uomId,
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('duplicate_code');
  });

  it('ساختِ کالای تکراریِ case-variant (کنترل: مسیر create) → 409 duplicate_code', async () => {
    await createProduct(fx, { name: 'کالای مرجع CI', code: 'SKU-CI-CREATE' });
    const res = await fx.api().post('/api/v1/products').send({
      name: 'تلاش CI',
      code: 'sku-ci-create',
      category_id: fx.categoryId,
      base_uom_id: fx.uomId,
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('duplicate_code');
  });

  it('ممیزیِ ردشدن: PATCHِ شاملِ code → ثبتِ sku_change_rejected با fields=[code] و SKU بدون تغییر', async () => {
    const p = await createProduct(fx, { name: 'کالای ممیزی', code: 'SKU-AUDIT-1' });
    const res = await fx
      .api()
      .patch(`/api/v1/products/${p.id}`)
      .send({ name: 'نامِ نباید اعمال شود', code: 'SKU-AUDIT-2' });
    expect(res.status).toBe(400);
    const audit = await fx.pool.query<{ after_data: unknown; actor_user_id: string }>(
      `select after_data, actor_user_id::text from audit_log
        where action = 'sku_change_rejected' order by at desc limit 5`,
    );
    expect(audit.rows.length).toBeGreaterThan(0);
    const entry = audit.rows[0];
    expect(entry.actor_user_id).toBeTruthy();
    const after = entry.after_data as { code?: string; fields?: string[] };
    expect(after.code).toBe('code_immutable');
    expect(after.fields).toEqual(['code']);
    expect(await getProductCode(p.id)).toBe('SKU-AUDIT-1');
    expect(await getProductName(p.id)).toBe('کالای ممیزی');
  });

  it('ممیزیِ ویرایشِ موفق: before/after نام و وضعیت را ثبت می‌کند و SKU در neither نیست', async () => {
    const p = await createProduct(fx, { name: 'کالای حسابرسیِ موفق', code: 'SKU-OKAUDIT-1' });
    const res = await fx
      .api()
      .patch(`/api/v1/products/${p.id}`)
      .send({ name: 'کالای حسابرسیِ موفق ۲', row_version: p.row_version });
    expect(res.status).toBe(200);
    const audit = await fx.pool.query<{ before_data: unknown; after_data: unknown }>(
      `select before_data, after_data from audit_log
        where entity_type = 'product' and entity_id = $1 and action = 'update'
        order by at desc limit 1`,
      [p.id],
    );
    expect(audit.rows.length).toBe(1);
    const before = audit.rows[0].before_data as Record<string, unknown>;
    const after = audit.rows[0].after_data as Record<string, unknown>;
    expect(before.name).toBe('کالای حسابرسیِ موفق');
    expect(after.name).toBe('کالای حسابرسیِ موفق ۲');
    expect(before).not.toHaveProperty('code');
    expect(after).not.toHaveProperty('code');
  });
});

describe('C14-IDENTITY-03 — همان SKU در شرکتِ دیگر (مرزِ tenant)', () => {
  let otherToken: string | null = null;
  let otherProductId: string | null = null;

  beforeAll(async () => {
    const otherCompany = await fx.pool.query<{ id: string }>(
      `insert into company (code, legal_name) values ('PMCO2', 'شرکت دوم تست') returning id`,
    );
    const otherCompanyId = otherCompany.rows[0].id;
    const person = await fx.pool.query<{ id: string }>(
      `insert into person (company_id, code, first_name, last_name) values ($1, 'ADM-PM2', 'مدیر', 'دوم') returning id`,
      [otherCompanyId],
    );
    const password = 'S3cret!pass2';
    const hash = await hashPassword(password);
    await fx.pool.query(
      `insert into app_user (person_id, username, password_hash, access_level) values ($1, 'pm_admin2', $2, 'web')`,
      [person.rows[0].id, hash],
    );
    const role = await fx.pool.query<{ id: string }>(
      `insert into role (company_id, code, name) values ($1, 'pm_admin_role2', 'نقش مدیر دوم') returning id`,
      [otherCompanyId],
    );
    await fx.pool.query(
      `insert into role_permission (role_id, permission_code)
       select $1, code from permission where code like 'master.product%'`,
      [role.rows[0].id],
    );
    await fx.pool.query(
      `insert into user_role (app_user_id, role_id)
       select u.id, $1 from app_user u where u.username = 'pm_admin2'`,
      [role.rows[0].id],
    );
    otherToken = await fx.loginAs('pm_admin2', password);
  }, 60_000);

  it('همان SKU در شرکتِ دیگر قابلِ ساخت است (قیدِ یکتایی per-company است)', async () => {
    expect(otherToken).toBeTruthy();
    await createProduct(fx, { name: 'کالای شرکت اول', code: 'SKU-XCO-1' });
    const res = await fx
      .api(otherToken!)
      .post('/api/v1/products')
      .send({
        name: 'کالای شرکت دوم',
        code: 'SKU-XCO-1',
        category_id: (
          await fx.pool.query<{ id: string }>(
            `insert into product_category (company_id, code, name)
             select id, 'PMCAT2', 'گروه' from company where code = 'PMCO2' returning id`,
          )
        ).rows[0].id,
        base_uom_id: fx.uomId,
      });
    // دسته‌بندیِ شرکتِ دوم ساخته شد یا از قبل وجود دارد؛ هر دو مسیر = 201 یا 409ِ ارجاعی — انتظار: ساخته شود
    expect(res.status).toBe(201);
    expect(res.body.code).toBe('SKU-XCO-1');
    otherProductId = res.body.id ?? null;
    expect(otherProductId).toBeTruthy();
  });

  it('PATCHِ شاملِ code در شرکتِ دیگر هم 400 code_immutable می‌گیرد', async () => {
    expect(otherToken).toBeTruthy();
    expect(otherProductId).toBeTruthy();
    const res = await fx
      .api(otherToken!)
      .patch(`/api/v1/products/${otherProductId}`)
      .send({ code: 'SKU-XCO-2' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('code_immutable');
  });
});

describe('C14-IDENTITY-03 — ورودِ گروهی: فاصلهٔ ابتدا/انتهای کد (CSV)', () => {
  const CSV_HEADER = 'code,name,category_code,base_uom_code';
  const csv = (rows: string[]) => [CSV_HEADER, ...rows].join('\n');

  it('validate: کد با فاصلهٔ ابتدا/انتها → خطای ردیفِ invalid_code (نه بی‌صدایی)', async () => {
    const res = await fx
      .api()
      .post('/api/v1/products/import/validate')
      .send({ csv: csv([' SPACE-CSV-1 ,کالای فاصله‌دار,PMCAT,pm_piece']) })
      .expect(200);
    const hit = (res.body.row_errors as { row: number; code: string }[]).find(
      (e) => e.code === 'invalid_code',
    );
    expect(hit).toBeTruthy();
  });

  it('validate: کد با نویسهٔ کنترلی همچنان خطای invalid_code می‌دهد (بدون تغییر رفتارِ قبلی)', async () => {
    const res = await fx
      .api()
      .post('/api/v1/products/import/validate')
      .send({ csv: csv(['CTRL-CSV-\u0007X,کالای کنترلی,PMCAT,pm_piece']) })
      .expect(200);
    const hit = (res.body.row_errors as { row: number; code: string }[]).find(
      (e) => e.code === 'invalid_code',
    );
    expect(hit).toBeTruthy();
  });
});
