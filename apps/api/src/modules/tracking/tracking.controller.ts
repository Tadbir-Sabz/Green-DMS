import { Body, Controller, Get, HttpCode, Inject, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import { TRACKING_SERVICE } from './tracking.tokens';
import { TrackingPingDto } from './tracking.dto';
import {
  CreateRouteDto,
  ListLocationsQueryDto,
  ListRoutesQueryDto,
  PostLocationsDto,
} from './location.dto';
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

  /** GET /tracking/locations — آخرین موقعیت کارکنان میدانی برای نقشه */
  @Get('locations')
  @RequirePermissions('tracking.live.view')
  locations(
    @CurrentUser('companyId') companyId: string,
    @Query() query: ListLocationsQueryDto,
  ) {
    return this.service.locations(companyId, query);
  }

  /** POST /tracking/locations — ارسال دسته‌ای نمونه موقعیت از صف آفلاین اپ */
  @Post('locations')
  @HttpCode(202)
  @RequirePermissions('tracking.location.report')
  postLocations(
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: PostLocationsDto,
  ) {
    return this.service.postLocations(companyId, userId, dto);
  }

  /** GET /tracking/routes — طرح‌های مسیر محاسبه‌شده */
  @Get('routes')
  @RequirePermissions('tracking.route.view')
  routes(
    @CurrentUser('companyId') companyId: string,
    @Query() query: ListRoutesQueryDto,
  ) {
    return this.service.routes(companyId, query);
  }

  /** POST /tracking/routes — محاسبهٔ «بهترین مسیر با یک کلیک» */
  @Post('routes')
  @RequirePermissions('tracking.route.create')
  createRoute(
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateRouteDto,
  ) {
    return this.service.createRoute(companyId, userId, dto);
  }
}
