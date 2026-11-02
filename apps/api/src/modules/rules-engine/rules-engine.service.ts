import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RULE_ENTITIES, RULE_EVENTS, RULE_EFFECTS } from './rules-engine.dto';
import type {
  CreateApprovalChainDto,
  CreateApprovalRequestDto,
  CreateRuleDto,
  RulesEngineRepository,
} from './rules-engine.repository';
import { RULES_ENGINE_REPOSITORY } from './rules-engine.tokens';

const notFound = (msg: string): NotFoundException =>
  new NotFoundException({ code: 'not_found', message_fa: msg });

const badRequest = (code: string, message_fa: string): BadRequestException =>
  new BadRequestException({ code, message_fa });

/**what is the current step of an approval chain for a given amount */
function findCurrentStep(
  steps: { step_no: number; min_amount: number | null; max_amount: number | null }[],
  amount: number | null,
): number {
  for (const step of steps) {
    const minOk = step.min_amount == null || (amount != null && amount >= step.min_amount);
    const maxOk = step.max_amount == null || (amount != null && amount <= step.max_amount);
    if (minOk && maxOk) return step.step_no; // cumulative
  }
  return 1;
}

@Injectable()
export class RulesEngineService {
  constructor(
    @Inject(RULES_ENGINE_REPOSITORY)
    private readonly repo: RulesEngineRepository,
  ) {}

  // ---------------- قوانین ----------------

  async listRules(companyId: string) {
    const rules = await this.repo.listRules(companyId);
    const result = [];
    for (const r of rules) {
      const conditions = await this.repo.getRuleConditions(r.id);
      const actions = await this.repo.getRuleActions(r.id);
      const scopes = await this.repo.getRuleScopes(r.id);
      result.push({ ...r, conditions, actions, scopes });
    }
    return result;
  }

  async getRule(companyId: string, ruleId: string) {
    const rule = await this.repo.getRule(companyId, ruleId);
    if (!rule) throw notFound('قاعده یافت نشد');
    const conditions = await this.repo.getRuleConditions(ruleId);
    const actions = await this.repo.getRuleActions(ruleId);
    const scopes = await this.repo.getRuleScopes(ruleId);
    return { ...rule, conditions, actions, scopes };
  }

  async createRule(companyId: string, dto: CreateRuleDto) {
    if (!RULE_ENTITIES.includes(dto.entity as any)) {
      throw badRequest('invalid_entity', 'نوع موجودی قاعده معتبر نیست.');
    }
    if (!RULE_EVENTS.includes(dto.event as any)) {
      throw badRequest('invalid_event', 'رویداد قاعده معتبر نیست.');
    }
    if (!RULE_EFFECTS.includes(dto.effect as any)) {
      throw badRequest('invalid_effect', 'اقدام قاعده معتبر نیست.');
    }
    const id = await this.repo.createRule(
      companyId,
      dto,
      dto.conditions ?? [],
      dto.actions ?? [],
      dto.scopes ?? [],
    );
    return this.getRule(companyId, id);
  }

  async setRuleActive(companyId: string, ruleId: string, isActive: boolean) {
    const rule = await this.repo.getRule(companyId, ruleId);
    if (!rule) throw notFound('قاعده یافت نشد');
    const ok = await this.repo.setRuleActive(companyId, ruleId, isActive);
    if (!ok) throw badRequest('update_failed', 'تغییر وضعیت قاعده ناموفق بود.');
    return this.repo.getRule(companyId, ruleId);
  }

  // ---------------- زنجیره تأیید ----------------

  async listApprovalChains(companyId: string) {
    return this.repo.listApprovalChains(companyId);
  }

  async getApprovalChain(companyId: string, chainId: string) {
    const chain = await this.repo.getApprovalChain(companyId, chainId);
    if (!chain) throw notFound('زنجیره تأیید یافت نشد');
    const steps = await this.repo.getApprovalChainSteps(chainId);
    return { ...chain, steps };
  }

  async createApprovalChain(companyId: string, dto: CreateApprovalChainDto) {
    const id = await this.repo.createApprovalChain(
      companyId,
      dto,
      dto.steps ?? [],
    );
    return this.getApprovalChain(companyId, id);
  }

  // ---------------- درخواست تأیید ----------------

  async listApprovalRequests(companyId: string, status?: string) {
    return this.repo.listApprovalRequests(companyId, status);
  }

