import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import {
  CreatePriceListDto,
  ListPriceListsQueryDto,
  UpdatePriceListDto,
} from './pricing.dto';
import type { PriceListRow } from './pricing.repository';
import type { PriceListView, PricingService } from './pricing.service';
import { PRICING_SERVICE } from './tokens';

/**
 * لیست قیمت — /price-lists و /price-lists/{id} مطابق openapi.yaml.
 * خواندن master.price.view؛ ساخت/ویرایش master.price.update. شرکت از نشست می‌آید.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('price-lists')
export class PriceListController {
  constructor(@Inject(PRICING_SERVICE) private readonly service: PricingService) {}

  @Get()
  @RequirePermissions('master.price.view')
  list(
    @Query() query: ListPriceListsQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<PriceListRow>> {
    return this.service.listPriceLists(companyId, query);
  }

  @Post()
  @RequirePermissions('master.price.update')
  create(
    @Body() dto: CreatePriceListDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ): Promise<PriceListView> {
    return this.service.createPriceList(companyId, dto, userId);
  }

  @Get(':id')
  @RequirePermissions('master.price.view')
  get(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<PriceListView> {
    return this.service.getPriceList(companyId, id);
  }

  @Patch(':id')
  @RequirePermissions('master.price.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePriceListDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ): Promise<PriceListView> {
    return this.service.updatePriceList(companyId, id, dto, userId);
  }
}
