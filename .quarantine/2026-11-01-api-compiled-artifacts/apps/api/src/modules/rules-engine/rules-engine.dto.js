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
exports.ExceptionItemDto = exports.ApprovalDecisionDto = exports.CreateApprovalRequestDto = exports.ApprovalStepDefDto = exports.CreateApprovalChainDto = exports.RuleDto = exports.RuleScopeDto = exports.RuleActionDto = exports.RuleConditionDto = exports.CreateRuleDto = exports.RULE_SCOPE_TYPES = exports.RULE_ACTION_TYPES = exports.RULE_EFFECTS = exports.RULE_EVENTS = exports.RULE_ENTITIES = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
/** مقادیر مجاز entity برای قاعده (طبق دdl G.۶) */
exports.RULE_ENTITIES = [
    'sales_order',
    'invoice',
    'customer',
    'product',
    'staff',
    'waybill',
    'return_request',
    'payment_receipt',
    'purchase_order',
    'tour',
    'delivery',
];
/** مقادیر مجاز event */
exports.RULE_EVENTS = [
    'before_save',
    'before_approve',
    'after_save',
    'on_schedule',
];
/** مقادیر مجاز effect */
exports.RULE_EFFECTS = [
    'block',
    'warn',
    'require_approval',
    'set_field',
    'notify',
];
/** مقادیر مجاز action_type */
exports.RULE_ACTION_TYPES = [
    'set_discount',
    'set_price',
    'block_order',
    'require_approval',
    'assign_supervisor',
    'add_gift',
    'send_sms',
    'create_task',
    'flag_customer',
];
/** مقادیر مجاز scope_type */
exports.RULE_SCOPE_TYPES = [
    'company',
    'branch',
    'area',
    'region',
    'route',
    'customer_group',
    'customer',
];
/** دto برای ایجاد/بروزرسانی قاعده */
let CreateRuleDto = (() => {
    let _code_decorators;
    let _code_initializers = [];
    let _code_extraInitializers = [];
    let _title_decorators;
    let _title_initializers = [];
    let _title_extraInitializers = [];
    let _entity_decorators;
    let _entity_initializers = [];
    let _entity_extraInitializers = [];
    let _event_decorators;
    let _event_initializers = [];
    let _event_extraInitializers = [];
    let _effect_decorators;
    let _effect_initializers = [];
    let _effect_extraInitializers = [];
    let _priority_decorators;
    let _priority_initializers = [];
    let _priority_extraInitializers = [];
    let _message_fa_decorators;
    let _message_fa_initializers = [];
    let _message_fa_extraInitializers = [];
    let _valid_from_decorators;
    let _valid_from_initializers = [];
    let _valid_from_extraInitializers = [];
    let _valid_to_decorators;
    let _valid_to_initializers = [];
    let _valid_to_extraInitializers = [];
    let _status_decorators;
    let _status_initializers = [];
    let _status_extraInitializers = [];
    let _conditions_decorators;
    let _conditions_initializers = [];
    let _conditions_extraInitializers = [];
    let _actions_decorators;
    let _actions_initializers = [];
    let _actions_extraInitializers = [];
    let _scopes_decorators;
    let _scopes_initializers = [];
    let _scopes_extraInitializers = [];
    return class CreateRuleDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _code_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsString)()];
            _title_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsString)()];
            _entity_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsEnum)(exports.RULE_ENTITIES, { each: false })];
            _event_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsEnum)(exports.RULE_EVENTS, { each: false })];
            _effect_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsEnum)(exports.RULE_EFFECTS, { each: false })];
            _priority_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsNumber)(), (0, class_validator_1.Min)(0), (0, class_validator_1.Max)(32767)];
            _message_fa_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsString)()];
            _valid_from_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsDateString)()];
            _valid_to_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsDateString)()];
            _status_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsEnum)(['active', 'inactive'])];
            _conditions_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsArray)(), (0, class_validator_1.ValidateNested)({ each: true }), (0, class_transformer_1.Type)(() => RuleConditionDto)];
            _actions_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsArray)(), (0, class_validator_1.ValidateNested)({ each: true }), (0, class_transformer_1.Type)(() => RuleActionDto)];
            _scopes_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsArray)(), (0, class_validator_1.ValidateNested)({ each: true }), (0, class_transformer_1.Type)(() => RuleScopeDto)];
            __esDecorate(null, null, _code_decorators, { kind: "field", name: "code", static: false, private: false, access: { has: obj => "code" in obj, get: obj => obj.code, set: (obj, value) => { obj.code = value; } }, metadata: _metadata }, _code_initializers, _code_extraInitializers);
            __esDecorate(null, null, _title_decorators, { kind: "field", name: "title", static: false, private: false, access: { has: obj => "title" in obj, get: obj => obj.title, set: (obj, value) => { obj.title = value; } }, metadata: _metadata }, _title_initializers, _title_extraInitializers);
            __esDecorate(null, null, _entity_decorators, { kind: "field", name: "entity", static: false, private: false, access: { has: obj => "entity" in obj, get: obj => obj.entity, set: (obj, value) => { obj.entity = value; } }, metadata: _metadata }, _entity_initializers, _entity_extraInitializers);
            __esDecorate(null, null, _event_decorators, { kind: "field", name: "event", static: false, private: false, access: { has: obj => "event" in obj, get: obj => obj.event, set: (obj, value) => { obj.event = value; } }, metadata: _metadata }, _event_initializers, _event_extraInitializers);
            __esDecorate(null, null, _effect_decorators, { kind: "field", name: "effect", static: false, private: false, access: { has: obj => "effect" in obj, get: obj => obj.effect, set: (obj, value) => { obj.effect = value; } }, metadata: _metadata }, _effect_initializers, _effect_extraInitializers);
            __esDecorate(null, null, _priority_decorators, { kind: "field", name: "priority", static: false, private: false, access: { has: obj => "priority" in obj, get: obj => obj.priority, set: (obj, value) => { obj.priority = value; } }, metadata: _metadata }, _priority_initializers, _priority_extraInitializers);
            __esDecorate(null, null, _message_fa_decorators, { kind: "field", name: "message_fa", static: false, private: false, access: { has: obj => "message_fa" in obj, get: obj => obj.message_fa, set: (obj, value) => { obj.message_fa = value; } }, metadata: _metadata }, _message_fa_initializers, _message_fa_extraInitializers);
            __esDecorate(null, null, _valid_from_decorators, { kind: "field", name: "valid_from", static: false, private: false, access: { has: obj => "valid_from" in obj, get: obj => obj.valid_from, set: (obj, value) => { obj.valid_from = value; } }, metadata: _metadata }, _valid_from_initializers, _valid_from_extraInitializers);
            __esDecorate(null, null, _valid_to_decorators, { kind: "field", name: "valid_to", static: false, private: false, access: { has: obj => "valid_to" in obj, get: obj => obj.valid_to, set: (obj, value) => { obj.valid_to = value; } }, metadata: _metadata }, _valid_to_initializers, _valid_to_extraInitializers);
            __esDecorate(null, null, _status_decorators, { kind: "field", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status, set: (obj, value) => { obj.status = value; } }, metadata: _metadata }, _status_initializers, _status_extraInitializers);
            __esDecorate(null, null, _conditions_decorators, { kind: "field", name: "conditions", static: false, private: false, access: { has: obj => "conditions" in obj, get: obj => obj.conditions, set: (obj, value) => { obj.conditions = value; } }, metadata: _metadata }, _conditions_initializers, _conditions_extraInitializers);
            __esDecorate(null, null, _actions_decorators, { kind: "field", name: "actions", static: false, private: false, access: { has: obj => "actions" in obj, get: obj => obj.actions, set: (obj, value) => { obj.actions = value; } }, metadata: _metadata }, _actions_initializers, _actions_extraInitializers);
            __esDecorate(null, null, _scopes_decorators, { kind: "field", name: "scopes", static: false, private: false, access: { has: obj => "scopes" in obj, get: obj => obj.scopes, set: (obj, value) => { obj.scopes = value; } }, metadata: _metadata }, _scopes_initializers, _scopes_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        code = __runInitializers(this, _code_initializers, void 0);
        title = (__runInitializers(this, _code_extraInitializers), __runInitializers(this, _title_initializers, void 0));
        entity = (__runInitializers(this, _title_extraInitializers), __runInitializers(this, _entity_initializers, void 0));
        event = (__runInitializers(this, _entity_extraInitializers), __runInitializers(this, _event_initializers, void 0));
        effect = (__runInitializers(this, _event_extraInitializers), __runInitializers(this, _effect_initializers, void 0));
        priority = (__runInitializers(this, _effect_extraInitializers), __runInitializers(this, _priority_initializers, void 0));
        message_fa = (__runInitializers(this, _priority_extraInitializers), __runInitializers(this, _message_fa_initializers, void 0));
        valid_from = (__runInitializers(this, _message_fa_extraInitializers), __runInitializers(this, _valid_from_initializers, void 0));
        valid_to = (__runInitializers(this, _valid_from_extraInitializers), __runInitializers(this, _valid_to_initializers, void 0));
        status = (__runInitializers(this, _valid_to_extraInitializers), __runInitializers(this, _status_initializers, void 0));
        conditions = (__runInitializers(this, _status_extraInitializers), __runInitializers(this, _conditions_initializers, void 0));
        actions = (__runInitializers(this, _conditions_extraInitializers), __runInitializers(this, _actions_initializers, void 0));
        scopes = (__runInitializers(this, _actions_extraInitializers), __runInitializers(this, _scopes_initializers, void 0));
        constructor() {
            __runInitializers(this, _scopes_extraInitializers);
        }
    };
})();
exports.CreateRuleDto = CreateRuleDto;
/** شرایط قاعده (AND داخل گروه، OR بین گروه‌ها) */
let RuleConditionDto = (() => {
    let _group_no_decorators;
    let _group_no_initializers = [];
    let _group_no_extraInitializers = [];
    let _field_decorators;
    let _field_initializers = [];
    let _field_extraInitializers = [];
    let _operator_decorators;
    let _operator_initializers = [];
    let _operator_extraInitializers = [];
    let _value_decorators;
    let _value_initializers = [];
    let _value_extraInitializers = [];
    return class RuleConditionDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _group_no_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsNumber)()];
            _field_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsString)()];
            _operator_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsString)()];
            _value_decorators = [(0, class_validator_1.IsDefined)()];
            __esDecorate(null, null, _group_no_decorators, { kind: "field", name: "group_no", static: false, private: false, access: { has: obj => "group_no" in obj, get: obj => obj.group_no, set: (obj, value) => { obj.group_no = value; } }, metadata: _metadata }, _group_no_initializers, _group_no_extraInitializers);
            __esDecorate(null, null, _field_decorators, { kind: "field", name: "field", static: false, private: false, access: { has: obj => "field" in obj, get: obj => obj.field, set: (obj, value) => { obj.field = value; } }, metadata: _metadata }, _field_initializers, _field_extraInitializers);
            __esDecorate(null, null, _operator_decorators, { kind: "field", name: "operator", static: false, private: false, access: { has: obj => "operator" in obj, get: obj => obj.operator, set: (obj, value) => { obj.operator = value; } }, metadata: _metadata }, _operator_initializers, _operator_extraInitializers);
            __esDecorate(null, null, _value_decorators, { kind: "field", name: "value", static: false, private: false, access: { has: obj => "value" in obj, get: obj => obj.value, set: (obj, value) => { obj.value = value; } }, metadata: _metadata }, _value_initializers, _value_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        group_no = __runInitializers(this, _group_no_initializers, void 0);
        field = (__runInitializers(this, _group_no_extraInitializers), __runInitializers(this, _field_initializers, void 0));
        operator = (__runInitializers(this, _field_extraInitializers), __runInitializers(this, _operator_initializers, void 0));
        value = (__runInitializers(this, _operator_extraInitializers), __runInitializers(this, _value_initializers, void 0));
        constructor() {
            __runInitializers(this, _value_extraInitializers);
        }
    };
})();
exports.RuleConditionDto = RuleConditionDto;
/** اقدامات قاعده */
let RuleActionDto = (() => {
    let _action_type_decorators;
    let _action_type_initializers = [];
    let _action_type_extraInitializers = [];
    let _params_decorators;
    let _params_initializers = [];
    let _params_extraInitializers = [];
    return class RuleActionDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _action_type_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsEnum)(exports.RULE_ACTION_TYPES, { each: false })];
            _params_decorators = [(0, class_validator_1.IsOptional)()];
            __esDecorate(null, null, _action_type_decorators, { kind: "field", name: "action_type", static: false, private: false, access: { has: obj => "action_type" in obj, get: obj => obj.action_type, set: (obj, value) => { obj.action_type = value; } }, metadata: _metadata }, _action_type_initializers, _action_type_extraInitializers);
            __esDecorate(null, null, _params_decorators, { kind: "field", name: "params", static: false, private: false, access: { has: obj => "params" in obj, get: obj => obj.params, set: (obj, value) => { obj.params = value; } }, metadata: _metadata }, _params_initializers, _params_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        action_type = __runInitializers(this, _action_type_initializers, void 0);
        params = (__runInitializers(this, _action_type_extraInitializers), __runInitializers(this, _params_initializers, void 0));
        constructor() {
            __runInitializers(this, _params_extraInitializers);
        }
    };
})();
exports.RuleActionDto = RuleActionDto;
/** دامنه تطبيق قاعده */
let RuleScopeDto = (() => {
    let _scope_type_decorators;
    let _scope_type_initializers = [];
    let _scope_type_extraInitializers = [];
    let _scope_id_decorators;
    let _scope_id_initializers = [];
    let _scope_id_extraInitializers = [];
    return class RuleScopeDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _scope_type_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsEnum)(exports.RULE_SCOPE_TYPES, { each: false })];
            _scope_id_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsUUID)('4')];
            __esDecorate(null, null, _scope_type_decorators, { kind: "field", name: "scope_type", static: false, private: false, access: { has: obj => "scope_type" in obj, get: obj => obj.scope_type, set: (obj, value) => { obj.scope_type = value; } }, metadata: _metadata }, _scope_type_initializers, _scope_type_extraInitializers);
            __esDecorate(null, null, _scope_id_decorators, { kind: "field", name: "scope_id", static: false, private: false, access: { has: obj => "scope_id" in obj, get: obj => obj.scope_id, set: (obj, value) => { obj.scope_id = value; } }, metadata: _metadata }, _scope_id_initializers, _scope_id_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        scope_type = __runInitializers(this, _scope_type_initializers, void 0);
        scope_id = (__runInitializers(this, _scope_type_extraInitializers), __runInitializers(this, _scope_id_initializers, void 0));
        constructor() {
            __runInitializers(this, _scope_id_extraInitializers);
        }
    };
})();
exports.RuleScopeDto = RuleScopeDto;
/** دto برای پاسخ قاعده */
class RuleDto {
    id;
    company_id;
    code;
    title;
    entity;
    event;
    effect;
    priority;
    message_fa;
    valid_from;
    valid_to;
    status;
    created_at;
    updated_at;
}
exports.RuleDto = RuleDto;
/** دto برای زنجیره تأیید */
let CreateApprovalChainDto = (() => {
    let _code_decorators;
    let _code_initializers = [];
    let _code_extraInitializers = [];
    let _entity_decorators;
    let _entity_initializers = [];
    let _entity_extraInitializers = [];
    let _status_decorators;
    let _status_initializers = [];
    let _status_extraInitializers = [];
    let _steps_decorators;
    let _steps_initializers = [];
    let _steps_extraInitializers = [];
    return class CreateApprovalChainDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _code_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsString)()];
            _entity_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsString)()];
            _status_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsEnum)(['active', 'inactive'])];
            _steps_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsArray)(), (0, class_validator_1.ValidateNested)({ each: true }), (0, class_transformer_1.Type)(() => ApprovalStepDefDto)];
            __esDecorate(null, null, _code_decorators, { kind: "field", name: "code", static: false, private: false, access: { has: obj => "code" in obj, get: obj => obj.code, set: (obj, value) => { obj.code = value; } }, metadata: _metadata }, _code_initializers, _code_extraInitializers);
            __esDecorate(null, null, _entity_decorators, { kind: "field", name: "entity", static: false, private: false, access: { has: obj => "entity" in obj, get: obj => obj.entity, set: (obj, value) => { obj.entity = value; } }, metadata: _metadata }, _entity_initializers, _entity_extraInitializers);
            __esDecorate(null, null, _status_decorators, { kind: "field", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status, set: (obj, value) => { obj.status = value; } }, metadata: _metadata }, _status_initializers, _status_extraInitializers);
            __esDecorate(null, null, _steps_decorators, { kind: "field", name: "steps", static: false, private: false, access: { has: obj => "steps" in obj, get: obj => obj.steps, set: (obj, value) => { obj.steps = value; } }, metadata: _metadata }, _steps_initializers, _steps_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        code = __runInitializers(this, _code_initializers, void 0);
        entity = (__runInitializers(this, _code_extraInitializers), __runInitializers(this, _entity_initializers, void 0));
        status = (__runInitializers(this, _entity_extraInitializers), __runInitializers(this, _status_initializers, void 0));
        steps = (__runInitializers(this, _status_extraInitializers), __runInitializers(this, _steps_initializers, void 0));
        constructor() {
            __runInitializers(this, _steps_extraInitializers);
        }
    };
})();
exports.CreateApprovalChainDto = CreateApprovalChainDto;
/** تعریف مرحله تأیید */
let ApprovalStepDefDto = (() => {
    let _step_no_decorators;
    let _step_no_initializers = [];
    let _step_no_extraInitializers = [];
    let _approver_role_id_decorators;
    let _approver_role_id_initializers = [];
    let _approver_role_id_extraInitializers = [];
    let _approver_staff_id_decorators;
    let _approver_staff_id_initializers = [];
    let _approver_staff_id_extraInitializers = [];
    let _min_amount_decorators;
    let _min_amount_initializers = [];
    let _min_amount_extraInitializers = [];
    let _max_amount_decorators;
    let _max_amount_initializers = [];
    let _max_amount_extraInitializers = [];
    let _is_mandatory_decorators;
    let _is_mandatory_initializers = [];
    let _is_mandatory_extraInitializers = [];
    return class ApprovalStepDefDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _step_no_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsNumber)(), (0, class_validator_1.Min)(1)];
            _approver_role_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _approver_staff_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _min_amount_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsNumber)(), (0, class_validator_1.Min)(0)];
            _max_amount_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsNumber)(), (0, class_validator_1.Min)(0)];
            _is_mandatory_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsEnum)(['true', 'false'])];
            __esDecorate(null, null, _step_no_decorators, { kind: "field", name: "step_no", static: false, private: false, access: { has: obj => "step_no" in obj, get: obj => obj.step_no, set: (obj, value) => { obj.step_no = value; } }, metadata: _metadata }, _step_no_initializers, _step_no_extraInitializers);
            __esDecorate(null, null, _approver_role_id_decorators, { kind: "field", name: "approver_role_id", static: false, private: false, access: { has: obj => "approver_role_id" in obj, get: obj => obj.approver_role_id, set: (obj, value) => { obj.approver_role_id = value; } }, metadata: _metadata }, _approver_role_id_initializers, _approver_role_id_extraInitializers);
            __esDecorate(null, null, _approver_staff_id_decorators, { kind: "field", name: "approver_staff_id", static: false, private: false, access: { has: obj => "approver_staff_id" in obj, get: obj => obj.approver_staff_id, set: (obj, value) => { obj.approver_staff_id = value; } }, metadata: _metadata }, _approver_staff_id_initializers, _approver_staff_id_extraInitializers);
            __esDecorate(null, null, _min_amount_decorators, { kind: "field", name: "min_amount", static: false, private: false, access: { has: obj => "min_amount" in obj, get: obj => obj.min_amount, set: (obj, value) => { obj.min_amount = value; } }, metadata: _metadata }, _min_amount_initializers, _min_amount_extraInitializers);
            __esDecorate(null, null, _max_amount_decorators, { kind: "field", name: "max_amount", static: false, private: false, access: { has: obj => "max_amount" in obj, get: obj => obj.max_amount, set: (obj, value) => { obj.max_amount = value; } }, metadata: _metadata }, _max_amount_initializers, _max_amount_extraInitializers);
            __esDecorate(null, null, _is_mandatory_decorators, { kind: "field", name: "is_mandatory", static: false, private: false, access: { has: obj => "is_mandatory" in obj, get: obj => obj.is_mandatory, set: (obj, value) => { obj.is_mandatory = value; } }, metadata: _metadata }, _is_mandatory_initializers, _is_mandatory_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        step_no = __runInitializers(this, _step_no_initializers, void 0);
        approver_role_id = (__runInitializers(this, _step_no_extraInitializers), __runInitializers(this, _approver_role_id_initializers, void 0));
        approver_staff_id = (__runInitializers(this, _approver_role_id_extraInitializers), __runInitializers(this, _approver_staff_id_initializers, void 0));
        min_amount = (__runInitializers(this, _approver_staff_id_extraInitializers), __runInitializers(this, _min_amount_initializers, void 0));
        max_amount = (__runInitializers(this, _min_amount_extraInitializers), __runInitializers(this, _max_amount_initializers, void 0));
        is_mandatory = (__runInitializers(this, _max_amount_extraInitializers), __runInitializers(this, _is_mandatory_initializers, void 0));
        constructor() {
            __runInitializers(this, _is_mandatory_extraInitializers);
        }
    };
})();
exports.ApprovalStepDefDto = ApprovalStepDefDto;
/** دto برای درخواست تأیید */
let CreateApprovalRequestDto = (() => {
    let _approval_chain_id_decorators;
    let _approval_chain_id_initializers = [];
    let _approval_chain_id_extraInitializers = [];
    let _entity_type_decorators;
    let _entity_type_initializers = [];
    let _entity_type_extraInitializers = [];
    let _entity_id_decorators;
    let _entity_id_initializers = [];
    let _entity_id_extraInitializers = [];
    let _requested_by_decorators;
    let _requested_by_initializers = [];
    let _requested_by_extraInitializers = [];
    let _amount_decorators;
    let _amount_initializers = [];
    let _amount_extraInitializers = [];
    return class CreateApprovalRequestDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _approval_chain_id_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsUUID)('4')];
            _entity_type_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsString)()];
            _entity_id_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsUUID)('4')];
            _requested_by_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsUUID)('4')];
            _amount_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsNumber)(), (0, class_validator_1.Min)(0)];
            __esDecorate(null, null, _approval_chain_id_decorators, { kind: "field", name: "approval_chain_id", static: false, private: false, access: { has: obj => "approval_chain_id" in obj, get: obj => obj.approval_chain_id, set: (obj, value) => { obj.approval_chain_id = value; } }, metadata: _metadata }, _approval_chain_id_initializers, _approval_chain_id_extraInitializers);
            __esDecorate(null, null, _entity_type_decorators, { kind: "field", name: "entity_type", static: false, private: false, access: { has: obj => "entity_type" in obj, get: obj => obj.entity_type, set: (obj, value) => { obj.entity_type = value; } }, metadata: _metadata }, _entity_type_initializers, _entity_type_extraInitializers);
            __esDecorate(null, null, _entity_id_decorators, { kind: "field", name: "entity_id", static: false, private: false, access: { has: obj => "entity_id" in obj, get: obj => obj.entity_id, set: (obj, value) => { obj.entity_id = value; } }, metadata: _metadata }, _entity_id_initializers, _entity_id_extraInitializers);
            __esDecorate(null, null, _requested_by_decorators, { kind: "field", name: "requested_by", static: false, private: false, access: { has: obj => "requested_by" in obj, get: obj => obj.requested_by, set: (obj, value) => { obj.requested_by = value; } }, metadata: _metadata }, _requested_by_initializers, _requested_by_extraInitializers);
            __esDecorate(null, null, _amount_decorators, { kind: "field", name: "amount", static: false, private: false, access: { has: obj => "amount" in obj, get: obj => obj.amount, set: (obj, value) => { obj.amount = value; } }, metadata: _metadata }, _amount_initializers, _amount_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        approval_chain_id = __runInitializers(this, _approval_chain_id_initializers, void 0);
        entity_type = (__runInitializers(this, _approval_chain_id_extraInitializers), __runInitializers(this, _entity_type_initializers, void 0));
        entity_id = (__runInitializers(this, _entity_type_extraInitializers), __runInitializers(this, _entity_id_initializers, void 0));
        requested_by = (__runInitializers(this, _entity_id_extraInitializers), __runInitializers(this, _requested_by_initializers, void 0));
        amount = (__runInitializers(this, _requested_by_extraInitializers), __runInitializers(this, _amount_initializers, void 0));
        constructor() {
            __runInitializers(this, _amount_extraInitializers);
        }
    };
})();
exports.CreateApprovalRequestDto = CreateApprovalRequestDto;
/** دto برای تصمیم تأییدکننده */
let ApprovalDecisionDto = (() => {
    let _decision_decorators;
    let _decision_initializers = [];
    let _decision_extraInitializers = [];
    let _comment_decorators;
    let _comment_initializers = [];
    let _comment_extraInitializers = [];
    return class ApprovalDecisionDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _decision_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsEnum)(['approved', 'rejected', 'returned'])];
            _comment_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)()];
            __esDecorate(null, null, _decision_decorators, { kind: "field", name: "decision", static: false, private: false, access: { has: obj => "decision" in obj, get: obj => obj.decision, set: (obj, value) => { obj.decision = value; } }, metadata: _metadata }, _decision_initializers, _decision_extraInitializers);
            __esDecorate(null, null, _comment_decorators, { kind: "field", name: "comment", static: false, private: false, access: { has: obj => "comment" in obj, get: obj => obj.comment, set: (obj, value) => { obj.comment = value; } }, metadata: _metadata }, _comment_initializers, _comment_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        decision = __runInitializers(this, _decision_initializers, void 0);
        comment = (__runInitializers(this, _decision_extraInitializers), __runInitializers(this, _comment_initializers, void 0));
        constructor() {
            __runInitializers(this, _comment_extraInitializers);
        }
    };
})();
exports.ApprovalDecisionDto = ApprovalDecisionDto;
/** استثناء */
class ExceptionItemDto {
    id;
    branch_id;
    kind;
    severity;
    entity_type;
    entity_id;
    status;
    created_at;
}
exports.ExceptionItemDto = ExceptionItemDto;
