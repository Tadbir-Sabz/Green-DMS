import { describe, expect, it } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { Pool } from 'pg';
import type { AuditService } from '../src/common/audit.service';
import type { RequestMeta } from '../src/common/request-meta';
import type { StorageService } from '../src/modules/attachments/storage.service';
import { AttachmentTransferService } from '../src/modules/attachments/attachment-transfer.service';
import { buildTransferPackage } from '../src/modules/attachments/attachment-transfer.package';
import { sha256Hex } from '../src/modules/attachments/attachment-transfer.rules';

/** بایت PNG معتبر با IHDR؛ امضای بایتی مستقل از MIME ادعایی سنجیده میشود. */
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

const COMPANY = '11111111-1111-4111-8111-111111111111';
const OTHER_COMPANY = '99999999-9999-4999-8999-999999999999';
const USER = '22222222-2222-4222-8222-222222222222';
const OWNER_A = '33333333-3333-4333-8333-333333333333';
const OWNER_B = '44444444-4444-4444-8444-444444444444';
const ATTACHMENT_A = '55555555-5555-4555-8555-555555555555';
const ATTACHMENT_B = '66666666-6666-4666-8666-666666666666';
const OP = '77777777-7777-4777-8777-777777777777';
const STORAGE_KEY = 'tenant/company/attachment/object-key';
const META: RequestMeta = { ip: null, userAgent: null, requestId: null };
const ACTOR = { companyId: COMPANY, userId: USER };

interface AuditEvent {
  id: string;
  entity_id: string;
  action: string;
  at: string;
  actor_user_id: string | null;
  actor_label: string | null;
  after_data: unknown;
}

interface Harness {
  service: AttachmentTransferService;
  audits: AuditEvent[];
  calls: { sql: string; params: unknown[] }[];
  setPermissions: (codes: string[]) => void;
  setOwnerCompany: (companyId: string | null) => void;
  setAttachmentRows: (rows: unknown[]) => void;
  setExistingDuplicates: (rows: unknown[]) => void;
  setStorageFailure: (fail: boolean) => void;
}

function makeHarness(): Harness {
  const state = {
    permissions: ['attachment.view', 'attachment.upload'],
    ownerCompany: COMPANY as string | null,
    attachmentRows: [] as unknown[],
    existingDuplicates: [] as unknown[],
    storageFailure: false,
  };
  const audits: AuditEvent[] = [];
  const calls: { sql: string; params: unknown[] }[] = [];
  let eventId = 0;
  const client = {
    async query(sql: unknown, params: unknown[] = []) {
      const text = String(sql);
      calls.push({ sql: text, params });
      if (/^(begin|commit|rollback)$/i.test(text) || /^set transaction/i.test(text)) return { rows: [] };
      if (text.includes('set_config')) return { rows: [] };
      if (text.includes('from app_user u')) return { rows: state.permissions.map((code) => ({ code })) };
      if (text.includes('from audit_log a')) {
        return {
          rows: audits.map((event) => ({
            id: event.id,
            entity_id: event.entity_id,
            action: event.action,
            at: event.at,
            actor_user_id: event.actor_user_id,
            actor_label: event.actor_label,
            after_data: event.after_data,
          })),
        };
      }
      if (text.includes('select after_data from audit_log')) {
        const isExport = text.includes("action = 'attachment_transfer.export'");
        const candidates = isExport
          ? audits.filter((event) => event.action === 'attachment_transfer.export')
          : audits.filter((event) => ['attachment_transfer.export', 'attachment_transfer.preview'].includes(event.action));
        const last = candidates[candidates.length - 1];
        return { rows: last ? [{ after_data: last.after_data }] : [] };
      }
      if (text.includes('select id::text from attachment')) return { rows: state.existingDuplicates };
      if (text.includes('from attachment') && text.includes('order by created_at asc')) return { rows: state.attachmentRows };
      if (text.includes('from attachment') && text.includes('id = $2::uuid')) {
        const id = String(params[1] ?? '');
        return { rows: (state.attachmentRows as { id: string }[]).filter((row) => row.id === id) };
      }
      if (/from (?:invoice i|sales_order o|return_request r|stock_count s|product p|journal_entry j|payment_receipt r|pod p)/.test(text)) {
        return { rows: state.ownerCompany ? [{ company_id: state.ownerCompany }] : [] };
      }
      return { rows: [] };
    },
    release(_broken?: Error) {},
  };
  const pool = { connect: async () => client } as unknown as Pool;
  const audit = {
    async recordRequired(entry: {
      action: string; entityId?: string | null; actorUserId?: string | null; after?: unknown;
    }) {
      eventId += 1;
      audits.push({
        id: String(eventId),
        entity_id: String(entry.entityId ?? ''),
        action: entry.action,
        at: new Date(Date.UTC(2026, 10, 7, 10, 0, eventId)).toISOString(),
        actor_user_id: entry.actorUserId ?? null,
        actor_label: 'اپراتور تست',
        after_data: entry.after,
      });
    },
  } as unknown as AuditService;
  const storage = {
    async get(key: string, _maxBytes: number) {
      if (state.storageFailure) throw new Error('MinIO unavailable');
      if (key !== STORAGE_KEY) throw new Error('unknown object');
      return Buffer.from(PNG_BYTES);
    },
  } as unknown as StorageService;
  const service = new AttachmentTransferService(pool, audit, storage);
  return {
    service,
    audits,
    calls,
    setPermissions: (codes) => { state.permissions = codes; },
    setOwnerCompany: (companyId) => { state.ownerCompany = companyId; },
    setAttachmentRows: (rows) => { state.attachmentRows = rows; },
    setExistingDuplicates: (rows) => { state.existingDuplicates = rows; },
    setStorageFailure: (fail) => { state.storageFailure = fail; },
  };
}

