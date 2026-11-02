import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDefined,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** @IsOptional مقدار null را هم می‌پذیرد (فیلدهای nullableِ قرارداد مانند parent_area_id و visit_weekday) */

// ---------------- حوزه فروش (/areas) ----------------

export class ListAreasQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @IsOptional()
  @IsUUID('4')
  parent_area_id?: string;
}

/** openapi › schemas.Area — code و name طبق قرارداد الزامی‌اند */
export class CreateAreaDto {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  /** شعبهٔ مالک حوزه؛ اگر نیاید شعبهٔ پیش‌فرض شرکت گرفته می‌شود */
  @IsOptional()
  @IsUUID('4')
  branch_id?: string;

  @IsOptional()
  @IsUUID('4')
  parent_area_id?: string | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class UpdateAreaDto extends PartialType(CreateAreaDto) {}

// ---------------- مسیر فروش (/routes) ----------------

export class ListRoutesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @IsOptional()
  @IsUUID('4')
  area_id?: string;
}

/** openapi › schemas.Route — area_id، code و name طبق قرارداد الزامی‌اند */
export class CreateRouteDto {
  @IsDefined()
  @IsUUID('4')
  area_id: string;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code: string;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  /** روز بازدید هفتگی — ۰=شنبه … ۵=جمعه (nullable در قرارداد) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  visit_weekday?: number | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  /** ترتیب مشتریان در مسیر (ترتیب آرایه = ترتیب بازدید) */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  customer_ids?: string[];
}

export class UpdateRouteDto extends PartialType(CreateRouteDto) {}
