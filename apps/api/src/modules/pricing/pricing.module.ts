import { Module } from '@nestjs/common';
import { IdentityRbacModule } from '../identity-rbac/identity-rbac.module';
import { RulesEngineModule } from '../rules-engine/rules-engine.module';
import { PricingAdminController } from './pricing-admin.controller';
import { PricingEngineRepository } from './pricing-engine.repository';
import { PricingEngineService } from './pricing-engine.service';
import { PricingQuoteController } from './pricing-quote.controller';
import { PRICING_ENGINE_REPOSITORY, PRICING_ENGINE_SERVICE } from './pricing.tokens';

/**
 * ماژولِ قیمت و تخفیف (TASK-24 · G-04 · P2).
 *
 * مرزهای معماری:
 *  - این ماژول فقط منطقِ قیمت/تشویق/کفِ سود/شبیه‌سازی را می‌شناسد؛ هیچ سندِ فروش
 *    نمی‌سازد و به جدول‌های سند نمی‌نویسد (جز دفترهای ممیزیِ خودش).
 *  - CRUDِ لیستِ قیمت/تشویق در ماژولِ master-data می‌ماند (سازگاریِ API) و همان‌جا
 *    به این سرویس برای اعتبارسنجیِ کفِ سود/تعریفِ تشویق وصل می‌شود.
 *  - RulesEngineModule وارد می‌شود تا اتصالِ اختیاریِ استثنای کفِ سود به زنجیرهٔ
 *    تأیید ممکن باشد؛ نبودِ زنجیره ⇒ کنترلِ دو‌شخصیِ اختصاصی (بدونِ دور زدن).
 */
@Module({
  imports: [IdentityRbacModule, RulesEngineModule],
  controllers: [PricingQuoteController, PricingAdminController],
  providers: [
    PricingEngineRepository,
    { provide: PRICING_ENGINE_REPOSITORY, useExisting: PricingEngineRepository },
    PricingEngineService,
    { provide: PRICING_ENGINE_SERVICE, useExisting: PricingEngineService },
  ],
  exports: [PRICING_ENGINE_SERVICE],
})
export class PricingModule {}
