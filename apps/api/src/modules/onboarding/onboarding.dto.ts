import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * بدنهٔ POST /onboarding/register — خودخدمت‌دهیِ ساختِ اجارهٔ جدید.
 * توجه: این کلاس باید در کنترلر با importِ «مقدار» بیاید تا ValidationPipe کار کند.
 */
export class RegisterTenantDto {
  @IsString()
  @MinLength(2)
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'کد شرکت فقط حروف، عدد، خط تیره یا زیرخط.' })
  company_code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  company_name!: string;

  @IsEmail({}, { message: 'ایمیل معتبر نیست.' })
  @MaxLength(160)
  admin_email!: string;

  @IsString()
  @MinLength(8, { message: 'رمز عبور دست‌کم ۸ نویسه است.' })
  @MaxLength(128)
  admin_password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  admin_first_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  admin_last_name?: string;
}

export interface RegisterTenantResult {
  company_id: string;
  branch_id: string;
  app_user_id: string;
  admin_username: string;
}
