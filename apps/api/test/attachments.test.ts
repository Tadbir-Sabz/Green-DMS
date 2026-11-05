import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';

/**
 * تست واحدِ لایهٔ آپلود ضمیمه — بدون DB و بدون MinIO واقعی.
 * ماژول 'minio' ماک می‌شود تا StorageService و سپس AttachmentsService (با ریپوزیتوری
 * ماک) سنجیده شوند: اعتبارسنجی نوع/حجم، محاسبهٔ sha256، نام‌فضای کلید با company_id،
 * پاک‌سازی اورفان هنگام شکستِ ثبت، و دریافتِ URL امضاشده. این همان منطقِ مسیرِ آپلود
 * است؛ round-trip واقعیِ MinIO+Postgres در CI/استقرار با سرویسِ زنده سنجیده می‌شود.
 */

// --- ماک کردن کلاینت minio (پیش از import شدن StorageService) ---
const putObject = vi.fn();
const presignedGetObject = vi.fn();
const removeObject = vi.fn();
const bucketExists = vi.fn();
const makeBucket = vi.fn();
vi.mock('minio', () => ({
  // باید «کلاس» باشد تا new Client(...) کار کند (تابعِ پیکانی constructor ندارد)
  Client: class {
    putObject = putObject;
    presignedGetObject = presignedGetObject;
    removeObject = removeObject;
    bucketExists = bucketExists;
    makeBucket = makeBucket;
  },
}));

import { StorageService } from '../src/modules/attachments/storage.service';
import {
  AttachmentsService,
  MAX_UPLOAD_BYTES,
  type UploadedFile,
} from '../src/modules/attachments/attachments.service';
import {
  checkFileContent,
  detectMimeType,
  extensionOf,
} from '../src/modules/attachments/content-type';

const ENV_KEYS = [
  'MINIO_ENDPOINT',
  'MINIO_ACCESS_KEY',
  'MINIO_SECRET_KEY',
  'MINIO_BUCKET',
  'MINIO_PORT',
  'MINIO_USE_SSL',
  'MINIO_REGION',
];

function setMinioEnv(overrides: Record<string, string> = {}) {
  process.env.MINIO_ENDPOINT = 'minio:9000';
  process.env.MINIO_ACCESS_KEY = 'minioadmin';
  process.env.MINIO_SECRET_KEY = 'minioadmin';
  process.env.MINIO_BUCKET = 'greendms';
  for (const [k, v] of Object.entries(overrides)) process.env[k] = v;
}

// در CI متغیرهای MINIO_* در سطحِ job ست شده‌اند (ci.yml). هر تست باید با محیطِ
// پاک شروع شود، وگرنه تستِ «fail-closed وقتی MINIO_* ست نشده» به‌اشتباه پیکربندیِ
// محیط را می‌بیند و config() را نمی‌اندازد. این beforeEach تست را hermetic می‌کند.
beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe('StorageService — پیکربندی از MINIO_*', () => {
  it('اگر MINIO_* تنظیم نشود، fail-closed با 503', () => {
    const s = new StorageService();
    expect(() => s.config()).toThrow(ServiceUnavailableException);
  });

  it('endpoint «host:port» را درست تجزیه می‌کند', () => {
    setMinioEnv();
    const c = new StorageService().config();
    expect(c).toMatchObject({
      endPoint: 'minio',
      port: 9000,
      useSSL: false,
      accessKey: 'minioadmin',
      secretKey: 'minioadmin',
      bucket: 'greendms',
    });
  });

  it('پورت 443 → useSSL=true', () => {
    setMinioEnv({ MINIO_ENDPOINT: 's3.example.com:443' });
    expect(new StorageService().config().useSSL).toBe(true);
  });

  it('MINIO_BUCKET خالی → پیش‌فرض greendms', () => {
    setMinioEnv({ MINIO_BUCKET: '' });
    expect(new StorageService().config().bucket).toBe('greendms');
  });
});

