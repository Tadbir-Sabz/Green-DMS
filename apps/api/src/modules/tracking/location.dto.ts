import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsDefined,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsUUID,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';

/** GeoPoint قرارداد: { type:'Point', coordinates:[lon,lat] } */
export class GeoPointInputDto {
  @IsIn(['Point'])
  type!: 'Point';

  @IsArray()
  @IsNumber({}, { each: true })
  coordinates!: [number, number];
}

/** یک نمونه موقعیت — LocationSample در openapi (speed_kmh) */
export class LocationSampleDto {
  @IsUUID('4')
  staff_id!: string;

  @IsDateString()
  at!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => GeoPointInputDto)
  geo!: GeoPointInputDto;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  accuracy_m?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  speed_kmh?: number;

  @IsOptional()
  @Type(() => Boolean)
  is_mocked?: boolean;
}

/** POST /tracking/locations — ارسال دسته‌ای از صف آفلاین */
export class PostLocationsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => LocationSampleDto)
  samples!: LocationSampleDto[];
}

/** GET /tracking/locations — فیلترهای نقشه رهگیری */
export class ListLocationsQueryDto {
  @IsOptional()
  @IsUUID('4')
  staff_id?: string;

  @IsOptional()
  @IsDateString()
  since?: string;
}

/** POST /tracking/routes — محاسبه بهترین مسیر */
export class CreateRouteDto {
  @IsOptional()
  @IsDateString()
  plan_date?: string;

  @IsArray()
  @IsUUID('4', { each: true })
  customer_ids!: string[];

  @IsOptional()
  @IsIn(['neshan', 'mapir', 'osrm_selfhosted'])
  provider?: string;

  @IsOptional()
  @IsIn(['min_duration', 'min_distance'])
  objective?: string;
}

/** GET /tracking/routes */
export class ListRoutesQueryDto {
  @IsOptional()
  @IsUUID('4')
  staff_id?: string;

  @IsOptional()
  @IsDateString()
  plan_date?: string;
}
