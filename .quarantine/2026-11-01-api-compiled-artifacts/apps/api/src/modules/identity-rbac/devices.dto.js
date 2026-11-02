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
exports.ListDevicesQueryDto = exports.CreateDeviceDto = exports.DEVICE_APP_KINDS = exports.DEVICE_PLATFORMS = void 0;
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
/** مقادیر مجاز قیدهای جدول device (مهاجرت 0012) */
exports.DEVICE_PLATFORMS = ['android'];
exports.DEVICE_APP_KINDS = ['sales', 'delivery', 'telesales'];
/** POST /api/v1/devices — openapi › schemas.DeviceCreate */
let CreateDeviceDto = (() => {
    let _device_uuid_decorators;
    let _device_uuid_initializers = [];
    let _device_uuid_extraInitializers = [];
    let _platform_decorators;
    let _platform_initializers = [];
    let _platform_extraInitializers = [];
    let _app_kind_decorators;
    let _app_kind_initializers = [];
    let _app_kind_extraInitializers = [];
    let _app_version_decorators;
    let _app_version_initializers = [];
    let _app_version_extraInitializers = [];
    let _os_version_decorators;
    let _os_version_initializers = [];
    let _os_version_extraInitializers = [];
    let _push_token_decorators;
    let _push_token_initializers = [];
    let _push_token_extraInitializers = [];
    return class CreateDeviceDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _device_uuid_decorators = [(0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)(), (0, class_validator_1.MaxLength)(128)];
            _platform_decorators = [(0, class_validator_1.IsIn)(exports.DEVICE_PLATFORMS)];
            _app_kind_decorators = [(0, class_validator_1.IsIn)(exports.DEVICE_APP_KINDS)];
            _app_version_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.MaxLength)(32)];
            _os_version_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.MaxLength)(32)];
            _push_token_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.MaxLength)(512)];
            __esDecorate(null, null, _device_uuid_decorators, { kind: "field", name: "device_uuid", static: false, private: false, access: { has: obj => "device_uuid" in obj, get: obj => obj.device_uuid, set: (obj, value) => { obj.device_uuid = value; } }, metadata: _metadata }, _device_uuid_initializers, _device_uuid_extraInitializers);
            __esDecorate(null, null, _platform_decorators, { kind: "field", name: "platform", static: false, private: false, access: { has: obj => "platform" in obj, get: obj => obj.platform, set: (obj, value) => { obj.platform = value; } }, metadata: _metadata }, _platform_initializers, _platform_extraInitializers);
            __esDecorate(null, null, _app_kind_decorators, { kind: "field", name: "app_kind", static: false, private: false, access: { has: obj => "app_kind" in obj, get: obj => obj.app_kind, set: (obj, value) => { obj.app_kind = value; } }, metadata: _metadata }, _app_kind_initializers, _app_kind_extraInitializers);
            __esDecorate(null, null, _app_version_decorators, { kind: "field", name: "app_version", static: false, private: false, access: { has: obj => "app_version" in obj, get: obj => obj.app_version, set: (obj, value) => { obj.app_version = value; } }, metadata: _metadata }, _app_version_initializers, _app_version_extraInitializers);
            __esDecorate(null, null, _os_version_decorators, { kind: "field", name: "os_version", static: false, private: false, access: { has: obj => "os_version" in obj, get: obj => obj.os_version, set: (obj, value) => { obj.os_version = value; } }, metadata: _metadata }, _os_version_initializers, _os_version_extraInitializers);
            __esDecorate(null, null, _push_token_decorators, { kind: "field", name: "push_token", static: false, private: false, access: { has: obj => "push_token" in obj, get: obj => obj.push_token, set: (obj, value) => { obj.push_token = value; } }, metadata: _metadata }, _push_token_initializers, _push_token_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        /** شناسه سخت‌افزاری/نصب اپ؛ برای هر کاربر یکتاست (uq_device) */
        device_uuid = __runInitializers(this, _device_uuid_initializers, void 0);
        platform = (__runInitializers(this, _device_uuid_extraInitializers), __runInitializers(this, _platform_initializers, void 0));
        app_kind = (__runInitializers(this, _platform_extraInitializers), __runInitializers(this, _app_kind_initializers, void 0));
        app_version = (__runInitializers(this, _app_kind_extraInitializers), __runInitializers(this, _app_version_initializers, void 0));
        os_version = (__runInitializers(this, _app_version_extraInitializers), __runInitializers(this, _os_version_initializers, void 0));
        push_token = (__runInitializers(this, _os_version_extraInitializers), __runInitializers(this, _push_token_initializers, void 0));
        constructor() {
            __runInitializers(this, _push_token_extraInitializers);
        }
    };
})();
exports.CreateDeviceDto = CreateDeviceDto;
/** GET /api/v1/devices — cursor و limit طبق پارامترهای استاندارد سند */
let ListDevicesQueryDto = (() => {
    let _cursor_decorators;
    let _cursor_initializers = [];
    let _cursor_extraInitializers = [];
    let _limit_decorators;
    let _limit_initializers = [];
    let _limit_extraInitializers = [];
    return class ListDevicesQueryDto {
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
exports.ListDevicesQueryDto = ListDevicesQueryDto;
