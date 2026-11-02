import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import { CreateGeofenceDto, ListGeofencesQueryDto, UpdateGeofenceDto } from './geofence.dto';
import type { GeofenceRow } from './geofence.repository';
import type { GeofenceService } from './geofence.service';
import { GEOFENCE_SERVICE } from './tracking.tokens';

/**
 * محدوده‌های جغرافیایی — /geofences مطابق openapi.yaml.
 * خواندن tracking.geofence.view؛ ساخت/ویرایش/حذف با tracking.geofence.update.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('geofences')
export class GeofenceController {
  constructor(@Inject(GEOFENCE_SERVICE) private readonly service: GeofenceService) {}

  @Get()
  @RequirePermissions('tracking.geofence.view')
  list(
    @Query() query: ListGeofencesQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<GeofenceRow>> {
    return this.service.list(companyId, query);
  }

  @Post()
  @RequirePermissions('tracking.geofence.update')
  create(
    @Body() dto: CreateGeofenceDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<GeofenceRow> {
    return this.service.create(companyId, dto);
  }

  @Get(':id')
  @RequirePermissions('tracking.geofence.view')
  get(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<GeofenceRow> {
    return this.service.get(companyId, id);
  }

  @Patch(':id')
  @RequirePermissions('tracking.geofence.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateGeofenceDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<GeofenceRow> {
    return this.service.update(companyId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('tracking.geofence.update')
  async remove(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<void> {
    await this.service.remove(companyId, id);
  }
}
