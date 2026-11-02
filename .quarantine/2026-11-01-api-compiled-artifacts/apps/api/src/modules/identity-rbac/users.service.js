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
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const class_validator_1 = require("class-validator");
const password_1 = require("./password");
/** پیام‌های قرارداد Error برای خطاهای دامنه کاربران */
const notFound = () => new common_1.NotFoundException({ code: 'not_found', message_fa: 'کاربر یافت نشد' });
const usernameTaken = () => new common_1.ConflictException({
    code: 'username_taken',
    message_fa: 'این نام کاربری قبلاً ثبت شده است؛ نام دیگری انتخاب کنید.',
});
/**
 * سرویس کاربران — CRUD مسیرهای openapi › /users با قواعد:
 * - حذف فیزیکی ممنوع (ممیزی): DELETE صرفاً غیرفعال می‌کند و نشست‌های باز را می‌بندد
 * - نقش‌ها باید متعلق به شرکتِ نشست باشند (درز چندشرکتی ندارد)
 * - شخصِ کاربر یا از پرسنل موجود (staff_id) می‌آید یا ساخته می‌شود
 */
let UsersService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var UsersService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            UsersService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        repo;
        authRepo;
        constructor(repo, authRepo) {
            this.repo = repo;
            this.authRepo = authRepo;
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
            // بررسی پیش از ساخت شخص: کد شخص از نام کاربری می‌آید وگرنه قیدِ شخص زودتر
            // می‌شکست و پاسخ به‌جای username_taken، person_code_exists می‌شد
            if (await this.repo.usernameExists(dto.username))
                throw usernameTaken();
            const roleIds = await this.assertRoles(companyId, dto.role_ids);
            let personId = null;
            if (dto.staff_id) {
                personId = await this.repo.findStaffPersonId(companyId, dto.staff_id);
                if (!personId) {
                    throw new common_1.BadRequestException({
                        code: 'invalid_staff',
                        message_fa: 'پرسنل انتخاب‌شده برای این شرکت تعریف نشده است.',
                    });
                }
            }
            try {
                return await this.repo.insert(companyId, {
                    username: dto.username,
                    passwordHash: dto.password ? await (0, password_1.hashPassword)(dto.password) : null,
                    accessLevel: dto.access_level ?? 'web',
                    isActive: dto.is_active ?? true,
                    personId,
                    personCode: dto.person_code ?? `USR-${dto.username}`,
                    firstName: dto.first_name,
                    lastName: dto.last_name ?? null,
                    roleIds,
                });
            }
            catch (err) {
                throw this.mapDbError(err, 'ساخت کاربر');
            }
        }
        async update(companyId, id, dto, currentUserId) {
            this.assertId(id);
            const before = await this.repo.findById(companyId, id);
            if (!before)
                throw notFound();
            const roleIds = dto.role_ids === undefined ? undefined : await this.assertRoles(companyId, dto.role_ids);
            let row;
            try {
                row = await this.repo.update(companyId, id, {
                    username: dto.username,
                    passwordHash: dto.password !== undefined ? await (0, password_1.hashPassword)(dto.password) : undefined,
                    accessLevel: dto.access_level,
                    isActive: dto.is_active,
                    isLocked: dto.is_locked,
                    roleIds,
                });
            }
            catch (err) {
                throw this.mapDbError(err, 'بروزرسانی کاربر');
            }
            if (!row)
                throw notFound();
            // غیرفعال‌سازی از هر مسیری باید نشست‌های باز را هم فوراً ببندد
            if (dto.is_active === false && id !== currentUserId) {
                await this.authRepo.revokeAllForUser(id, 'admin');
            }
            return row;
        }
        /**
         * غیرفعال‌سازی (نه حذف): ردیف برای ممیزی می‌ماند، ورود و هر درخواست
         * مجوزدارِ نشستِ موجود با 401 رد می‌شود و نشست‌ها باطل می‌شوند.
         * غیرفعال‌سازی خودِ احرازکننده ممنوع است تا مدیر خودش را قفل نکند.
         */
        async remove(companyId, id, currentUserId) {
            this.assertId(id);
            if (id === currentUserId) {
                throw new common_1.ConflictException({
                    code: 'self_deactivate',
                    message_fa: 'نمی‌توانید حساب کاربری خودتان را غیرفعال کنید؛ از مدیر دیگری بخواهید.',
                });
            }
            const ok = await this.repo.deactivate(companyId, id);
            if (!ok)
                throw notFound();
            await this.authRepo.revokeAllForUser(id, 'admin');
        }
        /** نقش‌های خواسته‌شده باید همه برای همین شرکت باشند؛ لیست بدون تکرار برمی‌گردد */
        async assertRoles(companyId, roleIds) {
            if (!roleIds)
                return [];
            const unique = [...new Set(roleIds)];
            if (unique.length === 0)
                return [];
            const existing = new Set(await this.repo.findExistingRoleIds(companyId, unique));
            const missing = unique.filter((r) => !existing.has(r));
            if (missing.length > 0) {
                throw new common_1.BadRequestException({
                    code: 'invalid_role',
                    message_fa: 'یک یا چند نقش انتخاب‌شده برای این شرکت تعریف نشده است.',
                    details: { missing },
                });
            }
            return unique;
        }
        mapDbError(err, action) {
            const pgErr = err;
            if (pgErr?.code === '23505' && pgErr.constraint === 'uq_app_user_username') {
                return usernameTaken();
            }
            if (pgErr?.code === '23505' && pgErr.constraint === 'uq_person_code') {
                return new common_1.ConflictException({
                    code: 'person_code_exists',
                    message_fa: 'کد شخص برای این شرکت قبلاً ثبت شده است؛ person_code دیگری بدهید.',
                });
            }
            if (pgErr?.code === '23503') {
                return new common_1.BadRequestException({
                    code: 'invalid_reference',
                    message_fa: 'یکی از مراجع (پرسنل/نقش) معتبر نیست.',
                });
            }
            if (pgErr?.code === '23514') {
                return new common_1.BadRequestException({
                    code: 'check_violation',
                    message_fa: `شرایط کاربر معتبر نیست (${pgErr.constraint}).`,
                });
            }
            return new common_1.BadRequestException({
                code: `${action}_failed`,
                message_fa: 'خطای غیرمنتظره در ذخیره کاربر.',
                details: { db_code: pgErr?.code },
            });
        }
    };
    return UsersService = _classThis;
})();
exports.UsersService = UsersService;
