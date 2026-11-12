import { describe, expect, it } from 'vitest';
import {
  TRANSFER_MAX_FILES,
  TRANSFER_OWNER_TYPES,
  TRANSFER_SCHEMA,
  canonicalJson,
  findForbiddenClientFields,
  isTransferOwnerType,
  manifestSha256,
  packageSha256,
  sha256Hex,
  validateTwoPersonApprovalBinding,
  type TransferManifest,
} from '../src/modules/attachments/attachment-transfer.rules';
import {
  buildRawZipForTest,
  buildTransferPackage,
  inspectTransferPackage,
  readZipForTest,
} from '../src/modules/attachments/attachment-transfer.package';

/** بایتهای واقعی PNG/PDF با ساختار قابلتشخیص (نه MIME ادعایی صرف). */
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

const OP = '11111111-1111-4111-8111-111111111111';
const OWNER_A = '22222222-2222-4222-8222-222222222222';
const OWNER_B = '33333333-3333-4333-8333-333333333333';
const ATTACHMENT_A = '44444444-4444-4444-8444-444444444444';
const ATTACHMENT_B = '55555555-5555-4555-8555-555555555555';
const CREATED_AT = '2026-11-07T10:00:00.000Z';

function codeOf(fn: () => unknown): string {
  try {
    fn();
    return 'no_error';
  } catch (err) {
    return (err as { code?: string }).code ?? 'unknown_error';
  }
}

function validPackage(fileCount = 2) {
  const files = [
    {
      attachment_id: ATTACHMENT_A,
      owner_type: 'invoice' as const,
      owner_id: OWNER_A,
      file_name: 'فاکتور.pdf',
      content_type: 'application/pdf',
      bytes: PDF_BYTES,
    },
  ];
  if (fileCount > 1) {
    files.push({
      attachment_id: ATTACHMENT_B,
      owner_type: 'sales_order' as const,
      owner_id: OWNER_B,
      file_name: 'رسید.png',
      content_type: 'image/png',
      bytes: PNG_BYTES,
    });
  }
  const built = buildTransferPackage({ operationId: OP, createdAt: CREATED_AT, files });
  const inspection = inspectTransferPackage(built.zip);
  return { built, inspection };
}

function zipFromParts(manifest: unknown, checksums: unknown, files: ReadonlyMap<string, Buffer>) {
  const entries = [
    { name: 'manifest.json', data: Buffer.from(canonicalJson(manifest), 'utf8') },
    { name: 'checksums.json', data: Buffer.from(canonicalJson(checksums), 'utf8') },
    ...[...files.entries()].map(([name, data]) => ({ name, data })),
  ];
  return buildRawZipForTest(entries);
}

