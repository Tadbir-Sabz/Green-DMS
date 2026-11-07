import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupProductMasterFixture, createProduct, type Fixture } from './product-master-fixture';

/**
 * تست‌های امنیت/یکپارچگیِ Product Master: RBAC، جداسازیِ tenant، هم‌زمانی (race)،
 * D4 در مسیرِ packaging، M-2 قیمتِ سطحِ بسته‌بندی.
 */
let fx: Fixture;
let readonlyToken = '';

beforeAll(async () => {
  fx = await setupProductMasterFixture('greendms_pm_security');

  // کاربرِ فقط-خواندنی
  const hashRow = await fx.pool.query<{ hash: string }>(
    `select password_hash as hash from app_user where username = 'pm_admin'`,
  );
  const person = await fx.pool.query<{ id: string }>(
    `insert into person (company_id, code, first_name, last_name) values ($1, 'ADM-R', 'کاربر', 'فقط‌خواندنی') returning id`,
    [fx.companyId],
  );
  await fx.pool.query(
    `insert into app_user (person_id, username, password_hash, access_level) values ($1, 'pm_viewer', $2, 'web')`,
    [person.rows[0].id, hashRow.rows[0].hash],
  );
  const role = await fx.pool.query<{ id: string }>(
    `insert into role (company_id, code, name) values ($1, 'pm_viewer_role', 'نقش فقط‌خواندنی') returning id`,
    [fx.companyId],
  );
  await fx.pool.query(
    `insert into role_permission (role_id, permission_code) values ($1, 'master.product.view')`,
    [role.rows[0].id],
  );
  await fx.pool.query(
    `insert into user_role (app_user_id, role_id) select u.id, $1 from app_user u where u.username = 'pm_viewer'`,
    [role.rows[0].id],
  );
  readonlyToken = await fx.loginAs('pm_viewer', fx.adminPassword);
}, 180_000);

afterAll(async () => {
  await fx?.teardown();
});

describe('RBAC — مجوزها روی همهٔ مسیرهای جدید', () => {
  it('بدونِ توکن → 401', async () => {
    await fx.api('').get('/api/v1/products/scan/123').expect(401);
    await fx.api('').post('/api/v1/products/import/validate').send({ csv: 'code' }).expect(401);
  });

  it('کاربرِ فقط‌خواندنی: خواندن آزاد، نوشتن 403', async () => {
    const p = await createProduct(fx, { name: 'کالای امنیت', code: 'SEC-1' });
    await fx.api(readonlyToken).get(`/api/v1/products/${p.id}/barcodes`).expect(200);
    await fx
      .api(readonlyToken)
      .post(`/api/v1/products/${p.id}/barcodes`)
      .send({ barcode: '123', kind: 'internal' })
      .expect(403);
    await fx.api(readonlyToken).post('/api/v1/products/import/validate').send({ csv: 'code' }).expect(403);
    await fx
      .api(readonlyToken)
      .put(`/api/v1/products/${p.id}/bundle`)
      .send({ items: [], confirm_sensitive: true })
      .expect(403);
  });

  it('D4: کاربرِ بدونِ مجوزِ status حتی با confirm هم نمی‌تواند وضعیت عوض کند → 403', async () => {
    const p = await createProduct(fx, { name: 'کالای وضعیت', code: 'SEC-2' });
    // نقشِ viewer مجوزِ update هم ندارد — برای جداسازیِ دقیقِ status، نقشِ update بدونِ status می‌سازیم
    const hashRow = await fx.pool.query<{ hash: string }>(
      `select password_hash as hash from app_user where username = 'pm_admin'`,
    );
    const person = await fx.pool.query<{ id: string }>(
      `insert into person (company_id, code, first_name, last_name) values ($1, 'ADM-U', 'کاربر', 'ویرایشگر') returning id`,
      [fx.companyId],
    );
    await fx.pool.query(
      `insert into app_user (person_id, username, password_hash, access_level) values ($1, 'pm_updater', $2, 'web')`,
      [person.rows[0].id, hashRow.rows[0].hash],
    );
    const role = await fx.pool.query<{ id: string }>(
      `insert into role (company_id, code, name) values ($1, 'pm_updater_role', 'نقش ویرایشگر') returning id`,
      [fx.companyId],
    );
    await fx.pool.query(
      `insert into role_permission (role_id, permission_code)
       values ($1, 'master.product.view'), ($1, 'master.product.create'), ($1, 'master.product.update')`,
      [role.rows[0].id],
    );
    await fx.pool.query(
      `insert into user_role (app_user_id, role_id) select u.id, $1 from app_user u where u.username = 'pm_updater'`,
      [role.rows[0].id],
    );
    const updaterToken = await fx.loginAs('pm_updater', fx.adminPassword);

    // با تأیید ولی بدونِ مجوزِ status → 403 status_change_forbidden
    const res = await fx
      .api(updaterToken)
      .patch(`/api/v1/products/${p.id}`)
      .send({ status: 'blocked', confirm_sensitive: true })
      .expect(403);
    expect(res.body.code).toBe('status_change_forbidden');
  });
});

