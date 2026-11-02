import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
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

/** مقادیر مجاز status — دقیقاً check قید جدول sales_order (مهاجرت 0010) */
export const ORDER_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'partially_delivered',
  'delivered',
  'invoiced',
  'cancelled',
  'rejected',
] as const;

/** مقادیر مجاز channel — دقیقاً check قید جدول sales_order */
export const ORDER_CHANNELS = ['field', 'telesale', 'portal', 'walk_in'] as const;

/** فیلدهای مبلغی قرارداد از نوع string هستند؛ عددِ احتمالی کلاینت به رشته تبدیل می‌شود */
const toNumericString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'number' && Number.isFinite(value) ? String(value) : value;

/** قلم سفارش — openapi › SalesOrder.lines */
export class OrderLineDto {
  @IsDefined()
  @IsUUID('4')
  product_id: string;

  @IsDefined()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  @Max(999999)
  qty: number;

  @IsOptional()
  @IsUUID('4')
  packaging_id?: string | null;

  /** قیمت محاسبه‌شده لحظه ثبت؛ نیامد از لیست قیمت مشتری/سفارش خوانده می‌شود */
  @IsOptional()
  @Transform(toNumericString)
  @IsNumberString()
  unit_price?: string | null;

  @IsOptional()
  @Transform(toNumericString)
  @IsNumberString()
  discount_amount?: string | null;
}

/**
 * POST /orders — openapi › schemas.SalesOrder.
 * فقط customer_id و order_date طبق قرارداد الزامی است؛ مبالغ و وضعیت محاسبه/تولید می‌شوند.
 */
export class CreateOrderDto {
  @IsDefined()
  @IsUUID('4')
  customer_id: string;

  @IsDefined()
  @IsDateString()
  order_date: string;

  @IsOptional()
  @IsUUID('4')
  request_id?: string;

  @IsOptional()
  @IsUUID('4')
  salesperson_id?: string;

  @IsOptional()
  @IsUUID('4')
  tour_id?: string | null;

  @IsOptional()
  @IsIn(ORDER_CHANNELS)
  channel?: string;

  @IsOptional()
  @IsDateString()
  delivery_date?: string | null;

  @IsOptional()
  @IsUUID('4')
  price_list_id?: string | null;

  @IsOptional()
  @IsUUID('4')
  settlement_term_id?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  /** کلید همگام‌سازی آفلاین — تکرارش 409 می‌دهد (ایندکس یکتای سند) */
  @IsOptional()
  @IsUUID('4')
  client_uuid?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderLineDto)
  lines?: OrderLineDto[];
}

/** PATCH /orders/{id} — فقط پیش از تأیید (draft) مجاز است؛ اقلام جایگزین می‌شوند */
export class UpdateOrderDto extends PartialType(CreateOrderDto) {
  /** قفل خوش‌بینانه: اگر بیاید باید با row_version فعلی سرور یکی باشد وگرنه 409 version_conflict */
  @IsOptional()
  @IsInt()
  @Min(0)
  row_version?: number;
}

export class ListOrdersQueryDto {
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
  @IsUUID('4')
  tour_id?: string;

  @IsOptional()
  @IsIn(ORDER_STATUSES)
  status?: string;

  @IsOptional()
  @IsDateString()
  order_date?: string;
}