  async createApprovalRequest(companyId: string, dto: CreateApprovalRequestDto) {
    // بررسی وجود زنجیره تأیید
    const chain = await this.repo.getApprovalChain(companyId, dto.approval_chain_id);
    if (!chain) throw notFound('زنجیره تأیید یافت نشد');

    const id = await this.repo.createApprovalRequest(dto);
    const req = await this.repo.getApprovalRequest(companyId, id);
    if (!req) throw badRequest('create_failed', 'ایجاد درخواست تأیید ناموفق بود.');

    // تعیین مرحله فعلی بر اساس مبلغ
    const steps = await this.repo.getApprovalChainSteps(dto.approval_chain_id);
    const currentStep = findCurrentStep(steps, dto.amount ?? null);
    await this.repo.updateApprovalRequestStatus(id, 'pending', currentStep, null);

    return this.repo.getApprovalRequest(companyId, id);
  }

  async getApprovalRequest(companyId: string, requestId: string) {
    const req = await this.repo.getApprovalRequest(companyId, requestId);
    if (!req) throw notFound('درخواست تأیید یافت نشد');
    const decisions = await this.repo.listApprovalDecisions(requestId);
    return { ...req, decisions };
  }

  async decideApproval(
    companyId: string,
    requestId: string,
    decidedBy: string,
    stepNo: number,
    decision: 'approved' | 'rejected' | 'returned',
    comment: string | null,
  ) {
    const req = await this.repo.getApprovalRequest(companyId, requestId);
    if (!req) throw notFound('درخواست تأیید یافت نشد');
    if (req.status !== 'pending') {
      throw badRequest('not_pending', 'درخواست تأیید در وضعیت منتظر نیست.');
    }

    await this.repo.createApprovalDecision(
      requestId,
      stepNo,
      decidedBy,
      decision,
      comment,
    );

    if (decision === 'rejected') {
      await this.repo.updateApprovalRequestStatus(
        requestId,
        'rejected',
        stepNo,
        new Date().toISOString(),
      );
      return this.repo.getApprovalRequest(companyId, requestId);
    }

    if (decision === 'returned') {
      await this.repo.updateApprovalRequestStatus(
        requestId,
        'cancelled',
        stepNo,
        new Date().toISOString(),
      );
      return this.repo.getApprovalRequest(companyId, requestId);
    }

    // approved → پیش رفتن به مرحله بعدی یا بسته شدن
    // مرحله از خود درخواست گرفته می‌شود؛ approval_request ستون company_id ندارد
    const steps = await this.repo.getApprovalChainSteps(req.approval_chain_id);
    const maxStep = Math.max(...steps.map((s) => s.step_no));

    if (stepNo >= maxStep) {
      await this.repo.updateApprovalRequestStatus(
        requestId,
        'approved',
        stepNo,
        new Date().toISOString(),
      );
    } else {
      await this.repo.updateApprovalRequestStatus(
        requestId,
        'pending',
        stepNo + 1,
        null,
      );
    }

    return this.repo.getApprovalRequest(companyId, requestId);
  }

  // ---------------- استثنا ----------------

  async listExceptionItems(companyId: string, branchId?: string) {
    if (!branchId) {
      throw badRequest('branch_id_required', 'پارامر branch_id برای فهرست استثناها الزامی است.');
    }
    const ok = await this.repo.branchBelongsToCompany(companyId, branchId);
    if (!ok) throw notFound('شعبه در این شرکت یافت نشد');
    return this.repo.listExceptionItems(branchId);
  }

  async createExceptionItem(
    companyId: string,
    input: {
      branch_id: string;
      kind: string;
      severity?: string;
      entity_type?: string | null;
      entity_id?: string | null;
      payload?: Record<string, unknown>;
    },
  ) {
    const validKinds = [
      'price_mismatch',
      'stock_mismatch',
      'credit_override',
      'discount_override',
      'cash_variance',
      'count_variance',
      'geofence_breach',
      'sync_conflict',
      'moadian_error',
    ];
    if (!validKinds.includes(input.kind)) {
      throw badRequest('invalid_kind', 'نوع استثنا معتبر نیست.');
    }
    // محدودیت severity در دdl (migrations/0009:113) — خطای دیتابیس نباید به 500 برود
    const validSeverities = ['low', 'medium', 'high', 'critical'];
    const severity = input.severity ?? 'medium';
    if (!validSeverities.includes(severity)) {
      throw badRequest('invalid_severity', 'شدت استثنا معتبر نیست.');
    }
    // exception_item.branch_id کلید خارجی به branch(id) دارد؛ شعبه باید به شرکت باشد
    const belongs = await this.repo.branchBelongsToCompany(companyId, input.branch_id);
    if (!belongs) throw badRequest('invalid_branch', 'شعبه برای این شرکت معتبر نیست.');

    const id = await this.repo.createExceptionItem({ ...input, severity });
    return this.repo.listExceptionItems(input.branch_id).then((items) =>
      items.find((i) => i.id === id),
    );
  }
}
