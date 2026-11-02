import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import {
  CreateTourDto,
  CreateVisitDto,
  ListToursQueryDto,
  ListVisitsQueryDto,
  UpdateTourDto,
  UpdateVisitDto,
} from './tours.dto';
import type { TourRow, TourSettlementRow, VisitRow } from './tours.repository';
import type { ToursService, VisitsService } from './tours.service';
import { TOURS_SERVICE, VISITS_SERVICE } from './tokens';

/**
 * تورها — /tours، /tours/{id}، /tours/{id}/settlement مطابق openapi.yaml.
 * خواندن tour.plan.view؛ ساخت tour.plan.create؛ به‌روزرسانی tour.plan.approve.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('tours')
export class ToursController {
  constructor(@Inject(TOURS_SERVICE) private readonly service: ToursService) {}

  @Get()
  @RequirePermissions('tour.plan.view')
  list(
    @Query() query: ListToursQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<TourRow>> {
    return this.service.list(companyId, query);
  }

  @Post()
  @RequirePermissions('tour.plan.create')
  create(
    @Body() dto: CreateTourDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<TourRow> {
    return this.service.create(companyId, dto);
  }

  @Get(':id')
  @RequirePermissions('tour.plan.view')
  get(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<TourRow> {
    return this.service.get(companyId, id);
  }

  @Patch(':id')
  @RequirePermissions('tour.plan.approve')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTourDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<TourRow> {
    return this.service.update(companyId, id, dto);
  }

  @Get(':id/settlement')
  @RequirePermissions('tour.settle.create')
  settlement(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<TourSettlementRow> {
    return this.service.settlement(companyId, id);
  }
}

/**
 * بازدیدها — /visits و /visits/{id} مطابق openapi.yaml.
 * check-in با مختصات (ضدتقلب GPS) و check-out با نتیجهٔ بازدید.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('visits')
export class VisitsController {
  constructor(@Inject(VISITS_SERVICE) private readonly service: VisitsService) {}

  @Get()
  @RequirePermissions('tour.plan.view')
  list(
    @Query() query: ListVisitsQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<VisitRow>> {
    return this.service.list(companyId, query);
  }

  @Post()
  @RequirePermissions('tour.plan.view')
  create(
    @Body() dto: CreateVisitDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<VisitRow> {
    return this.service.create(companyId, dto);
  }

  @Get(':id')
  @RequirePermissions('tour.plan.view')
  get(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<VisitRow> {
    return this.service.get(companyId, id);
  }

  @Patch(':id')
  @RequirePermissions('tour.plan.view')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateVisitDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<VisitRow> {
    return this.service.update(companyId, id, dto);
  }
}
