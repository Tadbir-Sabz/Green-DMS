import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsDefined,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** مقادیر مجاز entity برای قاعده (طبق دdl G.۶) */
export const RULE_ENTITIES = [
  'sales_order',
  'invoice',
  'customer',
  'product',
  'staff',
  'waybill',
  'return_request',
  'payment_receipt',
  'purchase_order',
  'tour',
  'delivery',
] as const;

/** مقادیر مجاز event */
export const RULE_EVENTS = [
  'before_save',
  'before_approve',
  'after_save',
  'on_schedule',
] as const;

/** مقادیر مجاز effect */
export const RULE_EFFECTS = [
  'block',
  'warn',
  'require_approval',
  'set_field',
  'notify',
] as const;

/** مقادیر مجاز action_type */
export const RULE_ACTION_TYPES = [
  'set_discount',
  'set_price',
  'block_order',
  'require_approval',
  'assign_supervisor',
  'add_gift',
  'send_sms',
  'create_task',
  'flag_customer',
] as const;

/** مقادیر مجاز scope_type */
export const RULE_SCOPE_TYPES = [
  'company',
  'branch',
  'area',
  'region',
  'route',
  'customer_group',
  'customer',
] as const;

/** دto برای ایجاد/بروزرسانی قاعده */
export class CreateRuleDto {
  @IsDefined()
  @IsString()
  code: string;

  @IsDefined()
  @IsString()
  title: string;

  @IsDefined()
  @IsEnum(RULE_ENTITIES, { each: false })
  entity: string;

  @IsDefined()
  @IsEnum(RULE_EVENTS, { each: false })
  event: string;

  @IsDefined()
  @IsEnum(RULE_EFFECTS, { each: false })
  effect: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(32767)
  priority?: number;

  @IsDefined()
  @IsString()
  message_fa: string;

  @IsOptional()
  @IsDateString()
  valid_from?: string;

  @IsOptional()
  @IsDateString()
  valid_to?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleConditionDto)
  conditions?: RuleConditionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleActionDto)
  actions?: RuleActionDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleScopeDto)
  scopes?: RuleScopeDto[];
}

/** شرایط قاعده (AND داخل گروه، OR بین گروه‌ها) */
export class RuleConditionDto {
  @IsOptional()
  @IsNumber()
  group_no?: number;

  @IsDefined()
  @IsString()
  field: string;

  @IsDefined()
  @IsString()
  operator: string;

  @IsDefined()
  value: unknown;
}

/** اقدامات قاعده */
export class RuleActionDto {
  @IsDefined()
  @IsEnum(RULE_ACTION_TYPES, { each: false })
  action_type: string;

  @IsOptional()
  params?: Record<string, unknown>;
}

/** دامنه تطبيق قاعده */
export class RuleScopeDto {
  @IsDefined()
  @IsEnum(RULE_SCOPE_TYPES, { each: false })
  scope_type: string;

  @IsDefined()
  @IsUUID('4')
  scope_id: string;
}

/** دto برای پاسخ قاعده */
export class RuleDto {
  id: string;
  company_id: string;
  code: string;
  title: string;
  entity: string;
  event: string;
  effect: string;
  priority: number;
  message_fa: string;
  valid_from: string | null;
  valid_to: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** دto برای زنجیره تأیید */
export class CreateApprovalChainDto {
  @IsDefined()
  @IsString()
  code: string;

  @IsDefined()
  @IsString()
  entity: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApprovalStepDefDto)
  steps?: ApprovalStepDefDto[];
}

/** بدنه فعال/غیرفعال کردن قاعده (ستون status در دdl وجود ندارد) */
export class UpdateRuleActiveDto {
  @IsDefined()
  @IsBoolean()
  is_active: boolean;
}

/** ایجاد قاعده استثنا — شعبه هدف الزامی است */
export class CreateExceptionItemDto {
  @IsDefined()
  @IsUUID('4')
  branch_id: string;

  @IsDefined()
  @IsString()
  kind: string;

  @IsOptional()
  @IsEnum(['low', 'medium', 'high', 'critical'])
  severity?: string;

  @IsOptional()
  @IsString()
  entity_type?: string | null;

  @IsOptional()
  @IsUUID('4')
  entity_id?: string | null;

  @IsOptional()
  params?: Record<string, unknown>;
}

/** تعریف مرحله تأیید */
export class ApprovalStepDefDto {
  @IsDefined()
  @IsNumber()
  @Min(1)
  step_no: number;

  @IsOptional()
  @IsUUID('4')
  approver_role_id?: string | null;

  @IsOptional()
  @IsUUID('4')
  approver_staff_id?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  min_amount?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  max_amount?: number | null;

  @IsOptional()
  @IsEnum(['true', 'false'])
  is_mandatory?: string;
}

/** دto برای درخواست تأیید */
export class CreateApprovalRequestDto {
  @IsDefined()
  @IsUUID('4')
  approval_chain_id: string;

  @IsDefined()
  @IsString()
  entity_type: string;

  @IsDefined()
  @IsUUID('4')
  entity_id: string;

  @IsDefined()
  @IsUUID('4')
  requested_by: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number | null;
}

/** دto برای تصمیم تأییدکننده */
export class ApprovalDecisionDto {
  @IsDefined()
  @IsEnum(['approved', 'rejected', 'returned'])
  decision: string;

  @IsOptional()
  @IsString()
  comment?: string | null;
}

/** استثناء */
export class ExceptionItemDto {
  id: string;
  branch_id: string;
  kind: string;
  severity: string;
  entity_type: string | null;
  entity_id: string | null;
  status: string;
  created_at: string;
}
