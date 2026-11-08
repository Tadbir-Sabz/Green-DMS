import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Page } from '@dms/contracts';
import { isUUID } from 'class-validator';
import { RULE_ENTITIES, RULE_EVENTS, RULE_EFFECTS } from './rules-engine.dto';
import {
  resolveApprovalPolicy,
  validatePolicyInput,
  type ApprovalContext,
  type ApprovalPolicyScope,
} from './approval-policy';
import type {
  ApprovalRequestRow,
  CreateApprovalChainDto,
  CreateApprovalRequestDto,
  CreateRuleDto,
  EvalRule,
  RuleConditionRow,
  RuleRow,
  RulesEngineRepository,
} from './rules-engine.repository';

/**
 * زمینهٔ ارزیابی قاعده — مجموعه فیلدهای عددی/رشته‌ای/منطقی موجودیتی که قاعده روی
 * آن اجرا می‌شود (مثلاً sales_order: subtotal، discount_pct، customer_credit_used و…).
 */
export type RuleContext = Record<string, string | number | boolean | null | undefined>;

/** نتیجهٔ ارزیابی یک قاعدهٔ منطبق */
export interface RuleHit {
  rule_id: string;
  code: string;
  effect: string;
  message_fa: string;
  actions: { action_type: string; params: Record<string, unknown> }[];
}

/** نتیجهٔ کلی ارزیابی موتور قوانین برای یک موجودیت/رویداد */
export interface RuleEvaluation {
  hits: RuleHit[];
  blocked: RuleHit | null;
  requireApproval: RuleHit | null;
  warnings: RuleHit[];
  fieldUpdates: Record<string, unknown>;
}
import { RULES_ENGINE_REPOSITORY } from './rules-engine.tokens';

/** قاعده به شکل قرارداد (schemas.Rule) — daterange به valid_from/valid_to باز می‌شود */
export interface RuleView {
  id: string;
  code: string;
  title: string;
  entity: string;
  event: string;
  effect: string;
  priority: number;
  message_fa: string;
  conditions: unknown[];
  actions: unknown[];
  valid_from: string | null;
  valid_to: string | null;
  is_active: boolean;
}

/** درخواست تأیید به شکل قرارداد (schemas.ApprovalRequest) */
export interface ApprovalRequestView {
  id: string;
  approval_chain_id: string | null;
  entity_type: string;
  entity_id: string;
  amount: string | null;
  status: string;
  current_step: number;
  requested_by: string;
  created_at: string;
  closed_at: string | null;
  decisions: {
    step_no: number;
    decided_by: string | null;
    decision: string | null;
    decided_at: string | null;
    comment: string | null;
  }[];
}

/**
 * تجزیهٔ daterange متنی postgres («[2026-01-01,)» یا «[a,b]») به دو تاریخ.
 * کران باز/بی‌کران → null. برای نگاشت ستون valid به valid_from/valid_to قرارداد.
 */
const parseDateRange = (
  range: string | null,
): { valid_from: string | null; valid_to: string | null } => {
  if (!range) return { valid_from: null, valid_to: null };
  const m = range.replace(/^\(|\]$/, '').replace(/^\[|\)$/, '').split(',');
  const clean = (v: string | undefined): string | null => {
    const t = (v ?? '').trim();
    return t.length > 0 ? t : null;
  };
  return { valid_from: clean(m[0]), valid_to: clean(m[1]) };
};

const notFound = (msg: string): NotFoundException =>
  new NotFoundException({ code: 'not_found', message_fa: msg });

/**
 * مقایسهٔ سست برای eq/neq: عدد با عدد (حتی به‌صورت رشته)، رشته با رشته،
 * بول با بول. مبالغ ممکن است رشتهٔ اعشاری باشند، پس عددی‌سازی اولویت دارد.
 */
const looseEq = (a: unknown, b: unknown): boolean => {
  if (a == null || b == null) return a == null && b == null;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb) && String(a).trim() !== '' && String(b).trim() !== '') {
    return na === nb;
  }
  return String(a) === String(b);
};

