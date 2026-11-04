import { Controller, Get, Inject, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import type { ModuleInfo } from '../../common/module-info';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import { BILLING_SERVICE } from './tokens';
import type { BillingService } from './billing.service';
import type { BillingInvoice } from './billing.repository';

/**
 * صورتحسابِ اشتراک — openapi › /billing/invoices. فقط خواندن (ledger)، با مجوزِ
 * موجودِ ar.ledger.view (بدونِ افزودنِ مجوزِ جدید که به ceo اعطا نشده باشد).
 * company_id از نشست؛ بدونِ درگاهِ پرداخت و بدونِ اشتراکِ پولی (طبقِ دامنهٔ مصوب).
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('billing')
export class BillingController {
  constructor(@Inject(BILLING_SERVICE) private readonly service: BillingService) {}

  @Get()
  @RequirePermissions('ar.ledger.view')
  info(): ModuleInfo {
    return {
      module: 'billing',
      title: 'صورتحسابِ اشتراک',
      resources: ['invoices'],
      status: 'implemented',
    };
  }

  @Get('invoices')
  @RequirePermissions('ar.ledger.view')
  list(@CurrentUser('companyId') companyId: string): Promise<BillingInvoice[]> {
    return this.service.list(companyId);
  }

  @Get('invoices/:id')
  @RequirePermissions('ar.ledger.view')
  get(
    @CurrentUser('companyId') companyId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BillingInvoice> {
    return this.service.get(companyId, id);
  }
}
