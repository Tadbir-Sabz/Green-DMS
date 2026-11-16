import { Body, Controller, Get, HttpCode, Inject, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import { ListTerritoryCoverageQueryDto, ReassignCustomersDto } from './territory.dto';
import type { TerritoryService, TerritoryCoverageView } from './territory.service';
import { TERRITORY_SERVICE } from './tokens';

/**
 * پوشش و انتسابِ قلمرو/مسیر — /territory مطابق openapi.yaml.
 * خواندن master.structure.view؛ انتسابِ گروهی master.structure.update.
 * شرکت از نشست می‌آید؛ هر تغییر «قبل/بعد» در audit_log ثبت می‌شود.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('territory')
export class TerritoryController {
  constructor(@Inject(TERRITORY_SERVICE) private readonly service: TerritoryService) {}

  @Get('coverage')
  @RequirePermissions('master.structure.view')
  coverage(
    @Query() query: ListTerritoryCoverageQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<TerritoryCoverageView> {
    return this.service.coverage(companyId, query);
  }

  @Post('reassign')
  @HttpCode(200)
  @RequirePermissions('master.structure.update')
  reassign(
    @Body() dto: ReassignCustomersDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ): Promise<{ updated: number; target_route_id: string | null; unassigned: boolean }> {
    return this.service.reassign(companyId, dto, userId);
  }
}
