import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import { CreateWaybillDto, ListWaybillsQueryDto } from './waybill.dto';
import type { WaybillRow } from './waybill.repository';
import type { WaybillService, WaybillView } from './waybill.service';
import { WAYBILL_SERVICE } from './tokens';

/**
 * حواله انبار — /waybills و /waybills/{id} مطابق openapi.yaml.
 * خواندن sales.waybill.view؛ ساخت sales.waybill.create (سند همیشه draft ساخته می‌شود؛
 * صدور با sales.waybill.issue در مرحلهٔ بعدی سند وضعیت).
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('waybills')
export class WaybillController {
  constructor(@Inject(WAYBILL_SERVICE) private readonly service: WaybillService) {}

  @Get()
  @RequirePermissions('sales.waybill.view')
  list(
    @Query() query: ListWaybillsQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<WaybillRow>> {
    return this.service.list(companyId, query);
  }

  @Post()
  @RequirePermissions('sales.waybill.create')
  create(
    @Body() dto: CreateWaybillDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<WaybillView> {
    return this.service.create(companyId, dto);
  }

  @Get(':id')
  @RequirePermissions('sales.waybill.view')
  get(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<WaybillView> {
    return this.service.get(companyId, id);
  }
}
