import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { ModuleInfo } from '../../common/module-info';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { ONBOARDING_SERVICE } from './tokens';
import type { OnboardingService } from './onboarding.service';
import { RegisterTenantDto, type RegisterTenantResult } from './onboarding.dto';
import { clientIpOf, getOnboardingGuard } from './abuse-control';

/**
 * ساختارِ حداقلیِ چیزی که از express Request/Response لازم داریم — تا کنترلر به
 * تایپ‌هایِ express وابسته نباشد و در تست‌هایِ واحد با شیءِ ساده قابلِ ساخت باشد.
 */
interface ReqLike {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}
interface ResLike {
  setHeader(name: string, value: string | number): void;
}

/**
 * خودخدمت‌دهیِ استقرار — openapi › POST /onboarding/register.
 * ثبتِ اجارهٔ جدید (شرکت + شعبه + نقش‌ها + حسابِ مدیر) به‌صورت عمومی و بدونِ نشست.
 *
 * محافظت در برابرِ سوءاستفاده (P0): نرخ‌گذاریِ لغزان در دو سطح (سقفِ ساعتیِ هر IP و
 * سقفِ روزانهٔ سراسری) با پاسخِ ۴۲۹ و سرصفحهٔ Retry-After؛ سیاستِ رمز و حالتِ
 * کدِ دعوت در سرویس؛ و ممیزیِ «هر» تلاش در onboarding_attempt. CAPTCHA بیرونی
 * «الزامی» نیست — طبقِ الزامِ کار، راه‌حل نباید به سرویسِ شخصِ ثالث وابسته شود.
 */
@Controller('onboarding')
export class OnboardingController {
  constructor(@Inject(ONBOARDING_SERVICE) private readonly service: OnboardingService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterTenantDto,
    @Req() req: ReqLike,
    @Res({ passthrough: true }) res: ResLike,
  ): Promise<RegisterTenantResult> {
    const clientIp = clientIpOf(req);
    const userAgent = (() => {
      const raw = req.headers?.['user-agent'];
      return Array.isArray(raw) ? raw[0] : raw;
    })();
    const meta = { clientIp, userAgent: userAgent ?? null };
    const guard = getOnboardingGuard();

    // --- نرخ‌گذاریِ لغزان: نخست سهمیهٔ IP، سپس سقفِ سراسری ---
    const ipDecision = guard.perIp.hit(clientIp);
    if (!ipDecision.allowed) {
      await this.rejectRateLimited(res, ipDecision, 'ip_hour_limit', dto, meta);
    }
    const globalDecision = guard.global.hit('global');
    if (!globalDecision.allowed) {
      await this.rejectRateLimited(res, globalDecision, 'global_day_limit', dto, meta);
    }

    // سرصفحه‌هایِ استانداردِ نرخ تا کلاینت سهمیهٔ خود را ببیند (بدونِ افشایِ سیاستِ داخلی)
    // نامِ سرصفحه‌ها همان است که در قرارداد (components.responses.TooManyRequests)
    // مستند شده: RateLimit-Limit / RateLimit-Remaining / RateLimit-Reset.
    res.setHeader('RateLimit-Limit', String(ipDecision.limit));
    res.setHeader('RateLimit-Remaining', String(ipDecision.remaining));
    res.setHeader('RateLimit-Reset', String(ipDecision.retry_after_sec || Math.ceil(3600)));

    return this.service.register(dto, meta);
  }

  /** ۴۲۹ با Retry-After و ثبتِ ممیزیِ تلاشِ رد‌شده. هرگز نمی‌رسد به ساختِ اجاره. */
  private async rejectRateLimited(
    res: ResLike,
    decision: { limit: number; retry_after_sec: number },
    reason: string,
    dto: RegisterTenantDto,
    meta: { clientIp: string; userAgent: string | null },
  ): Promise<never> {
    res.setHeader('Retry-After', String(decision.retry_after_sec));
    res.setHeader('RateLimit-Limit', String(decision.limit));
    res.setHeader('RateLimit-Remaining', '0');
    res.setHeader('RateLimit-Reset', String(decision.retry_after_sec));
    await this.service.recordRejection('rejected_rate_limit', reason, dto, meta);
    throw new HttpException(
      {
        code: 'too_many_requests',
        scope: reason,
        retry_after_sec: decision.retry_after_sec,
        message_fa:
          'تعدادِ تلاش‌هایِ ثبتِ شرکت از حدِ مجاز گذشت. لطفاً کمی بعد دوباره تلاش کنید.',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
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
