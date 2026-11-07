import { Body, Controller, Get, Inject, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser, type AuthContext } from '../identity-rbac/auth-context.decorator';
import { permissionMatches } from '../identity-rbac/permissions';
import { ListPriceChangesQueryDto, QuoteRequestDto } from './pricing.dto';
import type { PricingEngineService, QuoteRunOptions } from './pricing-engine.service';
import { PRICING_ENGINE_SERVICE } from './pricing.tokens';

/**
 * استعلام و شبیه‌سازیِ قیمت — دو مسیرِ مجزا با دو مجوزِ مجزا:
 *   POST /pricing/quote     : حلِ قطعیِ قیمت برای خطوطِ سفارش (بدونِ ثبتِ audit سنگین)
 *   POST /pricing/simulate  : شبیه‌سازیِ کاملِ تجاری + ثبتِ ردیفِ ممیزی (نه سند)
 *
 * هیچ‌یک از این دو مسیر سند/تراکنشِ کسب‌وکار نمی‌سازد؛ مصرفِ تشویق فقط از مسیرِ
 * ایجادِ سفارش (POST/PATCH /orders — که همیشه از موتور می‌گذرد) ثبت می‌شود.
 * TASK-24F · HIGH-1: پرچمِ کلاینتیِ `apply_pricing_engine` وجود ندارد.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('pricing')
export class PricingQuoteController {
  constructor(@Inject(PRICING_ENGINE_SERVICE) private readonly service: PricingEngineService) {}

  /**
   * پرچم‌های «قیمتِ دستی»/«عبور از سقفِ تخفیف»/«بین‌قلمرویی» نه در DTO هستند و نه از
   * بدنه خوانده می‌شوند؛ فقط از مجوزهای نشست ساخته می‌شوند (TASK-24F · HIGH-3).
   */
  private runOptions(user: AuthContext, dto: QuoteRequestDto): QuoteRunOptions {
    const has = (code: string) => user.permissions.some((granted) => permissionMatches(granted, code));
    return {
      allow_manual_price: has('pricing.manual_price.apply'),
      allow_discount_override: has('pricing.discount.override'),
      allow_cross_domain_price_list: has('pricing.price_list.cross_domain'),
      cross_domain_reason: dto.cross_domain_reason ?? null,
      actor_user_id: user.userId ?? null,
    };
  }

  @Post('quote')
  @RequirePermissions('master.price.view')
  quote(
    @Body() dto: QuoteRequestDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser() user: AuthContext,
  ) {
    return this.service.quote(companyId, dto, this.runOptions(user, dto));
  }

  @Post('simulate')
  @RequirePermissions('pricing.simulation.run')
  simulate(
    @Body() dto: QuoteRequestDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser() user: AuthContext,
  ) {
    return this.service.simulate(companyId, userId, dto, this.runOptions(user, dto));
  }

  @Get('price-changes')
  @RequirePermissions('pricing.audit.view')
  priceChanges(
    @Query() query: ListPriceChangesQueryDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.service.listPriceChanges(companyId, query.entity_type, query.limit ?? 100);
  }
}
