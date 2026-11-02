import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** POST /api/v1/auth/login — openapi › LoginRequest (username الزامی، رمز و OTP اختیاری) */
export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  username: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  password?: string;

  /**
   * کد پیامکی در ورود با رمز — ورودِ صرفاً OTP مسیر جدا دارد:
   * POST /auth/otp/request و POST /auth/otp/verify (پیاده‌شده در همین ماژول).
   */
  @IsOptional()
  @IsString()
  @MaxLength(8)
  otp_code?: string;
}

/** POST /api/v1/auth/refresh — openapi › { refresh_token } */
export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  refresh_token: string;
}

/** دلایل درخواست کد — openapi › purpose (پیش‌فرض سمت سرور: login) */
export const OTP_PURPOSES = ['login', 'password_reset', 'device_bind'] as const;

/** POST /api/v1/auth/otp/request — openapi › { username, purpose? } */
export class OtpRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  username: string;

  @IsOptional()
  @IsIn(OTP_PURPOSES)
  purpose?: (typeof OTP_PURPOSES)[number];
}

/** POST /api/v1/auth/otp/verify — openapi › { username, code, device_id? } */
export class OtpVerifyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  username: string;

  /** کد ۴ تا ۸ رقمی (محدوده قرارداد)؛ قالب رقمی با matches هم تأیید می‌شود */
  @IsString()
  @IsNotEmpty()
  @MinLength(4)
  @MaxLength(8)
  code: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  device_id?: string;
}

/**
 * POST /api/v1/auth/password-reset — openapi › schemas.PasswordResetRequest
 * کد باید با purpose=password_reset درخواست شده باشد (در سرویس سنجیده می‌شود)؛
 * رمز تازه طبق قرارداد دست‌کم ۸ نویسه است.
 */
export class PasswordResetDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  username: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(4)
  @MaxLength(8)
  code: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(256)
  new_password: string;
}
