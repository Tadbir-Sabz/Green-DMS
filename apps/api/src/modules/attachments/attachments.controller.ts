import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import { ATTACHMENTS_SERVICE } from './tokens';
import type { AttachmentsService, UploadedFile as StoredFile } from './attachments.service';
import { MAX_UPLOAD_BYTES } from './attachments.service';
import {
  ListAttachmentsQueryDto,
  UploadAttachmentDto,
  type AttachmentUrlView,
  type AttachmentView,
} from './attachments.dto';

/**
 * ضمیمه‌ها و مدرک تحویل (POD) — openapi › /attachments:
 *   POST /attachments            بارگذاری فایل (multipart/form-data: file + owner_type + owner_id)
 *   GET  /attachments/{id}/url   دریافت URL امضاشدهٔ کوتاه‌عمر برای دانلود
 *
 * فایل در آبجکت‌استوریج (MinIO/S3) نگهداری می‌شود و در DB فقط storage_key + metadata.
 * دامنهٔ هر درخواست از نشست می‌آید (company_id برای جداسازی اجاره‌ها، userId برای
 * uploaded_by) و هرگز از کلاینت پذیرفته نمی‌شود. multer با memoryStorage و سقف
 * fileSize کار می‌کند؛ بررسی نوع/حجم در سرویس هم تکرار می‌شود (دفاع در عمق).
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('attachments')
export class AttachmentsController {
  constructor(@Inject(ATTACHMENTS_SERVICE) private readonly service: AttachmentsService) {}

  @Post()
  @RequirePermissions('attachment.upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  @HttpCode(HttpStatus.CREATED)
  upload(
    @UploadedFile() file: StoredFile | undefined,
    @Body() meta: UploadAttachmentDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<AttachmentView> {
    return this.service.upload(file, meta, { userId: userId ?? null, companyId });
  }

  @Get()
  @RequirePermissions('attachment.view')
  list(
    @Query() query: ListAttachmentsQueryDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<{ items: AttachmentView[] }> {
    return this.service
      .listForOwner(query.owner_type, query.owner_id, { userId: userId ?? null, companyId })
      .then((items) => ({ items }));
  }

  @Get(':id/url')
  @RequirePermissions('attachment.view')
  url(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<AttachmentUrlView> {
    return this.service.downloadUrl(id, { userId: userId ?? null, companyId });
  }
}
