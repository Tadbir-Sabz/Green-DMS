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
exports.StaffService = void 0;
const common_1 = require("@nestjs/common");
const class_validator_1 = require("class-validator");
const badRequest = (code, message_fa) => new common_1.BadRequestException({ code, message_fa });
const notFound = () => new common_1.NotFoundException({ code: 'not_found', message_fa: 'پرسنل یافت نشد' });
/**
 * سرویس پرسنل — مسیرهای openapi › /staff با قواعد DDL (مهاجرت 0004) و 0026:
 * - person/سمت/شعبه/سرپرست/وسیله/حوزه همه باید متعلق به شرکت نشست باشند
 *   (بررسی با پیام فارسی پیش از رسیدن به دیتابیس، نه خطای کلید خارجی)
 * - job_position_id NOT NULL است پس job_position_code در ساخت الزامی می‌شود
 * - status قرارداد دو حالت دارد؛ نگاشت دوطرفه با سه‌حالت DB در repository است
 * - area_ids (حوزه‌های مجاز کار) در جدول staff_area نگهداری و جایگزین می‌شود
 */
let StaffService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var StaffService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            StaffService = _classThis = _classDescriptor.value;
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
            const { branchId, jobPositionId } = await this.resolveReferences(companyId, dto);
            if (dto.supervisor_id && !(await this.repo.staffExists(companyId, dto.supervisor_id))) {
                throw badRequest('supervisor_not_found', 'سرپرست انتخاب‌شده پرسنل معتبری در این شرکت نیست.');
            }
            if (dto.vehicle_id && !(await this.repo.vehicleExists(companyId, dto.vehicle_id))) {
                throw badRequest('vehicle_not_found', 'وسیله نقلیه انتخاب‌شده در این شرکت یافت نشد.');
            }
            let id;
            try {
                id = await this.repo.insert(dto, branchId, jobPositionId);
            }
            catch (err) {
                throw this.mapDbError(err);
            }
            if (dto.area_ids)
                await this.repo.replaceAreas(id, dto.area_ids);
            const row = await this.repo.findById(companyId, id);
            if (!row)
                throw notFound();
            return row;
        }
        async update(companyId, id, dto) {
            this.assertId(id);
            const before = await this.repo.findById(companyId, id);
            if (!before)
                throw notFound();
            // قید ck_staff_no_self_supervisor: سرپرست نمی‌تواند خودِ همان پرسنل باشد
            if (dto.supervisor_id && dto.supervisor_id === id) {
                throw badRequest('supervisor_self', 'پرسنل نمی‌تواند سرپرست خودش باشد.');
            }
            if (dto.person_id && dto.person_id !== before.person_id) {
                if (!(await this.repo.personExists(companyId, dto.person_id))) {
                    throw badRequest('person_not_found', 'شخص اشاره‌شده در این شرکت یافت نشد.');
                }
            }
            if (dto.supervisor_id && !(await this.repo.staffExists(companyId, dto.supervisor_id))) {
                throw badRequest('supervisor_not_found', 'سرپرست انتخاب‌شده پرسنل معتبری در این شرکت نیست.');
            }
            if (dto.vehicle_id && !(await this.repo.vehicleExists(companyId, dto.vehicle_id))) {
                throw badRequest('vehicle_not_found', 'وسیله نقلیه انتخاب‌شده در این شرکت یافت نشد.');
            }
            if (dto.area_ids && !(await this.repo.areasBelongTo(companyId, dto.area_ids))) {
                throw badRequest('area_not_found', 'یکی از حوزه‌های انتخاب‌شده در این شرکت یافت نشد.');
            }
            let jobPositionId;
            if (dto.job_position_code !== undefined) {
                jobPositionId = await this.jobPositionId(companyId, dto.job_position_code);
            }
            try {
                const updated = await this.repo.update(companyId, id, dto, jobPositionId);
                if (!updated)
                    throw notFound();
            }
            catch (err) {
                if (err instanceof common_1.NotFoundException)
                    throw err;
                throw this.mapDbError(err);
            }
            if (dto.area_ids !== undefined)
                await this.repo.replaceAreas(id, dto.area_ids);
            return this.get(companyId, id);
        }
        /** شعبه و سمتِ معتبرِ همین شرکت — شعبه اگر نیامده باشد شعبه پیش‌فرض گرفته می‌شود */
        async resolveReferences(companyId, dto) {
            if (!dto.job_position_code) {
                throw badRequest('job_position_required', 'سمت شغلی (job_position_code) برای پرسنل الزامی است.');
            }
            const personOk = await this.repo.personExists(companyId, dto.person_id);
            if (!personOk) {
                throw badRequest('person_not_found', 'شخص اشاره‌شده در این شرکت یافت نشد.');
            }
            const jobPositionId = await this.jobPositionId(companyId, dto.job_position_code);
            let branchId;
            if (dto.branch_id) {
                branchId = (await this.repo.branchExists(companyId, dto.branch_id))
                    ? dto.branch_id
                    : null;
                if (!branchId)
                    throw badRequest('branch_not_found', 'شعبه انتخاب‌شده در این شرکت یافت نشد.');
            }
            else {
                branchId = await this.repo.defaultBranchId(companyId);
                if (!branchId) {
                    throw badRequest('branch_missing', 'شرکت نشست شعبه‌ای ندارد؛ ابتدا شعبه تعریف کنید.');
                }
            }
            if (dto.area_ids && !(await this.repo.areasBelongTo(companyId, dto.area_ids))) {
                throw badRequest('area_not_found', 'یکی از حوزه‌های انتخاب‌شده در این شرکت یافت نشد.');
            }
            return { branchId, jobPositionId };
        }
        async jobPositionId(companyId, code) {
            const id = await this.repo.jobPositionId(companyId, code);
            if (!id) {
                throw badRequest('job_position_not_found', `سمت «${code}» برای این شرکت تعریف نشده است.`);
            }
            return id;
        }
        mapDbError(err) {
            const pgErr = err;
            if (pgErr?.code === '23505' && pgErr.constraint === 'staff_person_id_key') {
                return new common_1.ConflictException({
                    code: 'duplicate_person',
                    message_fa: 'این شخص قبلاً به‌عنوان پرسنل ثبت شده است؛ هر شخص فقط یک ردیف پرسنل دارد.',
                });
            }
            if (pgErr?.code === '23505') {
                return new common_1.ConflictException({
                    code: 'duplicate_employee_no',
                    message_fa: 'شماره پرسنلی (employee_no) برای این شعبه قبلاً ثبت شده است.',
                    details: { constraint: pgErr.constraint },
                });
            }
            if (pgErr?.code === '23503') {
                return badRequest('reference_invalid', 'یکی از ارجاع‌های ارسال‌شده معتبر نیست.');
            }
            if (pgErr?.code === '23514') {
                return badRequest('check_violation', 'مقدار ارسال‌شده برای یکی از فیلدها مجاز نیست.');
            }
            return badRequest('staff_save_failed', 'خطای غیرمنتظره در ذخیره پرسنل.');
        }
    };
    return StaffService = _classThis;
})();
exports.StaffService = StaffService;
