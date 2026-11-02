import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** پارامتر query بولینی openapi («true»/«false») را به boolean تبدیل می‌کند */
const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (typeof value !== 'string') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

/** حلقه‌های مختصات GeoJSON Polygon: [lng, lat] */
export class GeoPolygonDto {
  @IsDefined()
  @IsIn(['Polygon'])
  type: 'Polygon';

  @IsDefined()
  @IsArray()
  coordinates: number[][][];
}

/**
 * POST /geofences — kindهای DDL (مهاجرت 0012):
 * work_area | customer | warehouse | restricted؛ برای customer باید customer_id بیاید.
 */
export class CreateGeofenceDto {
  @IsDefined()
  @IsString()
  @MaxLength(120)
  name: string;

  @IsDefined()
  @IsIn(['work_area', 'customer', 'warehouse', 'restricted'])
  kind: 'work_area' | 'customer' | 'warehouse' | 'restricted';

  @IsDefined()
  @Type(() => GeoPolygonDto)
  area: GeoPolygonDto;

  @IsOptional()
  @IsUUID('4')
  customer_id?: string;

  @IsOptional()
  @IsUUID('4')
  warehouse_id?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

/** PATCH /geofences/{id} — همه فیلدها اختیاری (به‌روزرسانی جزئی) */
export class UpdateGeofenceDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsIn(['work_area', 'customer', 'warehouse', 'restricted'])
  kind?: 'work_area' | 'customer' | 'warehouse' | 'restricted';

  @IsOptional()
  @Type(() => GeoPolygonDto)
  area?: GeoPolygonDto;

  @IsOptional()
  @IsUUID('4')
  customer_id?: string;

  @IsOptional()
  @IsUUID('4')
  warehouse_id?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

/** GET /geofences — فیلتر طبق openapi: is_active */
export class ListGeofencesQueryDto {
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
  @Transform(toBoolean)
  @IsBoolean()
  is_active?: boolean;
}
