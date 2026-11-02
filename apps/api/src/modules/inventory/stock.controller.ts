import { Body, Controller, Get, Inject, Post, Query, UseGuards } from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import type { StockBalanceRow } from './stock.repository';
import type { StockAdjustmentView } from './stock.repository';
import { CreateStockAdjustmentDto, ListStockQueryDto } from './stock.dto';
import type { StockService } from './stock.service';
import { STOCK_SERVICE } from './tokens';

/**
 * GET /stock — مانده موجودی (فیلتر انبار/کالا/بچ).
 * POST /stock/adjustments — اصلاحیه موجودی (اعمال‌شده با fn_apply_stock_txn).
 * شرکت از نشست می‌آید؛ مجوز خواندن inventory.stock.view و ثبت inventory.adjust.create.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('stock')
export class StockController {
  constructor(@Inject(STOCK_SERVICE) private readonly service: StockService) {}

  @Get()
  @RequirePermissions('inventory.stock.view')
  list(
    @Query() query: ListStockQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<StockBalanceRow>> {
    return this.service.list(companyId, query);
  }

  @Post('adjustments')
  @RequirePermissions('inventory.adjust.create')
  createAdjustment(
    @Body() dto: CreateStockAdjustmentDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<StockAdjustmentView> {
    return this.service.createAdjustment(companyId, dto);
  }
}
