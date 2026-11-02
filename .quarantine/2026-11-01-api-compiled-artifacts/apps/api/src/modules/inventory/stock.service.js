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
exports.StockService = void 0;
const common_1 = require("@nestjs/common");
const badRequest = (code, message_fa) => new common_1.BadRequestException({ code, message_fa });
let StockService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var StockService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            StockService = _classThis = _classDescriptor.value;
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
        async createAdjustment(companyId, dto) {
            if (dto.qty_delta === 0) {
                throw badRequest('invalid_qty_delta', 'مقدار اصلاحیه نمی‌تواند صفر باشد.');
            }
            let id;
            try {
                ({ id } = await this.repo.createAdjustment(companyId, dto));
            }
            catch (err) {
                throw this.mapDbError(err);
            }
            const view = await this.repo.findAdjustment(companyId, id);
            if (!view)
                throw new common_1.NotFoundException({ code: 'not_found', message_fa: 'اصلاحیه یافت نشد' });
            return view;
        }
        /**
         * خطای دیتابیس ← کد قرارداد.
         * انبار ناموجود → 400 (404 در قرارداد POST /stock/adjustments نیست).
         * ردِ موجودی منفیِ fn_apply_stock_txn (SQLSTATE 23514 بدون constraint) → 422 RuleRejected.
         */
        mapDbError(err) {
            const e = err;
            if (e?.pgCode === 'no_data') {
                return badRequest('warehouse_not_found', 'انبار انتخاب‌شده در این شرکت یافت نشد.');
            }
            if (e?.code === '23514' && !e.constraint) {
                // raise از fn_apply_stock_txn با errcode=check_violation (بدون constraint جدول)
                return new common_1.UnprocessableEntityException({
                    code: 'negative_stock_forbidden',
                    message_fa: e.message ?? 'انبار مقصد اجازه موجودی منفی ندارد.',
                });
            }
            if (e?.code === '23514') {
                return badRequest('check_violation', 'مقدار ارسال‌شده برای یکی از فیلدها مجاز نیست.');
            }
            if (e?.code === '23503') {
                return badRequest('reference_invalid', 'یکی از ارجاع‌های ارسال‌شده معتبر نیست.');
            }
            if (e?.code === '23502') {
                return badRequest('missing_field', 'یکی از فیلدهای الزامی وارد نشده است.');
            }
            return badRequest('adjustment_save_failed', 'خطای غیرمنتظره در ثبت اصلاحیه.');
        }
    };
    return StockService = _classThis;
})();
exports.StockService = StockService;
