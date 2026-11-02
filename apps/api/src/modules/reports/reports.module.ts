import { Module } from '@nestjs/common';
import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import type { ModuleInfo } from '../../common/module-info';
import { IdentityRbacModule } from '../identity-rbac/identity-rbac.module';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import { pg } from '../../db/pg';

@Controller('reports')
export class ReportsController {
  @UseGuards(AuthGuard, PermissionsGuard)
  @Get('mv/daily-sales')
  @RequirePermissions('reports.dashboard.view')
  async dailySales(@CurrentUser('companyId') companyId: string, @Query() q: any) {
    const { rows } = await pg.query(`select * from mv_daily_sales where company_id = $1 order by sale_date desc limit 100`, [companyId]);
    return { items: rows };
  }

  @UseGuards(AuthGuard, PermissionsGuard)
  @Get('mv/ar-aging')
  @RequirePermissions('reports.dashboard.view')
  async arAging(@CurrentUser('companyId') companyId: string) {
    const { rows } = await pg.query(`select * from mv_ar_aging where company_id = $1`, [companyId]);
    return { items: rows };
  }

  @UseGuards(AuthGuard, PermissionsGuard)
  @Get('mv/salesperson-performance')
  @RequirePermissions('reports.dashboard.view')
  async salespersonPerformance(@CurrentUser('companyId') companyId: string) {
    const { rows } = await pg.query(`select * from mv_salesperson_performance where company_id = $1`, [companyId]);
    return { items: rows };
  }
}

@Controller('reports')
export class ReportsModuleInfoController {
  @Get()
  info(): ModuleInfo {
    return { module: 'reports', title: 'گزارش‌های تحلیلی', resources: ['mv_daily_sales', 'mv_ar_aging', 'mv_salesperson_performance'], status: 'implemented' };
  }
}

@Module({
  imports: [IdentityRbacModule],
  controllers: [ReportsModuleInfoController, ReportsController],
})
export class ReportsModule {}
