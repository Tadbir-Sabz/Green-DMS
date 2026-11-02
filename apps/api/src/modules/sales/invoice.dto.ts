import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
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

/** قلم فاکتور — invoice_line */
export class InvoiceLineDto {
  @IsUUID('4')
  product_id!: string;

  @IsOptional()
  @IsUUID('4')
  batch_id?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  qty!: number;

  @IsNumberString()
  unit_price!: string;

  @IsOptional()
  @IsNumberString()
  discount_amount?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  tax_rate_pct?: number;
}

/** GET /invoices */
export class ListInvoicesQueryDto {
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
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  moadian_status?: string;
}

/** POST /invoices — صدور فاکتور (از سفارش/حواله یا مستقیم با اقلام) */
export class CreateInvoiceDto {
  @IsUUID('4')
  customer_id!: string;

  @IsDateString()
  invoice_date!: string;

  @IsOptional()
  @IsUUID('4')
  sales_order_id?: string;

  @IsOptional()
  @IsUUID('4')
  waybill_id?: string;

  @IsOptional()
  @IsDateString()
  due_date?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines?: InvoiceLineDto[];
}
