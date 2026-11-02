import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** کانال‌های درخواست — هم‌اندازهٔ DDL (customer_request.channel) */
export const REQUEST_CHANNELS = ['field', 'telesale', 'portal', 'walk_in'] as const;
export const REQUEST_STATUSES = ['draft', 'submitted', 'converted', 'rejected', 'cancelled'] as const;

/** قلم درخواست — customer_request_line */
export class RequestLineDto {
  @IsUUID('4')
  product_id!: string;

  @IsOptional()
  @IsUUID('4')
  packaging_id?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  qty!: number;

  @IsOptional()
  @IsNumberString()
  requested_price?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

/** GET /requests */
export class ListRequestsQueryDto {
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
  customer_id?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsIn([...REQUEST_CHANNELS])
  channel?: string;
}

/** POST /requests */
export class CreateRequestDto {
  @IsUUID('4')
  customer_id!: string;

  @IsIn([...REQUEST_CHANNELS])
  channel!: string;

  @IsOptional()
  @IsUUID('4')
  requested_by?: string;

  @IsOptional()
  @IsUUID('4')
  tour_id?: string;

  @IsOptional()
  @IsDateString()
  request_date?: string;

  @IsOptional()
  @IsDateString()
  requested_delivery_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsUUID('4')
  client_uuid?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RequestLineDto)
  lines?: RequestLineDto[];
}

/** PATCH /requests/{id} */
export class UpdateRequestDto {
  @IsOptional()
  @IsIn([...REQUEST_STATUSES])
  status?: string;

  @IsOptional()
  @IsDateString()
  requested_delivery_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
