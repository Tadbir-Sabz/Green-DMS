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
exports.MasterDataModule = void 0;
const common_1 = require("@nestjs/common");
const identity_rbac_module_1 = require("../identity-rbac/identity-rbac.module");
const master_data_controller_1 = require("./master-data.controller");
const person_controller_1 = require("./person.controller");
const person_repository_1 = require("./person.repository");
const person_service_1 = require("./person.service");
const product_controller_1 = require("./product.controller");
const product_repository_1 = require("./product.repository");
const product_service_1 = require("./product.service");
const reference_controller_1 = require("./reference.controller");
const price_list_controller_1 = require("./price-list.controller");
const promotion_controller_1 = require("./promotion.controller");
const pricing_repository_1 = require("./pricing.repository");
const pricing_service_1 = require("./pricing.service");
const reference_repository_1 = require("./reference.repository");
const staff_controller_1 = require("./staff.controller");
const staff_repository_1 = require("./staff.repository");
const staff_service_1 = require("./staff.service");
const tokens_1 = require("./tokens");
/**
 * ماژول ۱ — اطلاعات پایه. پیاده‌شده: CRUD کالا (/products)، CRUD اشخاص
 * (/persons — پایه مشتری/پرسنل)، CRUD پرسنل (/staff — سمت، سرپرست، حوزه کار)
 * و داده‌های مرجع فرم کالا (/product-categories، /units).
 * IdentityRbacModule برای گاردهای AuthGuard/PermissionsGuard وارد می‌شود
 * (گاردهای کنترلر در همین ماژول نمونه‌سازی می‌شوند و به providerهای آن نیاز دارند).
 */
let MasterDataModule = (() => {
    let _classDecorators = [(0, common_1.Module)({
            imports: [identity_rbac_module_1.IdentityRbacModule],
            controllers: [
                master_data_controller_1.MasterDataController,
                product_controller_1.ProductController,
                person_controller_1.PersonController,
                staff_controller_1.StaffController,
                reference_controller_1.ReferenceController,
                price_list_controller_1.PriceListController,
                promotion_controller_1.PromotionController,
            ],
            providers: [
                product_repository_1.ProductRepository,
                { provide: tokens_1.PRODUCT_REPOSITORY, useExisting: product_repository_1.ProductRepository },
                product_service_1.ProductService,
                { provide: tokens_1.PRODUCT_SERVICE, useExisting: product_service_1.ProductService },
                person_repository_1.PersonRepository,
                { provide: tokens_1.PERSON_REPOSITORY, useExisting: person_repository_1.PersonRepository },
                person_service_1.PersonService,
                { provide: tokens_1.PERSON_SERVICE, useExisting: person_service_1.PersonService },
                staff_repository_1.StaffRepository,
                { provide: tokens_1.STAFF_REPOSITORY, useExisting: staff_repository_1.StaffRepository },
                staff_service_1.StaffService,
                { provide: tokens_1.STAFF_SERVICE, useExisting: staff_service_1.StaffService },
                reference_repository_1.ReferenceRepository,
                { provide: tokens_1.REFERENCE_REPOSITORY, useExisting: reference_repository_1.ReferenceRepository },
                pricing_repository_1.PricingRepository,
                { provide: tokens_1.PRICING_REPOSITORY, useExisting: pricing_repository_1.PricingRepository },
                pricing_service_1.PricingService,
                { provide: tokens_1.PRICING_SERVICE, useExisting: pricing_service_1.PricingService },
            ],
            exports: [tokens_1.PRODUCT_SERVICE],
        })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var MasterDataModule = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            MasterDataModule = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
    };
    return MasterDataModule = _classThis;
})();
exports.MasterDataModule = MasterDataModule;
