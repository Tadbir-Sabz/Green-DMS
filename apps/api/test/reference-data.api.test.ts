import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { setupProductMasterFixture, createProduct, type Fixture } from './product-master-fixture';

/**
 * TASK-PM-02-C2 — تست سرتاسری مدیریت دادههای مرجع روی بستر واقعی:
 * دیتابیس موقت PostgreSQL + همه مهاجرتها (شامل ۰۰۶۵) + AppModule واقعی +
 * HTTP/RBAC/RLS/audit/تراکنش. سه ماژول برند، واحد و دستهبندی جداگانه سنجیده
 * میشوند، به همراه یکپارچگی فرم کالا، جداسازی شرکت، رد هدر دامنهای (B2)،
 * جلوگیری از حلقه، حذف امن، و ممیزی.
 */

const PREFIX = '/api/v1/reference-data';
let fx: Fixture;
let otherCompanyId = '';
let viewerToken = '';

const code = (tag: string) => `c2_${tag}_${Date.now().toString(36)}`;
/** کد واحد حداکثر ۱۶ نویسه و فقط حروف کوچک لاتین (seed موجود + DTO/DB). */
let unitSeq = 0;
const unitCode = (tag: string) => {
  unitSeq += 1;
  return `u_${tag.slice(0, 7)}_${unitSeq.toString(36)}`;
};

beforeAll(async () => {
  fx = await setupProductMasterFixture('greendms_pm02_c2_refdata');

  // کاربرِ فقطخواندنی (master.product.view) برای اثبات اعمال RBAC روی نوشتن.
  const { hashPassword } = await import('../src/modules/identity-rbac/password');
  const pwHash = await hashPassword('Viewer!pass1');
  await fx.pool.query(
    `insert into person (company_id, code, first_name, last_name)
     values ($1, 'VIEW-C2', 'بیننده', 'کالا')`,
    [fx.companyId],
  );
  await fx.pool.query(
    `insert into app_user (person_id, username, password_hash, access_level)
     select p.id, 'c2_viewer', $1, 'web' from person p where p.code = 'VIEW-C2'`,
    [pwHash],
  );
  const role = await fx.pool.query<{ id: string }>(
    `insert into role (company_id, code, name) values ($1, 'c2_viewer_role', 'بیننده کالا') returning id`,
    [fx.companyId],
  );
  await fx.pool.query(
    `insert into role_permission (role_id, permission_code)
     select $1, code from permission where code = 'master.product.view'`,
    [role.rows[0].id],
  );
  await fx.pool.query(
    `insert into user_role (app_user_id, role_id)
     select u.id, $1 from app_user u where u.username = 'c2_viewer'`,
    [role.rows[0].id],
  );
  viewerToken = await fx.loginAs('c2_viewer', 'Viewer!pass1');

  const other = await fx.pool.query<{ id: string }>(
    `insert into company (code, legal_name) values ('C2-OTHER', 'شرکت دیگر C2') returning id`,
  );
  otherCompanyId = other.rows[0].id;
}, 180000);

afterAll(async () => {
  if (fx) await fx.teardown();
}, 60000);

