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
exports.CustomerService = void 0;
const common_1 = require("@nestjs/common");
const class_validator_1 = require("class-validator");
const badRequest = (code, message_fa) => new common_1.BadRequestException({ code, message_fa });
const notFound = () => new common_1.NotFoundException({ code: 'not_found', message_fa: 'مشتری یافت نشد' });
/**
 * سرویس مشتریان — مسیرهای openapi › /customers با قواعد DDL (مهاجرت 0007):
 * - person/شعبه/حوزه/مسیر/ویزیتور/لیست قیمت/تسویه باید متعلق به شرکت نشست باشند
 *   (بررسی با پیام فارسی پیش از رسیدن به دیتابیس، نه خطای کلید خارجی)
 * - کد مشتری در شعبه یکتا (uq_customer_code) و هر شخص فقط یک ردیف مشتری
 * - geo با [طول، عرض] می‌آید و محدوده مختصات سنجیده می‌شود؛ قید ck_customer_geo
 *   منشأ و زمان ثبت را همراه مختصات می‌خواهد (در repository ست می‌شود)
 * - credit_limit در customer_credit ذخیره/به‌روزرسانی می‌شود
 */
let CustomerService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var CustomerService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            CustomerService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        repo;
        constructor(repo) {
            this.repo = repo;
        }
        assertId(id) {
            if (!(0, class_validator_1.isUUID)(id, '4')) {
                throw badRequest('invalid_id', 'شناسه ارسال‌شده معتبر نیست.');
            }
        }
        /** محدوده طول/عرض جغرافیایی — با details.fields همان ساختار خطای اعتبارسنجی سراسری */
        assertGeo(geo) {
            if (!geo)
                return;
            const [lng, lat] = geo.coordinates;
            if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
                throw new common_1.BadRequestException({
                    code: 'invalid_geo',
                    message_fa: 'مختصات جغرافیایی خارج از محدوده مجاز است؛ طول بین ۱۸۰- تا ۱۸۰+ و عرض بین ۹۰- تا ۹۰+ باشد.',
                    details: { fields: { geo: ['مختصات [طول، عرض] را در محدوده مجاز وارد کنید.'] } },
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
        async create(companyId, dto, userId) {
            this.assertGeo(dto.geo);
            const branchId = await this.resolveBranch(companyId, dto.branch_id);
            await this.validateReferences(companyId, dto);
            let id;
            try {
                id = await this.repo.insert(companyId, dto, branchId, userId);
            }
            catch (err) {
                throw this.mapDbError(err);
            }
            const row = await this.repo.findById(companyId, id);
            if (!row)
                throw notFound();
            return row;
        }
        async update(companyId, id, dto, userId) {
            this.assertId(id);
            const before = await this.repo.findById(companyId, id);
            if (!before)
                throw notFound();
            this.assertGeo(dto.geo);
            await this.validateReferences(companyId, dto);
            try {
                const updated = await this.repo.update(companyId, id, dto, userId);
                if (!updated)
                    throw notFound();
            }
            catch (err) {
                if (err instanceof common_1.NotFoundException)
                    throw err;
                throw this.mapDbError(err);
            }
            return this.get(companyId, id);
        }
        /** PUT /customers/{id}/location — ثبت/تصحیح موقعیت توسط فروشنده در نقشه */
        async setLocation(companyId, id, dto, userId) {
            this.assertId(id);
            this.assertGeo(dto.geo);
            const updated = await this.repo.setLocation(companyId, id, dto, userId);
            if (!updated)
                throw notFound();
            return this.get(companyId, id);
        }
        /** شعبه اگر نیامده باشد شعبه پیش‌فرض شرکت (ستون branch_id NOT NULL است) */
        async resolveBranch(companyId, branchId) {
            if (branchId) {
                if (!(await this.repo.branchExists(companyId, branchId))) {
                    throw badRequest('branch_not_found', 'شعبه انتخاب‌شده در این شرکت یافت نشد.');
                }
                return branchId;
            }
            const fallback = await this.repo.defaultBranchId(companyId);
            if (!fallback) {
                throw badRequest('branch_missing', 'شرکت نشست شعبه‌ای ندارد؛ ابتدا شعبه تعریف کنید.');
            }
            return fallback;
        }
        /** اعتبارسنجی همه ارجاع‌های موجود در بدنه (فیلدهای نیامده سنجیده نمی‌شوند) */
        async validateReferences(companyId, dto) {
            if (dto.person_id && !(await this.repo.personExists(companyId, dto.person_id))) {
                throw badRequest('person_not_found', 'شخص اشاره‌شده در این شرکت یافت نشد.');
            }
            if (dto.area_id && !(await this.repo.areaExists(companyId, dto.area_id))) {
                throw badRequest('area_not_found', 'حوزه فروش انتخاب‌شده در این شرکت یافت نشد.');
            }
            if (dto.route_id && !(await this.repo.routeExists(companyId, dto.route_id))) {
                throw badRequest('route_not_found', 'مسیر انتخاب‌شده در این شرکت یافت نشد.');
            }
            if (dto.salesperson_id && !(await this.repo.staffExists(companyId, dto.salesperson_id))) {
                throw badRequest('salesperson_not_found', 'ویزیتور انتخاب‌شده پرسنل معتبری در این شرکت نیست.');
            }
            if (dto.price_list_id && !(await this.repo.priceListExists(companyId, dto.price_list_id))) {
                throw badRequest('price_list_not_found', 'لیست قیمت انتخاب‌شده در این شرکت یافت نشد.');
            }
            if (dto.settlement_term_id && !(await this.repo.settlementTermExists(companyId, dto.settlement_term_id))) {
                throw badRequest('settlement_term_not_found', 'شرط تسویه انتخاب‌شده در این شرکت یافت نشد.');
            }
            if (dto.branch_id && !(await this.repo.branchExists(companyId, dto.branch_id))) {
                throw badRequest('branch_not_found', 'شعبه انتخاب‌شده در این شرکت یافت نشد.');
            }
        }
        mapDbError(err) {
            const pgErr = err;
            if (pgErr?.code === '23505' && pgErr.constraint === 'uq_customer_code') {
                return new common_1.ConflictException({
                    code: 'duplicate_code',
                    message_fa: 'کد مشتری برای این شعبه قبلاً ثبت شده است؛ کد دیگری انتخاب کنید.',
                });
            }
            if (pgErr?.code === '23505') {
                return new common_1.ConflictException({
                    code: 'duplicate_person',
                    message_fa: 'این شخص قبلاً به‌عنوان مشتری ثبت شده است؛ هر شخص فقط یک ردیف مشتری دارد.',
                    details: { constraint: pgErr.constraint },
                });
            }
            if (pgErr?.code === '23503') {
                return badRequest('reference_invalid', 'یکی از ارجاع‌های ارسال‌شده معتبر نیست.');
            }
            if (pgErr?.code === '23514') {
                if (pgErr.constraint === 'ck_customer_geo') {
                    return badRequest('geo_source_required', 'برای ثبت موقعیت، منشأ (geo_source) مشخص نیست؛ gps یا map_pick را انتخاب کنید.');
                }
                return badRequest('check_violation', 'مقدار ارسال‌شده برای یکی از فیلدها مجاز نیست (کانال، وضعیت یا سقف اعتبار را بررسی کنید).');
            }
            return badRequest('customer_save_failed', 'خطای غیرمنتظره در ذخیره مشتری.');
        }
    };
    return CustomerService = _classThis;
})();
exports.CustomerService = CustomerService;
