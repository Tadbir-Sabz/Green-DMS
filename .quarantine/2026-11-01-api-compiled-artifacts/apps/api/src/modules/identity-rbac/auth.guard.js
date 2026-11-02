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
exports.AuthGuard = void 0;
const common_1 = require("@nestjs/common");
const jsonwebtoken_1 = require("jsonwebtoken");
const auth_config_1 = require("./auth.config");
const unauthorized = (code, message_fa) => new common_1.UnauthorizedException({ code, message_fa });
/**
 * گارد احراز هویت: توکن Bearer را راستی‌آزمایی و نشست را زنده نگه می‌دارد.
 * برخلاف خودِ JWT، وضعیت نشست/کاربر هر بار از دیتابیس خوانده می‌شود تا
 * logout، غیرفعال‌سازی و قفل حساب بلافاصله اثر کند.
 */
let AuthGuard = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var AuthGuard = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            AuthGuard = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        repo;
        constructor(repo) {
            this.repo = repo;
        }
        async canActivate(ctx) {
            const req = ctx.switchToHttp().getRequest();
            const header = req.headers['authorization'];
            const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : null;
            if (!token) {
                throw unauthorized('unauthorized', 'ابتدا وارد شوید؛ توکن دسترسی ارسال نشده است.');
            }
            const cfg = (0, auth_config_1.getAuthConfig)();
            let payload;
            try {
                payload = (0, jsonwebtoken_1.verify)(token, cfg.secret, { algorithms: ['HS256'] });
            }
            catch {
                throw unauthorized('unauthorized', 'توکن دسترسی نامعتبر یا منقضی است؛ دوباره وارد شوید.');
            }
            if (payload.typ !== 'access' || !payload.sub || !payload.sid) {
                throw unauthorized('unauthorized', 'توکن دسترسی نامعتبر است؛ دوباره وارد شوید.');
            }
            const session = await this.repo.findSessionById(payload.sid);
            if (!session ||
                session.revoked_at ||
                session.app_user_id !== payload.sub ||
                new Date(session.expires_at) <= new Date()) {
                throw unauthorized('session_revoked', 'نشست باطل یا منقضی شده است؛ دوباره وارد شوید.');
            }
            if (!session.is_active || !session.person_active) {
                throw unauthorized('account_disabled', 'حساب کاربری غیرفعال شده است؛ با مدیر سیستم تماس بگیرید.');
            }
            const lockedUntil = session.locked_until ? new Date(session.locked_until) : null;
            if (session.is_locked || (lockedUntil && lockedUntil > new Date())) {
                // Nest استثنای 423 ندارد؛ با همان قرارداد Error (کد + پیام فارسی) صادر می‌شود
                throw new common_1.HttpException({
                    code: 'account_locked',
                    message_fa: 'حساب کاربری قفل شده است؛ برای ادامه با مدیر سیستم تماس بگیرید.',
                }, common_1.HttpStatus.LOCKED);
            }
            const summary = await this.repo.getRolesAndPermissions(payload.sub);
            req.auth = {
                userId: payload.sub,
                sessionId: payload.sid,
                companyId: session.company_id,
                username: payload.usr ?? '',
                roles: summary.roles.map((r) => r.code),
                permissions: summary.permissions,
            };
            return true;
        }
    };
    return AuthGuard = _classThis;
})();
exports.AuthGuard = AuthGuard;
