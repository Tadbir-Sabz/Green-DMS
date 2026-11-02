import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import { CreateAreaDto, ListAreasQueryDto, UpdateAreaDto } from './structure.dto';
import type { AreaRow } from './structure.repository';
import type { StructureService } from './structure.service';
import { STRUCTURE_SERVICE } from './tokens';

/**
 * حوزهٔ فروش — /areas و /areas/{id} مطابق openapi.yaml.
 * خواندن master.structure.view؛ ساخت/ویرایش master.structure.update. شرکت از نشست می‌آید.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('areas')
export class AreaController {
  constructor(@Inject(STRUCTURE_SERVICE) private readonly service: StructureService) {}

  @Get()
  @RequirePermissions('master.structure.view')
  list(
    @Query() query: ListAreasQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<AreaRow>> {
    return this.service.listAreas(companyId, query);
  }

  @Post()
  @RequirePermissions('master.structure.update')
  create(
    @Body() dto: CreateAreaDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<AreaRow> {
    return this.service.createArea(companyId, dto);
  }

  @Get(':id')
  @RequirePermissions('master.structure.view')
  get(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<AreaRow> {
    return this.service.getArea(companyId, id);
  }

  @Patch(':id')
  @RequirePermissions('master.structure.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAreaDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<AreaRow> {
    return this.service.updateArea(companyId, id, dto);
  }
}
