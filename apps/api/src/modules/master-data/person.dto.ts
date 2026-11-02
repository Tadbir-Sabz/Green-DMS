import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** مقادیر مجاز legal_type — دقیقاً check قید جدول person (مهاجرت 0004 §۱.۱) */
export const LEGAL_TYPES = ['natural', 'legal'] as const;
export type LegalType = (typeof LEGAL_TYPES)[number];

/**
 * POST /api/v1/persons — openapi › schemas.Person
 * کد شخص در شرکت یکتاست (قید uq_person_code) و «نام» بر اساس legal_type
 * الزامی است؛ هر دو قاعده را پیش از رسیدن به دیتابیس می‌سنجیم تا پاسخ 400
 * فارسی و روشن باشد به‌جای خطای check قید (23514).
 */
export class CreatePersonDto {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code: string;

  @IsDefined()
  @IsIn(LEGAL_TYPES)
  legal_type: LegalType;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  first_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  last_name?: string;

  /** فقط برای شخص حقوقی (legal) */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  legal_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  national_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  economic_code?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

/** PATCH /api/v1/persons/{id} — همه فیلدها اختیاری (is_active غیرفعال‌سازی منطقی) */
export class UpdatePersonDto extends PartialType(CreatePersonDto) {}

/** GET /api/v1/persons — جست‌وجوی فازی + فیلتر نوع شخص + صفحه‌بندی cursor */
export class ListPersonsQueryDto {
  /** جست‌وجوی فازی روی کد/نام/نام حقوقی/شناسه ملی */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  q?: string;

  @IsOptional()
  @IsIn(LEGAL_TYPES)
  legal_type?: LegalType;

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
