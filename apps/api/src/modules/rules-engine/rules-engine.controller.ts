import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { ModuleInfo } from '../../common/module-info';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import {
  ApprovalDecisionDto,
  CreateApprovalChainDto,
  CreateApprovalPolicyDto,
  SetPolicyActiveDto,
  CreateDelegationDto,
  CreateApprovalRequestDto,
  CreateExceptionItemDto,
  CreateRuleDto,
  UpdateRuleActiveDto,
} from './rules-engine.dto';
import type { RulesEngineService } from './rules-engine.service';
import { RULES_ENGINE_SERVICE } from './rules-engine.tokens';

/**
 * ماژول ۳ — کنترل‌ها و قوانین جامع (Rules Engine)
 * مسیرها مطابق قرارداد OpenAPI: /rules, /approval-chains, /approvals, /exception-items
 */
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('rules-engine')
export class RulesEngineController {
  constructor(
    @Inject(RULES_ENGINE_SERVICE) private readonly service: RulesEngineService,
  ) {}

  @Get()
  info(): ModuleInfo {
    return {
      module: 'rules-engine',
      title: 'کنترل‌ها و قوانین جامع',
      resources: ['rules', 'rule-sets', 'constraints', 'approval-chains', 'evaluations'],
      status: 'scaffold',
    };
  }

  // ---------------- قوانین ----------------

  @Get('rules')
  @RequirePermissions('rules.view')
  listRules(@CurrentUser('companyId') companyId: string) {
    return this.service.listRules(companyId);
  }

  @Get('rules/:id')
  @RequirePermissions('rules.view')
  getRule(
    @CurrentUser('companyId') companyId: string,
    @Param('id') id: string,
  ) {
    return this.service.getRule(companyId, id);
  }

  @Post('rules')
  @RequirePermissions('rules.manage')
  createRule(
    @CurrentUser('companyId') companyId: string,
    @Body() dto: CreateRuleDto,
  ) {
    return this.service.createRule(companyId, dto);
  }

  @Patch('rules/:id/status')
  @RequirePermissions('rules.manage')
  updateRuleStatus(
    @CurrentUser('companyId') companyId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRuleActiveDto,
  ) {
    return this.service.setRuleActive(companyId, id, dto.is_active);
  }

  // ---------------- زنجیره تأیید ----------------

  @Get('approval-chains')
  @RequirePermissions('rules.view')
  listApprovalChains(@CurrentUser('companyId') companyId: string) {
    return this.service.listApprovalChains(companyId);
  }

  @Get('approval-chains/:id')
  @RequirePermissions('rules.view')
  getApprovalChain(
    @CurrentUser('companyId') companyId: string,
    @Param('id') id: string,
  ) {
    return this.service.getApprovalChain(companyId, id);
  }

  @Post('approval-chains')
  @RequirePermissions('rules.manage')
  createApprovalChain(
    @CurrentUser('companyId') companyId: string,
    @Body() dto: CreateApprovalChainDto,
  ) {
    return this.service.createApprovalChain(companyId, dto);
  }

  // ---------------- درخواست تأیید ----------------

  @Get('approvals')
  @RequirePermissions('rules.view')
  listApprovalRequests(
    @CurrentUser('companyId') companyId: string,
    @Query('status') status?: string,
  ) {
    return this.service.listApprovalRequests(companyId, status);
  }

  @Post('approvals')
  @RequirePermissions('rules.manage')
  createApprovalRequest(
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateApprovalRequestDto,
  ) {
    // G-03: درخواست‌دهنده از نشست (بدنه نمی‌تواند شخصِ اول را جعل کند)
    return this.service.createApprovalRequest(companyId, dto, userId);
  }

  // توجه: این مسیرها **باید** پیش از `approvals/:id` تعریف شوند، وگرنه
  // پارامترِ `:id` آن‌ها را می‌بلعد و کارتابل ۴۰۴ می‌دهد (خطای واقعیِ یافت‌شده).
  /** کارتابلِ من: درخواست‌هایی که نوبتِ تصمیمِ من است. */
  @Get('approvals/inbox')
  @RequirePermissions('rules.approval.decide')
  inbox(
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.service.myInbox(companyId, userId);
  }

