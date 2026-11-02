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
exports.ListStaffQueryDto = exports.UpdateStaffDto = exports.CreateStaffDto = exports.STAFF_STATUSES = void 0;
const mapped_types_1 = require("@nestjs/mapped-types");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
/**
 * مقادیر مجاز status — دقیقاً enum اسکیمای Staff در openapi.yaml.
 * در دیتابیس active/suspended/terminated است؛ نگاشت دوطرفه در
 * repository انجام می‌شود (خواندن: غیرفعال → inactive، نوشتن: inactive → terminated).
 */
exports.STAFF_STATUSES = ['active', 'inactive'];
/** پارامتر query بولینی openapi («true»/«false») را به boolean تبدیل می‌کند */
const toBoolean = ({ value }) => {
    if (value === 'true' || value === true)
        return true;
    if (value === 'false' || value === false)
        return false;
    return value;
};
/**
 * POST /api/v1/staff — openapi › schemas.Staff
 * person_id طبق قرارداد الزامی است؛ job_position_code هم عملاً الزامی است
 * (ستون job_position_id NOT NULL) و نبودش با پیام فارسی 400 می‌دهد نه خطای قید.
 */
let CreateStaffDto = (() => {
    let _person_id_decorators;
    let _person_id_initializers = [];
    let _person_id_extraInitializers = [];
    let _branch_id_decorators;
    let _branch_id_initializers = [];
    let _branch_id_extraInitializers = [];
    let _job_position_code_decorators;
    let _job_position_code_initializers = [];
    let _job_position_code_extraInitializers = [];
    let _employee_no_decorators;
    let _employee_no_initializers = [];
    let _employee_no_extraInitializers = [];
    let _hire_date_decorators;
    let _hire_date_initializers = [];
    let _hire_date_extraInitializers = [];
    let _supervisor_id_decorators;
    let _supervisor_id_initializers = [];
    let _supervisor_id_extraInitializers = [];
    let _vehicle_id_decorators;
    let _vehicle_id_initializers = [];
    let _vehicle_id_extraInitializers = [];
    let _is_field_decorators;
    let _is_field_initializers = [];
    let _is_field_extraInitializers = [];
    let _area_ids_decorators;
    let _area_ids_initializers = [];
    let _area_ids_extraInitializers = [];
    let _status_decorators;
    let _status_initializers = [];
    let _status_extraInitializers = [];
    return class CreateStaffDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _person_id_decorators = [(0, class_validator_1.IsDefined)(), (0, class_validator_1.IsUUID)('4')];
            _branch_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _job_position_code_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.IsNotEmpty)(), (0, class_validator_1.MaxLength)(64)];
            _employee_no_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.MaxLength)(32)];
            _hire_date_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.Matches)(/^\d{4}-\d{2}-\d{2}$/, {
                    message: 'تاریخ استخدام باید به شکل YYYY-MM-DD باشد.',
                })];
            _supervisor_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _vehicle_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _is_field_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsBoolean)()];
            _area_ids_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsArray)(), (0, class_validator_1.IsUUID)('4', { each: true })];
            _status_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsIn)(exports.STAFF_STATUSES)];
            __esDecorate(null, null, _person_id_decorators, { kind: "field", name: "person_id", static: false, private: false, access: { has: obj => "person_id" in obj, get: obj => obj.person_id, set: (obj, value) => { obj.person_id = value; } }, metadata: _metadata }, _person_id_initializers, _person_id_extraInitializers);
            __esDecorate(null, null, _branch_id_decorators, { kind: "field", name: "branch_id", static: false, private: false, access: { has: obj => "branch_id" in obj, get: obj => obj.branch_id, set: (obj, value) => { obj.branch_id = value; } }, metadata: _metadata }, _branch_id_initializers, _branch_id_extraInitializers);
            __esDecorate(null, null, _job_position_code_decorators, { kind: "field", name: "job_position_code", static: false, private: false, access: { has: obj => "job_position_code" in obj, get: obj => obj.job_position_code, set: (obj, value) => { obj.job_position_code = value; } }, metadata: _metadata }, _job_position_code_initializers, _job_position_code_extraInitializers);
            __esDecorate(null, null, _employee_no_decorators, { kind: "field", name: "employee_no", static: false, private: false, access: { has: obj => "employee_no" in obj, get: obj => obj.employee_no, set: (obj, value) => { obj.employee_no = value; } }, metadata: _metadata }, _employee_no_initializers, _employee_no_extraInitializers);
            __esDecorate(null, null, _hire_date_decorators, { kind: "field", name: "hire_date", static: false, private: false, access: { has: obj => "hire_date" in obj, get: obj => obj.hire_date, set: (obj, value) => { obj.hire_date = value; } }, metadata: _metadata }, _hire_date_initializers, _hire_date_extraInitializers);
            __esDecorate(null, null, _supervisor_id_decorators, { kind: "field", name: "supervisor_id", static: false, private: false, access: { has: obj => "supervisor_id" in obj, get: obj => obj.supervisor_id, set: (obj, value) => { obj.supervisor_id = value; } }, metadata: _metadata }, _supervisor_id_initializers, _supervisor_id_extraInitializers);
            __esDecorate(null, null, _vehicle_id_decorators, { kind: "field", name: "vehicle_id", static: false, private: false, access: { has: obj => "vehicle_id" in obj, get: obj => obj.vehicle_id, set: (obj, value) => { obj.vehicle_id = value; } }, metadata: _metadata }, _vehicle_id_initializers, _vehicle_id_extraInitializers);
            __esDecorate(null, null, _is_field_decorators, { kind: "field", name: "is_field", static: false, private: false, access: { has: obj => "is_field" in obj, get: obj => obj.is_field, set: (obj, value) => { obj.is_field = value; } }, metadata: _metadata }, _is_field_initializers, _is_field_extraInitializers);
            __esDecorate(null, null, _area_ids_decorators, { kind: "field", name: "area_ids", static: false, private: false, access: { has: obj => "area_ids" in obj, get: obj => obj.area_ids, set: (obj, value) => { obj.area_ids = value; } }, metadata: _metadata }, _area_ids_initializers, _area_ids_extraInitializers);
            __esDecorate(null, null, _status_decorators, { kind: "field", name: "status", static: false, private: false, access: { has: obj => "status" in obj, get: obj => obj.status, set: (obj, value) => { obj.status = value; } }, metadata: _metadata }, _status_initializers, _status_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        person_id = __runInitializers(this, _person_id_initializers, void 0);
        branch_id = (__runInitializers(this, _person_id_extraInitializers), __runInitializers(this, _branch_id_initializers, void 0));
        job_position_code = (__runInitializers(this, _branch_id_extraInitializers), __runInitializers(this, _job_position_code_initializers, void 0));
        employee_no = (__runInitializers(this, _job_position_code_extraInitializers), __runInitializers(this, _employee_no_initializers, void 0));
        /** تاریخ استخدام — دقیقاً YYYY-MM-DD (ستون date) */
        hire_date = (__runInitializers(this, _employee_no_extraInitializers), __runInitializers(this, _hire_date_initializers, void 0));
        supervisor_id = (__runInitializers(this, _hire_date_extraInitializers), __runInitializers(this, _supervisor_id_initializers, void 0));
        vehicle_id = (__runInitializers(this, _supervisor_id_extraInitializers), __runInitializers(this, _vehicle_id_initializers, void 0));
        is_field = (__runInitializers(this, _vehicle_id_extraInitializers), __runInitializers(this, _is_field_initializers, void 0));
        /** حوزه‌های مجاز کار (openapi › area_ids) */
        area_ids = (__runInitializers(this, _is_field_extraInitializers), __runInitializers(this, _area_ids_initializers, void 0));
        status = (__runInitializers(this, _area_ids_extraInitializers), __runInitializers(this, _status_initializers, void 0));
        constructor() {
            __runInitializers(this, _status_extraInitializers);
        }
    };
})();
exports.CreateStaffDto = CreateStaffDto;
/** PATCH /api/v1/staff/{id} — همه فیلدها اختیاری (طبق قرارداد بدنه کاملِ Staff است) */
class UpdateStaffDto extends (0, mapped_types_1.PartialType)(CreateStaffDto) {
}
exports.UpdateStaffDto = UpdateStaffDto;
/** GET /api/v1/staff — فیلترهای قرارداد + صفحه‌بندی cursor */
let ListStaffQueryDto = (() => {
    let _job_position_code_decorators;
    let _job_position_code_initializers = [];
    let _job_position_code_extraInitializers = [];
    let _supervisor_id_decorators;
    let _supervisor_id_initializers = [];
    let _supervisor_id_extraInitializers = [];
    let _is_field_decorators;
    let _is_field_initializers = [];
    let _is_field_extraInitializers = [];
    let _cursor_decorators;
    let _cursor_initializers = [];
    let _cursor_extraInitializers = [];
    let _limit_decorators;
    let _limit_initializers = [];
    let _limit_extraInitializers = [];
    return class ListStaffQueryDto {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _job_position_code_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)(), (0, class_validator_1.MaxLength)(64)];
            _supervisor_id_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsUUID)('4')];
            _is_field_decorators = [(0, class_validator_1.IsOptional)(), (0, class_transformer_1.Transform)(toBoolean), (0, class_validator_1.IsBoolean)()];
            _cursor_decorators = [(0, class_validator_1.IsOptional)(), (0, class_validator_1.IsString)()];
            _limit_decorators = [(0, class_validator_1.IsOptional)(), (0, class_transformer_1.Type)(() => Number), (0, class_validator_1.IsInt)(), (0, class_validator_1.Min)(1), (0, class_validator_1.Max)(200)];
            __esDecorate(null, null, _job_position_code_decorators, { kind: "field", name: "job_position_code", static: false, private: false, access: { has: obj => "job_position_code" in obj, get: obj => obj.job_position_code, set: (obj, value) => { obj.job_position_code = value; } }, metadata: _metadata }, _job_position_code_initializers, _job_position_code_extraInitializers);
            __esDecorate(null, null, _supervisor_id_decorators, { kind: "field", name: "supervisor_id", static: false, private: false, access: { has: obj => "supervisor_id" in obj, get: obj => obj.supervisor_id, set: (obj, value) => { obj.supervisor_id = value; } }, metadata: _metadata }, _supervisor_id_initializers, _supervisor_id_extraInitializers);
            __esDecorate(null, null, _is_field_decorators, { kind: "field", name: "is_field", static: false, private: false, access: { has: obj => "is_field" in obj, get: obj => obj.is_field, set: (obj, value) => { obj.is_field = value; } }, metadata: _metadata }, _is_field_initializers, _is_field_extraInitializers);
            __esDecorate(null, null, _cursor_decorators, { kind: "field", name: "cursor", static: false, private: false, access: { has: obj => "cursor" in obj, get: obj => obj.cursor, set: (obj, value) => { obj.cursor = value; } }, metadata: _metadata }, _cursor_initializers, _cursor_extraInitializers);
            __esDecorate(null, null, _limit_decorators, { kind: "field", name: "limit", static: false, private: false, access: { has: obj => "limit" in obj, get: obj => obj.limit, set: (obj, value) => { obj.limit = value; } }, metadata: _metadata }, _limit_initializers, _limit_extraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        job_position_code = __runInitializers(this, _job_position_code_initializers, void 0);
        supervisor_id = (__runInitializers(this, _job_position_code_extraInitializers), __runInitializers(this, _supervisor_id_initializers, void 0));
        /** فقط میدانی‌ها */
        is_field = (__runInitializers(this, _supervisor_id_extraInitializers), __runInitializers(this, _is_field_initializers, void 0));
        cursor = (__runInitializers(this, _is_field_extraInitializers), __runInitializers(this, _cursor_initializers, void 0));
        limit = (__runInitializers(this, _cursor_extraInitializers), __runInitializers(this, _limit_initializers, 50));
        constructor() {
            __runInitializers(this, _limit_extraInitializers);
        }
    };
})();
exports.ListStaffQueryDto = ListStaffQueryDto;