describe('StorageService — واگذاری به کلاینت minio', () => {
  beforeEach(() => {
    putObject.mockReset();
    presignedGetObject.mockReset();
    removeObject.mockReset();
    bucketExists.mockReset();
    makeBucket.mockReset();
    bucketExists.mockResolvedValue(true); // پیش‌فرض: bucket از قبل هست
    setMinioEnv();
  });

  it('put → putObject با bucket/key/size و Content-Type', async () => {
    putObject.mockResolvedValue({ etag: 'x' });
    await new StorageService().put('co/pod/id/abc.png', Buffer.from('hi'), 'image/png');
    expect(putObject).toHaveBeenCalledWith(
      'greendms',
      'co/pod/id/abc.png',
      expect.any(Buffer),
      2,
      { 'Content-Type': 'image/png' },
    );
  });

  it('اگر bucket نباشد، put آن را می‌سازد (خودکفا برای CI/استقرار)', async () => {
    bucketExists.mockResolvedValue(false);
    makeBucket.mockResolvedValue(undefined);
    putObject.mockResolvedValue({ etag: 'x' });
    await new StorageService().put('k', Buffer.from('hi'), 'image/png');
    expect(makeBucket).toHaveBeenCalledWith('greendms', '');
    expect(putObject).toHaveBeenCalled();
  });

  it('presignedGet → presignedGetObject با ttl', async () => {
    presignedGetObject.mockResolvedValue('https://signed/url');
    const url = await new StorageService().presignedGet('k', 120);
    expect(url).toBe('https://signed/url');
    expect(presignedGetObject).toHaveBeenCalledWith('greendms', 'k', 120);
  });

  it('remove → removeObject', async () => {
    removeObject.mockResolvedValue(undefined);
    await new StorageService().remove('k');
    expect(removeObject).toHaveBeenCalledWith('greendms', 'k');
  });
});

// --- ابزار ساخت سرویس با وابستگی‌های ماک ---
interface MockStorage {
  put: ReturnType<typeof vi.fn>;
  presignedGet: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}
function makeStorage(): MockStorage {
  return {
    put: vi.fn().mockResolvedValue(undefined),
    presignedGet: vi.fn().mockResolvedValue('https://signed/download'),
    remove: vi.fn().mockResolvedValue(undefined),
  };
}
function makeRepo(
  insert = vi.fn(),
  // پیش‌فرض: مالکِ ضمیمه به همان شرکتِ نشست تعلق دارد (تست‌هایِ موجود دربارهٔ مالکیت نیستند).
  // سناریوهایِ مالکیت در attachment-owner-scope.test.ts با مقدارِ دیگرِ همین پارامتر سنجیده می‌شوند.
  resolveOwnerCompany = vi.fn().mockResolvedValue(COMPANY),
) {
  return {
    insert,
    findByIdInCompany: vi.fn(),
    listByOwner: vi.fn().mockResolvedValue([]),
    resolveOwnerCompany,
  };
}
const COMPANY = '11111111-1111-4111-8111-111111111111';
const OWNER = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const ctx = { userId: USER, companyId: COMPANY };

/**
 * امضاهایِ بایتیِ «واقعی» برای هر نوعِ مجاز. از آنجا که سرویس اکنون محتوایِ فایل را
 * با magic bytes راستی‌آزمایی می‌کند، fixtureها باید محتوایی بسازند که با نوعِ اعلامی
 * بخواند — وگرنه تستِ مسیرِ موفق به‌اشتباه همان چیزی می‌شود که باید رد شود.
 */
