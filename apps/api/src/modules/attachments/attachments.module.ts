import { Module } from '@nestjs/common';
import { IdentityRbacModule } from '../identity-rbac/identity-rbac.module';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsRepository } from './attachments.repository';
import { AttachmentsService } from './attachments.service';
import { StorageService } from './storage.service';
import { ATTACHMENTS_REPOSITORY, ATTACHMENTS_SERVICE, STORAGE_SERVICE } from './tokens';

// TASK-PM-02-C1: سرویسِ محصولمحورِ تصاویر/اسناد کالا برای ممیزی fail-closed
// به storage_key ردیفِ تازه نیاز دارد؛ همان ریپوزیتوری موجود (بدون کوئری تازه
// در ماژول دیگر) از اینجا export میشود.

/**
 * ماژول ضمیمه‌ها — بارگذاری/دریافت فایل (POD، فاکتور، سند حسابداری، …) روی
 * آبجکت‌استوریج MinIO/S3 و جدول attachment (مهاجرت 0002 + ستون company_id از 0035).
 * IdentityRbacModule برای AuthGuard/PermissionsGuard و @CurrentUser وارد می‌شود.
 */
@Module({
  imports: [IdentityRbacModule],
  controllers: [AttachmentsController],
  providers: [
    StorageService,
    { provide: STORAGE_SERVICE, useExisting: StorageService },
    AttachmentsRepository,
    { provide: ATTACHMENTS_REPOSITORY, useExisting: AttachmentsRepository },
    AttachmentsService,
    { provide: ATTACHMENTS_SERVICE, useExisting: AttachmentsService },
  ],
  exports: [ATTACHMENTS_SERVICE, ATTACHMENTS_REPOSITORY, STORAGE_SERVICE],
})
export class AttachmentsModule {}
