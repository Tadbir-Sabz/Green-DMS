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
exports.ListUsersQueryDto = exports.UpdateUserDto = exports.CreateUserDto = exports.ACCESS_LEVELS = void 0;
const mapped_types_1 = require("@nestjs/mapped-types");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
/** سطوح دسترسی کاربر (check: app_user_access_level — مهاجرت 0004 §۱.۴) */
exports.ACCESS_LEVELS = [
    'web',
    'field_sales',
    'field_delivery',
    'field_telesales',
    'scope_only',
    'none',
];
/** پارامتر query بولینی openapi («true»/«false») را به boolean تبدیل می‌کند */
const toBoolean = ({ value }) => {
    if (value === 'true' || value === true)
        return true;
    if (value === 'false' || value === false)
        return false;
    return value;
};
/**
 * POST /api/v1/users — openapi › schemas.User
 * فیلدهای فقط-خواندنی (id/locked_until/last_login_at/created_at) سرور تولید می‌کند؛
 * password/staff_id/نام شخص، افزوده‌های عملیاتی‌اند (قرارداد additionalProperties ندارد)
 * چون شخصِ همراه کاربر در جدول person الزامی است و رمز عبور برای ورود لازم می‌آید.
 */
let CreateUserDto = (() => {
    let _username_decorators;
    let _username_initializers = [];
    let _username_extraInitializers = [];
    let _password_decorators;
    let _password_initializers = [];
    let _password_extraInitializers = [];
    let _staff_id_decorators;
    let _staff_id_initializers = [];
    let _staff_id_extraInitializers = [];
    let _role_ids_decorators;
    let _role_ids_initializers = [];
    let _role_ids_extraInitializers = [];
    let _is_active_decorators;
    let _is_active_initializers = [];
    let _is_active_extraInitializers = [];
    let _access_level_decorators;
    let _access_level_initializers = [];
    let _access_level_extraInitializers = [];
    let _person_code_decorators;
    let _person_code_initializers = [];
    let _person_code_extraInitializers = [];
    let _first_name_decorators;
    let _first_name_initializers = [];
    let _first_name_extraInitializers = [];
    let _last_name_decorators;
    let _last_name_initializers = [];
    let _last_name_extraInitializers = [];
    return class CreateUserDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _username_decorators = [(0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)(), (0, class_validator_1.MaxLength)(64)];
            _password_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.MaxLength)(256)];
            _staff_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)()];
            _role_ids_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsArray)(), (0, class_validator_1.IsUUID)('4', { each: true })];
            _is_active_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsBoolean)()];
            _access_level_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsIn)(exports.ACCESS_LEVELS)];
            _person_code_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)(), (0, class_validator_1.MaxLength)(64)];
            _first_name_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.MaxLength)(128)];
            _last_name_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.MaxLength)(128)];
            __esDecorate(null, null, _username_decorators, { kind: "field", name: "username", static: false, private: false, access: { has: obj => "username" in obj, get: obj => obj.username, set: (obj, value) => { obj.username = value; } }, metadata: _metadata }, _username_initializers, _username_extraInitializers);
            __esDecorate(null, null, _password_decorators, { kind: "field", name: "password", static: false, private: false, access: { has: obj => "password" in obj, get: obj => obj.password, set: (obj, value) => { obj.password = value; } }, metadata: _metadata }, _password_initializers, _password_extraInitializers);
            __esDecorate(null, null, _staff_id_decorators, { kind: "field", name: "staff_id", static: false, private: false, access: { has: obj => "staff_id" in obj, get: obj => obj.staff_id, set: (obj, value) => { obj.staff_id = value; } }, metadata: _metadata }, _staff_id_initializers, _staff_id_extraInitializers);
            __esDecorate(null, null, _role_ids_decorators, { kind: "field", name: "role_ids", static: false, private: false, access: { has: obj => "role_ids" in obj, get: obj => obj.role_ids, set: (obj, value) => { obj.role_ids = value; } }, metadata: _metadata }, _role_ids_initializers, _role_ids_extraInitializers);
            __esDecorate(null, null, _is_active_decorators, { kind: "field", name: "is_active", static: false, private: false, access: { has: obj => "is_active" in obj, get: obj => obj.is_active, set: (obj, value) => { obj.is_active = value; } }, metadata: _metadata }, _is_active_initializers, _is_active_extraInitializers);
            __esDecorate(null, null, _access_level_decorators, { kind: "field", name: "access_level", static: false, private: false, access: { has: obj => "access_level" in obj, get: obj => obj.access_level, set: (obj, value) => { obj.access_level = value; } }, metadata: _metadata }, _access_level_initializers, _access_level_extraInitializers);
            __esDecorate(null, null, _person_code_decorators, { kind: "field", name: "person_code", static: false, private: false, access: { has: obj => "person_code" in obj, get: obj => obj.person_code, set: (obj, value) => { obj.person_code = value; } }, metadata: _metadata }, _person_code_initializers, _person_code_extraInitializers);
            __esDecorate(null, null, _first_name_decorators, { kind: "field", name: "first_name", static: false, private: false, access: { has: obj => "first_name" in obj, get: obj => obj.first_name, set: (obj, value) => { obj.first_name = value; } }, metadata: _metadata }, _first_name_initializers, _first_name_extraInitializers);
            __esDecorate(null, null, _last_name_decorators, { kind: "field", name: "last_name", static: false, private: false, access: { has: obj => "last_name" in obj, get: obj => obj.last_name, set: (obj, value) => { obj.last_name = value; } }, metadata: _metadata }, _last_name_initializers, _last_name_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        username = __runInitializers(this, _username_initializers, void 0);
        /**
         * بدون رمز، کاربر قابل ورود نیست (ورود OTP در ماژول یکپارچه‌سازی پیامک می‌آید)؛
         * null بودن password_hash در DDL برای همان حالت آینده است.
         */
        password = (__runInitializers(this, _username_extraInitializers), __runInitializers(this, _password_initializers, void 0));
        /** نسبت به پرسنل موجود: شخصِ همین پرسنل به کاربر می‌چسبد و شخص تازه ساخته نمی‌شود */
        staff_id = (__runInitializers(this, _password_extraInitializers), __runInitializers(this, _staff_id_initializers, void 0));
        role_ids = (__runInitializers(this, _staff_id_extraInitializers), __runInitializers(this, _role_ids_initializers, void 0));
        is_active = (__runInitializers(this, _role_ids_extraInitializers), __runInitializers(this, _is_active_initializers, void 0));
        access_level = (__runInitializers(this, _is_active_extraInitializers), __runInitializers(this, _access_level_initializers, void 0));
        // -------- شخصِ تازه (فقط وقتی staff_id داده نشده باشد) --------
        person_code = (__runInitializers(this, _access_level_extraInitializers), __runInitializers(this, _person_code_initializers, void 0));
        first_name = (__runInitializers(this, _person_code_extraInitializers), __runInitializers(this, _first_name_initializers, void 0));
        last_name = (__runInitializers(this, _first_name_extraInitializers), __runInitializers(this, _last_name_initializers, void 0));
        constructor() {
            __runInitializers(this, _last_name_extraInitializers);
        }
    };
})();
exports.CreateUserDto = CreateUserDto;
/**
 * PATCH /api/v1/users/{id} — «نقش، فعالیت، قفل حساب» طبق خلاصه قرارداد؛
 * همه فیلدها اختیاری‌اند و نبودِ row_version در قرارداد یعنی بدون قفل خوش‌بینانه.
 */
