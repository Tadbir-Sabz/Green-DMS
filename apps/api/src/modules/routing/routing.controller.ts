import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, UseGuards } from '@nestjs/common';
import type { ModuleInfo } from '../../common/module-info';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import { ROUTING_SERVICE } from './tokens';
import type { RoutingService } from './routing.service';
import { OptimizeRouteDto, type RoutingOptimization } from './optimize.dto';

/**
 * بهینه‌ساز مسیر — openapi › POST /routing/optimize.
 * با route_id (همهٔ مشتریانِ یک مسیر) یا customer_ids (فهرستِ صریح) و یک نقطهٔ
 * شروعِ اختیاری، ترتیبِ بهینهٔ بازدید را با TSP (نزدیک‌ترین همسایه + 2-opt) می‌سازد.
 * مجوز: tracking.route.create («ایجاد مسیر بهینه»). company_id از نشست.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('routing')
export class RoutingController {
  constructor(@Inject(ROUTING_SERVICE) private readonly service: RoutingService) {}

  @Get()
  info(): ModuleInfo {
    return {
      module: 'routing',
      title: 'بهینه‌ساز مسیر هوشمند',
      resources: ['optimize'],
      status: 'implemented',
    };
  }

  @Post('optimize')
  @RequirePermissions('tracking.route.create')
  @HttpCode(HttpStatus.OK)
  optimize(
    @Body() dto: OptimizeRouteDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<RoutingOptimization> {
    return this.service.optimize(dto, companyId);
  }
}
