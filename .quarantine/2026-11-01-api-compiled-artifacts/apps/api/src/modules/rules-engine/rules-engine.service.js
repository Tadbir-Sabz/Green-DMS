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
exports.RulesEngineService = void 0;
const common_1 = require("@nestjs/common");
const rules_engine_dto_1 = require("./rules-engine.dto");
const notFound = (msg) => new common_1.NotFoundException({ code: 'not_found', message_fa: msg });
const badRequest = (code, message_fa) => new common_1.BadRequestException({ code, message_fa });
/**what is the current step of an approval chain for a given amount */
function findCurrentStep(steps, amount) {
    for (const step of steps) {
        const minOk = step.min_amount == null || (amount != null && amount >= step.min_amount);
        const maxOk = step.max_amount == null || (amount != null && amount <= step.max_amount);
        if (minOk && maxOk)
            return step.step_no; // cumulative
    }
    return 1;
}
let RulesEngineService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var RulesEngineService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            RulesEngineService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        repo;
        constructor(repo) {
            this.repo = repo;
        }
        // ---------------- قوانین ----------------
        async listRules(companyId) {
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
        async getRule(companyId, ruleId) {
            const rule = await this.repo.getRule(companyId, ruleId);
            if (!rule)
                throw notFound('قاعده یافت نشد');
            const conditions = await this.repo.getRuleConditions(ruleId);
            const actions = await this.repo.getRuleActions(ruleId);
            const scopes = await this.repo.getRuleScopes(ruleId);
            return { ...rule, conditions, actions, scopes };
        }
        async createRule(companyId, dto) {
            if (!rules_engine_dto_1.RULE_ENTITIES.includes(dto.entity)) {
                throw badRequest('invalid_entity', 'نوع موجودی قاعده معتبر نیست.');
            }
            if (!rules_engine_dto_1.RULE_EVENTS.includes(dto.event)) {
                throw badRequest('invalid_event', 'رویداد قاعده معتبر نیست.');
            }
            if (!rules_engine_dto_1.RULE_EFFECTS.includes(dto.effect)) {
                throw badRequest('invalid_effect', 'اقدام قاعده معتبر نیست.');
            }
            const id = await this.repo.createRule(companyId, dto, dto.conditions ?? [], dto.actions ?? [], dto.scopes ?? []);
            return this.getRule(companyId, id);
        }
        async updateRuleStatus(companyId, ruleId, status) {
            const rule = await this.repo.getRule(companyId, ruleId);
            if (!rule)
                throw notFound('قاعده یافت نشد');
            const ok = await this.repo.updateRuleStatus(companyId, ruleId, status);
            if (!ok)
                throw badRequest('update_failed', 'تغییر وضعیت قاعده ناموفق بود.');
            return this.repo.getRule(companyId, ruleId);
        }
        // ---------------- زنجیره تأیید ----------------
        async listApprovalChains(companyId) {
            return this.repo.listApprovalChains(companyId);
        }
        async getApprovalChain(companyId, chainId) {
            const chain = await this.repo.getApprovalChain(companyId, chainId);
            if (!chain)
                throw notFound('زنجیره تأیید یافت نشد');
            const steps = await this.repo.getApprovalChainSteps(chainId);
            return { ...chain, steps };
        }
        async createApprovalChain(companyId, dto) {
            const id = await this.repo.createApprovalChain(companyId, dto, dto.steps ?? []);
            return this.getApprovalChain(companyId, id);
        }
        // ---------------- درخواست تأیید ----------------
        async listApprovalRequests(companyId, status) {
            return this.repo.listApprovalRequests(companyId, status);
        }
        async createApprovalRequest(companyId, dto) {
            // بررسی وجود زنجیره تأیید
            const chain = await this.repo.getApprovalChain(companyId, dto.approval_chain_id);
            if (!chain)
                throw notFound('زنجیره تأیید یافت نشد');
            const id = await this.repo.createApprovalRequest(dto);
            const req = await this.repo.getApprovalRequest(id);
            if (!req)
                throw badRequest('create_failed', 'ایجاد درخواست تأیید ناموفق بود.');
            // تعیین مرحله فعلی بر اساس مبلغ
            const steps = await this.repo.getApprovalChainSteps(dto.approval_chain_id);
            const currentStep = findCurrentStep(steps, dto.amount ?? null);
            await this.repo.updateApprovalRequestStatus(id, 'pending', currentStep, null);
            return this.repo.getApprovalRequest(id);
        }
        async getApprovalRequest(requestId) {
            const req = await this.repo.getApprovalRequest(requestId);
            if (!req)
                throw notFound('درخواست تأیید یافت نشد');
            const decisions = await this.repo.listApprovalDecisions(requestId);
            return { ...req, decisions };
        }
        async decideApproval(requestId, decidedBy, stepNo, decision, comment) {
            const req = await this.repo.getApprovalRequest(requestId);
            if (!req)
                throw notFound('درخواست تأیید یافت نشد');
            if (req.status !== 'pending') {
                throw badRequest('not_pending', 'درخواست تأیید در وضعیت منتظر نیست.');
            }
            await this.repo.createApprovalDecision(requestId, stepNo, decidedBy, decision, comment);
            if (decision === 'rejected') {
                await this.repo.updateApprovalRequestStatus(requestId, 'rejected', stepNo, new Date().toISOString());
                return this.repo.getApprovalRequest(requestId);
            }
            if (decision === 'returned') {
                await this.repo.updateApprovalRequestStatus(requestId, 'cancelled', stepNo, new Date().toISOString());
                return this.repo.getApprovalRequest(requestId);
            }
            // approved → پیش رفتن به مرحله بعدی یا بسته شدن
            const steps = await this.repo.getApprovalChainSteps((await this.repo.getApprovalChain(req.company_id, req.approval_chain_id)).id);
            const maxStep = Math.max(...steps.map((s) => s.step_no));
            if (stepNo >= maxStep) {
                await this.repo.updateApprovalRequestStatus(requestId, 'approved', stepNo, new Date().toISOString());
            }
            else {
                await this.repo.updateApprovalRequestStatus(requestId, 'pending', stepNo + 1, null);
            }
            return this.repo.getApprovalRequest(requestId);
        }
        // ---------------- استثنا ----------------
        async listExceptionItems(branchId) {
            return this.repo.listExceptionItems(branchId);
        }
        async createExceptionItem(input) {
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
            const id = await this.repo.createExceptionItem(input);
            return this.repo.listExceptionItems(input.branch_id).then((items) => items.find((i) => i.id === id));
        }
    };
    return RulesEngineService = _classThis;
})();
exports.RulesEngineService = RulesEngineService;
