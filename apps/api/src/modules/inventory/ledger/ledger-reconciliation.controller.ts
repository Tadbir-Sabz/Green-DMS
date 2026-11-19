import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../identity-rbac/auth.guard';
import { PermissionsGuard } from '../../identity-rbac/permissions.guard';
import { RequirePermissions } from '../../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../../identity-rbac/auth-context.decorator';
import { ReconciliationQueryDto } from './ledger-reconciliation.dto';
import { LedgerReconciliationService, type LedgerReconciliationReport } from './ledger-reconciliation.service';

/**
 * GET /stock/reconciliation — گزارش فقط‌خواندنی تطبیق مانده با دفتر و رزروها.
 * مجوز: inventory.stock.view (همان مجوز خواندن مانده). شرکت از نشست می‌آید.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('stock/reconciliation')
export class LedgerReconciliationController {
  constructor(private readonly service: LedgerReconciliationService) {}

  @Get()
  @RequirePermissions('inventory.stock.view')
  reconcile(
    @Query() query: ReconciliationQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<LedgerReconciliationReport> {
    return this.service.reconcile(companyId, { warehouseId: query.warehouse_id ?? null });
  }
}
