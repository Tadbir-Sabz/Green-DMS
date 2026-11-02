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
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const database_module_1 = require("./database/database.module");
const health_module_1 = require("./health/health.module");
const identity_rbac_module_1 = require("./modules/identity-rbac/identity-rbac.module");
const master_data_module_1 = require("./modules/master-data/master-data.module");
const inventory_module_1 = require("./modules/inventory/inventory.module");
const rules_engine_module_1 = require("./modules/rules-engine/rules-engine.module");
const sales_module_1 = require("./modules/sales/sales.module");
const tours_module_1 = require("./modules/tours/tours.module");
const tracking_module_1 = require("./modules/tracking/tracking.module");
const finance_module_1 = require("./modules/finance/finance.module");
const integrations_module_1 = require("./modules/integrations/integrations.module");
/**
 * ریشه اپ API — چیدمان ماژول‌ها دقیقاً Core Modules سند §۳.۳:
 * Identity & RBAC / Master Data / Inventory / Rules Engine / Sales /
 * Tours & Visits / Tracking & Routing / Finance / Integrations
 */
let AppModule = (() => {
    let _classDecorators = [(0, common_1.Module)({
            imports: [
                database_module_1.DatabaseModule,
                health_module_1.HealthModule,
                identity_rbac_module_1.IdentityRbacModule,
                master_data_module_1.MasterDataModule,
                inventory_module_1.InventoryModule,
                rules_engine_module_1.RulesEngineModule,
                sales_module_1.SalesModule,
                tours_module_1.ToursModule,
                tracking_module_1.TrackingModule,
                finance_module_1.FinanceModule,
                integrations_module_1.IntegrationsModule,
                rules_engine_module_1.RulesEngineModule,
            ],
        })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var AppModule = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            AppModule = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
    };
    return AppModule = _classThis;
})();
exports.AppModule = AppModule;