describe('TASK-PM-02-C2 — برند', () => {
  let brandId = '';

  it('ایجاد، فهرست، جزئیات، جستوجو، ویرایش و lifecycle', async () => {
    const c = code('brand');
    const created = await fx.api().post(`${PREFIX}/brands`)
      .send({ code: c, name: 'برند سبز', name_latin: 'Green Brand', is_active: true })
      .expect(201);
    brandId = created.body.id;
    expect(created.body.code).toBe(c);
    expect(created.body.is_active).toBe(true);
    expect(created.body.product_count).toBe(0);

    await fx.api().post(`${PREFIX}/brands`)
      .send({ code: c, name: 'برند تکراری' }).expect(409);
    await fx.api().post(`${PREFIX}/brands`)
      .send({ code: code('brand2'), name: 'برند سبز' }).expect(409);
    await fx.api().post(`${PREFIX}/brands`)
      .send({ code: 'کد-فارسی', name: 'نامعتبر' }).expect(400);
    await fx.api().post(`${PREFIX}/brands`)
      .send({ code: code('badfield'), name: 'فیلد ناشناخته', unexpected: 1 })
      .expect(400)
      .expect((r) => expect(r.body.code).toBe('unsupported_request_field'));

    const list = await fx.api().get(`${PREFIX}/brands?q=${c}&limit=10`).expect(200);
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].id).toBe(brandId);

    const detail = await fx.api().get(`${PREFIX}/brands/${brandId}`).expect(200);
    expect(detail.body.name_latin).toBe('Green Brand');
    expect(detail.body.products).toEqual([]);
    expect(detail.body.usage_count).toBe(0);

    const patched = await fx.api().patch(`${PREFIX}/brands/${brandId}`)
      .send({ name: 'برند سبز ویرایششده', is_active: false }).expect(200);
    expect(patched.body.name).toBe('برند سبز ویرایششده');
    expect(patched.body.is_active).toBe(false);

    const activeOnly = await fx.api().get(`${PREFIX}/brands?is_active=true&q=${c}`).expect(200);
    expect(activeOnly.body.total).toBe(0);
  });

  it('کالای متصل، شمارش استفاده را افزایش داده و حذف را ممنون میکند', async () => {
    await fx.api().patch(`${PREFIX}/brands/${brandId}`).send({ is_active: true }).expect(200);
    const p = await createProduct(fx, { code: code('prod'), brand_id: brandId });
    expect(p.id).toBeTruthy();

    const detail = await fx.api().get(`${PREFIX}/brands/${brandId}`).expect(200);
    expect(detail.body.product_count).toBe(1);
    expect(detail.body.products[0].id).toBe(p.id);
    expect(detail.body.usage_count).toBe(1);

    const blocked = await fx.api().delete(`${PREFIX}/brands/${brandId}`).expect(409);
    expect(blocked.body.code).toBe('brand_in_use');
    expect(blocked.body.message_fa).toMatch(/کالا/);

    // حذف برند بدون استفاده مجاز است.
    const free = await fx.api().post(`${PREFIX}/brands`)
      .send({ code: code('free'), name: 'برند آزاد' }).expect(201);
    const result = await fx.api().delete(`${PREFIX}/brands/${free.body.id}`).expect(200);
    expect(result.body.deleted).toBe(true);
    await fx.api().get(`${PREFIX}/brands/${free.body.id}`).expect(404);
  });
});

describe('TASK-PM-02-C2 — واحد اندازهگیری', () => {
  it('ایجاد/دقت اعشار/نماد/یکتایی/کد تغییرناپذیر/حذف امن', async () => {
    const c = code('uom');
    const created = await fx.api().post(`${PREFIX}/units`)
      .send({ code: c, title: 'بسته سیب', symbol: 'بسته', title_latin: 'Apple Box', decimal_places: 3 })
      .expect(201);
    expect(created.body.decimal_places).toBe(3);
    expect(created.body.symbol).toBe('بسته');
    expect(created.body.is_active).toBe(true);

    await fx.api().post(`${PREFIX}/units`)
      .send({ code: c, title: 'تکراری' }).expect(409);
    await fx.api().post(`${PREFIX}/units`)
      .send({ code: unitCode('bad'), title: 'دقت نامعتبر', decimal_places: 5 }).expect(400);

    const listed = await fx.api().get(`${PREFIX}/units?q=${c}`).expect(200);
    expect(listed.body.total).toBe(1);
    expect(listed.body.items[0].product_count).toBe(0);

    const detail = await fx.api().get(`${PREFIX}/units/${created.body.id}`).expect(200);
    expect(detail.body.title_latin).toBe('Apple Box');
    expect(detail.body.usage_count).toBe(0);

    const patched = await fx.api().patch(`${PREFIX}/units/${created.body.id}`)
      .send({ title: 'بسته سیب ویرایششده', decimal_places: 4 }).expect(200);
    expect(patched.body.decimal_places).toBe(4);
    expect(patched.body.code).toBe(c);

    await fx.api().patch(`${PREFIX}/units/${created.body.id}`)
      .send({ code: 'changed' }).expect(400);

    // واحد پایهٔ seed شده در fixture توسط کالاها استفاده میشود → حذف ممنوع.
    await createProduct(fx, { code: code('uproduct') });
    const blocked = await fx.api().delete(`${PREFIX}/units/${fx.uomId}`).expect(409);
    expect(blocked.body.code).toBe('unit_in_use');

    const deleted = await fx.api().delete(`${PREFIX}/units/${created.body.id}`).expect(200);
    expect(deleted.body.deleted).toBe(true);
  });

  it('GET /units قدیمی همچنان پاسخ میدهد (عدم شکست سازگاری)', async () => {
    const legacy = await fx.api().get('/api/v1/units').expect(200);
    expect(Array.isArray(legacy.body.items)).toBe(true);
    expect(legacy.body.items.length).toBeGreaterThan(0);
  });
});