function attachmentRow(id = ATTACHMENT_A, ownerId = OWNER_A) {
  return {
    id,
    owner_type: 'invoice',
    owner_id: ownerId,
    file_name: 'عکس.png',
    content_type: 'image/png',
    size_bytes: PNG_BYTES.length,
    sha256: sha256Hex(PNG_BYTES),
    storage_key: STORAGE_KEY,
    created_at: '2026-11-07T09:00:00.000Z',
  };
}

function importPackage(fileCount = 2) {
  const files = Array.from({ length: fileCount }, (_, index) => ({
    attachment_id: index === 0 ? ATTACHMENT_A : ATTACHMENT_B,
    owner_type: 'invoice' as const,
    owner_id: OWNER_A,
    file_name: 'عکس.png',
    content_type: 'image/png',
    bytes: PNG_BYTES,
  }));
  return buildTransferPackage({ operationId: OP, createdAt: '2026-11-07T10:00:00.000Z', files }).zip;
}

async function expectCode(fn: () => Promise<unknown>, code: string) {
  try {
    await fn();
    throw new Error('expected_failure');
  } catch (err) {
    const response = (err as { getResponse?: () => unknown })?.getResponse?.();
    expect((response as { code?: string })?.code ?? (err as { code?: string })?.code).toBe(code);
  }
}

