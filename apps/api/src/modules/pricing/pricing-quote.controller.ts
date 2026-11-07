import { Body, Controller, Get, Inject, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser, type AuthContext } from '../identity-rbac/auth-context.decorator';
import { permissionMatches } from '../identity-rbac/permissions';
import { ListPriceChangesQueryDto, QuoteRequestDto } from './pricing.dto';
import type { PricingEngineService } from './pricing-engine.service';
import { PRICING_ENGINE_SERVICE } from './pricing.tokens';

/**
 * استعلام و شبیه‌سازیِ قیمت — دو مسیرِ مجزا با دو مجوزِ مجزا:
 *   POST /pricing/quote     : حلِ قطعیِ قیمت برای خطوطِ سفارش (بدونِ ثبتِ audit سنگین)
 *   POST /pricing/simulate  : شبیه‌سازیِ کاملِ تجاری + ثبتِ ردیفِ ممیزی (نه سند)
 *
 * هیچ‌یک از این دو مسیر سند/تراکنشِ کسب‌وکار نمی‌سازد؛ مصرفِ تشویق فقط از مسیرِ
 * صریحِ ایجادِ سفارش (POST /orders با apply_pricing_engine) ثبت می‌شود.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('pricing')
export class PricingQuoteController {
  constructor(@Inject(PRICING_ENGINE_SERVICE) private readonly service: PricingEngineService) {}

  /**
   * پرچم‌های «قیمتِ دستی» و «عبور از سقفِ تخفیف» هرگز از بدنهٔ درخواست پذیرفته
   * نمی‌شوند؛ فقط از مجوزهای نشست استخراج می‌شوند (TASK-24، کنترلِ تخفیفِ غیرمجاز).
   * کاربرِ بدونِ مجوز که قیمتِ دستی بفرستد، از موتور ۴۰۳ با دلیلِ صریح می‌گیرد.
   */
  private escalationFlags(user: AuthContext): Pick<QuoteRequestDto, 'allow_manual_price' | 'allow_discount_override'> {
    const has = (code: string) => user.permissions.some((granted) => permissionMatches(granted, code));
    return {
      allow_manual_price: has('pricing.manual_price.apply'),
      allow_discount_override: has('pricing.discount.override'),
    };
  }

  @Post('quote')
  @RequirePermissions('master.price.view')
  quote(
    @Body() dto: QuoteRequestDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser() user: AuthContext,
  ) {
    return this.service.quote(companyId, { ...dto, ...this.escalationFlags(user) });
  }

  @Post('simulate')
  @RequirePermissions('pricing.simulation.run')
  simulate(
    @Body() dto: QuoteRequestDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser() user: AuthContext,
  ) {
    return this.service.simulate(companyId, userId, { ...dto, ...this.escalationFlags(user) });
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
