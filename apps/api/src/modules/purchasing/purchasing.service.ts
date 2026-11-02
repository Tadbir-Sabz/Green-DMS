import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { isUUID } from 'class-validator';
import type {
  PaymentVoucherRow,
  PurchaseOrderRow,
  PurchasingRepository,
  SupplierInvoiceRow,
} from './purchasing.repository';
import { PURCHASING_REPOSITORY } from './tokens';
import type {
  CreatePaymentVoucherDto,
  CreatePurchaseOrderDto,
  CreateSupplierInvoiceDto,
  ListPaymentVouchersQueryDto,
  ListPurchaseOrdersQueryDto,
  ListSupplierInvoicesQueryDto,
} from './purchasing.dto';

const badRequest = (code: string, message_fa: string): BadRequestException =>
  new BadRequestException({ code, message_fa });
const notFound = (msg: string): NotFoundException =>
  new NotFoundException({ code: 'not_found', message_fa: msg });
const conflict = (code: string, message_fa: string): ConflictException =>
  new ConflictException({ code, message_fa });
const unprocessable = (code: string, message_fa: string): UnprocessableEntityException =>
  new UnprocessableEntityException({ code, message_fa });

const assertId = (id: string, label: string): void => {
  if (!isUUID(id, '4')) throw badRequest('invalid_id', `شناسهٔ ${label} معتبر نیست.`);
};
const isMoney = (v: string | undefined): boolean => v != null && v !== '' && Number(v) >= 0;

/**
 * ماژول خرید / Accounts-Payable (ماژول ۸) — سه سرویس روی جداول مهاجرت 0015:
 *  - PurchaseOrderService: سفارش خرید (پیش‌نویس → تأیید)
 *  - SupplierInvoiceService: فاکتور تأمین‌کننده (پیش‌نویس → تأیید + دفتر بدهکاری debit)
 *  - PaymentVoucherService: سند پرداخت (posted + تخصیص + دفتر بدهکاری credit)
 * اعتبارسنجی ارجاع‌ها (شعبه/تأمین‌کننده/انبار/کالا/روش پرداخت) پیش از نوشتن
 * انجام می‌شود تا پیام فارسی قرارداد برگردد؛ قیدهای پایگاه‌داده لایهٔ دوم‌اند.
 */

// ---------------- Purchase Order ----------------

@Injectable()
export class PurchaseOrderService {
  constructor(@Inject(PURCHASING_REPOSITORY) private readonly repo: PurchasingRepository) {}

  async list(companyId: string, query: ListPurchaseOrdersQueryDto): Promise<Page<PurchaseOrderRow>> {
    const { items, nextCursor, hasMore } = await this.repo.listPurchaseOrders(companyId, query);
    return { items, next_cursor: nextCursor, has_more: hasMore };
  }

  async get(companyId: string, id: string): Promise<PurchaseOrderRow> {
    assertId(id, 'سفارش خرید');
    const row = await this.repo.findPurchaseOrder(companyId, id);
    if (!row) throw notFound('سفارش خرید یافت نشد');
    return row;
  }

  async create(companyId: string, dto: CreatePurchaseOrderDto): Promise<PurchaseOrderRow> {
    if (!(await this.repo.branchInCompany(companyId, dto.branch_id))) {
      throw badRequest('branch_invalid', 'شعبهٔ سفارش خرید یافت نشد.');
    }
    if (!(await this.repo.supplierInCompany(companyId, dto.supplier_id))) {
      throw badRequest('supplier_invalid', 'تأمین‌کنندهٔ سفارش خرید یافت نشد.');
    }
    if (!(await this.repo.warehouseInBranch(dto.branch_id, dto.warehouse_id))) {
      throw badRequest('warehouse_invalid', 'انبار باید به همان شعبهٔ سفارش تعلق داشته باشد.');
    }
    for (const l of dto.lines) {
      if (!isMoney(l.unit_price) || !isMoney(l.discount_amount) || !isMoney(l.tax_amount)) {
        throw badRequest('invalid_amount', 'مقادیر مبلغ اقلام باید عددی و نامنفی باشند.');
      }
    }
    const missing = await this.repo.missingProducts(
      companyId,
      dto.lines.map((l) => l.product_id),
    );
    if (missing.length > 0) {
      throw badRequest('product_invalid', 'یک یا چند کالای سفارش در شرکت یافت نشد.');
    }
    let id: string;
    try {
      id = await this.repo.insertPurchaseOrder(dto);
    } catch (err) {
      throw this.mapDbError(err);
    }
    return this.get(companyId, id);
  }

  async approve(companyId: string, id: string): Promise<PurchaseOrderRow> {
    assertId(id, 'سفارش خرید');
    const approved = await this.repo.approvePurchaseOrder(companyId, id);
    if (approved) {
      approved.lines = (await this.repo.findPurchaseOrder(companyId, id))?.lines ?? [];
      return approved;
    }
    const existing = await this.repo.findPurchaseOrder(companyId, id);
    if (!existing) throw notFound('سفارش خرید یافت نشد');
    throw conflict('po_not_draft', 'فقط سفارش پیش‌نویس قابل تأیید است.');
  }

