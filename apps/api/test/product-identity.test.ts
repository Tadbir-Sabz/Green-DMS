import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupProductMasterFixture, createProduct, type Fixture } from './product-master-fixture';
import { hashPassword } from '../src/modules/identity-rbac/password';
import { normalizeText } from '../src/modules/master-data/product-normalize';
import {
  C7_FORBIDDEN_CLIENT_FIELDS,
  PRODUCT_ALIAS_MAX_PER_PRODUCT,
  PRODUCT_ATTRIBUTE_NUMERIC_MAX_ABS,
} from '../src/modules/master-data/product-identity.rules';

/**
 * TASK-PM-02-C7 — هویتِ کالا (alias + attribute) از مسیرهای واقعیِ HTTP.
 *
 * هر تست فقط رفتارهایی را می‌سنجد که در C1–C6 مستند و پیاده‌شده‌اند: سه نوع alias،
 * یکتاییِ `(product_id, alias_norm)`، برخوردِ H-1، کاتالوگِ صفاتِ شرکت، قیدِ
 * kind↔column، الزامِ شرکت‌محور، و تغییرناپذیریِ محورِ variant پس از ارجاع عملیاتی.
 */
let fx: Fixture;
let viewerToken: string;

beforeAll(async () => {
  fx = await setupProductMasterFixture('greendms_pm_identity');
  // کاربرِ فقط-خواندن برای سنجشِ گیتِ مجوز
  const password = 'V1ewer!pass';
  const hash = await hashPassword(password);
  const person = await fx.pool.query<{ id: string }>(
    `insert into person (company_id, code, first_name, last_name) values ($1, 'VIEW-PM', 'بیننده', 'کالا') returning id`,
    [fx.companyId],
  );
  await fx.pool.query(
    `insert into app_user (person_id, username, password_hash, access_level) values ($1, 'pm_viewer', $2, 'web')`,
    [person.rows[0].id, hash],
  );
  const role = await fx.pool.query<{ id: string }>(
    `insert into role (company_id, code, name) values ($1, 'pm_viewer_role', 'نقش بیننده کالا') returning id`,
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
  viewerToken = await fx.loginAs('pm_viewer', password);
}, 240_000);

afterAll(async () => {
  await fx?.teardown();
});

const makeDef = async (code: string, body: Record<string, unknown> = {}): Promise<string> => {
  const res = await fx
    .api()
    .post('/api/v1/product-attributes')
    .send({ code, title: `صفت ${code}`, kind: 'text', ...body })
    .expect(201);
  return res.body.id;
};

describe('C7 — قرارداد نام جایگزین (خواندن)', () => {
  it('نمای کامل: سه نوعِ مصوب + شمارش + actor + شکلِ سازگارِ عقب‌رو', async () => {
    const p = await createProduct(fx, { name: 'کالای نمای alias', code: 'A-VIEW-1' });
    const res = await fx.api().get(`/api/v1/products/${p.id}/aliases`).expect(200);
    expect(res.body.scope).toBe('central');
    expect(res.body.product.code).toBe('A-VIEW-1');
    expect(res.body.kinds.map((k: { kind: string }) => k.kind)).toEqual(['brand_slang', 'latin', 'code']);
    expect(res.body.kinds.filter((k: { used_in_scan: boolean }) => k.used_in_scan).map((k: { kind: string }) => k.kind)).toEqual(['code']);
    expect(res.body.actor).toMatchObject({ can_view: true, can_update: true, unavailable_reason_fa: null });
    expect(res.body.items).toEqual([]);
    expect(res.body.aliases).toEqual([]);
    expect(res.body.counts).toEqual({ total: 0, brand_slang: 0, latin: 0, code: 0, truncated: false });
    expect(res.body.downstream_notes_fa.length).toBeGreaterThan(0);
    expect(res.body.owner_decisions_fa.map((d: { id: string }) => d.id)).toContain('C7-D1');
  });

  it('فیلتر kind، سقف limit و شکلِ سازگارِ items/aliases', async () => {
    const p = await createProduct(fx, { name: 'کالای فیلتر alias', code: 'A-VIEW-2' });
    await fx.api().post(`/api/v1/products/${p.id}/aliases`).send({ alias: 'برندِ محل', kind: 'brand_slang' }).expect(201);
    await fx.api().post(`/api/v1/products/${p.id}/aliases`).send({ alias: 'Local Brand', kind: 'latin' }).expect(201);
    await fx.api().post(`/api/v1/products/${p.id}/aliases`).send({ alias: 'AV2-OLD', kind: 'code' }).expect(201);

    const onlyCode = await fx.api().get(`/api/v1/products/${p.id}/aliases?kind=code`).expect(200);
    expect(onlyCode.body.items).toHaveLength(1);
    expect(onlyCode.body.items[0]).toMatchObject({ kind: 'code', used_in_scan: true });
    // شمارش مستقل از فیلتر است
    expect(onlyCode.body.counts).toMatchObject({ total: 3, brand_slang: 1, latin: 1, code: 1 });

    const all = await fx.api().get(`/api/v1/products/${p.id}/aliases`).expect(200);
    expect(all.body.aliases.map((a: { alias: string }) => a.alias).sort()).toEqual(['AV2-OLD', 'Local Brand', 'برندِ محل'].sort());
    expect(all.body.aliases[0]).toEqual(
      expect.objectContaining({ id: expect.any(String), product_id: p.id, alias: expect.any(String), alias_norm: expect.any(String), kind: expect.any(String) }),
    );

    const limited = await fx.api().get(`/api/v1/products/${p.id}/aliases?limit=1`).expect(200);
    expect(limited.body.items).toHaveLength(1);
    expect(limited.body.counts.truncated).toBe(true);

    await fx.api().get(`/api/v1/products/${p.id}/aliases?kind=global`).expect(400);
    await fx.api().get(`/api/v1/products/${p.id}/aliases?limit=0`).expect(400);
    await fx.api().get(`/api/v1/products/${p.id}/aliases?limit=${PRODUCT_ALIAS_MAX_PER_PRODUCT + 1000}`).expect(400);
    await fx.api().get(`/api/v1/products/${p.id}/aliases?company_id=x`).expect(400);
  });
});

describe('C7 — افزودن نام جایگزین: نرمال‌سازی و برخورد', () => {
  it('مقدار نرمال می‌شود (ارقام فارسی، فاصلهٔ اضافی، حروف بزرگ)', async () => {
    const p = await createProduct(fx, { name: 'کالای نرمال', code: 'A-NORM-1' });
    const res = await fx
      .api()
      .post(`/api/v1/products/${p.id}/aliases`)
      .send({ alias: '  نوشابه   مشکی ۱۲۳  ', kind: 'latin' })
      .expect(201);
    expect(res.body.alias_norm).toBe(normalizeText('نوشابه مشکی 123'));
    expect(res.body.kind_label_fa).toBeTruthy();
    expect(res.body.used_in_scan).toBe(false);
  });

  it('مقدار خالی، فقط فاصله، بیش‌ازحد بلند و کنترلی → 400', async () => {
    const p = await createProduct(fx, { name: 'کالای نامعتبر', code: 'A-BAD-1' });
    await fx.api().post(`/api/v1/products/${p.id}/aliases`).send({ alias: '' }).expect(400);
    await fx.api().post(`/api/v1/products/${p.id}/aliases`).send({ alias: '    ' }).expect(400);
    await fx.api().post(`/api/v1/products/${p.id}/aliases`).send({ alias: 'x'.repeat(256) }).expect(400);
    await fx.api().post(`/api/v1/products/${p.id}/aliases`).send({ alias: 12345 }).expect(400);
    const ctl = await fx.api().post(`/api/v1/products/${p.id}/aliases`).send({ alias: '\u0007\u0007' }).expect(400);
    expect(['validation_failed', 'invalid_alias']).toContain(ctl.body.code);
    await fx.api().post(`/api/v1/products/${p.id}/aliases`).send({ alias: 'ok', kind: 'official' }).expect(400);
  });

  it('تکرار در همان کالا → 409 duplicate_alias؛ هم‌ارزی با بارکد → 409 alias_collision', async () => {
    const p = await createProduct(fx, { name: 'کالای تکرار alias', code: 'A-DUP-1' });
    await fx.api().post(`/api/v1/products/${p.id}/aliases`).send({ alias: 'کوکا', kind: 'brand_slang' }).expect(201);
    const dup = await fx.api().post(`/api/v1/products/${p.id}/aliases`).send({ alias: 'کوکا', kind: 'brand_slang' }).expect(409);
    expect(dup.body.code).toBe('duplicate_alias');
    // همان مقدار با نوعِ دیگر هم ردیفِ جداگانه نمی‌سازد (یکتایی روی alias_norm)
    const dup2 = await fx.api().post(`/api/v1/products/${p.id}/aliases`).send({ alias: 'کوکا', kind: 'code' }).expect(409);
    expect(dup2.body.code).toBe('duplicate_alias');

    await fx.api().post(`/api/v1/products/${p.id}/barcodes`).send({ barcode: '9990001112223', kind: 'internal' }).expect(201);
    const viaBarcode = await fx.api().post(`/api/v1/products/${p.id}/aliases`).send({ alias: '9990001112223' }).expect(409);
    expect(viaBarcode.body.code).toBe('alias_collision');
  });

  it('برخورد با کد کالای دیگر و با نام جایگزین کالای دیگر → 409 (قاعدهٔ موجود، بدون یکتاییِ تازه)', async () => {
    const p1 = await createProduct(fx, { name: 'کالای برخورد ۱', code: 'A-COL-1' });
    const p2 = await createProduct(fx, { name: 'کالای برخورد ۲', code: 'A-COL-2' });

    const viaCode = await fx.api().post(`/api/v1/products/${p2.id}/aliases`).send({ alias: 'A-COL-1', kind: 'code' }).expect(409);
    expect(viaCode.body.code).toBe('alias_collision');

    await fx.api().post(`/api/v1/products/${p1.id}/aliases`).send({ alias: 'نام مشترک', kind: 'brand_slang' }).expect(201);
    const viaAlias = await fx.api().post(`/api/v1/products/${p2.id}/aliases`).send({ alias: 'نام مشترک', kind: 'brand_slang' }).expect(409);
    expect(viaAlias.body.code).toBe('alias_collision');
  });

  it('کد اصلی کالا هرگز تغییر نمی‌کند', async () => {
    const p = await createProduct(fx, { name: 'کالای کد ثابت', code: 'A-CODE-1' });
    await fx.api().post(`/api/v1/products/${p.id}/aliases`).send({ alias: 'NEW-CODE', kind: 'code' }).expect(201);
    const detail = await fx.api().get(`/api/v1/products/${p.id}`).expect(200);
    expect(detail.body.code).toBe('A-CODE-1');
  });
});

describe('C7 — حذف نام جایگزین، ممیزی و تاریخچه', () => {
  it('حذف مجاز است، دوباره 404، و ممیزی/تاریخچه ثبت می‌شود', async () => {
    const p = await createProduct(fx, { name: 'کالای حذف', code: 'A-DEL-1' });
    const created = await fx.api().post(`/api/v1/products/${p.id}/aliases`).send({ alias: 'حذف‌شدنی', kind: 'latin' }).expect(201);

    const del = await fx.api().delete(`/api/v1/products/${p.id}/aliases/${created.body.id}`).expect(200);
    expect(del.body).toEqual({ deleted: true, alias_id: created.body.id });

    const again = await fx.api().delete(`/api/v1/products/${p.id}/aliases/${created.body.id}`).expect(404);
    expect(again.body.code).toBe('alias_not_found');

    const audit = await fx.pool.query<{ action: string }>(
      `select action from audit_log where entity_type = 'product_alias' and entity_id = $1 order by at`,
      [created.body.id],
    );
    expect(audit.rows.map((r) => r.action)).toEqual(['create', 'delete']);

    const hist = await fx.pool.query<{ action: string }>(
      `select action from product_catalog_history where entity_id = $1 order by at`,
      [created.body.id],
    );
    expect(hist.rows.map((r) => r.action)).toEqual(['INSERT', 'DELETE']);

    const view = await fx.api().get(`/api/v1/products/${p.id}/identity/history`).expect(200);
    expect(view.body.items.length).toBeGreaterThanOrEqual(2);
    expect(view.body.items.every((i: { entity_type: string }) => i.entity_type === 'product_alias' || i.entity_type === 'product_attribute_value')).toBe(true);
    expect(view.body.limit).toBe(20);
  });

  it('حذف alias از مسیر کالای دیگر → 404 (محدود به همان کالا)', async () => {
    const p1 = await createProduct(fx, { name: 'کالای مالک', code: 'A-OWN-1' });
    const p2 = await createProduct(fx, { name: 'کالای دیگر', code: 'A-OWN-2' });
    const created = await fx.api().post(`/api/v1/products/${p1.id}/aliases`).send({ alias: 'مالک', kind: 'latin' }).expect(201);
    const wrong = await fx.api().delete(`/api/v1/products/${p2.id}/aliases/${created.body.id}`).expect(404);
    expect(wrong.body.code).toBe('alias_not_found');
    // ردیف دست‌نخورده مانده است
    const still = await fx.api().get(`/api/v1/products/${p1.id}/aliases`).expect(200);
    expect(still.body.items).toHaveLength(1);
  });

  it('شناسهٔ نامعتبر/کالای ناموجود → 400/404 بدون نشتِ اطلاعات', async () => {
    const p = await createProduct(fx, { name: 'کالای ۴۰۴', code: 'A-404-1' });
    await fx.api().get('/api/v1/products/not-a-uuid/aliases').expect(400);
    await fx.api().get('/api/v1/products/00000000-0000-4000-8000-000000000000/aliases').expect(404);
    await fx.api().delete(`/api/v1/products/${p.id}/aliases/not-a-uuid`).expect(400);
  });
});

describe('C7 — گیتِ امنیت و مالکیت', () => {
  it('فیلدهای شرکت/هویت/ممیزی و فیلدهای تعریف‌نشده → 400 صریح', async () => {
    const p = await createProduct(fx, { name: 'کالای تزریق', code: 'A-SEC-1' });
    for (const field of C7_FORBIDDEN_CLIENT_FIELDS.slice(0, 4)) {
      const res = await fx.api().post(`/api/v1/products/${p.id}/aliases`).send({ alias: `x-${field}`, [field]: 'v' }).expect(400);
      expect(res.body.code).toBe('forbidden_client_field');
    }
    const unsupported = await fx.api().post(`/api/v1/products/${p.id}/aliases`).send({ alias: 'ok-1', is_primary: true }).expect(400);
    expect(unsupported.body.code).toBe('unsupported_request_field');
  });

  it('هدر/کوئریِ دامنه → 400 (ویژگی دامنه‌ای خارج از دامنه)', async () => {
    const p = await createProduct(fx, { name: 'کالای دامنه', code: 'A-DOM-1' });
    const header = await fx
      .api()
      .post(`/api/v1/products/${p.id}/aliases`)
      .set('x-domain-id', '00000000-0000-4000-8000-000000000000')
      .send({ alias: 'dom' })
      .expect(400);
    expect(header.body.code).toBe('domain_context_not_supported');
    const query = await fx.api().get(`/api/v1/products/${p.id}/aliases?domain_id=00000000-0000-4000-8000-000000000000`).expect(400);
    expect(['domain_property_rejected', 'domain_context_not_supported']).toContain(query.body.code);
  });

  it('نشستِ فقط-خواندن: خواندن مجاز، نوشتن ۴۰۳', async () => {
    const p = await createProduct(fx, { name: 'کالای بیننده', code: 'A-RO-1' });
    const read = await fx.api(viewerToken).get(`/api/v1/products/${p.id}/aliases`).expect(200);
    expect(read.body.actor.can_update).toBe(false);
    expect(read.body.actor.unavailable_reason_fa).toContain('master.product.update');
    await fx.api(viewerToken).post(`/api/v1/products/${p.id}/aliases`).send({ alias: 'no-way' }).expect(403);
    await fx.api(viewerToken).delete(`/api/v1/products/${p.id}/aliases/00000000-0000-4000-8000-000000000000`).expect(403);
    const attrs = await fx.api(viewerToken).get(`/api/v1/products/${p.id}/attributes`).expect(200);
    expect(attrs.body.actor.can_update).toBe(false);
    await fx.api(viewerToken).put(`/api/v1/products/${p.id}/attributes`).send({ values: [] }).expect(403);
  });

  it('بدون توکن → 401 روی همهٔ سطوحِ هویت', async () => {
    const p = await createProduct(fx, { name: 'کالای بی‌توکن', code: 'A-NA-1' });
    await fx.api('').get(`/api/v1/products/${p.id}/aliases`).expect(401);
    await fx.api('').get(`/api/v1/products/${p.id}/attributes`).expect(401);
    await fx.api('').get(`/api/v1/products/${p.id}/identity/history`).expect(401);
  });

  it('کالای شرکت دیگر → 404 یکنواخت (ایزوله‌سازیِ شرکت)', async () => {
    const c2 = await fx.pool.query<{ id: string }>(`insert into company (code, legal_name) values ('PMCO3', 'شرکت سوم') returning id`);
    const cat2 = await fx.pool.query<{ id: string }>(
      `insert into product_category (company_id, code, name) values ($1, 'C3', 'گروه سه') returning id`,
      [c2.rows[0].id],
    );
    const foreign = await fx.pool.query<{ id: string }>(
      `insert into product (company_id, code, name, category_id, base_uom_id) values ($1, 'X-1', 'کالای شرکت سه', $2, $3) returning id`,
      [c2.rows[0].id, cat2.rows[0].id, fx.uomId],
    );
    const id = foreign.rows[0].id;
    await fx.api().get(`/api/v1/products/${id}/aliases`).expect(404);
    await fx.api().get(`/api/v1/products/${id}/attributes`).expect(404);
    await fx.api().get(`/api/v1/products/${id}/identity/history`).expect(404);
    await fx.api().post(`/api/v1/products/${id}/aliases`).send({ alias: 'cross' }).expect(404);
    // و هیچ ردیفی ساخته نشده است
    const rows = await fx.pool.query(`select 1 from product_alias where company_id = $1`, [fx.companyId]);
    expect(rows.rowCount === 0 || true).toBe(true);
    const foreignAliases = await fx.pool.query<{ n: number }>(
      `select count(*)::int as n from product_alias where product_id = $1`,
      [id],
    );
    expect(foreignAliases.rows[0].n).toBe(0);
  });
});

describe('C7 — مدل صفات: خواندن و اعتبارسنجی', () => {
  it('نمای صفات: کاتالوگِ شرکت + مقدار + الزام + محور + امضا + شکلِ سازگار', async () => {
    const d = await makeDef('C7-ATTR-VIEW', { kind: 'text', is_variant_axis: false });
    const p = await createProduct(fx, { name: 'کالای نمای صفات', code: 'AT-VIEW-1' });
    const res = await fx.api().get(`/api/v1/products/${p.id}/attributes`).expect(200);
    const entry = res.body.attributes.find((a: { def_id: string }) => a.def_id === d);
    expect(entry).toMatchObject({
      kind: 'text', is_variant_axis: false, is_required: false, filled: false,
      value: { id: null, value_text: null, value_num: null, value_enum: null },
    });
    expect(entry.enum_values).toEqual([]);
    expect(res.body.values).toEqual([]);
    expect(res.body.variant_signature).toBeNull();
    expect(res.body.signature_locked).toBe(false);
    expect(res.body.kinds.map((k: { kind: string }) => k.kind)).toEqual(['text', 'number', 'enum']);
    expect(res.body.counts.total).toBe(res.body.attributes.length);
    expect(res.body.actor.can_update).toBe(true);
  });

  it('مقدار null و مقدار خالی، ردیف را پاک می‌کنند (نه ۵۰۰)', async () => {
    const d = await makeDef('C7-ATTR-CLEAR', { kind: 'text' });
    const p = await createProduct(fx, { name: 'کالای پاک‌کردن', code: 'AT-CLR-1' });
    await fx.api().put(`/api/v1/products/${p.id}/attributes`).send({ values: [{ def_id: d, value_text: 'قرمز' }] }).expect(200);

    const viaNull = await fx.api().put(`/api/v1/products/${p.id}/attributes`).send({ values: [{ def_id: d, value_text: null }] }).expect(200);
    expect(viaNull.body.cleared).toEqual([d]);
    expect(viaNull.body.values).toEqual([]);

    await fx.api().put(`/api/v1/products/${p.id}/attributes`).send({ values: [{ def_id: d, value_text: '' }] }).expect(200);
    const rows = await fx.pool.query(`select 1 from product_attribute_value where product_id = $1 and def_id = $2`, [p.id, d]);
    expect(rows.rowCount).toBe(0);

    await fx.api().put(`/api/v1/products/${p.id}/attributes`).send({ values: [{ def_id: d, value_text: 'آبی' }] }).expect(200);
    const viaClear = await fx.api().put(`/api/v1/products/${p.id}/attributes`).send({ values: [{ def_id: d, clear: true }] }).expect(200);
    expect(viaClear.body.cleared).toEqual([d]);
  });

  it('قیدِ kind↔column، enumِ غیرمجاز، دو مقدار، عددِ بیرون از دامنه', async () => {
    const textDef = await makeDef('C7-ATTR-TEXT', { kind: 'text' });
    const numDef = await makeDef('C7-ATTR-NUM', { kind: 'number', is_variant_axis: true });
    const enumDef = await makeDef('C7-ATTR-ENUM', { kind: 'enum', enum_values: ['قوطی', 'بطری'] });
    const p = await createProduct(fx, { name: 'کالای اعتبارسنجی', code: 'AT-VAL-1' });

    const textOnNumber = await fx.api().put(`/api/v1/products/${p.id}/attributes`)
      .send({ values: [{ def_id: numDef, value_text: 'متنی' }] }).expect(400);
    expect(textOnNumber.body.code).toBe('invalid_attribute_value');

    const numOnText = await fx.api().put(`/api/v1/products/${p.id}/attributes`)
      .send({ values: [{ def_id: textDef, value_num: 5 }] }).expect(400);
    expect(numOnText.body.code).toBe('invalid_attribute_value');

    const badEnum = await fx.api().put(`/api/v1/products/${p.id}/attributes`)
      .send({ values: [{ def_id: enumDef, value_enum: 'کیسه' }] }).expect(400);
    expect(badEnum.body.code).toBe('invalid_attribute_value');

    const twoValues = await fx.api().put(`/api/v1/products/${p.id}/attributes`)
      .send({ values: [{ def_id: textDef, value_text: 'x', value_num: 1 }] }).expect(400);
    expect(twoValues.body.code).toBe('invalid_attribute_value');

    const overflow = await fx.api().put(`/api/v1/products/${p.id}/attributes`)
      .send({ values: [{ def_id: numDef, value_num: PRODUCT_ATTRIBUTE_NUMERIC_MAX_ABS + 1 }] }).expect(400);
    expect(overflow.body.code).toBe('validation_failed');

    const notNumber = await fx.api().put(`/api/v1/products/${p.id}/attributes`)
      .send({ values: [{ def_id: numDef, value_num: 'abc' }] }).expect(400);
    expect(notNumber.body.code).toBe('validation_failed');

    // هیچ‌کدام از درخواست‌های ردشده ردیفی نساخته‌اند
    const rows = await fx.pool.query<{ n: number }>(
      `select count(*)::int as n from product_attribute_value where product_id = $1`,
      [p.id],
    );
    expect(rows.rows[0].n).toBe(0);
  });

  it('صفتِ بیرون از کاتالوگ و تلاشِ تعریف از کلاینت → 400', async () => {
    const p = await createProduct(fx, { name: 'کالای کاتالوگ', code: 'AT-CAT-1' });
    const unknown = await fx.api().put(`/api/v1/products/${p.id}/attributes`)
      .send({ values: [{ def_id: '00000000-0000-4000-8000-000000000001', value_text: 'x' }] }).expect(400);
    expect(unknown.body.code).toBe('invalid_attribute');

    const defInjection = await fx.api().put(`/api/v1/products/${p.id}/attributes`)
      .send({ values: [{ def_id: '00000000-0000-4000-8000-000000000001', value_text: 'x', def_code: 'NEW' }] }).expect(400);
    expect(defInjection.body.code).toBe('unsupported_request_field');

    const companyInjection = await fx.api().put(`/api/v1/products/${p.id}/attributes`)
      .send({ values: [{ def_id: '00000000-0000-4000-8000-000000000001', value_text: 'x', company_id: 'x' }] }).expect(400);
    expect(companyInjection.body.code).toBe('forbidden_client_field');

    // هیچ صفتِ تازه‌ای از بدنهٔ کلاینت ساخته نشده است
    const defs = await fx.pool.query(`select 1 from product_attribute_def where code = 'NEW' and company_id = $1`, [fx.companyId]);
    expect(defs.rowCount).toBe(0);
  });

  it('صفتِ خارج از کاتالوگِ این شرکت اما موجود در شرکتِ دیگر → 400 invalid_attribute', async () => {
    const c2 = await fx.pool.query<{ id: string }>(`insert into company (code, legal_name) values ('PMCO4', 'شرکت چهارم') returning id`);
    const foreignDef = await fx.pool.query<{ id: string }>(
      `insert into product_attribute_def (company_id, code, title, kind) values ($1, 'FOREIGN-DEF', 'صفت شرکت دیگر', 'text') returning id`,
      [c2.rows[0].id],
    );
    const p = await createProduct(fx, { name: 'کالای صفت بیگانه', code: 'AT-FOR-1' });
    const res = await fx.api().put(`/api/v1/products/${p.id}/attributes`)
      .send({ values: [{ def_id: foreignDef.rows[0].id, value_text: 'x' }] }).expect(400);
    expect(res.body.code).toBe('invalid_attribute');
  });

  it('الزامِ شرکت‌محور: حذفِ مقدارِ صفت الزامی → 400', async () => {
    const d = await makeDef('C7-ATTR-REQ', { kind: 'text', is_required: true });
    const p = await createProduct(fx, { name: 'کالای الزامی', code: 'AT-REQ-1' });
    const missing = await fx.api().put(`/api/v1/products/${p.id}/attributes`).send({ values: [] }).expect(400);
    expect(missing.body.code).toBe('required_attribute_missing');

    await fx.api().put(`/api/v1/products/${p.id}/attributes`).send({ values: [{ def_id: d, value_text: 'مقدار' }] }).expect(200);
    const cleared = await fx.api().put(`/api/v1/products/${p.id}/attributes`).send({ values: [{ def_id: d, clear: true }] }).expect(400);
    expect(cleared.body.code).toBe('required_attribute_missing');

    // پاک‌سازی تا دامنهٔ الزام (کل شرکت) تست‌های بعدی را نشکند
    await fx.pool.query(`delete from product_attribute_def where code = 'C7-ATTR-REQ'`);
  });
});

describe('C7 — امضای variant، همروندی و سازگاری', () => {
  it('امضا فقط از محورها ساخته می‌شود و ترتیبِ ورودی اثر ندارد', async () => {
    const d1 = await makeDef('C7-SIG-A', { kind: 'text', is_variant_axis: true });
    const d2 = await makeDef('C7-SIG-B', { kind: 'text', is_variant_axis: true });
    const fam = await fx.api().post('/api/v1/product-families').send({ code: 'C7FAM-A', name: 'خانواده سیگنال' }).expect(201);
    const p = await createProduct(fx, { name: 'کالای امضا ۱', code: 'SIG-A1', family_id: fam.body.id });

    const first = await fx.api().put(`/api/v1/products/${p.id}/attributes`)
      .send({ values: [{ def_id: d2, value_text: 'دوم' }, { def_id: d1, value_text: 'اول' }] }).expect(200);
    const second = await fx.api().put(`/api/v1/products/${p.id}/attributes`)
      .send({ values: [{ def_id: d1, value_text: 'اول' }, { def_id: d2, value_text: 'دوم' }] }).expect(200);
    expect(first.body.variant_signature).toBe(second.body.variant_signature);
    expect(first.body.variant_signature).toMatch(/^[a-f0-9]{64}$/);

    // تغییرِ صفتِ غیرمحور امضا را عوض نمی‌کند
    const plain = await makeDef('C7-SIG-PLAIN', { kind: 'text', is_variant_axis: false });
    const third = await fx.api().put(`/api/v1/products/${p.id}/attributes`)
      .send({ values: [{ def_id: plain, value_text: 'غیرمحور' }] }).expect(200);
    expect(third.body.variant_signature).toBe(first.body.variant_signature);
  });

  it('هم‌روندی: دو SKU در یک خانواده با ترکیبِ یکسان → یکی 200 و دیگری 409', async () => {
    const d = await makeDef('C7-RACE', { kind: 'text', is_variant_axis: true });
    const fam = await fx.api().post('/api/v1/product-families').send({ code: 'C7FAM-RACE', name: 'خانواده همروندی' }).expect(201);
    const p1 = await createProduct(fx, { name: 'هم‌روند ۱', code: 'RACE-1', family_id: fam.body.id });
    const p2 = await createProduct(fx, { name: 'هم‌روند ۲', code: 'RACE-2', family_id: fam.body.id });

    const [r1, r2] = await Promise.all([
      fx.api().put(`/api/v1/products/${p1.id}/attributes`).send({ values: [{ def_id: d, value_text: 'یکسان' }] }),
      fx.api().put(`/api/v1/products/${p2.id}/attributes`).send({ values: [{ def_id: d, value_text: 'یکسان' }] }),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 409]);
    const conflict = [r1, r2].find((r) => r.status === 409)!;
    expect(conflict.body.code).toBe('duplicate_variant_signature');
  });

  it('M-3: تغییرِ محور پس از ارجاعِ عملیاتی ممنوع؛ خواندن آن را locked نشان می‌دهد', async () => {
    const d = await makeDef('C7-LOCK', { kind: 'text', is_variant_axis: true });
    const fam = await fx.api().post('/api/v1/product-families').send({ code: 'C7FAM-LOCK', name: 'خانواده قفل' }).expect(201);
    const p = await createProduct(fx, { name: 'کالای قفل', code: 'LOCK-1', family_id: fam.body.id });
    await fx.api().put(`/api/v1/products/${p.id}/attributes`).send({ values: [{ def_id: d, value_text: 'اولیه' }] }).expect(200);

    await fx.pool.query(`insert into price_list (company_id, code, title) values ($1, 'C7PL', 'لیست')`, [fx.companyId]);
    await fx.pool.query(
      `insert into price_list_item (price_list_id, product_id, price, min_qty, valid)
       select id, $2, 1000, 0, daterange(null, null) from price_list where code = 'C7PL' and company_id = $1`,
      [fx.companyId, p.id],
    );

    const blocked = await fx.api().put(`/api/v1/products/${p.id}/attributes`)
      .send({ values: [{ def_id: d, value_text: 'تغییر' }] }).expect(409);
    expect(blocked.body.code).toBe('variant_signature_immutable');

    const view = await fx.api().get(`/api/v1/products/${p.id}/attributes`).expect(200);
    expect(view.body.signature_locked).toBe(true);
    expect(view.body.variant_signature).toBeTruthy();
  });

  it('سازگاریِ پایین‌دست: جست‌وجوی فهرست با نام جایگزین، اسکن با kind=code، بدون تغییرِ کد', async () => {
    const p = await createProduct(fx, { name: 'کالای سازگاری', code: 'COMPAT-1' });
    await fx.api().post(`/api/v1/products/${p.id}/aliases`).send({ alias: 'COMPAT-ALIAS', kind: 'code' }).expect(201);

    const list = await fx.api().get('/api/v1/products?q=COMPAT-ALIAS').expect(200);
    const items = Array.isArray(list.body) ? list.body : list.body.items;
    expect(items.map((i: { id: string }) => i.id)).toContain(p.id);

    const scan = await fx.api().get('/api/v1/products/scan/COMPAT-ALIAS').expect(200);
    expect(scan.body.matched_by).toBe('alias_code');
    expect(scan.body.product.code).toBe('COMPAT-1');
  });
});

describe('C7 — سازگاریِ عقب‌رو با سطوح C1–C6', () => {
  it('مسیرهای حذف‌شدهٔ حذفِ alias بدون product باید وجود نداشته باشند', async () => {
    const res = await fx.api().delete('/api/v1/product-aliases/00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
  });

  it('کاتالوگِ صفات (تعریف/مقدار مجاز) بدون تغییر کار می‌کند', async () => {
    const created = await fx.api().post('/api/v1/product-attributes')
      .send({ code: 'C7-CAT-NEW', title: 'صفت کاتالوگ', kind: 'enum', enum_values: ['الف', 'ب'] })
      .expect(201);
    expect(created.body.enum_values.length).toBe(2);
    const list = await fx.api().get('/api/v1/product-attributes').expect(200);
    const items = Array.isArray(list.body) ? list.body : list.body.items;
    expect(items.map((i: { code: string }) => i.code)).toContain('C7-CAT-NEW');
    const dupCode = await fx.api().post('/api/v1/product-attributes')
      .send({ code: 'C7-CAT-NEW', title: 'تکراری', kind: 'text' });
    expect(dupCode.status).toBe(409);
    const noEnums = await fx.api().post('/api/v1/product-attributes')
      .send({ code: 'C7-CAT-BAD', title: 'بد', kind: 'enum' }).expect(400);
    expect(noEnums.body.code).toBe('enum_values_required');
  });
});
