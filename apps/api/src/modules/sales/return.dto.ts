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

const REASONS = [
  'damaged',
  'expired',
  'wrong_item',
  'shortage',
  'customer_refusal',
  'promotion_error',
  'other',
] as const;

const DISPOSITIONS = ['restock', 'damaged', 'scrap', 'return_to_supplier'] as const;

/** قلم درخواست مرجوعی در زمان ثبت (disposition فقط در receive تعیین می‌شود) */
export class ReturnLineDto {
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

/** POST /returns — ثبت درخواست مرجوعی با وضعیت submitted */
export class CreateReturnDto {
  @IsDefined()
  @IsUUID('4')
  customer_id: string;

  @IsDefined()
  @IsIn(REASONS)
  reason_code: (typeof REASONS)[number];

  @IsOptional()
  @IsUUID('4')
  invoice_id?: string;

  @IsOptional()
  @IsUUID('4')
  tour_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReturnLineDto)
  lines?: ReturnLineDto[];
}

/** GET /returns — فیلترها طبق openapi: customer_id و status */
export class ListReturnsQueryDto {
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
  customer_id?: string;

  @IsOptional()
  @IsIn([
    'draft',
    'submitted',
    'approved',
    'partially_approved',
    'rejected',
    'posted',
    'closed',
  ])
  status?: string;
}

/** POST /returns/{id}/receive — تعیین تکلیف نهایی هر قلم و ثبت posted */
export class ReceiveLineDto {
  @IsDefined()
  @IsUUID('4')
  product_id: string;

  @IsDefined()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  qty: number;

  @IsDefined()
  @IsIn(DISPOSITIONS)
  disposition: (typeof DISPOSITIONS)[number];
}

export class ReceiveReturnDto {
  @IsDefined()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveLineDto)
  lines: ReceiveLineDto[];
}
