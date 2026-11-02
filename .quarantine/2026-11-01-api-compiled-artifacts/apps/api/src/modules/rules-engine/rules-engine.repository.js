"use strict";
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RulesEngineRepository = void 0;
const common_1 = require("@nestjs/common");
let RulesEngineRepository = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var RulesEngineRepository = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            RulesEngineRepository = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        pool;
        constructor(pool) {
            this.pool = pool;
        }
        // ---------------- قوانین ----------------
        async listRules(companyId) {
            const { rows } = await this.pool.query(`select id, company_id, code, title, entity, event, effect, priority,
              message_fa, valid, status, created_at, updated_at
         from rule
        where company_id = $1
        order by priority, created_at`, [companyId]);
            return rows;
        }
        async getRule(companyId, ruleId) {
            const { rows } = await this.pool.query(`select id, company_id, code, title, entity, event, effect, priority,
              message_fa, valid, status, created_at, updated_at
         from rule
        where id = $1 and company_id = $2`, [ruleId, companyId]);
            return rows[0] ?? null;
        }
        async getRuleConditions(ruleId) {
            const { rows } = await this.pool.query(`select id, rule_id, group_no, field, operator, value
         from rule_condition
        where rule_id = $1
        order by group_no, id`, [ruleId]);
            return rows;
        }
        async getRuleActions(ruleId) {
            const { rows } = await this.pool.query(`select id, rule_id, action_type, params
         from rule_action
        where rule_id = $1
        order by id`, [ruleId]);
            return rows;
        }
        async getRuleScopes(ruleId) {
            const { rows } = await this.pool.query(`select rule_id, scope_type, scope_id
         from rule_scope
        where rule_id = $1`, [ruleId]);
            return rows;
        }
        async createRule(companyId, dto, conditions, actions, scopes) {
            const client = await this.pool.connect();
            try {
                await client.query('begin');
                const { rows } = await client.query(`insert into rule
            (company_id, code, title, entity, event, effect, priority, message_fa,
             valid, status)
         values ($1, $2, $3, $4, $5, $6, $7, $8,
                 daterange($9::date, $10::date, '[]'), $11)
         returning id`, [
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
                    dto.status ?? 'active',
                ]);
                const ruleId = rows[0].id;
                for (const cond of conditions ?? []) {
                    await client.query(`insert into rule_condition
              (rule_id, group_no, field, operator, value)
           values ($1, $2, $3, $4, $5)`, [ruleId, cond.group_no ?? 1, cond.field, cond.operator, JSON.stringify(cond.value)]);
                }
                for (const act of actions ?? []) {
                    await client.query(`insert into rule_action
              (rule_id, action_type, params)
           values ($1, $2, $3)`, [ruleId, act.action_type, JSON.stringify(act.params ?? {})]);
                }
                for (const scp of scopes ?? []) {
                    await client.query(`insert into rule_scope
              (rule_id, scope_type, scope_id)
           values ($1, $2, $3)`, [ruleId, scp.scope_type, scp.scope_id]);
                }
                await client.query('commit');
                return ruleId;
            }
            catch (err) {
                await client.query('rollback').catch(() => undefined);
                throw err;
            }
            finally {
                client.release();
            }
        }
        async updateRuleStatus(companyId, ruleId, status) {
            const { rowCount } = await this.pool.query(`update rule set status = $3, updated_at = now()
        where id = $1 and company_id = $2`, [ruleId, companyId, status]);
            return (rowCount ?? 0) > 0;
        }
        // ---------------- زنجیره تأیید ----------------
        async listApprovalChains(companyId) {
            const { rows } = await this.pool.query(`select id, company_id, code, entity, status, created_at
         from approval_chain
        where company_id = $1
        order by code`, [companyId]);
            return rows;
        }
        async getApprovalChain(companyId, chainId) {
            const { rows } = await this.pool.query(`select id, company_id, code, entity, status, created_at
         from approval_chain
        where id = $1 and company_id = $2`, [chainId, companyId]);
            return rows[0] ?? null;
        }
        async getApprovalChainSteps(chainId) {
            const { rows } = await this.pool.query(`select id, approval_chain_id, step_no, approver_role_id, approver_staff_id,
              min_amount, max_amount, is_mandatory
         from approval_step_def
        where approval_chain_id = $1
        order by step_no`, [chainId]);
            return rows;
        }
        async createApprovalChain(companyId, dto, steps) {
            const client = await this.pool.connect();
            try {
                await client.query('begin');
                const { rows } = await client.query(`insert into approval_chain (company_id, code, entity, status)
         values ($1, $2, $3, $4)
         returning id`, [companyId, dto.code, dto.entity, dto.status ?? 'active']);
                const chainId = rows[0].id;
                for (const step of steps ?? []) {
                    await client.query(`insert into approval_step_def
              (approval_chain_id, step_no, approver_role_id, approver_staff_id,
               min_amount, max_amount, is_mandatory)
           values ($1, $2, $3, $4, $5, $6, $7)`, [
                        chainId,
                        step.step_no,
                        step.approver_role_id ?? null,
                        step.approver_staff_id ?? null,
                        step.min_amount ?? null,
                        step.max_amount ?? null,
                        step.is_mandatory !== 'false',
                    ]);
                }
                await client.query('commit');
                return chainId;
            }
            catch (err) {
                await client.query('rollback').catch(() => undefined);
                throw err;
            }
            finally {
                client.release();
            }
        }
        // ---------------- درخواست تأیید ----------------
        async listApprovalRequests(companyId, status) {
            const params = [companyId];
            let where = 'where a.company_id = $1';
            if (status) {
                params.push(status);
                where += ` and a.status = $${params.length}`;
            }
            const { rows } = await this.pool.query(`select a.id, a.approval_chain_id, a.entity_type, a.entity_id, a.requested_by,
              a.amount, a.status, a.current_step, a.created_at, a.closed_at
         from approval_request a
         join approval_chain ac on ac.id = a.approval_chain_id
        ${where}
        order by a.created_at desc`, params);
            return rows;
        }
        async getApprovalRequest(requestId) {
            const { rows } = await this.pool.query(`select a.id, a.approval_chain_id, a.entity_type, a.entity_id, a.requested_by,
              a.amount, a.status, a.current_step, a.created_at, a.closed_at
         from approval_request a
         join approval_chain ac on ac.id = a.approval_chain_id
        where a.id = $1`, [requestId]);
            return rows[0] ?? null;
        }
        async createApprovalRequest(dto) {
            const { rows } = await this.pool.query(`insert into approval_request
          (approval_chain_id, entity_type, entity_id, requested_by, amount)
       values ($1, $2, $3, $4, $5)
       returning id`, [
                dto.approval_chain_id,
                dto.entity_type,
                dto.entity_id,
                dto.requested_by,
                dto.amount ?? null,
            ]);
            return rows[0].id;
        }
        async listApprovalDecisions(requestId) {
            const { rows } = await this.pool.query(`select id, approval_request_id, step_no, decided_by, decision, comment, decided_at
         from approval_decision
        where approval_request_id = $1
        order by step_no, decided_at`, [requestId]);
            return rows;
        }
        async createApprovalDecision(requestId, stepNo, decidedBy, decision, comment) {
            const { rows } = await this.pool.query(`insert into approval_decision
          (approval_request_id, step_no, decided_by, decision, comment)
       values ($1, $2, $3, $4, $5)
       returning id`, [requestId, stepNo, decidedBy, decision, comment ?? null]);
            return rows[0].id;
        }
        async updateApprovalRequestStatus(requestId, status, currentStep, closedAt) {
            const { rowCount } = await this.pool.query(`update approval_request
          set status = $2, current_step = $3, closed_at = $4
        where id = $1`, [requestId, status, currentStep, closedAt ?? null]);
            return (rowCount ?? 0) > 0;
        }
        // ---------------- استثنا ----------------
        async listExceptionItems(branchId) {
            const { rows } = await this.pool.query(`select id, branch_id, kind, severity, entity_type, entity_id, status, created_at
         from exception_item
        where branch_id = $1
        order by created_at desc`, [branchId]);
            return rows;
        }
        async createExceptionItem(input) {
            const { rows } = await this.pool.query(`insert into exception_item
          (branch_id, kind, severity, entity_type, entity_id, payload)
       values ($1, $2, $3, $4, $5, $6)
       returning id`, [
                input.branch_id,
                input.kind,
                input.severity,
                input.entity_type ?? null,
                input.entity_id ?? null,
                JSON.stringify(input.payload ?? {}),
            ]);
            return rows[0].id;
        }
    };
    return RulesEngineRepository = _classThis;
})();
exports.RulesEngineRepository = RulesEngineRepository;
