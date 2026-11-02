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
exports.PortalModule = exports.PortalController = void 0;
const common_1 = require("@nestjs/common");
let PortalController = (() => {
    let _classDecorators = [(0, common_1.Controller)('portal')];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _info_decorators;
    let _invoices_decorators;
    let _balance_decorators;
    let _createOrder_decorators;
    var PortalController = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _info_decorators = [(0, common_1.Get)()];
            _invoices_decorators = [(0, common_1.Get)('invoices')];
            _balance_decorators = [(0, common_1.Get)('balance')];
            _createOrder_decorators = [(0, common_1.Post)('orders')];
            __esDecorate(this, null, _info_decorators, { kind: "method", name: "info", static: false, private: false, access: { has: obj => "info" in obj, get: obj => obj.info }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _invoices_decorators, { kind: "method", name: "invoices", static: false, private: false, access: { has: obj => "invoices" in obj, get: obj => obj.invoices }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _balance_decorators, { kind: "method", name: "balance", static: false, private: false, access: { has: obj => "balance" in obj, get: obj => obj.balance }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _createOrder_decorators, { kind: "method", name: "createOrder", static: false, private: false, access: { has: obj => "createOrder" in obj, get: obj => obj.createOrder }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            PortalController = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        info() {
            return { module: 'portal', title: 'پورتال مشتری آنلاین', resources: ['invoices', 'orders', 'payments'], status: 'scaffold' };
        }
        invoices() { return []; }
        balance() { return { outstanding: 0 }; }
        createOrder() { return { status: 'submitted' }; }
        constructor() {
            __runInitializers(this, _instanceExtraInitializers);
        }
    };
    return PortalController = _classThis;
})();
exports.PortalController = PortalController;
const common_2 = require("@nestjs/common");
let PortalModule = (() => {
    let _classDecorators = [(0, common_2.Module)({ controllers: [PortalController] })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var PortalModule = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            PortalModule = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
    };
    return PortalModule = _classThis;
})();
exports.PortalModule = PortalModule;
