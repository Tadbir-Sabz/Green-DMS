import { Body, Controller, Get, Inject, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import { TRACKING_SERVICE } from './tracking.tokens';
import { TrackingPingDto } from './tracking.dto';
import type { TrackingService } from './tracking.service';

@UseGuards(AuthGuard, PermissionsGuard)
@Controller('tracking')
export class TrackingController {
  constructor(@Inject(TRACKING_SERVICE) private readonly service: TrackingService) {}

  @Get('live')
  @RequirePermissions('tracking.live.view')
  live(@CurrentUser('companyId') companyId: string) {
    return this.service.live(companyId);
  }

  @Post('ping')
  @RequirePermissions('tracking.location.report')
  ping(
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: TrackingPingDto,
  ) {
    return this.service.ping(companyId, userId, dto);
  }
}
