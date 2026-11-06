import { afterEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

/**
 * مالکیتِ ضمیمه — تستِ واحدِ بدونِ DB و بدونِ MinIO.
 *
 * پرسشِ پذیرش: آیا یک کاربر می‌تواند با «حدس زدنِ owner_id» ضمیمه‌ای را به موجودیتِ
 * اجارهٔ دیگر گره بزند، یا از راهِ شناسهٔ ضمیمه/owner به فایلِ اجارهٔ دیگر برسد؟
 * پاسخِ لازم: خیر — و این فایل همان سه نقطهٔ کنترل (آپلود، فهرستِ owner، URL دانلود)
 * را با ریپوزیتوریِ ماک می‌سنجد تا منطقِ مجوز مستقل از زیرساختِ ذخیره‌سازی اثبات شود.
 * round-trip واقعیِ S3 در integration/E2E سنجیده می‌شود (و اکنون به‌دلیلِ نبودِ تصویرِ
 * قابلِ pull، BLOCKED است).
 */
import {
  AttachmentsService,
  type UploadedFile,
} from '../src/modules/attachments/attachments.service';
import {
  KNOWN_OWNER_TYPES,
  VERIFIABLE_OWNER_TYPES,
  allowUnverifiedOwner,
  hasVerifiableOwner,
  ownerTenantSql,
} from '../src/modules/attachments/owner-scope';
import { checkFileContent } from '../src/modules/attachments/content-type';

const COMPANY = '11111111-1111-4111-8111-111111111111';
const FOREIGN = '99999999-9999-4999-8999-999999999999';
const OWNER_ID = '22222222-2222-4222-8222-222222222222';

/** PNG واقعیِ ۳۳ بایتی: امضا + چانکِ IHDR کامل (اعتبارسنجیِ محتوا این را می‌پذیرد). */
function pngBuffer(): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const len = Buffer.from([0x00, 0x00, 0x00, 0x0d]);
  const type = Buffer.from('IHDR', 'ascii');
  const data = Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x01]), // width  = 1
    Buffer.from([0x00, 0x00, 0x00, 0x01]), // height = 1
    Buffer.from([0x08, 0x06, 0x00, 0x00, 0x00]), // depth/color/comp/filter/interlace
  ]);
  const crc = Buffer.from([0x1f, 0x15, 0xc4, 0x89]);
  return Buffer.concat([sig, len, type, data, crc]);
}

const file = (): UploadedFile => ({
  originalname: 'proof.png',
  mimetype: 'image/png',
  buffer: pngBuffer(),
  size: 33,
});

function makeStorage() {
  return {
    put: vi.fn().mockResolvedValue(undefined),
    presignedGet: vi.fn().mockResolvedValue('https://signed.example/x'),
    remove: vi.fn().mockResolvedValue(undefined),
    ensureBucket: vi.fn().mockResolvedValue(undefined),
  };
}

function makeRepo(resolveOwnerCompany: unknown = COMPANY) {
  return {
    insert: vi.fn().mockResolvedValue({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      company_id: COMPANY,
      owner_type: 'pod',
      owner_id: OWNER_ID,
      file_name: 'proof.png',
      content_type: 'image/png',
      size_bytes: 33,
      storage_key: `${COMPANY}/pod/${OWNER_ID}/x.png`,
      sha256: 'deadbeef',
      uploaded_by: null,
      created_at: new Date('2026-01-01T00:00:00Z'),
    }),
    findByIdInCompany: vi.fn(),
    listByOwner: vi.fn().mockResolvedValue([]),
    resolveOwnerCompany:
      typeof resolveOwnerCompany === 'function'
        ? (resolveOwnerCompany as ReturnType<typeof vi.fn>)
        : vi.fn().mockResolvedValue(resolveOwnerCompany as string | null),
  };
}

const ctx = { userId: 'u-1', companyId: COMPANY };

afterEach(() => {
  delete process.env.ATTACHMENT_ALLOW_UNVERIFIED_OWNER;
});

