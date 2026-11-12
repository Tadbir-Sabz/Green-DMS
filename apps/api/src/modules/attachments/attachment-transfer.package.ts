import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { posix } from 'node:path';
import {
  SAFE_FILE_NAME_RE,
  SAFE_PATH_RE,
  SHA256_RE,
  TRANSFER_MAX_COMPRESSION_RATIO,
  TRANSFER_MAX_FILES,
  TRANSFER_MAX_MANIFEST_BYTES,
  TRANSFER_MAX_PACKAGE_BYTES,
  TRANSFER_MAX_SINGLE_FILE_BYTES,
  TRANSFER_MAX_UNCOMPRESSED_BYTES,
  TRANSFER_SCHEMA,
  TransferChecksums,
  findForbiddenClientFields,
  TransferFileInput,
  TransferManifest,
  TransferManifestFile,
  TransferPackageError,
  buildSafePath,
  canonicalJson,
  isTransferOwnerType,
  isUuid,
  manifestSha256,
  packageSha256,
  safeExtensionFor,
  secureHexEqual,
  sha256Hex,
  validateTransferBytes,
} from './attachment-transfer.rules';
import { VERIFIABLE_MIME_TYPES } from './content-type';

/**
 * بستهٔ ZIP کنترلشدهٔ ضمائم — فقط `manifest.json`، `checksums.json` و مسیرهای
 * سرورساختهٔ `files/NNNN-<sha12>.<ext>` دارد. خواندن بسته هیچ فایلی روی دیسک
 * استخراج نمیکند، مسیرها/حجمها/نسبت فشردهسازی/CRC/امضای بایتی/SHA-256 را
 * پیش از پذیرش بررسی میکند و بستههای ZIP64/رمزگذاریشده/همپوشان/لینک نمادین
 * را fail-closed رد میکند. هیچ وابستگی تازهای به کتابخانهٔ خارجی اضافه نشد.
 */

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const ZIP64_LOCATOR_SIG = 0x07064b50;
const UTF8_FLAG = 0x0800;
const ENCRYPTED_FLAG = 0x0001;
const STRONG_ENCRYPTION_FLAG = 0x0040;
const MASKED_HEADER_FLAG = 0x2000;
const DATA_DESCRIPTOR_FLAG = 0x0008;
const DIRECTORY_FLAG = 0x0010;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipEntryInput {
  name: string;
  data: Buffer;
  /** فقط برای تست ایمنی فشردهسازی؛ بستههای تولیدی همیشه store-only هستند. */
  method?: 0 | 8;
}

interface ZipEntryOutput {
  name: string;
  data: Buffer;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
}

function assertSafeEntryName(nameBytes: Buffer, flags: number): string {
  if ((flags & UTF8_FLAG) === 0) {
    throw new TransferPackageError('zip_encoding_unsupported', 'نام ورودیهای بسته باید UTF-8 باشد.');
  }
  const name = nameBytes.toString('utf8');
  if (!Buffer.from(name, 'utf8').equals(nameBytes)) {
    throw new TransferPackageError('malformed_archive', 'نام ورودی بسته UTF-8 معتبر نیست.');
  }
  if (name.length === 0 || name.length > 240) {
    throw new TransferPackageError('malformed_archive', 'نام ورودی بسته نامعتبر است.');
  }
  if (
    name.includes('\u0000') ||
    name.includes('\\') ||
    name.startsWith('/') ||
    name.includes('//') ||
    name.endsWith('/') ||
    posix.normalize(name) !== name ||
    name.split('/').some((part) => part === '..' || part === '.' || part === '') ||
    /[\u0000-\u001f\u007f]/.test(name)
  ) {
    throw new TransferPackageError('path_traversal_rejected', 'مسیر ورودی بسته ناامن است.', { path: name });
  }
  const allowed =
    name === 'manifest.json' || name === 'checksums.json' || SAFE_PATH_RE.test(name);
  if (!allowed) {
    throw new TransferPackageError('unexpected_archive_entry', 'ورودی غیرمجاز در بسته وجود دارد.', { path: name });
  }
  return name;
}

