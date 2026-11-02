import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** مقادیر مجاز kind — دقیقاً check قید جدول warehouse (مهاجرت 0008) */
export const WAREHOUSE_KINDS = [
  'main',
  'vehicle',
  'transit',
  'damaged',
  'quarantine',
  'consignment',
] as const;
export type WarehouseKind = (typeof WAREHOUSE_KINDS)[number];

/** پارامتر query بولینی openapi («true»/«false») را به boolean تبدیل می‌کند */
const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
};

/**
 * POST /api/v1/warehouses — openapi › schemas.Warehouse
 * code/name/kind الزامی‌اند؛ branch_id اختیاری است و شعبه پیش‌فرض شرکت گرفته می‌شود.
 * قید ck_warehouse_vehicle: «kind=vehicle ⟺ vehicle_id مقدار دارد» (در سرویس سنجیده می‌شود).
 */
export class CreateWarehouseDto {
  @IsOptional()
  @IsUUID('4')
  branch_id?: string;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code: string;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  name: string;

  @IsDefined()
  @IsIn(WAREHOUSE_KINDS)
  kind: WarehouseKind;

  @IsOptional()
  @IsUUID('4')
  parent_warehouse_id?: string | null;

  @IsOptional()
  @IsUUID('4')
  vehicle_id?: string | null;

  @IsOptional()
  @IsUUID('4')
  area_id?: string | null;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  allow_negative?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  is_active?: boolean;
}

/** PATCH /api/v1/warehouses/{id} — همه فیلدها اختیاری */
export class UpdateWarehouseDto extends PartialType(CreateWarehouseDto) {
  /** قفل خوش‌بینانه: اگر بیاید باید با row_version فعلی سرور یکی باشد وگرنه 409 version_conflict */
  @IsOptional()
  @IsInt()
  @Min(0)
  row_version?: number;
}

/** GET /api/v1/warehouses — فیلتر kind/شعبه + صفحه‌بندی cursor */
export class ListWarehousesQueryDto {
  @IsOptional()
  @IsIn(WAREHOUSE_KINDS)
  kind?: WarehouseKind;

  @IsOptional()
  @IsUUID('4')
  branch_id?: string;

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
}
