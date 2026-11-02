import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsDefined,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * POST /tracking/ping — نمونه موقعیت میدانی (فاز B: بدنهٔ any به DTO تبدیل شد).
 * lat/lng الزامی‌اند؛ بقیه فیلدهای location_sample (مهاجرت 0012) اختیاری‌اند.
 * سرعت از کلاینت کیلومتر/ساعت می‌آید (همان‌طور که repository تبدیل می‌کند).
 */
export class TrackingPingDto {
  @IsDefined()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @IsDefined()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  accuracy_m?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(500)
  speed_kph?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(360)
  heading_deg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  battery_pct?: number;

  @IsOptional()
  @IsUUID('4')
  session_id?: string;

  @IsOptional()
  @IsUUID('4')
  tour_id?: string;

  @IsOptional()
  @IsIn(['gps', 'network', 'fused'])
  provider?: string;

  @IsOptional()
  @IsBoolean()
  is_mocked?: boolean;

  @IsOptional()
  @IsDateString()
  recorded_at?: string;
}
