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
exports.ListPromotionsQueryDto = exports.UpdatePromotionDto = exports.CreatePromotionDto = exports.ListPriceListsQueryDto = exports.UpdatePriceListDto = exports.CreatePriceListDto = exports.PriceListItemDto = exports.PROMOTION_KINDS = exports.PRICE_LIST_KINDS = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
/** enum های هماهنگ با DDL (مهاجرت 0006) */
exports.PRICE_LIST_KINDS = ['general', 'wholesale', 'retail', 'chain', 'cooperative', 'channel'];
exports.PROMOTION_KINDS = [
    'percent_line',
    'amount_line',
    'bundle',
    'buy_x_get_y',
    'gift_item',
    'cash_discount',
    'repeat_order',
    'coupon',
    'volume_tier',
];
const toBoolean = ({ value }) => {
    if (value === 'true' || value === true)
        return true;
    if (value === 'false' || value === false)
        return false;
    return value;
};
/** قیمت/مبلغ اعشاری — هم رشته هم عدد پذیرفته و به رشته تبدیل می‌شود (قرارداد string است) */
const toDecimalString = ({ value }) => {
    if (typeof value === 'number')
        return String(value);
    return value;
};
const DECIMAL = { message: 'مقدار باید عدد غیرمنفی اعشاری باشد.' };
const DECIMAL_RE = /^\d+(\.\d+)?$/;
// ---------------- لیست قیمت ----------------
let PriceListItemDto = (() => {
    let _product_id_decorators;
    let _product_id_initializers = [];
    let _product_id_extraInitializers = [];
    let _price_decorators;
    let _price_initializers = [];
    let _price_extraInitializers = [];
    let _valid_from_decorators;
    let _valid_from_initializers = [];
    let _valid_from_extraInitializers = [];
    let _valid_to_decorators;
    let _valid_to_initializers = [];
    let _valid_to_extraInitializers = [];
    return class PriceListItemDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _product_id_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsUUID)('4')];
            _price_decorators = [(0, class_validator_1.IsDefined)(), (0, class_transformer_1.Transform)(toDecimalString), (0, class_validator_1.IsString)(), (0, class_validator_1.Matches)(DECIMAL_RE, DECIMAL)];
            _valid_from_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsDateString)()];
            _valid_to_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsDateString)()];
            __esDecorate(null, null, _product_id_decorators, { kind: "field", name: "product_id", static: false, private: false, access: { has: obj => "product_id" in obj, get: obj => obj.product_id, set: (obj, value) => { obj.product_id = value; } }, metadata: _metadata }, _product_id_initializers, _product_id_extraInitializers);
            __esDecorate(null, null, _price_decorators, { kind: "field", name: "price", static: false, private: false, access: { has: obj => "price" in obj, get: obj => obj.price, set: (obj, value) => { obj.price = value; } }, metadata: _metadata }, _price_initializers, _price_extraInitializers);
            __esDecorate(null, null, _valid_from_decorators, { kind: "field", name: "valid_from", static: false, private: false, access: { has: obj => "valid_from" in obj, get: obj => obj.valid_from, set: (obj, value) => { obj.valid_from = value; } }, metadata: _metadata }, _valid_from_initializers, _valid_from_extraInitializers);
            __esDecorate(null, null, _valid_to_decorators, { kind: "field", name: "valid_to", static: false, private: false, access: { has: obj => "valid_to" in obj, get: obj => obj.valid_to, set: (obj, value) => { obj.valid_to = value; } }, metadata: _metadata }, _valid_to_initializers, _valid_to_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        product_id = __runInitializers(this, _product_id_initializers, void 0);
        price = (__runInitializers(this, _product_id_extraInitializers), __runInitializers(this, _price_initializers, void 0));
        valid_from = (__runInitializers(this, _price_extraInitializers), __runInitializers(this, _valid_from_initializers, void 0));
        valid_to = (__runInitializers(this, _valid_from_extraInitializers), __runInitializers(this, _valid_to_initializers, void 0));
        constructor() {
            __runInitializers(this, _valid_to_extraInitializers);
        }
    };
})();
exports.PriceListItemDto = PriceListItemDto;
let CreatePriceListDto = (() => {
    let _code_decorators;
    let _code_initializers = [];
    let _code_extraInitializers = [];
    let _title_decorators;
    let _title_initializers = [];
    let _title_extraInitializers = [];
    let _kind_decorators;
    let _kind_initializers = [];
    let _kind_extraInitializers = [];
    let _currency_decorators;
    let _currency_initializers = [];
    let _currency_extraInitializers = [];
    let _is_active_decorators;
    let _is_active_initializers = [];
    let _is_active_extraInitializers = [];
    let _items_decorators;
    let _items_initializers = [];
    let _items_extraInitializers = [];
    return class CreatePriceListDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _code_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)(), (0, class_validator_1.MaxLength)(64)];
            _title_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)(), (0, class_validator_1.MaxLength)(128)];
            _kind_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsIn)(exports.PRICE_LIST_KINDS)];
            _currency_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.Length)(3, 3)];
            _is_active_decorators = [(0, class_validator_1.IsOptional)(), (0, class_transformer_1.Transform)(toBoolean), (0, class_validator_1.IsBoolean)()];
            _items_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsArray)(), (0, class_validator_1.ValidateNested)({ each: true }), (0, class_transformer_1.Type)(() => PriceListItemDto)];
            __esDecorate(null, null, _code_decorators, { kind: "field", name: "code", static: false, private: false, access: { has: obj => "code" in obj, get: obj => obj.code, set: (obj, value) => { obj.code = value; } }, metadata: _metadata }, _code_initializers, _code_extraInitializers);
            __esDecorate(null, null, _title_decorators, { kind: "field", name: "title", static: false, private: false, access: { has: obj => "title" in obj, get: obj => obj.title, set: (obj, value) => { obj.title = value; } }, metadata: _metadata }, _title_initializers, _title_extraInitializers);
            __esDecorate(null, null, _kind_decorators, { kind: "field", name: "kind", static: false, private: false, access: { has: obj => "kind" in obj, get: obj => obj.kind, set: (obj, value) => { obj.kind = value; } }, metadata: _metadata }, _kind_initializers, _kind_extraInitializers);
            __esDecorate(null, null, _currency_decorators, { kind: "field", name: "currency", static: false, private: false, access: { has: obj => "currency" in obj, get: obj => obj.currency, set: (obj, value) => { obj.currency = value; } }, metadata: _metadata }, _currency_initializers, _currency_extraInitializers);
            __esDecorate(null, null, _is_active_decorators, { kind: "field", name: "is_active", static: false, private: false, access: { has: obj => "is_active" in obj, get: obj => obj.is_active, set: (obj, value) => { obj.is_active = value; } }, metadata: _metadata }, _is_active_initializers, _is_active_extraInitializers);
            __esDecorate(null, null, _items_decorators, { kind: "field", name: "items", static: false, private: false, access: { has: obj => "items" in obj, get: obj => obj.items, set: (obj, value) => { obj.items = value; } }, metadata: _metadata }, _items_initializers, _items_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        code = __runInitializers(this, _code_initializers, void 0);
        title = (__runInitializers(this, _code_extraInitializers), __runInitializers(this, _title_initializers, void 0));
        kind = (__runInitializers(this, _title_extraInitializers), __runInitializers(this, _kind_initializers, void 0));
        currency = (__runInitializers(this, _kind_extraInitializers), __runInitializers(this, _currency_initializers, void 0));
        is_active = (__runInitializers(this, _currency_extraInitializers), __runInitializers(this, _is_active_initializers, void 0));
        items = (__runInitializers(this, _is_active_extraInitializers), __runInitializers(this, _items_initializers, void 0));
        constructor() {
            __runInitializers(this, _items_extraInitializers);
        }
    };
})();
exports.CreatePriceListDto = CreatePriceListDto;
let UpdatePriceListDto = (() => {
    let _code_decorators;
    let _code_initializers = [];
    let _code_extraInitializers = [];
    let _title_decorators;
    let _title_initializers = [];
    let _title_extraInitializers = [];
    let _kind_decorators;
    let _kind_initializers = [];
    let _kind_extraInitializers = [];
    let _currency_decorators;
    let _currency_initializers = [];
    let _currency_extraInitializers = [];
    let _is_active_decorators;
    let _is_active_initializers = [];
    let _is_active_extraInitializers = [];
    let _items_decorators;
    let _items_initializers = [];
    let _items_extraInitializers = [];
    return class UpdatePriceListDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _code_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.MaxLength)(64)];
            _title_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.MaxLength)(128)];
            _kind_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsIn)(exports.PRICE_LIST_KINDS)];
            _currency_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.Length)(3, 3)];
            _is_active_decorators = [(0, class_validator_1.IsOptional)(), (0, class_transformer_1.Transform)(toBoolean), (0, class_validator_1.IsBoolean)()];
            _items_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsArray)(), (0, class_validator_1.ValidateNested)({ each: true }), (0, class_transformer_1.Type)(() => PriceListItemDto)];
            __esDecorate(null, null, _code_decorators, { kind: "field", name: "code", static: false, private: false, access: { has: obj => "code" in obj, get: obj => obj.code, set: (obj, value) => { obj.code = value; } }, metadata: _metadata }, _code_initializers, _code_extraInitializers);
            __esDecorate(null, null, _title_decorators, { kind: "field", name: "title", static: false, private: false, access: { has: obj => "title" in obj, get: obj => obj.title, set: (obj, value) => { obj.title = value; } }, metadata: _metadata }, _title_initializers, _title_extraInitializers);
            __esDecorate(null, null, _kind_decorators, { kind: "field", name: "kind", static: false, private: false, access: { has: obj => "kind" in obj, get: obj => obj.kind, set: (obj, value) => { obj.kind = value; } }, metadata: _metadata }, _kind_initializers, _kind_extraInitializers);
            __esDecorate(null, null, _currency_decorators, { kind: "field", name: "currency", static: false, private: false, access: { has: obj => "currency" in obj, get: obj => obj.currency, set: (obj, value) => { obj.currency = value; } }, metadata: _metadata }, _currency_initializers, _currency_extraInitializers);
            __esDecorate(null, null, _is_active_decorators, { kind: "field", name: "is_active", static: false, private: false, access: { has: obj => "is_active" in obj, get: obj => obj.is_active, set: (obj, value) => { obj.is_active = value; } }, metadata: _metadata }, _is_active_initializers, _is_active_extraInitializers);
            __esDecorate(null, null, _items_decorators, { kind: "field", name: "items", static: false, private: false, access: { has: obj => "items" in obj, get: obj => obj.items, set: (obj, value) => { obj.items = value; } }, metadata: _metadata }, _items_initializers, _items_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        code = __runInitializers(this, _code_initializers, void 0);
        title = (__runInitializers(this, _code_extraInitializers), __runInitializers(this, _title_initializers, void 0));
        kind = (__runInitializers(this, _title_extraInitializers), __runInitializers(this, _kind_initializers, void 0));
        currency = (__runInitializers(this, _kind_extraInitializers), __runInitializers(this, _currency_initializers, void 0));
        is_active = (__runInitializers(this, _currency_extraInitializers), __runInitializers(this, _is_active_initializers, void 0));
        items = (__runInitializers(this, _is_active_extraInitializers), __runInitializers(this, _items_initializers, void 0));
        constructor() {
            __runInitializers(this, _items_extraInitializers);
        }
    };
})();
exports.UpdatePriceListDto = UpdatePriceListDto;
let ListPriceListsQueryDto = (() => {
    let _cursor_decorators;
    let _cursor_initializers = [];
    let _cursor_extraInitializers = [];
    let _limit_decorators;
    let _limit_initializers = [];
    let _limit_extraInitializers = [];
    return class ListPriceListsQueryDto {
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
exports.ListPriceListsQueryDto = ListPriceListsQueryDto;
// ---------------- تشویق (تخفیف/جایزه) ----------------
let CreatePromotionDto = (() => {
    let _code_decorators;
    let _code_initializers = [];
    let _code_extraInitializers = [];
    let _title_decorators;
    let _title_initializers = [];
    let _title_extraInitializers = [];
    let _kind_decorators;
    let _kind_initializers = [];
    let _kind_extraInitializers = [];
    let _valid_from_decorators;
    let _valid_from_initializers = [];
    let _valid_from_extraInitializers = [];
    let _valid_to_decorators;
    let _valid_to_initializers = [];
    let _valid_to_extraInitializers = [];
    let _priority_decorators;
    let _priority_initializers = [];
    let _priority_extraInitializers = [];
    let _allow_stacking_decorators;
    let _allow_stacking_initializers = [];
    let _allow_stacking_extraInitializers = [];
    let _max_discount_amount_decorators;
    let _max_discount_amount_initializers = [];
    let _max_discount_amount_extraInitializers = [];
    let _max_per_customer_per_day_decorators;
    let _max_per_customer_per_day_initializers = [];
    let _max_per_customer_per_day_extraInitializers = [];
    let _conditions_decorators;
    let _conditions_initializers = [];
    let _conditions_extraInitializers = [];
    let _benefit_decorators;
    let _benefit_initializers = [];
    let _benefit_extraInitializers = [];
    let _is_active_decorators;
    let _is_active_initializers = [];
    let _is_active_extraInitializers = [];
    return class CreatePromotionDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _code_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)(), (0, class_validator_1.MaxLength)(64)];
            _title_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)(), (0, class_validator_1.MaxLength)(128)];
            _kind_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsIn)(exports.PROMOTION_KINDS)];
            _valid_from_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsDateString)()];
            _valid_to_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsDateString)()];
            _priority_decorators = [(0, class_validator_1.IsOptional)(), (0, class_transformer_1.Type)(() => Number), (0, class_validator_1.IsInt)(), (0, class_validator_1.Min)(0), (0, class_validator_1.Max)(32767)];
            _allow_stacking_decorators = [(0, class_validator_1.IsOptional)(), (0, class_transformer_1.Transform)(toBoolean), (0, class_validator_1.IsBoolean)()];
            _max_discount_amount_decorators = [(0, class_validator_1.IsOptional)(), (0, class_transformer_1.Transform)(toDecimalString), (0, class_validator_1.IsString)(), (0, class_validator_1.Matches)(DECIMAL_RE, DECIMAL)];
            _max_per_customer_per_day_decorators = [(0, class_validator_1.IsOptional)(), (0, class_transformer_1.Transform)(toDecimalString), (0, class_validator_1.IsString)(), (0, class_validator_1.Matches)(DECIMAL_RE, DECIMAL)];
            _conditions_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsObject)()];
            _benefit_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsObject)()];
            _is_active_decorators = [(0, class_validator_1.IsOptional)(), (0, class_transformer_1.Transform)(toBoolean), (0, class_validator_1.IsBoolean)()];
            __esDecorate(null, null, _code_decorators, { kind: "field", name: "code", static: false, private: false, access: { has: obj => "code" in obj, get: obj => obj.code, set: (obj, value) => { obj.code = value; } }, metadata: _metadata }, _code_initializers, _code_extraInitializers);
            __esDecorate(null, null, _title_decorators, { kind: "field", name: "title", static: false, private: false, access: { has: obj => "title" in obj, get: obj => obj.title, set: (obj, value) => { obj.title = value; } }, metadata: _metadata }, _title_initializers, _title_extraInitializers);
            __esDecorate(null, null, _kind_decorators, { kind: "field", name: "kind", static: false, private: false, access: { has: obj => "kind" in obj, get: obj => obj.kind, set: (obj, value) => { obj.kind = value; } }, metadata: _metadata }, _kind_initializers, _kind_extraInitializers);
            __esDecorate(null, null, _valid_from_decorators, { kind: "field", name: "valid_from", static: false, private: false, access: { has: obj => "valid_from" in obj, get: obj => obj.valid_from, set: (obj, value) => { obj.valid_from = value; } }, metadata: _metadata }, _valid_from_initializers, _valid_from_extraInitializers);
            __esDecorate(null, null, _valid_to_decorators, { kind: "field", name: "valid_to", static: false, private: false, access: { has: obj => "valid_to" in obj, get: obj => obj.valid_to, set: (obj, value) => { obj.valid_to = value; } }, metadata: _metadata }, _valid_to_initializers, _valid_to_extraInitializers);
            __esDecorate(null, null, _priority_decorators, { kind: "field", name: "priority", static: false, private: false, access: { has: obj => "priority" in obj, get: obj => obj.priority, set: (obj, value) => { obj.priority = value; } }, metadata: _metadata }, _priority_initializers, _priority_extraInitializers);
            __esDecorate(null, null, _allow_stacking_decorators, { kind: "field", name: "allow_stacking", static: false, private: false, access: { has: obj => "allow_stacking" in obj, get: obj => obj.allow_stacking, set: (obj, value) => { obj.allow_stacking = value; } }, metadata: _metadata }, _allow_stacking_initializers, _allow_stacking_extraInitializers);
            __esDecorate(null, null, _max_discount_amount_decorators, { kind: "field", name: "max_discount_amount", static: false, private: false, access: { has: obj => "max_discount_amount" in obj, get: obj => obj.max_discount_amount, set: (obj, value) => { obj.max_discount_amount = value; } }, metadata: _metadata }, _max_discount_amount_initializers, _max_discount_amount_extraInitializers);
            __esDecorate(null, null, _max_per_customer_per_day_decorators, { kind: "field", name: "max_per_customer_per_day", static: false, private: false, access: { has: obj => "max_per_customer_per_day" in obj, get: obj => obj.max_per_customer_per_day, set: (obj, value) => { obj.max_per_customer_per_day = value; } }, metadata: _metadata }, _max_per_customer_per_day_initializers, _max_per_customer_per_day_extraInitializers);
            __esDecorate(null, null, _conditions_decorators, { kind: "field", name: "conditions", static: false, private: false, access: { has: obj => "conditions" in obj, get: obj => obj.conditions, set: (obj, value) => { obj.conditions = value; } }, metadata: _metadata }, _conditions_initializers, _conditions_extraInitializers);
            __esDecorate(null, null, _benefit_decorators, { kind: "field", name: "benefit", static: false, private: false, access: { has: obj => "benefit" in obj, get: obj => obj.benefit, set: (obj, value) => { obj.benefit = value; } }, metadata: _metadata }, _benefit_initializers, _benefit_extraInitializers);
            __esDecorate(null, null, _is_active_decorators, { kind: "field", name: "is_active", static: false, private: false, access: { has: obj => "is_active" in obj, get: obj => obj.is_active, set: (obj, value) => { obj.is_active = value; } }, metadata: _metadata }, _is_active_initializers, _is_active_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        code = __runInitializers(this, _code_initializers, void 0);
        title = (__runInitializers(this, _code_extraInitializers), __runInitializers(this, _title_initializers, void 0));
        kind = (__runInitializers(this, _title_extraInitializers), __runInitializers(this, _kind_initializers, void 0));
        valid_from = (__runInitializers(this, _kind_extraInitializers), __runInitializers(this, _valid_from_initializers, void 0));
        valid_to = (__runInitializers(this, _valid_from_extraInitializers), __runInitializers(this, _valid_to_initializers, void 0));
        priority = (__runInitializers(this, _valid_to_extraInitializers), __runInitializers(this, _priority_initializers, void 0));
        allow_stacking = (__runInitializers(this, _priority_extraInitializers), __runInitializers(this, _allow_stacking_initializers, void 0));
        max_discount_amount = (__runInitializers(this, _allow_stacking_extraInitializers), __runInitializers(this, _max_discount_amount_initializers, void 0));
        max_per_customer_per_day = (__runInitializers(this, _max_discount_amount_extraInitializers), __runInitializers(this, _max_per_customer_per_day_initializers, void 0));
        conditions = (__runInitializers(this, _max_per_customer_per_day_extraInitializers), __runInitializers(this, _conditions_initializers, void 0));
        benefit = (__runInitializers(this, _conditions_extraInitializers), __runInitializers(this, _benefit_initializers, void 0));
        is_active = (__runInitializers(this, _benefit_extraInitializers), __runInitializers(this, _is_active_initializers, void 0));
        constructor() {
            __runInitializers(this, _is_active_extraInitializers);
        }
    };
})();
exports.CreatePromotionDto = CreatePromotionDto;
let UpdatePromotionDto = (() => {
    let _code_decorators;
    let _code_initializers = [];
    let _code_extraInitializers = [];
    let _title_decorators;
    let _title_initializers = [];
    let _title_extraInitializers = [];
    let _kind_decorators;
    let _kind_initializers = [];
    let _kind_extraInitializers = [];
    let _valid_from_decorators;
    let _valid_from_initializers = [];
    let _valid_from_extraInitializers = [];
    let _valid_to_decorators;
    let _valid_to_initializers = [];
    let _valid_to_extraInitializers = [];
    let _priority_decorators;
    let _priority_initializers = [];
    let _priority_extraInitializers = [];
    let _allow_stacking_decorators;
    let _allow_stacking_initializers = [];
    let _allow_stacking_extraInitializers = [];
    let _max_discount_amount_decorators;
    let _max_discount_amount_initializers = [];
    let _max_discount_amount_extraInitializers = [];
    let _max_per_customer_per_day_decorators;
    let _max_per_customer_per_day_initializers = [];
    let _max_per_customer_per_day_extraInitializers = [];
    let _conditions_decorators;
    let _conditions_initializers = [];
    let _conditions_extraInitializers = [];
    let _benefit_decorators;
    let _benefit_initializers = [];
    let _benefit_extraInitializers = [];
    let _is_active_decorators;
    let _is_active_initializers = [];
    let _is_active_extraInitializers = [];
    return class UpdatePromotionDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _code_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.MaxLength)(64)];
            _title_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.MaxLength)(128)];
            _kind_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsIn)(exports.PROMOTION_KINDS)];
            _valid_from_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsDateString)()];
            _valid_to_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsDateString)()];
            _priority_decorators = [(0, class_validator_1.IsOptional)(), (0, class_transformer_1.Type)(() => Number), (0, class_validator_1.IsInt)(), (0, class_validator_1.Min)(0), (0, class_validator_1.Max)(32767)];
            _allow_stacking_decorators = [(0, class_validator_1.IsOptional)(), (0, class_transformer_1.Transform)(toBoolean), (0, class_validator_1.IsBoolean)()];
            _max_discount_amount_decorators = [(0, class_validator_1.IsOptional)(), (0, class_transformer_1.Transform)(toDecimalString), (0, class_validator_1.IsString)(), (0, class_validator_1.Matches)(DECIMAL_RE, DECIMAL)];
            _max_per_customer_per_day_decorators = [(0, class_validator_1.IsOptional)(), (0, class_transformer_1.Transform)(toDecimalString), (0, class_validator_1.IsString)(), (0, class_validator_1.Matches)(DECIMAL_RE, DECIMAL)];
            _conditions_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsObject)()];
            _benefit_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsObject)()];
            _is_active_decorators = [(0, class_validator_1.IsOptional)(), (0, class_transformer_1.Transform)(toBoolean), (0, class_validator_1.IsBoolean)()];
            __esDecorate(null, null, _code_decorators, { kind: "field", name: "code", static: false, private: false, access: { has: obj => "code" in obj, get: obj => obj.code, set: (obj, value) => { obj.code = value; } }, metadata: _metadata }, _code_initializers, _code_extraInitializers);
            __esDecorate(null, null, _title_decorators, { kind: "field", name: "title", static: false, private: false, access: { has: obj => "title" in obj, get: obj => obj.title, set: (obj, value) => { obj.title = value; } }, metadata: _metadata }, _title_initializers, _title_extraInitializers);
            __esDecorate(null, null, _kind_decorators, { kind: "field", name: "kind", static: false, private: false, access: { has: obj => "kind" in obj, get: obj => obj.kind, set: (obj, value) => { obj.kind = value; } }, metadata: _metadata }, _kind_initializers, _kind_extraInitializers);
            __esDecorate(null, null, _valid_from_decorators, { kind: "field", name: "valid_from", static: false, private: false, access: { has: obj => "valid_from" in obj, get: obj => obj.valid_from, set: (obj, value) => { obj.valid_from = value; } }, metadata: _metadata }, _valid_from_initializers, _valid_from_extraInitializers);
            __esDecorate(null, null, _valid_to_decorators, { kind: "field", name: "valid_to", static: false, private: false, access: { has: obj => "valid_to" in obj, get: obj => obj.valid_to, set: (obj, value) => { obj.valid_to = value; } }, metadata: _metadata }, _valid_to_initializers, _valid_to_extraInitializers);
            __esDecorate(null, null, _priority_decorators, { kind: "field", name: "priority", static: false, private: false, access: { has: obj => "priority" in obj, get: obj => obj.priority, set: (obj, value) => { obj.priority = value; } }, metadata: _metadata }, _priority_initializers, _priority_extraInitializers);
            __esDecorate(null, null, _allow_stacking_decorators, { kind: "field", name: "allow_stacking", static: false, private: false, access: { has: obj => "allow_stacking" in obj, get: obj => obj.allow_stacking, set: (obj, value) => { obj.allow_stacking = value; } }, metadata: _metadata }, _allow_stacking_initializers, _allow_stacking_extraInitializers);
            __esDecorate(null, null, _max_discount_amount_decorators, { kind: "field", name: "max_discount_amount", static: false, private: false, access: { has: obj => "max_discount_amount" in obj, get: obj => obj.max_discount_amount, set: (obj, value) => { obj.max_discount_amount = value; } }, metadata: _metadata }, _max_discount_amount_initializers, _max_discount_amount_extraInitializers);
            __esDecorate(null, null, _max_per_customer_per_day_decorators, { kind: "field", name: "max_per_customer_per_day", static: false, private: false, access: { has: obj => "max_per_customer_per_day" in obj, get: obj => obj.max_per_customer_per_day, set: (obj, value) => { obj.max_per_customer_per_day = value; } }, metadata: _metadata }, _max_per_customer_per_day_initializers, _max_per_customer_per_day_extraInitializers);
            __esDecorate(null, null, _conditions_decorators, { kind: "field", name: "conditions", static: false, private: false, access: { has: obj => "conditions" in obj, get: obj => obj.conditions, set: (obj, value) => { obj.conditions = value; } }, metadata: _metadata }, _conditions_initializers, _conditions_extraInitializers);
            __esDecorate(null, null, _benefit_decorators, { kind: "field", name: "benefit", static: false, private: false, access: { has: obj => "benefit" in obj, get: obj => obj.benefit, set: (obj, value) => { obj.benefit = value; } }, metadata: _metadata }, _benefit_initializers, _benefit_extraInitializers);
            __esDecorate(null, null, _is_active_decorators, { kind: "field", name: "is_active", static: false, private: false, access: { has: obj => "is_active" in obj, get: obj => obj.is_active, set: (obj, value) => { obj.is_active = value; } }, metadata: _metadata }, _is_active_initializers, _is_active_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        code = __runInitializers(this, _code_initializers, void 0);
        title = (__runInitializers(this, _code_extraInitializers), __runInitializers(this, _title_initializers, void 0));
        kind = (__runInitializers(this, _title_extraInitializers), __runInitializers(this, _kind_initializers, void 0));
        valid_from = (__runInitializers(this, _kind_extraInitializers), __runInitializers(this, _valid_from_initializers, void 0));
        valid_to = (__runInitializers(this, _valid_from_extraInitializers), __runInitializers(this, _valid_to_initializers, void 0));
        priority = (__runInitializers(this, _valid_to_extraInitializers), __runInitializers(this, _priority_initializers, void 0));
        allow_stacking = (__runInitializers(this, _priority_extraInitializers), __runInitializers(this, _allow_stacking_initializers, void 0));
        max_discount_amount = (__runInitializers(this, _allow_stacking_extraInitializers), __runInitializers(this, _max_discount_amount_initializers, void 0));
        max_per_customer_per_day = (__runInitializers(this, _max_discount_amount_extraInitializers), __runInitializers(this, _max_per_customer_per_day_initializers, void 0));
        conditions = (__runInitializers(this, _max_per_customer_per_day_extraInitializers), __runInitializers(this, _conditions_initializers, void 0));
        benefit = (__runInitializers(this, _conditions_extraInitializers), __runInitializers(this, _benefit_initializers, void 0));
        is_active = (__runInitializers(this, _benefit_extraInitializers), __runInitializers(this, _is_active_initializers, void 0));
        constructor() {
            __runInitializers(this, _is_active_extraInitializers);
        }
    };
})();
exports.UpdatePromotionDto = UpdatePromotionDto;
let ListPromotionsQueryDto = (() => {
    let _is_active_decorators;
    let _is_active_initializers = [];
    let _is_active_extraInitializers = [];
    let _cursor_decorators;
    let _cursor_initializers = [];
    let _cursor_extraInitializers = [];
    let _limit_decorators;
    let _limit_initializers = [];
    let _limit_extraInitializers = [];
    return class ListPromotionsQueryDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _is_active_decorators = [(0, class_validator_1.IsOptional)(), (0, class_transformer_1.Transform)(toBoolean), (0, class_validator_1.IsBoolean)()];
            _cursor_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.MaxLength)(256)];
            _limit_decorators = [(0, class_validator_1.IsOptional)(), (0, class_transformer_1.Type)(() => Number), (0, class_validator_1.IsInt)(), (0, class_validator_1.Min)(1), (0, class_validator_1.Max)(200)];
            __esDecorate(null, null, _is_active_decorators, { kind: "field", name: "is_active", static: false, private: false, access: { has: obj => "is_active" in obj, get: obj => obj.is_active, set: (obj, value) => { obj.is_active = value; } }, metadata: _metadata }, _is_active_initializers, _is_active_extraInitializers);
            __esDecorate(null, null, _cursor_decorators, { kind: "field", name: "cursor", static: false, private: false, access: { has: obj => "cursor" in obj, get: obj => obj.cursor, set: (obj, value) => { obj.cursor = value; } }, metadata: _metadata }, _cursor_initializers, _cursor_extraInitializers);
            __esDecorate(null, null, _limit_decorators, { kind: "field", name: "limit", static: false, private: false, access: { has: obj => "limit" in obj, get: obj => obj.limit, set: (obj, value) => { obj.limit = value; } }, metadata: _metadata }, _limit_initializers, _limit_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        is_active = __runInitializers(this, _is_active_initializers, void 0);
        cursor = (__runInitializers(this, _is_active_extraInitializers), __runInitializers(this, _cursor_initializers, void 0));
        limit = (__runInitializers(this, _cursor_extraInitializers), __runInitializers(this, _limit_initializers, 50));
        constructor() {
            __runInitializers(this, _limit_extraInitializers);
        }
    };
})();
exports.ListPromotionsQueryDto = ListPromotionsQueryDto;
