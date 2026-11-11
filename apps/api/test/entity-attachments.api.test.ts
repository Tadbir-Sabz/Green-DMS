import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import request from 'supertest';
import { createProduct, setupProductMasterFixture, type Fixture } from './product-master-fixture';
import { AUDIT_SERVICE, type AuditService } from '../src/common/audit.service';
import { STORAGE_SERVICE } from '../src/modules/attachments/tokens';
import type { StorageService } from '../src/modules/attachments/storage.service';
import { ENTITY_ATTACHMENT_OWNER_TYPES } from '../src/modules/attachments/entity-attachments.rules';

/**
 * TASK-PM-02-C3 — تست سرتاسری ضمائم سازمانی بر بستر واقعی:
 * دیتابیس موقت + همهٔ مهاجرتها + AppModule واقعی + HTTP (supertest) + RBAC/RLS
 * + ممیزی تراکنشی. MinIO خارجی نیست: همان نمونهٔ `StorageService` با vi.spyOn
 * جایگزین میشود تا بایتها در حافظه نگهداری و URL امضاشده شبیهسازی شود؛ خط
 * لولهٔ واقعی آپلود (magic bytes، sha256، زنجیرهٔ مالکیت، RLS، تراکنش، ممیزی)
 * همچنان اجرا میشود. round-trip واقعی MinIO جداگانه UNVERIFIED است.
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

/** پنج موجودیت دارای UI واقعی (دوتای دیگر فقط بکند آمادهاند). */
const IMPLEMENTED_UI = [
  'invoice',
  'sales_order',
  'return_request',
  'stock_count',
  'journal_entry',
] as const;
const owners: Record<string, string> = {};
let fx: Fixture;
let viewerToken = '';
let foreignInvoiceId = '';
let productId = '';
let putSpy: ReturnType<typeof vi.spyOn>;
const storedObjects = new Map<string, Buffer>();

const base = (ownerType: string, ownerId: string) =>
  `/api/v1/entity-attachments/${ownerType}/${ownerId}`;

const upload = (
  token: string | null,
  ownerType: string,
  ownerId: string,
  opts: {
    bytes?: Buffer;
    filename: string;
    contentType: string;
    fields?: Record<string, string>;
    domainHeader?: string;
    query?: string;
  },
): request.Test => {
  let req = fx.api(token ?? undefined).post(`${base(ownerType, ownerId)}${opts.query ?? ''}`);
  req = req.attach('file', opts.bytes ?? PNG_BYTES, {
    filename: opts.filename,
    contentType: opts.contentType,
  });
  for (const [k, v] of Object.entries(opts.fields ?? {})) req = req.field(k, v);
  if (opts.domainHeader) req = req.set('x-domain-id', opts.domainHeader);
  return req;
};

