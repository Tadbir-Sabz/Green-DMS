import { IsIn, IsUUID } from 'class-validator';

/** انواع مجاز مالکِ ضمیمه — هم‌راستا با comment ستون owner_type در مهاجرت 0002 */
export const ATTACHMENT_OWNER_TYPES = [
  'pod',
  'invoice',
  'journal_entry',
  'receipt',
  'return_request',
  'product',
  'stock_count',
  'other',
] as const;
export type AttachmentOwnerType = (typeof ATTACHMENT_OWNER_TYPES)[number];

/**
 * فیلدهای متنیِ فرم multipart (خودِ فایل با @UploadedFile می‌آید).
 * ValidationPipe سراسری این‌ها را اعتبارسنجی می‌کند.
 */
export class UploadAttachmentDto {
  @IsIn([...ATTACHMENT_OWNER_TYPES], { message: 'نوعِ مالکِ ضمیمه معتبر نیست.' })
  owner_type!: AttachmentOwnerType;

  @IsUUID('4', { message: 'شناسهٔ مالکِ ضمیمه باید UUID معتبر باشد.' })
  owner_id!: string;
}

/** شکل پاسخ ضمیمه — schemas.Attachment در قرارداد openapi */
export interface AttachmentView {
  id: string;
  owner_type: string;
  owner_id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  /** URL امضاشدهٔ کوتاه‌عمر برای دانلود مستقیم از آبجکت‌استوریج */
  url: string;
  created_at: string;
}

/** پاسخ GET /attachments/{id}/url */
export interface AttachmentUrlView {
  url: string;
  expires_in: number;
}
