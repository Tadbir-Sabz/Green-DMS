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
exports.PermissionsGuard = void 0;
const common_1 = require("@nestjs/common");
const permissions_1 = require("./permissions");
const require_permissions_decorator_1 = require("./require-permissions.decorator");
/**
 * گارد مجوز (RBAC): مجوزهای اعلام‌شده با @RequirePermissions روی نقش‌های نشست
 * با همان منطق الگوییِ seed 0022 تطبیق داده می‌شوند. نبود مجوز → 403 قراردادی.
 * پیش‌نیاز: AuthGuard باید اجرا شده باشد (req.auth پر شده باشد).
 */
let PermissionsGuard = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var PermissionsGuard = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            PermissionsGuard = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        canActivate(ctx) {
            const required = Reflect.getMetadata(require_permissions_decorator_1.PERMISSIONS_KEY, ctx.getHandler());
            if (!required || required.length === 0)
                return true;
            const auth = ctx.switchToHttp().getRequest().auth;
            if (!auth) {
                // AuthGuard اجرا نشده — از سهوِ پیکربندی با پیام روشن جلوگیری می‌کنیم
                throw new common_1.UnauthorizedException({
                    code: 'unauthorized',
                    message_fa: 'ابتدا وارد شوید؛ توکن دسترسی ارسال نشده است.',
                });
            }
            const missing = required.filter((need) => !auth.permissions.some((granted) => (0, permissions_1.permissionMatches)(granted, need)));
            if (missing.length > 0) {
                throw new common_1.ForbiddenException({
                    code: 'forbidden',
                    message_fa: `برای این عملیات مجوز «${missing.join('، ')}» لازم است.`,
                    details: { required: missing, granted: auth.permissions, roles: auth.roles },
                });
            }
            return true;
        }
    };
    return PermissionsGuard = _classThis;
})();
exports.PermissionsGuard = PermissionsGuard;