beforeAll(async () => {
  fx = await setupProductMasterFixture('greendms_pm02_c3_entity');

  // مجوزهای موجود attachment.* (مهاجرت ۰۰۳۵) به نقش تست داده میشود؛ هیچ مجوز
  // تازهای ساخته نمیشود.
  await fx.pool.query(
    `insert into role_permission (role_id, permission_code)
     select r.id, p.code from role r
     cross join (values ('attachment.upload'), ('attachment.view')) as p(code)
     where r.code = 'pm_admin_role'
     on conflict do nothing`,
  );

  const storage = fx.app.get<StorageService>(STORAGE_SERVICE);
  putSpy = vi.spyOn(storage, 'put').mockImplementation(async (key: string, body: Buffer) => {
    storedObjects.set(key, Buffer.from(body));
  });
  vi.spyOn(storage, 'presignedGet').mockImplementation(
    async (key: string) => `https://storage.local/signed?key=${encodeURIComponent(key)}`,
  );
  vi.spyOn(storage, 'remove').mockImplementation(async (key: string) => {
    storedObjects.delete(key);
  });

  const q = async <T extends { id: string }>(sql: string, params: unknown[] = []): Promise<string> => {
    const r = await fx.pool.query<T>(sql, params);
    return r.rows[0].id;
  };
  const companyId = fx.companyId;

  const branchId = await q<{ id: string }>(
    `insert into branch (company_id, code, name) values ($1, 'C3-BR', 'شعبه ضمائم') returning id`,
    [companyId],
  );
  const personId = await q<{ id: string }>(
    `insert into person (company_id, code, first_name, last_name)
     values ($1, 'C3-CUS', 'مشتری', 'ضمائم') returning id`,
    [companyId],
  );
  const customerId = await q<{ id: string }>(
    `insert into customer (person_id, branch_id, code) values ($1, $2, 'C3-CUS') returning id`,
    [personId, branchId],
  );
  const seriesId = await q<{ id: string }>(
    `insert into document_series (branch_id, doc_kind, fiscal_year)
     values ($1, 'invoice', 1405) returning id`,
    [branchId],
  );
  const warehouseId = await q<{ id: string }>(
    `insert into warehouse (branch_id, code, name) values ($1, 'C3-WH', 'انبار ضمائم') returning id`,
    [branchId],
  );
  const periodId = await q<{ id: string }>(
    `insert into fiscal_period (company_id, fiscal_year, period_no, start_date, end_date, status)
     values ($1, 1405, 1, '2026-01-01', '2026-12-31', 'open') returning id`,
    [companyId],
  );

  owners.sales_order = await q<{ id: string }>(
    `insert into sales_order (branch_id, doc_number, fiscal_year, customer_id)
     values ($1, 'C3-SO-1', 1405, $2) returning id`,
    [branchId, customerId],
  );
  owners.invoice = await q<{ id: string }>(
    `insert into invoice (branch_id, doc_number, fiscal_year, series_id, customer_id)
     values ($1, 'C3-INV-1', 1405, $2, $3) returning id`,
    [branchId, seriesId, customerId],
  );
  owners.return_request = await q<{ id: string }>(
    `insert into return_request (branch_id, doc_number, customer_id, reason_code)
     values ($1, 'C3-RET-1', $2, 'damaged') returning id`,
    [branchId, customerId],
  );
  owners.stock_count = await q<{ id: string }>(
    `insert into stock_count (branch_id, warehouse_id, doc_number)
     values ($1, $2, 'C3-SC-1') returning id`,
    [branchId, warehouseId],
  );
  owners.journal_entry = await q<{ id: string }>(
    `insert into journal_entry (company_id, doc_number, fiscal_period_id, entry_date, description, source_type)
     values ($1, 'C3-JE-1', $2, '2026-06-01', 'سند ضمائم', 'manual') returning id`,
    [companyId, periodId],
  );

  // شرکت دیگر + فاکتور آن — برای آزمون رد دسترسی بیناجارهای
  const otherCompany = await q<{ id: string }>(
    `insert into company (code, legal_name) values ('PM02C3-OTHER', 'شرکت دیگر C3') returning id`,
  );
  const otherBranch = await q<{ id: string }>(
    `insert into branch (company_id, code, name) values ($1, 'C3-OBR', 'شعبه دیگر') returning id`,
    [otherCompany],
  );
  const otherPerson = await q<{ id: string }>(
    `insert into person (company_id, code, first_name, last_name)
     values ($1, 'C3-OCUS', 'مشتری', 'دیگر') returning id`,
    [otherCompany],
  );
  const otherCustomer = await q<{ id: string }>(
    `insert into customer (person_id, branch_id, code) values ($1, $2, 'C3-OCUS') returning id`,
    [otherPerson, otherBranch],
  );
  const otherSeries = await q<{ id: string }>(
    `insert into document_series (branch_id, doc_kind, fiscal_year)
     values ($1, 'invoice', 1405) returning id`,
    [otherBranch],
  );
  foreignInvoiceId = await q<{ id: string }>(
    `insert into invoice (branch_id, doc_number, fiscal_year, series_id, customer_id)
     values ($1, 'C3-INV-OTHER', 1405, $2, $3) returning id`,
    [otherBranch, otherSeries, otherCustomer],
  );

  // کاربر بدون مجوز (۴۰۳)
  const hashRow = await fx.pool.query<{ hash: string }>(
    `select password_hash as hash from app_user where username = 'pm_admin'`,
  );
  const p = await q<{ id: string }>(
    `insert into person (company_id, code, first_name, last_name)
     values ($1, 'C3-NOPE', 'کاربر', 'بدون مجوز') returning id`,
    [companyId],
  );
  await fx.pool.query(
    `insert into app_user (person_id, username, password_hash, access_level)
     values ($1, 'pm02c3_viewer', $2, 'web')`,
    [p, hashRow.rows[0].hash],
  );
  viewerToken = await fx.loginAs('pm02c3_viewer', fx.adminPassword);

  const product = await createProduct(fx, { code: 'PM02C3-PROD', name: 'کالای رگرسیون C1' });
  productId = product.id;
}, 180_000);