describe('TASK-PM-02-C4 — سرویس صدور/ورود امن ضمائم', () => {
  it('صدور محصول بدون master.product.view رد میشود؛ مجوز تازهای ساخته نمیشود', async () => {
    const h = makeHarness();
    h.setPermissions(['attachment.view']);
    await expectCode(
      () => h.service.exportPreview(ACTOR, { selections: [{ owner_type: 'product', owner_id: OWNER_A }] }, META),
      'attachment_permission_denied',
    );
    expect(h.audits.some((a) => a.action === 'attachment_transfer.export')).toBe(false);
    expect(h.audits.some((a) => a.action === 'attachment_transfer.failure')).toBe(true);
  });

  it('مالک شرکت دیگر و نوع مالک ناشناخته fail-closed رد میشوند', async () => {
    const h = makeHarness();
    h.setOwnerCompany(OTHER_COMPANY);
    await expect(
      h.service.exportPreview(ACTOR, { selections: [{ owner_type: 'invoice', owner_id: OWNER_A }] }, META),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expectCode(
      () => h.service.exportPreview(ACTOR, { selections: [{ owner_type: 'brand', owner_id: OWNER_A }] }, META),
      'invalid_selection',
    );
    expect(h.audits.some((a) => a.action === 'attachment_transfer.export')).toBe(false);
  });

  it('صدور، دانلود بازسازیشده و تاریخچهٔ تراکنشی بدون نشت زیرساخت', async () => {
    const h = makeHarness();
    h.setAttachmentRows([attachmentRow()]);
    const preview = await h.service.exportPreview(
      ACTOR,
      { selections: [{ owner_type: 'invoice', owner_id: OWNER_A }] },
      META,
    );
    expect(preview.file_count).toBe(1);
    expect(preview.downloads_available).toBe(true);
    expect(preview.manifest?.checksums.package_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(preview)).not.toMatch(/storage_key|signed_url|download_url|bucket|token|company_id/i);

    const pkg = await h.service.exportPackage(ACTOR, preview.operation_id, META);
    expect(pkg.packageSha256).toBe(preview.manifest?.checksums.package_sha256);
    expect(pkg.size).toBeGreaterThan(0);

    const history = await h.service.history(ACTOR, { limit: 10 });
    const item = history.items.find((i) => i.operation_id === preview.operation_id);
    expect(item).toBeTruthy();
    expect(item?.initiator_label).toBe('اپراتور تست');
    expect(item?.approver_label).toBe('—');
    expect(item?.operation_type).toBe('export');
    expect(item?.accepted_count).toBe(1);
    expect(item?.events.map((e) => e.phase)).toContain('execution');
    expect(item?.events.map((e) => e.phase)).toContain('download');
    expect(JSON.stringify(history)).not.toMatch(/storage_key|signed_url|download_url|bucket|endpoint|access_key|secret_key/i);

    const detail = await h.service.operationDetail(ACTOR, preview.operation_id);
    expect(detail.manifest?.files).toHaveLength(1);
    expect(detail.manifest?.files[0]?.owner_type).toBe('invoice');
  });

  it('شکست استوریج، بستهٔ ناقص نساخته و خطای امن در ممیزی ثبت میشود', async () => {
    const h = makeHarness();
    h.setAttachmentRows([attachmentRow()]);
    h.setStorageFailure(true);
    await expect(
      h.service.exportPreview(ACTOR, { selections: [{ owner_type: 'invoice', owner_id: OWNER_A }] }, META),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(h.audits.some((a) => a.action === 'attachment_transfer.export')).toBe(false);
    const failure = h.audits.find((a) => a.action === 'attachment_transfer.failure');
    expect((failure?.after_data as { safe_failure?: { code?: string } })?.safe_failure?.code).toBe('storage_read_failed');
  });

  it('ورود فقط پیشنمایش امن میدهد؛ تکراری، نگاشت، خودتأییدی و لغو کاملاً ممیزی میشوند', async () => {
    const h = makeHarness();
    const zip = importPackage();
    const preview = await h.service.importPreview(
      ACTOR,
      { buffer: zip, mimetype: 'application/zip', originalname: 'attachments.zip', size: zip.length },
      {},
      META,
    );
    expect(preview.execution_status).toBe('blocked');
    expect(preview.approval.status).toBe('blocked');
    expect(preview.approval.approver_user_id).toBeNull();
    expect(preview.approval.fingerprint_supported).toBe(false);
    expect(preview.counts.accepted).toBe(1);
    expect(preview.counts.duplicate).toBe(1);
    expect(JSON.stringify(preview)).not.toMatch(/storage_key|signed_url|download_url|company_id|bucket|token/i);

    const path = preview.items[0]!.path;
    const changed = await h.service.updateMappings(
      ACTOR,
      preview.operation_id,
      { mapping_overrides: [{ path, owner_id: OWNER_B }] },
      META,
    );
    expect(changed.version).toBe(2);
    expect(changed.phase).toBe('approval');
    expect(changed.mapping_sha256).not.toBe(preview.mapping_sha256);
    expect(changed.approval.approval_invalidated).toBe(true);

    await expect(h.service.execute(ACTOR, preview.operation_id, {}, META)).rejects.toBeInstanceOf(ConflictException);
    const cancelled = await h.service.cancel(ACTOR, preview.operation_id, {}, META);
    expect(cancelled.status).toBe('cancelled');

    const writes = h.calls.filter((call) => /insert into attachment|update attachment|delete from attachment/i.test(call.sql));
    expect(writes).toHaveLength(0);
    const phases = h.audits
      .filter((a) => a.entity_id === preview.operation_id)
      .map((a) => (a.after_data as { phase?: string })?.phase);
    expect(phases).toEqual(expect.arrayContaining(['preview', 'approval', 'execution', 'cancellation']));

    const history = await h.service.history(ACTOR, { limit: 10 });
    const item = history.items.find((i) => i.operation_id === preview.operation_id);
    expect(item?.execution_status).toBe('cancelled');
    expect(item?.events.length).toBeGreaterThanOrEqual(4);
    expect(item?.safe_failure?.code).toBe('approval_required');
  });

  it('ورود بستهٔ دستکاریشده و بدنهٔ حاوی فیلد ممنوع رد میشود', async () => {
    const h = makeHarness();
    const zip = Buffer.from(importPackage(1));
    zip[zip.length - 40] ^= 0xff;
    await expectCode(
      () => h.service.importPreview(
        ACTOR,
        { buffer: zip, mimetype: 'application/zip', originalname: 'attachments.zip', size: zip.length },
        { company_id: COMPANY },
        META,
      ),
      'forbidden_client_field',
    );
    const clean = importPackage(1);
    await expectCode(
      () => h.service.importPreview(
        ACTOR,
        { buffer: clean, mimetype: 'application/zip', originalname: 'attachments.zip', size: clean.length },
        { domain_id: 'x' },
        META,
      ),
      'forbidden_client_field',
    );
    expect(h.audits.some((a) => a.action === 'attachment_transfer.preview')).toBe(false);
  });

  it('مالک خارج از شرکت در پیشنمایش ورود بهصورت ردشده/حلنشده گزارش میشود', async () => {
    const h = makeHarness();
    h.setOwnerCompany(OTHER_COMPANY);
    const zip = importPackage(1);
    const preview = await h.service.importPreview(
      ACTOR,
      { buffer: zip, mimetype: 'application/zip', originalname: 'attachments.zip', size: zip.length },
      {},
      META,
    );
    expect(preview.items[0]?.status).toBe('rejected');
    expect(preview.items[0]?.reason_code).toBe('owner_scope_rejected');
    expect(preview.execution.allowed).toBe(false);
    expect(h.calls.some((call) => /insert into attachment/i.test(call.sql))).toBe(false);
  });

  it('تکراری موجود در DB و نگاشت نامعتبر رد میشوند', async () => {
    const h = makeHarness();
    h.setExistingDuplicates([{ id: ATTACHMENT_A }]);
    const zip = importPackage(1);
    const preview = await h.service.importPreview(
      ACTOR,
      { buffer: zip, mimetype: 'application/zip', originalname: 'attachments.zip', size: zip.length },
      {},
      META,
    );
    expect(preview.items[0]?.status).toBe('duplicate');
    expect(preview.counts.duplicate).toBe(1);
    await expectCode(
      () => h.service.updateMappings(
        ACTOR,
        preview.operation_id,
        { mapping_overrides: [{ path: 'files/does-not-exist.png', owner_id: OWNER_B }] },
        META,
      ),
      'invalid_mapping_path',
    );
  });

  it('خودتأییدی در دروازهٔ دونفره حتی با هشهای درست رد میشود', async () => {
    const h = makeHarness();
    h.setPermissions(['attachment.view']);
    await expect(
      h.service.exportPreview(ACTOR, { selections: [{ owner_type: 'product', owner_id: OWNER_A }] }, META),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
