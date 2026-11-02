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
exports.UpdateLocationDto = exports.ListCustomersQueryDto = exports.UpdateCustomerDto = exports.CreateCustomerDto = exports.GeoPointDto = exports.LOCATION_SOURCES = exports.GEO_SOURCES = exports.CUSTOMER_STATUSES = exports.CUSTOMER_CHANNELS = void 0;
const mapped_types_1 = require("@nestjs/mapped-types");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
/** مقادیر مجاز channel — دقیقاً check قید جدول customer (مهاجرت 0007) */
exports.CUSTOMER_CHANNELS = ['retail', 'wholesale', 'chain', 'horeca', 'institution'];
/** مقادیر مجاز status — دقیقاً check قید جدول customer */
exports.CUSTOMER_STATUSES = ['active', 'suspended', 'blocked', 'closed'];
/** منشأ موقعیت در ستون‌های geo_* — check جدول customer (import فقط برای داده وارداتی) */
exports.GEO_SOURCES = ['gps', 'map_pick', 'geocode', 'import'];
/** منشأ ثبت موقعیت در /customers/{id}/location — enum قرارداد (بدون import) */
exports.LOCATION_SOURCES = ['gps', 'map_pick', 'geocode'];
/** پارامتر query بولینی openapi («true»/«false») را به boolean تبدیل می‌کند */
const toBoolean = ({ value }) => {
    if (value === 'true' || value === true)
        return true;
    if (value === 'false' || value === false)
        return false;
    return value;
};
/** openapi › schemas.GeoPoint — [طول، عرض] به WGS84 (محدوده دقیق در سرویس سنجیده می‌شود) */
let GeoPointDto = (() => {
    let _type_decorators;
    let _type_initializers = [];
    let _type_extraInitializers = [];
    let _coordinates_decorators;
    let _coordinates_initializers = [];
    let _coordinates_extraInitializers = [];
    return class GeoPointDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _type_decorators = [(0, class_validator_1.IsIn)(['Point'])];
            _coordinates_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsArray)(), (0, class_validator_1.ArrayMinSize)(2), (0, class_validator_1.ArrayMaxSize)(2), (0, class_validator_1.IsNumber)({}, { each: true })];
            __esDecorate(null, null, _type_decorators, { kind: "field", name: "type", static: false, private: false, access: { has: obj => "type" in obj, get: obj => obj.type, set: (obj, value) => { obj.type = value; } }, metadata: _metadata }, _type_initializers, _type_extraInitializers);
            __esDecorate(null, null, _coordinates_decorators, { kind: "field", name: "coordinates", static: false, private: false, access: { has: obj => "coordinates" in obj, get: obj => obj.coordinates, set: (obj, value) => { obj.coordinates = value; } }, metadata: _metadata }, _coordinates_initializers, _coordinates_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        type = __runInitializers(this, _type_initializers, void 0);
        coordinates = (__runInitializers(this, _type_extraInitializers), __runInitializers(this, _coordinates_initializers, void 0));
        constructor() {
            __runInitializers(this, _coordinates_extraInitializers);
        }
    };
})();
exports.GeoPointDto = GeoPointDto;
/**
 * POST /api/v1/customers — openapi › schemas.Customer
 * person_id و code طبق قرارداد الزامی‌اند؛ branch_id اختیاری است و شعبه
 * پیش‌فرض شرکت گرفته می‌شود (ستون branch_id NOT NULL است).
 */
