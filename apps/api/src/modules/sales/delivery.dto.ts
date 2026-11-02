import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const DELIVERY_STATUSES = [
  'planned',
  'dispatched',
  'delivered',
  'partial',
  'failed',
  'cancelled',
] as const;

/** GET /deliveries */
export class ListDeliveriesQueryDto {
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
  tour_id?: string;

  @IsOptional()
  @IsIn([...DELIVERY_STATUSES])
  status?: string;
}

/** PATCH /deliveries/{id} — ثبت تحویل با POD (عکس/امضا/گیرنده) */
export class UpdateDeliveryDto {
  @IsOptional()
  @IsIn([...DELIVERY_STATUSES])
  status?: string;

  @IsOptional()
  @IsDateString()
  delivered_at?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  failure_reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  receiver_name?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  signature_url?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  photo_url?: string;
}
