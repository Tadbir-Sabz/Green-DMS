import { Module } from '@nestjs/common';
import { IdentityRbacModule } from '../identity-rbac/identity-rbac.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { REPORTS_SERVICE } from './tokens';

/**
 * ماژول گزارش‌ها (ضمیمه C) — /reports و /reports/{key} با خروجی json/csv/xlsx.
 *
 * نکته مهم: نسخه پیشین از `pg` خام (apps/api/src/db/pg.ts) استفاده می‌کرد که یک
 * Pool جدا بدون GUCهای نشست بود و RLS مهاجرت 0021 را دور می‌زد؛ اینجا همه‌چیز روی
 * PG_POOL tenant-aware است. آن ماژول pg خام دیگر مصرف‌کننده‌ای ندارد.
 */
@Module({
  imports: [IdentityRbacModule],
  controllers: [ReportsController],
  providers: [ReportsService, { provide: REPORTS_SERVICE, useExisting: ReportsService }],
  exports: [REPORTS_SERVICE],
})
export class ReportsModule {}
