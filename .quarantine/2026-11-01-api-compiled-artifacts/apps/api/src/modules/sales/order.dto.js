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
exports.ListOrdersQueryDto = exports.UpdateOrderDto = exports.CreateOrderDto = exports.OrderLineDto = exports.ORDER_CHANNELS = exports.ORDER_STATUSES = void 0;
const mapped_types_1 = require("@nestjs/mapped-types");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
/** مقادیر مجاز status — دقیقاً check قید جدول sales_order (مهاجرت 0010) */
exports.ORDER_STATUSES = [
    'draft',
    'pending_approval',
    'approved',
    'partially_delivered',
    'delivered',
    'invoiced',
    'cancelled',
    'rejected',
];
/** مقادیر مجاز channel — دقیقاً check قید جدول sales_order */
exports.ORDER_CHANNELS = ['field', 'telesale', 'portal', 'walk_in'];
/** فیلدهای مبلغی قرارداد از نوع string هستند؛ عددِ احتمالی کلاینت به رشته تبدیل می‌شود */
const toNumericString = ({ value }) => typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
/** قلم سفارش — openapi › SalesOrder.lines */
let OrderLineDto = (() => {
    let _product_id_decorators;
    let _product_id_initializers = [];
    let _product_id_extraInitializers = [];
    let _qty_decorators;
    let _qty_initializers = [];
    let _qty_extraInitializers = [];
    let _packaging_id_decorators;
    let _packaging_id_initializers = [];
    let _packaging_id_extraInitializers = [];
    let _unit_price_decorators;
    let _unit_price_initializers = [];
    let _unit_price_extraInitializers = [];
    let _discount_amount_decorators;
    let _discount_amount_initializers = [];
    let _discount_amount_extraInitializers = [];
    return class OrderLineDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _product_id_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsUUID)('4')];
            _qty_decorators = [(0, class_validator_1.IsDefined)(), (0, class_transformer_1.Type)(() => Number), (0, class_validator_1.IsNumber)(), (0, class_validator_1.Min)(0.0001), (0, class_validator_1.Max)(999999)];
            _packaging_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _unit_price_decorators = [(0, class_validator_1.IsOptional)(), (0, class_transformer_1.Transform)(toNumericString), (0, class_validator_1.IsNumberString)()];
            _discount_amount_decorators = [(0, class_validator_1.IsOptional)(), (0, class_transformer_1.Transform)(toNumericString), (0, class_validator_1.IsNumberString)()];
            __esDecorate(null, null, _product_id_decorators, { kind: "field", name: "product_id", static: false, private: false, access: { has: obj => "product_id" in obj, get: obj => obj.product_id, set: (obj, value) => { obj.product_id = value; } }, metadata: _metadata }, _product_id_initializers, _product_id_extraInitializers);
            __esDecorate(null, null, _qty_decorators, { kind: "field", name: "qty", static: false, private: false, access: { has: obj => "qty" in obj, get: obj => obj.qty, set: (obj, value) => { obj.qty = value; } }, metadata: _metadata }, _qty_initializers, _qty_extraInitializers);
            __esDecorate(null, null, _packaging_id_decorators, { kind: "field", name: "packaging_id", static: false, private: false, access: { has: obj => "packaging_id" in obj, get: obj => obj.packaging_id, set: (obj, value) => { obj.packaging_id = value; } }, metadata: _metadata }, _packaging_id_initializers, _packaging_id_extraInitializers);
            __esDecorate(null, null, _unit_price_decorators, { kind: "field", name: "unit_price", static: false, private: false, access: { has: obj => "unit_price" in obj, get: obj => obj.unit_price, set: (obj, value) => { obj.unit_price = value; } }, metadata: _metadata }, _unit_price_initializers, _unit_price_extraInitializers);
            __esDecorate(null, null, _discount_amount_decorators, { kind: "field", name: "discount_amount", static: false, private: false, access: { has: obj => "discount_amount" in obj, get: obj => obj.discount_amount, set: (obj, value) => { obj.discount_amount = value; } }, metadata: _metadata }, _discount_amount_initializers, _discount_amount_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        product_id = __runInitializers(this, _product_id_initializers, void 0);
        qty = (__runInitializers(this, _product_id_extraInitializers), __runInitializers(this, _qty_initializers, void 0));
        packaging_id = (__runInitializers(this, _qty_extraInitializers), __runInitializers(this, _packaging_id_initializers, void 0));
        /** قیمت محاسبه‌شده لحظه ثبت؛ نیامد از لیست قیمت مشتری/سفارش خوانده می‌شود */
        unit_price = (__runInitializers(this, _packaging_id_extraInitializers), __runInitializers(this, _unit_price_initializers, void 0));
        discount_amount = (__runInitializers(this, _unit_price_extraInitializers), __runInitializers(this, _discount_amount_initializers, void 0));
        constructor() {
            __runInitializers(this, _discount_amount_extraInitializers);
        }
    };
})();
exports.OrderLineDto = OrderLineDto;
/**
 * POST /orders — openapi › schemas.SalesOrder.
 * فقط customer_id و order_date طبق قرارداد الزامی است؛ مبالغ و وضعیت محاسبه/تولید می‌شوند.
 */
