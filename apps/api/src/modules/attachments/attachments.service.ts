import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { ATTACHMENTS_REPOSITORY, STORAGE_SERVICE } from './tokens';
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

/** پاک‌سازی نام فایل: حذف control char و جداکنندهٔ مسیر تا key ذخیره‌سازی امن بماند */
function sanitizeFileName(name: string): string {
  const cleaned = (name ?? '')
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

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const fileName = sanitizeFileName(file.originalname);
    const key = `${ctx.companyId}/${meta.owner_type}/${meta.owner_id}/${sha256}-${randomUUID()}-${fileName}`;

    await this.storage.put(key, file.buffer, file.mimetype);

    let row: AttachmentRow;
    try {
      row = await this.repo.insert({
        company_id: ctx.companyId,
        owner_type: meta.owner_type,
        owner_id: meta.owner_id,
        file_name: fileName,
        content_type: file.mimetype,
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

  async downloadUrl(id: string, ctx: UploadContext): Promise<AttachmentUrlView> {
    if (!UUID_V4.test(id)) {
      // 404 (نه 400) تا وجود/عدم وجود ضمیمه با id نامعتبر لو نرود
      throw new NotFoundException({ code: 'attachment_not_found', message_fa: 'ضمیمه یافت نشد.' });
    }
    const row = await this.repo.findByIdInCompany(id, ctx.companyId);
    if (!row) {
      throw new NotFoundException({ code: 'attachment_not_found', message_fa: 'ضمیمه یافت نشد.' });
    }
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
    const rows = await this.repo.listByOwner(ctx.companyId, ownerType, ownerId);
    return Promise.all(
      rows.map(async (row) =>
        toView(row, await this.storage.presignedGet(row.storage_key, DOWNLOAD_URL_TTL)),
      ),
    );
  }
}
