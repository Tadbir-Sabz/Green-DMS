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
exports.ListWarehousesQueryDto = exports.UpdateWarehouseDto = exports.CreateWarehouseDto = exports.WAREHOUSE_KINDS = void 0;
const mapped_types_1 = require("@nestjs/mapped-types");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
/** مقادیر مجاز kind — دقیقاً check قید جدول warehouse (مهاجرت 0008) */
exports.WAREHOUSE_KINDS = [
    'main',
    'vehicle',
    'transit',
    'damaged',
    'quarantine',
    'consignment',
];
/** پارامتر query بولینی openapi («true»/«false») را به boolean تبدیل می‌کند */
const toBoolean = ({ value }) => {
    if (value === 'true' || value === true)
        return true;
    if (value === 'false' || value === false)
        return false;
    return value;
};
/**
 * POST /api/v1/warehouses — openapi › schemas.Warehouse
 * code/name/kind الزامی‌اند؛ branch_id اختیاری است و شعبه پیش‌فرض شرکت گرفته می‌شود.
 * قید ck_warehouse_vehicle: «kind=vehicle ⟺ vehicle_id مقدار دارد» (در سرویس سنجیده می‌شود).
 */
let CreateWarehouseDto = (() => {
    let _branch_id_decorators;
    let _branch_id_initializers = [];
    let _branch_id_extraInitializers = [];
    let _code_decorators;
    let _code_initializers = [];
    let _code_extraInitializers = [];
    let _name_decorators;
    let _name_initializers = [];
    let _name_extraInitializers = [];
    let _kind_decorators;
    let _kind_initializers = [];
    let _kind_extraInitializers = [];
    let _parent_warehouse_id_decorators;
    let _parent_warehouse_id_initializers = [];
    let _parent_warehouse_id_extraInitializers = [];
    let _vehicle_id_decorators;
    let _vehicle_id_initializers = [];
    let _vehicle_id_extraInitializers = [];
    let _area_id_decorators;
    let _area_id_initializers = [];
    let _area_id_extraInitializers = [];
    let _allow_negative_decorators;
    let _allow_negative_initializers = [];
    let _allow_negative_extraInitializers = [];
    let _is_active_decorators;
    let _is_active_initializers = [];
    let _is_active_extraInitializers = [];
    return class CreateWarehouseDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _branch_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _code_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)(), (0, class_validator_1.MaxLength)(64)];
            _name_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)(), (0, class_validator_1.MaxLength)(128)];
            _kind_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsIn)(exports.WAREHOUSE_KINDS)];
            _parent_warehouse_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _vehicle_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _area_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _allow_negative_decorators = [(0, class_validator_1.IsOptional)(), (0, class_transformer_1.Transform)(toBoolean), (0, class_validator_1.IsBoolean)()];
            _is_active_decorators = [(0, class_validator_1.IsOptional)(), (0, class_transformer_1.Transform)(toBoolean), (0, class_validator_1.IsBoolean)()];
            __esDecorate(null, null, _branch_id_decorators, { kind: "field", name: "branch_id", static: false, private: false, access: { has: obj => "branch_id" in obj, get: obj => obj.branch_id, set: (obj, value) => { obj.branch_id = value; } }, metadata: _metadata }, _branch_id_initializers, _branch_id_extraInitializers);
            __esDecorate(null, null, _code_decorators, { kind: "field", name: "code", static: false, private: false, access: { has: obj => "code" in obj, get: obj => obj.code, set: (obj, value) => { obj.code = value; } }, metadata: _metadata }, _code_initializers, _code_extraInitializers);
            __esDecorate(null, null, _name_decorators, { kind: "field", name: "name", static: false, private: false, access: { has: obj => "name" in obj, get: obj => obj.name, set: (obj, value) => { obj.name = value; } }, metadata: _metadata }, _name_initializers, _name_extraInitializers);
            __esDecorate(null, null, _kind_decorators, { kind: "field", name: "kind", static: false, private: false, access: { has: obj => "kind" in obj, get: obj => obj.kind, set: (obj, value) => { obj.kind = value; } }, metadata: _metadata }, _kind_initializers, _kind_extraInitializers);
            __esDecorate(null, null, _parent_warehouse_id_decorators, { kind: "field", name: "parent_warehouse_id", static: false, private: false, access: { has: obj => "parent_warehouse_id" in obj, get: obj => obj.parent_warehouse_id, set: (obj, value) => { obj.parent_warehouse_id = value; } }, metadata: _metadata }, _parent_warehouse_id_initializers, _parent_warehouse_id_extraInitializers);
            __esDecorate(null, null, _vehicle_id_decorators, { kind: "field", name: "vehicle_id", static: false, private: false, access: { has: obj => "vehicle_id" in obj, get: obj => obj.vehicle_id, set: (obj, value) => { obj.vehicle_id = value; } }, metadata: _metadata }, _vehicle_id_initializers, _vehicle_id_extraInitializers);
            __esDecorate(null, null, _area_id_decorators, { kind: "field", name: "area_id", static: false, private: false, access: { has: obj => "area_id" in obj, get: obj => obj.area_id, set: (obj, value) => { obj.area_id = value; } }, metadata: _metadata }, _area_id_initializers, _area_id_extraInitializers);
            __esDecorate(null, null, _allow_negative_decorators, { kind: "field", name: "allow_negative", static: false, private: false, access: { has: obj => "allow_negative" in obj, get: obj => obj.allow_negative, set: (obj, value) => { obj.allow_negative = value; } }, metadata: _metadata }, _allow_negative_initializers, _allow_negative_extraInitializers);
            __esDecorate(null, null, _is_active_decorators, { kind: "field", name: "is_active", static: false, private: false, access: { has: obj => "is_active" in obj, get: obj => obj.is_active, set: (obj, value) => { obj.is_active = value; } }, metadata: _metadata }, _is_active_initializers, _is_active_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        branch_id = __runInitializers(this, _branch_id_initializers, void 0);
        code = (__runInitializers(this, _branch_id_extraInitializers), __runInitializers(this, _code_initializers, void 0));
        name = (__runInitializers(this, _code_extraInitializers), __runInitializers(this, _name_initializers, void 0));
        kind = (__runInitializers(this, _name_extraInitializers), __runInitializers(this, _kind_initializers, void 0));
        parent_warehouse_id = (__runInitializers(this, _kind_extraInitializers), __runInitializers(this, _parent_warehouse_id_initializers, void 0));
        vehicle_id = (__runInitializers(this, _parent_warehouse_id_extraInitializers), __runInitializers(this, _vehicle_id_initializers, void 0));
        area_id = (__runInitializers(this, _vehicle_id_extraInitializers), __runInitializers(this, _area_id_initializers, void 0));
        allow_negative = (__runInitializers(this, _area_id_extraInitializers), __runInitializers(this, _allow_negative_initializers, void 0));
        is_active = (__runInitializers(this, _allow_negative_extraInitializers), __runInitializers(this, _is_active_initializers, void 0));
        constructor() {
            __runInitializers(this, _is_active_extraInitializers);
        }
    };
})();
exports.CreateWarehouseDto = CreateWarehouseDto;
/** PATCH /api/v1/warehouses/{id} — همه فیلدها اختیاری */
class UpdateWarehouseDto extends (0, mapped_types_1.PartialType)(CreateWarehouseDto) {
}
exports.UpdateWarehouseDto = UpdateWarehouseDto;
/** GET /api/v1/warehouses — فیلتر kind/شعبه + صفحه‌بندی cursor */
let ListWarehousesQueryDto = (() => {
    let _kind_decorators;
    let _kind_initializers = [];
    let _kind_extraInitializers = [];
    let _branch_id_decorators;
    let _branch_id_initializers = [];
    let _branch_id_extraInitializers = [];
    let _cursor_decorators;
    let _cursor_initializers = [];
    let _cursor_extraInitializers = [];
    let _limit_decorators;
    let _limit_initializers = [];
    let _limit_extraInitializers = [];
    return class ListWarehousesQueryDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _kind_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsIn)(exports.WAREHOUSE_KINDS)];
            _branch_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _cursor_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.MaxLength)(256)];
            _limit_decorators = [(0, class_validator_1.IsOptional)(), (0, class_transformer_1.Type)(() => Number), (0, class_validator_1.IsInt)(), (0, class_validator_1.Min)(1), (0, class_validator_1.Max)(200)];
            __esDecorate(null, null, _kind_decorators, { kind: "field", name: "kind", static: false, private: false, access: { has: obj => "kind" in obj, get: obj => obj.kind, set: (obj, value) => { obj.kind = value; } }, metadata: _metadata }, _kind_initializers, _kind_extraInitializers);
            __esDecorate(null, null, _branch_id_decorators, { kind: "field", name: "branch_id", static: false, private: false, access: { has: obj => "branch_id" in obj, get: obj => obj.branch_id, set: (obj, value) => { obj.branch_id = value; } }, metadata: _metadata }, _branch_id_initializers, _branch_id_extraInitializers);
            __esDecorate(null, null, _cursor_decorators, { kind: "field", name: "cursor", static: false, private: false, access: { has: obj => "cursor" in obj, get: obj => obj.cursor, set: (obj, value) => { obj.cursor = value; } }, metadata: _metadata }, _cursor_initializers, _cursor_extraInitializers);
            __esDecorate(null, null, _limit_decorators, { kind: "field", name: "limit", static: false, private: false, access: { has: obj => "limit" in obj, get: obj => obj.limit, set: (obj, value) => { obj.limit = value; } }, metadata: _metadata }, _limit_initializers, _limit_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        kind = __runInitializers(this, _kind_initializers, void 0);
        branch_id = (__runInitializers(this, _kind_extraInitializers), __runInitializers(this, _branch_id_initializers, void 0));
        cursor = (__runInitializers(this, _branch_id_extraInitializers), __runInitializers(this, _cursor_initializers, void 0));
        limit = (__runInitializers(this, _cursor_extraInitializers), __runInitializers(this, _limit_initializers, 50));
        constructor() {
            __runInitializers(this, _limit_extraInitializers);
        }
    };
})();
exports.ListWarehousesQueryDto = ListWarehousesQueryDto;