describe('Tenant — جداسازیِ چندشرکتی', () => {
  it('بارکد/alias کالای شرکتِ دیگر از نشستِ بیگانه 404 می‌گیرد', async () => {
    const p = await createProduct(fx, { name: 'کالای خصوصی', code: 'TEN-1' });
    // شرکت و کاربرِ دوم
    const company2 = await fx.pool.query<{ id: string }>(
      `insert into company (code, legal_name) values ('SECCO2', 'شرکت امنیت ۲') returning id`,
    );
    const hashRow = await fx.pool.query<{ hash: string }>(
      `select password_hash as hash from app_user where username = 'pm_admin'`,
    );
    const person = await fx.pool.query<{ id: string }>(
      `insert into person (company_id, code, first_name, last_name) values ($1, 'ADM-2', 'کاربر', 'دو') returning id`,
      [company2.rows[0].id],
    );
    await fx.pool.query(
      `insert into app_user (person_id, username, password_hash, access_level) values ($1, 'pm_admin2', $2, 'web')`,
      [person.rows[0].id, hashRow.rows[0].hash],
    );
    const role = await fx.pool.query<{ id: string }>(
      `insert into role (company_id, code, name) values ($1, 'r2', 'نقش ۲') returning id`,
      [company2.rows[0].id],
    );
    await fx.pool.query(
      `insert into role_permission (role_id, permission_code)
       select $1, code from permission where code like 'master.product%'`,
      [role.rows[0].id],
    );
    await fx.pool.query(
      `insert into user_role (app_user_id, role_id) select u.id, $1 from app_user u where u.username = 'pm_admin2'`,
      [role.rows[0].id],
    );
    const token2 = await fx.loginAs('pm_admin2', fx.adminPassword);

    await fx.api(token2).get(`/api/v1/products/${p.id}/barcodes`).expect(200); // لیستِ خالی (نه 403 — دامنهٔ شرکت)
    const res = await fx
      .api(token2)
      .post(`/api/v1/products/${p.id}/barcodes`)
      .send({ barcode: '1112223334445', kind: 'gs1_ean13' })
      .expect(404);
    expect(res.body.code).toBe('not_found');
  });
});

