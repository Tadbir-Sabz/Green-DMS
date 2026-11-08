import { Body, Controller, Get, Inject, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser, type AuthContext } from '../identity-rbac/auth-context.decorator';
import { ListPriceChangesQueryDto, QuoteRequestDto } from './pricing.dto';
import type { PricingEngineService } from './pricing-engine.service';
import { pricingPermissionsFromSession } from './pricing-permissions';
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
   * TASK-24W: همین قاعده در `pricing-permissions.ts` یک‌جا شده و مسیرِ تبدیلِ
   * درخواست به سفارش هم از همان استفاده می‌کند.
   */

  @Post('quote')
  @RequirePermissions('master.price.view')
  async quote(
    @Body() dto: QuoteRequestDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser() user: AuthContext,
  ) {
    // TASK-24W · HIGH-2-R1: همان مسیرِ سیاستِ سفارش (فقط بدونِ ماندگاریِ سند)
    const priced = await this.service.quoteWithPolicy(
      companyId,
      userId ?? null,
      dto,
      pricingPermissionsFromSession(user),
    );
    return {
      ...priced.quote,
      // فیلدهای تازه (افزایشی، بدونِ شکستنِ کلاینت) — سیاست و زمینهٔ مؤثر
      policy_applied: {
        pricing_settings: priced.settings,
        pricing_date: priced.pricing_date,
        source: 'pricing_policy' as const,
      },
      system_unit_prices: priced.system_unit_prices,
    };
  }

  @Post('simulate')
  @RequirePermissions('pricing.simulation.run')
  simulate(
    @Body() dto: QuoteRequestDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser() user: AuthContext,
  ) {
    return this.service.simulate(
      companyId,
      userId,
      dto,
      pricingPermissionsFromSession(user),
    );
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