let UpdateUserDto = (() => {
    let _classSuper = (0, mapped_types_1.PartialType)(CreateUserDto);
    let _is_locked_decorators;
    let _is_locked_initializers = [];
    let _is_locked_extraInitializers = [];
    return class UpdateUserDto extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _is_locked_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsBoolean)()];
            __esDecorate(null, null, _is_locked_decorators, { kind: "field", name: "is_locked", static: false, private: false, access: { has: obj => "is_locked" in obj, get: obj => obj.is_locked, set: (obj, value) => { obj.is_locked = value; } }, metadata: _metadata }, _is_locked_initializers, _is_locked_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        /**
         * قفل دستی توسط مدیر؛ false یعنی باز کردن قفل (locked_until و شمارنده تلاش
         * هم صفر می‌شوند تا کاربر بتواند دوباره تلاش کند).
         */
        is_locked = __runInitializers(this, _is_locked_initializers, void 0);
        constructor() {
            super(...arguments);
            __runInitializers(this, _is_locked_extraInitializers);
        }
    };
})();
exports.UpdateUserDto = UpdateUserDto;
/** GET /api/v1/users — فیلتر نقش/فعال + صفحه‌بندی cursor (ضمیمه F) */
let ListUsersQueryDto = (() => {
    let _role_decorators;
    let _role_initializers = [];
    let _role_extraInitializers = [];
    let _is_active_decorators;
    let _is_active_initializers = [];
    let _is_active_extraInitializers = [];
    let _cursor_decorators;
    let _cursor_initializers = [];
    let _cursor_extraInitializers = [];
    let _limit_decorators;
    let _limit_initializers = [];
    let _limit_extraInitializers = [];
    return class ListUsersQueryDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _role_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.MaxLength)(64)];
            _is_active_decorators = [(0, class_validator_1.IsOptional)(), (0, class_transformer_1.Transform)(toBoolean), (0, class_validator_1.IsBoolean)()];
            _cursor_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)()];
            _limit_decorators = [(0, class_validator_1.IsOptional)(), (0, class_transformer_1.Type)(() => Number), (0, class_validator_1.IsInt)(), (0, class_validator_1.Min)(1), (0, class_validator_1.Max)(200)];
            __esDecorate(null, null, _role_decorators, { kind: "field", name: "role", static: false, private: false, access: { has: obj => "role" in obj, get: obj => obj.role, set: (obj, value) => { obj.role = value; } }, metadata: _metadata }, _role_initializers, _role_extraInitializers);
            __esDecorate(null, null, _is_active_decorators, { kind: "field", name: "is_active", static: false, private: false, access: { has: obj => "is_active" in obj, get: obj => obj.is_active, set: (obj, value) => { obj.is_active = value; } }, metadata: _metadata }, _is_active_initializers, _is_active_extraInitializers);
            __esDecorate(null, null, _cursor_decorators, { kind: "field", name: "cursor", static: false, private: false, access: { has: obj => "cursor" in obj, get: obj => obj.cursor, set: (obj, value) => { obj.cursor = value; } }, metadata: _metadata }, _cursor_initializers, _cursor_extraInitializers);
            __esDecorate(null, null, _limit_decorators, { kind: "field", name: "limit", static: false, private: false, access: { has: obj => "limit" in obj, get: obj => obj.limit, set: (obj, value) => { obj.limit = value; } }, metadata: _metadata }, _limit_initializers, _limit_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        /** کد یا شناسه نقش */
        role = __runInitializers(this, _role_initializers, void 0);
        is_active = (__runInitializers(this, _role_extraInitializers), __runInitializers(this, _is_active_initializers, void 0));
        cursor = (__runInitializers(this, _is_active_extraInitializers), __runInitializers(this, _cursor_initializers, void 0));
        limit = (__runInitializers(this, _cursor_extraInitializers), __runInitializers(this, _limit_initializers, 50));
        constructor() {
            __runInitializers(this, _limit_extraInitializers);
        }
    };
})();
exports.ListUsersQueryDto = ListUsersQueryDto;
