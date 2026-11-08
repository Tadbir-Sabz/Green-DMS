import { Module } from '@nestjs/common';
import { IdentityRbacModule } from '../identity-rbac/identity-rbac.module';
import { RulesEngineModule } from '../rules-engine/rules-engine.module';
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
import { GoodsReceiptRepository } from './goods-receipt.repository';
import { GoodsReceiptService, ValuationService } from './goods-receipt.service';
import { GoodsReceiptController, ValuationController } from './goods-receipt.controller';
import {
  GOODS_RECEIPT_REPOSITORY,
  GOODS_RECEIPT_SERVICE,
  PAYMENT_VOUCHER_SERVICE,
  PURCHASING_REPOSITORY,
  PURCHASE_ORDER_SERVICE,
  SUPPLIER_INVOICE_SERVICE,
  VALUATION_SERVICE,
} from './tokens';

/**
 * ماژول خرید / Accounts-Payable (۸) و ارزش‌گذاری موجودی (۹) — سفارش خرید،
 * فاکتور تأمین‌کننده، سند پرداخت، رسید انبار خرید (GRN) و ارزش‌گذاری روی
 * جداول مهاجرت 0015/0016/0008. PurchasingRepository خواندن/نوشتن تراکنشی سه
 * سند نخست و GoodsReceiptRepository رسید انبار + ارزش‌گذاری را دارد؛ هر سرویس
 * منطق اعتبارسنجی و نگاشت خطا را دارد. تزریق‌ها با توکن صریح و useExisting
 * انجام می‌شود (سازگار با esbuild بدون emitDecoratorMetadata). شماره‌گذاری
 * اسناد از DocNumberModule سراسری (PO/SINV/PV/GRN) می‌آید. ثبت رسید انبار
 * عوارض انبار (inventory_txn/stock_balance) و بها (product_cost/cost_layer) را
 * در یک تراکنش اعمال می‌کند.
 */
@Module({
  imports: [IdentityRbacModule, RulesEngineModule],
  controllers: [
    PurchaseOrderController,
    SupplierInvoiceController,
    PaymentVoucherController,
    GoodsReceiptController,
    ValuationController,
  ],
  providers: [
    PurchasingRepository,
    { provide: PURCHASING_REPOSITORY, useExisting: PurchasingRepository },
    PurchaseOrderService,
    { provide: PURCHASE_ORDER_SERVICE, useExisting: PurchaseOrderService },
    SupplierInvoiceService,
    { provide: SUPPLIER_INVOICE_SERVICE, useExisting: SupplierInvoiceService },
    PaymentVoucherService,
    { provide: PAYMENT_VOUCHER_SERVICE, useExisting: PaymentVoucherService },
    GoodsReceiptRepository,
    { provide: GOODS_RECEIPT_REPOSITORY, useExisting: GoodsReceiptRepository },
    GoodsReceiptService,
    { provide: GOODS_RECEIPT_SERVICE, useExisting: GoodsReceiptService },
    ValuationService,
    { provide: VALUATION_SERVICE, useExisting: ValuationService },
  ],
})
export class PurchasingModule {}
