import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import {
  CustomerStatementQueryDto,
  ListApQueryDto,
  ListArQueryDto,
  ListTreasuryQueryDto,
} from './finance.dto';
import type { ArAgingRow, SupplierBalance, TreasuryPosition } from './finance.repository';
import type { ArService, ApService, CustomerStatementView, TreasuryService } from './finance.service';
import { AR_SERVICE, AP_SERVICE, TREASURY_SERVICE } from './tokens';

/**
 * حساب‌های دریافتنی — /ar و /ar/{customerId}/statement مطابق openapi.yaml.
 * خواندن با ar.ledger.view.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('ar')
export class ArController {
  constructor(@Inject(AR_SERVICE) private readonly service: ArService) {}

  @Get()
  @RequirePermissions('ar.ledger.view')
  aging(
    @Query() query: ListArQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<ArAgingRow>> {
    return this.service.aging(companyId, query);
  }

  @Get(':customerId/statement')
  @RequirePermissions('ar.ledger.view')
  statement(
    @Param('customerId') customerId: string,
    @Query() query: CustomerStatementQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<CustomerStatementView> {
    return this.service.statement(companyId, customerId, query);
  }
}

/** حساب‌های پرداختنی — /ap مطابق openapi.yaml (خواندن ap.supplier.view) */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('ap')
export class ApController {
  constructor(@Inject(AP_SERVICE) private readonly service: ApService) {}

  @Get()
  @RequirePermissions('ap.supplier.view')
  balances(
    @Query() query: ListApQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<SupplierBalance>> {
    return this.service.balances(companyId, query);
  }
}

/** خزانه‌داری — /treasury مطابق openapi.yaml (خواندن treasury.bank.view) */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('treasury')
export class TreasuryController {
  constructor(@Inject(TREASURY_SERVICE) private readonly service: TreasuryService) {}

  @Get()
  @RequirePermissions('treasury.bank.view')
  positions(
    @Query() query: ListTreasuryQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<{ items: TreasuryPosition[] }> {
    return this.service.positions(companyId, query);
  }
}