describe('TASK-PM-02-C2 — دستهبندی درختی', () => {
  it('سلسلهمراتب، جلوگیری از حلقه، جابهجایی، حذف امن و انتساب', async () => {
    const root = await fx.api().post(`${PREFIX}/categories`)
      .send({ code: code('root'), name: 'ریشه C2' }).expect(201);
    const child = await fx.api().post(`${PREFIX}/categories`)
      .send({ code: code('child'), name: 'فرزند C2', parent_id: root.body.id }).expect(201);
    const grand = await fx.api().post(`${PREFIX}/categories`)
      .send({ code: code('grand'), name: 'نوه C2', parent_id: child.body.id }).expect(201);

    const detail = await fx.api().get(`${PREFIX}/categories/${grand.body.id}`).expect(200);
    expect(detail.body.ancestors.map((a: { id: string }) => a.id)).toEqual([root.body.id, child.body.id]);
    expect(detail.body.parent_name).toBe('فرزند C2');

    const roots = await fx.api().get(`${PREFIX}/categories?root=true`).expect(200);
    expect(roots.body.items.some((x: { id: string }) => x.id === root.body.id)).toBe(true);
    expect(roots.body.items.some((x: { id: string }) => x.id === child.body.id)).toBe(false);

    const circularSelf = await fx.api().patch(`${PREFIX}/categories/${root.body.id}`)
      .send({ parent_id: root.body.id }).expect(409);
    expect(circularSelf.body.code).toBe('category_cycle');
    const circularDeep = await fx.api().patch(`${PREFIX}/categories/${root.body.id}`)
      .send({ parent_id: grand.body.id }).expect(409);
    expect(circularDeep.body.code).toBe('category_cycle');

    // والد غیرفعال حتی در همان شرکت پذیرفته نمیشود (قاعدهٔ «فقط مرجع فعال»).
    const inactiveParent = await fx.api().post(`${PREFIX}/categories`)
      .send({ code: code('inactive_parent'), name: 'والد غیرفعال', is_active: false }).expect(201);
    const badChild = await fx.api().post(`${PREFIX}/categories`)
      .send({ code: code('inactive_child'), name: 'فرزند والد غیرفعال', parent_id: inactiveParent.body.id })
      .expect(400);
    expect(badChild.body.code).toBe('invalid_parent_id');

    await fx.api().patch(`${PREFIX}/categories/${grand.body.id}`)
      .send({ parent_id: null }).expect(200);
    const moved = await fx.api().get(`${PREFIX}/categories/${grand.body.id}`).expect(200);
    expect(moved.body.ancestors).toEqual([]);

    const withProduct = await createProduct(fx, { code: code('catprod'), category_id: child.body.id });
    expect(withProduct.id).toBeTruthy();
    const blocked = await fx.api().delete(`${PREFIX}/categories/${child.body.id}`).expect(409);
    expect(blocked.body.code).toBe('category_in_use');

    // حذف با انتساب: فرزندان و کالاها به دستهٔ مقصد منتقل میشوند و سپس حذف میشود.
    const target = await fx.api().post(`${PREFIX}/categories`)
      .send({ code: code('target'), name: 'مقصد انتساب' }).expect(201);
    const reassigned = await fx.api()
      .delete(`${PREFIX}/categories/${child.body.id}?reassign_to=${target.body.id}`).expect(200);
    expect(reassigned.body.deleted).toBe(true);
    expect(reassigned.body.reassigned.products).toBe(1);
    await fx.api().get(`${PREFIX}/categories/${child.body.id}`).expect(404);
    const targetDetail = await fx.api().get(`${PREFIX}/categories/${target.body.id}`).expect(200);
    expect(targetDetail.body.product_count).toBe(1);

    // مقصد انتساب نیز باید فعال باشد؛ انتساب به دستهٔ غیرفعال رد میشود.
    const inactiveTarget = await fx.api().post(`${PREFIX}/categories`)
      .send({ code: code('inactive_target'), name: 'مقصد غیرفعال', is_active: false }).expect(201);
    const source = await fx.api().post(`${PREFIX}/categories`)
      .send({ code: code('source'), name: 'منبع انتساب' }).expect(201);
    await createProduct(fx, { code: code('sourceprod'), category_id: source.body.id });
    const badReassign = await fx.api()
      .delete(`${PREFIX}/categories/${source.body.id}?reassign_to=${inactiveTarget.body.id}`)
      .expect(400);
    expect(badReassign.body.code).toBe('invalid_reassign_to');
  });
});