describe('هم‌زمانی — حفاظتِ race در سطحِ DB', () => {
  it('دو ثبتِ هم‌زمانِ یک بارکدِ gs1: دقیقاً یکی موفق', async () => {
    const p1 = await createProduct(fx, { name: 'کالای مسابقه ۱', code: 'RACE-1' });
    const p2 = await createProduct(fx, { name: 'کالای مسابقه ۲', code: 'RACE-2' });
    const [r1, r2] = await Promise.all([
      fx.api().post(`/api/v1/products/${p1.id}/barcodes`).send({ barcode: '1212121212121', kind: 'gs1_ean13' }),
      fx.api().post(`/api/v1/products/${p2.id}/barcodes`).send({ barcode: '1212121212121', kind: 'gs1_ean13' }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 409]);
  });

  it('قفلِ خوش‌بینانه: PATCH هم‌زمان با row_version یکسان → یکی 409', async () => {
    const p = await createProduct(fx, { name: 'کالای نسخه', code: 'RACE-V' });
    const [r1, r2] = await Promise.all([
      fx.api().patch(`/api/v1/products/${p.id}`).send({ name: 'نام ۱', row_version: p.row_version }),
      fx.api().patch(`/api/v1/products/${p.id}`).send({ name: 'نام ۲', row_version: p.row_version }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 409]);
  });
});

describe('D4 — مسیرِ packaging (فاکتورِ تبدیل حساس)', () => {
  it('ساختِ بسته‌بندی بدونِ confirm_sensitive → 400؛ با تأیید → 201 + audit', async () => {
    const p = await createProduct(fx, { name: 'کالای بسته‌بندی', code: 'PACK-1' });
    const res = await fx
      .api()
      .post('/api/v1/packaging/product-packaging')
      .send({ product_id: p.id, uom_id: fx.uomBoxId, factor_to_base: 6 })
      .expect(400);
    expect(res.body.code).toBe('sensitive_change_requires_confirmation');

    const ok = await fx
      .api()
      .post('/api/v1/packaging/product-packaging')
      .send({ product_id: p.id, uom_id: fx.uomBoxId, factor_to_base: 6, confirm_sensitive: true })
      .expect(201);
    expect(Number(ok.body.factor_to_base)).toBe(6);
    const audit = await fx.pool.query(
      `select 1 from audit_log where entity_type = 'product_packaging' and entity_id = $1`,
      [ok.body.id],
    );
    expect(audit.rows.length).toBe(1);
  });

  it('H-1: بارکدِ packaging در product_barcode هم ثبت می‌شود', async () => {
    const p = await createProduct(fx, { name: 'کالای بارکدی', code: 'PACK-2' });
    const ok = await fx
      .api()
      .post('/api/v1/packaging/product-packaging')
      .send({
        product_id: p.id,
        uom_id: fx.uomBoxId,
        factor_to_base: 12,
        barcode: '1313131313131',
        confirm_sensitive: true,
      })
      .expect(201);
    const barcodes = await fx.api().get(`/api/v1/products/${p.id}/barcodes`).expect(200);
    expect(barcodes.body.length).toBe(1);
    expect(barcodes.body[0].packaging_id).toBe(ok.body.id);
  });
});

describe('M-2 — قیمتِ سطحِ بسته‌بندی', () => {
  it('قیمتِ دو packaging متفاوت برای یک کالا آزاد؛ هم‌پوشانیِ همان packaging مسدود', async () => {
    const p = await createProduct(fx, { name: 'کالای قیمتی', code: 'PRICE-1' });
    const pack = await fx
      .api()
      .post('/api/v1/packaging/product-packaging')
      .send({ product_id: p.id, uom_id: fx.uomBoxId, factor_to_base: 12, confirm_sensitive: true })
      .expect(201);
    const pl = await fx.pool.query<{ id: string }>(
      `insert into price_list (company_id, code, title) values ($1, 'PL-M2', 'لیست') returning id`,
      [fx.companyId],
    );
    // قیمتِ واحدِ پایه
    await fx.pool.query(
      `insert into price_list_item (price_list_id, product_id, price, min_qty, valid)
       values ($1, $2, 1000, 0, daterange(null, null))`,
      [pl.rows[0].id, p.id],
    );
    // قیمتِ دوبارهٔ همان (product, packaging=NULL) در همان بازه → مسدود (رفتارِ legacy حفظ می‌شود)
    await expect(
      fx.pool.query(
        `insert into price_list_item (price_list_id, product_id, packaging_id, price, min_qty, valid)
         values ($1, $2, $3, 11000, 0, daterange(null, null))`,
        [pl.rows[0].id, p.id, null],
      ),
    ).rejects.toThrow();
  });

  it('قیمتِ packaging متفاوت با NULL (پایه) هم‌پوشانی ندارد → آزاد', async () => {
    const p = await createProduct(fx, { name: 'کالای قیمتی ۲', code: 'PRICE-2' });
    const pack = await fx
      .api()
      .post('/api/v1/packaging/product-packaging')
      .send({ product_id: p.id, uom_id: fx.uomBoxId, factor_to_base: 12, confirm_sensitive: true })
      .expect(201);
    const pl = await fx.pool.query<{ id: string }>(
      `insert into price_list (company_id, code, title) values ($1, 'PL-M2B', 'لیست ۲') returning id`,
      [fx.companyId],
    );
    await fx.pool.query(
      `insert into price_list_item (price_list_id, product_id, price, min_qty, valid)
       values ($1, $2, 1000, 0, daterange(null, null))`,
      [pl.rows[0].id, p.id],
    );
    // قیمتِ سطحِ packaging متفاوت → آزاد (M-2: آزادسازیِ قیمتِ packagingهای متفاوت)
    await fx.pool.query(
      `insert into price_list_item (price_list_id, product_id, packaging_id, price, min_qty, valid)
       values ($1, $2, $3, 11000, 0, daterange(null, null))`,
      [pl.rows[0].id, p.id, pack.body.id],
    );
    // تکرارِ همان packaging در همان بازه → مسدود
    await expect(
      fx.pool.query(
        `insert into price_list_item (price_list_id, product_id, packaging_id, price, min_qty, valid)
         values ($1, $2, $3, 12000, 0, daterange(null, null))`,
        [pl.rows[0].id, p.id, pack.body.id],
      ),
    ).rejects.toThrow();
  });
});
