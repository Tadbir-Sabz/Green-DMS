import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createProduct, setupProductMasterFixture, type Fixture } from './product-master-fixture';
import { STORAGE_SERVICE } from '../src/modules/attachments/tokens';
import type { StorageService } from '../src/modules/attachments/storage.service';

/**
 * TASK-PM-02-C1 — تستِ سرتاسریِ «مرکز تصاویر و اسناد کالا» بر بستر واقعی:
 * دیتابیس موقت + همهٔ مهاجرتها + AppModule واقعی + HTTP (supertest) + RBAC/audit.
 *
 * MinIO/S3 خارجی نیست: همان نمونهٔ `StorageService` که AttachmentsService تزریق
 * میکند با vi.spyOn جایگزین میشود تا بایتها در حافظه نگهداری و URL امضاشده
 * شبیهسازی شود. بنابراین این تست خط لولهٔ واقعی آپلود (magic bytes، sha256،
 * زنجیرهٔ مالکیت، RLS، تراکنش، ممیزی) را بدون وابستگی شبکهای میسنجد.
 * round-trip واقعی MinIO همچنان در attachments.api.test.ts پوشش دارد.
 */

const PNG_BYTES = (() => {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(1, 16);
  b.writeUInt32BE(1, 20);
  b[24] = 8;
  b[25] = 2;
  return b;
})();
const PDF_BYTES = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n', 'utf8');

let fx: Fixture;
let productId = '';
let otherCompanyProductId = '';
let viewerToken = '';
const storedObjects = new Map<string, Buffer>();

const upload = (
  token: string | null,
  product: string,
  opts: {
    bytes?: Buffer;
    filename: string;
    contentType: string;
    fields?: Record<string, string>;
    domainHeader?: string;
  },
): request.Test => {
  let req = fx.api(token ?? undefined).post(`/api/v1/products/${product}/media`);
  req = req.attach('file', opts.bytes ?? PNG_BYTES, {
    filename: opts.filename,
    contentType: opts.contentType,
  });
  for (const [k, v] of Object.entries(opts.fields ?? {})) req = req.field(k, v);
  if (opts.domainHeader) req = req.set('x-domain-id', opts.domainHeader);
  return req;
};

beforeAll(async () => {
  fx = await setupProductMasterFixture('greendms_pm02_c1_media');

  // مجوزهای attachment.* به نقش مدیر کالا داده میشود (هر دو خانواده لازماند).
  await fx.pool.query(
    `insert into role_permission (role_id, permission_code)
     select r.id, p.code from role r
     cross join (values ('attachment.upload'), ('attachment.view')) as p(code)
     where r.code = 'pm_admin_role'
     on conflict do nothing`,
  );

  const storage = fx.app.get<StorageService>(STORAGE_SERVICE);
  vi.spyOn(storage, 'put').mockImplementation(async (key: string, body: Buffer) => {
    storedObjects.set(key, Buffer.from(body));
  });
  vi.spyOn(storage, 'presignedGet').mockImplementation(
    async (key: string) => `https://storage.local/signed?key=${encodeURIComponent(key)}`,
  );
  vi.spyOn(storage, 'remove').mockImplementation(async (key: string) => {
    storedObjects.delete(key);
  });

  const p = await createProduct(fx, { code: 'PM02C1-MEDIA', name: 'کالای تصویرهدار' });
  productId = p.id;

  // کالایی متعلق به شرکت دیگر — نباید از نشست شرکت A دیده/آپلود شود.
  const otherCompany = await fx.pool.query<{ id: string }>(
    `insert into company (code, legal_name) values ('PM02C1-OTHER', 'شرکت دیگر C1') returning id`,
  );
  const otherProduct = await fx.pool.query<{ id: string }>(
    `insert into product (company_id, code, name, category_id, base_uom_id)
     values ($1, 'PM02C1-OTHER-P', 'کالای شرکت دیگر', $2, $3) returning id`,
    [otherCompany.rows[0].id, fx.categoryId, fx.uomId],
  );
  otherCompanyProductId = otherProduct.rows[0].id;

  // کاربری بدون هیچ مجوزی برای آزمون ۴۰۳
  const hashRow = await fx.pool.query<{ hash: string }>(
    `select password_hash as hash from app_user where username = 'pm_admin'`,
  );
  const person = await fx.pool.query<{ id: string }>(
    `insert into person (company_id, code, first_name, last_name)
     values ($1, 'PM02C1-NOPE', 'کاربر', 'بدون مجوز') returning id`,
    [fx.companyId],
  );
  await fx.pool.query(
    `insert into app_user (person_id, username, password_hash, access_level)
     values ($1, 'pm02c1_viewer', $2, 'web')`,
    [person.rows[0].id, hashRow.rows[0].hash],
  );
  viewerToken = await fx.loginAs('pm02c1_viewer', fx.adminPassword);
}, 180_000);

