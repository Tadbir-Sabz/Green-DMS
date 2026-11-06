import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Max,
  Min,
} from 'class-validator';

/** وضعیت‌های مجاز product (check: product_status_check) */
export const PRODUCT_STATUSES = ['active', 'blocked', 'discontinued'] as const;
/** نوع توزیع مجاز (check: product_distribution_kind_check) */
export const DISTRIBUTION_KINDS = ['cold', 'warm', 'both'] as const;

/** POST /api/v1/products — فیلدهای نوشتنی (فیلدهای readOnly سرور تولید می‌کند) */
export class CreateProductDto {
  /** D1: کدِ SKU دستی؛ در صورتِ عدمِ ارسال، سرور تولیدِ خودکار می‌کند */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  name_latin?: string | null;

  @IsUUID()
  category_id: string;

  @IsUUID()
  base_uom_id: string;

  @IsOptional()
  @IsUUID()
  family_id?: string | null;

  @IsOptional()
  @IsUUID()
  brand_id?: string | null;

  @IsOptional()
  @IsUUID()
  tax_code_id?: string | null;

  @IsOptional()
  @IsBoolean()
  is_batch_tracked?: boolean;

  @IsOptional()
  @IsBoolean()
  is_expiry_tracked?: boolean;

  @IsOptional()
  @IsBoolean()
  is_returnable_container?: boolean;

  @IsOptional()
  @IsBoolean()
  requires_permit?: boolean;

  /** فقط برای کالای انقضادار (قید ck_product_batch را خودِ دیتابیس هم می‌گیرد) */
  @IsOptional()
  @IsInt()
  @Min(1)
  shelf_life_days?: number;

  @IsOptional()
  @IsIn(DISTRIBUTION_KINDS)
  distribution_kind?: (typeof DISTRIBUTION_KINDS)[number];

  @IsOptional()
  @IsNumber()
  @Min(0)
  min_order_qty?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  weight_gr?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  volume_cm3?: number;
}

/** PATCH /api/v1/products/{id} — همه فیلدها اختیاری + وضعیت + قفل خوش‌بینانه */
export class UpdateProductDto extends PartialType(CreateProductDto) {
  @IsOptional()
  @IsIn(PRODUCT_STATUSES)
  status?: (typeof PRODUCT_STATUSES)[number];

  /** اگر فرستاده شود باید با row_version فعلی سرور یکی باشد وگرنه 409 */
  @IsOptional()
  @IsInt()
  @Min(0)
  row_version?: number;

  /** D4: تأییدِ صریحِ دومرحله‌ای برای تغییراتِ حساس (مالیات/وضعیت/واحدِ پایه) */
  @IsOptional()
  @IsBoolean()
  confirm_sensitive?: boolean;
}

/** GET /api/v1/products — صفحه‌بندی cursor + فیلترها (ضمیمه F) */
export class ListProductsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  q?: string;

  @IsOptional()
  @IsUUID()
  category_id?: string;

  @IsOptional()
  @IsUUID()
  brand_id?: string;

  @IsOptional()
  @IsIn(PRODUCT_STATUSES)
  status?: (typeof PRODUCT_STATUSES)[number];

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
