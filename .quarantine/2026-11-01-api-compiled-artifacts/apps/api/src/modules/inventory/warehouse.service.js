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
exports.WarehouseService = void 0;
const common_1 = require("@nestjs/common");
const class_validator_1 = require("class-validator");
const badRequest = (code, message_fa) => new common_1.BadRequestException({ code, message_fa });
const notFound = () => new common_1.NotFoundException({ code: 'not_found', message_fa: 'انبار یافت نشد' });
/**
 * سرویس انبار — مسیرهای openapi › /warehouses با قواعد DDL (مهاجرت 0008):
 * - شعبه/حوزه/وسیله/انبار والد باید متعلق به شرکت نشست باشند (پیام فارسی پیش از دیتابیس)
 * - کد انبار در شعبه یکتا (uq_warehouse_code)
 * - قید ck_warehouse_vehicle: «kind=vehicle ⟺ vehicle_id مقدار دارد»
 */
let WarehouseService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var WarehouseService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            WarehouseService = _classThis = _classDescriptor.value;
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
        /** قید ck_warehouse_vehicle — با حالت ادغام‌شدهٔ به‌روزرسانی سنجیده می‌شود */
        assertVehicleConsistency(kind, vehicleId) {
            const isVehicle = kind === 'vehicle';
            const hasVehicle = Boolean(vehicleId);
            if (isVehicle && !hasVehicle) {
                throw badRequest('vehicle_required', 'انبار خودرو (kind=vehicle) باید شناسه وسیله نقلیه (vehicle_id) داشته باشد.');
            }
            if (!isVehicle && hasVehicle) {
                throw badRequest('vehicle_not_allowed', 'فقط انبار خودرو (kind=vehicle) می‌تواند vehicle_id داشته باشد؛ برای انبار دیگر vehicle_id را خالی بگذارید.');
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
            this.assertVehicleConsistency(dto.kind, dto.vehicle_id);
            const branchId = await this.resolveBranch(companyId, dto.branch_id);
            await this.validateReferences(companyId, dto);
            let id;
            try {
                id = await this.repo.insert(companyId, dto, branchId);
            }
            catch (err) {
                throw this.mapDbError(err);
            }
            return this.get(companyId, id);
        }
        async update(companyId, id, dto) {
            this.assertId(id);
            const before = await this.repo.findById(companyId, id);
            if (!before)
                throw notFound();
            // بررسی قید خودرو روی حالت ادغام‌شده (فیلدهای نیامده از ردیف فعلی می‌آیند)
            const mergedKind = dto.kind ?? before.kind;
            const mergedVehicle = dto.vehicle_id !== undefined ? dto.vehicle_id : before.vehicle_id;
            this.assertVehicleConsistency(mergedKind, mergedVehicle);
            await this.validateReferences(companyId, dto);
            if (dto.branch_id && !(await this.repo.branchExists(companyId, dto.branch_id))) {
                throw badRequest('branch_not_found', 'شعبه انتخاب‌شده در این شرکت یافت نشد.');
            }
            try {
                const updated = await this.repo.update(companyId, id, dto);
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
        /** اعتبارسنجی ارجاع‌های موجود در بدنه (فیلدهای نیامده سنجیده نمی‌شوند) */
        async validateReferences(companyId, dto) {
            if (dto.parent_warehouse_id && !(await this.repo.warehouseExists(companyId, dto.parent_warehouse_id))) {
                throw badRequest('parent_warehouse_not_found', 'انبار والد انتخاب‌شده در این شرکت یافت نشد.');
            }
            if (dto.vehicle_id && !(await this.repo.vehicleExists(dto.vehicle_id))) {
                throw badRequest('vehicle_not_found', 'وسیله نقلیه انتخاب‌شده یافت نشد.');
            }
            if (dto.area_id && !(await this.repo.areaExists(companyId, dto.area_id))) {
                throw badRequest('area_not_found', 'حوزه فروش انتخاب‌شده در این شرکت یافت نشد.');
            }
        }
        mapDbError(err) {
            const pgErr = err;
            if (pgErr?.code === '23505' && pgErr.constraint === 'uq_warehouse_code') {
                return new common_1.ConflictException({
                    code: 'duplicate_code',
                    message_fa: 'کد انبار برای این شعبه قبلاً ثبت شده است؛ کد دیگری انتخاب کنید.',
                });
            }
            if (pgErr?.code === '23505') {
                // ایندکس یکتای vehicle_id — هر وسیله فقط یک انبار خودرو دارد
                return new common_1.ConflictException({
                    code: 'duplicate_vehicle',
                    message_fa: 'این وسیله نقلیه قبلاً به‌عنوان انبار خودرو ثبت شده است.',
                    details: { constraint: pgErr.constraint },
                });
            }
            if (pgErr?.code === '23503') {
                return badRequest('reference_invalid', 'یکی از ارجاع‌های ارسال‌شده معتبر نیست.');
            }
            if (pgErr?.code === '23514' && pgErr.constraint === 'ck_warehouse_vehicle') {
                return badRequest('vehicle_required', 'قید انبار خودرو رعایت نشده؛ kind=vehicle و vehicle_id باید همراه هم باشند.');
            }
            if (pgErr?.code === '23514') {
                return badRequest('check_violation', 'مقدار ارسال‌شده برای یکی از فیلدها مجاز نیست.');
            }
            return badRequest('warehouse_save_failed', 'خطای غیرمنتظره در ذخیره انبار.');
        }
    };
    return WarehouseService = _classThis;
})();
exports.WarehouseService = WarehouseService;
