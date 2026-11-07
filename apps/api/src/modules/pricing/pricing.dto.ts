import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsDefined,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PROMOTION_KINDS, type PromotionKind } from './pricing-engine';

const toNumber = ({ value }: { value: unknown }): unknown => {
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value);
  return value;
};

const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true' || value === true) return true;
  if (value === 'false' || value === false) return false;
  return value;
};

const toDecimalString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'number' ? String(value) : value;

const DECIMAL_RE = /^\d+(\.\d+)?$/;
const DECIMAL = { message: 'مقدار باید عدد غیرمنفی اعشاری باشد.' };

// ---------------------------------------------------------------
// شبیه‌سازی/استعلامِ قیمت
// ---------------------------------------------------------------

export class QuoteLineDto {
  @IsDefined()
  @IsUUID('4')
  product_id: string;

  @IsOptional()
  @IsUUID('4')
  packaging_id?: string | null;

  @IsDefined()
  @Transform(toNumber)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.0001, { message: 'تعداد باید بزرگ‌تر از صفر باشد.' })
  @Max(1_000_000_000)
  qty: number;

  @IsOptional()
  @Transform(toDecimalString)
  @IsString()
  @Matches(DECIMAL_RE, DECIMAL)
  unit_price?: string | null;

  @IsOptional()
  @Transform(toDecimalString)
  @IsString()
  @Matches(DECIMAL_RE, DECIMAL)
  discount_amount?: string | null;
}

export class QuoteRequestDto {
  @IsOptional()
  @IsUUID('4')
  customer_id?: string | null;

  @IsOptional()
  @IsDateString()
  pricing_date?: string | null;

  @IsOptional()
  @IsUUID('4')
  price_list_id?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  coupon_codes?: string[];

  /**
   * TASK-24F · HIGH-2: سقفِ کلِ تخفیف دیگر پارامترِ درخواست نیست؛ از سیاستِ پایدارِ
   * شرکت (`pricing_settings.max_total_discount_pct`) خوانده می‌شود تا شبیه‌سازی و
   * سفارشِ واقعی همیشه یک سقف داشته باشند.
   */

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  apply_promotions?: boolean;

  /**
   * TASK-24F · HIGH-3: پرچم‌های «قیمتِ دستی» و «عبور از سقفِ تخفیف» از بدنهٔ درخواست
   * حذف شدند؛ فقط از مجوزهای نشست در کنترلر ساخته می‌شوند (body هرگز مجوز نیست).
   */

  /** کلیدِ idempotency — ارزیابیِ تکراری همان نتیجه را برمی‌گرداند (بدونِ مصرفِ دوباره) */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotency_key?: string | null;

  /**
   * دلیلِ درخواستِ صریحِ لیستِ قیمتِ قلمرویِ دیگر (TASK-24F · MEDIUM-2).
   * این فیلد مجوز نیست؛ فقط همراهِ مجوزِ `pricing.price_list.cross_domain` اثر دارد و
   * در دفترِ تغییرِ قیمت ثبت می‌شود.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  cross_domain_reason?: string | null;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  persist_audit?: boolean;

  @IsDefined()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => QuoteLineDto)
  lines: QuoteLineDto[];
}

// ---------------------------------------------------------------
// قیمتِ مشتری
// ---------------------------------------------------------------

export class CreateCustomerPriceDto {
  @IsDefined()
  @IsUUID('4')
  customer_id: string;

  @IsDefined()
  @IsUUID('4')
  product_id: string;

  @IsOptional()
  @IsUUID('4')
  packaging_id?: string | null;

  @IsDefined()
  @Transform(toDecimalString)
  @IsString()
  @Matches(DECIMAL_RE, DECIMAL)
  price: string;

  @IsOptional()
  @Transform(toDecimalString)
  @IsString()
  @Matches(DECIMAL_RE, DECIMAL)
  min_qty?: string | null;

  @IsOptional()
  @Transform(toDecimalString)
  @IsString()
  @Matches(DECIMAL_RE, DECIMAL)
  max_qty?: string | null;

  @IsOptional()
  @Transform(toDecimalString)
  @IsString()
  @Matches(DECIMAL_RE, DECIMAL)
  max_discount_pct?: string | null;

  @IsOptional()
  @IsDateString()
  valid_from?: string | null;

  @IsOptional()
  @IsDateString()
  valid_to?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;

  /** استثنای تأییدشدهٔ کفِ سود — فقط وقتی قیمت زیرِ کف است لازم می‌شود */
  @IsOptional()
  @IsUUID('4')
  margin_exception_id?: string | null;
}

