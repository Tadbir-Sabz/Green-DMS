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
vi.mock('minio', () => ({
  // باید «کلاس» باشد تا new Client(...) کار کند (تابعِ پیکانی constructor ندارد)
  Client: class {
    putObject = putObject;
    presignedGetObject = presignedGetObject;
    removeObject = removeObject;
  },
}));

import { StorageService } from '../src/modules/attachments/storage.service';
import {
  AttachmentsService,
  MAX_UPLOAD_BYTES,
  type UploadedFile,
} from '../src/modules/attachments/attachments.service';

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
function makeRepo(insert = vi.fn()) {
  return { insert, findByIdInCompany: vi.fn() };
}
const COMPANY = '11111111-1111-4111-8111-111111111111';
const OWNER = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const ctx = { userId: USER, companyId: COMPANY };

function fileOf(bytes: number, mimetype = 'image/jpeg', originalname = 'pod/shot.jpg'): UploadedFile {
  const buffer = Buffer.alloc(bytes, 7);
  return { originalname, mimetype, buffer, size: bytes };
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
    repo.findByIdInCompany.mockResolvedValue({ id: OWNER, storage_key: 'co/pod/x/f.jpg' });
    const svc = new AttachmentsService(storage as never, repo as never);
    const res = await svc.downloadUrl(OWNER, ctx);
    expect(repo.findByIdInCompany).toHaveBeenCalledWith(OWNER, COMPANY);
    expect(storage.presignedGet).toHaveBeenCalledWith('co/pod/x/f.jpg', expect.any(Number));
    expect(res.url).toBe('https://signed/download');
    expect(res.expires_in).toBeGreaterThan(0);
  });
});
