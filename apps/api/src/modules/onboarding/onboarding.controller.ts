import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { ModuleInfo } from '../../common/module-info';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { ONBOARDING_SERVICE } from './tokens';
import type { OnboardingService } from './onboarding.service';
import { RegisterTenantDto, type RegisterTenantResult } from './onboarding.dto';

/**
 * خودخدمت‌دهیِ استقرار — openapi › POST /onboarding/register.
 * ثبتِ اجارهٔ جدید (شرکت + شعبه + نقش‌ها + حسابِ مدیر) به‌صورت عمومی و بدونِ نشست،
 * اما با اعتبارسنجیِ سخت‌گیرانهٔ ورودی. هشِ رمز در سرویس با scrypt انجام می‌شود.
 *
 * ⚠️ امنیتی (برای تولید): این endpoint عمومی است و باید پشتِ نرخ‌گذاری (rate-limit)،
 * CAPTCHA یا کدِ دعوت و در صورتِ نیاز «صفِ تأیید» قرار گیرد تا از ساختِ انبوه/سوءاستفاده
 * جلوگیری شود. این الزام در گزارشِ تحویل هم مستند شده است.
 */
@Controller('onboarding')
export class OnboardingController {
  constructor(@Inject(ONBOARDING_SERVICE) private readonly service: OnboardingService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterTenantDto): Promise<RegisterTenantResult> {
    return this.service.register(dto);
  }

  @UseGuards(AuthGuard, PermissionsGuard)
  @Get()
  @RequirePermissions('admin.user.manage')
  info(): ModuleInfo {
    return {
      module: 'onboarding',
      title: 'خودخدمت‌دهیِ استقرار',
      resources: ['register'],
      status: 'implemented',
    };
  }
}
