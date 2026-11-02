import { Module } from '@nestjs/common';
import { IdentityRbacModule } from '../identity-rbac/identity-rbac.module';
import { PurchasingRepository } from './purchasing.repository';
import {
  PaymentVoucherService,
  PurchaseOrderService,
  SupplierInvoiceService,
} from './purchasing.service';
import {
  PaymentVoucherController,
  PurchaseOrderController,
  SupplierInvoiceController,
} from './purchasing.controller';
import {
  PAYMENT_VOUCHER_SERVICE,
  PURCHASING_REPOSITORY,
  PURCHASE_ORDER_SERVICE,
  SUPPLIER_INVOICE_SERVICE,
} from './tokens';

/**
 * ماژول خرید / Accounts-Payable (۸) — سفارش خرید، فاکتور تأمین‌کننده و سند
 * پرداخت روی جداول مهاجرت 0015. PurchasingRepository خواندن/نوشتن تراکنشی و
 * هر سه سرویس منطق اعتبارسنجی و نگاشت خطا را دارند. تزریق‌ها با توکن صریح و
 * useExisting انجام می‌شود (سازگار با esbuild بدون emitDecoratorMetadata).
 * شماره‌گذاری اسناد از DocNumberModule سراسری (PO/SINV/PV) می‌آید و دفتر
 * بدهکاری تأمین‌کننده (supplier_ledger_entry) در همان تراکنش‌ها نوشته می‌شود.
 */
@Module({
  imports: [IdentityRbacModule],
  controllers: [PurchaseOrderController, SupplierInvoiceController, PaymentVoucherController],
  providers: [
    PurchasingRepository,
    { provide: PURCHASING_REPOSITORY, useExisting: PurchasingRepository },
    PurchaseOrderService,
    { provide: PURCHASE_ORDER_SERVICE, useExisting: PurchaseOrderService },
    SupplierInvoiceService,
    { provide: SUPPLIER_INVOICE_SERVICE, useExisting: SupplierInvoiceService },
    PaymentVoucherService,
    { provide: PAYMENT_VOUCHER_SERVICE, useExisting: PaymentVoucherService },
  ],
})
export class PurchasingModule {}
