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
exports.StructureService = void 0;
const common_1 = require("@nestjs/common");
const class_validator_1 = require("class-validator");
const badRequest = (code, message_fa) => new common_1.BadRequestException({ code, message_fa });
const notFound = (what) => new common_1.NotFoundException({ code: 'not_found', message_fa: `${what} یافت نشد` });
let StructureService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var StructureService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            StructureService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        repo;
        constructor(repo) {
            this.repo = repo;
        }
        assertId(id, what) {
            if (!(0, class_validator_1.isUUID)(id, '4'))
                throw badRequest('invalid_id', `شناسه ${what} ارسال‌شده معتبر نیست.`);
        }
        /** شعبهٔ مالک حوزه: اگر client نفرستد شعبهٔ پیش‌فرض شرکت گرفته می‌شود */
        async resolveBranch(companyId, branchId) {
            if (branchId) {
                if (!(await this.repo.branchExists(companyId, branchId))) {
                    throw badRequest('branch_not_found', 'شعبهٔ انتخاب‌شده در این شرکت یافت نشد.');
                }
                return branchId;
            }
            const fallback = await this.repo.defaultBranchId(companyId);
            if (!fallback) {
                throw badRequest('branch_missing', 'شرکت شعبهٔ فعال ندارد؛ ابتدا شعبه تعریف کنید.');
            }
            return fallback;
        }
        async validateCustomers(companyId, customerIds) {
            if (!customerIds)
                return;
            if (!(await this.repo.customersBelongToCompany(companyId, customerIds))) {
                throw badRequest('customer_not_found', 'یکی از مشتریان انتخاب‌شده در این شرکت یافت نشد.');
            }
        }
        // ---------------- حوزه فروش ----------------
        async listAreas(companyId, query) {
            const { items, nextCursor, hasMore } = await this.repo.listAreas(companyId, query);
            return { items, next_cursor: nextCursor, has_more: hasMore };
        }
        async getArea(companyId, id) {
            this.assertId(id, 'حوزه');
            const row = await this.repo.findArea(companyId, id);
            if (!row)
                throw notFound('حوزه');
            return row;
        }
        async createArea(companyId, dto) {
            const branchId = await this.resolveBranch(companyId, dto.branch_id);
            if (dto.parent_area_id && !(await this.repo.areaExists(companyId, dto.parent_area_id))) {
                throw badRequest('parent_area_not_found', 'حوزهٔ والد انتخاب‌شده یافت نشد.');
            }
            let id;
            try {
                id = await this.repo.insertArea(branchId, dto);
            }
            catch (err) {
                throw this.mapAreaError(err);
            }
            return this.getArea(companyId, id);
        }
        async updateArea(companyId, id, dto) {
            this.assertId(id, 'حوزه');
            if (dto.parent_area_id && !(await this.repo.areaExists(companyId, dto.parent_area_id))) {
                throw badRequest('parent_area_not_found', 'حوزهٔ والد انتخاب‌شده یافت نشد.');
            }
            if (dto.branch_id && !(await this.repo.branchExists(companyId, dto.branch_id))) {
                throw badRequest('branch_not_found', 'شعبهٔ انتخاب‌شده در این شرکت یافت نشد.');
            }
            try {
                const updated = await this.repo.updateArea(companyId, id, dto);
                if (!updated)
                    throw notFound('حوزه');
            }
            catch (err) {
                if (err instanceof common_1.NotFoundException)
                    throw err;
                throw this.mapAreaError(err);
            }
            return this.getArea(companyId, id);
        }
        mapAreaError(err) {
            const e = err;
            if (e?.code === '23505' && e.constraint === 'uq_sales_area_code') {
                return new common_1.ConflictException({
                    code: 'duplicate_code',
                    message_fa: 'کد حوزه در این شعبه قبلاً ثبت شده است.',
                });
            }
            if (e?.code === '23503') {
                return badRequest('reference_invalid', 'یکی از ارجاع‌های ارسال‌شده معتبر نیست.');
            }
            if (e?.code === '23502') {
                return badRequest('missing_field', 'یکی از فیلدهای الزامی وارد نشده است.');
            }
            return badRequest('area_save_failed', 'خطای غیرمنتظره در ذخیره حوزه.');
        }
        // ---------------- مسیر فروش ----------------
        async listRoutes(companyId, query) {
            const { items, nextCursor, hasMore } = await this.repo.listRoutes(companyId, query);
            return { items, next_cursor: nextCursor, has_more: hasMore };
        }
        async getRoute(companyId, id) {
            this.assertId(id, 'مسیر');
            const row = await this.repo.findRoute(companyId, id);
            if (!row)
                throw notFound('مسیر');
            const customer_ids = await this.repo.findRouteCustomerIds(companyId, id);
            return { ...row, customer_ids };
        }
        async createRoute(companyId, dto) {
            if (!(await this.repo.areaExists(companyId, dto.area_id))) {
                throw badRequest('area_not_found', 'حوزهٔ انتخاب‌شده یافت نشد.');
            }
            await this.validateCustomers(companyId, dto.customer_ids);
            let id;
            try {
                id = await this.repo.insertRoute(companyId, dto);
            }
            catch (err) {
                throw this.mapRouteError(err);
            }
            return this.getRoute(companyId, id);
        }
        async updateRoute(companyId, id, dto) {
            this.assertId(id, 'مسیر');
            if (dto.area_id && !(await this.repo.areaExists(companyId, dto.area_id))) {
                throw badRequest('area_not_found', 'حوزهٔ انتخاب‌شده یافت نشد.');
            }
            await this.validateCustomers(companyId, dto.customer_ids);
            try {
                const updated = await this.repo.updateRoute(companyId, id, dto);
                if (!updated)
                    throw notFound('مسیر');
            }
            catch (err) {
                if (err instanceof common_1.NotFoundException)
                    throw err;
                throw this.mapRouteError(err);
            }
            return this.getRoute(companyId, id);
        }
        mapRouteError(err) {
            const e = err;
            if (e?.code === '23505' && e.constraint === 'uq_route_code') {
                return new common_1.ConflictException({
                    code: 'duplicate_code',
                    message_fa: 'کد مسیر در این حوزه قبلاً ثبت شده است.',
                });
            }
            if (e?.code === '23503') {
                return badRequest('reference_invalid', 'یکی از ارجاع‌های ارسال‌شده معتبر نیست.');
            }
            if (e?.code === '23502') {
                return badRequest('missing_field', 'یکی از فیلدهای الزامی وارد نشده است.');
            }
            return badRequest('route_save_failed', 'خطای غیرمنتظره در ذخیره مسیر.');
        }
    };
    return StructureService = _classThis;
})();
exports.StructureService = StructureService;
