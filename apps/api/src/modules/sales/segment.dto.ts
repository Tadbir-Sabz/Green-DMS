import {
  IsBoolean,
  IsDefined,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

/** پارامتر query بولینی openapi («true»/«false») را به boolean تبدیل می‌کند */
const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
};

/** GET /customer-segments — فیلتر + جست‌وجو */
export class ListCustomerSegmentsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  q?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 200;
}

/** POST /customer-segments — تعریفِ بخشِ تجاریِ تازه */
export class CreateCustomerSegmentDto {
  /** کدِ یکتا در شرکت؛ حروف/رقم/. - _ ، ۲ تا ۳۲ کاراکتر (قید دیتابیس هم همین است) */
  @IsDefined()
  @IsString()
  @Matches(/^[A-Za-z0-9][A-Za-z0-9_.-]{1,31}$/, {
    message: 'کد بخش باید ۲ تا ۳۲ کاراکتر و فقط شامل حروف، رقم، . ، - _ باشد.',
  })
  code!: string;

  @IsDefined()
  @IsString()
  @MinLength(2, { message: 'عنوان بخش الزامی است.' })
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

/** PATCH /customer-segments/{id} — کد تغییرناپذیر است؛ فقط عنوان/توضیح/فعال‌شدن */
export class UpdateCustomerSegmentDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'عنوان بخش نمی‌تواند خالی باشد.' })
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
