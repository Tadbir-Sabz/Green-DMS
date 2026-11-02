import { PartialType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * مقادیر مجاز status — دقیقاً enum اسکیمای Staff در openapi.yaml.
 * در دیتابیس active/suspended/terminated است؛ نگاشت دوطرفه در
 * repository انجام می‌شود (خواندن: غیرفعال → inactive، نوشتن: inactive → terminated).
 */
export const STAFF_STATUSES = ['active', 'inactive'] as const;
export type StaffStatus = (typeof STAFF_STATUSES)[number];

/** پارامتر query بولینی openapi («true»/«false») را به boolean تبدیل می‌کند */
const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
};

/**
 * POST /api/v1/staff — openapi › schemas.Staff
 * person_id طبق قرارداد الزامی است؛ job_position_code هم عملاً الزامی است
 * (ستون job_position_id NOT NULL) و نبودش با پیام فارسی 400 می‌دهد نه خطای قید.
 */
export class CreateStaffDto {
  @IsDefined()
  @IsUUID('4')
  person_id: string;

  @IsOptional()
  @IsUUID('4')
  branch_id?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  job_position_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  employee_no?: string;

  /** تاریخ استخدام — دقیقاً YYYY-MM-DD (ستون date) */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'تاریخ استخدام باید به شکل YYYY-MM-DD باشد.',
  })
  hire_date?: string;

  @IsOptional()
  @IsUUID('4')
  supervisor_id?: string | null;

  @IsOptional()
  @IsUUID('4')
  vehicle_id?: string | null;

  @IsOptional()
  @IsBoolean()
  is_field?: boolean;

  /** حوزه‌های مجاز کار (openapi › area_ids) */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  area_ids?: string[];

  @IsOptional()
  @IsIn(STAFF_STATUSES)
  status?: StaffStatus;
}

/** PATCH /api/v1/staff/{id} — همه فیلدها اختیاری (طبق قرارداد بدنه کاملِ Staff است) */
export class UpdateStaffDto extends PartialType(CreateStaffDto) {
  /** قفل خوش‌بینانه: اگر بیاید باید با row_version فعلی سرور یکی باشد وگرنه 409 version_conflict */
  @IsOptional()
  @IsInt()
  @Min(0)
  row_version?: number;
}

/** GET /api/v1/staff — فیلترهای قرارداد + صفحه‌بندی cursor */
export class ListStaffQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  job_position_code?: string;

  @IsOptional()
  @IsUUID('4')
  supervisor_id?: string;

  /** فقط میدانی‌ها */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  is_field?: boolean;

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
