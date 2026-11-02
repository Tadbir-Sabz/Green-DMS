import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import { CreateRouteDto, ListRoutesQueryDto, UpdateRouteDto } from './structure.dto';
import type { RouteRow } from './structure.repository';
import type { RouteView, StructureService } from './structure.service';
import { STRUCTURE_SERVICE } from './tokens';

/**
 * مسیر فروش — /routes و /routes/{id} مطابق openapi.yaml.
 * خواندن master.structure.view؛ ساخت/ویرایش master.structure.update. شرکت از نشست می‌آید.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('routes')
export class RouteController {
  constructor(@Inject(STRUCTURE_SERVICE) private readonly service: StructureService) {}

  @Get()
  @RequirePermissions('master.structure.view')
  list(
    @Query() query: ListRoutesQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<RouteRow>> {
    return this.service.listRoutes(companyId, query);
  }

  @Post()
  @RequirePermissions('master.structure.update')
  create(
    @Body() dto: CreateRouteDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<RouteView> {
    return this.service.createRoute(companyId, dto);
  }

  @Get(':id')
  @RequirePermissions('master.structure.view')
  get(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<RouteView> {
    return this.service.getRoute(companyId, id);
  }

  @Patch(':id')
  @RequirePermissions('master.structure.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRouteDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<RouteView> {
    return this.service.updateRoute(companyId, id, dto);
  }
}
