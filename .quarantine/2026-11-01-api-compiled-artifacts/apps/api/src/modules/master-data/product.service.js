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
exports.ProductService = void 0;
const common_1 = require("@nestjs/common");
const class_validator_1 = require("class-validator");
let ProductService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var ProductService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            ProductService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        repo;
        constructor(repo) {
            this.repo = repo;
        }
        async list(companyId, query) {
            const { items, nextCursor, hasMore } = await this.repo.list(companyId, query);
            return { items, next_cursor: nextCursor, has_more: hasMore };
        }
        assertId(id) {
            if (!(0, class_validator_1.isUUID)(id, '4')) {
                throw new common_1.BadRequestException({
                    code: 'invalid_id',
                    message_fa: 'شناسه ارسال‌شده معتبر نیست.',
                });
            }
        }
        async get(companyId, id) {
            this.assertId(id);
            const row = await this.repo.findById(companyId, id);
            if (!row)
                throw new common_1.NotFoundException({ code: 'not_found', message_fa: 'کالا یافت نشد' });
            return row;
        }
        async create(companyId, dto) {
            await this.assertReferences(companyId, dto);
            try {
                return await this.repo.insert(companyId, dto);
            }
            catch (err) {
                throw this.mapDbError(err, 'ساخت کالا');
            }
        }
        async update(companyId, id, dto) {
            this.assertId(id);
            if (!(await this.repo.findById(companyId, id))) {
                throw new common_1.NotFoundException({ code: 'not_found', message_fa: 'کالا یافت نشد' });
            }
            await this.assertReferences(companyId, dto);
            const row = await this.repo.update(companyId, id, dto, dto.row_version);
            if (!row) {
                // فقط وقتی row_version فرستاده شده به اینجا می‌رسیم
                throw new common_1.ConflictException({
                    code: 'version_conflict',
                    message_fa: 'کالا هم‌زمان توسط کاربر دیگری تغییر کرده است؛ دوباره بارگیری کنید.',
                });
            }
            return row;
        }
        async remove(companyId, id) {
            this.assertId(id);
            const ok = await this.repo.softDelete(companyId, id);
            if (!ok)
                throw new common_1.NotFoundException({ code: 'not_found', message_fa: 'کالا یافت نشد' });
        }
        async assertReferences(companyId, dto) {
            if (dto.category_id && !(await this.repo.categoryExists(companyId, dto.category_id))) {
                throw new common_1.BadRequestException({
                    code: 'invalid_category',
                    message_fa: 'دسته‌بندی انتخاب‌شده برای این شرکت تعریف نشده است.',
                });
            }
            if (dto.base_uom_id && !(await this.repo.uomExists(dto.base_uom_id))) {
                throw new common_1.BadRequestException({
                    code: 'invalid_uom',
                    message_fa: 'واحد اندازه‌گیری انتخاب‌شده معتبر نیست.',
                });
            }
        }
        mapDbError(err, action) {
            const pgErr = err;
            if (pgErr?.code === '23505' && pgErr.constraint === 'uq_product_code') {
                return new common_1.ConflictException({
                    code: 'duplicate_code',
                    message_fa: 'کد کالا قبلاً ثبت شده است؛ کد دیگری انتخاب کنید.',
                });
            }
            if (pgErr?.code === '23514') {
                return new common_1.BadRequestException({
                    code: 'check_violation',
                    message_fa: `شرایط کالا معتبر نیست (${pgErr.constraint}).`,
                });
            }
            if (pgErr?.code === '23503') {
                return new common_1.BadRequestException({
                    code: 'invalid_reference',
                    message_fa: 'یکی از مراجع (دسته‌بندی/واحد) معتبر نیست.',
                });
            }
            return new common_1.BadRequestException({
                code: `${action}_failed`,
                message_fa: 'خطای غیرمنتظره در ذخیره کالا.',
                details: { db_code: pgErr?.code },
            });
        }
    };
    return ProductService = _classThis;
})();
exports.ProductService = ProductService;