  private mapDbError(err: unknown): Error {
    const e = err as { code?: string };
    if (e?.code === '23505') {
      return conflict('duplicate_po', 'سفارش خریدی با این شماره برای شعبه/سال ثبت شده است.');
    }
    if (e?.code === '23503') {
      return badRequest('reference_invalid', 'یکی از ارجاع‌های سفارش خرید معتبر نیست.');
    }
    if (e?.code === '23514') {
      return badRequest('check_violation', 'مقادیر سفارش خرید خارج از بازهٔ مجاز است.');
    }
    return badRequest('po_save_failed', 'خطای غیرمنتظره در ثبت سفارش خرید.');
  }
}

// ---------------- Supplier Invoice ----------------

@Injectable()
export class SupplierInvoiceService {
  constructor(@Inject(PURCHASING_REPOSITORY) private readonly repo: PurchasingRepository) {}

  async list(
    companyId: string,
    query: ListSupplierInvoicesQueryDto,
  ): Promise<Page<SupplierInvoiceRow>> {
    const { items, nextCursor, hasMore } = await this.repo.listSupplierInvoices(companyId, query);
    return { items, next_cursor: nextCursor, has_more: hasMore };
  }

  async get(companyId: string, id: string): Promise<SupplierInvoiceRow> {
    assertId(id, 'فاکتور تأمین‌کننده');
    const row = await this.repo.findSupplierInvoice(companyId, id);
    if (!row) throw notFound('فاکتور تأمین‌کننده یافت نشد');
    return row;
  }

  async create(companyId: string, dto: CreateSupplierInvoiceDto): Promise<SupplierInvoiceRow> {
    if (!isMoney(dto.amount) || !isMoney(dto.tax_amount)) {
      throw badRequest('invalid_amount', 'مبلغ فاکتور باید عددی و نامنفی باشد.');
    }
    if (!(await this.repo.branchInCompany(companyId, dto.branch_id))) {
      throw badRequest('branch_invalid', 'شعبهٔ فاکتور یافت نشد.');
    }
    if (!(await this.repo.supplierInCompany(companyId, dto.supplier_id))) {
      throw badRequest('supplier_invalid', 'تأمین‌کنندهٔ فاکتور یافت نشد.');
    }
    if (dto.due_date && dto.invoice_date && dto.due_date < dto.invoice_date) {
      throw badRequest('due_before_invoice', 'تاریخ سررسید نمی‌تواند پیش از تاریخ فاکتور باشد.');
    }
    if (dto.purchase_order_id) {
      const po = await this.repo.purchaseOrderInCompany(companyId, dto.purchase_order_id);
      if (!po) throw badRequest('po_invalid', 'سفارش خریدِ ارجاع‌شده یافت نشد.');
      if (po.supplier_id !== dto.supplier_id) {
        throw badRequest('po_supplier_mismatch', 'سفارش خرید به این تأمین‌کننده تعلق ندارد.');
      }
    }
    const lines = dto.lines ?? [];
    for (const l of lines) {
      if (!isMoney(l.unit_price) || !isMoney(l.tax_amount)) {
        throw badRequest('invalid_amount', 'مقادیر مبلغ اقلام باید عددی و نامنفی باشند.');
      }
    }
    const missing = await this.repo.missingProducts(
      companyId,
      lines.map((l) => l.product_id),
    );
    if (missing.length > 0) {
      throw badRequest('product_invalid', 'یک یا چند کالای فاکتور در شرکت یافت نشد.');
    }
    let id: string;
    try {
      id = await this.repo.insertSupplierInvoice(dto);
    } catch (err) {
      throw this.mapDbError(err);
    }
    return this.get(companyId, id);
  }

  async approve(companyId: string, id: string): Promise<SupplierInvoiceRow> {
    assertId(id, 'فاکتور تأمین‌کننده');
    let approved: SupplierInvoiceRow | null;
    try {
      approved = await this.repo.approveSupplierInvoice(companyId, id);
    } catch (err) {
      throw this.mapDbError(err);
    }
    if (approved) return approved;
    const existing = await this.repo.findSupplierInvoice(companyId, id);
    if (!existing) throw notFound('فاکتور تأمین‌کننده یافت نشد');
    throw conflict('invoice_not_approvable', 'این فاکتور پیش‌تر تأیید شده یا قابل تأیید نیست.');
  }