const SIGNATURES: Record<string, Buffer> = {
  'image/jpeg': Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  'image/png': (() => {
    const b = Buffer.alloc(33);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
    b.writeUInt32BE(13, 8); // طولِ chunk
    b.write('IHDR', 12, 'latin1');
    b.writeUInt32BE(1, 16); // width
    b.writeUInt32BE(1, 20); // height
    b[24] = 8; // bit depth
    b[25] = 2; // color type (RGB)
    return b;
  })(),
  'image/webp': (() => {
    const b = Buffer.alloc(20);
    b.write('RIFF', 0, 'latin1');
    b.writeUInt32LE(12, 4);
    b.write('WEBP', 8, 'latin1');
    b.write('VP8 ', 12, 'latin1');
    return b;
  })(),
  'application/pdf': Buffer.from('%PDF-1.7\n', 'latin1'),
};

/** فایلِ «معتبر»: محتوایش با نوعِ اعلامی می‌خواند و ساختارِ حداقلی دارد. */
function fileOf(bytes = 64, mimetype = 'image/jpeg', originalname = 'pod/shot.jpg'): UploadedFile {
  const sig = SIGNATURES[mimetype] ?? Buffer.alloc(0);
  const buffer = Buffer.alloc(Math.max(bytes, sig.length), 7);
  sig.copy(buffer, 0);
  return { originalname, mimetype, buffer, size: buffer.length };
}

/** فایلِ «خام»: بایت‌هایِ دلخواه با نوعِ اعلامیِ دلخواه — برای تست‌هایِ منفی و جعلِ MIME. */
function rawFileOf(buffer: Buffer, mimetype: string, originalname: string): UploadedFile {
  return { originalname, mimetype, buffer, size: buffer.length };
}

