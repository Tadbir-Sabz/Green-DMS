import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import {
  CreatePaymentVoucherDto,
  CreatePurchaseOrderDto,
  CreateSupplierInvoiceDto,
  ListPaymentVouchersQueryDto,
  ListPurchaseOrdersQueryDto,
  ListSupplierInvoicesQueryDto,
} from './purchasing.dto';
import type {
  PaymentVoucherRow,
  PurchaseOrderRow,
  SupplierInvoiceRow,
} from './purchasing.repository';
import type {
  PaymentVoucherService,
  PurchaseOrderService,
  SupplierInvoiceService,
} from './purchasing.service';
import {
  PAYMENT_VOUCHER_SERVICE,
  PURCHASE_ORDER_SERVICE,
  SUPPLIER_INVOICE_SERVICE,
} from './tokens';

/** سفارش خرید — /purchase-orders (ماژول ۸) */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('purchase-orders')
export class PurchaseOrderController {
  constructor(@Inject(PURCHASE_ORDER_SERVICE) private readonly service: PurchaseOrderService) {}

  @Get()
  @RequirePermissions('ap.supplier.view')
  list(
    @Query() query: ListPurchaseOrdersQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<PurchaseOrderRow>> {
    return this.service.list(companyId, query);
  }

  @Get(':id')
  @RequirePermissions('ap.supplier.view')
  get(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<PurchaseOrderRow> {
    return this.service.get(companyId, id);
  }

  @Post()
  @RequirePermissions('ap.purchase.request')
  create(
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ): Promise<PurchaseOrderRow> {
    // TASK-24Y: ثبتِ سازنده برای جداسازیِ وظایف
    return this.service.create(companyId, dto, userId);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermissions('ap.purchase.approve')
  approve(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ): Promise<PurchaseOrderRow> {
    // TASK-24Y: هویتِ تأییدکننده (منعِ خودتأییدی + ممیزی)
    void userId;
    return this.service.approve(companyId, id, userId);
  }
}

/** فاکتور تأمین‌کننده — /supplier-invoices (ماژول ۸) */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('supplier-invoices')
export class SupplierInvoiceController {
  constructor(@Inject(SUPPLIER_INVOICE_SERVICE) private readonly service: SupplierInvoiceService) {}

  @Get()
  @RequirePermissions('ap.supplier.view')
  list(
    @Query() query: ListSupplierInvoicesQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<SupplierInvoiceRow>> {
    return this.service.list(companyId, query);
  }

  @Get(':id')
  @RequirePermissions('ap.supplier.view')
  get(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<SupplierInvoiceRow> {
    return this.service.get(companyId, id);
  }

  @Post()
  @RequirePermissions('ap.invoice.match')
  create(
    @Body() dto: CreateSupplierInvoiceDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<SupplierInvoiceRow> {
    return this.service.create(companyId, dto);
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermissions('ap.invoice.approve')
  approve(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<SupplierInvoiceRow> {
    return this.service.approve(companyId, id);
  }
}

/** سند پرداخت به تأمین‌کننده — /payment-vouchers (ماژول ۸) */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('payment-vouchers')
export class PaymentVoucherController {
  constructor(@Inject(PAYMENT_VOUCHER_SERVICE) private readonly service: PaymentVoucherService) {}

  @Get()
  @RequirePermissions('ap.supplier.view')
  list(
    @Query() query: ListPaymentVouchersQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<PaymentVoucherRow>> {
    return this.service.list(companyId, query);
  }

  @Get(':id')
  @RequirePermissions('ap.supplier.view')
  get(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<PaymentVoucherRow> {
    return this.service.get(companyId, id);
  }

  @Post()
  @RequirePermissions('ap.payment.create')
  create(
    @Body() dto: CreatePaymentVoucherDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<PaymentVoucherRow> {
    return this.service.create(companyId, dto);
  }
}