function readExtraForZip64(extra: Buffer): void {
  let offset = 0;
  while (offset + 4 <= extra.length) {
    const id = extra.readUInt16LE(offset);
    const size = extra.readUInt16LE(offset + 2);
    if (offset + 4 + size > extra.length) {
      throw new TransferPackageError('malformed_archive', 'فیلد اضافی ZIP ناقص است.');
    }
    if (id === 0x0001) {
      throw new TransferPackageError('zip64_rejected', 'بستههای ZIP64 پشتیبانی نمیشوند.');
    }
    offset += 4 + size;
  }
}

/** ساخت ZIP سادهٔ store-only، قابلخواندن توسط ابزارهای استاندارد. */
function writeZip(entries: readonly ZipEntryInput[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  let centralSize = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = entry.data;
    const method = entry.method ?? 0;
    const stored = method === 8 ? deflateRawSync(data) : data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_SIG, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(UTF8_FLAG, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, stored);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_SIG, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(UTF8_FLAG, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(stored.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    centralSize += central.length + name.length;
    offset += local.length + name.length + stored.length;
  }
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIG, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

/** خواندن امن ZIP (store/deflate) بدون استخراج روی دیسک و بدون کتابخانهٔ خارجی. */
function readZip(zip: Buffer): Map<string, ZipEntryOutput> {
  if (!Buffer.isBuffer(zip) || zip.length === 0 || zip.length > TRANSFER_MAX_PACKAGE_BYTES) {
    throw new TransferPackageError('invalid_package_size', 'اندازهٔ بسته نامعتبر یا بیش از سقف مجاز است.');
  }
  let eocd = -1;
  const min = Math.max(0, zip.length - 22 - 65535);
  for (let i = zip.length - 22; i >= min; i -= 1) {
    if (zip.readUInt32LE(i) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) throw new TransferPackageError('malformed_archive', 'پایان فهرست مرکزی ZIP یافت نشد.');
  if (eocd >= 20 && zip.readUInt32LE(eocd - 20) === ZIP64_LOCATOR_SIG) {
    throw new TransferPackageError('zip64_rejected', 'بستههای ZIP64 پشتیبانی نمیشوند.');
  }
  const diskNo = zip.readUInt16LE(eocd + 4);
  const cdDisk = zip.readUInt16LE(eocd + 6);
  const entriesOnDisk = zip.readUInt16LE(eocd + 8);
  const totalEntries = zip.readUInt16LE(eocd + 10);
  const cdSize = zip.readUInt32LE(eocd + 12);
  const cdOffset = zip.readUInt32LE(eocd + 16);
  const commentLength = zip.readUInt16LE(eocd + 20);
  if (diskNo !== 0 || cdDisk !== 0 || entriesOnDisk !== totalEntries || eocd + 22 + commentLength !== zip.length) {
    throw new TransferPackageError('multidisk_zip_rejected', 'بستهٔ چنددیسکی یا ناقص پشتیبانی نمیشود.');
  }
  if (totalEntries === 0xffff || totalEntries > TRANSFER_MAX_FILES + 2) {
    throw new TransferPackageError('too_many_entries', 'تعداد ورودیهای بسته بیش از سقف مجاز است.');
  }
  if (cdOffset > eocd || cdSize > eocd - cdOffset || cdOffset + 46 > eocd) {
    throw new TransferPackageError('malformed_archive', 'فهرست مرکزی ZIP نامعتبر است.');
  }

  const result = new Map<string, ZipEntryOutput>();
  let cursor = cdOffset;
  let totalUncompressed = 0;
  for (let n = 0; n < totalEntries; n += 1) {
    if (cursor + 46 > cdOffset + cdSize) throw new TransferPackageError('malformed_archive', 'فهرست مرکزی ZIP ناقص است.');
    if (zip.readUInt32LE(cursor) !== CENTRAL_SIG) throw new TransferPackageError('malformed_archive', 'امضای ورودی مرکزی ZIP نامعتبر است.');
    const flags = zip.readUInt16LE(cursor + 8);
    const method = zip.readUInt16LE(cursor + 10);
    const expectedCrc = zip.readUInt32LE(cursor + 16);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const uncompressedSize = zip.readUInt32LE(cursor + 24);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const diskStart = zip.readUInt16LE(cursor + 34);
    const externalAttrs = zip.readUInt32LE(cursor + 38);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const entryEnd = cursor + 46 + nameLength + extraLength + commentLength;
    if (entryEnd > cdOffset + cdSize) throw new TransferPackageError('malformed_archive', 'ورودی مرکزی ZIP ناقص است.');
    if (diskStart !== 0) throw new TransferPackageError('multidisk_zip_rejected', 'بستهٔ چنددیسکی پشتیبانی نمیشود.');
    if (
      (flags & ENCRYPTED_FLAG) !== 0 ||
      (flags & STRONG_ENCRYPTION_FLAG) !== 0 ||
      (flags & MASKED_HEADER_FLAG) !== 0
    ) {
      throw new TransferPackageError('encrypted_zip_rejected', 'بستهٔ رمزگذاریشده پشتیبانی نمیشود.');
    }
    if (method !== 0 && method !== 8) {
      throw new TransferPackageError('compression_method_rejected', 'روش فشردهسازی بسته پشتیبانی نمیشود.');
    }
    if (uncompressedSize > TRANSFER_MAX_SINGLE_FILE_BYTES || compressedSize > TRANSFER_MAX_PACKAGE_BYTES) {
      throw new TransferPackageError('file_too_large', 'یکی از فایلهای بسته بیش از سقف مجاز است.');
    }
    if (compressedSize > 0 && uncompressedSize / Math.max(compressedSize, 1) > TRANSFER_MAX_COMPRESSION_RATIO) {
      throw new TransferPackageError('decompression_bomb_rejected', 'نسبت فشردهسازی بسته ناامن است.');
    }
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > TRANSFER_MAX_UNCOMPRESSED_BYTES) {
      throw new TransferPackageError('decompression_bomb_rejected', 'حجم بازشدهٔ بسته بیش از سقف مجاز است.');
    }
    if ((externalAttrs & DIRECTORY_FLAG) !== 0) {
      throw new TransferPackageError('unexpected_archive_entry', 'پوشه یا لینک نمادین در بسته مجاز نیست.');
    }
    const mode = (externalAttrs >>> 16) & 0xffff;
    if (mode !== 0 && (mode & 0o170000) === 0o120000) {
      throw new TransferPackageError('unexpected_archive_entry', 'لینک نمادین در بسته مجاز نیست.');
    }
    const nameBytes = zip.subarray(cursor + 46, cursor + 46 + nameLength);
    const name = assertSafeEntryName(nameBytes, flags);
    readExtraForZip64(zip.subarray(cursor + 46 + nameLength, cursor + 46 + nameLength + extraLength));
    if (result.has(name)) throw new TransferPackageError('duplicate_archive_entry', 'ورودی تکراری در بسته وجود دارد.', { path: name });
    if (localOffset + 30 > zip.length || zip.readUInt32LE(localOffset) !== LOCAL_SIG) {
      throw new TransferPackageError('malformed_archive', 'سرآیند محلی ZIP نامعتبر است.');
    }
    const localFlags = zip.readUInt16LE(localOffset + 6);
    const localMethod = zip.readUInt16LE(localOffset + 8);
    const localNameLength = zip.readUInt16LE(localOffset + 26);
    const localExtraLength = zip.readUInt16LE(localOffset + 28);
    if (localMethod !== method || (localFlags & ~DATA_DESCRIPTOR_FLAG) !== (flags & ~DATA_DESCRIPTOR_FLAG)) {
      throw new TransferPackageError('malformed_archive', 'سرآیند محلی با فهرست مرکزی همخوانی ندارد.');
    }
    const localName = zip.subarray(localOffset + 30, localOffset + 30 + localNameLength);
    if (!localName.equals(nameBytes)) throw new TransferPackageError('malformed_archive', 'نام سرآیند محلی ZIP همخوانی ندارد.');
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataStart > zip.length || dataEnd > zip.length || dataEnd <= dataStart) {
      throw new TransferPackageError('malformed_archive', 'بازهٔ دادهٔ فایل ZIP نامعتبر است.');
    }
    const compressed = zip.subarray(dataStart, dataEnd);
    let data: Buffer;
    if (method === 0) {
      if (compressedSize !== uncompressedSize) throw new TransferPackageError('malformed_archive', 'اندازهٔ فایل ذخیرهشده ناسازگار است.');
      data = Buffer.from(compressed);
    } else {
      if (compressedSize === 0) throw new TransferPackageError('malformed_archive', 'دادهٔ فشردهشده خالی است.');
      try {
        data = inflateRawSync(compressed, { maxOutputLength: uncompressedSize + 1 } as never);
      } catch {
        throw new TransferPackageError('malformed_archive', 'بازکردن فایل فشردهشده ممکن نیست.');
      }
    }
    if (data.length !== uncompressedSize) throw new TransferPackageError('malformed_archive', 'اندازهٔ بازشدهٔ فایل ناسازگار است.');
    if (crc32(data) !== expectedCrc) throw new TransferPackageError('crc_mismatch', 'جمعکنترل CRC ورودی بسته همخوانی ندارد.', { path: name });
    result.set(name, { name, data, crc32: expectedCrc, compressedSize, uncompressedSize });
    cursor = entryEnd;
  }
  if (cursor > cdOffset + cdSize) throw new TransferPackageError('malformed_archive', 'فهرست مرکزی ZIP اضافهداده دارد.');
  return result;
}

function parseStrictJson(buf: Buffer, label: string): Record<string, unknown> {
  if (buf.length > TRANSFER_MAX_MANIFEST_BYTES) {
    throw new TransferPackageError('manifest_too_large', `${label} بیش از سقف مجاز است.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(buf.toString('utf8')) as unknown;
  } catch {
    throw new TransferPackageError('malformed_manifest', `${label} JSON معتبر نیست.`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TransferPackageError('malformed_manifest', `${label} باید شیء JSON باشد.`);
  }
  return parsed as Record<string, unknown>;
}

function assertExactKeys(obj: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(obj).sort();
  const want = [...expected].sort();
  if (actual.length !== want.length || actual.some((k, i) => k !== want[i])) {
    throw new TransferPackageError('unsupported_manifest_field', `${label} دارای فیلد ناشناخته یا کمبود فیلد است.`);
  }
}

function positiveInt(value: unknown, max: number, code: string, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) {
    throw new TransferPackageError(code, `${label} نامعتبر است.`);
  }
  return value;
}

function isoString(value: unknown, label: string): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new TransferPackageError('malformed_manifest', `${label} تاریخ معتبری نیست.`);
  }
  return value;
}

function parseManifest(raw: Record<string, unknown>): TransferManifest {
  assertExactKeys(raw, [
    'schema', 'operation_id', 'created_at', 'entity_types', 'file_count', 'total_bytes', 'files',
  ], 'manifest');
  if (raw.schema !== TRANSFER_SCHEMA) throw new TransferPackageError('unsupported_package_schema', 'نسخهٔ بسته پشتیبانی نمیشود.');
  if (!isUuid(raw.operation_id)) throw new TransferPackageError('malformed_manifest', 'شناسهٔ عملیات بسته نامعتبر است.');
  const createdAt = isoString(raw.created_at, 'زمان ایجاد بسته');
  if (!Array.isArray(raw.entity_types) || raw.entity_types.length === 0 || raw.entity_types.length > 8) {
    throw new TransferPackageError('malformed_manifest', 'فهرست انواع موجودیت بسته نامعتبر است.');
  }
  const entityTypes = raw.entity_types.map((t) => {
    if (!isTransferOwnerType(t)) throw new TransferPackageError('unsupported_owner_type', 'نوع مالک بسته پشتیبانی نمیشود.', { owner_type: String(t) });
    return t;
  });
  if (new Set(entityTypes).size !== entityTypes.length) {
    throw new TransferPackageError('malformed_manifest', 'نوع موجودیت تکراری در manifest وجود دارد.');
  }
  if (!Array.isArray(raw.files) || raw.files.length === 0 || raw.files.length > TRANSFER_MAX_FILES) {
    throw new TransferPackageError('too_many_entries', 'تعداد فایلهای بسته نامعتبر است.');
  }
  const files: TransferManifestFile[] = raw.files.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new TransferPackageError('malformed_manifest', 'ورودی فایل manifest نامعتبر است.');
    }
    const f = item as Record<string, unknown>;
    assertExactKeys(f, [
      'path', 'attachment_id', 'owner_type', 'owner_id', 'file_name', 'content_type',
      'size_bytes', 'sha256', 'crc32', 'exported_at',
    ], `فایل ${index + 1}`);
    if (typeof f.path !== 'string' || !SAFE_PATH_RE.test(f.path)) {
      throw new TransferPackageError('unsafe_archive_path', 'مسیر فایل بسته ناامن است.', { path: String(f.path) });
    }
    if (!isUuid(f.attachment_id) || !isUuid(f.owner_id)) {
      throw new TransferPackageError('malformed_manifest', 'شناسهٔ ضمیمه یا مالک بسته نامعتبر است.');
    }
    if (!isTransferOwnerType(f.owner_type)) {
      throw new TransferPackageError('unsupported_owner_type', 'نوع مالک بسته پشتیبانی نمیشود.', { owner_type: String(f.owner_type) });
    }
    if (typeof f.file_name !== 'string' || !SAFE_FILE_NAME_RE.test(f.file_name)) {
      throw new TransferPackageError('unsafe_file_name', 'نام فایل ضمیمه نامعتبر است.');
    }
    if (typeof f.content_type !== 'string' || !(VERIFIABLE_MIME_TYPES as readonly string[]).includes(f.content_type.toLowerCase())) {
      throw new TransferPackageError('unsupported_media_type', 'نوع محتوای فایل بسته پشتیبانی نمیشود.');
    }
    const expectedExt = safeExtensionFor(f.content_type);
    if (!expectedExt || !f.path.toLowerCase().endsWith(`.${expectedExt}`)) {
      throw new TransferPackageError('extension_mismatch', 'پسوند مسیر بسته با نوع محتوا همخوانی ندارد.');
    }
    const size = positiveInt(f.size_bytes, TRANSFER_MAX_SINGLE_FILE_BYTES, 'file_too_large', 'اندازهٔ فایل');
    if (size === 0) throw new TransferPackageError('empty_file', 'اندازهٔ فایل بسته صفر است.');
    if (typeof f.sha256 !== 'string' || !SHA256_RE.test(f.sha256)) {
      throw new TransferPackageError('malformed_manifest', 'هش SHA-256 فایل بسته نامعتبر است.');
    }
    if (!f.path.includes(f.sha256.slice(0, 12).toLowerCase())) {
      throw new TransferPackageError('malformed_manifest', 'مسیر بسته با هش فایل همخوانی ندارد.');
    }
    const crc = positiveInt(f.crc32, 0xffffffff, 'malformed_manifest', 'CRC فایل');
    isoString(f.exported_at, 'زمان صدور فایل');
    return {
      path: f.path,
      attachment_id: f.attachment_id,
      owner_type: f.owner_type,
      owner_id: f.owner_id,
      file_name: f.file_name,
      content_type: f.content_type,
      size_bytes: size,
      sha256: f.sha256.toLowerCase(),
      crc32: crc,
      exported_at: f.exported_at as string,
    };
  });
  const paths = files.map((f) => f.path);
  if (new Set(paths).size !== paths.length) throw new TransferPackageError('duplicate_archive_entry', 'مسیر تکراری در manifest وجود دارد.');
  const total = files.reduce((sum, f) => sum + f.size_bytes, 0);
  if (total > TRANSFER_MAX_UNCOMPRESSED_BYTES) throw new TransferPackageError('decompression_bomb_rejected', 'حجم کل فایلها بیش از سقف مجاز است.');
  const fileCount = positiveInt(raw.file_count, TRANSFER_MAX_FILES, 'malformed_manifest', 'تعداد فایلها');
  const totalBytes = positiveInt(raw.total_bytes, TRANSFER_MAX_UNCOMPRESSED_BYTES, 'malformed_manifest', 'حجم کل');
  if (fileCount !== files.length || totalBytes !== total) {
    throw new TransferPackageError('manifest_count_mismatch', 'شمارش یا حجم manifest با فایلها همخوانی ندارد.');
  }
  return {
    schema: TRANSFER_SCHEMA,
    operation_id: raw.operation_id,
    created_at: createdAt,
    entity_types: entityTypes,
    file_count: fileCount,
    total_bytes: totalBytes,
    files,
  };
}

function parseChecksums(raw: Record<string, unknown>, manifest: TransferManifest): TransferChecksums {
  assertExactKeys(raw, ['schema', 'manifest_sha256', 'package_sha256', 'total_bytes', 'file_count'], 'checksums');
  if (raw.schema !== TRANSFER_SCHEMA) throw new TransferPackageError('unsupported_package_schema', 'نسخهٔ فایل جمعکنترل پشتیبانی نمیشود.');
  if (typeof raw.manifest_sha256 !== 'string' || !SHA256_RE.test(raw.manifest_sha256)) {
    throw new TransferPackageError('manifest_checksum_mismatch', 'هش manifest نامعتبر است.');
  }
  if (typeof raw.package_sha256 !== 'string' || !SHA256_RE.test(raw.package_sha256)) {
    throw new TransferPackageError('package_checksum_mismatch', 'هش بسته نامعتبر است.');
  }
  if (raw.total_bytes !== manifest.total_bytes || raw.file_count !== manifest.file_count) {
    throw new TransferPackageError('manifest_count_mismatch', 'جمعکنترلها با manifest همخوانی ندارند.');
  }
  return {
    schema: TRANSFER_SCHEMA,
    manifest_sha256: raw.manifest_sha256.toLowerCase(),
    package_sha256: raw.package_sha256.toLowerCase(),
    total_bytes: manifest.total_bytes,
    file_count: manifest.file_count,
  };
}

export interface TransferPackageInspection {
  manifest: TransferManifest;
  checksums: TransferChecksums;
  files: Map<string, Buffer>;
  manifestSha256: string;
  packageSha256: string;
  totalBytes: number;
}

/** بازرسی کامل بستهٔ آپلودشده؛ هیچ URL/کلید استوریج/توکنی برنمیگرداند. */
export function inspectTransferPackage(zip: Buffer): TransferPackageInspection {
  const entries = readZip(zip);
  const manifestEntry = entries.get('manifest.json');
  const checksumsEntry = entries.get('checksums.json');
  if (!manifestEntry || !checksumsEntry) {
    throw new TransferPackageError('malformed_manifest', 'manifest.json یا checksums.json یافت نشد.');
  }
  const manifestRaw = parseStrictJson(manifestEntry.data, 'manifest.json');
  const checksumsRaw = parseStrictJson(checksumsEntry.data, 'checksums.json');
  const forbidden = [...new Set([
    ...findForbiddenClientFields(manifestRaw),
    ...findForbiddenClientFields(checksumsRaw),
  ])].sort();
  if (forbidden.length > 0) {
    throw new TransferPackageError('forbidden_manifest_field', 'manifest حاوی فیلد مالکیت/اجاره/دامنه/زیرساخت ممنوع است.', {
      fields: forbidden,
    });
  }
  const manifest = parseManifest(manifestRaw);
  const checksums = parseChecksums(checksumsRaw, manifest);
  const expectedPaths = new Set(manifest.files.map((f) => f.path));
  for (const name of entries.keys()) {
    if (name === 'manifest.json' || name === 'checksums.json') continue;
    if (!expectedPaths.has(name)) {
      throw new TransferPackageError('unexpected_archive_entry', 'فایل بستهای خارج از manifest وجود دارد.', { path: name });
    }
  }
  const files = new Map<string, Buffer>();
  for (const f of manifest.files) {
    const entry = entries.get(f.path);
    if (!entry) throw new TransferPackageError('missing_archive_entry', 'فایل اعلامشده در manifest در بسته نیست.', { path: f.path });
    validateTransferBytes(entry.data, f.content_type, f.file_name, f.sha256);
    if (entry.data.length !== f.size_bytes || crc32(entry.data) !== f.crc32) {
      throw new TransferPackageError('crc_mismatch', 'اندازه یا CRC فایل با manifest همخوانی ندارد.', { path: f.path });
    }
    files.set(f.path, entry.data);
  }
  const computedManifest = manifestSha256(manifest);
  const computedPackage = packageSha256(manifest, files);
  if (!secureHexEqual(computedManifest, checksums.manifest_sha256)) {
    throw new TransferPackageError('manifest_checksum_mismatch', 'هش manifest بسته همخوانی ندارد.');
  }
  if (!secureHexEqual(computedPackage, checksums.package_sha256)) {
    throw new TransferPackageError('package_checksum_mismatch', 'هش یکپارچگی بسته همخوانی ندارد.');
  }
  return {
    manifest,
    checksums,
    files,
    manifestSha256: computedManifest,
    packageSha256: computedPackage,
    totalBytes: manifest.total_bytes,
  };
}

export interface BuiltTransferPackage {
  zip: Buffer;
  manifest: TransferManifest;
  checksums: TransferChecksums;
  manifestSha256: string;
  packageSha256: string;
  totalBytes: number;
  estimatedPackageSize: number;
}

/** ساخت بستهٔ صدور با manifest، جمعکنترلها و مسیرهای امن. */
export function buildTransferPackage(input: {
  operationId: string;
  createdAt: string;
  files: readonly TransferFileInput[];
}): BuiltTransferPackage {
  if (!isUuid(input.operationId)) throw new TransferPackageError('invalid_operation_id', 'شناسهٔ عملیات نامعتبر است.');
  if (!Array.isArray(input.files) || input.files.length === 0 || input.files.length > TRANSFER_MAX_FILES) {
    throw new TransferPackageError('too_many_entries', 'تعداد فایلهای صدور نامعتبر است.');
  }
  const files = new Map<string, Buffer>();
  const manifestFiles: TransferManifestFile[] = [];
  let totalBytes = 0;
  input.files.forEach((f, index) => {
    if (!isTransferOwnerType(f.owner_type)) {
      throw new TransferPackageError('unsupported_owner_type', 'نوع مالک صدور پشتیبانی نمیشود.', { owner_type: String(f.owner_type) });
    }
    if (!isUuid(f.attachment_id) || !isUuid(f.owner_id)) {
      throw new TransferPackageError('malformed_manifest', 'شناسهٔ ضمیمه یا مالک صدور نامعتبر است.');
    }
    validateTransferBytes(f.bytes, f.content_type, f.file_name);
    const sha = sha256Hex(f.bytes);
    const path = buildSafePath(index, sha, f.content_type);
    if (files.has(path)) throw new TransferPackageError('duplicate_archive_entry', 'مسیر تکراری در بسته ساخته شد.');
    files.set(path, f.bytes);
    totalBytes += f.bytes.length;
    manifestFiles.push({
      path,
      attachment_id: f.attachment_id,
      owner_type: f.owner_type,
      owner_id: f.owner_id,
      file_name: f.file_name,
      content_type: f.content_type.toLowerCase(),
      size_bytes: f.bytes.length,
      sha256: sha,
      crc32: crc32(f.bytes),
      exported_at: input.createdAt,
    });
  });
  if (totalBytes > TRANSFER_MAX_UNCOMPRESSED_BYTES) {
    throw new TransferPackageError('decompression_bomb_rejected', 'حجم کل فایلها بیش از سقف مجاز است.');
  }
  const entityTypes = [...new Set(manifestFiles.map((f) => f.owner_type))].sort();
  const manifest: TransferManifest = {
    schema: TRANSFER_SCHEMA,
    operation_id: input.operationId,
    created_at: input.createdAt,
    entity_types: entityTypes,
    file_count: manifestFiles.length,
    total_bytes: totalBytes,
    files: manifestFiles,
  };
  const mSha = manifestSha256(manifest);
  const pSha = packageSha256(manifest, files);
  const checksums: TransferChecksums = {
    schema: TRANSFER_SCHEMA,
    manifest_sha256: mSha,
    package_sha256: pSha,
    total_bytes: totalBytes,
    file_count: manifestFiles.length,
  };
  const zipEntries: ZipEntryInput[] = [
    { name: 'manifest.json', data: Buffer.from(canonicalJson(manifest), 'utf8') },
    { name: 'checksums.json', data: Buffer.from(canonicalJson(checksums), 'utf8') },
    ...[...files.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, data]) => ({ name, data })),
  ];
  const zip = writeZip(zipEntries);
  if (zip.length > TRANSFER_MAX_PACKAGE_BYTES) {
    throw new TransferPackageError('invalid_package_size', 'بستهٔ ساختهشده بیش از سقف مجاز است.');
  }
  return {
    zip,
    manifest,
    checksums,
    manifestSha256: mSha,
    packageSha256: pSha,
    totalBytes,
    estimatedPackageSize: zip.length,
  };
}

/** فقط برای تست: ساخت ZIP خام با ورودی دلخواه (مسیرها همچنان امنسنجی میشوند). */
export function buildRawZipForTest(entries: readonly ZipEntryInput[]): Buffer {
  for (const e of entries) assertSafeEntryName(Buffer.from(e.name, 'utf8'), UTF8_FLAG);
  return writeZip(entries);
}

/** فقط برای تست: امضا/CRC یک ورودی بازشده. */
export function readZipForTest(zip: Buffer): Map<string, ZipEntryOutput> {
  return readZip(zip);
}

export { VERIFIABLE_MIME_TYPES as TRANSFER_ALLOWED_MIME_TYPES };
