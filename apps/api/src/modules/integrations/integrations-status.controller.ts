import { Controller, Get, HttpCode, Inject, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import type { IntegrationStatusRow } from './integrations-status.repository';
import type { IntegrationsStatusService } from './integrations-status.service';
import { INTEGRATIONS_STATUS_SERVICE } from './integrations-status.tokens';

/**
 * وضعیت یکپارچه‌سازی‌ها — GET /integrations و POST /integrations/{key}/test
 * مطابق openapi (ضمیمه D). مشاهده با admin.integration.manage؛ آزمون اتصال
 * فقط برای ادمین (همان مجوز).
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('integrations')
export class IntegrationsStatusController {
  constructor(
    @Inject(INTEGRATIONS_STATUS_SERVICE)
    private readonly service: IntegrationsStatusService,
  ) {}

  @Get()
  @RequirePermissions('admin.integration.manage')
  list(@CurrentUser('companyId') companyId: string): Promise<{ items: IntegrationStatusRow[] }> {
    return this.service.list(companyId);
  }

  @Post(':key/test')
  @HttpCode(200)
  @RequirePermissions('admin.integration.manage')
  test(
    @Param('key') key: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<IntegrationStatusRow> {
    return this.service.test(companyId, key);
  }
}