let CreateOrderDto = (() => {
    let _customer_id_decorators;
    let _customer_id_initializers = [];
    let _customer_id_extraInitializers = [];
    let _order_date_decorators;
    let _order_date_initializers = [];
    let _order_date_extraInitializers = [];
    let _request_id_decorators;
    let _request_id_initializers = [];
    let _request_id_extraInitializers = [];
    let _salesperson_id_decorators;
    let _salesperson_id_initializers = [];
    let _salesperson_id_extraInitializers = [];
    let _tour_id_decorators;
    let _tour_id_initializers = [];
    let _tour_id_extraInitializers = [];
    let _channel_decorators;
    let _channel_initializers = [];
    let _channel_extraInitializers = [];
    let _delivery_date_decorators;
    let _delivery_date_initializers = [];
    let _delivery_date_extraInitializers = [];
    let _price_list_id_decorators;
    let _price_list_id_initializers = [];
    let _price_list_id_extraInitializers = [];
    let _settlement_term_id_decorators;
    let _settlement_term_id_initializers = [];
    let _settlement_term_id_extraInitializers = [];
    let _note_decorators;
    let _note_initializers = [];
    let _note_extraInitializers = [];
    let _client_uuid_decorators;
    let _client_uuid_initializers = [];
    let _client_uuid_extraInitializers = [];
    let _lines_decorators;
    let _lines_initializers = [];
    let _lines_extraInitializers = [];
    return class CreateOrderDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _customer_id_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsUUID)('4')];
            _order_date_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsDateString)()];
            _request_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _salesperson_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _tour_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _channel_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsIn)(exports.ORDER_CHANNELS)];
            _delivery_date_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsDateString)()];
            _price_list_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _settlement_term_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _note_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.MaxLength)(500)];
            _client_uuid_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _lines_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsArray)(), (0, class_validator_1.ValidateNested)({ each: true }), (0, class_transformer_1.Type)(() => OrderLineDto)];
            __esDecorate(null, null, _customer_id_decorators, { kind: "field", name: "customer_id", static: false, private: false, access: { has: obj => "customer_id" in obj, get: obj => obj.customer_id, set: (obj, value) => { obj.customer_id = value; } }, metadata: _metadata }, _customer_id_initializers, _customer_id_extraInitializers);
            __esDecorate(null, null, _order_date_decorators, { kind: "field", name: "order_date", static: false, private: false, access: { has: obj => "order_date" in obj, get: obj => obj.order_date, set: (obj, value) => { obj.order_date = value; } }, metadata: _metadata }, _order_date_initializers, _order_date_extraInitializers);
            __esDecorate(null, null, _request_id_decorators, { kind: "field", name: "request_id", static: false, private: false, access: { has: obj => "request_id" in obj, get: obj => obj.request_id, set: (obj, value) => { obj.request_id = value; } }, metadata: _metadata }, _request_id_initializers, _request_id_extraInitializers);
            __esDecorate(null, null, _salesperson_id_decorators, { kind: "field", name: "salesperson_id", static: false, private: false, access: { has: obj => "salesperson_id" in obj, get: obj => obj.salesperson_id, set: (obj, value) => { obj.salesperson_id = value; } }, metadata: _metadata }, _salesperson_id_initializers, _salesperson_id_extraInitializers);
            __esDecorate(null, null, _tour_id_decorators, { kind: "field", name: "tour_id", static: false, private: false, access: { has: obj => "tour_id" in obj, get: obj => obj.tour_id, set: (obj, value) => { obj.tour_id = value; } }, metadata: _metadata }, _tour_id_initializers, _tour_id_extraInitializers);
            __esDecorate(null, null, _channel_decorators, { kind: "field", name: "channel", static: false, private: false, access: { has: obj => "channel" in obj, get: obj => obj.channel, set: (obj, value) => { obj.channel = value; } }, metadata: _metadata }, _channel_initializers, _channel_extraInitializers);
            __esDecorate(null, null, _delivery_date_decorators, { kind: "field", name: "delivery_date", static: false, private: false, access: { has: obj => "delivery_date" in obj, get: obj => obj.delivery_date, set: (obj, value) => { obj.delivery_date = value; } }, metadata: _metadata }, _delivery_date_initializers, _delivery_date_extraInitializers);
            __esDecorate(null, null, _price_list_id_decorators, { kind: "field", name: "price_list_id", static: false, private: false, access: { has: obj => "price_list_id" in obj, get: obj => obj.price_list_id, set: (obj, value) => { obj.price_list_id = value; } }, metadata: _metadata }, _price_list_id_initializers, _price_list_id_extraInitializers);
            __esDecorate(null, null, _settlement_term_id_decorators, { kind: "field", name: "settlement_term_id", static: false, private: false, access: { has: obj => "settlement_term_id" in obj, get: obj => obj.settlement_term_id, set: (obj, value) => { obj.settlement_term_id = value; } }, metadata: _metadata }, _settlement_term_id_initializers, _settlement_term_id_extraInitializers);
            __esDecorate(null, null, _note_decorators, { kind: "field", name: "note", static: false, private: false, access: { has: obj => "note" in obj, get: obj => obj.note, set: (obj, value) => { obj.note = value; } }, metadata: _metadata }, _note_initializers, _note_extraInitializers);
            __esDecorate(null, null, _client_uuid_decorators, { kind: "field", name: "client_uuid", static: false, private: false, access: { has: obj => "client_uuid" in obj, get: obj => obj.client_uuid, set: (obj, value) => { obj.client_uuid = value; } }, metadata: _metadata }, _client_uuid_initializers, _client_uuid_extraInitializers);
            __esDecorate(null, null, _lines_decorators, { kind: "field", name: "lines", static: false, private: false, access: { has: obj => "lines" in obj, get: obj => obj.lines, set: (obj, value) => { obj.lines = value; } }, metadata: _metadata }, _lines_initializers, _lines_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        customer_id = __runInitializers(this, _customer_id_initializers, void 0);
        order_date = (__runInitializers(this, _customer_id_extraInitializers), __runInitializers(this, _order_date_initializers, void 0));
        request_id = (__runInitializers(this, _order_date_extraInitializers), __runInitializers(this, _request_id_initializers, void 0));
        salesperson_id = (__runInitializers(this, _request_id_extraInitializers), __runInitializers(this, _salesperson_id_initializers, void 0));
        tour_id = (__runInitializers(this, _salesperson_id_extraInitializers), __runInitializers(this, _tour_id_initializers, void 0));
        channel = (__runInitializers(this, _tour_id_extraInitializers), __runInitializers(this, _channel_initializers, void 0));
        delivery_date = (__runInitializers(this, _channel_extraInitializers), __runInitializers(this, _delivery_date_initializers, void 0));
        price_list_id = (__runInitializers(this, _delivery_date_extraInitializers), __runInitializers(this, _price_list_id_initializers, void 0));
        settlement_term_id = (__runInitializers(this, _price_list_id_extraInitializers), __runInitializers(this, _settlement_term_id_initializers, void 0));
        note = (__runInitializers(this, _settlement_term_id_extraInitializers), __runInitializers(this, _note_initializers, void 0));
        /** کلید همگام‌سازی آفلاین — تکرارش 409 می‌دهد (ایندکس یکتای سند) */
        client_uuid = (__runInitializers(this, _note_extraInitializers), __runInitializers(this, _client_uuid_initializers, void 0));
        lines = (__runInitializers(this, _client_uuid_extraInitializers), __runInitializers(this, _lines_initializers, void 0));
        constructor() {
            __runInitializers(this, _lines_extraInitializers);
        }
    };
})();
exports.CreateOrderDto = CreateOrderDto;
/** PATCH /orders/{id} — فقط پیش از تأیید (draft) مجاز است؛ اقلام جایگزین می‌شوند */
class UpdateOrderDto extends (0, mapped_types_1.PartialType)(CreateOrderDto) {
}
exports.UpdateOrderDto = UpdateOrderDto;
let ListOrdersQueryDto = (() => {
    let _cursor_decorators;
    let _cursor_initializers = [];
    let _cursor_extraInitializers = [];
    let _limit_decorators;
    let _limit_initializers = [];
    let _limit_extraInitializers = [];
    let _customer_id_decorators;
    let _customer_id_initializers = [];
    let _customer_id_extraInitializers = [];
    let _tour_id_decorators;
    let _tour_id_initializers = [];
    let _tour_id_extraInitializers = [];
    let _status_decorators;
    let _status_initializers = [];
    let _status_extraInitializers = [];
    let _order_date_decorators;
    let _order_date_initializers = [];
    let _order_date_extraInitializers = [];
    return class ListOrdersQueryDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _cursor_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.MaxLength)(256)];
            _limit_decorators = [(0, class_validator_1.IsOptional)(), (0, class_transformer_1.Type)(() => Number), (0, class_validator_1.IsInt)(), (0, class_validator_1.Min)(1), (0, class_validator_1.Max)(200)];
            _customer_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _tour_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _status_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsIn)(exports.ORDER_STATUSES)];
            _order_date_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsDateString)()];
            __esDecorate(null, null, _cursor_decorators, { kind: "field", name: "cursor", static: false, private: false, access: { has: obj => "cursor" in obj, get: obj => obj.cursor, set: (obj, value) => { obj.cursor = value; } }, metadata: _metadata }, _cursor_initializers, _cursor_extraInitializers);
            __esDecorate(null, null, _limit_decorators, { kind: "field", name: "limit", static: false, private: false, access: { has: obj => "limit" in obj, get: obj => obj.limit, set: (obj, value) => { obj.limit = value; } }, metadata: _metadata }, _limit_initializers, _limit_extraInitializers);
            __esDecorate(null, null, _customer_id_decorators, { kind: "field", name: "customer_id", static: false, private: false, access: { has: obj => "customer_id" in obj, get: obj => obj.customer_id, set: (obj, value) => { obj.customer_id = value; } }, metadata: _metadata }, _customer_id_initializers, _customer_id_extraInitializers);
            __esDecorate(null, null, _tour_id_decorators, { kind: "field", name: "tour_id", static: false, private: false, access: { has: obj => "tour_id" in obj, get: obj => obj.tour_id, set: (obj, value) => { obj.tour_id = value; } }, metadata: _metadata }, _tour_id_initializers, _tour_id_extraInitializers);
            __esDecorate(null, null, _status_decorators, { kind: "field", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status, set: (obj, value) => { obj.status = value; } }, metadata: _metadata }, _status_initializers, _status_extraInitializers);
            __esDecorate(null, null, _order_date_decorators, { kind: "field", name: "order_date", static: false, private: false, access: { has: obj => "order_date" in obj, get: obj => obj.order_date, set: (obj, value) => { obj.order_date = value; } }, metadata: _metadata }, _order_date_initializers, _order_date_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        cursor = __runInitializers(this, _cursor_initializers, void 0);
        limit = (__runInitializers(this, _cursor_extraInitializers), __runInitializers(this, _limit_initializers, 50));
        customer_id = (__runInitializers(this, _limit_extraInitializers), __runInitializers(this, _customer_id_initializers, void 0));
        tour_id = (__runInitializers(this, _customer_id_extraInitializers), __runInitializers(this, _tour_id_initializers, void 0));
        status = (__runInitializers(this, _tour_id_extraInitializers), __runInitializers(this, _status_initializers, void 0));
        order_date = (__runInitializers(this, _status_extraInitializers), __runInitializers(this, _order_date_initializers, void 0));
        constructor() {
            __runInitializers(this, _order_date_extraInitializers);
        }
    };
})();
exports.ListOrdersQueryDto = ListOrdersQueryDto;
