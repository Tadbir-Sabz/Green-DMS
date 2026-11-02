import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * DTOهای ماژول خرید/Accounts-Payable (ماژول ۸، مهاجرت 0015).
 * مبالغ رشتهٔ اعشاری‌اند (IsNumberString) تا دقت numeric(19,2) حفظ شود؛
 * تعداد با @Type(() => Number) به عدد تبدیل می‌شود.
 */

// ---------------- Purchase Order ----------------

/** قلم سفارش خرید — purchase_order_line */
export class PurchaseOrderLineDto {
  @IsUUID('4')
  product_id!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  qty!: number;

  @IsNumberString()
  unit_price!: string;

  @IsOptional()
  @IsNumberString()
  discount_amount?: string;

  @IsOptional()
  @IsNumberString()
  tax_amount?: string;
}

/** enum هماهنگ با purchase_order.status (DDL مهاجرت 0015) */
export const PO_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'partially_received',
  'received',
  'closed',
  'cancelled',
] as const;

/** POST /purchase-orders — ثبت سفارش خرید پیش‌نویس با اقلام */
export class CreatePurchaseOrderDto {
  @IsUUID('4')
  branch_id!: string;

  @IsUUID('4')
  supplier_id!: string;

  @IsUUID('4')
  warehouse_id!: string;

  @IsOptional()
  @IsDateString()
  order_date?: string;

  @IsOptional()
  @IsDateString()
  expected_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineDto)
  lines!: PurchaseOrderLineDto[];
}

/** GET /purchase-orders */
export class ListPurchaseOrdersQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @IsOptional()
  @IsUUID('4')
  supplier_id?: string;

  @IsOptional()
  @IsIn([...PO_STATUSES])
  status?: string;
}

// ---------------- Supplier Invoice (bill) ----------------

/** قلم فاکتور تأمین‌کننده — supplier_invoice_line */
export class SupplierInvoiceLineDto {
  @IsUUID('4')
  product_id!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  qty!: number;

  @IsNumberString()
  unit_price!: string;

  @IsOptional()
  @IsNumberString()
  tax_amount?: string;
}

/** enum هماهنگ با supplier_invoice.status */
export const SUPPLIER_INVOICE_STATUSES = [
  'draft',
  'matched',
  'mismatch',
  'approved',
  'partially_paid',
  'paid',
  'voided',
] as const;

/**
 * POST /supplier-invoices — ثبت فاکتور/صورت‌حساب تأمین‌کننده (پیش‌نویس).
 * `doc_number` شمارهٔ فاکتورِ تأمین‌کننده است (یکتا برای هر supplier) و
 * `internal_no` داخلی توسط سامانه شماره‌گذاری می‌شود.
 */
export class CreateSupplierInvoiceDto {
  @IsUUID('4')
  branch_id!: string;

  @IsUUID('4')
  supplier_id!: string;

  @IsString()
  @MaxLength(64)
  doc_number!: string;

  @IsOptional()
  @IsDateString()
  invoice_date?: string;

  @IsOptional()
  @IsDateString()
  due_date?: string;

  @IsOptional()
  @IsUUID('4')
  purchase_order_id?: string;

  /** مبلغ خالص (بدون مالیات) — برای دفتر بدهکاری با tax_amount جمع می‌شود */
  @IsNumberString()
  amount!: string;

  @IsOptional()
  @IsNumberString()
  tax_amount?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplierInvoiceLineDto)
  lines?: SupplierInvoiceLineDto[];
}

/** GET /supplier-invoices */
export class ListSupplierInvoicesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @IsOptional()
  @IsUUID('4')
  supplier_id?: string;

  @IsOptional()
  @IsIn([...SUPPLIER_INVOICE_STATUSES])
  status?: string;
}

// ---------------- Payment Voucher ----------------

/** تخصیص سند پرداخت به فاکتور تأمین‌کننده — payment_allocation */
export class PaymentAllocationDto {
  @IsUUID('4')
  supplier_invoice_id!: string;

  @IsNumberString()
  amount!: string;
}

/** enum هماهنگ با payment_voucher.status */
export const PAYMENT_VOUCHER_STATUSES = ['draft', 'posted', 'voided'] as const;

/**
 * POST /payment-vouchers — سند پرداخت به تأمین‌کننده با تخصیص به فاکتورها.
 * در یک تراکنش: سند + تخصیص‌ها + دفتر بدهکاری (credit) + به‌روزرسانی وضعیت
 * فاکتورها (partially_paid/paid).
 */
export class CreatePaymentVoucherDto {
  @IsUUID('4')
  branch_id!: string;

  @IsUUID('4')
  supplier_id!: string;

  @IsUUID('4')
  method_id!: string;

  @IsOptional()
  @IsDateString()
  payment_date?: string;

  @IsNumberString()
  amount!: string;

  @IsOptional()
  @IsUUID('4')
  bank_account_id?: string;

  @IsOptional()
  @IsUUID('4')
  cash_box_id?: string;

  @IsOptional()
  @IsUUID('4')
  cheque_id?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentAllocationDto)
  allocations?: PaymentAllocationDto[];
}

/** GET /payment-vouchers */
export class ListPaymentVouchersQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @IsOptional()
  @IsUUID('4')
  supplier_id?: string;

  @IsOptional()
  @IsIn([...PAYMENT_VOUCHER_STATUSES])
  status?: string;
}
