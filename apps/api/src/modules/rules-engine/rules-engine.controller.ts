import { Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { ModuleInfo } from '../../common/module-info';
import { AuthGuard } from '../identity-rbac/auth.guard';
import { PermissionsGuard } from '../identity-rbac/permissions.guard';
import { RequirePermissions } from '../identity-rbac/require-permissions.decorator';
import { CurrentUser } from '../identity-rbac/auth-context.decorator';
import {
  ApprovalDecisionDto,
  CreateApprovalChainDto,
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
    @Body() dto: CreateApprovalRequestDto,
  ) {
    return this.service.createApprovalRequest(companyId, dto);
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