describe('نگاشتِ مالکیت: از enumِ قرارداد تا مسیرِ راستی‌آزمایی‌شده در DB', () => {
  it('همهٔ انواعِ مالکِ قرارداد شناخته‌شده‌اند و فقط `other` راستی‌آزمایی‌ناپذیر است', () => {
    expect(KNOWN_OWNER_TYPES).toEqual(
      expect.arrayContaining([
        'pod',
        'invoice',
        'journal_entry',
        'receipt',
        'return_request',
        'sales_order',
        'product',
        'stock_count',
        'other',
      ]),
    );
    expect(VERIFIABLE_OWNER_TYPES).toHaveLength(8);
    for (const t of VERIFIABLE_OWNER_TYPES) expect(hasVerifiableOwner(t)).toBe(true);
    expect(hasVerifiableOwner('other')).toBe(false);
    expect(hasVerifiableOwner('')).toBe(false);
    expect(hasVerifiableOwner('__proto__')).toBe(false);
  });

  it('pod از راهِ delivery به شعبه و شرکت می‌رسد (pod خودش ستونِ اجاره ندارد)', () => {
    const sql = ownerTenantSql('pod') ?? '';
    expect(sql).toContain('from pod');
    expect(sql).toContain('join delivery d on d.id = p.delivery_id');
    expect(sql).toContain('join branch b on b.id = d.branch_id');
  });

  it('receipt به payment_receipt نگاشت می‌شود (نه goods_receipt / receipt_allocation)', () => {
    const sql = ownerTenantSql('receipt') ?? '';
    expect(sql).toContain('from payment_receipt');
    expect(sql).not.toContain('goods_receipt');
    expect(sql).not.toContain('receipt_allocation');
    expect(sql).not.toContain('client_sync_receipt');
  });

  it('مسیرِ هر نوعِ مالک، ستونِ اجارهٔ واقعیِ همان جدول را می‌خواند', () => {
    expect(ownerTenantSql('product')).toContain('p.company_id');
    expect(ownerTenantSql('journal_entry')).toContain('j.company_id');
    for (const t of ['invoice', 'sales_order', 'return_request', 'stock_count']) {
      expect(ownerTenantSql(t)).toContain('b.company_id');
      expect(ownerTenantSql(t)).toContain('join branch b on b.id =');
    }
  });

  it('هیچ ورودیِ کاربری در SQL درج نمی‌شود: owner_id همیشه $1 بایند است', () => {
    for (const t of VERIFIABLE_OWNER_TYPES) {
      const sql = ownerTenantSql(t) ?? '';
      expect(sql).toContain('$1::uuid');
      expect(sql).not.toMatch(/\$\{|\+\s*['"`]/); // بدونِ درون‌یابیِ رشته‌ای
      expect(sql.toLowerCase()).not.toContain('drop ');
    }
    // تابع فقط owner_type می‌گیرد ⇒ ساختاراً جایی برایِ تزریقِ owner_id نیست
    expect(ownerTenantSql.length).toBe(1);
  });

  it('پیش‌فرض، پذیرفتنِ مالکِ راستی‌آزمایی‌ناپذیر است: false (fail-closed)', () => {
    expect(allowUnverifiedOwner()).toBe(false);
    process.env.ATTACHMENT_ALLOW_UNVERIFIED_OWNER = 'true';
    expect(allowUnverifiedOwner()).toBe(true);
    process.env.ATTACHMENT_ALLOW_UNVERIFIED_OWNER = 'yes'; // فقط مقدارِ دقیقِ true
    expect(allowUnverifiedOwner()).toBe(false);
  });

  it('فیکسچرِ PNG خودش اعتبارسنجیِ محتوا را پاس می‌کند (تست‌ها به‌خاطرِ fixture نمی‌شکنند)', () => {
    expect(checkFileContent(file().buffer, 'image/png', 'proof.png').ok).toBe(true);
  });
});

describe('آپلود — اثباتِ مالکیت پیش از نوشتنِ شیء', () => {
  it('مالکِ متعلق به اجارهٔ دیگر ⇒ 403 و هیچ نوشتنی در استوریج/DB انجام نمی‌شود', async () => {
    const storage = makeStorage();
    const repo = makeRepo(FOREIGN);
    const svc = new AttachmentsService(storage as never, repo as never);
    const err = await svc
      .upload(file(), { owner_type: 'pod', owner_id: OWNER_ID } as never, ctx)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as { response: any }).response.code).toBe('owner_scope_denied');
    expect(storage.put).not.toHaveBeenCalled();
    expect(repo.insert).not.toHaveBeenCalled();
  });

  it('مالکِ ناموجود/نامرئی ⇒ 404 (نه 403) تا وجودِ موجودیتِ اجارهٔ دیگر لو نرود', async () => {
    const storage = makeStorage();
    const repo = makeRepo(null);
    const svc = new AttachmentsService(storage as never, repo as never);
    const err = await svc
      .upload(file(), { owner_type: 'invoice', owner_id: OWNER_ID } as never, ctx)
      .catch((e) => e);
    expect(err).toBeInstanceOf(NotFoundException);
    expect((err as { response: any }).response.code).toBe('owner_not_found');
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('owner_type بدونِ مسیرِ مالکیت (`other`) ⇒ 403 owner_scope_unverifiable', async () => {
    const storage = makeStorage();
    const repo = makeRepo(COMPANY);
    const svc = new AttachmentsService(storage as never, repo as never);
    const err = await svc
      .upload(file(), { owner_type: 'other', owner_id: OWNER_ID } as never, ctx)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as { response: any }).response.code).toBe('owner_scope_unverifiable');
    expect(storage.put).not.toHaveBeenCalled();
    expect(repo.resolveOwnerCompany).not.toHaveBeenCalled();
  });

  it('اپراتور می‌تواند صریحاً `other` را باز کند — بدونِ تغییرِ پیش‌فرضِ امن', async () => {
    process.env.ATTACHMENT_ALLOW_UNVERIFIED_OWNER = 'true';
    const storage = makeStorage();
    const repo = makeRepo(COMPANY);
    const svc = new AttachmentsService(storage as never, repo as never);
    const view = await svc.upload(
      file(),
      { owner_type: 'other', owner_id: OWNER_ID } as never,
      ctx,
    );
    expect(view.id).toBeTruthy();
    expect(storage.put).toHaveBeenCalledTimes(1);
  });

  it('مسیرِ موفق: مالکیت اثبات می‌شود و ضمیمه به شرکتِ نشست گره می‌خورد', async () => {
    const storage = makeStorage();
    const repo = makeRepo(COMPANY);
    const svc = new AttachmentsService(storage as never, repo as never);
    await svc.upload(file(), { owner_type: 'pod', owner_id: OWNER_ID } as never, ctx);
    expect(repo.resolveOwnerCompany).toHaveBeenCalledWith('pod', OWNER_ID);
    expect(repo.insert.mock.calls[0][0].company_id).toBe(COMPANY);
    // اثباتِ مالکیت «پیش از» put انجام می‌شود تا حملهٔ ناموفق زبالهٔ اورفان نگذارد
    expect(repo.resolveOwnerCompany.mock.invocationCallOrder[0]).toBeLessThan(
      storage.put.mock.invocationCallOrder[0],
    );
  });
});

describe('دسترسیِ غیرمستقیم — حدسِ شناسهٔ ضمیمه یا owner', () => {
  it('URL دانلود: حتی اگر سطرِ ضمیمه در شرکتِ نشست باشد، زنجیرهٔ مالکیت دوباره سنجیده می‌شود', async () => {
    const storage = makeStorage();
    const repo = makeRepo(FOREIGN);
    repo.findByIdInCompany.mockResolvedValue({
      id: OWNER_ID,
      owner_type: 'pod',
      owner_id: OWNER_ID,
      storage_key: `${COMPANY}/pod/x.png`,
    });
    const svc = new AttachmentsService(storage as never, repo as never);
    const err = await svc.downloadUrl(OWNER_ID, ctx).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect((err as { response: any }).response.code).toBe('owner_scope_denied');
    expect(storage.presignedGet).not.toHaveBeenCalled(); // هیچ URL امضاشده‌ای نشت نکرد
  });

  it('URL دانلود: ضمیمهٔ با owner_type راستی‌آزمایی‌ناپذیر ⇒ 403 و بدونِ URL', async () => {
    const storage = makeStorage();
    const repo = makeRepo(COMPANY);
    repo.findByIdInCompany.mockResolvedValue({
      id: OWNER_ID,
      owner_type: 'other',
      owner_id: OWNER_ID,
      storage_key: `${COMPANY}/other/x.png`,
    });
    const svc = new AttachmentsService(storage as never, repo as never);
    const err = await svc.downloadUrl(OWNER_ID, ctx).catch((e) => e);
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(storage.presignedGet).not.toHaveBeenCalled();
  });

  it('شناسهٔ ضمیمهٔ نامعتبر/ناموجود ⇒ همان 404 پیشین (بدونِ افشا)', async () => {
    const storage = makeStorage();
    const repo = makeRepo(COMPANY);
    repo.findByIdInCompany.mockResolvedValue(null);
    const svc = new AttachmentsService(storage as never, repo as never);
    await expect(svc.downloadUrl(OWNER_ID, ctx)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.downloadUrl('not-a-uuid', ctx)).rejects.toBeInstanceOf(NotFoundException);
    expect(storage.presignedGet).not.toHaveBeenCalled();
  });

  it('مسیرِ سالمِ دانلود: پس از اثباتِ مالکیت، URL امضاشده داده می‌شود', async () => {
    const storage = makeStorage();
    const repo = makeRepo(COMPANY);
    repo.findByIdInCompany.mockResolvedValue({
      id: OWNER_ID,
      owner_type: 'pod',
      owner_id: OWNER_ID,
      storage_key: `${COMPANY}/pod/x.png`,
    });
    const svc = new AttachmentsService(storage as never, repo as never);
    const view = await svc.downloadUrl(OWNER_ID, ctx);
    expect(view.url).toContain('signed.example');
    expect(storage.presignedGet).toHaveBeenCalledTimes(1);
  });
});

describe('فهرستِ ضمیمه‌های یک موجودیت — بدونِ کاوشِ وجود', () => {
  it('owner بیگانه ⇒ خطا پیش از هر پرس‌وجوی فهرست (کاوشِ وجود ممکن نیست)', async () => {
    const storage = makeStorage();
    const repo = makeRepo(FOREIGN);
    const svc = new AttachmentsService(storage as never, repo as never);
    await expect(svc.listForOwner('invoice', OWNER_ID, ctx)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(repo.listByOwner).not.toHaveBeenCalled();
  });

  it('owner ناموجود ⇒ 404 و باز هم بدونِ پرس‌وجوی فهرست', async () => {
    const storage = makeStorage();
    const repo = makeRepo(null);
    const svc = new AttachmentsService(storage as never, repo as never);
    await expect(svc.listForOwner('pod', OWNER_ID, ctx)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repo.listByOwner).not.toHaveBeenCalled();
  });

  it('ownerِ همان اجاره ⇒ فهرست برگردانده می‌شود و مالکیت پیش از آن سنجیده شده', async () => {
    const storage = makeStorage();
    const repo = makeRepo(COMPANY);
    const svc = new AttachmentsService(storage as never, repo as never);
    await svc.listForOwner('sales_order', OWNER_ID, ctx);
    expect(repo.resolveOwnerCompany).toHaveBeenCalledWith('sales_order', OWNER_ID);
    expect(repo.listByOwner).toHaveBeenCalledWith(COMPANY, 'sales_order', OWNER_ID);
    expect(repo.resolveOwnerCompany.mock.invocationCallOrder[0]).toBeLessThan(
      repo.listByOwner.mock.invocationCallOrder[0],
    );
  });
});
