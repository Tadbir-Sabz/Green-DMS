import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import {
  CreatePromotionDto,
  ListPromotionsQueryDto,
  UpdatePromotionDto,
} from './pricing.dto';
import type { PromotionView, PricingService } from './pricing.service';
import { PRICING_SERVICE } from './tokens';

/**
 * تشویق (تخفیف/جایزه) — /promotions و /promotions/{id} مطابق openapi.yaml.
 * خواندن master.promotion.view؛ ساخت/ویرایش master.promotion.update. شرکت از نشست می‌آید.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('promotions')
export class PromotionController {
  constructor(@Inject(PRICING_SERVICE) private readonly service: PricingService) {}

  @Get()
  @RequirePermissions('master.promotion.view')
  list(
    @Query() query: ListPromotionsQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<PromotionView>> {
    return this.service.listPromotions(companyId, query);
  }

  @Post()
  @RequirePermissions('master.promotion.update')
  create(
    @Body() dto: CreatePromotionDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ): Promise<PromotionView> {
    return this.service.createPromotion(companyId, dto, userId);
  }

  @Get(':id')
  @RequirePermissions('master.promotion.view')
  get(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<PromotionView> {
    return this.service.getPromotion(companyId, id);
  }

  @Patch(':id')
  @RequirePermissions('master.promotion.update')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePromotionDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ): Promise<PromotionView> {
    return this.service.updatePromotion(companyId, id, dto, userId);
  }
}
