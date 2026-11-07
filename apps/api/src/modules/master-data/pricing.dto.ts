import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsDefined,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** enum های هماهنگ با DDL (مهاجرت 0006) */
export const PRICE_LIST_KINDS = ['general', 'wholesale', 'retail', 'chain', 'cooperative', 'channel'] as const;
export type PriceListKind = (typeof PRICE_LIST_KINDS)[number];

export const PROMOTION_KINDS = [
  'percent_line',
  'amount_line',
  'bundle',
  'buy_x_get_y',
  'gift_item',
  'cash_discount',
  'repeat_order',
  'coupon',
  'volume_tier',
] as const;
export type PromotionKind = (typeof PROMOTION_KINDS)[number];

const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
};

/** قیمت/مبلغ اعشاری — هم رشته هم عدد پذیرفته و به رشته تبدیل می‌شود (قرارداد string است) */
const toDecimalString = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'number') return String(value);
  return value;
};

const DECIMAL = { message: 'مقدار باید عدد غیرمنفی اعشاری باشد.' };
const DECIMAL_RE = /^\d+(\.\d+)?$/;

// ---------------- لیست قیمت ----------------

export class PriceListItemDto {
  @IsDefined()
  @IsUUID('4')
  product_id: string;

  /** M-2: قیمتِ سطحِ بسته‌بندی — NULL = واحدِ پایه/رفتارِ فعلیِ ردیف‌های legacy */
  @IsOptional()
  @IsUUID('4')
  packaging_id?: string | null;

  @IsDefined()
  @Transform(toDecimalString)
  @IsString()
  @Matches(DECIMAL_RE, DECIMAL)
  price: string;

  @IsOptional()
  @IsDateString()
  valid_from?: string | null;

  @IsOptional()
  @IsDateString()
  valid_to?: string | null;
}

export class CreatePriceListDto {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code: string;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  title: string;

  @IsOptional()
  @IsIn(PRICE_LIST_KINDS)
  kind?: PriceListKind;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PriceListItemDto)
  items?: PriceListItemDto[];
}

export class UpdatePriceListDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  title?: string;

  @IsOptional()
  @IsIn(PRICE_LIST_KINDS)
  kind?: PriceListKind;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PriceListItemDto)
  items?: PriceListItemDto[];
}

export class ListPriceListsQueryDto {
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

// ---------------- تشویق (تخفیف/جایزه) ----------------

export class CreatePromotionDto {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code: string;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  title: string;

  @IsDefined()
  @IsIn(PROMOTION_KINDS)
  kind: PromotionKind;

  @IsOptional()
  @IsDateString()
  valid_from?: string;

  @IsOptional()
  @IsDateString()
  valid_to?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(32767)
  priority?: number;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  allow_stacking?: boolean;

  @IsOptional()
  @Transform(toDecimalString)
  @IsString()
  @Matches(DECIMAL_RE, DECIMAL)
  max_discount_amount?: string | null;

  @IsOptional()
  @Transform(toDecimalString)
  @IsString()
  @Matches(DECIMAL_RE, DECIMAL)
  max_per_customer_per_day?: string | null;

  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  benefit?: Record<string, unknown>;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  is_active?: boolean;
}

export class UpdatePromotionDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  title?: string;

  @IsOptional()
  @IsIn(PROMOTION_KINDS)
  kind?: PromotionKind;

  @IsOptional()
  @IsDateString()
  valid_from?: string;

  @IsOptional()
  @IsDateString()
  valid_to?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(32767)
  priority?: number;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  allow_stacking?: boolean;

  @IsOptional()
  @Transform(toDecimalString)
  @IsString()
  @Matches(DECIMAL_RE, DECIMAL)
  max_discount_amount?: string | null;

  @IsOptional()
  @Transform(toDecimalString)
  @IsString()
  @Matches(DECIMAL_RE, DECIMAL)
  max_per_customer_per_day?: string | null;

  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  benefit?: Record<string, unknown>;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  is_active?: boolean;
}

export class ListPromotionsQueryDto {
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  is_active?: boolean;

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
