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
exports.PasswordResetDto = exports.OtpVerifyDto = exports.OtpRequestDto = exports.OTP_PURPOSES = exports.RefreshDto = exports.LoginDto = void 0;
const class_validator_1 = require("class-validator");
/** POST /api/v1/auth/login — openapi › LoginRequest (username الزامی، رمز و OTP اختیاری) */
let LoginDto = (() => {
    let _username_decorators;
    let _username_initializers = [];
    let _username_extraInitializers = [];
    let _password_decorators;
    let _password_initializers = [];
    let _password_extraInitializers = [];
    let _otp_code_decorators;
    let _otp_code_initializers = [];
    let _otp_code_extraInitializers = [];
    return class LoginDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _username_decorators = [(0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)(), (0, class_validator_1.MaxLength)(64)];
            _password_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.MaxLength)(256)];
            _otp_code_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.MaxLength)(8)];
            __esDecorate(null, null, _username_decorators, { kind: "field", name: "username", static: false, private: false, access: { has: obj => "username" in obj, get: obj => obj.username, set: (obj, value) => { obj.username = value; } }, metadata: _metadata }, _username_initializers, _username_extraInitializers);
            __esDecorate(null, null, _password_decorators, { kind: "field", name: "password", static: false, private: false, access: { has: obj => "password" in obj, get: obj => obj.password, set: (obj, value) => { obj.password = value; } }, metadata: _metadata }, _password_initializers, _password_extraInitializers);
            __esDecorate(null, null, _otp_code_decorators, { kind: "field", name: "otp_code", static: false, private: false, access: { has: obj => "otp_code" in obj, get: obj => obj.otp_code, set: (obj, value) => { obj.otp_code = value; } }, metadata: _metadata }, _otp_code_initializers, _otp_code_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        username = __runInitializers(this, _username_initializers, void 0);
        password = (__runInitializers(this, _username_extraInitializers), __runInitializers(this, _password_initializers, void 0));
        /**
         * کد پیامکی در ورود با رمز — ورودِ صرفاً OTP مسیر جدا دارد:
         * POST /auth/otp/request و POST /auth/otp/verify (پیاده‌شده در همین ماژول).
         */
        otp_code = (__runInitializers(this, _password_extraInitializers), __runInitializers(this, _otp_code_initializers, void 0));
        constructor() {
            __runInitializers(this, _otp_code_extraInitializers);
        }
    };
})();
exports.LoginDto = LoginDto;
/** POST /api/v1/auth/refresh — openapi › { refresh_token } */
let RefreshDto = (() => {
    let _refresh_token_decorators;
    let _refresh_token_initializers = [];
    let _refresh_token_extraInitializers = [];
    return class RefreshDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _refresh_token_decorators = [(0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)(), (0, class_validator_1.MaxLength)(512)];
            __esDecorate(null, null, _refresh_token_decorators, { kind: "field", name: "refresh_token", static: false, private: false, access: { has: obj => "refresh_token" in obj, get: obj => obj.refresh_token, set: (obj, value) => { obj.refresh_token = value; } }, metadata: _metadata }, _refresh_token_initializers, _refresh_token_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        refresh_token = __runInitializers(this, _refresh_token_initializers, void 0);
        constructor() {
            __runInitializers(this, _refresh_token_extraInitializers);
        }
    };
})();
exports.RefreshDto = RefreshDto;
/** دلایل درخواست کد — openapi › purpose (پیش‌فرض سمت سرور: login) */
exports.OTP_PURPOSES = ['login', 'password_reset', 'device_bind'];
/** POST /api/v1/auth/otp/request — openapi › { username, purpose? } */
let OtpRequestDto = (() => {
    let _username_decorators;
    let _username_initializers = [];
    let _username_extraInitializers = [];
    let _purpose_decorators;
    let _purpose_initializers = [];
    let _purpose_extraInitializers = [];
    return class OtpRequestDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _username_decorators = [(0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)(), (0, class_validator_1.MaxLength)(64)];
            _purpose_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsIn)(exports.OTP_PURPOSES)];
            __esDecorate(null, null, _username_decorators, { kind: "field", name: "username", static: false, private: false, access: { has: obj => "username" in obj, get: obj => obj.username, set: (obj, value) => { obj.username = value; } }, metadata: _metadata }, _username_initializers, _username_extraInitializers);
            __esDecorate(null, null, _purpose_decorators, { kind: "field", name: "purpose", static: false, private: false, access: { has: obj => "purpose" in obj, get: obj => obj.purpose, set: (obj, value) => { obj.purpose = value; } }, metadata: _metadata }, _purpose_initializers, _purpose_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        username = __runInitializers(this, _username_initializers, void 0);
        purpose = (__runInitializers(this, _username_extraInitializers), __runInitializers(this, _purpose_initializers, void 0));
        constructor() {
            __runInitializers(this, _purpose_extraInitializers);
        }
    };
})();
exports.OtpRequestDto = OtpRequestDto;
/** POST /api/v1/auth/otp/verify — openapi › { username, code, device_id? } */
let OtpVerifyDto = (() => {
    let _username_decorators;
    let _username_initializers = [];
    let _username_extraInitializers = [];
    let _code_decorators;
    let _code_initializers = [];
    let _code_extraInitializers = [];
    let _device_id_decorators;
    let _device_id_initializers = [];
    let _device_id_extraInitializers = [];
    return class OtpVerifyDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _username_decorators = [(0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)(), (0, class_validator_1.MaxLength)(64)];
            _code_decorators = [(0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)(), (0, class_validator_1.MinLength)(4), (0, class_validator_1.MaxLength)(8)];
            _device_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.MaxLength)(128)];
            __esDecorate(null, null, _username_decorators, { kind: "field", name: "username", static: false, private: false, access: { has: obj => "username" in obj, get: obj => obj.username, set: (obj, value) => { obj.username = value; } }, metadata: _metadata }, _username_initializers, _username_extraInitializers);
            __esDecorate(null, null, _code_decorators, { kind: "field", name: "code", static: false, private: false, access: { has: obj => "code" in obj, get: obj => obj.code, set: (obj, value) => { obj.code = value; } }, metadata: _metadata }, _code_initializers, _code_extraInitializers);
            __esDecorate(null, null, _device_id_decorators, { kind: "field", name: "device_id", static: false, private: false, access: { has: obj => "device_id" in obj, get: obj => obj.device_id, set: (obj, value) => { obj.device_id = value; } }, metadata: _metadata }, _device_id_initializers, _device_id_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        username = __runInitializers(this, _username_initializers, void 0);
        /** کد ۴ تا ۸ رقمی (محدوده قرارداد)؛ قالب رقمی با matches هم تأیید می‌شود */
        code = (__runInitializers(this, _username_extraInitializers), __runInitializers(this, _code_initializers, void 0));
        device_id = (__runInitializers(this, _code_extraInitializers), __runInitializers(this, _device_id_initializers, void 0));
        constructor() {
            __runInitializers(this, _device_id_extraInitializers);
        }
    };
})();
exports.OtpVerifyDto = OtpVerifyDto;
/**
 * POST /api/v1/auth/password-reset — openapi › schemas.PasswordResetRequest
 * کد باید با purpose=password_reset درخواست شده باشد (در سرویس سنجیده می‌شود)؛
 * رمز تازه طبق قرارداد دست‌کم ۸ نویسه است.
 */
