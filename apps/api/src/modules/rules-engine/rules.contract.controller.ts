import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import { CreateRuleDto } from './rules-engine.dto';
import type { ApprovalRequestView, RuleView, RulesEngineService } from './rules-engine.service';
import { RULES_ENGINE_SERVICE } from './rules-engine.tokens';

/** GET /rules — فیلترهای قرارداد + صفحه‌بندی cursor */
export class ListRulesQueryDto {
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
  @IsString()
  entity?: string;

  @IsOptional()
  @IsString()
  event?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  is_active?: boolean;
}

/** GET /approvals */
export class ListApprovalsQueryDto {
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
  @IsString()
  entity_type?: string;
}

/** PATCH /rules/{id} — همه فیلدها اختیاری */
export class UpdateRuleDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  entity?: string;

  @IsOptional()
  @IsString()
  event?: string;

  @IsOptional()
  @IsString()
  effect?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsString()
  message_fa?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

/**
 * TASK-24Z: DTOی تصمیم در این کنترلر **حذف شد**.
 *
 * پیش‌تر این کنترلر مسیرِ `POST approvals/:id/decision` را دوباره اعلام می‌کرد
 * و بدنه را با `{decision: 'approve'|'reject', note}` اعتبارسنجی می‌کرد، در حالی
 * که قراردادِ OpenAPI و رابطِ وب هر دو `{step_no, decision: 'approved'|'rejected'|'returned'}`
 * می‌فرستند. نتیجه: تصمیم از مسیرِ وب **همیشه ۴۰۰** می‌گرفت و UIِ تحویل‌شده
 * عملاً کار نمی‌کرد. یک مسیر، یک DTO — در `RulesEngineController`.
 */
export class ApprovalDecisionContractDtoLegacy {
  decision?: string;
}

/**
 * مسیرهای قرارداد موتور قوانین — /rules و /approvals مطابق openapi.yaml.
 * همان RulesEngineService پشت اینهاست؛ /rules-engine/* داخلی (فاز B) سر جایش می‌ماند
 * تا وب قدیمی نشکند، ولی قرارداد این مسیرها را می‌شناسد.
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller()
export class RulesContractController {
  constructor(@Inject(RULES_ENGINE_SERVICE) private readonly service: RulesEngineService) {}

  @Get('rules')
  @RequirePermissions('rules.view')
  listRules(
    @Query() query: ListRulesQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<RuleView>> {
    return this.service.listRulesPaged(companyId, query);
  }

  @Post('rules')
  @RequirePermissions('rules.manage')
  createRule(
    @Body() dto: CreateRuleDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<RuleView> {
    return this.service.createRuleView(companyId, dto);
  }

  @Get('rules/:id')
  @RequirePermissions('rules.view')
  getRule(
    @Param('id') id: string,
    @CurrentUser('companyId') companyId: string,
  ): Promise<RuleView> {
    return this.service.getRuleView(companyId, id);
  }

  @Patch('rules/:id')
  @RequirePermissions('rules.manage')
  updateRule(
    @Param('id') id: string,
    @Body() dto: UpdateRuleDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<RuleView> {
    return this.service.updateRuleView(companyId, id, dto);
  }

  @Get('approvals')
  @RequirePermissions('rules.view')
  listApprovals(
    @Query() query: ListApprovalsQueryDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<Page<ApprovalRequestView>> {
    return this.service.listApprovalsPaged(companyId, query);
  }

  // TASK-24Z: مسیرِ تصمیم فقط یک‌جا اعلام می‌شود (RulesEngineController)،
  // مطابقِ قرارداد OpenAPI: { step_no, decision: approved|rejected|returned }.
}
