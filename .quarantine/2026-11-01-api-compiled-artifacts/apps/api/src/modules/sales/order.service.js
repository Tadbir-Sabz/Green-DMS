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
exports.OrderService = void 0;
const common_1 = require("@nestjs/common");
const class_validator_1 = require("class-validator");
const badRequest = (code, message_fa) => new common_1.BadRequestException({ code, message_fa });
const notFound = () => new common_1.NotFoundException({ code: 'not_found', message_fa: 'سفارش یافت نشد' });
const persianYear = () => {
    const parts = new Intl.DateTimeFormat('en-u-ca-persian', {
        year: 'numeric',
        timeZone: 'Asia/Tehran',
    }).formatToParts(new Date());
    return Number(parts.find((p) => p.type === 'year')?.value);
};
const money = (n) => (Math.round(n * 100) / 100).toFixed(2);
let OrderService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var OrderService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            OrderService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        repo;
        rules;
        constructor(repo, rules) {
            this.repo = repo;
            this.rules = rules;
        }
        assertId(id) {
            if (!(0, class_validator_1.isUUID)(id, '4'))
                throw badRequest('invalid_id', 'شناسه سفارش ارسال‌شده معتبر نیست.');
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
            const lines = await this.repo.findLines(id);
            return { ...row, lines };
        }
        async create(companyId, dto) {
            const pricing = await this.repo.getCustomerPricing(companyId, dto.customer_id);
            if (!pricing)
                throw badRequest('customer_not_found', 'مشتری انتخاب‌شده در این شرکت یافت نشد.');
            await this.validateReferences(companyId, dto);
            await this.evaluateOrderRules(companyId, dto);
            const { lines, totals } = await this.computeLines(companyId, dto, pricing.price_list_id);
            let id;
            try {
                id = await this.repo.insert(companyId, dto, {
                    branchId: pricing.branch_id,
                    fiscalYear: persianYear(),
                    totals,
                    lines,
                });
            }
            catch (err) {
                throw this.mapOrderError(err);
            }
            return this.get(companyId, id);
        }
        async evaluateOrderRules(companyId, dto) {
            const rules = await this.rules.listRules(companyId);
            const applicable = rules.filter((r) => r.entity === 'sales_order' && r.event === 'before_save' && r.status === 'active');
            for (const rule of applicable) {
                if (rule.effect === 'block') {
                    throw badRequest('rule_blocked', rule.message_fa);
                }
                if (rule.effect === 'require_approval') {
                    throw new common_1.ConflictException({
                        code: 'require_approval',
                        message_fa: rule.message_fa,
                    });
                }
            }
        }
        async update(companyId, id, dto) {
            this.assertId(id);
            const existing = await this.repo.findById(companyId, id);
            if (!existing)
                throw notFound();
            if (existing.status !== 'draft') {
                throw new common_1.ConflictException({
                    code: 'not_editable',
                    message_fa: 'سفارش پس از خروج از وضعیت پیش‌نویس قابل ویرایش نیست.',
                });
            }
            const customerId = dto.customer_id ?? existing.customer_id;
            const pricing = await this.repo.getCustomerPricing(companyId, customerId);
            if (!pricing)
                throw badRequest('customer_not_found', 'مشتری انتخاب‌شده در این شرکت یافت نشد.');
            await this.validateReferences(companyId, dto);
            let lines = [];
            let totals;
            if (dto.lines) {
                const computed = await this.computeLines(companyId, { ...dto, customer_id: customerId }, dto.price_list_id ?? pricing.price_list_id);
                lines = computed.lines;
                totals = computed.totals;
            }
            else {
                totals = {
                    subtotal: existing.subtotal,
                    discount_total: existing.discount_total,
                    tax_total: existing.tax_total,
                    grand_total: existing.grand_total,
                };
            }
            try {
                const updated = await this.repo.update(companyId, id, dto, { totals, lines });
                if (!updated) {
                    throw new common_1.ConflictException({
                        code: 'not_editable',
                        message_fa: 'سفارش پس از خروج از وضعیت پیش‌نویس قابل ویرایش نیست.',
                    });
                }
            }
            catch (err) {
                if (err instanceof common_1.ConflictException)
                    throw err;
                throw this.mapOrderError(err);
            }
            return this.get(companyId, id);
        }
        async approve(companyId, id) {
            this.assertId(id);
            const existing = await this.repo.findById(companyId, id);
            if (!existing)
                throw notFound();
            const approved = await this.repo.approve(companyId, id);
            if (!approved) {
                throw new common_1.ConflictException({
                    code: 'not_approvable',
                    message_fa: 'فقط سفارش پیش‌نویس یا در انتظار تأیید قابل تأیید است.',
                });
            }
            return this.get(companyId, id);
        }
        async validateReferences(companyId, dto) {
            if (dto.request_id && !(await this.repo.requestExists(companyId, dto.request_id))) {
                throw badRequest('request_not_found', 'درخواست انتخاب‌شده یافت نشد.');
            }
            if (dto.salesperson_id && !(await this.repo.staffExists(companyId, dto.salesperson_id))) {
                throw badRequest('salesperson_not_found', 'فروشندهٔ انتخاب‌شده یافت نشد.');
            }
            if (dto.price_list_id && !(await this.repo.priceListExists(companyId, dto.price_list_id))) {
                throw badRequest('price_list_not_found', 'لیست قیمت انتخاب‌شده یافت نشد.');
            }
            if (dto.settlement_term_id && !(await this.repo.settlementTermExists(companyId, dto.settlement_term_id))) {
                throw badRequest('settlement_term_not_found', 'شرایط تسویهٔ انتخاب‌شده یافت نشد.');
            }
        }
        async computeLines(companyId, dto, priceListFallback) {
            const lines = [];
            let subtotal = 0;
            let discountTotal = 0;
            let lineNo = 1;
            for (const line of dto.lines ?? []) {
                if (!(await this.repo.productExists(companyId, line.product_id))) {
                    throw badRequest('product_not_found', 'یکی از کالاهای انتخاب‌شده در این شرکت یافت نشد.');
                }
                let qtyBase = line.qty;
                if (line.packaging_id) {
                    const factor = await this.repo.packagingFactor(line.product_id, line.packaging_id);
                    if (factor == null) {
                        throw badRequest('packaging_not_found', 'بسته‌بندی انتخاب‌شده برای این کالا یافت نشد.');
                    }
                    qtyBase = line.qty * Number(factor);
                }
                let unitPrice;
                if (line.unit_price != null) {
                    unitPrice = line.unit_price;
                }
                else {
                    const priceListId = dto.price_list_id ?? priceListFallback;
                    const priced = priceListId
                        ? await this.repo.priceListPrice(priceListId, line.product_id)
                        : null;
                    if (priced == null) {
                        if (priceListId) {
                            throw badRequest('price_missing', 'برای این کالا قیمت فعالی در لیست قیمت یافت نشد.');
                        }
                        unitPrice = '0';
                    }
                    else {
                        unitPrice = priced;
                    }
                }
                const discount = line.discount_amount ?? '0';
                if (Number(discount) < 0) {
                    throw badRequest('invalid_discount', 'مبلغ تخفیف نمی‌تواند منفی باشد.');
                }
                subtotal += line.qty * Number(unitPrice);
                discountTotal += Number(discount);
                lines.push({
                    line_no: lineNo,
                    product_id: line.product_id,
                    packaging_id: line.packaging_id ?? null,
                    qty: line.qty,
                    qty_base: qtyBase,
                    unit_price: unitPrice,
                    discount_amount: discount,
                });
                lineNo += 1;
            }
            const tax = 0;
            const totals = {
                subtotal: money(subtotal),
                discount_total: money(discountTotal),
                tax_total: money(tax),
                grand_total: money(subtotal - discountTotal + tax),
            };
            return { lines, totals };
        }
        mapOrderError(err) {
            const e = err;
            if (e?.code === '23505' && e.constraint === 'uq_sales_order_client') {
                return new common_1.ConflictException({
                    code: 'duplicate_client',
                    message_fa: 'سفارشی با این کلید همگام‌سازی قبلاً ثبت شده است.',
                });
            }
            if (e?.code === '23505' && e.constraint === 'uq_sales_order_doc') {
                return new common_1.ConflictException({
                    code: 'duplicate_doc',
                    message_fa: 'سند با این شماره در شعبه و سال مالی قبلاً ثبت شده است.',
                });
            }
            if (e?.code === '23503') {
                return badRequest('reference_invalid', 'یکی از ارجاع‌های ارسال‌شده معتبر نیست.');
            }
            if (e?.code === '23514') {
                return badRequest('check_violation', 'مقدار ارسال‌شده برای یکی از فیلدها مجاز نیست.');
            }
            return badRequest('order_save_failed', 'خطای غیرمنتظره در ذخیره سفارش.');
        }
    };
    return OrderService = _classThis;
})();
exports.OrderService = OrderService;
