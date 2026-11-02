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
exports.ListProductsQueryDto = exports.UpdateProductDto = exports.CreateProductDto = exports.DISTRIBUTION_KINDS = exports.PRODUCT_STATUSES = void 0;
const mapped_types_1 = require("@nestjs/mapped-types");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
/** وضعیت‌های مجاز product (check: product_status_check) */
exports.PRODUCT_STATUSES = ['active', 'blocked', 'discontinued'];
/** نوع توزیع مجاز (check: product_distribution_kind_check) */
exports.DISTRIBUTION_KINDS = ['cold', 'warm', 'both'];
/** POST /api/v1/products — فیلدهای نوشتنی (فیلدهای readOnly سرور تولید می‌کند) */
let CreateProductDto = (() => {
    let _code_decorators;
    let _code_initializers = [];
    let _code_extraInitializers = [];
    let _name_decorators;
    let _name_initializers = [];
    let _name_extraInitializers = [];
    let _category_id_decorators;
    let _category_id_initializers = [];
    let _category_id_extraInitializers = [];
    let _base_uom_id_decorators;
    let _base_uom_id_initializers = [];
    let _base_uom_id_extraInitializers = [];
    let _brand_id_decorators;
    let _brand_id_initializers = [];
    let _brand_id_extraInitializers = [];
    let _tax_code_id_decorators;
    let _tax_code_id_initializers = [];
    let _tax_code_id_extraInitializers = [];
    let _is_batch_tracked_decorators;
    let _is_batch_tracked_initializers = [];
    let _is_batch_tracked_extraInitializers = [];
    let _is_expiry_tracked_decorators;
    let _is_expiry_tracked_initializers = [];
    let _is_expiry_tracked_extraInitializers = [];
    let _is_returnable_container_decorators;
    let _is_returnable_container_initializers = [];
    let _is_returnable_container_extraInitializers = [];
    let _requires_permit_decorators;
    let _requires_permit_initializers = [];
    let _requires_permit_extraInitializers = [];
    let _shelf_life_days_decorators;
    let _shelf_life_days_initializers = [];
    let _shelf_life_days_extraInitializers = [];
    let _distribution_kind_decorators;
    let _distribution_kind_initializers = [];
    let _distribution_kind_extraInitializers = [];
    let _min_order_qty_decorators;
    let _min_order_qty_initializers = [];
    let _min_order_qty_extraInitializers = [];
    let _weight_gr_decorators;
    let _weight_gr_initializers = [];
    let _weight_gr_extraInitializers = [];
    let _volume_cm3_decorators;
    let _volume_cm3_initializers = [];
    let _volume_cm3_extraInitializers = [];
    return class CreateProductDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _code_decorators = [(0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)(), (0, class_validator_1.MaxLength)(64)];
            _name_decorators = [(0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)(), (0, class_validator_1.MaxLength)(255)];
            _category_id_decorators = [(0, class_validator_1.IsUUID)()];
            _base_uom_id_decorators = [(0, class_validator_1.IsUUID)()];
            _brand_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)()];
            _tax_code_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)()];
            _is_batch_tracked_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsBoolean)()];
            _is_expiry_tracked_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsBoolean)()];
            _is_returnable_container_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsBoolean)()];
            _requires_permit_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsBoolean)()];
            _shelf_life_days_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsInt)(), (0, class_validator_1.Min)(1)];
            _distribution_kind_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsIn)(exports.DISTRIBUTION_KINDS)];
            _min_order_qty_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsNumber)(), (0, class_validator_1.Min)(0)];
            _weight_gr_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsInt)(), (0, class_validator_1.Min)(0)];
            _volume_cm3_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsInt)(), (0, class_validator_1.Min)(0)];
            __esDecorate(null, null, _code_decorators, { kind: "field", name: "code", static: false, private: false, access: { has: obj => "code" in obj, get: obj => obj.code, set: (obj, value) => { obj.code = value; } }, metadata: _metadata }, _code_initializers, _code_extraInitializers);
            __esDecorate(null, null, _name_decorators, { kind: "field", name: "name", static: false, private: false, access: { has: obj => "name" in obj, get: obj => obj.name, set: (obj, value) => { obj.name = value; } }, metadata: _metadata }, _name_initializers, _name_extraInitializers);
            __esDecorate(null, null, _category_id_decorators, { kind: "field", name: "category_id", static: false, private: false, access: { has: obj => "category_id" in obj, get: obj => obj.category_id, set: (obj, value) => { obj.category_id = value; } }, metadata: _metadata }, _category_id_initializers, _category_id_extraInitializers);
            __esDecorate(null, null, _base_uom_id_decorators, { kind: "field", name: "base_uom_id", static: false, private: false, access: { has: obj => "base_uom_id" in obj, get: obj => obj.base_uom_id, set: (obj, value) => { obj.base_uom_id = value; } }, metadata: _metadata }, _base_uom_id_initializers, _base_uom_id_extraInitializers);
            __esDecorate(null, null, _brand_id_decorators, { kind: "field", name: "brand_id", static: false, private: false, access: { has: obj => "brand_id" in obj, get: obj => obj.brand_id, set: (obj, value) => { obj.brand_id = value; } }, metadata: _metadata }, _brand_id_initializers, _brand_id_extraInitializers);
            __esDecorate(null, null, _tax_code_id_decorators, { kind: "field", name: "tax_code_id", static: false, private: false, access: { has: obj => "tax_code_id" in obj, get: obj => obj.tax_code_id, set: (obj, value) => { obj.tax_code_id = value; } }, metadata: _metadata }, _tax_code_id_initializers, _tax_code_id_extraInitializers);
            __esDecorate(null, null, _is_batch_tracked_decorators, { kind: "field", name: "is_batch_tracked", static: false, private: false, access: { has: obj => "is_batch_tracked" in obj, get: obj => obj.is_batch_tracked, set: (obj, value) => { obj.is_batch_tracked = value; } }, metadata: _metadata }, _is_batch_tracked_initializers, _is_batch_tracked_extraInitializers);
            __esDecorate(null, null, _is_expiry_tracked_decorators, { kind: "field", name: "is_expiry_tracked", static: false, private: false, access: { has: obj => "is_expiry_tracked" in obj, get: obj => obj.is_expiry_tracked, set: (obj, value) => { obj.is_expiry_tracked = value; } }, metadata: _metadata }, _is_expiry_tracked_initializers, _is_expiry_tracked_extraInitializers);
            __esDecorate(null, null, _is_returnable_container_decorators, { kind: "field", name: "is_returnable_container", static: false, private: false, access: { has: obj => "is_returnable_container" in obj, get: obj => obj.is_returnable_container, set: (obj, value) => { obj.is_returnable_container = value; } }, metadata: _metadata }, _is_returnable_container_initializers, _is_returnable_container_extraInitializers);
            __esDecorate(null, null, _requires_permit_decorators, { kind: "field", name: "requires_permit", static: false, private: false, access: { has: obj => "requires_permit" in obj, get: obj => obj.requires_permit, set: (obj, value) => { obj.requires_permit = value; } }, metadata: _metadata }, _requires_permit_initializers, _requires_permit_extraInitializers);
            __esDecorate(null, null, _shelf_life_days_decorators, { kind: "field", name: "shelf_life_days", static: false, private: false, access: { has: obj => "shelf_life_days" in obj, get: obj => obj.shelf_life_days, set: (obj, value) => { obj.shelf_life_days = value; } }, metadata: _metadata }, _shelf_life_days_initializers, _shelf_life_days_extraInitializers);
            __esDecorate(null, null, _distribution_kind_decorators, { kind: "field", name: "distribution_kind", static: false, private: false, access: { has: obj => "distribution_kind" in obj, get: obj => obj.distribution_kind, set: (obj, value) => { obj.distribution_kind = value; } }, metadata: _metadata }, _distribution_kind_initializers, _distribution_kind_extraInitializers);
            __esDecorate(null, null, _min_order_qty_decorators, { kind: "field", name: "min_order_qty", static: false, private: false, access: { has: obj => "min_order_qty" in obj, get: obj => obj.min_order_qty, set: (obj, value) => { obj.min_order_qty = value; } }, metadata: _metadata }, _min_order_qty_initializers, _min_order_qty_extraInitializers);
            __esDecorate(null, null, _weight_gr_decorators, { kind: "field", name: "weight_gr", static: false, private: false, access: { has: obj => "weight_gr" in obj, get: obj => obj.weight_gr, set: (obj, value) => { obj.weight_gr = value; } }, metadata: _metadata }, _weight_gr_initializers, _weight_gr_extraInitializers);
            __esDecorate(null, null, _volume_cm3_decorators, { kind: "field", name: "volume_cm3", static: false, private: false, access: { has: obj => "volume_cm3" in obj, get: obj => obj.volume_cm3, set: (obj, value) => { obj.volume_cm3 = value; } }, metadata: _metadata }, _volume_cm3_initializers, _volume_cm3_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        code = __runInitializers(this, _code_initializers, void 0);
        name = (__runInitializers(this, _code_extraInitializers), __runInitializers(this, _name_initializers, void 0));
        category_id = (__runInitializers(this, _name_extraInitializers), __runInitializers(this, _category_id_initializers, void 0));
        base_uom_id = (__runInitializers(this, _category_id_extraInitializers), __runInitializers(this, _base_uom_id_initializers, void 0));
        brand_id = (__runInitializers(this, _base_uom_id_extraInitializers), __runInitializers(this, _brand_id_initializers, void 0));
        tax_code_id = (__runInitializers(this, _brand_id_extraInitializers), __runInitializers(this, _tax_code_id_initializers, void 0));
        is_batch_tracked = (__runInitializers(this, _tax_code_id_extraInitializers), __runInitializers(this, _is_batch_tracked_initializers, void 0));
        is_expiry_tracked = (__runInitializers(this, _is_batch_tracked_extraInitializers), __runInitializers(this, _is_expiry_tracked_initializers, void 0));
        is_returnable_container = (__runInitializers(this, _is_expiry_tracked_extraInitializers), __runInitializers(this, _is_returnable_container_initializers, void 0));
        requires_permit = (__runInitializers(this, _is_returnable_container_extraInitializers), __runInitializers(this, _requires_permit_initializers, void 0));
        /** فقط برای کالای انقضادار (قید ck_product_batch را خودِ دیتابیس هم می‌گیرد) */
        shelf_life_days = (__runInitializers(this, _requires_permit_extraInitializers), __runInitializers(this, _shelf_life_days_initializers, void 0));
        distribution_kind = (__runInitializers(this, _shelf_life_days_extraInitializers), __runInitializers(this, _distribution_kind_initializers, void 0));
        min_order_qty = (__runInitializers(this, _distribution_kind_extraInitializers), __runInitializers(this, _min_order_qty_initializers, void 0));
        weight_gr = (__runInitializers(this, _min_order_qty_extraInitializers), __runInitializers(this, _weight_gr_initializers, void 0));
        volume_cm3 = (__runInitializers(this, _weight_gr_extraInitializers), __runInitializers(this, _volume_cm3_initializers, void 0));
        constructor() {
            __runInitializers(this, _volume_cm3_extraInitializers);
        }
    };
})();
exports.CreateProductDto = CreateProductDto;
/** PATCH /api/v1/products/{id} — همه فیلدها اختیاری + وضعیت + قفل خوش‌بینانه */
let UpdateProductDto = (() => {
    let _classSuper = (0, mapped_types_1.PartialType)(CreateProductDto);
    let _status_decorators;
    let _status_initializers = [];
    let _status_extraInitializers = [];
    let _row_version_decorators;
    let _row_version_initializers = [];
    let _row_version_extraInitializers = [];
    return class UpdateProductDto extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _status_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsIn)(exports.PRODUCT_STATUSES)];
            _row_version_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsInt)(), (0, class_validator_1.Min)(0)];
            __esDecorate(null, null, _status_decorators, { kind: "field", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status, set: (obj, value) => { obj.status = value; } }, metadata: _metadata }, _status_initializers, _status_extraInitializers);
            __esDecorate(null, null, _row_version_decorators, { kind: "field", name: "row_version", static: false, private: false, access: { has: obj => "row_version" in obj, get: obj => obj.row_version, set: (obj, value) => { obj.row_version = value; } }, metadata: _metadata }, _row_version_initializers, _row_version_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        status = __runInitializers(this, _status_initializers, void 0);
        /** اگر فرستاده شود باید با row_version فعلی سرور یکی باشد وگرنه 409 */
        row_version = (__runInitializers(this, _status_extraInitializers), __runInitializers(this, _row_version_initializers, void 0));
        constructor() {
            super(...arguments);
            __runInitializers(this, _row_version_extraInitializers);
        }
    };
})();
exports.UpdateProductDto = UpdateProductDto;
/** GET /api/v1/products — صفحه‌بندی cursor + فیلترها (ضمیمه F) */
let ListProductsQueryDto = (() => {
    let _q_decorators;
    let _q_initializers = [];
    let _q_extraInitializers = [];
    let _category_id_decorators;
    let _category_id_initializers = [];
    let _category_id_extraInitializers = [];
    let _brand_id_decorators;
    let _brand_id_initializers = [];
    let _brand_id_extraInitializers = [];
    let _status_decorators;
    let _status_initializers = [];
    let _status_extraInitializers = [];
    let _cursor_decorators;
    let _cursor_initializers = [];
    let _cursor_extraInitializers = [];
    let _limit_decorators;
    let _limit_initializers = [];
    let _limit_extraInitializers = [];
    return class ListProductsQueryDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _q_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.MaxLength)(128)];
            _category_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)()];
            _brand_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)()];
            _status_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsIn)(exports.PRODUCT_STATUSES)];
            _cursor_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)()];
            _limit_decorators = [(0, class_validator_1.IsOptional)(), (0, class_transformer_1.Type)(() => Number), (0, class_validator_1.IsInt)(), (0, class_validator_1.Min)(1), (0, class_validator_1.Max)(200)];
            __esDecorate(null, null, _q_decorators, { kind: "field", name: "q", static: false, private: false, access: { has: obj => "q" in obj, get: obj => obj.q, set: (obj, value) => { obj.q = value; } }, metadata: _metadata }, _q_initializers, _q_extraInitializers);
            __esDecorate(null, null, _category_id_decorators, { kind: "field", name: "category_id", static: false, private: false, access: { has: obj => "category_id" in obj, get: obj => obj.category_id, set: (obj, value) => { obj.category_id = value; } }, metadata: _metadata }, _category_id_initializers, _category_id_extraInitializers);
            __esDecorate(null, null, _brand_id_decorators, { kind: "field", name: "brand_id", static: false, private: false, access: { has: obj => "brand_id" in obj, get: obj => obj.brand_id, set: (obj, value) => { obj.brand_id = value; } }, metadata: _metadata }, _brand_id_initializers, _brand_id_extraInitializers);
            __esDecorate(null, null, _status_decorators, { kind: "field", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status, set: (obj, value) => { obj.status = value; } }, metadata: _metadata }, _status_initializers, _status_extraInitializers);
            __esDecorate(null, null, _cursor_decorators, { kind: "field", name: "cursor", static: false, private: false, access: { has: obj => "cursor" in obj, get: obj => obj.cursor, set: (obj, value) => { obj.cursor = value; } }, metadata: _metadata }, _cursor_initializers, _cursor_extraInitializers);
            __esDecorate(null, null, _limit_decorators, { kind: "field", name: "limit", static: false, private: false, access: { has: obj => "limit" in obj, get: obj => obj.limit, set: (obj, value) => { obj.limit = value; } }, metadata: _metadata }, _limit_initializers, _limit_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        q = __runInitializers(this, _q_initializers, void 0);
        category_id = (__runInitializers(this, _q_extraInitializers), __runInitializers(this, _category_id_initializers, void 0));
        brand_id = (__runInitializers(this, _category_id_extraInitializers), __runInitializers(this, _brand_id_initializers, void 0));
        status = (__runInitializers(this, _brand_id_extraInitializers), __runInitializers(this, _status_initializers, void 0));
        cursor = (__runInitializers(this, _status_extraInitializers), __runInitializers(this, _cursor_initializers, void 0));
        limit = (__runInitializers(this, _cursor_extraInitializers), __runInitializers(this, _limit_initializers, 50));
        constructor() {
            __runInitializers(this, _limit_extraInitializers);
        }
    };
})();
exports.ListProductsQueryDto = ListProductsQueryDto;