export class UpdateCustomerPriceDto {
  @IsOptional()
  @Transform(toDecimalString)
  @IsString()
  @Matches(DECIMAL_RE, DECIMAL)
  price?: string;

  @IsOptional()
  @Transform(toDecimalString)
  @IsString()
  @Matches(DECIMAL_RE, DECIMAL)
  min_qty?: string | null;

  @IsOptional()
  @Transform(toDecimalString)
  @IsString()
  @Matches(DECIMAL_RE, DECIMAL)
  max_qty?: string | null;

  @IsOptional()
  @Transform(toDecimalString)
  @IsString()
  @Matches(DECIMAL_RE, DECIMAL)
  max_discount_pct?: string | null;

  @IsOptional()
  @IsDateString()
  valid_from?: string | null;

  @IsOptional()
  @IsDateString()
  valid_to?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string | null;

  @IsOptional()
  @IsUUID('4')
  margin_exception_id?: string | null;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(0)
  row_version?: number;
}

export class ListCustomerPricesQueryDto {
  @IsOptional()
  @IsUUID('4')
  customer_id?: string;

  @IsOptional()
  @IsUUID('4')
  product_id?: string;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

// ---------------------------------------------------------------
// قلمرو
// ---------------------------------------------------------------

export const PRICING_DOMAIN_KINDS = ['channel', 'area', 'branch'] as const;

export class CreatePricingDomainDto {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code: string;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  title: string;

  @IsDefined()
  @IsIn(PRICING_DOMAIN_KINDS)
  kind: 'channel' | 'area' | 'branch';

  @IsOptional()
  @IsIn(['retail', 'wholesale', 'chain', 'horeca', 'institution'])
  channel?: string | null;

  @IsOptional()
  @IsUUID('4')
  area_id?: string | null;

  @IsOptional()
  @IsUUID('4')
  branch_id?: string | null;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(0)
  @Max(1000)
  priority?: number;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  is_active?: boolean;
}

export class UpdatePricingDomainDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  title?: string;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(0)
  @Max(1000)
  priority?: number;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  is_active?: boolean;
}

// ---------------------------------------------------------------
// سیاستِ کفِ سود
// ---------------------------------------------------------------

export const MARGIN_SCOPES = ['company', 'category', 'product'] as const;
export const COST_BASES = ['avg_cost', 'standard_cost', 'last_purchase_cost'] as const;
export const UNKNOWN_COST_POLICIES = ['block', 'warn', 'ignore'] as const;

export class CreateMarginPolicyDto {
  @IsDefined()
  @IsIn(MARGIN_SCOPES)
  scope: 'company' | 'category' | 'product';

  @IsOptional()
  @IsUUID('4')
  domain_id?: string | null;

  @IsOptional()
  @IsUUID('4')
  category_id?: string | null;

  @IsOptional()
  @IsUUID('4')
  product_id?: string | null;

  @IsOptional()
  @IsIn(COST_BASES)
  cost_basis?: 'avg_cost' | 'standard_cost' | 'last_purchase_cost';

  @IsDefined()
  @Transform(toDecimalString)
  @IsString()
  @Matches(/^-?\d+(\.\d+)?$/, { message: 'درصدِ کفِ سود باید عدد باشد.' })
  min_margin_pct: string;

  @IsOptional()
  @IsIn(UNKNOWN_COST_POLICIES)
  on_unknown_cost?: 'block' | 'warn' | 'ignore';

  @IsOptional()
  @IsDateString()
  valid_from?: string | null;

  @IsOptional()
  @IsDateString()
  valid_to?: string | null;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(0)
  @Max(1000)
  priority?: number;
}

export class UpdateMarginPolicyDto {
  @IsOptional()
  @IsIn(COST_BASES)
  cost_basis?: 'avg_cost' | 'standard_cost' | 'last_purchase_cost';

  @IsOptional()
  @Transform(toDecimalString)
  @IsString()
  @Matches(/^-?\d+(\.\d+)?$/, { message: 'درصدِ کفِ سود باید عدد باشد.' })
  min_margin_pct?: string;

