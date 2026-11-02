import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import { CreatePaymentDto, ListPaymentsQueryDto } from './finance.dto';
import type { PaymentRow } from './finance-write.repository';
import type { PaymentService } from './payment.service';
import { PAYMENT_SERVICE } from './tokens';

/**
 * رسیدهای وصول — /payments و /payments/{id} مطابق openapi.yaml.
 * خواندن ar.ledger.view؛ ثبت وصول ar.receipt.create.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('payments')
export class PaymentController {
  constructor(@Inject(PAYMENT_SERVICE) private readonly service: PaymentService) {}

  @Get()
  @RequirePermissions('ar.ledger.view')
  list(
    @Query() query: ListPaymentsQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<PaymentRow>> {
    return this.service.list(companyId, query);
  }

  @Post()
  @RequirePermissions('ar.receipt.create')
  create(
    @Body() dto: CreatePaymentDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<PaymentRow> {
    return this.service.create(companyId, dto);
  }

  @Get(':id')
  @RequirePermissions('ar.ledger.view')
  get(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<PaymentRow> {
    return this.service.get(companyId, id);
  }
}
