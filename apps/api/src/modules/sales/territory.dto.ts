import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/** GET /territory/coverage — فیلترهای مشترک گزارش پوشش */
export class ListTerritoryCoverageQueryDto {
  @IsOptional()
  @IsUUID('4')
  branch_id?: string;

  @IsOptional()
  @IsUUID('4')
  area_id?: string;

  @IsOptional()
  @IsUUID('4')
  route_id?: string;

  @IsOptional()
  @IsUUID('4')
  segment_id?: string;
}

/**
 * POST /territory/reassign — انتسابِ گروهیِ مشتریان به یک مسیر (یا جداسازی با
 * target_route_id = null). تغییرات همه-یا-هیچ است؛ هر تغییر با reason در audit ثبت می‌شود.
 */
export class ReassignCustomersDto {
  @IsDefined()
  @IsArray()
  @ArrayMinSize(1, { message: 'حداقل یک مشتری لازم است.' })
  @ArrayMaxSize(500, { message: 'حداکثر ۵۰۰ مشتری در هر عملیات.' })
  @IsUUID('4', { each: true })
  customer_ids!: string[];

  /** مسیر مقصد؛ null یا حذف = جداسازی از مسیر فعلی (ترتیب پاک می‌شود) */
  @IsOptional()
  @IsUUID('4')
  target_route_id?: string | null;

  /** دلیل انتساب — در ممیزی (قبل/بعد) ثبت می‌شود */
  @IsDefined()
  @IsString()
  @MinLength(8, { message: 'دلیل انتساب باید دست‌کم ۸ کاراکتر باشد.' })
  @MaxLength(500)
  reason!: string;
}