  @IsOptional()
  @IsIn(UNKNOWN_COST_POLICIES)
  on_unknown_cost?: 'block' | 'warn' | 'ignore';

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(0)
  @Max(1000)
  priority?: number;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  is_active?: boolean;
}

// ---------------------------------------------------------------
// استثنای کفِ سود
// ---------------------------------------------------------------

export const MARGIN_EXCEPTION_ENTITIES = ['price_list_item', 'customer_price', 'sales_order', 'promotion'] as const;

export class CreateMarginExceptionDto {
  @IsDefined()
  @IsIn(MARGIN_EXCEPTION_ENTITIES)
  entity_type: 'price_list_item' | 'customer_price' | 'sales_order' | 'promotion';

  @IsOptional()
  @IsUUID('4')
  entity_id?: string | null;

  @IsOptional()
  @IsUUID('4')
  product_id?: string | null;

  @IsOptional()
  @IsUUID('4')
  customer_id?: string | null;

  @IsOptional()
  @IsUUID('4')
  policy_id?: string | null;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  required_margin_pct?: number | null;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  effective_margin_pct?: number | null;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  granted_margin_pct?: number | null;

  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000, { message: 'دلیلِ استثنا الزامی و حداکثر ۱۰۰۰ کاراکتر است.' })
  reason: string;

  @IsOptional()
  @IsDateString()
  valid_until?: string | null;
}

export class DecideMarginExceptionDto {
  @IsDefined()
  @IsIn(['approve', 'reject'])
  decision: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  granted_margin_pct?: number | null;
}

export class ListMarginExceptionsQueryDto {
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected', 'expired', 'cancelled'])
  status?: string;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

// ---------------------------------------------------------------
// کوپن
// ---------------------------------------------------------------

export class CreateCouponDto {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code: string;

  @IsOptional()
  @IsUUID('4')
  customer_id?: string | null;

  @IsOptional()
  @IsDateString()
  valid_from?: string | null;

  @IsOptional()
  @IsDateString()
  valid_to?: string | null;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  max_uses?: number | null;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  max_uses_per_customer?: number | null;
}

// ---------------------------------------------------------------
// تشویق (افزودنی — DTO موجودِ pricing.dto حفظ می‌شود)
// ---------------------------------------------------------------

export const PROMOTION_KIND_VALUES = PROMOTION_KINDS as readonly PromotionKind[];

export class PromotionPreviewDto {
  @IsDefined()
  @IsIn(PROMOTION_KIND_VALUES)
  kind: PromotionKind;

  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  benefit?: Record<string, unknown>;
}

export class ListPriceChangesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  entity_type?: string;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

// ---------------------------------------------------------------
// سیاستِ پایدارِ قیمت‌گذاریِ شرکت (TASK-24F · HIGH-2 / MEDIUM-1)
// ---------------------------------------------------------------

/**
 * `PATCH /pricing/settings` — تنها منبعِ سیاست‌های مؤثر بر محاسبهٔ قیمتِ سفارش:
 *   • apply_promotions_on_orders   : اعمالِ خودکارِ تشویق‌ها روی سفارش (پیش‌فرض: خاموش)
 *   • max_total_discount_pct       : سقفِ کلِ تخفیفِ سند (NULL = بدونِ سقف)
 *   • max_line_discount_pct        : سقفِ پیش‌فرضِ تخفیفِ هر قلم وقتی منبعِ قیمت سقف ندارد
 *   • allow_loss_making_sales      : اجازهٔ فروش زیرِ بهای تمام‌شده (پیش‌فرض: نه)
 *   • min_order_date_lookback_days : حداکثر عقب‌گردِ مجازِ تاریخِ سفارش (NULL = فقط با مجوز)
 *   • require_override_reason      : الزامِ دلیل برای قیمتِ دستی/تخفیفِ فراتر از سقف
 */
export class UpdatePricingSettingsDto {
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  apply_promotions_on_orders?: boolean;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  @Min(0)
  @Max(100)
  max_total_discount_pct?: number | null;

  @IsOptional()
  @Transform(toNumber)
  @IsNumber()
  @Min(0)
  @Max(100)
  max_line_discount_pct?: number | null;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  allow_loss_making_sales?: boolean;

  @IsOptional()
  @Transform(toNumber)
  @IsInt()
  @Min(0)
  @Max(3650)
  min_order_date_lookback_days?: number | null;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  require_override_reason?: boolean;
}
