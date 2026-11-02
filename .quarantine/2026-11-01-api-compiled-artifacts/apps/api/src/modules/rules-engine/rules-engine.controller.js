"use strict";
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RulesEngineController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../identity-rbac/auth.guard");
const permissions_guard_1 = require("../identity-rbac/permissions.guard");
const require_permissions_decorator_1 = require("../identity-rbac/require-permissions.decorator");
/**
 * ماژول ۳ — کنترل‌ها و قوانین جامع (Rules Engine)
 * مسیرها مطابق قرارداد OpenAPI: /rules, /approval-chains, /approvals, /exception-items
 */
let RulesEngineController = (() => {
    let _classDecorators = [(0, common_1.UseGuards)(auth_guard_1.AuthGuard, permissions_guard_1.PermissionsGuard), (0, common_1.Controller)('rules-engine')];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _info_decorators;
    let _listRules_decorators;
    let _getRule_decorators;
    let _createRule_decorators;
    let _updateRuleStatus_decorators;
    let _listApprovalChains_decorators;
    let _getApprovalChain_decorators;
    let _createApprovalChain_decorators;
    let _listApprovalRequests_decorators;
    let _createApprovalRequest_decorators;
    let _getApprovalRequest_decorators;
    let _decideApproval_decorators;
    let _listExceptionItems_decorators;
    let _createExceptionItem_decorators;
    var RulesEngineController = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _info_decorators = [(0, common_1.Get)()];
            _listRules_decorators = [(0, common_1.Get)('rules'), (0, require_permissions_decorator_1.RequirePermissions)('rules.engine.view')];
            _getRule_decorators = [(0, common_1.Get)('rules/:id'), (0, require_permissions_decorator_1.RequirePermissions)('rules.engine.view')];
            _createRule_decorators = [(0, common_1.Post)('rules'), (0, require_permissions_decorator_1.RequirePermissions)('rules.engine.create')];
            _updateRuleStatus_decorators = [(0, common_1.Patch)('rules/:id/status'), (0, require_permissions_decorator_1.RequirePermissions)('rules.engine.update')];
            _listApprovalChains_decorators = [(0, common_1.Get)('approval-chains'), (0, require_permissions_decorator_1.RequirePermissions)('rules.engine.view')];
            _getApprovalChain_decorators = [(0, common_1.Get)('approval-chains/:id'), (0, require_permissions_decorator_1.RequirePermissions)('rules.engine.view')];
            _createApprovalChain_decorators = [(0, common_1.Post)('approval-chains'), (0, require_permissions_decorator_1.RequirePermissions)('rules.engine.create')];
            _listApprovalRequests_decorators = [(0, common_1.Get)('approvals'), (0, require_permissions_decorator_1.RequirePermissions)('rules.engine.view')];
            _createApprovalRequest_decorators = [(0, common_1.Post)('approvals'), (0, require_permissions_decorator_1.RequirePermissions)('rules.engine.create')];
            _getApprovalRequest_decorators = [(0, common_1.Get)('approvals/:id'), (0, require_permissions_decorator_1.RequirePermissions)('rules.engine.view')];
            _decideApproval_decorators = [(0, common_1.Post)('approvals/:id/decision'), (0, require_permissions_decorator_1.RequirePermissions)('rules.engine.approve')];
            _listExceptionItems_decorators = [(0, common_1.Get)('exception-items'), (0, require_permissions_decorator_1.RequirePermissions)('rules.engine.view')];
            _createExceptionItem_decorators = [(0, common_1.Post)('exception-items'), (0, require_permissions_decorator_1.RequirePermissions)('rules.engine.create')];
            __esDecorate(this, null, _info_decorators, { kind: "method", name: "info", static: false, private: false, access: { has: obj => "info" in obj, get: obj => obj.info }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _listRules_decorators, { kind: "method", name: "listRules", static: false, private: false, access: { has: obj => "listRules" in obj, get: obj => obj.listRules }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getRule_decorators, { kind: "method", name: "getRule", static: false, private: false, access: { has: obj => "getRule" in obj, get: obj => obj.getRule }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _createRule_decorators, { kind: "method", name: "createRule", static: false, private: false, access: { has: obj => "createRule" in obj, get: obj => obj.createRule }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _updateRuleStatus_decorators, { kind: "method", name: "updateRuleStatus", static: false, private: false, access: { has: obj => "updateRuleStatus" in obj, get: obj => obj.updateRuleStatus }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _listApprovalChains_decorators, { kind: "method", name: "listApprovalChains", static: false, private: false, access: { has: obj => "listApprovalChains" in obj, get: obj => obj.listApprovalChains }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getApprovalChain_decorators, { kind: "method", name: "getApprovalChain", static: false, private: false, access: { has: obj => "getApprovalChain" in obj, get: obj => obj.getApprovalChain }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _createApprovalChain_decorators, { kind: "method", name: "createApprovalChain", static: false, private: false, access: { has: obj => "createApprovalChain" in obj, get: obj => obj.createApprovalChain }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _listApprovalRequests_decorators, { kind: "method", name: "listApprovalRequests", static: false, private: false, access: { has: obj => "listApprovalRequests" in obj, get: obj => obj.listApprovalRequests }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _createApprovalRequest_decorators, { kind: "method", name: "createApprovalRequest", static: false, private: false, access: { has: obj => "createApprovalRequest" in obj, get: obj => obj.createApprovalRequest }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getApprovalRequest_decorators, { kind: "method", name: "getApprovalRequest", static: false, private: false, access: { has: obj => "getApprovalRequest" in obj, get: obj => obj.getApprovalRequest }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _decideApproval_decorators, { kind: "method", name: "decideApproval", static: false, private: false, access: { has: obj => "decideApproval" in obj, get: obj => obj.decideApproval }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _listExceptionItems_decorators, { kind: "method", name: "listExceptionItems", static: false, private: false, access: { has: obj => "listExceptionItems" in obj, get: obj => obj.listExceptionItems }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _createExceptionItem_decorators, { kind: "method", name: "createExceptionItem", static: false, private: false, access: { has: obj => "createExceptionItem" in obj, get: obj => obj.createExceptionItem }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            RulesEngineController = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        service = __runInitializers(this, _instanceExtraInitializers);
        constructor(service) {
            this.service = service;
        }
        info() {
            return {
                module: 'rules-engine',
                title: 'کنترل‌ها و قوانین جامع',
                resources: ['rules', 'rule-sets', 'constraints', 'approval-chains', 'evaluations'],
                status: 'scaffold',
            };
        }
        // ---------------- قوانین ----------------
        listRules(companyId) {
            return this.service.listRules(companyId);
        }
        getRule(companyId, id) {
            return this.service.getRule(companyId, id);
        }
        createRule(companyId, dto) {
            return this.service.createRule(companyId, dto);
        }
        updateRuleStatus(companyId, id, body) {
            return this.service.updateRuleStatus(companyId, id, body.status);
        }
        // ---------------- زنجیره تأیید ----------------
        listApprovalChains(companyId) {
            return this.service.listApprovalChains(companyId);
        }
        getApprovalChain(companyId, id) {
            return this.service.getApprovalChain(companyId, id);
        }
        createApprovalChain(companyId, dto) {
            return this.service.createApprovalChain(companyId, dto);
        }
        // ---------------- درخواست تأیید ----------------
        listApprovalRequests(companyId, body) {
            return this.service.listApprovalRequests(companyId, body?.status);
        }
        createApprovalRequest(companyId, dto) {
            return this.service.createApprovalRequest(companyId, dto);
        }
        getApprovalRequest(id) {
            return this.service.getApprovalRequest(id);
        }
        decideApproval(id, userId, dto) {
            return this.service.decideApproval(id, userId, dto.step_no, dto.decision, dto.comment ?? null);
        }
        // ---------------- استثنا ----------------
        listExceptionItems(companyId) {
            // companyId == branch_id برای سادگی در فاز اول
            return this.service.listExceptionItems(companyId);
        }
        createExceptionItem(companyId, body) {
            return this.service.createExceptionItem({
                branch_id: companyId,
                kind: body.kind,
                severity: body.severity,
                entity_type: body.entity_type ?? null,
                entity_id: body.entity_id ?? null,
                payload: body.payload ?? {},
            });
        }
    };
    return RulesEngineController = _classThis;
})();
exports.RulesEngineController = RulesEngineController;
