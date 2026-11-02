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
exports.CustomerController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../identity-rbac/auth.guard");
const permissions_guard_1 = require("../identity-rbac/permissions.guard");
const require_permissions_decorator_1 = require("../identity-rbac/require-permissions.decorator");
/**
 * CRUD مشتریان — /customers، /customers/{id} و PUT /customers/{id}/location
 * دقیقاً مطابق openapi.yaml (پیشوند /api/v1 توسط main.ts اضافه می‌شود).
 * DELETE در قرارداد نیست؛ وضعیت با status تغییر می‌کند.
 *
 * مجوزها: خواندن/ساخت/ویرایش master.customer.* و ثبت موقعیت در نقشه
 * tracking.customer_geo.update (طبق seed 0022 که ویزیتورها همین را دارند).
 * شرکت از نشست می‌آید نه از query.
 */
let CustomerController = (() => {
    let _classDecorators = [(0, common_1.UseGuards)(auth_guard_1.AuthGuard, permissions_guard_1.PermissionsGuard), (0, common_1.Controller)('customers')];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _list_decorators;
    let _get_decorators;
    let _create_decorators;
    let _update_decorators;
    let _setLocation_decorators;
    var CustomerController = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _list_decorators = [(0, common_1.Get)(), (0, require_permissions_decorator_1.RequirePermissions)('master.customer.view')];
            _get_decorators = [(0, common_1.Get)(':id'), (0, require_permissions_decorator_1.RequirePermissions)('master.customer.view')];
            _create_decorators = [(0, common_1.Post)(), (0, require_permissions_decorator_1.RequirePermissions)('master.customer.create')];
            _update_decorators = [(0, common_1.Patch)(':id'), (0, require_permissions_decorator_1.RequirePermissions)('master.customer.update')];
            _setLocation_decorators = [(0, common_1.Put)(':id/location'), (0, require_permissions_decorator_1.RequirePermissions)('tracking.customer_geo.update')];
            __esDecorate(this, null, _list_decorators, { kind: "method", name: "list", static: false, private: false, access: { has: obj => "list" in obj, get: obj => obj.list }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _get_decorators, { kind: "method", name: "get", static: false, private: false, access: { has: obj => "get" in obj, get: obj => obj.get }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _create_decorators, { kind: "method", name: "create", static: false, private: false, access: { has: obj => "create" in obj, get: obj => obj.create }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _update_decorators, { kind: "method", name: "update", static: false, private: false, access: { has: obj => "update" in obj, get: obj => obj.update }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _setLocation_decorators, { kind: "method", name: "setLocation", static: false, private: false, access: { has: obj => "setLocation" in obj, get: obj => obj.setLocation }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            CustomerController = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        service = __runInitializers(this, _instanceExtraInitializers);
        constructor(service) {
            this.service = service;
        }
        list(query, companyId) {
            return this.service.list(companyId, query);
        }
        get(id, companyId) {
            return this.service.get(companyId, id);
        }
        create(dto, companyId, userId) {
            return this.service.create(companyId, dto, userId);
        }
        update(id, dto, companyId, userId) {
            return this.service.update(companyId, id, dto, userId);
        }
        setLocation(id, dto, companyId, userId) {
            return this.service.setLocation(companyId, id, dto, userId);
        }
    };
    return CustomerController = _classThis;
})();
exports.CustomerController = CustomerController;
