import { Module } from '@nestjs/common';
import { IdentityRbacModule } from '../identity-rbac/identity-rbac.module';
import { AttachmentsModule } from './attachments.module';
import { DomainBoundaryGuard } from '../master-data/domain-boundary.guard';
import { EntityAttachmentsController } from './entity-attachments.controller';
import { EntityAttachmentsService } from './entity-attachments.service';

/**
 * ماژول «ضمائم سازمانی» (TASK-PM-02-C3) — لایهٔ هماهنگکنندهٔ مشترک روی همان
 * `AttachmentsModule` موجود. هیچ ارائهدهندهٔ استوریج/ریپوزیتوری/RLS تازهای
 * ندارد: سرویسها و توکنها از `AttachmentsModule` و `AuditModule`/`DatabaseModule`
 * (هر دو `@Global`) تزریق میشوند.
 *
 * `DomainBoundaryGuard` همان نگهبان مصوب B2 از ماژول master-data است و فقط به
 * دو ارائهدهندهٔ سراسری (`AUDIT_SERVICE`, `PG_POOL`) نیاز دارد؛ بنابراین ثبت
 * دوبارهٔ آن در این ماژول هیچ وابستگی دوری Nest ایجاد نمیکند و رفتار گارد
 * (از جمله ممیزی ردشدنها) دقیقاً با C1/C2 یکسان میماند.
 */
@Module({
  imports: [IdentityRbacModule, AttachmentsModule],
  controllers: [EntityAttachmentsController],
  providers: [EntityAttachmentsService, DomainBoundaryGuard],
  exports: [EntityAttachmentsService],
})
export class EntityAttachmentsModule {}
