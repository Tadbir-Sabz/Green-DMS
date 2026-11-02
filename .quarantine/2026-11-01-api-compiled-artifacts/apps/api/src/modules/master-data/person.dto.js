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
exports.ListPersonsQueryDto = exports.UpdatePersonDto = exports.CreatePersonDto = exports.LEGAL_TYPES = void 0;
const mapped_types_1 = require("@nestjs/mapped-types");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
/** مقادیر مجاز legal_type — دقیقاً check قید جدول person (مهاجرت 0004 §۱.۱) */
exports.LEGAL_TYPES = ['natural', 'legal'];
/**
 * POST /api/v1/persons — openapi › schemas.Person
 * کد شخص در شرکت یکتاست (قید uq_person_code) و «نام» بر اساس legal_type
 * الزامی است؛ هر دو قاعده را پیش از رسیدن به دیتابیس می‌سنجیم تا پاسخ 400
 * فارسی و روشن باشد به‌جای خطای check قید (23514).
 */
let CreatePersonDto = (() => {
    let _code_decorators;
    let _code_initializers = [];
    let _code_extraInitializers = [];
    let _legal_type_decorators;
    let _legal_type_initializers = [];
    let _legal_type_extraInitializers = [];
    let _first_name_decorators;
    let _first_name_initializers = [];
    let _first_name_extraInitializers = [];
    let _last_name_decorators;
    let _last_name_initializers = [];
    let _last_name_extraInitializers = [];
    let _legal_name_decorators;
    let _legal_name_initializers = [];
    let _legal_name_extraInitializers = [];
    let _national_id_decorators;
    let _national_id_initializers = [];
    let _national_id_extraInitializers = [];
    let _economic_code_decorators;
    let _economic_code_initializers = [];
    let _economic_code_extraInitializers = [];
    let _is_active_decorators;
    let _is_active_initializers = [];
    let _is_active_extraInitializers = [];
    return class CreatePersonDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _code_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)(), (0, class_validator_1.MaxLength)(64)];
            _legal_type_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsIn)(exports.LEGAL_TYPES)];
            _first_name_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.MaxLength)(128)];
            _last_name_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.MaxLength)(128)];
            _legal_name_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.MaxLength)(255)];
            _national_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.MaxLength)(10)];
            _economic_code_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.MaxLength)(20)];
            _is_active_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsBoolean)()];
            __esDecorate(null, null, _code_decorators, { kind: "field", name: "code", static: false, private: false, access: { has: obj => "code" in obj, get: obj => obj.code, set: (obj, value) => { obj.code = value; } }, metadata: _metadata }, _code_initializers, _code_extraInitializers);
            __esDecorate(null, null, _legal_type_decorators, { kind: "field", name: "legal_type", static: false, private: false, access: { has: obj => "legal_type" in obj, get: obj => obj.legal_type, set: (obj, value) => { obj.legal_type = value; } }, metadata: _metadata }, _legal_type_initializers, _legal_type_extraInitializers);
            __esDecorate(null, null, _first_name_decorators, { kind: "field", name: "first_name", static: false, private: false, access: { has: obj => "first_name" in obj, get: obj => obj.first_name, set: (obj, value) => { obj.first_name = value; } }, metadata: _metadata }, _first_name_initializers, _first_name_extraInitializers);
            __esDecorate(null, null, _last_name_decorators, { kind: "field", name: "last_name", static: false, private: false, access: { has: obj => "last_name" in obj, get: obj => obj.last_name, set: (obj, value) => { obj.last_name = value; } }, metadata: _metadata }, _last_name_initializers, _last_name_extraInitializers);
            __esDecorate(null, null, _legal_name_decorators, { kind: "field", name: "legal_name", static: false, private: false, access: { has: obj => "legal_name" in obj, get: obj => obj.legal_name, set: (obj, value) => { obj.legal_name = value; } }, metadata: _metadata }, _legal_name_initializers, _legal_name_extraInitializers);
            __esDecorate(null, null, _national_id_decorators, { kind: "field", name: "national_id", static: false, private: false, access: { has: obj => "national_id" in obj, get: obj => obj.national_id, set: (obj, value) => { obj.national_id = value; } }, metadata: _metadata }, _national_id_initializers, _national_id_extraInitializers);
            __esDecorate(null, null, _economic_code_decorators, { kind: "field", name: "economic_code", static: false, private: false, access: { has: obj => "economic_code" in obj, get: obj => obj.economic_code, set: (obj, value) => { obj.economic_code = value; } }, metadata: _metadata }, _economic_code_initializers, _economic_code_extraInitializers);
            __esDecorate(null, null, _is_active_decorators, { kind: "field", name: "is_active", static: false, private: false, access: { has: obj => "is_active" in obj, get: obj => obj.is_active, set: (obj, value) => { obj.is_active = value; } }, metadata: _metadata }, _is_active_initializers, _is_active_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        code = __runInitializers(this, _code_initializers, void 0);
        legal_type = (__runInitializers(this, _code_extraInitializers), __runInitializers(this, _legal_type_initializers, void 0));
        first_name = (__runInitializers(this, _legal_type_extraInitializers), __runInitializers(this, _first_name_initializers, void 0));
        last_name = (__runInitializers(this, _first_name_extraInitializers), __runInitializers(this, _last_name_initializers, void 0));
        /** فقط برای شخص حقوقی (legal) */
        legal_name = (__runInitializers(this, _last_name_extraInitializers), __runInitializers(this, _legal_name_initializers, void 0));
        national_id = (__runInitializers(this, _legal_name_extraInitializers), __runInitializers(this, _national_id_initializers, void 0));
        economic_code = (__runInitializers(this, _national_id_extraInitializers), __runInitializers(this, _economic_code_initializers, void 0));
        is_active = (__runInitializers(this, _economic_code_extraInitializers), __runInitializers(this, _is_active_initializers, void 0));
        constructor() {
            __runInitializers(this, _is_active_extraInitializers);
        }
    };
})();
exports.CreatePersonDto = CreatePersonDto;
/** PATCH /api/v1/persons/{id} — همه فیلدها اختیاری (is_active غیرفعال‌سازی منطقی) */
class UpdatePersonDto extends (0, mapped_types_1.PartialType)(CreatePersonDto) {
}
exports.UpdatePersonDto = UpdatePersonDto;
/** GET /api/v1/persons — جست‌وجوی فازی + فیلتر نوع شخص + صفحه‌بندی cursor */
let ListPersonsQueryDto = (() => {
    let _q_decorators;
    let _q_initializers = [];
    let _q_extraInitializers = [];
    let _legal_type_decorators;
    let _legal_type_initializers = [];
    let _legal_type_extraInitializers = [];
    let _cursor_decorators;
    let _cursor_initializers = [];
    let _cursor_extraInitializers = [];
    let _limit_decorators;
    let _limit_initializers = [];
    let _limit_extraInitializers = [];
    return class ListPersonsQueryDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _q_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.MaxLength)(128)];
            _legal_type_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsIn)(exports.LEGAL_TYPES)];
            _cursor_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)()];
            _limit_decorators = [(0, class_validator_1.IsOptional)(), (0, class_transformer_1.Type)(() => Number), (0, class_validator_1.IsInt)(), (0, class_validator_1.Min)(1), (0, class_validator_1.Max)(200)];
            __esDecorate(null, null, _q_decorators, { kind: "field", name: "q", static: false, private: false, access: { has: obj => "q" in obj, get: obj => obj.q, set: (obj, value) => { obj.q = value; } }, metadata: _metadata }, _q_initializers, _q_extraInitializers);
            __esDecorate(null, null, _legal_type_decorators, { kind: "field", name: "legal_type", static: false, private: false, access: { has: obj => "legal_type" in obj, get: obj => obj.legal_type, set: (obj, value) => { obj.legal_type = value; } }, metadata: _metadata }, _legal_type_initializers, _legal_type_extraInitializers);
            __esDecorate(null, null, _cursor_decorators, { kind: "field", name: "cursor", static: false, private: false, access: { has: obj => "cursor" in obj, get: obj => obj.cursor, set: (obj, value) => { obj.cursor = value; } }, metadata: _metadata }, _cursor_initializers, _cursor_extraInitializers);
            __esDecorate(null, null, _limit_decorators, { kind: "field", name: "limit", static: false, private: false, access: { has: obj => "limit" in obj, get: obj => obj.limit, set: (obj, value) => { obj.limit = value; } }, metadata: _metadata }, _limit_initializers, _limit_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        /** جست‌وجوی فازی روی کد/نام/نام حقوقی/شناسه ملی */
        q = __runInitializers(this, _q_initializers, void 0);
        legal_type = (__runInitializers(this, _q_extraInitializers), __runInitializers(this, _legal_type_initializers, void 0));
        cursor = (__runInitializers(this, _legal_type_extraInitializers), __runInitializers(this, _cursor_initializers, void 0));
        limit = (__runInitializers(this, _cursor_extraInitializers), __runInitializers(this, _limit_initializers, 50));
        constructor() {
            __runInitializers(this, _limit_extraInitializers);
        }
    };
})();
exports.ListPersonsQueryDto = ListPersonsQueryDto;
