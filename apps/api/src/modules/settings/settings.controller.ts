import { Body, Controller, Get, Inject, Patch, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import { RequestMetaParam } from '../../common/request-meta';
import type { RequestMeta } from '../../common/request-meta';
import { ListSettingsQueryDto, UpdateSettingsDto } from './settings.dto';
import type { SettingRow } from './settings.repository';
import type { SettingsService } from './settings.service';
import { SETTINGS_SERVICE } from './tokens';

/**
 * تنظیمات — /settings مطابق openapi.yaml (ماژول ۱۱).
 * خواندن master.settings.view؛ نوشتن master.settings.update + ممیزی.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('settings')
export class SettingsController {
  constructor(@Inject(SETTINGS_SERVICE) private readonly service: SettingsService) {}

  @Get()
  @RequirePermissions('master.settings.view')
  list(
    @Query() query: ListSettingsQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<{ items: SettingRow[] }> {
    return this.service.list(companyId, query);
  }

  @Patch()
  @RequirePermissions('master.settings.update')
  update(
    @Body() dto: UpdateSettingsDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
    @RequestMetaParam() meta: RequestMeta,
  ): Promise<{ items: SettingRow[] }> {
    return this.service.update(companyId, userId, dto, meta);
  }
}
