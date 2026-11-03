import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumberString,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** enumهای هماهنگ با DDL دفتر کل (مهاجرت 0018) */
export const JOURNAL_STATUSES = ['draft', 'posted', 'voided'] as const;
export const JOURNAL_SOURCE_TYPES = [
  'invoice',
  'credit_note',
  'receipt',
  'payment_voucher',
  'goods_receipt',
  'supplier_invoice',
  'value_document',
  'cash_txn',
  'cheque',
  'payroll',
  'manual',
  'opening',
  'closing',
  'recurring',
] as const;
export const ACCOUNT_NATURES = ['debit', 'credit'] as const;
export const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense', 'contra'] as const;
export const PERIOD_STATUSES = ['open', 'closed', 'locked'] as const;
export const LINE_PARTY_TYPES = ['customer', 'supplier', 'staff'] as const;

// ---------------- Chart of accounts ----------------

/** GET /gl/accounts — درخت کدینگ حساب‌ها */
export class ListAccountsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number = 200;

  @IsOptional()
  @IsIn([...ACCOUNT_NATURES])
  nature?: string;

  @IsOptional()
  @IsIn([...ACCOUNT_TYPES])
  account_type?: string;
}

// ---------------- Fiscal periods ----------------

/** GET /gl/periods — دوره‌های مالی */
export class ListPeriodsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1300)
  @Max(1500)
  fiscal_year?: number;

  @IsOptional()
  @IsIn([...PERIOD_STATUSES])
  status?: string;
}

/** POST /gl/periods — ساخت/بازکردن یک دوره مالی */
export class CreatePeriodDto {
  @Type(() => Number)
  @IsInt()
  @Min(1300)
  @Max(1500)
  fiscal_year!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  period_no!: number;

  @IsDateString()
  start_date!: string;

  @IsDateString()
  end_date!: string;
}

// ---------------- Journal entries ----------------

/** GET /gl/journals — فهرست اسناد حسابداری */
export class ListJournalsQueryDto {
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
  @IsIn([...JOURNAL_STATUSES])
  status?: string;

  @IsOptional()
  @IsIn([...JOURNAL_SOURCE_TYPES])
  source_type?: string;

  @IsOptional()
  @IsUUID('4')
  fiscal_period_id?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

/** یک سطر سند — دقیقاً یک سمت (بدهکار یا بستانکار) غیر صفر (ck_journal_line_one_side) */
export class JournalLineDto {
  @IsUUID('4')
  account_id!: string;

  @IsString()
  @MaxLength(256)
  description!: string;

  @IsOptional()
  @IsNumberString()
  debit?: string;

  @IsOptional()
  @IsNumberString()
  credit?: string;

  @IsOptional()
  @IsIn([...LINE_PARTY_TYPES])
  party_type?: string;

  @IsOptional()
  @IsUUID('4')
  party_id?: string;

  @IsOptional()
  @IsObject()
  dimensions?: Record<string, unknown>;
}

/** POST /gl/journals — ثبت و صدور سند دستیِ متوازن */
export class CreateJournalDto {
  @IsUUID('4')
  branch_id!: string;

  @IsDateString()
  entry_date!: string;

  @IsString()
  @MaxLength(256)
  description!: string;

  /** در صورت نبود، دورهٔ بازِ شامل entry_date به‌طور خودکار resolve می‌شود */
  @IsOptional()
  @IsUUID('4')
  fiscal_period_id?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines!: JournalLineDto[];
}

// ---------------- Trial balance ----------------

/** GET /gl/trial-balance — تراز آزمایشی از v_trial_balance */
export class TrialBalanceQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1300)
  @Max(1500)
  fiscal_year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  period_no?: number;
}
