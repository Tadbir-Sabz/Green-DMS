import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import type { ModuleInfo } from '../../common/module-info';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import { BI_SERVICE } from './tokens';
import type { AbcResult, BiKpi, BiService } from './bi.service';

/** days از کوئری؛ پیش‌فرض ۳۰ و محدود به ۱..۳۶۵ تا کوئریِ MV سنگین نشود. */
const clampDays = (raw?: string): number => {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 30;
  return Math.min(365, Math.max(1, Math.trunc(n)));
};

/**
 * داشبورد BI — openapi › /bi/kpi، /bi/abc-customers، /bi/abc-products.
 * دادهٔ واقعی از materialized viewهای گزارش‌دهی (mv_daily_sales، mv_ar_aging) و
 * فاکتورهای ثبت‌شده (برای ABC). company_id از نشست می‌آید (جداسازی اجاره‌ها) و
 * مجوزِ مشاهدهٔ داشبورد (reports.dashboard.view) لازم است.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('bi')
export class BiController {
  constructor(@Inject(BI_SERVICE) private readonly service: BiService) {}

  @Get()
  info(): ModuleInfo {
    return {
      module: 'bi',
      title: 'داشبورد BI تعاملی',
      resources: ['kpi', 'abc-customers', 'abc-products'],
      status: 'implemented',
    };
  }

  @Get('kpi')
  @RequirePermissions('reports.dashboard.view')
  kpi(
    @CurrentUser('companyId') companyId: string,
    @Query('days') days?: string,
  ): Promise<BiKpi> {
    return this.service.kpi(companyId, clampDays(days));
  }

  @Get('abc-customers')
  @RequirePermissions('reports.dashboard.view')
  abcCustomers(@CurrentUser('companyId') companyId: string): Promise<AbcResult> {
    return this.service.abcCustomers(companyId);
  }

  @Get('abc-products')
  @RequirePermissions('reports.dashboard.view')
  abcProducts(@CurrentUser('companyId') companyId: string): Promise<AbcResult> {
    return this.service.abcProducts(companyId);
  }
}