describe('AttachmentsService.upload', () => {
  it('فایل خالی/ناموجود → 400', async () => {
    const svc = new AttachmentsService(makeStorage() as never, makeRepo() as never);
    await expect(svc.upload(undefined, { owner_type: 'pod', owner_id: OWNER }, ctx)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('حجم بیش از سقف → 413', async () => {
    const svc = new AttachmentsService(makeStorage() as never, makeRepo() as never);
    await expect(
      svc.upload(fileOf(MAX_UPLOAD_BYTES + 1), { owner_type: 'pod', owner_id: OWNER }, ctx),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
  });

  it('نوعِ غیرمجاز → 415', async () => {
    const svc = new AttachmentsService(makeStorage() as never, makeRepo() as never);
    await expect(
      svc.upload(fileOf(10, 'application/x-msdownload'), { owner_type: 'pod', owner_id: OWNER }, ctx),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
  });

  it('مسیرِ موفق: put با کلیدِ نام‌فضاشده + insert با sha256 + بازگرداندنِ view با url', async () => {
    const storage = makeStorage();
    const insert = vi.fn().mockResolvedValue({
      id: '99999999-9999-4999-8999-999999999999',
      company_id: COMPANY,
      owner_type: 'pod',
      owner_id: OWNER,
      file_name: 'pod_shot.jpg',
      content_type: 'image/jpeg',
      size_bytes: 12,
      storage_key: 'k',
      sha256: 'deadbeef',
      uploaded_by: USER,
      created_at: new Date('2026-01-01T00:00:00Z'),
    });
    const svc = new AttachmentsService(storage as never, makeRepo(insert) as never);

    const view = await svc.upload(fileOf(12, 'image/jpeg', 'pod/shot.jpg'), { owner_type: 'pod', owner_id: OWNER }, ctx);

    // کلید با company_id/owner_type/owner_id نام‌فضا شده و sha256 و نامِ پاک‌سازی‌شده دارد
    const [key, body, ctype] = storage.put.mock.calls[0];
    expect(key).toContain(`${COMPANY}/pod/${OWNER}/`);
    expect(key.endsWith('pod_shot.jpg')).toBe(true); // «/» در نام به «_» تبدیل شد
    expect(ctype).toBe('image/jpeg');
    expect(Buffer.isBuffer(body)).toBe(true);

    // sha256ِ واقعیِ محتوا محاسبه و به ریپوزیتوری داده شد
    expect(insert).toHaveBeenCalledTimes(1);
    const arg = insert.mock.calls[0][0];
    expect(arg.company_id).toBe(COMPANY);
    expect(arg.uploaded_by).toBe(USER);
    expect(arg.size_bytes).toBe(12);
    expect(arg.sha256).toMatch(/^[0-9a-f]{64}$/);

    expect(view.url).toBe('https://signed/download');
    expect(view.created_at).toBe('2026-01-01T00:00:00.000Z');
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('شکستِ ثبت در DB → شیءِ آپلودشده پاک می‌شود (بدون اورفان) و خطا بالا می‌رود', async () => {
    const storage = makeStorage();
    const insert = vi.fn().mockRejectedValue(new Error('db down'));
    const svc = new AttachmentsService(storage as never, makeRepo(insert) as never);
    await expect(
      svc.upload(fileOf(12), { owner_type: 'invoice', owner_id: OWNER }, ctx),
    ).rejects.toThrow('db down');
    expect(storage.remove).toHaveBeenCalledTimes(1);
  });
});

describe('AttachmentsService.downloadUrl', () => {
  it('id نامعتبر → 404 (نه 400، تا وجود لو نرود)', async () => {
    const svc = new AttachmentsService(makeStorage() as never, makeRepo() as never);
    await expect(svc.downloadUrl('not-a-uuid', ctx)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('ضمیمهٔ خارج از دامنهٔ شرکت یافت نشد → 404', async () => {
    const repo = makeRepo();
    repo.findByIdInCompany.mockResolvedValue(null);
    const svc = new AttachmentsService(makeStorage() as never, repo as never);
    await expect(svc.downloadUrl(OWNER, ctx)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('یافت شد → presignedGet با storage_key و {url, expires_in}', async () => {
    const storage = makeStorage();
    const repo = makeRepo();
    // سطرِ ضمیمه باید owner_type/owner_id داشته باشد: از 0042 به بعد سرویس پیش از صدورِ
    // URL امضاشده، زنجیرهٔ مالکیتِ همان owner را دوباره اثبات می‌کند (دسترسیِ غیرمستقیم).
    repo.findByIdInCompany.mockResolvedValue({
      id: OWNER,
      storage_key: 'co/pod/x/f.jpg',
      owner_type: 'pod',
      owner_id: OWNER,
    });
    const svc = new AttachmentsService(storage as never, repo as never);
    const res = await svc.downloadUrl(OWNER, ctx);
    expect(repo.findByIdInCompany).toHaveBeenCalledWith(OWNER, COMPANY);
    expect(storage.presignedGet).toHaveBeenCalledWith('co/pod/x/f.jpg', expect.any(Number));
    expect(res.url).toBe('https://signed/download');
    expect(res.expires_in).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ *
 * اعتبارسنجیِ «محتوایِ واقعی» فایل (magic bytes) — P0 امنیتی
 * پیش از این فقط mimetype اعلامیِ کلاینت سنجیده می‌شد؛ یعنی هر بایتِ دلخواهی
 * با ادعایِ image/png پذیرفته می‌شد. این تست‌ها اثبات می‌کنند که اکنون
 * (۱) محتوایِ واقعی تشخیص داده می‌شود، (۲) جعلِ MIME رد می‌شود،
 * (۳) پسوندِ ناسازگار رد می‌شود، (۴) فایلِ مخدوش رد می‌شود،
 * و (۵) در همهٔ حالت‌هایِ رد، چیزی در استوریج/DB نوشته نمی‌شود.
 * ------------------------------------------------------------------ */

/** بایت‌هایِ کامل‌شده تا از حداقلِ طولِ تشخیص (۱۲ بایت) عبور کند. */
function paddedSignature(mime: string, total = 64): Buffer {
  const sig = SIGNATURES[mime];
  const b = Buffer.alloc(Math.max(total, sig.length), 7);
  sig.copy(b, 0);
  return b;
}

function code(err: unknown): string {
  const res = (err as { getResponse?: () => unknown }).getResponse?.();
  return (res as { code?: string })?.code ?? '';
}

describe('content-type — تشخیصِ نوع از رویِ بایت‌ها', () => {
  it('امضایِ واقعیِ هر چهار نوعِ مجاز را درست تشخیص می‌دهد', () => {
    expect(detectMimeType(paddedSignature('image/jpeg'))).toBe('image/jpeg');
    expect(detectMimeType(paddedSignature('image/png'))).toBe('image/png');
    expect(detectMimeType(paddedSignature('image/webp'))).toBe('image/webp');
    expect(detectMimeType(paddedSignature('application/pdf'))).toBe('application/pdf');
  });

  it('برای محتواهایِ غیرتصویری/متنی null برمی‌گرداند', () => {
    expect(detectMimeType(Buffer.from('<!doctype html><script>alert(1)</script>', 'latin1'))).toBeNull();
    expect(detectMimeType(Buffer.from('<?php system($_GET["c"]); ?>', 'latin1'))).toBeNull();
    expect(detectMimeType(Buffer.alloc(64, 0))).toBeNull();
    expect(detectMimeType(Buffer.alloc(4, 1))).toBeNull(); // کوتاه‌تر از حداقل
  });

  it('پسوندِ نامِ فایل را نرمال می‌کند', () => {
    expect(extensionOf('POD.JPG')).toBe('jpg');
    expect(extensionOf('a/b/c.pdf')).toBe('pdf');
    expect(extensionOf('noext')).toBeNull();
    expect(extensionOf('trailing.')).toBeNull();
  });

  it('نوعِ بدونِ امضایِ قابلِ راستی‌آزمایی → fail-closed (unverifiable)', () => {
    for (const mime of ['image/gif', 'text/csv', 'application/octet-stream', 'image/svg+xml']) {
      const r = checkFileContent(paddedSignature('image/png'), mime, 'f.bin');
      expect(r.ok).toBe(false);
      expect(r.reason).toBe('unverifiable_content_type');
    }
  });

  it('فایلِ مخدوش/بریده با امضایِ PNG → malformed_content', () => {
    const truncated = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const r = checkFileContent(truncated, 'image/png', 'a.png');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('malformed_content');
  });

  it('RIFF/WEBP با fourCC ناشناخته → malformed_content', () => {
    const b = Buffer.alloc(20);
    b.write('RIFF', 0, 'latin1');
    b.write('WEBP', 8, 'latin1');
    b.write('ZZZZ', 12, 'latin1');
    const r = checkFileContent(b, 'image/webp', 'a.webp');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('malformed_content');
  });

  it('پسوندِ ناسازگار با محتوایِ واقعی → extension_mismatch', () => {
    const r = checkFileContent(paddedSignature('image/png'), 'image/png', 'invoice.exe');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('extension_mismatch');
    expect(r.detected).toBe('image/png');
    expect(r.expectedExtensions).toEqual(['png']);
  });

  it('نبودِ پسوند در نامِ فایل خطا نیست', () => {
    expect(checkFileContent(paddedSignature('image/png'), 'image/png', 'noext').ok).toBe(true);
  });

  it('محتوایِ JPEG با ادعایِ image/png → content_type_mismatch', () => {
    const r = checkFileContent(paddedSignature('image/jpeg'), 'image/png', 'a.png');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('content_type_mismatch');
    expect(r.detected).toBe('image/jpeg');
  });
});

describe('AttachmentsService.upload — ردِ محتوایِ جعلی/ناسازگار', () => {
  function svc() {
    const storage = makeStorage();
    const insert = vi.fn();
    const repo = makeRepo(insert);
    const service = new AttachmentsService(storage as never, repo as never);
    return { service, storage, insert };
  }

  it('محمولهٔ HTML با ادعایِ image/png → 415 و چیزی ذخیره نمی‌شود', async () => {
    const { service, storage, insert } = svc();
    const html = Buffer.from('<!doctype html><script>steal()</script>', 'latin1');
    let err: unknown;
    try {
      await service.upload(rawFileOf(html, 'image/png', 'pod.png'), { owner_type: 'pod', owner_id: OWNER }, ctx);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(UnsupportedMediaTypeException);
    expect(code(err)).toBe('content_type_mismatch');
    expect(storage.put).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('کدِ PHP با ادعایِ application/pdf → 415', async () => {
    const { service, storage } = svc();
    const php = Buffer.concat([
      Buffer.from('<?php system($_GET["c"]); ?>', 'latin1'),
      Buffer.alloc(64, 7),
    ]);
    await expect(
      service.upload(rawFileOf(php, 'application/pdf', 'doc.pdf'), { owner_type: 'pod', owner_id: OWNER }, ctx),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('فایلِ اجراییِ ویندوز (MZ) با ادعایِ image/jpeg → 415 و در لاگ نشانهٔ خطر ثبت می‌شود', async () => {
    const { service } = svc();
    const exe = Buffer.concat([Buffer.from('MZ', 'latin1'), Buffer.alloc(64, 0)]);
    let err: unknown;
    try {
      await service.upload(rawFileOf(exe, 'image/jpeg', 'shot.jpg'), { owner_type: 'pod', owner_id: OWNER }, ctx);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(UnsupportedMediaTypeException);
    expect(code(err)).toBe('content_type_mismatch');
  });

  it('پسوندِ ناسازگار (محتوایِ PNG با نامِ .jpg) → 400', async () => {
    const { service, storage } = svc();
    let err: unknown;
    try {
      await service.upload(
        rawFileOf(paddedSignature('image/png'), 'image/png', 'shot.jpg'),
        { owner_type: 'pod', owner_id: OWNER },
        ctx,
      );
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(BadRequestException);
    expect(code(err)).toBe('extension_mismatch');
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('PNG بریده/مخدوش → 400 malformed_content', async () => {
    const { service } = svc();
    const truncated = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    let err: unknown;
    try {
      await service.upload(rawFileOf(truncated, 'image/png', 'a.png'), { owner_type: 'pod', owner_id: OWNER }, ctx);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(BadRequestException);
    expect(code(err)).toBe('malformed_content');
  });

  it('مسیرِ موفق برای هر چهار نوع: نوعِ «راستی‌آزمایی‌شده» ذخیره می‌شود، نه ادعایِ کلاینت', async () => {
    const cases: Array<[string, string]> = [
      ['image/jpeg', 'shot.jpg'],
      ['image/png', 'shot.png'],
      ['image/webp', 'shot.webp'],
      ['application/pdf', 'doc.pdf'],
    ];
    for (const [mime, name] of cases) {
      setMinioEnv();
      const storage = makeStorage();
      const insert = vi.fn().mockResolvedValue({
        id: '99999999-9999-4999-8999-999999999999',
        company_id: COMPANY,
        owner_type: 'pod',
        owner_id: OWNER,
        file_name: name,
        content_type: mime,
        size_bytes: 64,
        storage_key: 'k',
        sha256: 'deadbeef',
        uploaded_by: USER,
        created_at: new Date('2026-01-01T00:00:00Z'),
      });
      const service = new AttachmentsService(storage as never, makeRepo(insert) as never);

      const view = await service.upload(fileOf(64, mime, name), { owner_type: 'pod', owner_id: OWNER }, ctx);

      const [, , storedCtype] = storage.put.mock.calls[0];
      expect(storedCtype).toBe(mime); // نوعِ تشخیص‌داده‌شده از رویِ بایت‌ها
      expect(insert.mock.calls[0][0].content_type).toBe(mime);
      expect(view.content_type).toBe(mime);
    }
  });
});
