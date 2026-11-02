import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** enum های هماهنگ با DDL (مهاجرت 0008) */
export const STOCKTAKE_STATUSES = [
  'draft',
  'counting',
  'review',
  'approved',
  'posted',
  'voided',
] as const;
export type StockTakeStatus = (typeof STOCKTAKE_STATUSES)[number];

export const ADJUSTMENT_REASONS = [
  'damage',
  'expiry',
  'sample',
  'internal_use',
  'theft',
  'count_fix',
  'other',
] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

const toNumber = ({ value }: { value: unknown }): unknown => {
  if (value === '' || value === null || value === undefined) return value;
  const n = Number(value);
  return Number.isNaN(n) ? value : n;
};

/** GET /stock — فیلتر انبار/کالا/بچ + صفحه‌بندی cursor */
export class ListStockQueryDto {
  @IsOptional()
  @IsUUID('4')
  warehouse_id?: string;

  @IsOptional()
  @IsUUID('4')
  product_id?: string;

  @IsOptional()
  @IsUUID('4')
  batch_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 50;
}

/** GET /stocktakes — فیلتر وضعیت + صفحه‌بندی */
export class ListStocktakesQueryDto {
  @IsOptional()
  @IsIn(STOCKTAKE_STATUSES)
  status?: StockTakeStatus;

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

/** یک خط شمارش — system_qty و variance_qty از سمت سرور محاسبه می‌شوند */
export class StockTakeLineDto {
  @IsDefined()
  @IsUUID('4')
  product_id: string;

  @IsOptional()
  @IsUUID('4')
  batch_id?: string | null;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  counted_qty?: number | null;
}

/** POST /stocktakes — شروع انبارگردانی */
export class CreateStockTakeDto {
  @IsDefined()
  @IsUUID('4')
  warehouse_id: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockTakeLineDto)
  lines?: StockTakeLineDto[];
}

/** PATCH /stocktakes/{id} — ثبت/به‌روزرسانی شمارش اقلام */
export class UpdateStockTakeDto {
  @IsOptional()
  @IsIn(STOCKTAKE_STATUSES)
  status?: StockTakeStatus;

  /** قفل خوش‌بینانه: اگر بیاید باید با row_version فعلی سرور یکی باشد وگرنه 409 version_conflict */
  @IsOptional()
  @IsInt()
  @Min(0)
  row_version?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StockTakeLineDto)
  lines?: StockTakeLineDto[];
}

/** یک خط انتقال */
export class TransferLineDto {
  @IsDefined()
  @IsUUID('4')
  product_id: string;

  @IsOptional()
  @IsUUID('4')
  batch_id?: string | null;

  @IsDefined()
  @Transform(toNumber)
  @IsNumber()
  @Min(0.0001)
  qty: number;
}

/** POST /transfers — ثبت انتقال بین‌انباری */
export class CreateTransferDto {
  @IsDefined()
  @IsUUID('4')
  from_warehouse_id: string;

  @IsDefined()
  @IsUUID('4')
  to_warehouse_id: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransferLineDto)
  lines?: TransferLineDto[];
}

/** POST /stock/adjustments — اصلاحیه موجودی */
export class CreateStockAdjustmentDto {
  @IsDefined()
  @IsUUID('4')
  warehouse_id: string;

  @IsDefined()
  @IsUUID('4')
  product_id: string;

  @IsOptional()
  @IsUUID('4')
  batch_id?: string | null;

  @IsDefined()
  @Transform(toNumber)
  @IsNumber()
  qty_delta: number;

  @IsDefined()
  @IsIn(ADJUSTMENT_REASONS)
  reason_code: AdjustmentReason;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  note?: string;
}

/** GET /transfers — صفحه‌بندی cursor */
export class ListTransfersQueryDto {
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