/** مقایسهٔ ترتیبی: خروجی <۰ / ۰ / >۰. مقدار غیرعدد به‌صورت رشته‌ای مقایسه می‌شود. */
const cmp = (a: unknown, b: unknown): number => {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na < nb ? -1 : na > nb ? 1 : 0;
  const sa = String(a ?? '');
  const sb = String(b ?? '');
  return sa < sb ? -1 : sa > sb ? 1 : 0;
};

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

  // ---------------- ارزیابی واقعی موتور قوانین ----------------

  /**
   * ارزیابی قواعد فعالِ یک (entity, event) روی زمینهٔ داده‌شده.
   * شروط: OR بین group_noها و AND داخل هر گروه. قاعدهٔ بدون شرط = همیشه منطبق.
   * نتیجه شامل block/require_approval/warn و به‌روزرسانی فیلدها (set_field) است.
   */
  async evaluate(
    companyId: string,
    entity: string,
    event: string,
    context: RuleContext,
  ): Promise<RuleEvaluation> {
    const rules = await this.repo.listRulesForEvaluation(companyId, entity, event);
    const hits: RuleHit[] = [];
    for (const rule of rules) {
      if (!this.matchConditions(rule.conditions, context)) continue;
      hits.push({
        rule_id: rule.id,
        code: rule.code,
        effect: rule.effect,
        message_fa: rule.message_fa,
        actions: rule.actions.map((a) => ({
          action_type: a.action_type,
          params: (a.params ?? {}) as Record<string, unknown>,
        })),
      });
    }

    const fieldUpdates: Record<string, unknown> = {};
    for (const hit of hits) {
      for (const action of hit.actions) {
        if (action.action_type === 'set_discount' && action.params.discount_amount != null) {
          fieldUpdates.discount_amount = action.params.discount_amount;
        } else if (action.action_type === 'set_price' && action.params.unit_price != null) {
          fieldUpdates.unit_price = action.params.unit_price;
        } else if (hit.effect === 'set_field' && action.params.field && 'value' in action.params) {
          fieldUpdates[String(action.params.field)] = action.params.value;
        }
      }
    }

    return {
      hits,
      blocked: hits.find((h) => h.effect === 'block' || h.actions.some((a) => a.action_type === 'block_order')) ?? null,
      requireApproval:
        hits.find((h) => h.effect === 'require_approval' || h.actions.some((a) => a.action_type === 'require_approval')) ?? null,
      warnings: hits.filter((h) => h.effect === 'warn' || h.effect === 'notify'),
      fieldUpdates,
    };
  }

  /** OR بین گروه‌ها، AND داخل گروه؛ قاعدهٔ بدون شرط همیشه منطبق است */
  private matchConditions(conditions: RuleConditionRow[], context: RuleContext): boolean {
    if (conditions.length === 0) return true;
    const groups = new Map<number, RuleConditionRow[]>();
    for (const c of conditions) {
      const arr = groups.get(c.group_no) ?? [];
      arr.push(c);
      groups.set(c.group_no, arr);
    }
    for (const group of groups.values()) {
      if (group.every((c) => this.evalCondition(c, context))) return true;
    }
    return false;
  }

  /** ارزیابی یک شرط روی زمینه؛ فیلدِ مفقود → نامعتبر (مگر is_null) */
  private evalCondition(cond: RuleConditionRow, context: RuleContext): boolean {
    const actual = context[cond.field];
    const expected = cond.value as unknown;
    switch (cond.operator) {
      case 'is_null':
        return actual == null;
      case 'eq':
        return looseEq(actual, expected);
      case 'neq':
        return !looseEq(actual, expected);
      case 'gt':
        return cmp(actual, expected) > 0;
      case 'gte':
        return cmp(actual, expected) >= 0;
      case 'lt':
        return cmp(actual, expected) < 0;
      case 'lte':
        return cmp(actual, expected) <= 0;
      case 'in':
        return Array.isArray(expected) && expected.some((v) => looseEq(actual, v));
      case 'not_in':
        return Array.isArray(expected) && !expected.some((v) => looseEq(actual, v));
      case 'between': {
        if (!Array.isArray(expected) || expected.length !== 2) return false;
        const c = cmp(actual, expected[0]);
        const c2 = cmp(actual, expected[1]);
        return c >= 0 && c2 <= 0;
      }
      case 'contains':
        return typeof actual === 'string' && actual.includes(String(expected));
      default:
        return false;
    }
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
    let id: string;
    try {
      id = await this.repo.createRule(
        companyId,
        dto,
        dto.conditions ?? [],
        dto.actions ?? [],
        dto.scopes ?? [],
      );
    } catch (err) {
      // TASK-24 (G-03): کدِ تکراری قاعده نباید 500 شود — خطای دامنه‌ایِ صریح
      const e = err as { code?: string; constraint?: string };
      if (e.code === '23505') {
        throw new ConflictException({
          code: 'duplicate_code',
          message_fa: 'کدِ قاعده برای این شرکت قبلاً ثبت شده است.',
        });
      }
      if (e.code === '23503') {
        throw badRequest('reference_invalid', 'یکی از ارجاع‌های قاعده معتبر نیست.');
      }
      throw err;
    }
    return this.getRule(companyId, id);
  }

  async setRuleActive(companyId: string, ruleId: string, isActive: boolean) {
    const rule = await this.repo.getRule(companyId, ruleId);
    if (!rule) throw notFound('قاعده یافت نشد');
    const ok = await this.repo.setRuleActive(companyId, ruleId, isActive);
    if (!ok) throw badRequest('update_failed', 'تغییر وضعیت قاعده ناموفق بود.');
    return this.repo.getRule(companyId, ruleId);
  }

  // ---------------- شکل قرارداد (schemas.Rule / Page) ----------------

  /** نگاشت RuleRow + شرایط/اقدامات به schemas.Rule (بازه تاریخ باز می‌شود) */
  private async shapeRule(rule: RuleRow): Promise<RuleView> {
    const [conditions, actions] = await Promise.all([
      this.repo.getRuleConditions(rule.id),
      this.repo.getRuleActions(rule.id),
    ]);
    const { valid_from, valid_to } = parseDateRange(rule.valid);
    return {
      id: rule.id,
      code: rule.code,
      title: rule.title,
      entity: rule.entity,
      event: rule.event,
      effect: rule.effect,
      priority: rule.priority,
      message_fa: rule.message_fa,
      conditions: conditions.map((c) => ({
        group_no: c.group_no,
        field: c.field,
        operator: c.operator,
        value: c.value,
      })),
      actions: actions.map((a) => ({ action_type: a.action_type, params: a.params })),
      valid_from,
      valid_to,
      is_active: rule.is_active,
    };
  }

  /** GET /rules — صفحهٔ قرارداد با فیلتر entity/event/is_active */
  async listRulesPaged(
    companyId: string,
    query: { cursor?: string; limit?: number; entity?: string; event?: string; is_active?: boolean },
  ): Promise<Page<RuleView>> {
    const all = await this.repo.listRules(companyId);
    const filtered = all.filter((r) => {
      if (query.entity && r.entity !== query.entity) return false;
      if (query.event && r.event !== query.event) return false;
      if (query.is_active !== undefined && r.is_active !== query.is_active) return false;
      return true;
    });
    const limit = query.limit ?? 50;
    // cursor روی code (مرتب‌سازی پایدار priority,created_at از قبل در repo است)
    let start = 0;
    if (query.cursor) {
      const decoded = Buffer.from(query.cursor, 'base64url').toString('utf8');
      const idx = filtered.findIndex((r) => r.id === decoded);
      if (idx >= 0) start = idx + 1;
    }
    const slice = filtered.slice(start, start + limit + 1);
    const hasMore = slice.length > limit;
    const page = hasMore ? slice.slice(0, limit) : slice;
    const items = await Promise.all(page.map((r) => this.shapeRule(r)));
    const last = page[page.length - 1];
    return {
      items,
      has_more: hasMore,
      next_cursor: hasMore && last ? Buffer.from(last.id, 'utf8').toString('base64url') : null,
    };
  }

  /** GET /rules/{id} */
  async getRuleView(companyId: string, ruleId: string): Promise<RuleView> {
    if (!isUUID(ruleId, '4')) throw badRequest('invalid_id', 'شناسه قاعده معتبر نیست.');
    const rule = await this.repo.getRule(companyId, ruleId);
    if (!rule) throw notFound('قاعده یافت نشد');
    return this.shapeRule(rule);
  }

  /** POST /rules — ساخت و بازگرداندن به شکل قرارداد */
  async createRuleView(companyId: string, dto: CreateRuleDto): Promise<RuleView> {
    const created = (await this.createRule(companyId, dto)) as RuleRow;
    return this.shapeRule(created);
  }

  /** PATCH /rules/{id} — به‌روزرسانی عمومی و بازگرداندن شکل قرارداد */
  async updateRuleView(
    companyId: string,
    ruleId: string,
    dto: Partial<CreateRuleDto>,
  ): Promise<RuleView> {
    if (!isUUID(ruleId, '4')) throw badRequest('invalid_id', 'شناسه قاعده معتبر نیست.');
    const existing = await this.repo.getRule(companyId, ruleId);
    if (!existing) throw notFound('قاعده یافت نشد');
    if (dto.entity !== undefined && !RULE_ENTITIES.includes(dto.entity as never)) {
      throw badRequest('invalid_entity', 'نوع موجودی قاعده معتبر نیست.');
    }
    if (dto.event !== undefined && !RULE_EVENTS.includes(dto.event as never)) {
      throw badRequest('invalid_event', 'رویداد قاعده معتبر نیست.');
    }
    if (dto.effect !== undefined && !RULE_EFFECTS.includes(dto.effect as never)) {
      throw badRequest('invalid_effect', 'اقدام قاعده معتبر نیست.');
    }
    await this.repo.updateRule(companyId, ruleId, dto);
    return this.getRuleView(companyId, ruleId);
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

  /** GET /approvals — صفحهٔ قرارداد (amount به رشته، decisions ضمیمه) */
  async listApprovalsPaged(
    companyId: string,
    query: { cursor?: string; limit?: number; entity_type?: string },
  ): Promise<Page<ApprovalRequestView>> {
    const all = await this.repo.listApprovalRequests(companyId);
    const filtered = query.entity_type
      ? all.filter((r) => r.entity_type === query.entity_type)
      : all;
    const limit = query.limit ?? 50;
    let start = 0;
    if (query.cursor) {
      const decoded = Buffer.from(query.cursor, 'base64url').toString('utf8');
      const idx = filtered.findIndex((r) => r.id === decoded);
      if (idx >= 0) start = idx + 1;
    }
    const slice = filtered.slice(start, start + limit + 1);
    const hasMore = slice.length > limit;
    const page = hasMore ? slice.slice(0, limit) : slice;
    const items = await Promise.all(page.map((r) => this.shapeApproval(r)));
    const last = page[page.length - 1];
    return {
      items,
      has_more: hasMore,
      next_cursor: hasMore && last ? Buffer.from(last.id, 'utf8').toString('base64url') : null,
    };
  }

  /** نگاشت ApprovalRequestRow به schemas.ApprovalRequest (amount رشته + decisions) */
  private async shapeApproval(row: ApprovalRequestRow): Promise<ApprovalRequestView> {
    const decisions = await this.repo.listApprovalDecisions(row.id);
    return {
      id: row.id,
      approval_chain_id: row.approval_chain_id,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      amount: row.amount == null ? null : String(row.amount),
      status: row.status,
      current_step: row.current_step,
      requested_by: row.requested_by,
      created_at: row.created_at,
      closed_at: row.closed_at,
      decisions: decisions.map((d) => ({
        step_no: d.step_no,
        decided_by: d.decided_by,
        decision: d.decision,
        decided_at: d.decided_at,
        comment: d.comment,
      })),
    };
  }

  /**
   * POST /approvals/{id}/decision — قرارداد decision را approve/reject می‌گیرد؛
   * به approved/rejected سرویس نگاشت می‌شود و step_no از وضعیت فعلی درخواست می‌آید.
   */
  async decideApprovalContract(
    companyId: string,
    requestId: string,
    userId: string,
    input: { decision: 'approve' | 'reject'; note?: string | null },
  ): Promise<ApprovalRequestView> {
    if (!isUUID(requestId, '4')) throw badRequest('invalid_id', 'شناسه درخواست معتبر نیست.');
    const req = await this.repo.getApprovalRequest(companyId, requestId);
    if (!req) throw notFound('درخواست تأیید یافت نشد');
    if (req.status !== 'pending') {
      throw new ConflictException({
        code: 'not_pending',
        message_fa: 'این درخواست قبلاً بسته شده است.',
      });
    }
    const decision = input.decision === 'approve' ? 'approved' : 'rejected';
    await this.decideApproval(
      companyId,
      requestId,
      userId,
      req.current_step,
      decision,
      input.note ?? null,
    );
    const updated = await this.repo.getApprovalRequest(companyId, requestId);
    if (!updated) throw notFound('درخواست تأیید یافت نشد');
    return this.shapeApproval(updated);
  }

  async createApprovalRequest(companyId: string, dto: CreateApprovalRequestDto, actorUserId?: string) {
    // بررسی وجود زنجیره تأیید
    const chain = await this.repo.getApprovalChain(companyId, dto.approval_chain_id);
    if (!chain) throw notFound('زنجیره تأیید یافت نشد');

    // TASK-24F · G-03: زنجیرهٔ بدونِ مرحله نباید درخواستِ «قابلِ تأییدِ خودکار» بسازد.
    const steps = await this.repo.getApprovalChainSteps(dto.approval_chain_id);
    if (steps.length === 0) {
      throw new ConflictException({
        code: 'approval_chain_empty',
        message_fa: 'زنجیرهٔ تأیید هیچ مرحله‌ای ندارد؛ امکانِ ثبتِ درخواست وجود ندارد.',
        details: { approval_chain_id: dto.approval_chain_id },
      });
    }

    // G-03: درخواست‌دهنده از نشست گرفته می‌شود، نه از بدنه (جلوگیری از جعلِ «شخصِ اول»).
    const requestedBy = actorUserId ?? dto.requested_by;
    const id = await this.repo.createApprovalRequest({ ...dto, requested_by: requestedBy });
    const req = await this.repo.getApprovalRequest(companyId, id);
    if (!req) throw badRequest('create_failed', 'ایجاد درخواست تأیید ناموفق بود.');

    // تعیین مرحله فعلی بر اساس مبلغ
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
    // G-03: مرحلهٔ تصمیم از وضعیتِ خودِ درخواست گرفته می‌شود، نه از بدنهٔ درخواست.
    stepNo = Number(req.current_step);

    // TASK-24F · G-03 — کنترل‌های پیش از ثبتِ تصمیم:
    //   ۱) زنجیرهٔ بدونِ مرحله ⇒ fail-closed (پیش‌تر Math.max([]) = -Infinity ⇒ تأییدِ فوری)
    //   ۲) مرحله باید همان مرحلهٔ جاری/باندِ مبلغ باشد (بازاعتبارسنجی در زمانِ تصمیم)
    //   ۳) خودتأییدی ممنوع
    //   ۴) تصمیم‌گیرنده باید با نقش/کارمندِ همان مرحله مجاز باشد
    const steps = await this.repo.getApprovalChainSteps(req.approval_chain_id);
    if (steps.length === 0) {
      throw new ConflictException({
        code: 'approval_chain_empty',
        message_fa: 'زنجیرهٔ تأیید هیچ مرحله‌ای ندارد؛ تأیید ممکن نیست (fail-closed).',
      });
    }
    const step = steps.find((s) => s.step_no === stepNo);
    if (!step) {
      throw new ConflictException({
        code: 'invalid_step',
        message_fa: 'مرحلهٔ اعلام‌شده در این زنجیره وجود ندارد.',
        details: { step_no: stepNo },
      });
    }
    // TASK-24V · G-23: بازمحاسبهٔ گام از باند در لحظهٔ تصمیم نادرست بود.
    // `findCurrentStep` «نخستین گامِ سازگار با مبلغ» را برمی‌گرداند؛ پس در هر زنجیرهٔ ≥۲ مرحله‌ای که
    // گامِ ۱ بی‌باند است (یا مبلغ در باندِ گامِ ۱ می‌افتد) خروجی همیشه ۱ است و تصمیمِ گامِ ۲ با
    // `amount_band_mismatch` برای همیشه قفل می‌شد (CI run 42450239559).
    // کنترلِ درست: باند فقط «گامِ ورود» را در لحظهٔ ثبتِ درخواست تعیین می‌کند؛ در زمانِ تصمیم فقط
    // یک بار — پیش از نخستین تصمیم — بررسی می‌کنیم که گامِ جاری هنوز همان گامِ متناظر با مبلغ است
    // (ضدِ دستکاریِ مبلغ پس از ثبت). پیشرویِ گام‌ها با `stepNo = req.current_step` (بالا) و
    // به‌روزرسانیِ شرطی (`expected: {status:'pending', currentStep: stepNo}`) تضمین می‌شود.
    const amount = req.amount == null ? null : Number(req.amount);
    if (amount != null) {
      const previousDecisions = await this.repo.listApprovalDecisions(requestId);
      if (previousDecisions.length === 0) {
        const entryStep = findCurrentStep(steps, amount);
        if (entryStep !== stepNo) {
          throw new ConflictException({
            code: 'amount_band_mismatch',
            message_fa: 'مبلغِ درخواست با باندِ گامِ جاری نمی‌خواند؛ درخواست را دوباره ثبت کنید.',
            details: { step_no: stepNo, expected_step: entryStep, amount },
          });
        }
      }
    }
    if (req.requested_by === decidedBy) {
      throw new ForbiddenException({
        code: 'self_approval_forbidden',
        message_fa: 'تأییدِ درخواستِ خود (self-approval) مجاز نیست؛ تأییدکننده باید شخصِ دیگری باشد.',
      });
    }
    const canApprove = await this.repo.userCanApproveStep(companyId, decidedBy, step);
    if (!canApprove) {
      throw new ForbiddenException({
        code: 'approver_not_authorized',
        message_fa: 'شما برای این مرحلهٔ تأیید مجاز نیستید (نقش/کارمندِ مرحله).',
        details: { step_no: stepNo },
      });
    }

    try {
      await this.repo.createApprovalDecision(requestId, stepNo, decidedBy, decision, comment);
    } catch (err) {
      // G-03: ایندکسِ یکتای (approval_request_id, step_no) — مهاجرت 0051
      if ((err as { code?: string }).code === '23505') {
        throw new ConflictException({
          code: 'duplicate_decision',
          message_fa: 'برای این مرحله قبلاً تصمیم ثبت شده است.',
          details: { step_no: stepNo },
        });
      }
      throw err;
    }

    const expected = { status: 'pending', currentStep: stepNo };
    if (decision === 'rejected') {
      const ok = await this.repo.updateApprovalRequestStatus(
        requestId,
        'rejected',
        stepNo,
        new Date().toISOString(),
        expected,
      );
      if (!ok) throw this.concurrentDecision();
      return this.repo.getApprovalRequest(companyId, requestId);
    }

    if (decision === 'returned') {
      const ok = await this.repo.updateApprovalRequestStatus(
        requestId,
        'cancelled',
        stepNo,
        new Date().toISOString(),
        expected,
      );
      if (!ok) throw this.concurrentDecision();
      return this.repo.getApprovalRequest(companyId, requestId);
    }

    // approved → پیش رفتن به مرحله بعدی یا بسته شدن (انتقالِ اتمیک)
    const maxStep = steps.reduce((max, s) => Math.max(max, s.step_no), 0);
    const done = stepNo >= maxStep;
    const ok = await this.repo.updateApprovalRequestStatus(
      requestId,
      done ? 'approved' : 'pending',
      done ? stepNo : stepNo + 1,
      done ? new Date().toISOString() : null,
      expected,
    );
    if (!ok) throw this.concurrentDecision();
    return this.repo.getApprovalRequest(companyId, requestId);
  }

  private concurrentDecision(): ConflictException {
    return new ConflictException({
      code: 'decision_conflict',
      message_fa: 'درخواست هم‌زمان توسط کاربرِ دیگری تغییر کرده است؛ وضعیت را دوباره بارگیری کنید.',
    });
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
  // ===================================================================
  // TASK-24Y — سیاستِ تأیید، اتصال به عملیات، تفکیل، انقضا
  // ===================================================================

  /**
   * حلِ سیاست برای یک عملیات و ساختِ درخواستِ تأیید با مهلت.
   *
   * **fail-closed**: اگر هیچ سیاستی منطبق نباشد `409 approval_policy_missing`
   * می‌دهیم — نه یک گردشِ بی‌مسیر و نه تأییدِ خودکار.
   */
  async startApproval(
    companyId: string,
    input: {
      operation: string;
      entityType: string;
      entityId: string;
      requestedBy: string;
      amount: number | null;
      riskScore?: number | null;
      domainId?: string | null;
      /** اثرانگشتِ وضعیتِ موجودیت — در لحظهٔ اجرا بازاعتبارسنجی می‌شود */
      fingerprint?: string | null;
    },
  ): Promise<{ approvalRequestId: string; chainId: string; currentStep: number; expiresAt: string | null }> {
    const policies = await this.repo.listPoliciesForOperation(companyId, input.operation);
    const ctx: ApprovalContext = {
      operation: input.operation,
      amount: input.amount,
      riskScore: input.riskScore ?? null,
      domainId: input.domainId ?? null,
    };
    const resolved = resolveApprovalPolicy(policies, ctx);
    if (!resolved) {
      throw new ConflictException({
        code: 'approval_policy_missing',
        message_fa:
          'هیچ سیاستِ تأییدِ معتبری برای این عملیات تعریف نشده است؛ عملیات بدونِ گردشِ تأیید اجرا نمی‌شود (fail-closed).',
        details: { operation: input.operation, company_id: companyId },
      });
    }

    const steps = await this.repo.getApprovalChainSteps(resolved.chainId);
    if (steps.length === 0) {
      throw new ConflictException({
        code: 'approval_chain_empty',
        message_fa: 'زنجیرهٔ تأییدِ این سیاست هیچ مرحله‌ای ندارد؛ پیکربندیِ ناقص است (fail-closed).',
        details: { approval_chain_id: resolved.chainId, policy_id: resolved.decidingPolicyId },
      });
    }

    const currentStep = findCurrentStep(steps, input.amount);
    const expiresAt =
      resolved.expiresInHours == null
        ? null
        : new Date(Date.now() + resolved.expiresInHours * 3_600_000).toISOString();

    const approvalRequestId = await this.repo.createApprovalRequestWithMeta({
      approval_chain_id: resolved.chainId,
      entity_type: input.entityType,
      entity_id: input.entityId,
      requested_by: input.requestedBy,
      amount: input.amount,
      current_step: currentStep,
      expires_at: expiresAt,
      entity_domain_id: input.domainId ?? null,
      risk_score: input.riskScore ?? null,
      policy_id: resolved.decidingPolicyId,
    });

    await this.repo.createBinding({
      company_id: companyId,
      approval_request_id: approvalRequestId,
      operation: input.operation,
      entity_type: input.entityType,
      entity_id: input.entityId,
      entity_fingerprint: input.fingerprint ?? null,
    });

    // اعلانِ «به شما ارجاع شد» در همان مسیرِ نوشتن
    const firstApprover = await this.resolveStepApprovers(resolved.chainId, currentStep);
    for (const userId of firstApprover) {
      await this.repo.enqueueNotification({
        company_id: companyId,
        approval_request_id: approvalRequestId,
        kind: 'assigned',
        recipient_user_id: userId,
        payload: { operation: input.operation, entity_type: input.entityType },
      });
    }

    return { approvalRequestId, chainId: resolved.chainId, currentStep, expiresAt };
  }

  /** کاربرانِ مجازِ یک مرحله (برای اعلان) — خطا نمی‌دهد. */
  private async resolveStepApprovers(chainId: string, stepNo: number): Promise<string[]> {
    const steps = await this.repo.getApprovalChainSteps(chainId);
    const step = steps.find((s) => s.step_no === stepNo);
    if (!step) return [];
    if (step.approver_staff_id) {
      const rows = await this.repo.userIdsForStaff(step.approver_staff_id);
      return rows;
    }
    if (step.approver_role_id) {
      return this.repo.userIdsForRole(step.approver_role_id);
    }
    return [];
  }

  /**
   * دروازهٔ عملیاتِ محافظت‌شده.
   *
   * عملیاتِ حساس **نباید** مستقیماً وضعیت را عوض کند؛ باید ابتدا این را صدا بزند:
   *   • اگر برای این موجودیت تأییدِ معتبر و مصرف‌نشده وجود دارد ⇒ مصرف و اجازه
   *   • وگرنه ⇒ `409 approval_required`
   *
   * مصرف اتمیک است (‏`consumed_at`)، پس یک تأیید دو عملیات را باز نمی‌کند.
   */
  async requireApproved(
    companyId: string,
    input: { operation: string; entityType: string; entityId: string },
  ): Promise<{ approvalRequestId: string }> {
    const binding = await this.repo.findConsumedBinding(
      companyId, input.operation, input.entityType, input.entityId,
    );
    if (!binding) {
      throw new ConflictException({
        code: 'approval_required',
        message_fa:
          'این عملیات نیازمندِ تأیید است و هیچ گردشِ تأییدی برای آن ثبت نشده؛ ابتدا درخواستِ تأیید ثبت کنید.',
        details: { operation: input.operation, entity_type: input.entityType },
      });
    }
    const ok = await this.repo.consumeBinding(companyId, binding.id);
    if (!ok) {
      throw new ConflictException({
        code: 'approval_not_granted',
        message_fa: 'گردشِ تأییدِ این عملیات هنوز تأیید نشده یا قبلاً مصرف شده است.',
        details: { approval_request_id: binding.approval_request_id, operation: input.operation },
      });
    }
    return { approvalRequestId: binding.approval_request_id };
  }

  /**
   * اعتبارسنجی و ثبتِ سیاست.
   * سیاستِ مرکزی اجباری است و نمی‌تواند غیرفعال شود؛ قلمرو فقط برای scope=domain.
   */
  async createPolicy(
    companyId: string,
    dto: {
      operation: string;
      scope: ApprovalPolicyScope;
      domain_id?: string | null;
      min_amount?: number | null;
      max_amount?: number | null;
      min_risk_score?: number | null;
      approval_chain_id: string;
      expires_in_hours?: number | null;
      on_expiry?: 'escalate' | 'auto_reject';
      priority?: number;
    },
  ): Promise<{ id: string }> {
    const invalid = validatePolicyInput({
      operation: dto.operation,
      scope: dto.scope,
      domainId: dto.domain_id ?? null,
      minAmount: dto.min_amount ?? null,
      maxAmount: dto.max_amount ?? null,
      minRiskScore: dto.min_risk_score ?? null,
      expiresInHours: dto.expires_in_hours ?? null,
    });
    if (invalid) {
      throw new BadRequestException({
        code: invalid,
        message_fa: 'پیکربندیِ سیاستِ تأیید معتبر نیست.',
      });
    }
    const chain = await this.repo.getApprovalChain(companyId, dto.approval_chain_id);
    if (!chain) throw new NotFoundException({ code: 'chain_not_found', message_fa: 'زنجیرهٔ تأیید یافت نشد.' });

    try {
      const id = await this.repo.createPolicy({
        company_id: companyId,
        operation: dto.operation,
        scope: dto.scope,
        domain_id: dto.domain_id ?? null,
        min_amount: dto.min_amount ?? null,
        max_amount: dto.max_amount ?? null,
        min_risk_score: dto.min_risk_score ?? null,
        approval_chain_id: dto.approval_chain_id,
        expires_in_hours: dto.expires_in_hours ?? null,
        on_expiry: dto.on_expiry ?? 'escalate',
        priority: dto.priority ?? 100,
      });
      return { id };
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new ConflictException({
          code: 'policy_conflict',
          message_fa: 'برای این عملیات/دامنه سیاستِ فعالی وجود دارد؛ ابتدا آن را غیرفعال کنید.',
        });
      }
      throw err;
    }
  }

  async listPolicies(companyId: string, operation?: string | null) {
    return this.repo.listPolicies(companyId, operation ?? null);
  }

  /**
   * سیاست‌های فعالِ یک عملیات — برای عملیاتی که می‌خواهد بداند
   * «آیا من اصلاً حاکمیتِ تأیید دارم یا نه؟» پیش از صدا زدنِ دروازه.
   */
  async listPoliciesForOperation(companyId: string, operation: string) {
    return this.repo.listPoliciesForOperation(companyId, operation);
  }

  async setPolicyActive(companyId: string, id: string, active: boolean) {
    const ok = await this.repo.setPolicyActive(companyId, id, active);
    if (!ok) {
      throw new ConflictException({
        code: 'policy_not_deactivatable',
        message_fa: 'سیاست یافت نشد یا سیاستِ مرکزی است (سیاستِ مرکزی قابلِ غیرفعال‌سازی نیست).',
      });
    }
    return { id, is_active: active };
  }

  // ---------------- تفکیل ----------------

  async createDelegation(
    companyId: string,
    actorUserId: string,
    dto: { delegate_id: string; operation?: string | null; domain_id?: string | null; valid_from?: string | null; valid_to: string; reason: string },
  ) {
    if (dto.delegate_id === actorUserId) {
      throw new BadRequestException({
        code: 'delegation_to_self',
        message_fa: 'واگذاریِ تأیید به خودتان مجاز نیست.',
      });
    }
    const to = new Date(dto.valid_to);
    if (Number.isNaN(to.getTime())) {
      throw new BadRequestException({ code: 'invalid_valid_to', message_fa: 'تاریخِ پایانِ واگذاری معتبر نیست.' });
    }
    if (to.getTime() <= Date.now()) {
      throw new BadRequestException({
        code: 'delegation_in_the_past',
        message_fa: 'پایانِ واگذاری باید در آینده باشد.',
      });
    }
    const id = await this.repo.createDelegation({
      company_id: companyId,
      delegator_id: actorUserId,
      delegate_id: dto.delegate_id,
      operation: dto.operation ?? null,
      domain_id: dto.domain_id ?? null,
      valid_from: dto.valid_from ?? null,
      valid_to: dto.valid_to,
      reason: dto.reason,
      created_by: actorUserId,
    });
    return { id };
  }

  async listDelegations(companyId: string, userId: string) {
    return this.repo.listDelegations(companyId, userId);
  }

  async revokeDelegation(companyId: string, id: string) {
    const ok = await this.repo.revokeDelegation(companyId, id);
    if (!ok) throw new NotFoundException({ code: 'delegation_not_found', message_fa: 'واگذاری یافت نشد یا قبلاً لغو شده.' });
    return { id, is_active: false };
  }

  async listNotifications(companyId: string, userId: string, status?: string | null) {
    return this.repo.listNotifications(companyId, userId, status ?? null);
  }

  /**
   * انقضا/ارتقای درخواست‌های گذشته از مهلت.
   * برای هر درخواست: اگر سیاست `escalate` بود، درخواستِ ارتقایافته ساخته می‌شود؛
   * وگرنه `expired` بسته می‌شود. هر دو حالت اعلان می‌گیرند.
   */
  async processExpired(companyId: string, limit = 100): Promise<{ expired: number; escalated: number }> {
    const rows = await this.repo.findExpiredRequests(companyId, limit);
    let expired = 0;
    let escalated = 0;
    for (const r of rows as { id: string; approval_chain_id: string; entity_type: string; entity_id: string; current_step: number; policy_id: string | null }[]) {
      const policy = r.policy_id ? await this.repo.getPolicy(companyId, r.policy_id) : null;
      const onExpiry = policy?.on_expiry ?? 'auto_reject';
      const closed = await this.repo.expireRequest(r.id, 'expired');
      if (!closed) continue;
      if (onExpiry === 'escalate') {
        await this.repo.markEscalated(r.id);
        escalated += 1;
      } else {
        expired += 1;
      }
      await this.repo.enqueueNotification({
        company_id: companyId,
        approval_request_id: r.id,
        kind: onExpiry === 'escalate' ? 'escalated' : 'expired',
        recipient_user_id: null,
        payload: { entity_type: r.entity_type, entity_id: r.entity_id },
      });
    }
    return { expired, escalated };
  }
  // ---------------- کارتابل (TASK-24Y) ----------------

  /**
   * کارتابلِ من: درخواست‌های `pending` که مرحلهٔ جاری‌شان با نقش/کارمندِ من
   * منطبق است، به‌علاوهٔ درخواست‌هایی که از طرفِ من به کسی واگذار شده (تفکیل).
   *
   * این متد **نقشِ واقعی** را از DB می‌خواند، نه از بدنهٔ درخواست.
   */
  async myInbox(companyId: string, userId: string) {
    return this.repo.listInbox(companyId, userId);
  }

  /** درخواست‌هایی که خودم ثبت کرده‌ام. */
  async mySubmitted(companyId: string, userId: string) {
    return this.repo.listSubmitted(companyId, userId);
  }

  /** درخواست‌های منقضی/ارتقایافته. */
  async expiredRequests(companyId: string) {
    return this.repo.listExpired(companyId);
  }
}
