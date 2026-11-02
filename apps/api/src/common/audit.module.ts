import { Global, Module } from '@nestjs/common';
import { AuditService, AUDIT_SERVICE } from './audit.service';

/** ماژول سراسری ممیزی — هر ماژول پولی/تنظیماتی رویدادها را در audit_log می‌نویسد */
@Global()
@Module({
  providers: [AuditService, { provide: AUDIT_SERVICE, useExisting: AuditService }],
  exports: [AuditService, AUDIT_SERVICE],
})
export class AuditModule {}