afterAll(async () => {
  vi.restoreAllMocks();
  await fx?.teardown();
});

describe('TASK-PM-02-C1 product media over real HTTP + native PostgreSQL', () => {
  it('GET on a product with no media returns an explicit empty central view', async () => {
    const res = await fx.api().get(`/api/v1/products/${productId}/media`).expect(200);
    expect(res.body).toMatchObject({
      product_id: productId,
      product_code: 'PM02C1-MEDIA',
      product_name: 'کالای تصویرهدار',
      items: [],
      primary_image: null,
      counts: { images: 0, documents: 0, total: 0 },
      primary_image_rule: 'first_image_by_created_at',
      primary_image_label_fa: 'اصلی (خودکار)',
    });
    expect(res.body.primary_image_note_fa).toContain('خودکار');
    expect(res.body.message_fa).toContain('دامنه');
    expect(res.body).not.toHaveProperty('domain_id');
    expect(res.body).not.toHaveProperty('available');
  });

  it('POST an image creates attachment + audit + primary label, with owner derived from the path', async () => {
    const res = await upload(null, productId, { filename: 'نمای-اصلی.png', contentType: 'image/png' }).expect(201);
    expect(res.body).toMatchObject({
      owner_type: 'product',
      owner_id: productId,
      file_name: 'نمای-اصلی.png',
      content_type: 'image/png',
      size_bytes: PNG_BYTES.length,
      kind: 'image',
      kind_label_fa: 'تصویر',
      is_primary: true,
      primary_label_fa: 'اصلی (خودکار)',
    });
    expect(res.body.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.url).toContain('storage.local');
    expect(storedObjects.size).toBe(1);

    const audit = await fx.pool.query<{ action: string; entity_type: string; entity_id: string }>(
      `select action, entity_type, entity_id from audit_log where entity_type = 'product_media'`,
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]).toMatchObject({
      action: 'create',
      entity_type: 'product_media',
      entity_id: productId,
    });
  });

  it('GET lists oldest-first; a later image and a PDF never steal the automatic primary', async () => {
    const second = await upload(null, productId, { filename: 'نمای-دوم.png', contentType: 'image/png' }).expect(201);
    expect(second.body.is_primary).toBe(false);
    expect(second.body.primary_label_fa).toBeNull();

    const pdf = await upload(null, productId, {
      bytes: PDF_BYTES,
      filename: 'کاتالوگ.pdf',
      contentType: 'application/pdf',
    }).expect(201);
    expect(pdf.body.kind).toBe('document');
    expect(pdf.body.kind_label_fa).toBe('سند');
    expect(pdf.body.is_primary).toBe(false);

    const list = await fx.api().get(`/api/v1/products/${productId}/media`).expect(200);
    expect(list.body.counts).toEqual({ images: 2, documents: 1, total: 3 });
    expect(list.body.items).toHaveLength(3);
    expect(list.body.items.map((i: { file_name: string }) => i.file_name)).toEqual([
      'نمای-اصلی.png',
      'نمای-دوم.png',
      'کاتالوگ.pdf',
    ]);
    expect(list.body.items.filter((i: { is_primary: boolean }) => i.is_primary)).toHaveLength(1);
    expect(list.body.primary_image.file_name).toBe('نمای-اصلی.png');
    expect(list.body.items.every((i: { owner_id: string }) => i.owner_id === productId)).toBe(true);
  });

  it('GET media URL is scoped to the exact product (404 for another product)', async () => {
    const list = await fx.api().get(`/api/v1/products/${productId}/media`).expect(200);
    const mediaId = String(list.body.primary_image.id);
    const res = await fx.api().get(`/api/v1/products/${productId}/media/${mediaId}/url`).expect(200);
    expect(res.body.url).toContain('storage.local');
    expect(res.body.expires_in).toBeGreaterThan(0);

    await fx.api()
      .get(`/api/v1/products/${otherCompanyProductId}/media/${mediaId}/url`)
      .expect(404)
      .expect((r) => expect(r.body.code).toBe('product_not_found'));

    const foreign = await fx.pool.query<{ id: string }>(
      `insert into attachment (company_id, owner_type, owner_id, file_name, content_type,
        size_bytes, storage_key, sha256)
       values ($1, 'product', $2, 'دیگری.png', 'image/png', 33, $3, $4) returning id`,
      [fx.companyId, otherCompanyProductId, `other/${randomUUID()}`, 'b'.repeat(64)],
    );
    await fx.api()
      .get(`/api/v1/products/${productId}/media/${foreign.rows[0].id}/url`)
      .expect(404)
      .expect((r) => expect(r.body.code).toBe('media_not_found'));
  });

  it('rejects client-supplied owner/tenant fields instead of silently stripping them', async () => {
    const res = await upload(null, productId, {
      filename: 'تزریق.png',
      contentType: 'image/png',
      fields: { owner_id: otherCompanyProductId, company_id: randomUUID() },
    }).expect(400);
    expect(res.body.code).toBe('product_media_owner_scope_rejected');
    expect(res.body.details.fields).toEqual(['company_id', 'owner_id']);
    expect(storedObjects.size).toBe(3); // هیچ شیء تازهای ذخیره نشد
  });

  it('preserves B2 fail-closed read/write parity on the new product surfaces', async () => {
    const header = await upload(null, productId, {
      filename: 'هدر.png',
      contentType: 'image/png',
      domainHeader: randomUUID(),
    }).expect(400);
    expect(header.body.code).toBe('domain_context_not_supported');

    const query = await fx.api().get(`/api/v1/products/${productId}/media?available=true`).expect(400);
    expect(query.body.code).toBe('domain_property_rejected');
    expect(storedObjects.size).toBe(3);
  });

  it('rejects cross-tenant products, missing products, unsupported bytes and unauthenticated calls', async () => {
    await fx.api().get(`/api/v1/products/${otherCompanyProductId}/media`).expect(404)
      .expect((r) => expect(r.body.code).toBe('product_not_found'));
    await fx.api().get(`/api/v1/products/${randomUUID()}/media`).expect(404)
      .expect((r) => expect(r.body.code).toBe('product_not_found'));

    const wrongType = await upload(null, productId, {
      filename: 'فایل.txt',
      contentType: 'text/plain',
    }).expect(415);
    // allowlist سرور پیش از راستیآزمایی امضا اعمال میشود؛ نوع اعلامی خارج از
    // image/jpeg|png|webp|application/pdf همان ۴۱۵ مستند `POST /attachments` است.
    expect(wrongType.body.code).toBe('unsupported_media_type');

    const forged = await upload(null, productId, {
      bytes: Buffer.from('<html><script>alert(1)</script></html>'),
      filename: 'جعلی.png',
      contentType: 'image/png',
    }).expect(415);
    expect(forged.body.code).toBe('content_type_mismatch');

    await request(fx.app.getHttpServer()).get(`/api/v1/products/${productId}/media`).expect(401);
  });

  it('requires both product and attachment permissions (403 for a role-less user)', async () => {
    await fx.api(viewerToken).get(`/api/v1/products/${productId}/media`).expect(403)
      .expect((r) => expect(r.body.code).toBe('forbidden'));
    await upload(viewerToken, productId, { filename: 'بیاجازه.png', contentType: 'image/png' }).expect(403);
    expect(storedObjects.size).toBe(3);
  });
});
