import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import {
  CreateCouponDto,
  CreateMarginExceptionDto,
  CreateMarginPolicyDto,
  CreatePricingDomainDto,
  DecideMarginExceptionDto,
  ListCustomerPricesQueryDto,
  ListMarginExceptionsQueryDto,
  UpdateCustomerPriceDto,
  UpdateMarginPolicyDto,
  UpdatePricingDomainDto,
  CreateCustomerPriceDto,
} from './pricing.dto';
import type { PricingEngineService } from './pricing-engine.service';
import { PRICING_ENGINE_SERVICE } from './pricing.tokens';

/**
 * مدیریتِ قیمت/تخفیف در سطحِ شرکت و قلمرو:
 *   قلمروها (pricing-domains) · سیاستِ کفِ سود (margin-policies) · استثنا (margin-exceptions)
 *   قیمتِ اختصاصیِ مشتری (customer-prices) · کوپن (promotions/{id}/coupons)
 *
 * تفکیکِ مجوزها عمدی است: تنظیمِ سیاست (update) از تأییدِ استثنا (override) جدا است تا
 * یک نفر نتواند هم سیاست را بشکند و هم استثنای خودش را تأیید کند.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller()
export class PricingAdminController {
  constructor(@Inject(PRICING_ENGINE_SERVICE) private readonly service: PricingEngineService) {}

  // ---------------- قلمرو ----------------

  @Get('pricing-domains')
  @RequirePermissions('master.price.view')
  listDomains(@CurrentUser('companyId') companyId: string) {
    return this.service.listDomains(companyId);
  }

  @Post('pricing-domains')
  @RequirePermissions('master.price.update')
  createDomain(
    @Body() dto: CreatePricingDomainDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.service.createDomain(companyId, userId, dto);
  }

  @Patch('pricing-domains/:id')
  @RequirePermissions('master.price.update')
  updateDomain(
    @Param('id') id: string,
    @Body() dto: UpdatePricingDomainDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.service.updateDomain(companyId, userId, id, dto);
  }

  // ---------------- سیاستِ کفِ سود ----------------

  @Get('margin-policies')
  @RequirePermissions('pricing.margin.view')
  listMarginPolicies(@CurrentUser('companyId') companyId: string) {
    return this.service.listMarginPolicies(companyId);
  }

  @Post('margin-policies')
  @RequirePermissions('pricing.margin.update')
  createMarginPolicy(
    @Body() dto: CreateMarginPolicyDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.service.createMarginPolicy(companyId, userId, dto);
  }

  @Patch('margin-policies/:id')
  @RequirePermissions('pricing.margin.update')
  updateMarginPolicy(
    @Param('id') id: string,
    @Body() dto: UpdateMarginPolicyDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.service.updateMarginPolicy(companyId, userId, id, dto);
  }

  // ---------------- استثنا ----------------

  @Get('margin-exceptions')
  @RequirePermissions('pricing.margin.view')
  listMarginExceptions(
    @Query() query: ListMarginExceptionsQueryDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.listMarginExceptions(companyId, query.status, query.limit ?? 100);
  }

  @Post('margin-exceptions')
  @RequirePermissions('pricing.margin.update')
  createMarginException(
    @Body() dto: CreateMarginExceptionDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.service.createMarginException(companyId, userId, dto);
  }

  /** تصمیمِ شخصِ دوم — مجوزِ جدا و الزامِ «تصمیم‌گیرنده ≠ درخواست‌دهنده» */
  @Post('margin-exceptions/:id/decision')
  @RequirePermissions('pricing.margin.override')
  decideMarginException(
    @Param('id') id: string,
    @Body() dto: DecideMarginExceptionDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.service.decideMarginException(companyId, userId, id, dto);
  }

  // ---------------- قیمتِ اختصاصیِ مشتری ----------------

  @Get('customer-prices')
  @RequirePermissions('master.price.view')
  listCustomerPrices(
    @Query() query: ListCustomerPricesQueryDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.listCustomerPrices(companyId, query.customer_id, query.product_id, query.limit ?? 100);
  }

  @Post('customer-prices')
  @RequirePermissions('master.price.update')
  createCustomerPrice(
    @Body() dto: CreateCustomerPriceDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.service.createCustomerPrice(companyId, userId, dto);
  }

  @Patch('customer-prices/:id')
  @RequirePermissions('master.price.update')
  updateCustomerPrice(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerPriceDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.service.updateCustomerPrice(companyId, userId, id, dto);
  }

  // ---------------- کوپن ----------------

  @Get('coupons')
  @RequirePermissions('master.promotion.view')
  listCoupons(
    @Query('promotion_id') promotionId: string | undefined,
    @Query('limit') limit: string | undefined,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.listCoupons(companyId, promotionId, limit ? Number(limit) : 100);
  }

  @Post('promotions/:id/coupons')
  @RequirePermissions('master.promotion.update')
  createCoupon(
    @Param('id') promotionId: string,
    @Body() dto: CreateCouponDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.service.createCoupon(companyId, userId, promotionId, dto);
  }

  @Patch('coupons/:id')
  @RequirePermissions('master.promotion.update')
  setCouponActive(
    @Param('id') id: string,
    @Body() body: { is_active?: boolean },
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.service.setCouponActive(companyId, userId, id, body?.is_active !== false);
  }
}
