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
exports.PersonService = void 0;
const common_1 = require("@nestjs/common");
const class_validator_1 = require("class-validator");
const notFound = () => new common_1.NotFoundException({ code: 'not_found', message_fa: 'شخص یافت نشد' });
/**
 * سرویس اشخاص — CRUD مسیرهای openapi › /persons با قواعد قرارداد و قیدهای DDL:
 * - قاعده نام: شخص حقوقی legal_name می‌خواهد، شخص حقیقی دست‌کم نام یا نام خانوادگی
 *   (همان ck_person_name — پیش از رسیدن به دیتابیس با پیام فارسی سنجیده می‌شود)
 * - کد و شناسه ملی در شرکت یکتا: تکرار → 409
 * - همه عملیات company_id نشست را شرط می‌کنند؛ شخص شرکت دیگر 404 می‌شود
 */
let PersonService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var PersonService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            PersonService = _classThis = _classDescriptor.value;
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
            this.assertNameRule(dto);
            if (await this.repo.codeExists(companyId, dto.code))
                throw codeTaken();
            try {
                return await this.repo.insert(companyId, dto);
            }
            catch (err) {
                throw this.mapDbError(err, 'ساخت شخص');
            }
        }
        async update(companyId, id, dto) {
            this.assertId(id);
            const before = await this.repo.findById(companyId, id);
            if (!before)
                throw notFound();
            // قاعده نام روی وضعیت ادغام‌شده سنجیده می‌شود نه فقط فیلدهای فرستاده‌شده
            this.assertNameRule({
                legal_type: dto.legal_type ?? before.legal_type,
                first_name: dto.first_name !== undefined ? dto.first_name : before.first_name,
                last_name: dto.last_name !== undefined ? dto.last_name : before.last_name,
                legal_name: dto.legal_name !== undefined ? dto.legal_name : before.legal_name,
            });
            if (dto.code && dto.code !== before.code && (await this.repo.codeExists(companyId, dto.code))) {
                throw codeTaken();
            }
            try {
                const row = await this.repo.update(companyId, id, dto);
                if (!row)
                    throw notFound();
                return row;
            }
            catch (err) {
                if (err instanceof common_1.NotFoundException)
                    throw err;
                throw this.mapDbError(err, 'بروزرسانی شخص');
            }
        }
        /**
         * قاعده نام (ck_person_name): حقوقی ↔ legal_name، حقیقی ↔ نام یا نام خانوادگی.
         * با details.fields همان ساختار خطای اعتبارسنجی سراسری برمی‌گردد تا رابط
         * کاربری پیام را کنار همان فیلد نشان دهد.
         */
        assertNameRule(person) {
            if (person.legal_type === 'legal' && !person.legal_name?.trim()) {
                throw new common_1.BadRequestException({
                    code: 'missing_legal_name',
                    message_fa: 'برای شخص حقوقی، نام حقوقی (legal_name) الزامی است.',
                    details: { fields: { legal_name: ['نام حقوقی را وارد کنید.'] } },
                });
            }
            if (person.legal_type === 'natural' &&
                !person.first_name?.trim() &&
                !person.last_name?.trim()) {
                throw new common_1.BadRequestException({
                    code: 'missing_name',
                    message_fa: 'برای شخص حقیقی، دست‌کم یکی از نام یا نام خانوادگی الزامی است.',
                    details: { fields: { first_name: ['نام یا نام خانوادگی را وارد کنید.'] } },
                });
            }
        }
        mapDbError(err, action) {
            const pgErr = err;
            if (pgErr?.code === '23505' && pgErr.constraint === 'uq_person_code')
                return codeTaken();
            if (pgErr?.code === '23505' && pgErr.constraint === 'uq_person_national_id') {
                return new common_1.ConflictException({
                    code: 'duplicate_national_id',
                    message_fa: 'این شناسه ملی برای شخص دیگری در همین شرکت ثبت شده است.',
                });
            }
            if (pgErr?.code === '23505') {
                return new common_1.ConflictException({
                    code: 'duplicate_person',
                    message_fa: 'شخصی با همین مشخصات قبلاً ثبت شده است.',
                    details: { constraint: pgErr.constraint },
                });
            }
            if (pgErr?.code === '23514') {
                return new common_1.BadRequestException({
                    code: 'check_violation',
                    message_fa: 'شرایط شخص معتبر نیست؛ نام و نوع شخص (حقیقی/حقوقی) را بررسی کنید.',
                    details: { constraint: pgErr.constraint },
                });
            }
            if (pgErr?.code === '23502') {
                return new common_1.BadRequestException({
                    code: 'missing_field',
                    message_fa: 'یک فیلد الزامی شخص خالی است.',
                    details: { constraint: pgErr.constraint },
                });
            }
            return new common_1.BadRequestException({
                code: `${action}_failed`,
                message_fa: 'خطای غیرمنتظره در ذخیره شخص.',
                details: { db_code: pgErr?.code },
            });
        }
    };
    return PersonService = _classThis;
})();
exports.PersonService = PersonService;
const codeTaken = () => new common_1.ConflictException({
    code: 'duplicate_code',
    message_fa: 'کد شخص برای این شرکت قبلاً ثبت شده است؛ کد دیگری انتخاب کنید.',
});
