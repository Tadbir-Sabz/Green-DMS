import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsNotEmptyObject,
  IsObject,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { BULK_MAX_PRODUCTS } from './product-bulk-maintenance.types';

/**
 * POST /products/bulk-maintenance/preview — read-only server-generated diff.
 * `changes` is intentionally an open object: the service owns the exact field
 * whitelist and rejects protected/unsupported keys even for handcrafted calls.
 */
export class BulkMaintenancePreviewDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BULK_MAX_PRODUCTS)
  @IsUUID('4', { each: true })
  product_ids!: string[];

  @IsObject()
  @IsNotEmptyObject()
  changes!: Record<string, unknown>;
}

/**
 * POST /products/bulk-maintenance/execute — no new field values are accepted.
 * The preview stored on the server is authoritative; operation_id is the stable
 * idempotency identity and preview_token proves possession of that preview.
 */
export class BulkMaintenanceExecuteDto {
  @IsUUID('4')
  operation_id!: string;

  @IsString()
  @MaxLength(128)
  preview_token!: string;

  @IsBoolean()
  @Equals(true)
  confirm!: true;
}

export class BulkMaintenanceOperationParamsDto {
  @IsUUID('4')
  operationId!: string;
}