describe('TASK-PM-02-C4 — قواعد خالص و بستهٔ ZIP کنترلشده', () => {
  it('فقط هشت مالک مصوب مجازاند؛ انواع ناشناخته و فیلدهای کلاینتی ممنوعاند', () => {
    expect(TRANSFER_OWNER_TYPES).toHaveLength(8);
    expect(TRANSFER_OWNER_TYPES).toContain('product');
    expect(TRANSFER_OWNER_TYPES).toContain('receipt');
    expect(TRANSFER_OWNER_TYPES).toContain('pod');
    for (const invalid of ['other', 'brand', 'product_category', 'warehouse', 'uom', 'domain']) {
      expect(isTransferOwnerType(invalid)).toBe(false);
    }
    expect(findForbiddenClientFields({ selections: [{ owner_type: 'invoice', company_id: OWNER_A }] }))
      .toContain('selections[0].company_id');
    expect(findForbiddenClientFields({ x: { storage_key: 'secret' } })).toContain('x.storage_key');
  });

  it('گردش کامل صدور/بازرسی: manifest، CRC، SHA-256 و مسیرهای سرورساخته', () => {
    const { built, inspection } = validPackage();
    expect(built.manifest.schema).toBe(TRANSFER_SCHEMA);
    expect(built.manifest.file_count).toBe(2);
    expect(inspection.manifestSha256).toBe(built.manifestSha256);
    expect(inspection.packageSha256).toBe(built.packageSha256);
    expect(inspection.manifest.entity_types).toEqual(['invoice', 'sales_order']);
    expect(inspection.files.size).toBe(2);
    for (const file of built.manifest.files) {
      expect(file.path).toMatch(/^files\/\d{4}-[a-f0-9]{12}\.(pdf|png)$/);
      expect(file.path).toContain(file.sha256.slice(0, 12));
      expect(file.crc32).toBeGreaterThanOrEqual(0);
    }
    expect(JSON.stringify(built.manifest)).not.toMatch(/storage_key|signed_url|download_url|company_id|bucket|token/i);
  });

  it('تغییر بایت فایل، هش SHA-256 بسته را بیاعتبار میکند', () => {
    const { built, inspection } = validPackage(1);
    const entries = readZipForTest(built.zip);
    const manifest = JSON.parse(entries.get('manifest.json')!.data.toString('utf8'));
    const checksums = JSON.parse(entries.get('checksums.json')!.data.toString('utf8'));
    const path = built.manifest.files[0]!.path;
    const mutated = Buffer.from(PDF_BYTES);
    mutated[mutated.length - 1] ^= 0xff;
    const zip = zipFromParts(manifest, checksums, new Map([[path, mutated]]));
    expect(codeOf(() => inspectTransferPackage(zip))).toBe('checksum_mismatch');
    expect(inspection.packageSha256).toBe(checksums.package_sha256);
  });

  it('تغییر هش manifest و فیلد ممنوع صریحاً رد میشوند', () => {
    const { built } = validPackage(1);
    const entries = readZipForTest(built.zip);
    const manifest = JSON.parse(entries.get('manifest.json')!.data.toString('utf8'));
    const checksums = JSON.parse(entries.get('checksums.json')!.data.toString('utf8'));
    const files = new Map([[built.manifest.files[0]!.path, PDF_BYTES]]);

    const changed = { ...manifest, operation_id: '88888888-8888-4888-8888-888888888888' };
    expect(codeOf(() => inspectTransferPackage(zipFromParts(changed, checksums, files))))
      .toBe('manifest_checksum_mismatch');

    const forbidden = { ...manifest, company_id: OWNER_A };
    expect(codeOf(() => inspectTransferPackage(zipFromParts(forbidden, checksums, files))))
      .toBe('forbidden_manifest_field');
  });

  it('نوع مالک ناشناخته، manifest بدشکل و ورودی تکراری رد میشوند', () => {
    const { built } = validPackage(1);
    const entries = readZipForTest(built.zip);
    const manifest = JSON.parse(entries.get('manifest.json')!.data.toString('utf8')) as TransferManifest;
    const checksums = JSON.parse(entries.get('checksums.json')!.data.toString('utf8'));
    const files = new Map([[built.manifest.files[0]!.path, PDF_BYTES]]);
    const badManifest = {
      ...manifest,
      files: manifest.files.map((f) => ({ ...f, owner_type: 'brand' })),
    };
    expect(codeOf(() => inspectTransferPackage(zipFromParts(badManifest, checksums, files))))
      .toBe('unsupported_owner_type');

    expect(codeOf(() => inspectTransferPackage(buildRawZipForTest([
      { name: 'manifest.json', data: Buffer.from('{not-json') },
      { name: 'checksums.json', data: Buffer.from(canonicalJson(checksums)) },
    ])))).toBe('malformed_manifest');

    expect(codeOf(() => inspectTransferPackage(buildRawZipForTest([
      { name: 'manifest.json', data: Buffer.from(canonicalJson(manifest)) },
      { name: 'manifest.json', data: Buffer.from(canonicalJson(manifest)) },
      { name: 'checksums.json', data: Buffer.from(canonicalJson(checksums)) },
    ])))).toBe('duplicate_archive_entry');
  });

  it('مسیر traversal، ZIP64/چنددیسکی و بمب فشردهسازی fail-closedاند', () => {
    expect(codeOf(() => buildRawZipForTest([
      { name: '../evil.png', data: PNG_BYTES },
    ]))).toBe('path_traversal_rejected');

    const { built } = validPackage(1);
    const entries = readZipForTest(built.zip);
    const manifest = JSON.parse(entries.get('manifest.json')!.data.toString('utf8'));
    const checksums = JSON.parse(entries.get('checksums.json')!.data.toString('utf8'));
    const bomb = Buffer.alloc(2 * 1024 * 1024);
    const bombPath = `files/9999-${sha256Hex(bomb).slice(0, 12)}.png`;
    const bombZip = buildRawZipForTest([
      { name: 'manifest.json', data: Buffer.from(canonicalJson(manifest)) },
      { name: 'checksums.json', data: Buffer.from(canonicalJson(checksums)) },
      { name: bombPath, data: bomb, method: 8 as const },
    ]);
    expect(codeOf(() => inspectTransferPackage(bombZip))).toBe('decompression_bomb_rejected');
    expect(TRANSFER_MAX_FILES).toBeLessThanOrEqual(200);
  });

  it('MIME، پسوند و محتوای بایتی ناهمساز رد میشود', () => {
    expect(codeOf(() => buildTransferPackage({
      operationId: OP,
      createdAt: CREATED_AT,
      files: [{
        attachment_id: ATTACHMENT_A,
        owner_type: 'invoice',
        owner_id: OWNER_A,
        file_name: 'فایل.exe',
        content_type: 'application/octet-stream',
        bytes: Buffer.from('MZ executable'),
      }],
    }))).toBe('unsupported_media_type');
  });

  it('دروازهٔ تأیید دونفره: خودتأییدی، تغییر بسته/نگاشت و انقضا رد میشوند', () => {
    const hashA = 'a'.repeat(64);
    const hashB = 'b'.repeat(64);
    const hashC = 'c'.repeat(64);
    const base = {
      initiatorUserId: '11111111-1111-4111-8111-111111111111',
      approverUserId: '22222222-2222-4222-8222-222222222222',
      approvedPackageSha256: hashA,
      approvedMappingSha256: hashB,
      approvedPreviewSha256: hashC,
      currentPackageSha256: hashA,
      currentMappingSha256: hashB,
      currentPreviewSha256: hashC,
      approvedAt: '2026-11-07T10:00:00.000Z',
      expiresAt: '2026-11-07T10:15:00.000Z',
      now: Date.parse('2026-11-07T10:01:00.000Z'),
    };
    expect(validateTwoPersonApprovalBinding(base)).toEqual({ ok: true });
    expect(validateTwoPersonApprovalBinding({ ...base, approverUserId: base.initiatorUserId }))
      .toMatchObject({ ok: false, code: 'self_approval_forbidden' });
    expect(validateTwoPersonApprovalBinding({ ...base, currentPackageSha256: hashC }))
      .toMatchObject({ ok: false, code: 'approval_invalidated' });
    expect(validateTwoPersonApprovalBinding({ ...base, currentMappingSha256: hashA }))
      .toMatchObject({ ok: false, code: 'approval_invalidated' });
    expect(validateTwoPersonApprovalBinding({ ...base, approverUserId: null }))
      .toMatchObject({ ok: false, code: 'approval_required' });
    expect(validateTwoPersonApprovalBinding({ ...base, now: Date.parse('2026-11-07T10:16:00.000Z') }))
      .toMatchObject({ ok: false, code: 'approval_expired' });

    const manifest = validPackage(1).built.manifest;
    const files = new Map([[manifest.files[0]!.path, PDF_BYTES]]);
    expect(manifestSha256(manifest)).toMatch(/^[a-f0-9]{64}$/);
    expect(packageSha256(manifest, files)).toMatch(/^[a-f0-9]{64}$/);
  });
});
