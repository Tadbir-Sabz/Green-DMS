import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, type RequestLike } from './auth.guard';
import { CurrentUser } from './auth-context.decorator';
import {
  LoginDto,
  OtpRequestDto,
  OtpVerifyDto,
  PasswordResetDto,
  RefreshDto,
} from './auth.dto';
import { PermissionsGuard } from './permissions.guard';
import type { AuthSessionResponse, MeResponse } from './auth.service';
import { AuthService } from './auth.service';
import { AUTH_SERVICE } from './tokens';

const headerString = (value: string | string[] | undefined): string | null =>
  Array.isArray(value) ? (value[0] ?? null) : (value ?? null);

/** درخواست‌های HTTP برای متادیتا (ip/user-agent) — بدون وابستگی به types express */
type RequestWithMeta = RequestLike & { ip?: string };

/**
 * احراز هویت — دقیقاً مطابق openapi › /auth/*:
 * login (200)، refresh (200)، logout (204)، /auth/me (کاربر + نقش‌ها + مجوزها)،
 * otp/request (202 — پاسخ یکسان برای نام موجود و ناشناخته) و otp/verify (200/401/429).
 * مسیرهای عمومی (login/refresh/otp) guard ندارند؛ logout و me با AuthGuard محافظت می‌شوند.
 */
@Controller('auth')
export class AuthController {
  constructor(@Inject(AUTH_SERVICE) private readonly service: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto, @Req() req: RequestWithMeta): Promise<AuthSessionResponse> {
    return this.service.login(dto, {
      ip: req.ip,
      userAgent: headerString(req.headers['user-agent']),
    });
  }

  /** درخواست کد یک‌بارمصرف — 202 بدون بدنه، حتی اگر کاربر/شماره‌ای در کار نباشد */
  @Post('otp/request')
  @HttpCode(HttpStatus.ACCEPTED)
  requestOtp(@Body() dto: OtpRequestDto): Promise<void> {
    return this.service.requestOtp(dto);
  }

  /** تأیید کد و صدور نشست (خودِ کنترلر عمومی است؛ اعتبارسنجی در سرویس است) */
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  verifyOtp(@Body() dto: OtpVerifyDto, @Req() req: RequestWithMeta): Promise<AuthSessionResponse> {
    return this.service.verifyOtp(dto, {
      ip: req.ip,
      userAgent: headerString(req.headers['user-agent']),
      deviceId: dto.device_id ?? null,
    });
  }

  /** بازیابی رمز با کدِ دلیل password_reset — 204 بدون بدنه؛ نشستی صادر نمی‌شود */
  @Post('password-reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(@Body() dto: PasswordResetDto): Promise<void> {
    return this.service.resetPassword(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto, @Req() req: RequestWithMeta): Promise<AuthSessionResponse> {
    return this.service.refresh(dto.refresh_token, {
      ip: req.ip,
      userAgent: headerString(req.headers['user-agent']),
    });
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentUser('sessionId') sessionId: string): Promise<void> {
    await this.service.logout(sessionId);
  }

  @Get('me')
  @UseGuards(AuthGuard, PermissionsGuard)
  me(@CurrentUser('userId') userId: string): Promise<MeResponse> {
    return this.service.me(userId);
  }
}
