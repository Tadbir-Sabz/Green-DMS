import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PRODUCT_STATUSES } from './product.dto';

/** Upper bound mirrors §E's 10,000-row import ceiling and prevents unbounded downloads. */
export const PRODUCT_EXPORT_MAX_ROWS = 10_000;

/**
 * GET /api/v1/products/export — filters are the same central-catalog filters as
 * the product list, minus cursor pagination. The whole filtered result is
 * streamed as one deterministic CSV snapshot.
 */
export class ExportProductsQueryDto {
  @IsOptional()
  @IsIn(['code_asc', 'code_desc'])
  sort?: 'code_asc' | 'code_desc';

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
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PRODUCT_EXPORT_MAX_ROWS)
  limit?: number = PRODUCT_EXPORT_MAX_ROWS;
}