describe('TASK-PM-02-C2 — یکپارچگی کالا و مرزها', () => {
  it('انتخاب مرجع ناموجود/غیرفعال/شرکت دیگر با پیام فارسی رد میشود', async () => {
    await fx.api().post('/api/v1/products')
      .send({ name: 'کالای برند نامعتبر', category_id: fx.categoryId, base_uom_id: fx.uomId,
              brand_id: randomUUID() })
      .expect(400).expect((r) => expect(r.body.code).toBe('invalid_brand'));

    await fx.api().post('/api/v1/products')
      .send({ name: 'کالای دسته نامعتبر', category_id: randomUUID(), base_uom_id: fx.uomId })
      .expect(400).expect((r) => expect(r.body.code).toBe('invalid_category'));

    const inactiveCategory = await fx.api().post(`${PREFIX}/categories`)
      .send({ code: code('inactive_cat'), name: 'دسته غیرفعال', is_active: false }).expect(201);
    await fx.api().post('/api/v1/products')
      .send({ name: 'کالای دسته غیرفعال', category_id: inactiveCategory.body.id, base_uom_id: fx.uomId })
      .expect(400).expect((r) => expect(r.body.code).toBe('invalid_category'));

    const inactiveUnit = await fx.api().post(`${PREFIX}/units`)
      .send({ code: unitCode('inact'), title: 'واحد غیرفعال', is_active: false }).expect(201);
    await fx.api().post('/api/v1/products')
      .send({ name: 'کالای واحد غیرفعال', category_id: fx.categoryId, base_uom_id: inactiveUnit.body.id })
      .expect(400).expect((r) => expect(r.body.code).toBe('invalid_uom'));

    const brand = await fx.api().post(`${PREFIX}/brands`)
      .send({ code: code('inactive'), name: 'برند غیرفعال', is_active: false }).expect(201);
    await fx.api().post('/api/v1/products')
      .send({ name: 'کالای برند غیرفعال', category_id: fx.categoryId, base_uom_id: fx.uomId,
              brand_id: brand.body.id })
      .expect(400).expect((r) => expect(r.body.code).toBe('invalid_brand'));

    // برندِ شرکت دیگر حتی با شناسهٔ درست قابل مشاهده/انتخاب نیست.
    const otherRow = await fx.pool.query<{ id: string }>(
      `insert into brand (company_id, code, name) values ($1, 'C2-OTHER-B', 'برند شرکت دیگر') returning id`,
      [otherCompanyId],
    );
    await fx.api().get(`${PREFIX}/brands/${otherRow.rows[0].id}`).expect(404);
    await fx.api().post('/api/v1/products')
      .send({ name: 'کالای برند شرکت دیگر', category_id: fx.categoryId, base_uom_id: fx.uomId,
              brand_id: otherRow.rows[0].id })
      .expect(400).expect((r) => expect(r.body.code).toBe('invalid_brand'));
  });

  it('هدر دامنهای B2 و پارامتر ناشناخته رد میشوند؛ بدون احراز هویت ۴۰۱', async () => {
    await fx.api().get(`${PREFIX}/brands`).set('x-domain-id', randomUUID()).expect(400);
    await fx.api().get(`${PREFIX}/brands?unsupported=1`).expect(400);
    await fx.api().get(`${PREFIX}/brands?company_id=${otherCompanyId}`).expect(400);
    await request(fx.app.getHttpServer()).get(`${PREFIX}/brands`).expect(401);
  });

  it('نوشتن نیازمند master.product.update است (RBAC)', async () => {
    await fx.api(viewerToken).post(`${PREFIX}/brands`)
      .send({ code: code('viewer'), name: 'نباید ساخته شود' }).expect(403);
    await fx.api(viewerToken).get(`${PREFIX}/brands`).expect(200);
  });

  it('تاریخچهٔ ممیزی ثبتشده و پارامتر entity_id نامعتبر رد میشود', async () => {
    const history = await fx.api().get(`${PREFIX}/history?limit=100`).expect(200);
    expect(history.body.items.length).toBeGreaterThan(0);
    expect(history.body.items.some((e: { entity_type: string }) => e.entity_type === 'brand')).toBe(true);
    expect(history.body.items.some((e: { entity_type: string }) => e.entity_type === 'uom')).toBe(true);
    expect(history.body.items.some((e: { entity_type: string }) => e.entity_type === 'product_category')).toBe(true);
    await fx.api().get(`${PREFIX}/history?entity_id=not-a-uuid`).expect(400);
    await fx.api().get(`${PREFIX}/history?entity_type=unknown`).expect(400);
  });
});