  /** درخواست‌هایی که خودم ثبت کرده‌ام (وضعیتِ گردشِ من). */
  @Get('approvals/submitted')
  @RequirePermissions('rules.view')
  submitted(
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.service.mySubmitted(companyId, userId);
  }

  /** درخواست‌های منقضی/ارتقایافتهٔ شرکت. */
  @Get('approvals/expired')
  @RequirePermissions('rules.view')
  expired(@CurrentUser('companyId') companyId: string) {
    return this.service.expiredRequests(companyId);
  }

  /** اجرای دستیِ چرخهٔ انقضا/ارتقا (همان کاری که job انجام می‌دهد). */
  @Post('approvals/run-expiry')
  @RequirePermissions('rules.manage')
  @HttpCode(200)
  runExpiry(@CurrentUser('companyId') companyId: string) {
    return this.service.processExpired(companyId);
  }

  @Get('approvals/:id')
  @RequirePermissions('rules.view')
  getApprovalRequest(
    @CurrentUser('companyId') companyId: string,
    @Param('id') id: string,
  ) {
    return this.service.getApprovalRequest(companyId, id);
  }

  @Post('approvals/:id/decision')
  @RequirePermissions('rules.approval.decide')
  decideApproval(
    @CurrentUser('companyId') companyId: string,
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: ApprovalDecisionDto & { step_no: number },
  ) {
    return this.service.decideApproval(
      companyId,
      id,
      userId,
      dto.step_no,
      dto.decision as 'approved' | 'rejected' | 'returned',
      dto.comment ?? null,
    );
  }

  // ===================================================================
  // TASK-24Y — Phase 5: کارتابل، سیاست، تفکیل، اعلان، انقضا
  // ===================================================================

  // ---------------- سیاستِ تأیید ----------------

  @Get('approval-policies')
  @RequirePermissions('rules.view')
  listPolicies(
    @CurrentUser('companyId') companyId: string,
    @Query('operation') operation?: string,
  ) {
    return this.service.listPolicies(companyId, operation);
  }

  @Post('approval-policies')
  @RequirePermissions('rules.manage')
  createPolicy(
    @CurrentUser('companyId') companyId: string,
    @Body() dto: CreateApprovalPolicyDto,
  ) {
    return this.service.createPolicy(companyId, dto);
  }

  @Patch('approval-policies/:id/status')
  @RequirePermissions('rules.manage')
  setPolicyActive(
    @CurrentUser('companyId') companyId: string,
    @Param('id') id: string,
    @Body() dto: SetPolicyActiveDto,
  ) {
    return this.service.setPolicyActive(companyId, id, dto.is_active);
  }

  // ---------------- تفکیلِ تأیید ----------------

  @Get('approval-delegations')
  @RequirePermissions('rules.view')
  listDelegations(
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.service.listDelegations(companyId, userId);
  }

  @Post('approval-delegations')
  @RequirePermissions('rules.approval.decide')
  createDelegation(
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateDelegationDto,
  ) {
    return this.service.createDelegation(companyId, userId, dto);
  }

  @Delete('approval-delegations/:id')
  @RequirePermissions('rules.approval.decide')
  revokeDelegation(
    @CurrentUser('companyId') companyId: string,
    @Param('id') id: string,
  ) {
    return this.service.revokeDelegation(companyId, id);
  }

  // ---------------- اعلان‌ها ----------------

  @Get('approval-notifications')
  @RequirePermissions('rules.view')
  notifications(
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('userId') userId: string,
    @Query('status') status?: string,
  ) {
    return this.service.listNotifications(companyId, userId, status);
  }

  // ---------------- استثنا ----------------

  @Get('exception-items')
  @RequirePermissions('rules.view')
  listExceptionItems(
    @CurrentUser('companyId') companyId: string,
    @Query('branch_id') branchId: string,
  ) {
    return this.service.listExceptionItems(companyId, branchId);
  }

  @Post('exception-items')
  @RequirePermissions('rules.exceptions.resolve')
  createExceptionItem(
    @CurrentUser('companyId') companyId: string,
    @Body() dto: CreateExceptionItemDto,
  ) {
    return this.service.createExceptionItem(companyId, {
      branch_id: dto.branch_id,
      kind: dto.kind,
      severity: dto.severity ?? 'medium',
      entity_type: dto.entity_type ?? null,
      entity_id: dto.entity_id ?? null,
      payload: dto.params ?? {},
    });
  }
}
