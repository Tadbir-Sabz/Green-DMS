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
exports.PricingService = void 0;
const common_1 = require("@nestjs/common");
const class_validator_1 = require("class-validator");
const badRequest = (code, message_fa) => new common_1.BadRequestException({ code, message_fa });
const notFound = (what) => new common_1.NotFoundException({ code: 'not_found', message_fa: `${what} یافت نشد` });
const toPromotionView = (row) => {
    const { valid_to, ...rest } = row;
    return valid_to != null ? { ...rest, valid_to } : { ...rest };
};
let PricingService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var PricingService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            PricingService = _classThis = _classDescriptor.value;
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
        // ---------------- لیست قیمت ----------------
        async listPriceLists(companyId, query) {
            const { items, nextCursor, hasMore } = await this.repo.listPriceLists(companyId, query);
            return { items, next_cursor: nextCursor, has_more: hasMore };
        }
        async getPriceList(companyId, id) {
            this.assertId(id, 'لیست قیمت');
            const row = await this.repo.findPriceList(companyId, id);
            if (!row)
                throw notFound('لیست قیمت');
            const items = await this.repo.findPriceListItems(id);
            return { ...row, items };
        }
        async createPriceList(companyId, dto) {
            await this.validateItems(companyId, dto.items);
            let id;
            try {
                id = await this.repo.insertPriceList(companyId, dto);
            }
            catch (err) {
                throw this.mapPriceListError(err);
            }
            return this.getPriceList(companyId, id);
        }
        async updatePriceList(companyId, id, dto) {
            this.assertId(id, 'لیست قیمت');
            await this.validateItems(companyId, dto.items);
            try {
                const updated = await this.repo.updatePriceList(companyId, id, dto);
                if (!updated)
                    throw notFound('لیست قیمت');
            }
            catch (err) {
                if (err instanceof common_1.NotFoundException)
                    throw err;
                throw this.mapPriceListError(err);
            }
            return this.getPriceList(companyId, id);
        }
        async validateItems(companyId, items) {
            for (const item of items ?? []) {
                if (!(await this.repo.productExists(companyId, item.product_id))) {
                    throw badRequest('product_not_found', 'کالای انتخاب‌شده در این شرکت یافت نشد.');
                }
            }
        }
        mapPriceListError(err) {
            const e = err;
            if (e?.code === '23505' && e.constraint === 'uq_price_list_code') {
                return new common_1.ConflictException({
                    code: 'duplicate_code',
                    message_fa: 'کد لیست قیمت برای این شرکت قبلاً ثبت شده است.',
                });
            }
            if (e?.code === '23P01') {
                // قید انحصاری ex_price_list_item (همپوشانی بازه برای یک کالا)
                return new common_1.ConflictException({
                    code: 'overlapping_item',
                    message_fa: 'برای این کالا قیمتی با بازهٔ همپوشان از قبل ثبت شده است.',
                });
            }
            if (e?.code === '23503') {
                return badRequest('reference_invalid', 'یکی از ارجاع‌های ارسال‌شده معتبر نیست.');
            }
            if (e?.code === '23514') {
                return badRequest('check_violation', 'مقدار ارسال‌شده برای یکی از فیلدها مجاز نیست.');
            }
            return badRequest('price_list_save_failed', 'خطای غیرمنتظره در ذخیره لیست قیمت.');
        }
        // ---------------- تشویق ----------------
        async listPromotions(companyId, query) {
            const { items, nextCursor, hasMore } = await this.repo.listPromotions(companyId, query);
            return { items: items.map(toPromotionView), next_cursor: nextCursor, has_more: hasMore };
        }
        async getPromotion(companyId, id) {
            this.assertId(id, 'تشویق');
            const row = await this.repo.findPromotion(companyId, id);
            if (!row)
                throw notFound('تشویق');
            return toPromotionView(row);
        }
        async createPromotion(companyId, dto) {
            let id;
            try {
                id = await this.repo.insertPromotion(companyId, dto);
            }
            catch (err) {
                throw this.mapPromotionError(err);
            }
            return this.getPromotion(companyId, id);
        }
        async updatePromotion(companyId, id, dto) {
            this.assertId(id, 'تشویق');
            try {
                const updated = await this.repo.updatePromotion(companyId, id, dto);
                if (!updated)
                    throw notFound('تشویق');
            }
            catch (err) {
                if (err instanceof common_1.NotFoundException)
                    throw err;
                throw this.mapPromotionError(err);
            }
            return this.getPromotion(companyId, id);
        }
        mapPromotionError(err) {
            const e = err;
            if (e?.code === '23505' && e.constraint === 'uq_promotion_code') {
                return new common_1.ConflictException({
                    code: 'duplicate_code',
                    message_fa: 'کد تشویق برای این شرکت قبلاً ثبت شده است.',
                });
            }
            if (e?.code === '23514') {
                return badRequest('check_violation', 'مقدار ارسال‌شده برای یکی از فیلدها مجاز نیست.');
            }
            if (e?.code === '23502') {
                return badRequest('missing_field', 'یکی از فیلدهای الزامی وارد نشده است.');
            }
            return badRequest('promotion_save_failed', 'خطای غیرمنتظره در ذخیره تشویق.');
        }
    };
    return PricingService = _classThis;
})();
exports.PricingService = PricingService;
