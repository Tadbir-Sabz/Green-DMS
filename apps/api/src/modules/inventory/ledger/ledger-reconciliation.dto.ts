import { IsOptional, IsUUID } from 'class-validator';

/** GET /stock/reconciliation?warehouse_id= — انبار اختیاری؛ بدون آن همهٔ انبارهای شرکت بررسی می‌شوند. */
export class ReconciliationQueryDto {
  @IsOptional()
  @IsUUID()
  warehouse_id?: string;
}
