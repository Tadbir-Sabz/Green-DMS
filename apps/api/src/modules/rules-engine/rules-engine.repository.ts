import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import {
  CreateApprovalChainDto,
  CreateApprovalRequestDto,
  CreateRuleDto,
  RuleConditionDto,
  RuleActionDto,
  RuleScopeDto,
  ApprovalStepDefDto,
} from './rules-engine.dto';
import type { ApprovalPolicyRow } from './approval-policy';

export type {
  CreateApprovalChainDto,
  CreateApprovalRequestDto,
  CreateRuleDto,
};

export interface RuleRow extends QueryResultRow {
  id: string;
  company_id: string;
  code: string;
  title: string;
  entity: string;
  event: string;
  effect: string;
  priority: number;
  message_fa: string;
  valid: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RuleConditionRow extends QueryResultRow {
  id: string;
  rule_id: string;
  group_no: number;
  field: string;
  operator: string;
  value: unknown;
}

export interface RuleActionRow extends QueryResultRow {
  id: string;
  rule_id: string;
  action_type: string;
  params: unknown;
}

export interface RuleScopeRow extends QueryResultRow {
  rule_id: string;
  scope_type: string;
  scope_id: string;
}

/** قاعدهٔ آمادهٔ ارزیابی — RuleRow به‌همراه شرایط و اقداماتش */
export interface EvalRule extends RuleRow {
  conditions: RuleConditionRow[];
  actions: RuleActionRow[];
}

export interface ApprovalChainRow extends QueryResultRow {
  id: string;
  company_id: string;
  code: string;
  entity: string;
  is_active: boolean;
}

export interface ApprovalStepDefRow extends QueryResultRow {
  id: string;
  approval_chain_id: string;
  step_no: number;
  approver_role_id: string | null;
  approver_staff_id: string | null;
  min_amount: number | null;
  max_amount: number | null;
  is_mandatory: boolean;
}

export interface ApprovalRequestRow extends QueryResultRow {
  id: string;
  approval_chain_id: string;
  entity_type: string;
  entity_id: string;
  requested_by: string;
  amount: number | null;
  status: string;
  current_step: number;
  created_at: string;
  closed_at: string | null;
}

export interface ApprovalDecisionRow extends QueryResultRow {
  id: string;
  approval_request_id: string;
  step_no: number;
  decided_by: string;
  decision: string;
  comment: string | null;
  decided_at: string;
}

export interface ExceptionItemRow extends QueryResultRow {
  id: string;
  branch_id: string;
  kind: string;
  severity: string;
  entity_type: string | null;
  entity_id: string | null;
  status: string;
  created_at: string;
}

/** شناسهٔ UUID — پیش‌اعتبارسنجیِ پارامترهای مسیر پیش از رفتن به Postgres */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class RulesEngineRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  // ---------------- قوانین ----------------

  async listRules(companyId: string): Promise<RuleRow[]> {
    const { rows } = await this.pool.query<RuleRow>(
      `select id, company_id, code, title, entity, event, effect, priority,
              message_fa, valid, is_active, created_at, updated_at
         from rule
        where company_id = $1
        order by priority, created_at`,
      [companyId],
    );
    return rows;
  }

  async getRule(companyId: string, ruleId: string): Promise<RuleRow | null> {
    if (!UUID_RE.test(ruleId)) return null;
    const { rows } = await this.pool.query<RuleRow>(
      `select id, company_id, code, title, entity, event, effect, priority,
              message_fa, valid, is_active, created_at, updated_at
         from rule
        where id = $1 and company_id = $2`,
      [ruleId, companyId],
    );
    return rows[0] ?? null;
  }

  async getRuleConditions(ruleId: string): Promise<RuleConditionRow[]> {
    const { rows } = await this.pool.query<RuleConditionRow>(
      `select id, rule_id, group_no, field, operator, value
         from rule_condition
        where rule_id = $1
        order by group_no, id`,
      [ruleId],
    );
    return rows;
  }

  async getRuleActions(ruleId: string): Promise<RuleActionRow[]> {
    const { rows } = await this.pool.query<RuleActionRow>(
      `select id, rule_id, action_type, params
         from rule_action
        where rule_id = $1
        order by id`,
      [ruleId],
    );
    return rows;
  }

