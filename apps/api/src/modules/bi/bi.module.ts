import { Module } from '@nestjs/common';
import { IdentityRbacModule } from '../identity-rbac/identity-rbac.module';
import { BiController } from './bi.controller';
import { BiRepository } from './bi.repository';
import { BiService } from './bi.service';
import { BI_REPOSITORY, BI_SERVICE } from './tokens';

/**
 * ماژول BI — داشبورد تحلیلی روی materialized viewهای گزارش‌دهی (مهاجرت 0029):
 * KPIهای فروش/وصولی/ماندهٔ AR و طبقه‌بندی ABC مشتریان و کالاها.
 * IdentityRbacModule برای AuthGuard/PermissionsGuard و @CurrentUser وارد می‌شود.
 */
@Module({
  imports: [IdentityRbacModule],
  controllers: [BiController],
  providers: [
    BiRepository,
    { provide: BI_REPOSITORY, useExisting: BiRepository },
    BiService,
    { provide: BI_SERVICE, useExisting: BiService },
  ],
  exports: [BI_SERVICE],
})
export class BiModule {}
