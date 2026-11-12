import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { setupProductMasterFixture, type Fixture } from './product-master-fixture';
import { STORAGE_SERVICE } from '../src/modules/attachments/tokens';
import type { StorageService } from '../src/modules/attachments/storage.service';
import {
  buildRawZipForTest,
  readZipForTest,
  inspectTransferPackage,
} from '../src/modules/attachments/attachment-transfer.package';
import {
  TRANSFER_OWNER_TYPES,
  canonicalJson,
} from '../src/modules/attachments/attachment-transfer.rules';

/**
 * TASK-PM-02-C4 — تست سرتاسری مرکز انتقال ضمائم بر بستر واقعی:
 * دیتابیس موقت + همهٔ مهاجرتها + AppModule واقعی + HTTP (supertest) + RBAC/RLS
 * + تراکنش/ممیزی + بستهٔ ZIP باینری. `StorageService` فقط ازنظر بایتها در حافظه
 * شبیهسازی میشود؛ MinIO/S3 تولیدی و مرورگر واقعی جداگانه UNVERIFIEDاند.
 *
 * اجرای ورود عمداً fail-closed است: هیچ رکورد attachment درج/حذف/بازنویسی نمیشود.
 */

const PNG_BYTES = (() => {
  const b = Buffer.alloc(40);
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

const BASE = '/api/v1/attachment-transfer';
const storedObjects = new Map<string, Buffer>();
let fx: Fixture;
let viewerToken = '';
let invoiceId = '';
let secondInvoiceId = '';
let salesOrderId = '';
let foreignInvoiceId = '';
let exportedZip = Buffer.alloc(0);
let exportedOperationId = '';
let exportedPackageSha = '';
let importOperationId = '';
let manifestPath = '';
let initialMappingSha = '';

const binaryParser = (res: request.Response, cb: (err: Error | null, body?: Buffer) => void): void => {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

const uploadAttachment = (
  ownerType: string,
  ownerId: string,
  bytes: Buffer,
  filename: string,
  contentType: string,
): request.Test =>
  fx.api()
    .post(`/api/v1/entity-attachments/${ownerType}/${ownerId}`)
    .attach('file', bytes, { filename, contentType });

const importZip = (zip: Buffer, filename = 'attachments.zip'): request.Test =>
  fx.api()
    .post(`${BASE}/imports/preview`)
    .attach('file', zip, { filename, contentType: 'application/zip' });

beforeAll(async () => {
  fx = await setupProductMasterFixture('greendms_pm02_c4_transfer');

  // فقط مجوزهای ازپیشموجود ۰۰۳۵؛ هیچ مجوز/نقش/grant تازهای ساخته نمیشود.
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
  vi.spyOn(storage, 'get').mockImplementation(async (key: string, maxBytes: number) => {
    if (!Number.isInteger(maxBytes) || maxBytes <= 0) throw new Error('invalid_storage_read_limit');
    const body = storedObjects.get(key);
    if (!body) throw new Error('object_missing');
    if (body.length > maxBytes) throw new Error('attachment_too_large');
    return Buffer.from(body);
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
    `insert into branch (company_id, code, name) values ($1, 'C4-BR', 'شعبه انتقال') returning id`,
    [companyId],
  );
  const personId = await q<{ id: string }>(
    `insert into person (company_id, code, first_name, last_name)
     values ($1, 'C4-CUS', 'مشتری', 'انتقال') returning id`,
    [companyId],
  );
  const customerId = await q<{ id: string }>(
    `insert into customer (person_id, branch_id, code) values ($1, $2, 'C4-CUS') returning id`,
    [personId, branchId],
  );
  const seriesId = await q<{ id: string }>(
    `insert into document_series (branch_id, doc_kind, fiscal_year)
     values ($1, 'invoice', 1405) returning id`,
    [branchId],
  );
  invoiceId = await q<{ id: string }>(
    `insert into invoice (branch_id, doc_number, fiscal_year, series_id, customer_id)
     values ($1, 'C4-INV-1', 1405, $2, $3) returning id`,
    [branchId, seriesId, customerId],
  );
  secondInvoiceId = await q<{ id: string }>(
    `insert into invoice (branch_id, doc_number, fiscal_year, series_id, customer_id)
     values ($1, 'C4-INV-2', 1405, $2, $3) returning id`,
    [branchId, seriesId, customerId],
  );
  salesOrderId = await q<{ id: string }>(
    `insert into sales_order (branch_id, doc_number, fiscal_year, customer_id)
     values ($1, 'C4-SO-1', 1405, $2) returning id`,
    [branchId, customerId],
  );

  const otherCompany = await q<{ id: string }>(
    `insert into company (code, legal_name) values ('PM02C4-OTHER', 'شرکت دیگر C4') returning id`,
  );
  const otherBranch = await q<{ id: string }>(
    `insert into branch (company_id, code, name) values ($1, 'C4-OBR', 'شعبه دیگر') returning id`,
    [otherCompany],
  );
  const otherPerson = await q<{ id: string }>(
    `insert into person (company_id, code, first_name, last_name)
     values ($1, 'C4-OCUS', 'مشتری', 'دیگر') returning id`,
    [otherCompany],
  );
  const otherCustomer = await q<{ id: string }>(
    `insert into customer (person_id, branch_id, code) values ($1, $2, 'C4-OCUS') returning id`,
    [otherPerson, otherBranch],
  );
  const otherSeries = await q<{ id: string }>(
    `insert into document_series (branch_id, doc_kind, fiscal_year)
     values ($1, 'invoice', 1405) returning id`,
    [otherBranch],
  );
  foreignInvoiceId = await q<{ id: string }>(
    `insert into invoice (branch_id, doc_number, fiscal_year, series_id, customer_id)
     values ($1, 'C4-INV-OTHER', 1405, $2, $3) returning id`,
    [otherBranch, otherSeries, otherCustomer],
  );

  // کاربر بدون مجوز: انتقال ضمائم برای او ۴۰۳ است.
  const hashRow = await fx.pool.query<{ hash: string }>(
    `select password_hash as hash from app_user where username = 'pm_admin'`,
  );
  const viewerPerson = await q<{ id: string }>(
    `insert into person (company_id, code, first_name, last_name)
     values ($1, 'C4-NOPE', 'کاربر', 'بدون مجوز') returning id`,
    [companyId],
  );
  await fx.pool.query(
    `insert into app_user (person_id, username, password_hash, access_level)
     values ($1, 'pm02c4_viewer', $2, 'web')`,
    [viewerPerson, hashRow.rows[0].hash],
  );
  viewerToken = await fx.loginAs('pm02c4_viewer', fx.adminPassword);

  // سه ضمیمهٔ واقعی با خط لولهٔ C3؛ C4 آنها را صادر/بازرسی میکند.
  await uploadAttachment('invoice', invoiceId, PNG_BYTES, 'فاکتور.png', 'image/png').expect(201);
  await uploadAttachment('invoice', invoiceId, PDF_BYTES, 'شرح.pdf', 'application/pdf').expect(201);
  await uploadAttachment('sales_order', salesOrderId, PNG_BYTES, 'سفارش.png', 'image/png').expect(201);
}, 180_000);

afterAll(async () => {
  vi.restoreAllMocks();
  await fx?.teardown();
});

describe('TASK-PM-02-C4 — multi-entity attachment transfer over real HTTP + PostgreSQL', () => {
  it('exposes exactly eight approved owner types, requires permission and rejects domain context', async () => {
    const res = await fx.api().get(`${BASE}/owner-types`).expect(200);
    expect(res.body.items).toHaveLength(8);
    expect(res.body.items.map((i: { owner_type: string }) => i.owner_type).sort())
      .toEqual([...TRANSFER_OWNER_TYPES].sort());
    for (const item of res.body.items) {
      expect(item.label_fa).toBeTruthy();
      expect(item.module_path).toMatch(/^\//);
      expect(item.backend_supported).toBe(true);
    }
    expect(res.body.items.some((i: { owner_type: string }) => i.owner_type === 'other')).toBe(false);
    expect(JSON.stringify(res.body)).not.toMatch(/storage_key|signed_url|download_url|bucket|company_id/i);

    await fx.api(viewerToken).get(`${BASE}/owner-types`).expect(403);
    const domain = await fx.api().get(`${BASE}/owner-types`).set('x-domain-id', randomUUID()).expect(400);
    expect(domain.body.code).toBe('domain_context_not_supported');
    await fx.api().get(`${BASE}/owner-types?limit=3`).expect(400);
  });

  it('discovers server-owned records across all eight types without leaking another company', async () => {
    const all = await fx.api().get(`${BASE}/owners`).expect(200);
    expect(all.body.items.some((i: { owner_id: string }) => i.owner_id === invoiceId)).toBe(true);
    expect(all.body.items.some((i: { owner_id: string }) => i.owner_id === salesOrderId)).toBe(true);
    expect(all.body.items.some((i: { owner_id: string }) => i.owner_id === foreignInvoiceId)).toBe(false);
    expect(new Set(all.body.items.map((i: { owner_type: string }) => i.owner_type)).size).toBeGreaterThanOrEqual(2);

    const searched = await fx.api().get(`${BASE}/owners?entity_types=invoice&q=C4-INV-1&limit=40`).expect(200);
    expect(searched.body.items).toHaveLength(1);
    expect(searched.body.items[0]).toMatchObject({ owner_type: 'invoice', owner_id: invoiceId });
    expect(searched.body.items[0].attachment_count).toBe(2);
    expect(JSON.stringify(searched.body)).not.toMatch(/storage_key|storage.local|company_id|bucket/i);

    const badType = await fx.api().get(`${BASE}/owners?entity_types=brand`).expect(400);
    expect(badType.body.code).toBe('unsupported_owner_type');
    const foreign = await fx.api()
      .post(`${BASE}/exports/preview`)
      .send({ selections: [{ owner_type: 'invoice', owner_id: foreignInvoiceId }] })
      .expect(404);
    expect(foreign.body.code).toBe('owner_not_found');
  });

  it('builds an integrity-protected ZIP from three real attachments and streams it same-origin', async () => {
    const preview = await fx.api()
      .post(`${BASE}/exports/preview`)
      .send({
        selections: [
          { owner_type: 'invoice', owner_id: invoiceId },
          { owner_type: 'sales_order', owner_id: salesOrderId },
        ],
      })
      .expect(200);
    expect(preview.body.file_count).toBe(3);
    expect(preview.body.total_bytes).toBe(PNG_BYTES.length * 2 + PDF_BYTES.length);
    expect(preview.body.entity_types).toEqual(['invoice', 'sales_order']);
    expect(preview.body.downloads_available).toBe(true);
    expect(preview.body.manifest.files).toHaveLength(3);
    expect(preview.body.rejected_count).toBe(0);
    manifestPath = preview.body.manifest.files[0].path;
    exportedOperationId = preview.body.operation_id;
    exportedPackageSha = preview.body.manifest.checksums.package_sha256;
    expect(JSON.stringify(preview.body)).not.toMatch(/storage_key|storage.local|signed_url|bucket|access_key/i);

    const download = await fx.api()
      .get(`${BASE}/exports/${exportedOperationId}/package`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200);
    exportedZip = download.body as Buffer;
    expect(Buffer.isBuffer(exportedZip)).toBe(true);
    expect(download.headers['content-type']).toContain('application/zip');
    expect(download.headers['content-disposition']).toContain('.zip');
    expect(download.headers['x-transfer-package-sha256']).toBe(exportedPackageSha);
    expect(download.headers['cache-control']).toBe('no-store');
    expect(download.headers['x-content-type-options']).toBe('nosniff');
    expect(Number(download.headers['content-length'])).toBe(exportedZip.length);
    // هش سربرگ، هش یکپارچگی بسته (manifest + محتوا) است، نه هش خام فایل ZIP.
    const inspection = inspectTransferPackage(exportedZip);
    expect(inspection.packageSha256).toBe(download.headers['x-transfer-package-sha256']);
    expect(inspection.packageSha256).toBe(exportedPackageSha);
    expect(inspection.manifest.file_count).toBe(3);
    expect(inspection.manifest.schema).toBe('green-dms.attachment-transfer/1');
    await fx.api(viewerToken).get(`${BASE}/exports/${exportedOperationId}/package`).expect(403);
  });

  it('inspects the exported package as a safe import preview, never persisting an attachment', async () => {
    const before = await fx.pool.query<{ count: string }>(
      `select count(*)::text as count from attachment where company_id = $1::uuid`,
      [fx.companyId],
    );
    const res = await importZip(exportedZip).expect(200);
    expect(res.body.operation_type).toBe('import');
    expect(res.body.file_count).toBe(3);
    expect(res.body.package_sha256).toBe(exportedPackageSha);
    expect(res.body.execution.allowed).toBe(false);
    expect(res.body.execution.reason_code).toBe('approval_policy_missing');
    expect(res.body.approval.status).toBe('blocked');
    expect(res.body.approval.reason_code).toBe('approval_policy_missing');
    expect(res.body.approval.fingerprint_supported).toBe(false);
    expect(res.body.approval.self_approval_forbidden).toBe(true);
    expect(res.body.approval.operation).toBe('attachment.import.execute');
    // بسته از همان دیبیی صادر شده است ⇒ همهٔ موارد «تکراری»اند و بازنویسی ممنوع است.
    expect(res.body.counts.duplicate).toBe(3);
    expect(res.body.items.every((i: { status: string }) => i.status === 'duplicate')).toBe(true);
    importOperationId = res.body.operation_id;
    initialMappingSha = res.body.mapping_sha256;
    expect(JSON.stringify(res.body)).not.toMatch(/storage_key|storage.local|signed_url|bucket|access_key/i);

    const status = await fx.api().get(`${BASE}/imports/${importOperationId}`).expect(200);
    expect(status.body.operation_id).toBe(importOperationId);
    expect(status.body.execution.allowed).toBe(false);
    const after = await fx.pool.query<{ count: string }>(
      `select count(*)::text as count from attachment where company_id = $1::uuid`,
      [fx.companyId],
    );
    expect(after.rows[0].count).toBe(before.rows[0].count);
  });

  it('rejects tampered bytes, forbidden manifest fields, injected client fields and unsupported owner types', async () => {
    const entries = readZipForTest(exportedZip);
    const manifest = JSON.parse(entries.get('manifest.json')!.data.toString('utf8'));
    const checksums = JSON.parse(entries.get('checksums.json')!.data.toString('utf8'));
    const files = new Map<string, Buffer>();
    for (const f of manifest.files) files.set(f.path, entries.get(f.path)!.data);

    // ۱) یک بایت از محتوای فایل تغییر میکند ⇒ امضا/CRC دیگر معتبر نیست.
    const firstPath = manifest.files[0].path;
    const tamperedFiles = new Map(files);
    const mutated = Buffer.from(files.get(firstPath)!);
    mutated[8] ^= 0xff;
    tamperedFiles.set(firstPath, mutated);
    const tampered = buildRawZipForTest([
      { name: 'manifest.json', data: Buffer.from(canonicalJson(manifest), 'utf8') },
      { name: 'checksums.json', data: Buffer.from(canonicalJson(checksums), 'utf8') },
      ...[...tamperedFiles.entries()].map(([name, data]) => ({ name, data })),
    ]);
    const badBytes = await importZip(tampered).expect(400);
    expect(['checksum_mismatch', 'crc_mismatch', 'content_mismatch', 'package_checksum_mismatch'])
      .toContain(badBytes.body.code);

    // ۲) فیلد ممنوع `storage_key` در manifest صریحاً رد میشود.
    const withForbidden = { ...manifest, storage_key: 'attachments/secret' };
    const forbiddenZip = buildRawZipForTest([
      { name: 'manifest.json', data: Buffer.from(canonicalJson(withForbidden), 'utf8') },
      { name: 'checksums.json', data: Buffer.from(canonicalJson(checksums), 'utf8') },
      ...[...files.entries()].map(([name, data]) => ({ name, data })),
    ]);
    const forbidden = await importZip(forbiddenZip).expect(400);
    expect(forbidden.body.code).toBe('forbidden_manifest_field');

    const injected = await fx.api()
      .post(`${BASE}/imports/preview`)
      .field('company_id', randomUUID())
      .attach('file', exportedZip, { filename: 'attachments.zip', contentType: 'application/zip' })
      .expect(400);
    expect(injected.body.code).toBe('forbidden_client_field');
    const badExtension = await importZip(exportedZip, 'attachments.exe').expect(400);
    expect(badExtension.body.code).toBe('extension_mismatch');
  });

  it('mapping changes invalidate approval, reject cross-company owners, and execution stays fail-closed', async () => {
    const mapped = await fx.api()
      .post(`${BASE}/imports/${importOperationId}/mappings`)
      .send({ mapping_overrides: [{ path: manifestPath, owner_id: secondInvoiceId }] })
      .expect(200);
    expect(mapped.body.version).toBeGreaterThan(1);
    expect(mapped.body.approval.approval_invalidated).toBe(true);
    expect(mapped.body.mapping_sha256).not.toBe(initialMappingSha);
    expect(mapped.body.version).toBeGreaterThan(1);
    expect(mapped.body.execution.allowed).toBe(false);

    const cross = await fx.api()
      .post(`${BASE}/imports/${importOperationId}/mappings`)
      .send({ mapping_overrides: [{ path: manifestPath, owner_id: foreignInvoiceId }] })
      .expect(200);
    const crossItem = cross.body.items.find((i: { path: string }) => i.path === manifestPath);
    expect(crossItem.status).toBe('rejected');
    expect(crossItem.reason_code).toBe('owner_scope_rejected');

    const before = await fx.pool.query<{ count: string }>(
      `select count(*)::text as count from attachment where company_id = $1::uuid`,
      [fx.companyId],
    );
    // تزریق تأییدکننده/تأیید از سمت کلاینت پیش از هر تصمیمی رد میشود.
    const injectedApproval = await fx.api()
      .post(`${BASE}/imports/${importOperationId}/execute`)
      .send({ approved_by: fx.adminUser, confirm: true })
      .expect(400);
    expect(injectedApproval.body.code).toBe('forbidden_client_field');
    // حتی بدنهٔ کاملاً خالی هم بهدلیل نبود گردش مصوب دونفره fail-closed است.
    const executed = await fx.api()
      .post(`${BASE}/imports/${importOperationId}/execute`)
      .send({})
      .expect(409);
    expect(executed.body.code).toBe('approval_required');
    const after = await fx.pool.query<{ count: string }>(
      `select count(*)::text as count from attachment where company_id = $1::uuid`,
      [fx.companyId],
    );
    expect(after.rows[0].count).toBe(before.rows[0].count);

    const audit = await fx.pool.query<{ action: string; after_data: unknown }>(
      `select action, after_data from audit_log
        where entity_type = 'attachment_transfer' and entity_id = $1::uuid
        order by at, id`,
      [importOperationId],
    );
    expect(audit.rows.map((r) => r.action)).toContain('attachment_transfer.execution');
    expect(audit.rows.map((r) => r.action)).toContain('attachment_transfer.approval');
    expect(audit.rows.map((r) => r.action)).toContain('attachment_transfer.preview');
    for (const row of audit.rows) {
      const text = JSON.stringify(row.after_data ?? {});
      expect(text).not.toMatch(/storage_key|storage.local|signed_url|bucket|access_key|password/i);
    }
  });

  it('history/detail are tenant-scoped, auditable and cancellation only invalidates the preview', async () => {
    const history = await fx.api().get(`${BASE}/operations`).expect(200);
    expect(history.body.items.some((i: { operation_id: string }) => i.operation_id === exportedOperationId)).toBe(true);
    expect(history.body.items.some((i: { operation_id: string }) => i.operation_id === importOperationId)).toBe(true);
    expect(JSON.stringify(history.body)).not.toMatch(/storage_key|storage.local|signed_url|bucket/i);
    await fx.api(viewerToken).get(`${BASE}/operations`).expect(403);
    await fx.api().get(`${BASE}/operations?limit=0`).expect(400);
    await fx.api().get(`${BASE}/operations?company_id=${fx.companyId}`).expect(400);

    const detail = await fx.api().get(`${BASE}/operations/${exportedOperationId}`).expect(200);
    expect(detail.body.operation_id).toBe(exportedOperationId);
    expect(detail.body.manifest.files).toHaveLength(3);
    expect(detail.body.manifest.checksums.package_sha256).toBe(exportedPackageSha);
    expect(JSON.stringify(detail.body)).not.toMatch(/storage_key|storage.local|signed_url|bucket/i);
    await fx.api().get(`${BASE}/operations/${randomUUID()}`).expect(404);

    const cancelled = await fx.api()
      .post(`${BASE}/operations/${importOperationId}/cancel`)
      .send({})
      .expect(200);
    expect(cancelled.body.status).toBe('cancelled');
    await fx.api().get(`${BASE}/imports/${importOperationId}`).expect(404);
    const stillThere = await fx.api().get(`${BASE}/operations/${importOperationId}`).expect(200);
    expect(stillThere.body.operation_id).toBe(importOperationId);
  });
});