  private mapDbError(err: unknown): Error {
    const e = err as { code?: string; constraint?: string };
    if (e?.code === '23505') {
      return conflict(
        'duplicate_invoice',
        e?.constraint === 'uq_supplier_invoice_internal'
          ? 'شمارهٔ داخلی فاکتور تکراری است.'
          : 'فاکتوری با این شماره برای این تأمین‌کننده قبلاً ثبت شده است.',
      );
    }
    if (e?.code === '23503') {
      return badRequest('reference_invalid', 'یکی از ارجاع‌های فاکتور معتبر نیست.');
    }
    if (e?.code === '23514') {
      return badRequest('check_violation', 'مقادیر فاکتور خارج از بازهٔ مجاز است.');
    }
    return badRequest('invoice_save_failed', 'خطای غیرمنتظره در ثبت فاکتور.');
  }
}

// ---------------- Payment Voucher ----------------

@Injectable()
export class PaymentVoucherService {
  constructor(@Inject(PURCHASING_REPOSITORY) private readonly repo: PurchasingRepository) {}

  async list(
    companyId: string,
    query: ListPaymentVouchersQueryDto,
  ): Promise<Page<PaymentVoucherRow>> {
    const { items, nextCursor, hasMore } = await this.repo.listPaymentVouchers(companyId, query);
    return { items, next_cursor: nextCursor, has_more: hasMore };
  }

  async get(companyId: string, id: string): Promise<PaymentVoucherRow> {
    assertId(id, 'سند پرداخت');
    const row = await this.repo.findPaymentVoucher(companyId, id);
    if (!row) throw notFound('سند پرداخت یافت نشد');
    return row;
  }

  async create(companyId: string, dto: CreatePaymentVoucherDto): Promise<PaymentVoucherRow> {
    const amount = Number(dto.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw badRequest('invalid_amount', 'مبلغ پرداخت باید بزرگ‌تر از صفر باشد.');
    }
    if (!(await this.repo.branchInCompany(companyId, dto.branch_id))) {
      throw badRequest('branch_invalid', 'شعبهٔ سند پرداخت یافت نشد.');
    }
    if (!(await this.repo.supplierInCompany(companyId, dto.supplier_id))) {
      throw badRequest('supplier_invalid', 'تأمین‌کنندهٔ سند پرداخت یافت نشد.');
    }
    if (!(await this.repo.paymentMethodActive(dto.method_id))) {
      throw badRequest('method_invalid', 'روش پرداخت یافت نشد یا غیرفعال است.');
    }

    const allocations = dto.allocations ?? [];
    if (allocations.length > 0) {
      for (const a of allocations) {
        if (!Number.isFinite(Number(a.amount)) || Number(a.amount) <= 0) {
          throw badRequest('invalid_amount', 'مبلغ تخصیص باید بزرگ‌تر از صفر باشد.');
        }
      }
      const allocTotal = allocations.reduce((s, a) => s + Number(a.amount), 0);
      if (allocTotal > amount + 0.004) {
        throw unprocessable('over_allocation', 'جمع تخصیص‌ها از مبلغ سند پرداخت بیشتر است.');
      }
      const balances = await this.repo.supplierInvoiceBalances(
        companyId,
        allocations.map((a) => a.supplier_invoice_id),
      );
      // هر فاکتور فقط یک بار در یک سند تخصیص می‌خورد (قید uq_payment_allocation)
      const seen = new Set<string>();
      for (const a of allocations) {
        if (seen.has(a.supplier_invoice_id)) {
          throw badRequest('duplicate_allocation', 'یک فاکتور دوبار در این سند تخصیص داده شده است.');
        }
        seen.add(a.supplier_invoice_id);
        const bal = balances.get(a.supplier_invoice_id);
        if (!bal) throw unprocessable('invoice_not_found', 'یکی از فاکتورهای تخصیص یافت نشد.');
        if (bal.supplier_id !== dto.supplier_id) {
          throw unprocessable('invoice_supplier_mismatch', 'فاکتور به این تأمین‌کننده تعلق ندارد.');
        }
        if (bal.status !== 'approved' && bal.status !== 'partially_paid') {
          throw unprocessable('invoice_not_payable', 'فاکتور در وضعیت قابل پرداخت نیست.');
        }
        if (Number(a.amount) > bal.remaining + 0.004) {
          throw unprocessable('over_allocation', 'مبلغ تخصیص از ماندهٔ باز فاکتور بیشتر است.');
        }
      }
    }

    let id: string;
    try {
      id = await this.repo.insertPaymentVoucher(dto, allocations);
    } catch (err) {
      throw this.mapDbError(err);
    }
    return this.get(companyId, id);
  }

  private mapDbError(err: unknown): Error {
    const e = err as { code?: string };
    if (e?.code === '23505') {
      return conflict('duplicate_voucher', 'سند پرداختی با این شماره برای شعبه/سال ثبت شده است.');
    }
    if (e?.code === '23503') {
      return badRequest('reference_invalid', 'یکی از ارجاع‌های سند پرداخت معتبر نیست.');
    }
    if (e?.code === '23514') {
      return badRequest('check_violation', 'مقادیر سند پرداخت خارج از بازهٔ مجاز است.');
    }
    return badRequest('voucher_save_failed', 'خطای غیرمنتظره در ثبت سند پرداخت.');
  }
}