afterAll(async () => {
  vi.restoreAllMocks();
  await fx?.teardown();
});

describe('TASK-PM-02-C3 enterprise entity attachments over real HTTP + PostgreSQL', () => {
  it('every implemented entity exposes the same empty shared view', async () => {
    for (const type of IMPLEMENTED_UI) {
      expect(ENTITY_ATTACHMENT_OWNER_TYPES as readonly string[]).toContain(type);
      const res = await fx.api().get(base(type, owners[type])).expect(200);
      expect(res.body.owner_type).toBe(type);
      expect(res.body.owner_id).toBe(owners[type]);
      expect(res.body.owner_label_fa).toBeTruthy();
      expect(res.body.module_path).toMatch(/^\//);
      expect(res.body.items).toEqual([]);
      expect(res.body.counts).toEqual({ images: 0, documents: 0, total: 0 });
      expect(res.body).not.toHaveProperty('domain_id');
      expect(res.body).not.toHaveProperty('available');
    }
  });

  it('all seven approved owner types are accepted; product/other/invented types are rejected', async () => {
    // `receipt` و `pod` زنجیرهٔ مالکیت مصوب دارند (UI ندارند) ⇒ ۴۰۴ مالک ناموجود،
    // نه ۴۰۰ «نوع پشتیبانی نشده».
    for (const type of ['receipt', 'pod']) {
      const res = await fx.api().get(base(type, randomUUID())).expect(404);
      expect(res.body.code).toBe('owner_not_found');
    }
    for (const type of ['product', 'other', 'brand', 'product_category', 'warehouse', 'uom']) {
      const res = await fx.api().get(base(type, owners.invoice)).expect(400);
      expect(res.body.code).toBe('unsupported_owner_type');
    }
    const badId = await fx.api().get(base('invoice', 'not-a-uuid')).expect(400);
    expect(badId.body.code).toBe('invalid_owner_id');
  });

  it('uploads an image, a PDF and three more entity types with path-derived ownership + audit', async () => {
    const before = storedObjects.size;
    const cases: [string, string, Buffer, string, string, string][] = [
      ['invoice', 'فاکتور.png', PNG_BYTES, 'image/png', 'image', 'تصویر'],
      ['sales_order', 'کاتالوگ.pdf', PDF_BYTES, 'application/pdf', 'document', 'سند'],
      ['return_request', 'خرابی.png', PNG_BYTES, 'image/png', 'image', 'تصویر'],
      ['stock_count', 'برگه-شمارش.pdf', PDF_BYTES, 'application/pdf', 'document', 'سند'],
      ['journal_entry', 'پیوست-سند.png', PNG_BYTES, 'image/png', 'image', 'تصویر'],
    ];
    for (const [type, filename, bytes, contentType, kind, kindLabel] of cases) {
      const res = await upload(null, type, owners[type], { bytes, filename, contentType }).expect(201);
      expect(res.body).toMatchObject({
        owner_type: type,
        owner_id: owners[type],
        file_name: filename,
        content_type: contentType,
        size_bytes: bytes.length,
        kind,
        kind_label_fa: kindLabel,
      });
      expect(res.body.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(res.body.url).toContain('storage.local');
      expect(res.body).not.toHaveProperty('is_primary');
    }
    expect(storedObjects.size).toBe(before + 5);

    const audit = await fx.pool.query<{ action: string; entity_type: string; entity_id: string; after_data: unknown }>(
      `select action, entity_type, entity_id, after_data from audit_log
        where entity_type = 'entity_attachment' order by at, id`,
    );
    expect(audit.rows).toHaveLength(5);
    for (const r of audit.rows) {
      expect(r.action).toBe('create');
      const after = JSON.stringify(r.after_data ?? {});
      expect(after).not.toContain('storage.local'); // URL امضاشده هرگز در ممیزی نیست
      expect(after).not.toContain('storage_key');   // و نه کلید دسترسی
      expect(after).not.toContain('"url"');
    }
    expect(new Set(audit.rows.map((r) => r.entity_id)).size).toBe(5);
  });

  it('lists with counts and scoped fresh signed URLs; rejects a foreign owner id', async () => {
    const list = await fx.api().get(base('invoice', owners.invoice)).expect(200);
    expect(list.body.counts).toEqual({ images: 1, documents: 0, total: 1 });
    expect(list.body.items).toHaveLength(1);
    const mediaId = String(list.body.items[0].id);

    const url = await fx.api().get(`${base('invoice', owners.invoice)}/${mediaId}/url`).expect(200);
    expect(url.body.url).toContain('storage.local');
    expect(url.body.expires_in).toBeGreaterThan(0);

    // همان ضمیمه برای مالک دیگر ⇒ ۴۰۴ (نه ۴۰۳ و نه افشای وجود)
    const wrongOwner = await fx.api()
      .get(`${base('sales_order', owners.sales_order)}/${mediaId}/url`)
      .expect(404);
    expect(wrongOwner.body.code).toBe('entity_attachment_not_found');
    await fx.api()
      .get(`${base('invoice', owners.invoice)}/${randomUUID()}/url`)
      .expect(404)
      .expect((r) => expect(r.body.code).toBe('entity_attachment_not_found'));
  });

  it('rejects cross-tenant owners, injected owner fields and unsupported fields', async () => {
    const before = storedObjects.size;
    const cross = await fx.api().get(base('invoice', foreignInvoiceId));
    expect([403, 404]).toContain(cross.status);
    expect(['owner_scope_denied', 'owner_not_found']).toContain(cross.body.code);

    const injected = await upload(null, 'invoice', owners.invoice, {
      filename: 'تزریق.png',
      contentType: 'image/png',
      fields: { owner_id: foreignInvoiceId, company_id: randomUUID() },
    }).expect(400);
    expect(injected.body.code).toBe('entity_attachment_owner_scope_rejected');
    expect(injected.body.details.fields).toEqual(['company_id', 'owner_id']);

    const extra = await upload(null, 'invoice', owners.invoice, {
      filename: 'فیلداضافی.png',
      contentType: 'image/png',
      fields: { note: 'x' },
    }).expect(400);
    expect(extra.body.code).toBe('unsupported_request_field');

    const queryOwner = await fx.api()
      .get(`${base('invoice', owners.invoice)}?owner_id=${foreignInvoiceId}`)
      .expect(400);
    expect(queryOwner.body.code).toBe('entity_attachment_owner_scope_rejected');

    const queryExtra = await fx.api()
      .get(`${base('invoice', owners.invoice)}?foo=1`)
      .expect(400);
    expect(queryExtra.body.code).toBe('unsupported_request_field');

    expect(storedObjects.size).toBe(before); // هیچ شیء تازهای ذخیره نشد
  });

  it('preserves B2 fail-closed parity on all three new surfaces', async () => {
    const header = await upload(null, 'invoice', owners.invoice, {
      filename: 'هدر.png',
      contentType: 'image/png',
      domainHeader: randomUUID(),
    }).expect(400);
    expect(header.body.code).toBe('domain_context_not_supported');

    const query = await fx.api().get(`${base('invoice', owners.invoice)}?available=true`).expect(400);
    expect(query.body.code).toBe('domain_property_rejected');

    const urlQuery = await fx.api()
      .get(`${base('invoice', owners.invoice)}/${randomUUID()}/url?domain_status=active`)
      .expect(400);
    expect(urlQuery.body.code).toBe('domain_property_rejected');
  });

  it('rejects invalid content, unauthenticated calls and permission-less users', async () => {
    const before = storedObjects.size;
    const wrongType = await upload(null, 'invoice', owners.invoice, {
      filename: 'فایل.txt',
      contentType: 'text/plain',
    }).expect(415);
    expect(wrongType.body.code).toBe('unsupported_media_type');

    const forged = await upload(null, 'invoice', owners.invoice, {
      bytes: Buffer.from('<html><script>alert(1)</script></html>'),
      filename: 'جعلی.png',
      contentType: 'image/png',
    }).expect(415);
    expect(forged.body.code).toBe('content_type_mismatch');

    const empty = await upload(null, 'invoice', owners.invoice, {
      bytes: Buffer.alloc(0),
      filename: 'خالی.png',
      contentType: 'image/png',
    }).expect(400);
    expect(empty.body.code).toBe('empty_file');

    await request(fx.app.getHttpServer()).get(base('invoice', owners.invoice)).expect(401);
    await fx.api(viewerToken).get(base('invoice', owners.invoice)).expect(403);
    await upload(viewerToken, 'invoice', owners.invoice, {
      filename: 'بیاجازه.png',
      contentType: 'image/png',
    }).expect(403);
    expect(storedObjects.size).toBe(before);
  });

  it('rolls back and removes the orphan object when transactional audit fails', async () => {
    const before = storedObjects.size;
    const audit = fx.app.get<AuditService>(AUDIT_SERVICE);
    const spy = vi.spyOn(audit, 'recordRequired').mockRejectedValueOnce(
      new Error('audit partition missing (simulated)'),
    );
    try {
      await upload(null, 'invoice', owners.invoice, {
        filename: 'ممیزی-شکست.png',
        contentType: 'image/png',
      }).expect(500);
    } finally {
      spy.mockRestore();
    }
    expect(storedObjects.size).toBe(before); // شیء آپلودشده پاک شد
    const rows = await fx.pool.query<{ c: string }>(
      `select count(*)::text as c from attachment where owner_type = 'invoice' and file_name = 'ممیزی-شکست.png'`,
    );
    expect(rows.rows[0].c).toBe('0'); // ردیف DB هم rollback شد
  });

  it('reports storage failures accurately without creating records or objects', async () => {
    const before = storedObjects.size;
    // یکبارهای (once) روی همان spy پیشفرض ⇒ پیادهسازی حافظهای بعد از آن پابرجاست.
    putSpy.mockRejectedValueOnce(
      new ServiceUnavailableException({
        code: 'storage_unavailable',
        message_fa: 'آبجکتاستوریج در دسترس نیست.',
      }),
    );
    const res = await upload(null, 'invoice', owners.invoice, {
      filename: 'استوریج-شکست.png',
      contentType: 'image/png',
    }).expect(503);
    expect(res.body.code).toBe('storage_unavailable');
    expect(storedObjects.size).toBe(before);
    const rows = await fx.pool.query<{ c: string }>(
      `select count(*)::text as c from attachment where file_name = 'استوریج-شکست.png'`,
    );
    expect(rows.rows[0].c).toBe('0');
  });

  it('keeps existing /attachments API and C1 product media unchanged (regression)', async () => {
    // الف) API عمومی تاریخی ضمائم — همان قرارداد، همان زنجیرهٔ مالکیت
    const generic = await fx.api()
      .post('/api/v1/attachments')
      .field('owner_type', 'invoice')
      .field('owner_id', owners.invoice)
      .attach('file', PNG_BYTES, { filename: 'عمومی.png', contentType: 'image/png' })
      .expect(201);
    expect(generic.body.owner_type).toBe('invoice');
    expect(generic.body.owner_id).toBe(owners.invoice);
    const genericList = await fx.api()
      .get(`/api/v1/attachments?owner_type=invoice&owner_id=${owners.invoice}`)
      .expect(200);
    expect(genericList.body.items.length).toBeGreaterThanOrEqual(2);

    // ب) نمای محصولمحور C1 — همان قاعدهٔ تصویر اصلی خودکار
    const empty = await fx.api().get(`/api/v1/products/${productId}/media`).expect(200);
    expect(empty.body.primary_image_rule).toBe('first_image_by_created_at');
    expect(empty.body.counts.total).toBe(0);
    const media = await fx.api()
      .post(`/api/v1/products/${productId}/media`)
      .attach('file', PNG_BYTES, { filename: 'کالا.png', contentType: 'image/png' })
      .expect(201);
    expect(media.body.owner_type).toBe('product');
    expect(media.body.is_primary).toBe(true);
    expect(media.body.primary_label_fa).toBe('اصلی (خودکار)');
  });
});
