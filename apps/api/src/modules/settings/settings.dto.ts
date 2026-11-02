import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** دامنه‌های مجاز تنظیم — هم‌اندازهٔ DDL مهاجرت 0002 (scope_type) */
export const SETTING_SCOPES = ['global', 'company', 'branch', 'area'] as const;

/** GET /settings — فیلتر دامنه */
export class ListSettingsQueryDto {
  @IsOptional()
  @IsIn([...SETTING_SCOPES])
  scope_type?: string;

  @IsOptional()
  @IsUUID('4')
  scope_id?: string;
}

/** یک ورودی تنظیم — schemas.SettingEntry */
export class SettingEntryDto {
  @IsString()
  @MaxLength(128)
  key!: string;

  @IsString()
  value!: string;

  @IsOptional()
  @IsIn([...SETTING_SCOPES])
  scope_type?: string;

  @IsOptional()
  @IsUUID('4')
  scope_id?: string;
}

/** PATCH /settings — بدنهٔ دسته‌ای */
export class UpdateSettingsDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => SettingEntryDto)
  items!: SettingEntryDto[];
}
