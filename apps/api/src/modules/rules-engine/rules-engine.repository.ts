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

  async updateApprovalRequestStatus(
    requestId: string,
    status: string,
    currentStep: number,
    closedAt: string | null,
  ): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `update approval_request
          set status = $2, current_step = $3, closed_at = $4
        where id = $1`,
      [requestId, status, currentStep, closedAt ?? null],
    );
    return (rowCount ?? 0) > 0;
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
}
