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
exports.ListTransfersQueryDto = exports.CreateStockAdjustmentDto = exports.CreateTransferDto = exports.TransferLineDto = exports.UpdateStockTakeDto = exports.CreateStockTakeDto = exports.StockTakeLineDto = exports.ListStocktakesQueryDto = exports.ListStockQueryDto = exports.ADJUSTMENT_REASONS = exports.STOCKTAKE_STATUSES = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
/** enum های هماهنگ با DDL (مهاجرت 0008) */
exports.STOCKTAKE_STATUSES = [
    'draft',
    'counting',
    'review',
    'approved',
    'posted',
    'voided',
];
exports.ADJUSTMENT_REASONS = [
    'damage',
    'expiry',
    'sample',
    'internal_use',
    'theft',
    'count_fix',
    'other',
];
const toNumber = ({ value }) => {
    if (value === '' || value === null || value === undefined)
        return value;
    const n = Number(value);
    return Number.isNaN(n) ? value : n;
};
/** GET /stock — فیلتر انبار/کالا/بچ + صفحه‌بندی cursor */
let ListStockQueryDto = (() => {
    let _warehouse_id_decorators;
    let _warehouse_id_initializers = [];
    let _warehouse_id_extraInitializers = [];
    let _product_id_decorators;
    let _product_id_initializers = [];
    let _product_id_extraInitializers = [];
    let _batch_id_decorators;
    let _batch_id_initializers = [];
    let _batch_id_extraInitializers = [];
    let _cursor_decorators;
    let _cursor_initializers = [];
    let _cursor_extraInitializers = [];
    let _limit_decorators;
    let _limit_initializers = [];
    let _limit_extraInitializers = [];
    return class ListStockQueryDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _warehouse_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _product_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _batch_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _cursor_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.MaxLength)(256)];
            _limit_decorators = [(0, class_validator_1.IsOptional)(), (0, class_transformer_1.Type)(() => Number), (0, class_validator_1.IsInt)(), (0, class_validator_1.Min)(1), (0, class_validator_1.Max)(500)];
            __esDecorate(null, null, _warehouse_id_decorators, { kind: "field", name: "warehouse_id", static: false, private: false, access: { has: obj => "warehouse_id" in obj, get: obj => obj.warehouse_id, set: (obj, value) => { obj.warehouse_id = value; } }, metadata: _metadata }, _warehouse_id_initializers, _warehouse_id_extraInitializers);
            __esDecorate(null, null, _product_id_decorators, { kind: "field", name: "product_id", static: false, private: false, access: { has: obj => "product_id" in obj, get: obj => obj.product_id, set: (obj, value) => { obj.product_id = value; } }, metadata: _metadata }, _product_id_initializers, _product_id_extraInitializers);
            __esDecorate(null, null, _batch_id_decorators, { kind: "field", name: "batch_id", static: false, private: false, access: { has: obj => "batch_id" in obj, get: obj => obj.batch_id, set: (obj, value) => { obj.batch_id = value; } }, metadata: _metadata }, _batch_id_initializers, _batch_id_extraInitializers);
            __esDecorate(null, null, _cursor_decorators, { kind: "field", name: "cursor", static: false, private: false, access: { has: obj => "cursor" in obj, get: obj => obj.cursor, set: (obj, value) => { obj.cursor = value; } }, metadata: _metadata }, _cursor_initializers, _cursor_extraInitializers);
            __esDecorate(null, null, _limit_decorators, { kind: "field", name: "limit", static: false, private: false, access: { has: obj => "limit" in obj, get: obj => obj.limit, set: (obj, value) => { obj.limit = value; } }, metadata: _metadata }, _limit_initializers, _limit_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        warehouse_id = __runInitializers(this, _warehouse_id_initializers, void 0);
        product_id = (__runInitializers(this, _warehouse_id_extraInitializers), __runInitializers(this, _product_id_initializers, void 0));
        batch_id = (__runInitializers(this, _product_id_extraInitializers), __runInitializers(this, _batch_id_initializers, void 0));
        cursor = (__runInitializers(this, _batch_id_extraInitializers), __runInitializers(this, _cursor_initializers, void 0));
        limit = (__runInitializers(this, _cursor_extraInitializers), __runInitializers(this, _limit_initializers, 50));
        constructor() {
            __runInitializers(this, _limit_extraInitializers);
        }
    };
})();
exports.ListStockQueryDto = ListStockQueryDto;
/** GET /stocktakes — فیلتر وضعیت + صفحه‌بندی */
let ListStocktakesQueryDto = (() => {
    let _status_decorators;
    let _status_initializers = [];
    let _status_extraInitializers = [];
    let _cursor_decorators;
    let _cursor_initializers = [];
    let _cursor_extraInitializers = [];
    let _limit_decorators;
    let _limit_initializers = [];
    let _limit_extraInitializers = [];
    return class ListStocktakesQueryDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _status_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsIn)(exports.STOCKTAKE_STATUSES)];
            _cursor_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.MaxLength)(256)];
            _limit_decorators = [(0, class_validator_1.IsOptional)(), (0, class_transformer_1.Type)(() => Number), (0, class_validator_1.IsInt)(), (0, class_validator_1.Min)(1), (0, class_validator_1.Max)(200)];
            __esDecorate(null, null, _status_decorators, { kind: "field", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status, set: (obj, value) => { obj.status = value; } }, metadata: _metadata }, _status_initializers, _status_extraInitializers);
            __esDecorate(null, null, _cursor_decorators, { kind: "field", name: "cursor", static: false, private: false, access: { has: obj => "cursor" in obj, get: obj => obj.cursor, set: (obj, value) => { obj.cursor = value; } }, metadata: _metadata }, _cursor_initializers, _cursor_extraInitializers);
            __esDecorate(null, null, _limit_decorators, { kind: "field", name: "limit", static: false, private: false, access: { has: obj => "limit" in obj, get: obj => obj.limit, set: (obj, value) => { obj.limit = value; } }, metadata: _metadata }, _limit_initializers, _limit_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        status = __runInitializers(this, _status_initializers, void 0);
        cursor = (__runInitializers(this, _status_extraInitializers), __runInitializers(this, _cursor_initializers, void 0));
        limit = (__runInitializers(this, _cursor_extraInitializers), __runInitializers(this, _limit_initializers, 50));
        constructor() {
            __runInitializers(this, _limit_extraInitializers);
        }
    };
})();
exports.ListStocktakesQueryDto = ListStocktakesQueryDto;
/** یک خط شمارش — system_qty و variance_qty از سمت سرور محاسبه می‌شوند */
let StockTakeLineDto = (() => {
    let _product_id_decorators;
    let _product_id_initializers = [];
    let _product_id_extraInitializers = [];
    let _batch_id_decorators;
    let _batch_id_initializers = [];
    let _batch_id_extraInitializers = [];
    let _counted_qty_decorators;
    let _counted_qty_initializers = [];
    let _counted_qty_extraInitializers = [];
    return class StockTakeLineDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _product_id_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsUUID)('4')];
            _batch_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _counted_qty_decorators = [(0, class_validator_1.IsOptional)(), (0, class_transformer_1.Transform)(toNumber), (0, class_validator_1.IsNumber)()];
            __esDecorate(null, null, _product_id_decorators, { kind: "field", name: "product_id", static: false, private: false, access: { has: obj => "product_id" in obj, get: obj => obj.product_id, set: (obj, value) => { obj.product_id = value; } }, metadata: _metadata }, _product_id_initializers, _product_id_extraInitializers);
            __esDecorate(null, null, _batch_id_decorators, { kind: "field", name: "batch_id", static: false, private: false, access: { has: obj => "batch_id" in obj, get: obj => obj.batch_id, set: (obj, value) => { obj.batch_id = value; } }, metadata: _metadata }, _batch_id_initializers, _batch_id_extraInitializers);
            __esDecorate(null, null, _counted_qty_decorators, { kind: "field", name: "counted_qty", static: false, private: false, access: { has: obj => "counted_qty" in obj, get: obj => obj.counted_qty, set: (obj, value) => { obj.counted_qty = value; } }, metadata: _metadata }, _counted_qty_initializers, _counted_qty_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        product_id = __runInitializers(this, _product_id_initializers, void 0);
        batch_id = (__runInitializers(this, _product_id_extraInitializers), __runInitializers(this, _batch_id_initializers, void 0));
        counted_qty = (__runInitializers(this, _batch_id_extraInitializers), __runInitializers(this, _counted_qty_initializers, void 0));
        constructor() {
            __runInitializers(this, _counted_qty_extraInitializers);
        }
    };
})();
exports.StockTakeLineDto = StockTakeLineDto;
/** POST /stocktakes — شروع انبارگردانی */
let CreateStockTakeDto = (() => {
    let _warehouse_id_decorators;
    let _warehouse_id_initializers = [];
    let _warehouse_id_extraInitializers = [];
    let _lines_decorators;
    let _lines_initializers = [];
    let _lines_extraInitializers = [];
    return class CreateStockTakeDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _warehouse_id_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsUUID)('4')];
            _lines_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsArray)(), (0, class_validator_1.ValidateNested)({ each: true }), (0, class_transformer_1.Type)(() => StockTakeLineDto)];
            __esDecorate(null, null, _warehouse_id_decorators, { kind: "field", name: "warehouse_id", static: false, private: false, access: { has: obj => "warehouse_id" in obj, get: obj => obj.warehouse_id, set: (obj, value) => { obj.warehouse_id = value; } }, metadata: _metadata }, _warehouse_id_initializers, _warehouse_id_extraInitializers);
            __esDecorate(null, null, _lines_decorators, { kind: "field", name: "lines", static: false, private: false, access: { has: obj => "lines" in obj, get: obj => obj.lines, set: (obj, value) => { obj.lines = value; } }, metadata: _metadata }, _lines_initializers, _lines_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        warehouse_id = __runInitializers(this, _warehouse_id_initializers, void 0);
        lines = (__runInitializers(this, _warehouse_id_extraInitializers), __runInitializers(this, _lines_initializers, void 0));
        constructor() {
            __runInitializers(this, _lines_extraInitializers);
        }
    };
})();
exports.CreateStockTakeDto = CreateStockTakeDto;
/** PATCH /stocktakes/{id} — ثبت/به‌روزرسانی شمارش اقلام */
let UpdateStockTakeDto = (() => {
    let _status_decorators;
    let _status_initializers = [];
    let _status_extraInitializers = [];
    let _lines_decorators;
    let _lines_initializers = [];
    let _lines_extraInitializers = [];
    return class UpdateStockTakeDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _status_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsIn)(exports.STOCKTAKE_STATUSES)];
            _lines_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsArray)(), (0, class_validator_1.ValidateNested)({ each: true }), (0, class_transformer_1.Type)(() => StockTakeLineDto)];
            __esDecorate(null, null, _status_decorators, { kind: "field", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status, set: (obj, value) => { obj.status = value; } }, metadata: _metadata }, _status_initializers, _status_extraInitializers);
            __esDecorate(null, null, _lines_decorators, { kind: "field", name: "lines", static: false, private: false, access: { has: obj => "lines" in obj, get: obj => obj.lines, set: (obj, value) => { obj.lines = value; } }, metadata: _metadata }, _lines_initializers, _lines_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        status = __runInitializers(this, _status_initializers, void 0);
        lines = (__runInitializers(this, _status_extraInitializers), __runInitializers(this, _lines_initializers, void 0));
        constructor() {
            __runInitializers(this, _lines_extraInitializers);
        }
    };
})();
exports.UpdateStockTakeDto = UpdateStockTakeDto;
/** یک خط انتقال */
let TransferLineDto = (() => {
    let _product_id_decorators;
    let _product_id_initializers = [];
    let _product_id_extraInitializers = [];
    let _batch_id_decorators;
    let _batch_id_initializers = [];
    let _batch_id_extraInitializers = [];
    let _qty_decorators;
    let _qty_initializers = [];
    let _qty_extraInitializers = [];
    return class TransferLineDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _product_id_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsUUID)('4')];
            _batch_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _qty_decorators = [(0, class_validator_1.IsDefined)(), (0, class_transformer_1.Transform)(toNumber), (0, class_validator_1.IsNumber)(), (0, class_validator_1.Min)(0.0001)];
            __esDecorate(null, null, _product_id_decorators, { kind: "field", name: "product_id", static: false, private: false, access: { has: obj => "product_id" in obj, get: obj => obj.product_id, set: (obj, value) => { obj.product_id = value; } }, metadata: _metadata }, _product_id_initializers, _product_id_extraInitializers);
            __esDecorate(null, null, _batch_id_decorators, { kind: "field", name: "batch_id", static: false, private: false, access: { has: obj => "batch_id" in obj, get: obj => obj.batch_id, set: (obj, value) => { obj.batch_id = value; } }, metadata: _metadata }, _batch_id_initializers, _batch_id_extraInitializers);
            __esDecorate(null, null, _qty_decorators, { kind: "field", name: "qty", static: false, private: false, access: { has: obj => "qty" in obj, get: obj => obj.qty, set: (obj, value) => { obj.qty = value; } }, metadata: _metadata }, _qty_initializers, _qty_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        product_id = __runInitializers(this, _product_id_initializers, void 0);
        batch_id = (__runInitializers(this, _product_id_extraInitializers), __runInitializers(this, _batch_id_initializers, void 0));
        qty = (__runInitializers(this, _batch_id_extraInitializers), __runInitializers(this, _qty_initializers, void 0));
        constructor() {
            __runInitializers(this, _qty_extraInitializers);
        }
    };
})();
exports.TransferLineDto = TransferLineDto;
/** POST /transfers — ثبت انتقال بین‌انباری */
let CreateTransferDto = (() => {
    let _from_warehouse_id_decorators;
    let _from_warehouse_id_initializers = [];
    let _from_warehouse_id_extraInitializers = [];
    let _to_warehouse_id_decorators;
    let _to_warehouse_id_initializers = [];
    let _to_warehouse_id_extraInitializers = [];
    let _lines_decorators;
    let _lines_initializers = [];
    let _lines_extraInitializers = [];
    return class CreateTransferDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _from_warehouse_id_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsUUID)('4')];
            _to_warehouse_id_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsUUID)('4')];
            _lines_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsArray)(), (0, class_validator_1.ValidateNested)({ each: true }), (0, class_transformer_1.Type)(() => TransferLineDto)];
            __esDecorate(null, null, _from_warehouse_id_decorators, { kind: "field", name: "from_warehouse_id", static: false, private: false, access: { has: obj => "from_warehouse_id" in obj, get: obj => obj.from_warehouse_id, set: (obj, value) => { obj.from_warehouse_id = value; } }, metadata: _metadata }, _from_warehouse_id_initializers, _from_warehouse_id_extraInitializers);
            __esDecorate(null, null, _to_warehouse_id_decorators, { kind: "field", name: "to_warehouse_id", static: false, private: false, access: { has: obj => "to_warehouse_id" in obj, get: obj => obj.to_warehouse_id, set: (obj, value) => { obj.to_warehouse_id = value; } }, metadata: _metadata }, _to_warehouse_id_initializers, _to_warehouse_id_extraInitializers);
            __esDecorate(null, null, _lines_decorators, { kind: "field", name: "lines", static: false, private: false, access: { has: obj => "lines" in obj, get: obj => obj.lines, set: (obj, value) => { obj.lines = value; } }, metadata: _metadata }, _lines_initializers, _lines_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        from_warehouse_id = __runInitializers(this, _from_warehouse_id_initializers, void 0);
        to_warehouse_id = (__runInitializers(this, _from_warehouse_id_extraInitializers), __runInitializers(this, _to_warehouse_id_initializers, void 0));
        lines = (__runInitializers(this, _to_warehouse_id_extraInitializers), __runInitializers(this, _lines_initializers, void 0));
        constructor() {
            __runInitializers(this, _lines_extraInitializers);
        }
    };
})();
exports.CreateTransferDto = CreateTransferDto;
/** POST /stock/adjustments — اصلاحیه موجودی */
let CreateStockAdjustmentDto = (() => {
    let _warehouse_id_decorators;
    let _warehouse_id_initializers = [];
    let _warehouse_id_extraInitializers = [];
    let _product_id_decorators;
    let _product_id_initializers = [];
    let _product_id_extraInitializers = [];
    let _batch_id_decorators;
    let _batch_id_initializers = [];
    let _batch_id_extraInitializers = [];
    let _qty_delta_decorators;
    let _qty_delta_initializers = [];
    let _qty_delta_extraInitializers = [];
    let _reason_code_decorators;
    let _reason_code_initializers = [];
    let _reason_code_extraInitializers = [];
    let _note_decorators;
    let _note_initializers = [];
    let _note_extraInitializers = [];
    return class CreateStockAdjustmentDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _warehouse_id_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsUUID)('4')];
            _product_id_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsUUID)('4')];
            _batch_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _qty_delta_decorators = [(0, class_validator_1.IsDefined)(), (0, class_transformer_1.Transform)(toNumber), (0, class_validator_1.IsNumber)()];
            _reason_code_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsIn)(exports.ADJUSTMENT_REASONS)];
            _note_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)(), (0, class_validator_1.MaxLength)(500)];
            __esDecorate(null, null, _warehouse_id_decorators, { kind: "field", name: "warehouse_id", static: false, private: false, access: { has: obj => "warehouse_id" in obj, get: obj => obj.warehouse_id, set: (obj, value) => { obj.warehouse_id = value; } }, metadata: _metadata }, _warehouse_id_initializers, _warehouse_id_extraInitializers);
            __esDecorate(null, null, _product_id_decorators, { kind: "field", name: "product_id", static: false, private: false, access: { has: obj => "product_id" in obj, get: obj => obj.product_id, set: (obj, value) => { obj.product_id = value; } }, metadata: _metadata }, _product_id_initializers, _product_id_extraInitializers);
            __esDecorate(null, null, _batch_id_decorators, { kind: "field", name: "batch_id", static: false, private: false, access: { has: obj => "batch_id" in obj, get: obj => obj.batch_id, set: (obj, value) => { obj.batch_id = value; } }, metadata: _metadata }, _batch_id_initializers, _batch_id_extraInitializers);
            __esDecorate(null, null, _qty_delta_decorators, { kind: "field", name: "qty_delta", static: false, private: false, access: { has: obj => "qty_delta" in obj, get: obj => obj.qty_delta, set: (obj, value) => { obj.qty_delta = value; } }, metadata: _metadata }, _qty_delta_initializers, _qty_delta_extraInitializers);
            __esDecorate(null, null, _reason_code_decorators, { kind: "field", name: "reason_code", static: false, private: false, access: { has: obj => "reason_code" in obj, get: obj => obj.reason_code, set: (obj, value) => { obj.reason_code = value; } }, metadata: _metadata }, _reason_code_initializers, _reason_code_extraInitializers);
            __esDecorate(null, null, _note_decorators, { kind: "field", name: "note", static: false, private: false, access: { has: obj => "note" in obj, get: obj => obj.note, set: (obj, value) => { obj.note = value; } }, metadata: _metadata }, _note_initializers, _note_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        warehouse_id = __runInitializers(this, _warehouse_id_initializers, void 0);
        product_id = (__runInitializers(this, _warehouse_id_extraInitializers), __runInitializers(this, _product_id_initializers, void 0));
        batch_id = (__runInitializers(this, _product_id_extraInitializers), __runInitializers(this, _batch_id_initializers, void 0));
        qty_delta = (__runInitializers(this, _batch_id_extraInitializers), __runInitializers(this, _qty_delta_initializers, void 0));
        reason_code = (__runInitializers(this, _qty_delta_extraInitializers), __runInitializers(this, _reason_code_initializers, void 0));
        note = (__runInitializers(this, _reason_code_extraInitializers), __runInitializers(this, _note_initializers, void 0));
        constructor() {
            __runInitializers(this, _note_extraInitializers);
        }
    };
})();
exports.CreateStockAdjustmentDto = CreateStockAdjustmentDto;
/** GET /transfers — صفحه‌بندی cursor */
let ListTransfersQueryDto = (() => {
    let _cursor_decorators;
    let _cursor_initializers = [];
    let _cursor_extraInitializers = [];
    let _limit_decorators;
    let _limit_initializers = [];
    let _limit_extraInitializers = [];
    return class ListTransfersQueryDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _cursor_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.MaxLength)(256)];
            _limit_decorators = [(0, class_validator_1.IsOptional)(), (0, class_transformer_1.Type)(() => Number), (0, class_validator_1.IsInt)(), (0, class_validator_1.Min)(1), (0, class_validator_1.Max)(200)];
            __esDecorate(null, null, _cursor_decorators, { kind: "field", name: "cursor", static: false, private: false, access: { has: obj => "cursor" in obj, get: obj => obj.cursor, set: (obj, value) => { obj.cursor = value; } }, metadata: _metadata }, _cursor_initializers, _cursor_extraInitializers);
            __esDecorate(null, null, _limit_decorators, { kind: "field", name: "limit", static: false, private: false, access: { has: obj => "limit" in obj, get: obj => obj.limit, set: (obj, value) => { obj.limit = value; } }, metadata: _metadata }, _limit_initializers, _limit_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        cursor = __runInitializers(this, _cursor_initializers, void 0);
        limit = (__runInitializers(this, _cursor_extraInitializers), __runInitializers(this, _limit_initializers, 50));
        constructor() {
            __runInitializers(this, _limit_extraInitializers);
        }
    };
})();
exports.ListTransfersQueryDto = ListTransfersQueryDto;
