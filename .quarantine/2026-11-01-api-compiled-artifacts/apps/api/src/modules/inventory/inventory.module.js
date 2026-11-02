"use strict";
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryModule = exports.InventoryController = void 0;
const common_1 = require("@nestjs/common");
const common_2 = require("@nestjs/common");
const identity_rbac_module_1 = require("../identity-rbac/identity-rbac.module");
const stock_controller_1 = require("./stock.controller");
const stock_repository_1 = require("./stock.repository");
const stock_service_1 = require("./stock.service");
const stocktake_controller_1 = require("./stocktake.controller");
const stocktake_repository_1 = require("./stocktake.repository");
const stocktake_service_1 = require("./stocktake.service");
const transfer_controller_1 = require("./transfer.controller");
const transfer_repository_1 = require("./transfer.repository");
const transfer_service_1 = require("./transfer.service");
const warehouse_controller_1 = require("./warehouse.controller");
const warehouse_repository_1 = require("./warehouse.repository");
const warehouse_service_1 = require("./warehouse.service");
const tokens_1 = require("./tokens");
/** ماژول ۲ — انبار و انبارگردانی */
let InventoryController = (() => {
    let _classDecorators = [(0, common_1.Controller)('inventory')];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _info_decorators;
    var InventoryController = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _info_decorators = [(0, common_1.Get)()];
            __esDecorate(this, null, _info_decorators, { kind: "method", name: "info", static: false, private: false, access: { has: obj => "info" in obj, get: obj => obj.info }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            InventoryController = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        info() {
            return {
                module: 'inventory',
                title: 'انبار و انبارگردانی',
                resources: [
                    'warehouses',
                    'stock-balances',
                    'stock-movements',
                    'stock-counts',
                    'stock-reservations',
                    'batches-expiry',
                    'vehicle-loads',
                    'transfers',
                ],
                status: 'scaffold',
            };
        }
        constructor() {
            __runInitializers(this, _instanceExtraInitializers);
        }
    };
    return InventoryController = _classThis;
})();
exports.InventoryController = InventoryController;
/**
 * ماژول ۲ — پیاده‌شده: انبارها، مانده موجودی، اصلاحیه، انبارگردانی (کامل) و انتقال.
 * IdentityRbacModule برای گاردهای AuthGuard/PermissionsGuard وارد می‌شود.
 */
let InventoryModule = (() => {
    let _classDecorators = [(0, common_2.Module)({
            imports: [identity_rbac_module_1.IdentityRbacModule],
            controllers: [
                InventoryController,
                warehouse_controller_1.WarehouseController,
                stock_controller_1.StockController,
                stocktake_controller_1.StocktakeController,
                transfer_controller_1.TransferController,
            ],
            providers: [
                warehouse_repository_1.WarehouseRepository,
                { provide: tokens_1.WAREHOUSE_REPOSITORY, useExisting: warehouse_repository_1.WarehouseRepository },
                warehouse_service_1.WarehouseService,
                { provide: tokens_1.WAREHOUSE_SERVICE, useExisting: warehouse_service_1.WarehouseService },
                stock_repository_1.StockRepository,
                { provide: tokens_1.STOCK_REPOSITORY, useExisting: stock_repository_1.StockRepository },
                stock_service_1.StockService,
                { provide: tokens_1.STOCK_SERVICE, useExisting: stock_service_1.StockService },
                stocktake_repository_1.StocktakeRepository,
                { provide: tokens_1.STOCKTAKE_REPOSITORY, useExisting: stocktake_repository_1.StocktakeRepository },
                stocktake_service_1.StocktakeService,
                { provide: tokens_1.STOCKTAKE_SERVICE, useExisting: stocktake_service_1.StocktakeService },
                transfer_repository_1.TransferRepository,
                { provide: tokens_1.TRANSFER_REPOSITORY, useExisting: transfer_repository_1.TransferRepository },
                transfer_service_1.TransferService,
                { provide: tokens_1.TRANSFER_SERVICE, useExisting: transfer_service_1.TransferService },
            ],
        })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var InventoryModule = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            InventoryModule = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
    };
    return InventoryModule = _classThis;
})();
exports.InventoryModule = InventoryModule;
