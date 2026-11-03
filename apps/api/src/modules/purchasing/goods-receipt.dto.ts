import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
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

/**
 * DTOهای رسید انبار خرید (GRN) و ارزش‌گذاری موجودی — ماژول ۸/۹ روی جداول
 * مهاجرت 0015 (goods_receipt/goods_receipt_line) و 0016 (product_cost/cost_layer).
 * بها (unit_cost) رشتهٔ اعشاری است تا دقت numeric(19,4) حفظ شود؛ تعداد با
 * @Type(() => Number) به عدد تبدیل می‌شود (الگوی همان purchasing.dto.ts).
 */

// ---------------- Goods Receipt (GRN) ----------------

/** قلم رسید انبار — goods_receipt_line (بدون line_no در DDL) */
export class GoodsReceiptLineDto {
  @IsUUID('4')
  product_id!: string;

  @IsOptional()
  @IsUUID('4')
  batch_id?: string;

  @IsOptional()
  @IsUUID('4')
  purchase_order_line_id?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  qty_received!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  qty_rejected?: number;

  @IsNumberString()
  unit_cost!: string;
}

/** enum هماهنگ با goods_receipt.status (DDL مهاجرت 0015) */
export const GRN_STATUSES = ['draft', 'posted', 'voided'] as const;

/**
 * POST /goods-receipts — ثبت رسید انبار پیش‌نویس با اقلام. doc_number و
 * fiscal_year سمت سرور از DocNumberService (پیشوند GRN) شماره‌گذاری می‌شوند.
 */
export class CreateGoodsReceiptDto {
  @IsUUID('4')
  branch_id!: string;

  @IsUUID('4')
  supplier_id!: string;

  @IsUUID('4')
  warehouse_id!: string;

  @IsOptional()
  @IsUUID('4')
  purchase_order_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptLineDto)
  lines!: GoodsReceiptLineDto[];
}

/** GET /goods-receipts */
export class ListGoodsReceiptsQueryDto {
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
  supplier_id?: string;

  @IsOptional()
  @IsUUID('4')
  warehouse_id?: string;

  @IsOptional()
  @IsIn([...GRN_STATUSES])
  status?: string;
}

// ---------------- Valuation ----------------

/**
 * GET /valuation — ارزش موجودی (میانگین متحرک) به ازای انبار/کالا از
 * product_cost. بدون صفحه‌بندی (همهٔ ردیف‌های دامنهٔ شرکت) مانند /treasury.
 */
export class ListValuationQueryDto {
  @IsOptional()
  @IsUUID('4')
  warehouse_id?: string;

  @IsOptional()
  @IsUUID('4')
  product_id?: string;
}
