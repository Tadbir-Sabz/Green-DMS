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
exports.UpdateRouteDto = exports.CreateRouteDto = exports.ListRoutesQueryDto = exports.UpdateAreaDto = exports.CreateAreaDto = exports.ListAreasQueryDto = void 0;
const mapped_types_1 = require("@nestjs/mapped-types");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
/** @IsOptional مقدار null را هم می‌پذیرد (فیلدهای nullableِ قرارداد مانند parent_area_id و visit_weekday) */
// ---------------- حوزه فروش (/areas) ----------------
let ListAreasQueryDto = (() => {
    let _cursor_decorators;
    let _cursor_initializers = [];
    let _cursor_extraInitializers = [];
    let _limit_decorators;
    let _limit_initializers = [];
    let _limit_extraInitializers = [];
    let _parent_area_id_decorators;
    let _parent_area_id_initializers = [];
    let _parent_area_id_extraInitializers = [];
    return class ListAreasQueryDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _cursor_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.MaxLength)(256)];
            _limit_decorators = [(0, class_validator_1.IsOptional)(), (0, class_transformer_1.Type)(() => Number), (0, class_validator_1.IsInt)(), (0, class_validator_1.Min)(1), (0, class_validator_1.Max)(200)];
            _parent_area_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            __esDecorate(null, null, _cursor_decorators, { kind: "field", name: "cursor", static: false, private: false, access: { has: obj => "cursor" in obj, get: obj => obj.cursor, set: (obj, value) => { obj.cursor = value; } }, metadata: _metadata }, _cursor_initializers, _cursor_extraInitializers);
            __esDecorate(null, null, _limit_decorators, { kind: "field", name: "limit", static: false, private: false, access: { has: obj => "limit" in obj, get: obj => obj.limit, set: (obj, value) => { obj.limit = value; } }, metadata: _metadata }, _limit_initializers, _limit_extraInitializers);
            __esDecorate(null, null, _parent_area_id_decorators, { kind: "field", name: "parent_area_id", static: false, private: false, access: { has: obj => "parent_area_id" in obj, get: obj => obj.parent_area_id, set: (obj, value) => { obj.parent_area_id = value; } }, metadata: _metadata }, _parent_area_id_initializers, _parent_area_id_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        cursor = __runInitializers(this, _cursor_initializers, void 0);
        limit = (__runInitializers(this, _cursor_extraInitializers), __runInitializers(this, _limit_initializers, 50));
        parent_area_id = (__runInitializers(this, _limit_extraInitializers), __runInitializers(this, _parent_area_id_initializers, void 0));
        constructor() {
            __runInitializers(this, _parent_area_id_extraInitializers);
        }
    };
})();
exports.ListAreasQueryDto = ListAreasQueryDto;
/** openapi › schemas.Area — code و name طبق قرارداد الزامی‌اند */
let CreateAreaDto = (() => {
    let _code_decorators;
    let _code_initializers = [];
    let _code_extraInitializers = [];
    let _name_decorators;
    let _name_initializers = [];
    let _name_extraInitializers = [];
    let _branch_id_decorators;
    let _branch_id_initializers = [];
    let _branch_id_extraInitializers = [];
    let _parent_area_id_decorators;
    let _parent_area_id_initializers = [];
    let _parent_area_id_extraInitializers = [];
    let _is_active_decorators;
    let _is_active_initializers = [];
    let _is_active_extraInitializers = [];
    return class CreateAreaDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _code_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)(), (0, class_validator_1.MaxLength)(50)];
            _name_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)(), (0, class_validator_1.MaxLength)(200)];
            _branch_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _parent_area_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _is_active_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsBoolean)()];
            __esDecorate(null, null, _code_decorators, { kind: "field", name: "code", static: false, private: false, access: { has: obj => "code" in obj, get: obj => obj.code, set: (obj, value) => { obj.code = value; } }, metadata: _metadata }, _code_initializers, _code_extraInitializers);
            __esDecorate(null, null, _name_decorators, { kind: "field", name: "name", static: false, private: false, access: { has: obj => "name" in obj, get: obj => obj.name, set: (obj, value) => { obj.name = value; } }, metadata: _metadata }, _name_initializers, _name_extraInitializers);
            __esDecorate(null, null, _branch_id_decorators, { kind: "field", name: "branch_id", static: false, private: false, access: { has: obj => "branch_id" in obj, get: obj => obj.branch_id, set: (obj, value) => { obj.branch_id = value; } }, metadata: _metadata }, _branch_id_initializers, _branch_id_extraInitializers);
            __esDecorate(null, null, _parent_area_id_decorators, { kind: "field", name: "parent_area_id", static: false, private: false, access: { has: obj => "parent_area_id" in obj, get: obj => obj.parent_area_id, set: (obj, value) => { obj.parent_area_id = value; } }, metadata: _metadata }, _parent_area_id_initializers, _parent_area_id_extraInitializers);
            __esDecorate(null, null, _is_active_decorators, { kind: "field", name: "is_active", static: false, private: false, access: { has: obj => "is_active" in obj, get: obj => obj.is_active, set: (obj, value) => { obj.is_active = value; } }, metadata: _metadata }, _is_active_initializers, _is_active_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        code = __runInitializers(this, _code_initializers, void 0);
        name = (__runInitializers(this, _code_extraInitializers), __runInitializers(this, _name_initializers, void 0));
        /** شعبهٔ مالک حوزه؛ اگر نیاید شعبهٔ پیش‌فرض شرکت گرفته می‌شود */
        branch_id = (__runInitializers(this, _name_extraInitializers), __runInitializers(this, _branch_id_initializers, void 0));
        parent_area_id = (__runInitializers(this, _branch_id_extraInitializers), __runInitializers(this, _parent_area_id_initializers, void 0));
        is_active = (__runInitializers(this, _parent_area_id_extraInitializers), __runInitializers(this, _is_active_initializers, void 0));
        constructor() {
            __runInitializers(this, _is_active_extraInitializers);
        }
    };
})();
exports.CreateAreaDto = CreateAreaDto;
class UpdateAreaDto extends (0, mapped_types_1.PartialType)(CreateAreaDto) {
}
exports.UpdateAreaDto = UpdateAreaDto;
// ---------------- مسیر فروش (/routes) ----------------
let ListRoutesQueryDto = (() => {
    let _cursor_decorators;
    let _cursor_initializers = [];
    let _cursor_extraInitializers = [];
    let _limit_decorators;
    let _limit_initializers = [];
    let _limit_extraInitializers = [];
    let _area_id_decorators;
    let _area_id_initializers = [];
    let _area_id_extraInitializers = [];
    return class ListRoutesQueryDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _cursor_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.MaxLength)(256)];
            _limit_decorators = [(0, class_validator_1.IsOptional)(), (0, class_transformer_1.Type)(() => Number), (0, class_validator_1.IsInt)(), (0, class_validator_1.Min)(1), (0, class_validator_1.Max)(200)];
            _area_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            __esDecorate(null, null, _cursor_decorators, { kind: "field", name: "cursor", static: false, private: false, access: { has: obj => "cursor" in obj, get: obj => obj.cursor, set: (obj, value) => { obj.cursor = value; } }, metadata: _metadata }, _cursor_initializers, _cursor_extraInitializers);
            __esDecorate(null, null, _limit_decorators, { kind: "field", name: "limit", static: false, private: false, access: { has: obj => "limit" in obj, get: obj => obj.limit, set: (obj, value) => { obj.limit = value; } }, metadata: _metadata }, _limit_initializers, _limit_extraInitializers);
            __esDecorate(null, null, _area_id_decorators, { kind: "field", name: "area_id", static: false, private: false, access: { has: obj => "area_id" in obj, get: obj => obj.area_id, set: (obj, value) => { obj.area_id = value; } }, metadata: _metadata }, _area_id_initializers, _area_id_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        cursor = __runInitializers(this, _cursor_initializers, void 0);
        limit = (__runInitializers(this, _cursor_extraInitializers), __runInitializers(this, _limit_initializers, 50));
        area_id = (__runInitializers(this, _limit_extraInitializers), __runInitializers(this, _area_id_initializers, void 0));
        constructor() {
            __runInitializers(this, _area_id_extraInitializers);
        }
    };
})();
exports.ListRoutesQueryDto = ListRoutesQueryDto;
/** openapi › schemas.Route — area_id، code و name طبق قرارداد الزامی‌اند */
let CreateRouteDto = (() => {
    let _area_id_decorators;
    let _area_id_initializers = [];
    let _area_id_extraInitializers = [];
    let _code_decorators;
    let _code_initializers = [];
    let _code_extraInitializers = [];
    let _name_decorators;
    let _name_initializers = [];
    let _name_extraInitializers = [];
    let _visit_weekday_decorators;
    let _visit_weekday_initializers = [];
    let _visit_weekday_extraInitializers = [];
    let _is_active_decorators;
    let _is_active_initializers = [];
    let _is_active_extraInitializers = [];
    let _customer_ids_decorators;
    let _customer_ids_initializers = [];
    let _customer_ids_extraInitializers = [];
    return class CreateRouteDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _area_id_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsUUID)('4')];
            _code_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)(), (0, class_validator_1.MaxLength)(50)];
            _name_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)(), (0, class_validator_1.MaxLength)(200)];
            _visit_weekday_decorators = [(0, class_validator_1.IsOptional)(), (0, class_transformer_1.Type)(() => Number), (0, class_validator_1.IsInt)(), (0, class_validator_1.Min)(0), (0, class_validator_1.Max)(6)];
            _is_active_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsBoolean)()];
            _customer_ids_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsArray)(), (0, class_validator_1.IsUUID)('4', { each: true })];
            __esDecorate(null, null, _area_id_decorators, { kind: "field", name: "area_id", static: false, private: false, access: { has: obj => "area_id" in obj, get: obj => obj.area_id, set: (obj, value) => { obj.area_id = value; } }, metadata: _metadata }, _area_id_initializers, _area_id_extraInitializers);
            __esDecorate(null, null, _code_decorators, { kind: "field", name: "code", static: false, private: false, access: { has: obj => "code" in obj, get: obj => obj.code, set: (obj, value) => { obj.code = value; } }, metadata: _metadata }, _code_initializers, _code_extraInitializers);
            __esDecorate(null, null, _name_decorators, { kind: "field", name: "name", static: false, private: false, access: { has: obj => "name" in obj, get: obj => obj.name, set: (obj, value) => { obj.name = value; } }, metadata: _metadata }, _name_initializers, _name_extraInitializers);
            __esDecorate(null, null, _visit_weekday_decorators, { kind: "field", name: "visit_weekday", static: false, private: false, access: { has: obj => "visit_weekday" in obj, get: obj => obj.visit_weekday, set: (obj, value) => { obj.visit_weekday = value; } }, metadata: _metadata }, _visit_weekday_initializers, _visit_weekday_extraInitializers);
            __esDecorate(null, null, _is_active_decorators, { kind: "field", name: "is_active", static: false, private: false, access: { has: obj => "is_active" in obj, get: obj => obj.is_active, set: (obj, value) => { obj.is_active = value; } }, metadata: _metadata }, _is_active_initializers, _is_active_extraInitializers);
            __esDecorate(null, null, _customer_ids_decorators, { kind: "field", name: "customer_ids", static: false, private: false, access: { has: obj => "customer_ids" in obj, get: obj => obj.customer_ids, set: (obj, value) => { obj.customer_ids = value; } }, metadata: _metadata }, _customer_ids_initializers, _customer_ids_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        area_id = __runInitializers(this, _area_id_initializers, void 0);
        code = (__runInitializers(this, _area_id_extraInitializers), __runInitializers(this, _code_initializers, void 0));
        name = (__runInitializers(this, _code_extraInitializers), __runInitializers(this, _name_initializers, void 0));
        /** روز بازدید هفتگی — ۰=شنبه … ۵=جمعه (nullable در قرارداد) */
        visit_weekday = (__runInitializers(this, _name_extraInitializers), __runInitializers(this, _visit_weekday_initializers, void 0));
        is_active = (__runInitializers(this, _visit_weekday_extraInitializers), __runInitializers(this, _is_active_initializers, void 0));
        /** ترتیب مشتریان در مسیر (ترتیب آرایه = ترتیب بازدید) */
        customer_ids = (__runInitializers(this, _is_active_extraInitializers), __runInitializers(this, _customer_ids_initializers, void 0));
        constructor() {
            __runInitializers(this, _customer_ids_extraInitializers);
        }
    };
})();
exports.CreateRouteDto = CreateRouteDto;
class UpdateRouteDto extends (0, mapped_types_1.PartialType)(CreateRouteDto) {
}
exports.UpdateRouteDto = UpdateRouteDto;
