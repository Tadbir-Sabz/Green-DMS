import { IsEmail, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * DTOهای پورتال B2B. توجه: این کلاس‌ها باید در کنترلر با importِ «مقدار» (نه
 * `import type`) بیایند تا ValidationPipe درست کار کند.
 */

export class PortalLoginDto {
  @IsEmail({}, { message: 'ایمیل معتبر نیست.' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'رمز عبور دست‌کم ۸ نویسه است.' })
  @MaxLength(128)
  password!: string;
}

export class PortalRefreshDto {
  @IsString()
  refresh_token!: string;
}

/** ساختِ حسابِ پورتال برای یک مشتری — توسطِ کارکنان (master.customer.update). */
export class CreatePortalUserDto {
  @IsUUID('4')
  customer_id!: string;

  @IsEmail({}, { message: 'ایمیل معتبر نیست.' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'رمز عبور دست‌کم ۸ نویسه است.' })
  @MaxLength(128)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  display_name?: string;
}

export interface PortalIdentity {
  id: string;
  email: string;
  display_name: string | null;
  company_id: string;
  customer_id: string;
}

export interface PortalSessionResponse {
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
  portal_user: PortalIdentity;
}

export interface PortalMe extends PortalIdentity {
  customer_code: string;
  customer_name: string;
}

export interface PortalInvoice {
  id: string;
  doc_number: string;
  fiscal_year: number;
  invoice_date: string;
  due_date: string | null;
  grand_total: string;
  paid_amount: string;
  status: string;
}

export interface PortalOrder {
  id: string;
  doc_number: string;
  fiscal_year: number;
  order_date: string;
  grand_total: string;
  status: string;
}

export interface PortalBalance {
  outstanding: string;
  overdue: string;
  credit_limit: string | null;
  credit_available: string | null;
}
