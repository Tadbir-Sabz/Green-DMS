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
exports.IdentityRbacModule = exports.IdentityRbacController = void 0;
const common_1 = require("@nestjs/common");
const auth_controller_1 = require("./auth.controller");
const auth_repository_1 = require("./auth.repository");
const auth_service_1 = require("./auth.service");
const devices_controller_1 = require("./devices.controller");
const devices_repository_1 = require("./devices.repository");
const devices_service_1 = require("./devices.service");
const roles_controller_1 = require("./roles.controller");
const roles_repository_1 = require("./roles.repository");
const roles_service_1 = require("./roles.service");
const users_controller_1 = require("./users.controller");
const users_repository_1 = require("./users.repository");
const users_service_1 = require("./users.service");
const sms_sender_1 = require("./sms-sender");
const tokens_1 = require("./tokens");
/** Identity & RBAC — احراز هویت JWT و کنترل دسترسی نقش/مجوز (§۱.۴، ضمیمه H) */
let IdentityRbacController = (() => {
    let _classDecorators = [(0, common_1.Controller)('identity-rbac')];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _info_decorators;
    var IdentityRbacController = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _info_decorators = [(0, common_1.Get)()];
            __esDecorate(this, null, _info_decorators, { kind: "method", name: "info", static: false, private: false, access: { has: obj => "info" in obj, get: obj => obj.info }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            IdentityRbacController = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        info() {
            return {
                module: 'identity-rbac',
                title: 'احراز هویت و دسترسی',
                resources: [
                    'auth',
                    'users',
                    'staff',
                    'roles',
                    'permissions',
                    'user-scopes',
                    'sessions',
                    'audit-log',
                ],
                status: 'scaffold',
            };
        }
        constructor() {
            __runInitializers(this, _instanceExtraInitializers);
        }
    };
    return IdentityRbacController = _classThis;
})();
exports.IdentityRbacController = IdentityRbacController;
/**
 * ماژول ۱ سازمانی (Identity & RBAC):
 * - پیاده‌شده: /auth/login، /auth/refresh، /auth/logout، /auth/me،
 *   /auth/otp/request و /auth/otp/verify (OTP پیامکی با درگاه قابل‌تعویض)،
 *   /devices (دستگاه‌های مجاز + ابطال از راه دور)، /users CRUD و /roles CRUD
 *   + AuthGuard + PermissionsGuard
 * - در انتظار (طبق openapi): /persons در ماژول master-data پیاده شده است؛
 *   سایر ماژول‌ها (customers, inventory, …) در ماژول‌های خودشان
 * AuthRepository/AuthService خروجی داده‌اند تا گاردها در ماژول‌های دیگر هم قابل استفاده باشند.
 */
let IdentityRbacModule = (() => {
    let _classDecorators = [(0, common_1.Module)({
            controllers: [
                IdentityRbacController,
                auth_controller_1.AuthController,
                users_controller_1.UsersController,
                roles_controller_1.RolesController,
                devices_controller_1.DevicesController,
            ],
            providers: [
                auth_repository_1.AuthRepository,
                { provide: tokens_1.AUTH_REPOSITORY, useExisting: auth_repository_1.AuthRepository },
                auth_service_1.AuthService,
                { provide: tokens_1.AUTH_SERVICE, useExisting: auth_service_1.AuthService },
                users_repository_1.UsersRepository,
                { provide: tokens_1.USERS_REPOSITORY, useExisting: users_repository_1.UsersRepository },
                users_service_1.UsersService,
                { provide: tokens_1.USERS_SERVICE, useExisting: users_service_1.UsersService },
                roles_repository_1.RolesRepository,
                { provide: tokens_1.ROLES_REPOSITORY, useExisting: roles_repository_1.RolesRepository },
                roles_service_1.RolesService,
                { provide: tokens_1.ROLES_SERVICE, useExisting: roles_service_1.RolesService },
                devices_repository_1.DevicesRepository,
                { provide: tokens_1.DEVICES_REPOSITORY, useExisting: devices_repository_1.DevicesRepository },
                devices_service_1.DevicesService,
                { provide: tokens_1.DEVICES_SERVICE, useExisting: devices_service_1.DevicesService },
                // درگاه پیامک: LogSmsSender پیش‌فرض؛ SMS_PROVIDER=http → HttpSmsSender؛ تست‌ها override می‌کنند
                { provide: tokens_1.SMS_SENDER, useFactory: sms_sender_1.createSmsSender },
            ],
            exports: [tokens_1.AUTH_REPOSITORY, tokens_1.AUTH_SERVICE, tokens_1.DEVICES_SERVICE],
        })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var IdentityRbacModule = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            IdentityRbacModule = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
    };
    return IdentityRbacModule = _classThis;
})();
exports.IdentityRbacModule = IdentityRbacModule;