  async getRuleScopes(ruleId: string): Promise<RuleScopeRow[]> {
    const { rows } = await this.pool.query<RuleScopeRow>(
      `select rule_id, scope_type, scope_id
         from rule_scope
        where rule_id = $1`,
      [ruleId],
    );
    return rows;
  }

  /**
   * بارگیری دسته‌ای قوانینِ فعال و در بازهٔ اعتبار برای یک (entity, event) به‌همراه
   * شرایط و اقداماتشان — برای ارزیابی واقعی موتور قوانین بدون N+1.
   * `valid @> current_date` قوانین منقضی‌شده را حذف می‌کند.
   */
  async listRulesForEvaluation(
    companyId: string,
    entity: string,
    event: string,
  ): Promise<EvalRule[]> {
    const { rows: ruleRows } = await this.pool.query<RuleRow>(
      `select id, company_id, code, title, entity, event, effect, priority,
              message_fa, valid, is_active, created_at, updated_at
         from rule
        where company_id = $1 and entity = $2 and event = $3
          and is_active and valid @> current_date
        order by priority, created_at`,
      [companyId, entity, event],
    );
    if (ruleRows.length === 0) return [];
    const ids = ruleRows.map((r) => r.id);
    const [condRes, actRes] = await Promise.all([
      this.pool.query<RuleConditionRow>(
        `select id, rule_id, group_no, field, operator, value
           from rule_condition where rule_id = any($1::uuid[]) order by rule_id, group_no, id`,
        [ids],
      ),
      this.pool.query<RuleActionRow>(
        `select id, rule_id, action_type, params
           from rule_action where rule_id = any($1::uuid[]) order by rule_id, id`,
        [ids],
      ),
    ]);
    const condByRule = new Map<string, RuleConditionRow[]>();
    for (const c of condRes.rows) {
      const arr = condByRule.get(c.rule_id) ?? [];
      arr.push(c);
      condByRule.set(c.rule_id, arr);
    }
    const actByRule = new Map<string, RuleActionRow[]>();
    for (const a of actRes.rows) {
      const arr = actByRule.get(a.rule_id) ?? [];
      arr.push(a);
      actByRule.set(a.rule_id, arr);
    }
    return ruleRows.map((r) => ({
      ...r,
      conditions: condByRule.get(r.id) ?? [],
      actions: actByRule.get(r.id) ?? [],
    }));
  }

  async createRule(
    companyId: string,
    dto: CreateRuleDto,
    conditions: RuleConditionDto[],
    actions: RuleActionDto[],
    scopes: RuleScopeDto[],
  ): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');

      const { rows } = await client.query<{ id: string }>(
        `insert into rule
            (company_id, code, title, entity, event, effect, priority, message_fa,
             valid, is_active)
         values ($1, $2, $3, $4, $5, $6, $7, $8,
                 daterange(coalesce($9::date, date '2026-01-01'), $10::date, '[]'), $11)
         returning id`,
        [
          companyId,
          dto.code,
          dto.title,
          dto.entity,
          dto.event,
          dto.effect,
          dto.priority ?? 100,
          dto.message_fa,
          dto.valid_from ?? null,
          dto.valid_to ?? null,
          dto.is_active ?? true,
        ],
      );
      const ruleId = rows[0].id;

      for (const cond of conditions ?? []) {
        await client.query(
          `insert into rule_condition
              (rule_id, group_no, field, operator, value)
           values ($1, $2, $3, $4, $5)`,
          [ruleId, cond.group_no ?? 1, cond.field, cond.operator, JSON.stringify(cond.value)],
        );
      }

      for (const act of actions ?? []) {
        await client.query(
          `insert into rule_action
              (rule_id, action_type, params)
           values ($1, $2, $3)`,
          [ruleId, act.action_type, JSON.stringify(act.params ?? {})],
        );
      }

      for (const scp of scopes ?? []) {
        await client.query(
          `insert into rule_scope
              (rule_id, scope_type, scope_id)
           values ($1, $2, $3)`,
          [ruleId, scp.scope_type, scp.scope_id],
        );
      }

