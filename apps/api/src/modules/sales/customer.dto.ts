import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** مقادیر مجاز channel — دقیقاً check قید جدول customer (مهاجرت 0007) */
export const CUSTOMER_CHANNELS = ['retail', 'wholesale', 'chain', 'horeca', 'institution'] as const;
export type CustomerChannel = (typeof CUSTOMER_CHANNELS)[number];

/** مقادیر مجاز status — دقیقاً check قید جدول customer */
export const CUSTOMER_STATUSES = ['active', 'suspended', 'blocked', 'closed'] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

/** منشأ موقعیت در ستون‌های geo_* — check جدول customer (import فقط برای داده وارداتی) */
export const GEO_SOURCES = ['gps', 'map_pick', 'geocode', 'import'] as const;
export type GeoSource = (typeof GEO_SOURCES)[number];

/** منشأ ثبت موقعیت در /customers/{id}/location — enum قرارداد (بدون import) */
export const LOCATION_SOURCES = ['gps', 'map_pick', 'geocode'] as const;

/** پارامتر query بولینی openapi («true»/«false») را به boolean تبدیل می‌کند */
const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
};

/** openapi › schemas.GeoPoint — [طول، عرض] به WGS84 (محدوده دقیق در سرویس سنجیده می‌شود) */
export class GeoPointDto {
  @IsIn(['Point'])
  type: 'Point';

  @IsDefined()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2)
  @IsNumber({}, { each: true })
  coordinates: [number, number];
}

/**
 * POST /api/v1/customers — openapi › schemas.Customer
 * person_id و code طبق قرارداد الزامی‌اند؛ branch_id اختیاری است و شعبه
 * پیش‌فرض شرکت گرفته می‌شود (ستون branch_id NOT NULL است).
 */
export class CreateCustomerDto {
  @IsDefined()
  @IsUUID('4')
  person_id: string;

  @IsOptional()
  @IsUUID('4')
  branch_id?: string;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code: string;

  @IsOptional()
  @IsUUID('4')
  area_id?: string | null;

  @IsOptional()
  @IsUUID('4')
  route_id?: string | null;

  /** ویزیتور ثابت — شناسه ردیف staff (قرارداد salesperson_id) */
  @IsOptional()
  @IsUUID('4')
  salesperson_id?: string | null;

  @IsOptional()
  @IsIn(CUSTOMER_CHANNELS)
  channel?: CustomerChannel;

  @IsOptional()
  @IsUUID('4')
  price_list_id?: string | null;

  @IsOptional()
  @IsUUID('4')
  settlement_term_id?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  visit_sequence?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => GeoPointDto)
  geo?: GeoPointDto | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  geo_accuracy_m?: number;

  @IsOptional()
  @IsIn(GEO_SOURCES)
  geo_source?: GeoSource;

  /** سقف اعتبار به رشته اعشاری (طبق قرارداد) — در customer_credit ذخیره می‌شود */
  @IsOptional()
  @IsNumberString()
  @MaxLength(32)
  credit_limit?: string;

  @IsOptional()
  @IsIn(CUSTOMER_STATUSES)
  status?: CustomerStatus;
}

/** PATCH /api/v1/customers/{id} — همه فیلدها اختیاری */
export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {
  /** قفل خوش‌بینانه: اگر بیاید باید با row_version فعلی سرور یکی باشد وگرنه 409 version_conflict */
  @IsOptional()
  @IsInt()
  @Min(0)
  row_version?: number;
}

/** GET /api/v1/customers — فیلترهای قرارداد + صفحه‌بندی cursor */
export class ListCustomersQueryDto {
  /** جست‌وجوی فازی روی کد و نام شخص */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  q?: string;

  @IsOptional()
  @IsUUID('4')
  route_id?: string;

  @IsOptional()
  @IsUUID('4')
  area_id?: string;

  @IsOptional()
  @IsUUID('4')
  salesperson_id?: string;

  @IsOptional()
  @IsIn(CUSTOMER_CHANNELS)
  channel?: CustomerChannel;

  /** فقط دارای موقعیت ثبت‌شده */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  has_location?: boolean;

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

/** PUT /api/v1/customers/{id}/location — openapi › ثبت/تصحیح موقعیت روی نقشه */
export class UpdateLocationDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => GeoPointDto)
  geo: GeoPointDto;

  @IsOptional()
  @IsNumber()
  @Min(0)
  accuracy_m?: number;

  @IsOptional()
  @IsIn(LOCATION_SOURCES as unknown as string[])
  source?: (typeof LOCATION_SOURCES)[number];
}
