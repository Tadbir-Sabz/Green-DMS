import { Transform, Type } from 'class-transformer';
import {
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

/** enumهای هماهنگ با DDL (مهاجرت 0013 خزانه) */
export const CHEQUE_DIRECTIONS = ['received', 'issued'] as const;
export const CHEQUE_API_STATUSES = ['pending', 'cleared', 'bounced', 'returned'] as const;

const toNumber = ({ value }: { value: unknown }): unknown => {
  if (value === '' || value === null || value === undefined) return value;
  const n = Number(value);
  return Number.isNaN(n) ? value : n;
};

// ---------------- AR ----------------

/** GET /ar — مانده مشتریان با رده‌بندی سنی */
export class ListArQueryDto {
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
  @IsDateString()
  as_of?: string;

  @IsOptional()
  @IsUUID('4')
  branch_id?: string;
}

/** GET /ar/{customerId}/statement — صورتحساب دوره‌ای */
export class CustomerStatementQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

// ---------------- AP ----------------

/** GET /ap — مانده تأمین‌کنندگان */
export class ListApQueryDto {
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
  supplier_person_id?: string;
}

// ---------------- Treasury ----------------

/** GET /treasury — مانده صندوق/بانک + مغایرت */
export class ListTreasuryQueryDto {
  @IsOptional()
  @IsDateString()
  as_of?: string;

  @IsOptional()
  @IsUUID('4')
  bank_account_id?: string;
}

// ---------------- Treasury daily close ----------------

/** enum هماهنگ با daily_treasury_close.status (DDL مهاجرت 0013) */
export const TREASURY_CLOSE_STATUSES = ['draft', 'closed', 'approved'] as const;

/** GET /treasury/closes — فهرست بستن‌های روزانهٔ خزانه */
export class ListTreasuryClosesQueryDto {
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
  branch_id?: string;

  @IsOptional()
  @IsIn([...TREASURY_CLOSE_STATUSES])
  status?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

/**
 * POST /treasury/closes — ثبت و بستن روزانهٔ خزانهٔ یک شعبه.
 * مبالغ رشتهٔ اعشاری‌اند؛ ناندهی‌شده‌ها صفر درج می‌شوند (ستون‌ها not null default 0).
 */
export class CreateTreasuryCloseDto {
  @IsUUID('4')
  branch_id!: string;

  @IsDateString()
  close_date!: string;

  @IsOptional()
  @IsNumberString()
  cash_expected?: string;

  @IsOptional()
  @IsNumberString()
  cash_counted?: string;

  @IsOptional()
  @IsNumberString()
  bank_balance?: string;

  @IsOptional()
  @IsNumberString()
  cheque_in_hand_amount?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  note?: string;
}

/** POST /treasury/closes/{id}/approve — تأیید بستن روزانه (اختیاری با یادداشت) */
export class ApproveTreasuryCloseDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  note?: string;
}

// ---------------- Cheques ----------------

/** GET /cheques */
export class ListChequesQueryDto {
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
  @IsIn([...CHEQUE_DIRECTIONS])
  direction?: string;

  @IsOptional()
  @IsIn([...CHEQUE_API_STATUSES])
  status?: string;

  @IsOptional()
  @IsDateString()
  due_from?: string;

  @IsOptional()
  @IsDateString()
  due_to?: string;
}

/** POST /cheques — ثبت چک دریافتی/صادری */
export class CreateChequeDto {
  @IsIn([...CHEQUE_DIRECTIONS])
  direction!: string;

  /** صادرکننده (چک دریافتی → مشتری) یا گیرنده (چک صادری → تأمین‌کننده) */
  @IsOptional()
  @IsUUID('4')
  person_id?: string;

  @IsOptional()
  @IsUUID('4')
  bank_account_id?: string;

  @IsNumberString()
  amount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  cheque_number?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  bank_name?: string;

  @IsDateString()
  due_date!: string;

  @IsOptional()
  @IsIn([...CHEQUE_API_STATUSES])
  status?: string;
}

/** PATCH /cheques/{id} — تعیین تکلیف (وصول/برگشت/واگذاری) */
export class UpdateChequeDto {
  @IsOptional()
  @IsIn([...CHEQUE_API_STATUSES])
  status?: string;

  @IsOptional()
  @IsDateString()
  cleared_at?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  cheque_number?: string;

  @IsOptional()
  @IsUUID('4')
  bank_account_id?: string;
}

// ---------------- Payments (AR receipts) ----------------

/** یک تخصیص رسید به فاکتور */
export class ReceiptAllocationDto {
  @IsUUID('4')
  invoice_id!: string;

  @IsNumberString()
  amount!: string;
}

/** GET /payments */
export class ListPaymentsQueryDto {
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
  customer_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  kind?: string;
}

/** POST /payments — ثبت وصول و تخصیص به فاکتورها */
export class CreatePaymentDto {
  @IsUUID('4')
  customer_id!: string;

  /** شناسه payment_method (نقد/کارت/چک/…) */
  @IsUUID('4')
  method_id!: string;

  @IsNumberString()
  amount!: string;

  @IsOptional()
  @IsDateString()
  paid_at?: string;

  @IsOptional()
  @IsUUID('4')
  pos_terminal_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  reference?: string;

  @IsOptional()
  @IsUUID('4')
  tour_id?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiptAllocationDto)
  allocations?: ReceiptAllocationDto[];
}
