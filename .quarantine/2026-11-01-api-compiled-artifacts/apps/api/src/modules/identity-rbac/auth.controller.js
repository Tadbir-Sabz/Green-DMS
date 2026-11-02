"use strict";
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("./auth.guard");
const permissions_guard_1 = require("./permissions.guard");
const headerString = (value) => Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
/**
 * احراز هویت — دقیقاً مطابق openapi › /auth/*:
 * login (200)، refresh (200)، logout (204)، /auth/me (کاربر + نقش‌ها + مجوزها)،
 * otp/request (202 — پاسخ یکسان برای نام موجود و ناشناخته) و otp/verify (200/401/429).
 * مسیرهای عمومی (login/refresh/otp) guard ندارند؛ logout و me با AuthGuard محافظت می‌شوند.
 */
let AuthController = (() => {
    let _classDecorators = [(0, common_1.Controller)('auth')];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _login_decorators;
    let _requestOtp_decorators;
    let _verifyOtp_decorators;
    let _resetPassword_decorators;
    let _refresh_decorators;
    let _logout_decorators;
    let _me_decorators;
    var AuthController = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _login_decorators = [(0, common_1.Post)('login'), (0, common_1.HttpCode)(common_1.HttpStatus.OK)];
            _requestOtp_decorators = [(0, common_1.Post)('otp/request'), (0, common_1.HttpCode)(common_1.HttpStatus.ACCEPTED)];
            _verifyOtp_decorators = [(0, common_1.Post)('otp/verify'), (0, common_1.HttpCode)(common_1.HttpStatus.OK)];
            _resetPassword_decorators = [(0, common_1.Post)('password-reset'), (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT)];
            _refresh_decorators = [(0, common_1.Post)('refresh'), (0, common_1.HttpCode)(common_1.HttpStatus.OK)];
            _logout_decorators = [(0, common_1.Post)('logout'), (0, common_1.UseGuards)(auth_guard_1.AuthGuard), (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT)];
            _me_decorators = [(0, common_1.Get)('me'), (0, common_1.UseGuards)(auth_guard_1.AuthGuard, permissions_guard_1.PermissionsGuard)];
            __esDecorate(this, null, _login_decorators, { kind: "method", name: "login", static: false, private: false, access: { has: obj => "login" in obj, get: obj => obj.login }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _requestOtp_decorators, { kind: "method", name: "requestOtp", static: false, private: false, access: { has: obj => "requestOtp" in obj, get: obj => obj.requestOtp }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _verifyOtp_decorators, { kind: "method", name: "verifyOtp", static: false, private: false, access: { has: obj => "verifyOtp" in obj, get: obj => obj.verifyOtp }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _resetPassword_decorators, { kind: "method", name: "resetPassword", static: false, private: false, access: { has: obj => "resetPassword" in obj, get: obj => obj.resetPassword }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _refresh_decorators, { kind: "method", name: "refresh", static: false, private: false, access: { has: obj => "refresh" in obj, get: obj => obj.refresh }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _logout_decorators, { kind: "method", name: "logout", static: false, private: false, access: { has: obj => "logout" in obj, get: obj => obj.logout }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _me_decorators, { kind: "method", name: "me", static: false, private: false, access: { has: obj => "me" in obj, get: obj => obj.me }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            AuthController = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        service = __runInitializers(this, _instanceExtraInitializers);
        constructor(service) {
            this.service = service;
        }
        login(dto, req) {
            return this.service.login(dto, {
                ip: req.ip,
                userAgent: headerString(req.headers['user-agent']),
            });
        }
        /** درخواست کد یک‌بارمصرف — 202 بدون بدنه، حتی اگر کاربر/شماره‌ای در کار نباشد */
        requestOtp(dto) {
            return this.service.requestOtp(dto);
        }
        /** تأیید کد و صدور نشست (خودِ کنترلر عمومی است؛ اعتبارسنجی در سرویس است) */
        verifyOtp(dto, req) {
            return this.service.verifyOtp(dto, {
                ip: req.ip,
                userAgent: headerString(req.headers['user-agent']),
                deviceId: dto.device_id ?? null,
            });
        }
        /** بازیابی رمز با کدِ دلیل password_reset — 204 بدون بدنه؛ نشستی صادر نمی‌شود */
        resetPassword(dto) {
            return this.service.resetPassword(dto);
        }
        refresh(dto, req) {
            return this.service.refresh(dto.refresh_token, {
                ip: req.ip,
                userAgent: headerString(req.headers['user-agent']),
            });
        }
        async logout(sessionId) {
            await this.service.logout(sessionId);
        }
        me(userId) {
            return this.service.me(userId);
        }
    };
    return AuthController = _classThis;
})();
exports.AuthController = AuthController;
