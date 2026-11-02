import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  Max,
  Min,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/** سطوح دسترسی کاربر (check: app_user_access_level — مهاجرت 0004 §۱.۴) */
export const ACCESS_LEVELS = [
  'web',
  'field_sales',
  'field_delivery',
  'field_telesales',
  'scope_only',
  'none',
] as const;

/** پارامتر query بولینی openapi («true»/«false») را به boolean تبدیل می‌کند */
const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
};

/**
 * POST /api/v1/users — openapi › schemas.User
 * فیلدهای فقط-خواندنی (id/locked_until/last_login_at/created_at) سرور تولید می‌کند؛
 * password/staff_id/نام شخص، افزوده‌های عملیاتی‌اند (قرارداد additionalProperties ندارد)
 * چون شخصِ همراه کاربر در جدول person الزامی است و رمز عبور برای ورود لازم می‌آید.
 */
export class CreateUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  username: string;

  /**
   * بدون رمز، کاربر قابل ورود نیست (ورود OTP در ماژول یکپارچه‌سازی پیامک می‌آید)؛
   * null بودن password_hash در DDL برای همان حالت آینده است.
   */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  password?: string;

  /** نسبت به پرسنل موجود: شخصِ همین پرسنل به کاربر می‌چسبد و شخص تازه ساخته نمی‌شود */
  @IsOptional()
  @IsUUID()
  staff_id?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  role_ids?: string[];

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsIn(ACCESS_LEVELS)
  access_level?: (typeof ACCESS_LEVELS)[number];

  // -------- شخصِ تازه (فقط وقتی staff_id داده نشده باشد) --------

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  person_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  first_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  last_name?: string;
}

/**
 * PATCH /api/v1/users/{id} — «نقش، فعالیت، قفل حساب» طبق خلاصه قرارداد؛
 * همه فیلدها اختیاری‌اند و نبودِ row_version در قرارداد یعنی بدون قفل خوش‌بینانه.
 */
export class UpdateUserDto extends PartialType(CreateUserDto) {
  /**
   * قفل دستی توسط مدیر؛ false یعنی باز کردن قفل (locked_until و شمارنده تلاش
   * هم صفر می‌شوند تا کاربر بتواند دوباره تلاش کند).
   */
  @IsOptional()
  @IsBoolean()
  is_locked?: boolean;
}

/** GET /api/v1/users — فیلتر نقش/فعال + صفحه‌بندی cursor (ضمیمه F) */
export class ListUsersQueryDto {
  /** کد یا شناسه نقش */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  role?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;
}
