import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { ATTACHMENTS_REPOSITORY, STORAGE_SERVICE } from './tokens';
import { checkFileContent, type ContentCheckResult } from './content-type';
import { allowUnverifiedOwner, hasVerifiableOwner } from './owner-scope';
import type { AttachmentRow, AttachmentsRepository } from './attachments.repository';
import type { StorageService } from './storage.service';
import type {
  AttachmentUrlView,
  AttachmentView,
  UploadAttachmentDto,
} from './attachments.dto';

/** فایلِ آپلودشدهٔ multer — فقط فیلدهایی که لازم داریم (بدون وابستگی به @types/multer) */
export interface UploadedFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

export interface UploadContext {
  userId: string | null;
  companyId: string;
}

/** سقف حجم (پیش‌فرض ۸ مگابایت)، عمر URL دانلود (پیش‌فرض ۵ دقیقه) و انواع مجاز — با env */
export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES ?? 8 * 1024 * 1024);
export const DOWNLOAD_URL_TTL = Number(process.env.ATTACHMENT_URL_TTL ?? 300);
const ALLOWED_TYPES = new Set(
  (process.env.ALLOWED_UPLOAD_TYPES ?? 'image/jpeg,image/png,image/webp,application/pdf')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * نام فایلِ multipart: multer/busboy در برخی نسخهها `filename*` را latin1
 * تعبیر میکند، پس «نمای-اصلی.png» به «ÙÙØ§Û-Ø§ØµÙÛ.png» تبدیل میشود
 * (TASK-PM-02-C1 — UX فارسیمحور). فقط وقتی رفتوبرگشت دقیقاً همان بایتها را
 * بدهد بازکدگذاری میکنیم؛ نام درستِ یونیکد و نام ASCII دستنخورده میمانند.
 * محتوای فایل، SHA-256، allowlist و زنجیرهٔ مالکیت هیچ تغییری نمیکنند.
 */
export function decodeUploadFileName(name: string): string {
  const input = name ?? '';
  if (!/[^\x00-\x7f]/.test(input)) return input;
  try {
    const bytes = Buffer.from(input, 'latin1');
    const decoded = bytes.toString('utf8');
    if (!decoded.includes('\uFFFD') && Buffer.from(decoded, 'utf8').equals(bytes)) {
      return decoded;
    }
  } catch {
    /* نام نامعتبر ⇒ همان ورودی، بدون تغییر */
  }
  return input;
}

/** پاک‌سازی نام فایل: حذف control char و جداکنندهٔ مسیر تا key ذخیره‌سازی امن بماند */
function sanitizeFileName(name: string): string {
  const cleaned = decodeUploadFileName(name ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[/\\]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.slice(0, 180) || 'file';
}

/** pg ستون timestamptz را به‌صورت Date برمی‌گرداند؛ برای JSON به ISO تبدیل می‌شود. */
function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function toView(row: AttachmentRow, url: string): AttachmentView {
  return {
    id: row.id,
    owner_type: row.owner_type,
    owner_id: row.owner_id,
    file_name: row.file_name,
    content_type: row.content_type,
    size_bytes: row.size_bytes,
    sha256: row.sha256,
    url,
    created_at: toIso(row.created_at),
  };
}

/**
 * سرویس ضمیمه‌ها: اعتبارسنجی → محاسبهٔ sha256 → ذخیره در آبجکت‌استوریج → ثبت metadata.
 *
 * - کلیدِ ذخیره با company_id نام‌فضا می‌شود (جداسازی اجاره‌ها در bucket) و sha256 + یک
 *   UUID تصادفی در آن هست تا هم dedup-friendly باشد هم برخورَدِ نام ندهد.
 * - اگر ثبت در DB شکست، شیءِ آپلودشده best-effort پاک می‌شود تا زبالهٔ اورفان نماند.
 * - دانلود فقط با URL امضاشدهٔ کوتاه‌عمر و فقط در دامنهٔ همان شرکت.
 */
@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    @Inject(ATTACHMENTS_REPOSITORY) private readonly repo: AttachmentsRepository,
  ) {}

  /**
   * تبدیلِ نتیجهٔ ناموفقِ اعتبارسنجیِ محتوا به خطایِ HTTP با کدِ پایدار و پیامِ فارسی.
   *
   * فقط از وضعیت‌هایِ ۴۰۰ و ۴۱۵ استفاده می‌کند که پیش‌تر در قراردادِ openapi برای
   * POST /attachments مستند شده‌اند؛ بنابراین قرارداد و کلاینت‌هایِ تولیدی تغییری نمی‌کنند.
   */
  private rejectContent(
    content: ContentCheckResult,
    file: UploadedFile,
  ): BadRequestException | UnsupportedMediaTypeException {
    const declared = file.mimetype;
    const detail = {
      declared_content_type: declared,
      detected_content_type: content.detected,
    };
    if (content.suspicious) {
      this.logger.warn(
        `rejected upload: suspicious payload (${content.suspicious}) declared="${declared}" name="${sanitizeFileName(file.originalname)}"`,
      );
    }
    switch (content.reason) {
      case 'unverifiable_content_type':
        return new UnsupportedMediaTypeException({
          code: 'unverifiable_content_type',
          message_fa: `نوعِ «${declared}» با امضایِ بایتی راستی‌آزمایی نمی‌شود و پذیرفته نشد.`,
          ...detail,
        });
      case 'content_type_mismatch':
        return new UnsupportedMediaTypeException({
          code: 'content_type_mismatch',
          message_fa: `محتوایِ واقعیِ فایل با نوعِ اعلام‌شده («${declared}») نمی‌خواند.`,
          ...detail,
        });
      case 'malformed_content':
        return new BadRequestException({
          code: 'malformed_content',
          message_fa: 'ساختارِ فایل ناقص یا مخدوش است و قابلِ پذیرش نیست.',
          ...detail,
        });
      case 'extension_mismatch':
      default:
        return new BadRequestException({
          code: 'extension_mismatch',
          message_fa: `پسوندِ نامِ فایل با محتوایِ واقعی (${content.detected ?? 'نامعلوم'}) سازگار نیست (پسوندهایِ مجاز: ${(content.expectedExtensions ?? []).join('، ')}).`,
          ...detail,
        });
    }
  }

  async upload(
    file: UploadedFile | undefined,
    meta: UploadAttachmentDto,
    ctx: UploadContext,
  ): Promise<AttachmentView> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException({
        code: 'empty_file',
        message_fa: 'فایلی ارسال نشد یا فایل خالی است.',
      });
    }
    const size = file.buffer.length;
    if (size > MAX_UPLOAD_BYTES) {
      throw new PayloadTooLargeException({
        code: 'file_too_large',
        message_fa: `حجم فایل بیش از حدِ مجاز (${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} مگابایت) است.`,
      });
    }
    if (!ALLOWED_TYPES.has(file.mimetype)) {
      throw new UnsupportedMediaTypeException({
        code: 'unsupported_media_type',
        message_fa: `نوع فایل «${file.mimetype}» مجاز نیست (مجاز: ${[...ALLOWED_TYPES].join('، ')}).`,
      });
    }

    // --- اعتبارسنجیِ «محتوایِ واقعی» بر پایهٔ امضایِ بایتی ---
    // mimetype از سویِ کلاینت تأمین می‌شود (مرورگر از پسوند حدس می‌زند) و قابلِ اعتماد نیست؛
    // بنابراین محتوا مستقل از آن سنجیده و ناسازگاری fail-closed رد می‌شود.
    const content = checkFileContent(file.buffer, file.mimetype, file.originalname);
    if (!content.ok) {
      throw this.rejectContent(content, file);
    }
    // نوعِ راستی‌آزمایی‌شده (نه ادعایِ کلاینت) ذخیره و در آبجکت‌استوریج ثبت می‌شود.
    const contentType = content.detected ?? file.mimetype;

    // --- اثباتِ مالکیتِ موجودیتِ والد (پیش از نوشتنِ شیء در استوریج) ---
    // اگر این بررسی بعد از put بود، یک حملهٔ ناموفق هم زبالهٔ اورفان در bucket می‌گذاشت.
    await this.assertOwnerInCompany(meta.owner_type, meta.owner_id, ctx.companyId);

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const fileName = sanitizeFileName(file.originalname);
    const key = `${ctx.companyId}/${meta.owner_type}/${meta.owner_id}/${sha256}-${randomUUID()}-${fileName}`;

    await this.storage.put(key, file.buffer, contentType);

    let row: AttachmentRow;
    try {
      row = await this.repo.insert({
        company_id: ctx.companyId,
        owner_type: meta.owner_type,
        owner_id: meta.owner_id,
        file_name: fileName,
        content_type: contentType,
        size_bytes: size,
        storage_key: key,
        sha256,
        uploaded_by: ctx.userId,
      });
    } catch (err) {
      // ثبت metadata شکست → شیء را پس بگیر تا اورفان نماند (best-effort، بدون پرتابِ ثانوی)
      await this.storage.remove(key).catch(() => undefined);
      throw err;
    }

    const url = await this.storage.presignedGet(key, DOWNLOAD_URL_TTL);
    return toView(row, url);
  }

  /**
   * اثباتِ مالکیتِ موجودیتِ والد پیش از هر دسترسی به ضمیمه (آپلود/فهرست/URL دانلود).
   *
   * سه حالت، هر سه fail-closed:
   *   1. owner_type مسیرِ راستی‌آزمایی‌شده ندارد (مثلِ `other`) ⇒ 403 owner_scope_unverifiable
   *      مگر اپراتور صریحاً ATTACHMENT_ALLOW_UNVERIFIED_OWNER=true داده باشد.
   *   2. موجودیتِ مالک پیدا نشد یا زیرِ RLS نامرئی است (یعنی به اجارهٔ دیگری تعلق دارد)
   *      ⇒ 404 owner_not_found؛ عمداً 404 و نه 403 تا تفاوتِ «وجود ندارد» و «مالِ تو نیست»
   *      از بیرون قابلِ تشخیص نباشد و حدسِ owner_id چیزی لو ندهد.
   *   3. موجودیت پیدا شد ولی company_id آن با شرکتِ نشست یکی نیست ⇒ 403 owner_scope_denied
   *      (لایهٔ دومِ دفاع برایِ زمانی که RLS به هر دلیلی فعال نباشد، مثلاً اتصالِ ابرکاربر).
   *
   * کدهایِ ۴۰۳ و ۴۰۴ پیش‌تر در قراردادِ openapi برایِ هر سه مسیرِ ضمیمه مستند شده‌اند،
   * بنابراین قرارداد و کلاینت‌هایِ تولیدی تغییری نمی‌کنند.
   */
  private async assertOwnerInCompany(
    ownerType: string,
    ownerId: string,
    companyId: string,
  ): Promise<void> {
    if (!hasVerifiableOwner(ownerType)) {
      if (!allowUnverifiedOwner()) {
        this.logger.warn(
          `rejected attachment access: owner_type="${ownerType}" has no verifiable ownership path`,
        );
        throw new ForbiddenException({
          code: 'owner_scope_unverifiable',
          message_fa:
            'نوعِ مالکِ ضمیمه مسیرِ مالکیتِ راستی‌آزمایی‌شده ندارد و پذیرفته نشد.',
          owner_type: ownerType,
        });
      }
      return;
    }
    const ownerCompany = await this.repo.resolveOwnerCompany(ownerType, ownerId);
    if (ownerCompany == null) {
      throw new NotFoundException({
        code: 'owner_not_found',
        message_fa: 'موجودیتِ مالکِ ضمیمه یافت نشد.',
      });
    }
    if (ownerCompany !== companyId) {
      this.logger.warn(
        `rejected attachment access: owner ${ownerType}/${ownerId} belongs to another company`,
      );
      throw new ForbiddenException({
        code: 'owner_scope_denied',
        message_fa: 'ضمیمه به موجودیتِ متعلق به این شرکت گره نخورده است.',
      });
    }
  }

  async downloadUrl(id: string, ctx: UploadContext): Promise<AttachmentUrlView> {
    if (!UUID_V4.test(id)) {
      // 404 (نه 400) تا وجود/عدم وجود ضمیمه با id نامعتبر لو نرود
      throw new NotFoundException({ code: 'attachment_not_found', message_fa: 'ضمیمه یافت نشد.' });
    }
    const row = await this.repo.findByIdInCompany(id, ctx.companyId);
    if (!row) {
      throw new NotFoundException({ code: 'attachment_not_found', message_fa: 'ضمیمه یافت نشد.' });
    }
    // بازبینیِ زنجیرهٔ مالکیت حتی وقتی company_idِ خودِ سطر می‌خواند: سطرِ metadata ممکن است
    // پیش از این کنترل نوشته شده باشد (دادهٔ تاریخی) یا owner_id آن بعداً جابه‌جا شده باشد.
    // این یعنی دسترسیِ «غیرمستقیم» با شناسهٔ حدس‌زدهٔ ضمیمه هم بسته است.
    await this.assertOwnerInCompany(row.owner_type, row.owner_id, ctx.companyId);
    const url = await this.storage.presignedGet(row.storage_key, DOWNLOAD_URL_TTL);
    return { url, expires_in: DOWNLOAD_URL_TTL };
  }

  /**
   * فهرستِ ضمیمه‌های یک موجودیت (owner) در دامنهٔ شرکتِ نشست — برای نمایشِ POD/اسناد
   * روی فرم‌ها. هر مورد یک URL امضاشدهٔ کوتاه‌عمر دارد.
   */
  async listForOwner(
    ownerType: string,
    ownerId: string,
    ctx: UploadContext,
  ): Promise<AttachmentView[]> {
    // پیش از فهرست‌کردن، خودِ موجودیتِ مالک اثبات می‌شود تا owner_idِ اجارهٔ دیگر
    // نه ضمیمه‌ای برگرداند و نه وجودش را (با پاسخِ متفاوت) لو بدهد.
    await this.assertOwnerInCompany(ownerType, ownerId, ctx.companyId);
    const rows = await this.repo.listByOwner(ctx.companyId, ownerType, ownerId);
    return Promise.all(
      rows.map(async (row) =>
        toView(row, await this.storage.presignedGet(row.storage_key, DOWNLOAD_URL_TTL)),
      ),
    );
  }
}
