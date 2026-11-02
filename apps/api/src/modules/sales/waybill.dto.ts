import { Type } from 'class-transformer';
import {
  IsArray,
  IsDefined,
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

/** قلم حواله — Waybill.lines در openapi: product_id + qty الزامی، batch_id اختیاری */
export class WaybillLineDto {
  @IsDefined()
  @IsUUID('4')
  product_id: string;

  @IsDefined()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  qty: number;

  @IsOptional()
  @IsUUID('4')
  batch_id?: string;
}

/**
 * POST /waybills — فقط draft؛ صدور (issued) با سندِ وضعیتِ جدا و مجوز
 * sales.waybill.issue انجام می‌شود.
 */
export class CreateWaybillDto {
  @IsDefined()
  @IsUUID('4')
  sales_order_id: string;

  @IsDefined()
  @IsUUID('4')
  warehouse_id: string;

  @IsOptional()
  @IsUUID('4')
  customer_id?: string;

  @IsOptional()
  @IsIn(['draft'])
  status?: 'draft';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WaybillLineDto)
  lines?: WaybillLineDto[];
}

/** GET /waybills — فیلترها طبق openapi: order_id و status */
export class ListWaybillsQueryDto {
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
  order_id?: string;

  @IsOptional()
  @IsIn(['draft', 'issued', 'delivered', 'voided'])
  status?: 'draft' | 'issued' | 'delivered' | 'voided';
}
