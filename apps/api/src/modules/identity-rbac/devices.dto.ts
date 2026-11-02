import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** مقادیر مجاز قیدهای جدول device (مهاجرت 0012) */
export const DEVICE_PLATFORMS = ['android'] as const;
export const DEVICE_APP_KINDS = ['sales', 'delivery', 'telesales'] as const;

/** POST /api/v1/devices — openapi › schemas.DeviceCreate */
export class CreateDeviceDto {
  /** شناسه سخت‌افزاری/نصب اپ؛ برای هر کاربر یکتاست (uq_device) */
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  device_uuid: string;

  @IsIn(DEVICE_PLATFORMS)
  platform: (typeof DEVICE_PLATFORMS)[number];

  @IsIn(DEVICE_APP_KINDS)
  app_kind: (typeof DEVICE_APP_KINDS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(32)
  app_version?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  os_version?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  push_token?: string;
}

/** GET /api/v1/devices — cursor و limit طبق پارامترهای استاندارد سند */
export class ListDevicesQueryDto {
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
