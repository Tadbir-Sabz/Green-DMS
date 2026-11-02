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
exports.RolesService = void 0;
const common_1 = require("@nestjs/common");
const class_validator_1 = require("class-validator");
const notFound = () => new common_1.NotFoundException({ code: 'not_found', message_fa: 'نقش یافت نشد' });
const conflict = (code, message_fa) => new common_1.ConflictException({ code, message_fa });
/**
 * سرویس نقش‌ها — CRUD مسیرهای openapi › /roles با قواعد قرارداد:
 * - هر permission_code باید در جدول permission (seed 0022) باشد وگرنه 400
 * - نقش سیستمی (is_system) کدپذیر نیست و حذف‌نشدنی است
 * - حذف فقط وقتی مجاز است که هیچ کاربری به نقش نسبت نداشته باشد (409 در غیر این صورت)
 */
let RolesService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var RolesService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            RolesService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        repo;
        constructor(repo) {
            this.repo = repo;
        }
        assertId(id) {
            if (!(0, class_validator_1.isUUID)(id, '4')) {
                throw new common_1.BadRequestException({
                    code: 'invalid_id',
                    message_fa: 'شناسه ارسال‌شده معتبر نیست.',
                });
            }
        }
        async list(companyId, query) {
            const { items, nextCursor, hasMore } = await this.repo.list(companyId, query);
            return { items, next_cursor: nextCursor, has_more: hasMore };
        }
        async get(companyId, id) {
            this.assertId(id);
            const row = await this.repo.findById(companyId, id);
            if (!row)
                throw notFound();
            return row;
        }
        async create(companyId, dto) {
            const permissionCodes = dto.permission_codes ? [...new Set(dto.permission_codes)] : [];
            await this.assertPermissions(permissionCodes);
            try {
                return await this.repo.insert(companyId, {
                    code: dto.code,
                    name: dto.name,
                    permissionCodes,
                });
            }
            catch (err) {
                throw this.mapDbError(err);
            }
        }
        async update(companyId, id, dto) {
            this.assertId(id);
            const before = await this.repo.findById(companyId, id);
            if (!before)
                throw notFound();
            if (before.is_system && dto.code !== undefined && dto.code !== before.code) {
                throw conflict('system_role', 'کد نقش سیستمی قابل تغییر نیست؛ فقط نام و مجوزهایش قابل ویرایش است.');
            }
            const permissionCodes = dto.permission_codes === undefined
                ? undefined
                : [...new Set(dto.permission_codes)];
            if (permissionCodes)
                await this.assertPermissions(permissionCodes);
            try {
                const row = await this.repo.update(companyId, id, {
                    code: dto.code,
                    name: dto.name,
                    permissionCodes,
                });
                if (!row)
                    throw notFound();
                return row;
            }
            catch (err) {
                if (err instanceof common_1.NotFoundException)
                    throw err;
                throw this.mapDbError(err);
            }
        }
        async remove(companyId, id) {
            this.assertId(id);
            const role = await this.repo.findById(companyId, id);
            if (!role)
                throw notFound();
            if (role.is_system) {
                throw conflict('system_role', 'نقش سیستمی حذف نمی‌شود؛ می‌توانید مجوزهایش را ویرایش کنید.');
            }
            const assigned = await this.repo.countAssignedUsers(role.id);
            if (assigned > 0) {
                throw conflict('role_in_use', `این نقش به ${assigned} کاربر نسبت داده شده است؛ ابتدا نقش را از کاربران بردارید.`);
            }
            const ok = await this.repo.delete(companyId, id);
            if (!ok)
                throw notFound();
        }
        async assertPermissions(codes) {
            const missing = await this.repo.findMissingPermissionCodes(codes);
            if (missing.length > 0) {
                throw new common_1.BadRequestException({
                    code: 'invalid_permission',
                    message_fa: 'یک یا چند الگوی مجوز در سیستم تعریف نشده است.',
                    details: { missing },
                });
            }
        }
        mapDbError(err) {
            const pgErr = err;
            if (pgErr?.code === '23505' && pgErr.constraint === 'uq_role_code') {
                return conflict('duplicate_code', 'این کد نقش قبلاً ثبت شده است؛ کد دیگری انتخاب کنید.');
            }
            if (pgErr?.code === '23503') {
                return new common_1.BadRequestException({
                    code: 'invalid_permission',
                    message_fa: 'یکی از الگوهای مجوز معتبر نیست.',
                    details: { constraint: pgErr.constraint },
                });
            }
            if (pgErr?.code === '23514') {
                return new common_1.BadRequestException({
                    code: 'check_violation',
                    message_fa: `شرایط نقش معتبر نیست (${pgErr.constraint}).`,
                });
            }
            return new common_1.BadRequestException({
                code: 'save_failed',
                message_fa: 'خطای غیرمنتظره در ذخیره نقش.',
                details: { db_code: pgErr?.code },
            });
        }
    };
    return RolesService = _classThis;
})();
exports.RolesService = RolesService;