let PasswordResetDto = (() => {
    let _username_decorators;
    let _username_initializers = [];
    let _username_extraInitializers = [];
    let _code_decorators;
    let _code_initializers = [];
    let _code_extraInitializers = [];
    let _new_password_decorators;
    let _new_password_initializers = [];
    let _new_password_extraInitializers = [];
    return class PasswordResetDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _username_decorators = [(0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)(), (0, class_validator_1.MaxLength)(64)];
            _code_decorators = [(0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)(), (0, class_validator_1.MinLength)(4), (0, class_validator_1.MaxLength)(8)];
            _new_password_decorators = [(0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)(), (0, class_validator_1.MinLength)(8), (0, class_validator_1.MaxLength)(256)];
            __esDecorate(null, null, _username_decorators, { kind: "field", name: "username", static: false, private: false, access: { has: obj => "username" in obj, get: obj => obj.username, set: (obj, value) => { obj.username = value; } }, metadata: _metadata }, _username_initializers, _username_extraInitializers);
            __esDecorate(null, null, _code_decorators, { kind: "field", name: "code", static: false, private: false, access: { has: obj => "code" in obj, get: obj => obj.code, set: (obj, value) => { obj.code = value; } }, metadata: _metadata }, _code_initializers, _code_extraInitializers);
            __esDecorate(null, null, _new_password_decorators, { kind: "field", name: "new_password", static: false, private: false, access: { has: obj => "new_password" in obj, get: obj => obj.new_password, set: (obj, value) => { obj.new_password = value; } }, metadata: _metadata }, _new_password_initializers, _new_password_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        username = __runInitializers(this, _username_initializers, void 0);
        code = (__runInitializers(this, _username_extraInitializers), __runInitializers(this, _code_initializers, void 0));
        new_password = (__runInitializers(this, _code_extraInitializers), __runInitializers(this, _new_password_initializers, void 0));
        constructor() {
            __runInitializers(this, _new_password_extraInitializers);
        }
    };
})();
exports.PasswordResetDto = PasswordResetDto;
