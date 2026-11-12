import { Module } from '@nestjs/common';
import { IdentityRbacModule } from '../identity-rbac/identity-rbac.module';
import { DomainBoundaryGuard } from '../master-data/domain-boundary.guard';
import { AttachmentsModule } from './attachments.module';
import { AttachmentTransferController } from './attachment-transfer.controller';
import { AttachmentTransferService } from './attachment-transfer.service';

/**
 * TASK-PM-02-C4 — مرکز صدور/ورود امن ضمائم. همان `AttachmentsModule`، همان
 * `StorageService`، همان `audit_log`، همان `DomainBoundaryGuard` و همان مجوزها.
 * جدول، مهاجرت، RLS، grant، نقش، ارائهدهندهٔ استوریج یا سیاست نگهداشت تازهای
 * اضافه نمیشود. `RulesEngineService` تزریق نمیشود چون عملیات بستهای فاقد
 * سیاست/اثرانگشت مصوب است و اجرا fail-closed میماند.
 */
@Module({
  imports: [IdentityRbacModule, AttachmentsModule],
  controllers: [AttachmentTransferController],
  providers: [AttachmentTransferService, DomainBoundaryGuard],
  exports: [AttachmentTransferService],
})
export class AttachmentTransferModule {}