      await client.query('commit');
      return ruleId;
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** فعال/غیرفعال کردن قاعده — در DDL ستونی به نام status وجود ندارد (migrations/0009:18) */
  async setRuleActive(companyId: string, ruleId: string, isActive: boolean): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `update rule set is_active = $3, updated_at = now()
        where id = $1 and company_id = $2`,
      [ruleId, companyId, isActive],
    );
    return (rowCount ?? 0) > 0;
  }

  /**
   * به‌روزرسانی عمومی قاعده (PATCH /rules/{id}) — فقط فیلدهای حاضر در dto.
   * بازه اعتبار از valid_from/valid_to ساخته می‌شود؛ هیچ‌کدام داده نشود، دست‌نخورده.
   */
  async updateRule(
    companyId: string,
    ruleId: string,
    dto: Partial<CreateRuleDto>,
  ): Promise<boolean> {
    const sets: string[] = [];
    const params: unknown[] = [ruleId, companyId];
    const add = (fragment: string, value: unknown): void => {
      params.push(value);
      sets.push(fragment.replace('$?', `$${params.length}`));
    };
    if (dto.title !== undefined) add('title = $?', dto.title);
    if (dto.entity !== undefined) add('entity = $?', dto.entity);
    if (dto.event !== undefined) add('event = $?', dto.event);
    if (dto.effect !== undefined) add('effect = $?', dto.effect);
    if (dto.priority !== undefined) add('priority = $?', dto.priority);
    if (dto.message_fa !== undefined) add('message_fa = $?', dto.message_fa);
    if (dto.is_active !== undefined) add('is_active = $?', dto.is_active);
    if (dto.valid_from !== undefined || dto.valid_to !== undefined) {
      params.push(dto.valid_from ?? null, dto.valid_to ?? null);
      const n = params.length;
      sets.push(
        `valid = daterange(coalesce($${n - 1}::date, lower(valid)), coalesce($${n}::date, upper(valid)))`,
      );
    }
    if (sets.length === 0) return true;
    const { rowCount } = await this.pool.query(
      `update rule set ${sets.join(', ')}, updated_at = now()
        where id = $1 and company_id = $2`,
      params,
    );
    return (rowCount ?? 0) > 0;
  }

  // ---------------- زنجیره تأیید ----------------

  async listApprovalChains(companyId: string): Promise<ApprovalChainRow[]> {
    const { rows } = await this.pool.query<ApprovalChainRow>(
      `select id, company_id, code, entity, is_active
         from approval_chain
        where company_id = $1
        order by code`,
      [companyId],
    );
    return rows;
  }

  async getApprovalChain(companyId: string, chainId: string): Promise<ApprovalChainRow | null> {
    if (!UUID_RE.test(chainId)) return null;
    const { rows } = await this.pool.query<ApprovalChainRow>(
      `select id, company_id, code, entity, is_active
         from approval_chain
        where id = $1 and company_id = $2`,
      [chainId, companyId],
    );
    return rows[0] ?? null;
  }

  async getApprovalChainSteps(chainId: string): Promise<ApprovalStepDefRow[]> {
    const { rows } = await this.pool.query<ApprovalStepDefRow>(
      `select id, approval_chain_id, step_no, approver_role_id, approver_staff_id,
              min_amount, max_amount, is_mandatory
         from approval_step_def
        where approval_chain_id = $1
        order by step_no`,
      [chainId],
    );
    return rows;
  }

  async createApprovalChain(
    companyId: string,
    dto: CreateApprovalChainDto,
    steps: ApprovalStepDefDto[],
  ): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');

      const { rows } = await client.query<{ id: string }>(
        `insert into approval_chain (company_id, code, entity, is_active)
         values ($1, $2, $3, $4)
         returning id`,
        [companyId, dto.code, dto.entity, dto.is_active ?? true],
      );
      const chainId = rows[0].id;

      for (const step of steps ?? []) {
        await client.query(
          `insert into approval_step_def
              (approval_chain_id, step_no, approver_role_id, approver_staff_id,
               min_amount, max_amount, is_mandatory)
           values ($1, $2, $3, $4, $5, $6, $7)`,
          [
            chainId,
            step.step_no,
            step.approver_role_id ?? null,
            step.approver_staff_id ?? null,
            step.min_amount ?? null,
            step.max_amount ?? null,
            step.is_mandatory !== 'false',
          ],
        );
      }

      await client.query('commit');
      return chainId;
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------- درخواست تأیید ----------------

  async listApprovalRequests(
    companyId: string,
    status?: string,
  ): Promise<ApprovalRequestRow[]> {
    const params: unknown[] = [companyId];
    // جدول approval_request ستون company_id ندارد؛ دامنه از زنجیره گرفته می‌شود
    let where = 'where ac.company_id = $1';
    if (status) {
      params.push(status);
      where += ` and a.status = $${params.length}`;
    }
    const { rows } = await this.pool.query<ApprovalRequestRow>(
      `select a.id, a.approval_chain_id, a.entity_type, a.entity_id, a.requested_by,
              a.amount, a.status, a.current_step, a.created_at, a.closed_at
         from approval_request a
         join approval_chain ac on ac.id = a.approval_chain_id
        ${where}
        order by a.created_at desc`,
      params,
    );
    return rows;
  }

  async getApprovalRequest(companyId: string, requestId: string): Promise<ApprovalRequestRow | null> {
    // TASK-24 (G-03): شناسهٔ غیر-UUID نباید 500 بدهد — «یافت‌نشد» پاسخِ درست است
    if (!UUID_RE.test(requestId)) return null;
    const { rows } = await this.pool.query<ApprovalRequestRow>(
      `select a.id, a.approval_chain_id, a.entity_type, a.entity_id, a.requested_by,
              a.amount, a.status, a.current_step, a.created_at, a.closed_at
         from approval_request a
         join approval_chain ac on ac.id = a.approval_chain_id
        where a.id = $1 and ac.company_id = $2`,
      [requestId, companyId],
    );
    return rows[0] ?? null;
  }

  async createApprovalRequest(dto: CreateApprovalRequestDto): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `insert into approval_request
          (approval_chain_id, entity_type, entity_id, requested_by, amount)
       values ($1, $2, $3, $4, $5)
       returning id`,
      [
        dto.approval_chain_id,
        dto.entity_type,
        dto.entity_id,
        dto.requested_by,
        dto.amount ?? null,
      ],
    );
    return rows[0].id;
  }

  async listApprovalDecisions(requestId: string): Promise<ApprovalDecisionRow[]> {
    const { rows } = await this.pool.query<ApprovalDecisionRow>(
      `select id, approval_request_id, step_no, decided_by, decision, comment, decided_at
         from approval_decision
        where approval_request_id = $1
        order by step_no, decided_at`,
      [requestId],
    );
    return rows;
  }

  async createApprovalDecision(
    requestId: string,
    stepNo: number,
    decidedBy: string,
    decision: string,
    comment: string | null,
  ): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `insert into approval_decision
          (approval_request_id, step_no, decided_by, decision, comment)
       values ($1, $2, $3, $4, $5)
       returning id`,
      [requestId, stepNo, decidedBy, decision, comment ?? null],
    );
    return rows[0].id;
  }

  /**
   * TASK-24F · G-03: انتقالِ وضعیتِ شرطی (compare-and-set) تا دو تأییدِ هم‌زمان
   * نتوانند از وضعیتِ `pending`/مرحلهٔ جاری عبور کنند.
   */
  async updateApprovalRequestStatus(
    requestId: string,
    status: string,
    currentStep: number,
    closedAt: string | null,
    expected?: { status: string; currentStep: number },
  ): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `update approval_request
          set status = $2, current_step = $3, closed_at = $4
        where id = $1
          and ($5::text is null or status = $5)
          and ($6::int is null or current_step = $6)`,
      [
        requestId,
        status,
        currentStep,
        closedAt ?? null,
        expected?.status ?? null,
        expected?.currentStep ?? null,
      ],
    );
    return (rowCount ?? 0) > 0;
  }

  /** TASK-24F · G-03: مجاز بودنِ تصمیم‌گیرنده برای مرحله (نقش/کارمند) */
  async userCanApproveStep(
    companyId: string,
    userId: string,
    step: ApprovalStepDefRow,
  ): Promise<boolean> {
    if (step.approver_staff_id == null && step.approver_role_id == null) return true;
    const { rows } = await this.pool.query<{ ok: boolean }>(
      `select (
         ($3::uuid is not null and exists (
            select 1 from app_user u
              join staff st on st.person_id = u.person_id
             where u.id = $2 and st.id = $3))
         or ($4::uuid is not null and exists (
            select 1 from user_role ur
             where ur.app_user_id = $2 and ur.role_id = $4))
       ) as ok
       from app_user u
       join person p on p.id = u.person_id
      where u.id = $2 and p.company_id = $1`,
      [companyId, userId, step.approver_staff_id, step.approver_role_id],
    );
    return rows[0]?.ok === true;
  }

  // ---------------- استثنا ----------------

  /**
   * بررسی تعلق شعبه به شرکت — جدول exception_item به branch(id) ارجاع می‌دهد
   * (migrations/0009:109)، پس نمی‌توان company_id را در آن گذاشت.
   */
  async branchBelongsToCompany(companyId: string, branchId: string): Promise<boolean> {
    const { rows } = await this.pool.query<{ one: string }>(
      `select 1 as one
         from branch
        where id = $1 and company_id = $2`,
      [branchId, companyId],
    );
    return rows.length > 0;
  }

  async listExceptionItems(branchId: string): Promise<ExceptionItemRow[]> {
    const { rows } = await this.pool.query<ExceptionItemRow>(
      `select id, branch_id, kind, severity, entity_type, entity_id, status, created_at
         from exception_item
        where branch_id = $1
        order by created_at desc`,
      [branchId],
    );
    return rows;
  }

  async createExceptionItem(input: {
    branch_id: string;
    kind: string;
    severity: string;
    entity_type?: string | null;
    entity_id?: string | null;
    payload?: Record<string, unknown>;
  }): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `insert into exception_item
          (branch_id, kind, severity, entity_type, entity_id, payload)
       values ($1, $2, $3, $4, $5, $6)
       returning id`,
      [
        input.branch_id,
        input.kind,
        input.severity,
        input.entity_type ?? null,
        input.entity_id ?? null,
        JSON.stringify(input.payload ?? {}),
      ],
    );
    return rows[0].id;
  }
  // ===================================================================
  // TASK-24Y — سیاست، اتصال، تفکیل، اعلان
  // ===================================================================

  /** همهٔ سیاست‌هایِ فعالِ یک عملیات در یک شرکت (شاملِ مرکزی و قلمرو). */
  async listPoliciesForOperation(
    companyId: string,
    operation: string,
  ): Promise<ApprovalPolicyRow[]> {
    const { rows } = await this.pool.query<ApprovalPolicyRow>(
      `select id, company_id, operation, scope, domain_id,
              min_amount::text as min_amount, max_amount::text as max_amount,
              min_risk_score, approval_chain_id, expires_in_hours, on_expiry,
              is_active, priority
         from approval_policy
        where company_id = $1 and operation = $2 and is_active
        order by priority asc`,
      [companyId, operation],
    );
    return rows;
  }

  async listPolicies(companyId: string, operation?: string | null): Promise<ApprovalPolicyRow[]> {
    const { rows } = await this.pool.query<ApprovalPolicyRow>(
      `select id, company_id, operation, scope, domain_id,
              min_amount::text as min_amount, max_amount::text as max_amount,
              min_risk_score, approval_chain_id, expires_in_hours, on_expiry,
              is_active, priority
         from approval_policy
        where company_id = $1 and ($2::text is null or operation = $2)
        order by operation, scope, priority`,
      [companyId, operation ?? null],
    );
    return rows;
  }

  async createPolicy(input: {
    company_id: string;
    operation: string;
    scope: string;
    domain_id: string | null;
    min_amount: number | null;
    max_amount: number | null;
    min_risk_score: number | null;
    approval_chain_id: string;
    expires_in_hours: number | null;
    on_expiry: string;
    priority: number;
  }): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `insert into approval_policy
         (company_id, operation, scope, domain_id, min_amount, max_amount, min_risk_score,
          approval_chain_id, expires_in_hours, on_expiry, priority)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       returning id`,
      [
        input.company_id, input.operation, input.scope, input.domain_id,
        input.min_amount, input.max_amount, input.min_risk_score,
        input.approval_chain_id, input.expires_in_hours, input.on_expiry, input.priority,
      ],
    );
    return rows[0].id;
  }

  async setPolicyActive(companyId: string, id: string, active: boolean): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `update approval_policy set is_active = $3, updated_at = now(), row_version = row_version + 1
        where id = $1 and company_id = $2 and scope <> 'central'`,
      [id, companyId, active],
    );
    return (rowCount ?? 0) > 0;
  }

  /** اتصالِ درخواستِ تأیید به موجودیتِ محافظت‌شده. */
  async createBinding(input: {
    company_id: string;
    approval_request_id: string;
    operation: string;
    entity_type: string;
    entity_id: string;
    entity_fingerprint: string | null;
  }): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `insert into approval_binding
         (company_id, approval_request_id, operation, entity_type, entity_id, entity_fingerprint)
       values ($1,$2,$3,$4,$5,$6)
       returning id`,
      [
        input.company_id, input.approval_request_id, input.operation,
        input.entity_type, input.entity_id, input.entity_fingerprint,
      ],
    );
    return rows[0].id;
  }

  /** آیا برای این موجودیت/عملیات یک تأییدِ **معتبر** وجود دارد؟ */
  async findConsumedBinding(companyId: string, operation: string, entityType: string, entityId: string) {
    const { rows } = await this.pool.query<{
      id: string; approval_request_id: string; consumed_at: string | null; entity_fingerprint: string | null;
    }>(
      `select b.id, b.approval_request_id, b.consumed_at, b.entity_fingerprint
         from approval_binding b
         join approval_request a on a.id = b.approval_request_id
        where b.company_id = $1 and b.operation = $2
          and b.entity_type = $3 and b.entity_id = $4`,
      [companyId, operation, entityType, entityId],
    );
    return rows[0] ?? null;
  }

  /**
   * مصرفِ اتمیکِ اتصال: فقط یک بار و فقط اگر تأیید واقعاً `approved` باشد.
   * `consumed_at` دوباره‌مصرف را می‌بندد.
   */
  async consumeBinding(companyId: string, bindingId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `update approval_binding b
          set consumed_at = now()
        where b.id = $1 and b.company_id = $2 and b.consumed_at is null
          and exists (select 1 from approval_request a
                       where a.id = b.approval_request_id and a.status = 'approved')`,
      [bindingId, companyId],
    );
    return (rowCount ?? 0) > 0;
  }

  /** تفکیلِ معتبرِ این کاربر در این لحظه (برای همان عملیات). */
  async findActiveDelegation(
    companyId: string,
    delegatorId: string,
    operation: string,
  ): Promise<{ delegate_id: string } | null> {
    const { rows } = await this.pool.query<{ delegate_id: string }>(
      `select delegate_id
         from approval_delegation
        where company_id = $1 and delegator_id = $2 and is_active
          and (operation is null or operation = $3)
          and now() between valid_from and valid_to
        order by valid_to asc
        limit 1`,
      [companyId, delegatorId, operation],
    );
    return rows[0] ?? null;
  }

  async listDelegations(companyId: string, userId: string) {
    const { rows } = await this.pool.query(
      `select id, delegator_id, delegate_id, operation, domain_id,
              valid_from, valid_to, reason, is_active, created_at
         from approval_delegation
        where company_id = $1 and (delegator_id = $2 or delegate_id = $2)
        order by created_at desc`,
      [companyId, userId],
    );
    return rows;
  }

  async createDelegation(input: {
    company_id: string;
    delegator_id: string;
    delegate_id: string;
    operation: string | null;
    domain_id: string | null;
    valid_from: string | null;
    valid_to: string;
    reason: string;
    created_by: string;
  }): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `insert into approval_delegation
         (company_id, delegator_id, delegate_id, operation, domain_id, valid_from, valid_to, reason, created_by)
       values ($1,$2,$3,$4,$5,coalesce($6::timestamptz, now()),$7,$8,$9)
       returning id`,
      [
        input.company_id, input.delegator_id, input.delegate_id, input.operation,
        input.domain_id, input.valid_from, input.valid_to, input.reason, input.created_by,
      ],
    );
    return rows[0].id;
  }

  async revokeDelegation(companyId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `update approval_delegation set is_active = false, row_version = row_version + 1
        where id = $1 and company_id = $2 and is_active`,
      [id, companyId],
    );
    return (rowCount ?? 0) > 0;
  }

  /** نوشتنِ اعلان در همان تراکنشِ کسب‌وکار (outbox). */
  async enqueueNotification(input: {
    company_id: string;
    approval_request_id: string | null;
    kind: string;
    recipient_user_id: string | null;
    payload: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `insert into approval_notification
         (company_id, approval_request_id, kind, recipient_user_id, payload)
       values ($1,$2,$3,$4,$5::jsonb)`,
      [
        input.company_id, input.approval_request_id, input.kind,
        input.recipient_user_id, JSON.stringify(input.payload ?? {}),
      ],
    );
  }

  async listNotifications(companyId: string, userId: string, status?: string | null) {
    const { rows } = await this.pool.query(
      `select id, approval_request_id, kind, payload, status, created_at, sent_at
         from approval_notification
        where company_id = $1 and recipient_user_id = $2
          and ($3::text is null or status = $3)
        order by created_at desc
        limit 200`,
      [companyId, userId, status ?? null],
    );
    return rows;
  }

  /**
   * درخواست‌های `pending` که مهلتشان گذشته است.
   * برای jobِ انقضا/ارتقا — نه برای مسیرِ درخواستِ HTTP.
   */
  async findExpiredRequests(companyId: string, limit = 100) {
    const { rows } = await this.pool.query(
      `select a.id, a.approval_chain_id, a.entity_type, a.entity_id, a.current_step,
              a.expires_at, a.policy_id
         from approval_request a
         join approval_chain ac on ac.id = a.approval_chain_id
        where ac.company_id = $1 and a.status = 'pending'
          and a.expires_at is not null and a.expires_at < now()
        order by a.expires_at asc
        limit $2`,
      [companyId, limit],
    );
    return rows;
  }

  async getPolicy(companyId: string, policyId: string) {
    const { rows } = await this.pool.query<ApprovalPolicyRow & { on_expiry: string }>(
      `select id, company_id, operation, scope, domain_id,
              min_amount::text as min_amount, max_amount::text as max_amount,
              min_risk_score, approval_chain_id, expires_in_hours, on_expiry,
              is_active, priority
         from approval_policy where id = $1 and company_id = $2`,
      [policyId, companyId],
    );
    return rows[0] ?? null;
  }

  /** بستنِ اتمیکِ درخواست با انقضا (فقط اگر هنوز pending است). */
  async expireRequest(requestId: string, status: 'expired' | 'cancelled'): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `update approval_request
          set status = $2, closed_at = now()
        where id = $1 and status = 'pending'`,
      [requestId, status],
    );
    return (rowCount ?? 0) > 0;
  }
  /** ساختِ درخواستِ تأیید با مهلت، قلمرو و سیاست (TASK-24Y). */
  async createApprovalRequestWithMeta(input: {
    approval_chain_id: string;
    entity_type: string;
    entity_id: string;
    requested_by: string;
    amount: number | null;
    current_step: number;
    expires_at: string | null;
    entity_domain_id: string | null;
    risk_score: number | null;
    policy_id: string | null;
  }): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `insert into approval_request
         (approval_chain_id, entity_type, entity_id, requested_by, amount, current_step,
          status, expires_at, entity_domain_id, risk_score, policy_id)
       values ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9,$10)
       returning id`,
      [
        input.approval_chain_id, input.entity_type, input.entity_id, input.requested_by,
        input.amount, input.current_step, input.expires_at, input.entity_domain_id,
        input.risk_score, input.policy_id,
      ],
    );
    return rows[0].id;
  }

  /** کاربرانِ متصل به یک کارمند (برای اعلان به تأییدکنندهٔ مرحله). */
  async userIdsForStaff(staffId: string): Promise<string[]> {
    const { rows } = await this.pool.query<{ id: string }>(
      `select u.id from app_user u join staff st on st.person_id = u.person_id where st.id = $1`,
      [staffId],
    );
    return rows.map((r) => r.id);
  }

  /** کاربرانِ دارای یک نقش. */
  async userIdsForRole(roleId: string): Promise<string[]> {
    const { rows } = await this.pool.query<{ id: string }>(
      `select ur.app_user_id as id from user_role ur where ur.role_id = $1`,
      [roleId],
    );
    return rows.map((r) => r.id);
  }

  /** علامت‌گذاریِ ارتقا (پس از بسته‌شدن با انقضا). */
  async markEscalated(requestId: string): Promise<void> {
    await this.pool.query(
      `update approval_request set escalated_at = now() where id = $1`,
      [requestId],
    );
  }
  /**
   * کارتابل: درخواست‌های pending که مرحلهٔ جاری‌شان به نقش/کارمندِ این کاربر
   * می‌خورد — یا کاربر از طریقِ تفکیلِ معتبر نمایندهٔ تأییدکنندهٔ آن مرحله است.
   * همه‌چیز در سطحِ شرکت محدود می‌شود.
   */
  async listInbox(companyId: string, userId: string) {
    const { rows } = await this.pool.query(
      `select a.id, a.entity_type, a.entity_id, a.status, a.current_step,
              a.amount::text as amount, a.created_at, a.expires_at, a.escalated_at,
              ac.code as chain_code, ac.entity as chain_entity
         from approval_request a
         join approval_chain ac on ac.id = a.approval_chain_id
         join approval_step_def s
           on s.approval_chain_id = a.approval_chain_id and s.step_no = a.current_step
        where ac.company_id = $1 and a.status = 'pending'
          and (
            -- کارمندِ مرحله
            (s.approver_staff_id is not null and exists (
               select 1 from app_user u join staff st on st.person_id = u.person_id
                where u.id = $2 and st.id = s.approver_staff_id))
            -- نقشِ مرحله
            or (s.approver_role_id is not null and exists (
               select 1 from user_role ur where ur.app_user_id = $2 and ur.role_id = s.approver_role_id))
            -- مرحلهٔ بی‌قید: هر کسی با مجوزِ تصمیم (کنترلِ مجوز در گاردِ مسیر است)
            or (s.approver_staff_id is null and s.approver_role_id is null)
            -- نمایندگیِ معتبر
            or exists (
               select 1 from approval_delegation d
                where d.company_id = $1 and d.delegate_id = $2 and d.is_active
                  and now() between d.valid_from and d.valid_to
                  and (d.operation is null or d.operation = ac.entity))
          )
        order by a.created_at asc
        limit 200`,
      [companyId, userId],
    );
    return rows;
  }

  async listSubmitted(companyId: string, userId: string) {
    const { rows } = await this.pool.query(
      `select a.id, a.entity_type, a.entity_id, a.status, a.current_step,
              a.amount::text as amount, a.created_at, a.closed_at, a.expires_at
         from approval_request a
         join approval_chain ac on ac.id = a.approval_chain_id
        where ac.company_id = $1 and a.requested_by = $2
        order by a.created_at desc
        limit 200`,
      [companyId, userId],
    );
    return rows;
  }

  async listExpired(companyId: string) {
    const { rows } = await this.pool.query(
      `select a.id, a.entity_type, a.entity_id, a.status, a.current_step,
              a.amount::text as amount, a.created_at, a.closed_at,
              a.expires_at, a.escalated_at
         from approval_request a
         join approval_chain ac on ac.id = a.approval_chain_id
        where ac.company_id = $1
          and (a.status = 'expired' or a.escalated_at is not null)
        order by a.closed_at desc nulls last
        limit 200`,
      [companyId],
    );
    return rows;
  }
}
