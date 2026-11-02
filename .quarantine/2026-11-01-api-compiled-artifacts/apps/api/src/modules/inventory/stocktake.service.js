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
exports.StocktakeService = void 0;
const common_1 = require("@nestjs/common");
const class_validator_1 = require("class-validator");
const badRequest = (code, message_fa) => new common_1.BadRequestException({ code, message_fa });
const mapLine = (l) => ({
    product_id: l.product_id,
    batch_id: l.batch_id,
    system_qty: l.qty_system,
    counted_qty: l.qty_counted,
    variance_qty: l.variance,
});
let StocktakeService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var StocktakeService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            StocktakeService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        repo;
        constructor(repo) {
            this.repo = repo;
        }
        assertId(id) {
            if (!(0, class_validator_1.isUUID)(id, '4'))
                throw badRequest('invalid_id', 'شناسه ارسال‌شده معتبر نیست.');
        }
        async list(companyId, query) {
            const { items, nextCursor, hasMore } = await this.repo.list(companyId, query);
            return {
                items: items.map((r) => ({ id: r.id, branch_id: r.branch_id, warehouse_id: r.warehouse_id, status: r.status })),
                next_cursor: nextCursor,
                has_more: hasMore,
            };
        }
        async get(companyId, id) {
            this.assertId(id);
            const row = await this.repo.findById(companyId, id);
            if (!row)
                throw new common_1.NotFoundException({ code: 'not_found', message_fa: 'سند انبارگردانی یافت نشد' });
            const lines = await this.repo.findLines(id);
            return {
                id: row.id,
                branch_id: row.branch_id,
                warehouse_id: row.warehouse_id,
                status: row.status,
                lines: lines.map(mapLine),
            };
        }
        async create(companyId, dto) {
            const branchId = await this.repo.resolveWarehouseBranch(companyId, dto.warehouse_id);
            if (!branchId)
                throw badRequest('warehouse_not_found', 'انبار انتخاب‌شده در این شرکت یافت نشد.');
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
            const row = await this.repo.findById(companyId, id);
            if (!row)
                throw new common_1.NotFoundException({ code: 'not_found', message_fa: 'سند انبارگردانی یافت نشد' });
            if (row.status === 'posted' || row.status === 'voided') {
                throw new common_1.ConflictException({
                    code: 'already_final',
                    message_fa: 'سند نهایی‌شده قابل ویرایش نیست.',
                });
            }
            try {
                if (dto.status)
                    await this.repo.updateStatus(id, dto.status);
                if (dto.lines?.length)
                    await this.repo.upsertLines(id, row.warehouse_id, dto.lines);
            }
            catch (err) {
                throw this.mapDbError(err);
            }
            return this.get(companyId, id);
        }
        async submit(companyId, id, approverId) {
            this.assertId(id);
            try {
                await this.repo.submit(companyId, id, approverId);
            }
            catch (err) {
                const e = err;
                if (e?.pgCode === 'no_data') {
                    throw badRequest('not_found', 'سند انبارگردانی یافت نشد.');
                }
                if (e?.pgCode === 'bad_state') {
                    throw new common_1.ConflictException({
                        code: 'already_final',
                        message_fa: 'این سند قبلاً نهایی شده است.',
                    });
                }
                if (e?.pgCode === 'no_lines') {
                    throw badRequest('no_counted_lines', 'هیچ قلمی شمارش نشده است؛ ابتدا شمارش اقلام را ثبت کنید.');
                }
                if (e?.code === '23514' && !e.constraint) {
                    // ردِ موجودی منفیِ fn_apply_stock_txn
                    throw new common_1.ConflictException({
                        code: 'negative_stock_forbidden',
                        message_fa: e.message ?? 'اعمال مغایرت به موجودی منفی می‌انجامد.',
                    });
                }
                throw this.mapDbError(err);
            }
            return this.get(companyId, id);
        }
        mapDbError(err) {
            const e = err;
            if (e?.code === '23505') {
                return new common_1.ConflictException({
                    code: 'duplicate_line',
                    message_fa: 'این کالا قبلاً در سند شمارش شده است.',
                    details: { constraint: e.constraint },
                });
            }
            if (e?.code === '23514') {
                return badRequest('check_violation', 'مقدار ارسال‌شده برای یکی از فیلدها مجاز نیست.');
            }
            if (e?.code === '23503') {
                return badRequest('reference_invalid', 'یکی از ارجاع‌های ارسال‌شده معتبر نیست.');
            }
            return badRequest('stocktake_save_failed', 'خطای غیرمنتظره در ذخیره سند انبارگردانی.');
        }
    };
    return StocktakeService = _classThis;
})();
exports.StocktakeService = StocktakeService;
