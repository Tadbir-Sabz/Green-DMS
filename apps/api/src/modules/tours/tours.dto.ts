import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** enumهای هماهنگ با قرارداد (openapi › schemas.Tour) و DDL مهاجرت 0011+0032 */
export const TOUR_KINDS = ['cold', 'warm', 'distribution', 'telesales'] as const;
export const TOUR_STATUSES = ['planned', 'active', 'settled', 'closed'] as const;
// هم‌تراز با CHECK جدول visit (مهاجرت 0011): مقادیر پیش‌تر (ordered/customer_absent)
// توسط دیتابیس رد می‌شدند (check_violation → ۴۰۰) و پاسخ check-in ('order') با
// اسکیمای قرارداد نمی‌خواند.
export const VISIT_RESULTS = ['order', 'no_order', 'closed', 'payment_only', 'return_only'] as const;

/** نقطه جغرافیایی — schemas.GeoPoint ([طول، عرض]) */
export class GeoPointDto {
  @IsIn(['Point'])
  type!: 'Point';

  @IsArray()
  @IsNumber({}, { each: true })
  coordinates!: number[];
}

// ---------------- Tours ----------------

/** GET /tours */
export class ListToursQueryDto {
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
  @IsDateString()
  tour_date?: string;

  @IsOptional()
  @IsIn([...TOUR_KINDS])
  kind?: string;

  @IsOptional()
  @IsUUID('4')
  salesperson_id?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

/** POST /tours — شروع/تخصیص تور */
export class CreateTourDto {
  @IsDateString()
  tour_date!: string;

  @IsIn([...TOUR_KINDS])
  kind!: string;

  @IsUUID('4')
  salesperson_id!: string;

  @IsOptional()
  @IsUUID('4')
  supervisor_id?: string;

  @IsOptional()
  @IsUUID('4')
  route_id?: string;

  @IsOptional()
  @IsUUID('4')
  vehicle_id?: string;

  @IsOptional()
  @IsUUID('4')
  warehouse_id?: string;

  @IsOptional()
  @IsDateString()
  planned_start_at?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** PATCH /tours/{id} — شروع/پایان/یادداشت/وضعیت */
export class UpdateTourDto {
  @IsOptional()
  @IsIn([...TOUR_STATUSES])
  status?: string;

  @IsOptional()
  @IsDateString()
  started_at?: string;

  @IsOptional()
  @IsDateString()
  ended_at?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsUUID('4')
  supervisor_id?: string;

  @IsOptional()
  @IsUUID('4')
  vehicle_id?: string;
}

// ---------------- Visits ----------------

/** GET /visits */
export class ListVisitsQueryDto {
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
  tour_id?: string;

  @IsOptional()
  @IsUUID('4')
  customer_id?: string;
}

/** POST /visits — check-in با مختصات (ضدتقلب GPS) */
export class CreateVisitDto {
  @IsUUID('4')
  tour_id!: string;

  @IsUUID('4')
  customer_id!: string;

  @IsOptional()
  @IsDateString()
  check_in_at?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => GeoPointDto)
  geo_in?: GeoPointDto;

  @IsOptional()
  @IsNumber()
  accuracy_in_m?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  device_id?: string;

  @IsOptional()
  @IsUUID('4')
  client_uuid?: string;
}

/** PATCH /visits/{id} — check-out و نتیجه بازدید */
export class UpdateVisitDto {
  @IsOptional()
  @IsDateString()
  check_out_at?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => GeoPointDto)
  geo_out?: GeoPointDto;

  @IsOptional()
  @IsIn([...VISIT_RESULTS])
  result?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  no_order_reason?: string;
}
