import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * POST /api/v1/roles — openapi › schemas.Role
 * permission_codes الگوهای مجوزِ جدول permission (seed مهاجرت 0022) را نگاشت می‌کند؛
 * «*» همه مجوزها و «x.y» زیرمجموعه همان ماژول (سند §۱.۴).
 */
export class CreateRoleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  name: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  permission_codes?: string[];
}

/** PATCH /api/v1/roles/{id} — همه فیلدها اختیاری (is_system فقط-خواندنی است) */
export class UpdateRoleDto extends PartialType(CreateRoleDto) {}

/** GET /api/v1/roles — فقط صفحه‌بندی cursor طبق قرارداد */
export class ListRolesQueryDto {
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