let CreateCustomerDto = (() => {
    let _person_id_decorators;
    let _person_id_initializers = [];
    let _person_id_extraInitializers = [];
    let _branch_id_decorators;
    let _branch_id_initializers = [];
    let _branch_id_extraInitializers = [];
    let _code_decorators;
    let _code_initializers = [];
    let _code_extraInitializers = [];
    let _area_id_decorators;
    let _area_id_initializers = [];
    let _area_id_extraInitializers = [];
    let _route_id_decorators;
    let _route_id_initializers = [];
    let _route_id_extraInitializers = [];
    let _salesperson_id_decorators;
    let _salesperson_id_initializers = [];
    let _salesperson_id_extraInitializers = [];
    let _channel_decorators;
    let _channel_initializers = [];
    let _channel_extraInitializers = [];
    let _price_list_id_decorators;
    let _price_list_id_initializers = [];
    let _price_list_id_extraInitializers = [];
    let _settlement_term_id_decorators;
    let _settlement_term_id_initializers = [];
    let _settlement_term_id_extraInitializers = [];
    let _visit_sequence_decorators;
    let _visit_sequence_initializers = [];
    let _visit_sequence_extraInitializers = [];
    let _geo_decorators;
    let _geo_initializers = [];
    let _geo_extraInitializers = [];
    let _geo_accuracy_m_decorators;
    let _geo_accuracy_m_initializers = [];
    let _geo_accuracy_m_extraInitializers = [];
    let _geo_source_decorators;
    let _geo_source_initializers = [];
    let _geo_source_extraInitializers = [];
    let _credit_limit_decorators;
    let _credit_limit_initializers = [];
    let _credit_limit_extraInitializers = [];
    let _status_decorators;
    let _status_initializers = [];
    let _status_extraInitializers = [];
    return class CreateCustomerDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _person_id_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsUUID)('4')];
            _branch_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _code_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)(), (0, class_validator_1.MaxLength)(64)];
            _area_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _route_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _salesperson_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _channel_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsIn)(exports.CUSTOMER_CHANNELS)];
            _price_list_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _settlement_term_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _visit_sequence_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsInt)(), (0, class_validator_1.Min)(0)];
            _geo_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.ValidateNested)(), (0, class_transformer_1.Type)(() => GeoPointDto)];
            _geo_accuracy_m_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsNumber)(), (0, class_validator_1.Min)(0)];
            _geo_source_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsIn)(exports.GEO_SOURCES)];
            _credit_limit_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsNumberString)(), (0, class_validator_1.MaxLength)(32)];
            _status_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsIn)(exports.CUSTOMER_STATUSES)];
            __esDecorate(null, null, _person_id_decorators, { kind: "field", name: "person_id", static: false, private: false, access: { has: obj => "person_id" in obj, get: obj => obj.person_id, set: (obj, value) => { obj.person_id = value; } }, metadata: _metadata }, _person_id_initializers, _person_id_extraInitializers);
            __esDecorate(null, null, _branch_id_decorators, { kind: "field", name: "branch_id", static: false, private: false, access: { has: obj => "branch_id" in obj, get: obj => obj.branch_id, set: (obj, value) => { obj.branch_id = value; } }, metadata: _metadata }, _branch_id_initializers, _branch_id_extraInitializers);
            __esDecorate(null, null, _code_decorators, { kind: "field", name: "code", static: false, private: false, access: { has: obj => "code" in obj, get: obj => obj.code, set: (obj, value) => { obj.code = value; } }, metadata: _metadata }, _code_initializers, _code_extraInitializers);
            __esDecorate(null, null, _area_id_decorators, { kind: "field", name: "area_id", static: false, private: false, access: { has: obj => "area_id" in obj, get: obj => obj.area_id, set: (obj, value) => { obj.area_id = value; } }, metadata: _metadata }, _area_id_initializers, _area_id_extraInitializers);
            __esDecorate(null, null, _route_id_decorators, { kind: "field", name: "route_id", static: false, private: false, access: { has: obj => "route_id" in obj, get: obj => obj.route_id, set: (obj, value) => { obj.route_id = value; } }, metadata: _metadata }, _route_id_initializers, _route_id_extraInitializers);
            __esDecorate(null, null, _salesperson_id_decorators, { kind: "field", name: "salesperson_id", static: false, private: false, access: { has: obj => "salesperson_id" in obj, get: obj => obj.salesperson_id, set: (obj, value) => { obj.salesperson_id = value; } }, metadata: _metadata }, _salesperson_id_initializers, _salesperson_id_extraInitializers);
            __esDecorate(null, null, _channel_decorators, { kind: "field", name: "channel", static: false, private: false, access: { has: obj => "channel" in obj, get: obj => obj.channel, set: (obj, value) => { obj.channel = value; } }, metadata: _metadata }, _channel_initializers, _channel_extraInitializers);
            __esDecorate(null, null, _price_list_id_decorators, { kind: "field", name: "price_list_id", static: false, private: false, access: { has: obj => "price_list_id" in obj, get: obj => obj.price_list_id, set: (obj, value) => { obj.price_list_id = value; } }, metadata: _metadata }, _price_list_id_initializers, _price_list_id_extraInitializers);
            __esDecorate(null, null, _settlement_term_id_decorators, { kind: "field", name: "settlement_term_id", static: false, private: false, access: { has: obj => "settlement_term_id" in obj, get: obj => obj.settlement_term_id, set: (obj, value) => { obj.settlement_term_id = value; } }, metadata: _metadata }, _settlement_term_id_initializers, _settlement_term_id_extraInitializers);
            __esDecorate(null, null, _visit_sequence_decorators, { kind: "field", name: "visit_sequence", static: false, private: false, access: { has: obj => "visit_sequence" in obj, get: obj => obj.visit_sequence, set: (obj, value) => { obj.visit_sequence = value; } }, metadata: _metadata }, _visit_sequence_initializers, _visit_sequence_extraInitializers);
            __esDecorate(null, null, _geo_decorators, { kind: "field", name: "geo", static: false, private: false, access: { has: obj => "geo" in obj, get: obj => obj.geo, set: (obj, value) => { obj.geo = value; } }, metadata: _metadata }, _geo_initializers, _geo_extraInitializers);
            __esDecorate(null, null, _geo_accuracy_m_decorators, { kind: "field", name: "geo_accuracy_m", static: false, private: false, access: { has: obj => "geo_accuracy_m" in obj, get: obj => obj.geo_accuracy_m, set: (obj, value) => { obj.geo_accuracy_m = value; } }, metadata: _metadata }, _geo_accuracy_m_initializers, _geo_accuracy_m_extraInitializers);
            __esDecorate(null, null, _geo_source_decorators, { kind: "field", name: "geo_source", static: false, private: false, access: { has: obj => "geo_source" in obj, get: obj => obj.geo_source, set: (obj, value) => { obj.geo_source = value; } }, metadata: _metadata }, _geo_source_initializers, _geo_source_extraInitializers);
            __esDecorate(null, null, _credit_limit_decorators, { kind: "field", name: "credit_limit", static: false, private: false, access: { has: obj => "credit_limit" in obj, get: obj => obj.credit_limit, set: (obj, value) => { obj.credit_limit = value; } }, metadata: _metadata }, _credit_limit_initializers, _credit_limit_extraInitializers);
            __esDecorate(null, null, _status_decorators, { kind: "field", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status, set: (obj, value) => { obj.status = value; } }, metadata: _metadata }, _status_initializers, _status_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        person_id = __runInitializers(this, _person_id_initializers, void 0);
        branch_id = (__runInitializers(this, _person_id_extraInitializers), __runInitializers(this, _branch_id_initializers, void 0));
        code = (__runInitializers(this, _branch_id_extraInitializers), __runInitializers(this, _code_initializers, void 0));
        area_id = (__runInitializers(this, _code_extraInitializers), __runInitializers(this, _area_id_initializers, void 0));
        route_id = (__runInitializers(this, _area_id_extraInitializers), __runInitializers(this, _route_id_initializers, void 0));
        /** ویزیتور ثابت — شناسه ردیف staff (قرارداد salesperson_id) */
        salesperson_id = (__runInitializers(this, _route_id_extraInitializers), __runInitializers(this, _salesperson_id_initializers, void 0));
        channel = (__runInitializers(this, _salesperson_id_extraInitializers), __runInitializers(this, _channel_initializers, void 0));
        price_list_id = (__runInitializers(this, _channel_extraInitializers), __runInitializers(this, _price_list_id_initializers, void 0));
        settlement_term_id = (__runInitializers(this, _price_list_id_extraInitializers), __runInitializers(this, _settlement_term_id_initializers, void 0));
        visit_sequence = (__runInitializers(this, _settlement_term_id_extraInitializers), __runInitializers(this, _visit_sequence_initializers, void 0));
        geo = (__runInitializers(this, _visit_sequence_extraInitializers), __runInitializers(this, _geo_initializers, void 0));
        geo_accuracy_m = (__runInitializers(this, _geo_extraInitializers), __runInitializers(this, _geo_accuracy_m_initializers, void 0));
        geo_source = (__runInitializers(this, _geo_accuracy_m_extraInitializers), __runInitializers(this, _geo_source_initializers, void 0));
        /** سقف اعتبار به رشته اعشاری (طبق قرارداد) — در customer_credit ذخیره می‌شود */
        credit_limit = (__runInitializers(this, _geo_source_extraInitializers), __runInitializers(this, _credit_limit_initializers, void 0));
        status = (__runInitializers(this, _credit_limit_extraInitializers), __runInitializers(this, _status_initializers, void 0));
        constructor() {
            __runInitializers(this, _status_extraInitializers);
        }
    };
})();
exports.CreateCustomerDto = CreateCustomerDto;
/** PATCH /api/v1/customers/{id} — همه فیلدها اختیاری */
class UpdateCustomerDto extends (0, mapped_types_1.PartialType)(CreateCustomerDto) {
}
exports.UpdateCustomerDto = UpdateCustomerDto;
/** GET /api/v1/customers — فیلترهای قرارداد + صفحه‌بندی cursor */
let ListCustomersQueryDto = (() => {
    let _q_decorators;
    let _q_initializers = [];
    let _q_extraInitializers = [];
    let _route_id_decorators;
    let _route_id_initializers = [];
    let _route_id_extraInitializers = [];
    let _area_id_decorators;
    let _area_id_initializers = [];
    let _area_id_extraInitializers = [];
    let _salesperson_id_decorators;
    let _salesperson_id_initializers = [];
    let _salesperson_id_extraInitializers = [];
    let _channel_decorators;
    let _channel_initializers = [];
    let _channel_extraInitializers = [];
    let _has_location_decorators;
    let _has_location_initializers = [];
    let _has_location_extraInitializers = [];
    let _cursor_decorators;
    let _cursor_initializers = [];
    let _cursor_extraInitializers = [];
    let _limit_decorators;
    let _limit_initializers = [];
    let _limit_extraInitializers = [];
    return class ListCustomersQueryDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _q_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.MaxLength)(128)];
            _route_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _area_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _salesperson_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _channel_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsIn)(exports.CUSTOMER_CHANNELS)];
            _has_location_decorators = [(0, class_validator_1.IsOptional)(), (0, class_transformer_1.Transform)(toBoolean), (0, class_validator_1.IsBoolean)()];
            _cursor_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)()];
            _limit_decorators = [(0, class_validator_1.IsOptional)(), (0, class_transformer_1.Type)(() => Number), (0, class_validator_1.IsInt)(), (0, class_validator_1.Min)(1), (0, class_validator_1.Max)(200)];
            __esDecorate(null, null, _q_decorators, { kind: "field", name: "q", static: false, private: false, access: { has: obj => "q" in obj, get: obj => obj.q, set: (obj, value) => { obj.q = value; } }, metadata: _metadata }, _q_initializers, _q_extraInitializers);
            __esDecorate(null, null, _route_id_decorators, { kind: "field", name: "route_id", static: false, private: false, access: { has: obj => "route_id" in obj, get: obj => obj.route_id, set: (obj, value) => { obj.route_id = value; } }, metadata: _metadata }, _route_id_initializers, _route_id_extraInitializers);
            __esDecorate(null, null, _area_id_decorators, { kind: "field", name: "area_id", static: false, private: false, access: { has: obj => "area_id" in obj, get: obj => obj.area_id, set: (obj, value) => { obj.area_id = value; } }, metadata: _metadata }, _area_id_initializers, _area_id_extraInitializers);
            __esDecorate(null, null, _salesperson_id_decorators, { kind: "field", name: "salesperson_id", static: false, private: false, access: { has: obj => "salesperson_id" in obj, get: obj => obj.salesperson_id, set: (obj, value) => { obj.salesperson_id = value; } }, metadata: _metadata }, _salesperson_id_initializers, _salesperson_id_extraInitializers);
            __esDecorate(null, null, _channel_decorators, { kind: "field", name: "channel", static: false, private: false, access: { has: obj => "channel" in obj, get: obj => obj.channel, set: (obj, value) => { obj.channel = value; } }, metadata: _metadata }, _channel_initializers, _channel_extraInitializers);
            __esDecorate(null, null, _has_location_decorators, { kind: "field", name: "has_location", static: false, private: false, access: { has: obj => "has_location" in obj, get: obj => obj.has_location, set: (obj, value) => { obj.has_location = value; } }, metadata: _metadata }, _has_location_initializers, _has_location_extraInitializers);
            __esDecorate(null, null, _cursor_decorators, { kind: "field", name: "cursor", static: false, private: false, access: { has: obj => "cursor" in obj, get: obj => obj.cursor, set: (obj, value) => { obj.cursor = value; } }, metadata: _metadata }, _cursor_initializers, _cursor_extraInitializers);
            __esDecorate(null, null, _limit_decorators, { kind: "field", name: "limit", static: false, private: false, access: { has: obj => "limit" in obj, get: obj => obj.limit, set: (obj, value) => { obj.limit = value; } }, metadata: _metadata }, _limit_initializers, _limit_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        /** جست‌وجوی فازی روی کد و نام شخص */
        q = __runInitializers(this, _q_initializers, void 0);
        route_id = (__runInitializers(this, _q_extraInitializers), __runInitializers(this, _route_id_initializers, void 0));
        area_id = (__runInitializers(this, _route_id_extraInitializers), __runInitializers(this, _area_id_initializers, void 0));
        salesperson_id = (__runInitializers(this, _area_id_extraInitializers), __runInitializers(this, _salesperson_id_initializers, void 0));
        channel = (__runInitializers(this, _salesperson_id_extraInitializers), __runInitializers(this, _channel_initializers, void 0));
        /** فقط دارای موقعیت ثبت‌شده */
        has_location = (__runInitializers(this, _channel_extraInitializers), __runInitializers(this, _has_location_initializers, void 0));
        cursor = (__runInitializers(this, _has_location_extraInitializers), __runInitializers(this, _cursor_initializers, void 0));
        limit = (__runInitializers(this, _cursor_extraInitializers), __runInitializers(this, _limit_initializers, 50));
        constructor() {
            __runInitializers(this, _limit_extraInitializers);
        }
    };
})();
exports.ListCustomersQueryDto = ListCustomersQueryDto;
/** PUT /api/v1/customers/{id}/location — openapi › ثبت/تصحیح موقعیت روی نقشه */
let UpdateLocationDto = (() => {
    let _geo_decorators;
    let _geo_initializers = [];
    let _geo_extraInitializers = [];
    let _accuracy_m_decorators;
    let _accuracy_m_initializers = [];
    let _accuracy_m_extraInitializers = [];
    let _source_decorators;
    let _source_initializers = [];
    let _source_extraInitializers = [];
    return class UpdateLocationDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _geo_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.ValidateNested)(), (0, class_transformer_1.Type)(() => GeoPointDto)];
            _accuracy_m_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsNumber)(), (0, class_validator_1.Min)(0)];
            _source_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsIn)(exports.LOCATION_SOURCES)];
            __esDecorate(null, null, _geo_decorators, { kind: "field", name: "geo", static: false, private: false, access: { has: obj => "geo" in obj, get: obj => obj.geo, set: (obj, value) => { obj.geo = value; } }, metadata: _metadata }, _geo_initializers, _geo_extraInitializers);
            __esDecorate(null, null, _accuracy_m_decorators, { kind: "field", name: "accuracy_m", static: false, private: false, access: { has: obj => "accuracy_m" in obj, get: obj => obj.accuracy_m, set: (obj, value) => { obj.accuracy_m = value; } }, metadata: _metadata }, _accuracy_m_initializers, _accuracy_m_extraInitializers);
            __esDecorate(null, null, _source_decorators, { kind: "field", name: "source", static: false, private: false, access: { has: obj => "source" in obj, get: obj => obj.source, set: (obj, value) => { obj.source = value; } }, metadata: _metadata }, _source_initializers, _source_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        geo = __runInitializers(this, _geo_initializers, void 0);
        accuracy_m = (__runInitializers(this, _geo_extraInitializers), __runInitializers(this, _accuracy_m_initializers, void 0));
        source = (__runInitializers(this, _accuracy_m_extraInitializers), __runInitializers(this, _source_initializers, void 0));
        constructor() {
            __runInitializers(this, _source_extraInitializers);
        }
    };
})();
exports.UpdateLocationDto = UpdateLocationDto;
