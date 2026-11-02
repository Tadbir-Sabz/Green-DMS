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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueueModule = exports.REPORT_QUEUE = exports.SMS_QUEUE = exports.INVOICE_QUEUE = exports.QUEUE_CONNECTION = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
exports.QUEUE_CONNECTION = 'QUEUE_CONNECTION';
exports.INVOICE_QUEUE = 'INVOICE_QUEUE';
exports.SMS_QUEUE = 'SMS_QUEUE';
exports.REPORT_QUEUE = 'REPORT_QUEUE';
let QueueModule = (() => {
    let _classDecorators = [(0, common_1.Global)(), (0, common_1.Module)({
            providers: [
                {
                    provide: exports.QUEUE_CONNECTION,
                    useFactory: () => new ioredis_1.default({ host: process.env.REDIS_HOST || 'localhost', port: Number(process.env.REDIS_PORT || 6379), maxRetriesPerRequest: null }),
                },
                {
                    provide: exports.INVOICE_QUEUE,
                    useFactory: (conn) => new bullmq_1.Queue('invoice-jobs', { connection: conn }),
                    inject: [exports.QUEUE_CONNECTION],
                },
                {
                    provide: exports.SMS_QUEUE,
                    useFactory: (conn) => new bullmq_1.Queue('sms-jobs', { connection: conn }),
                    inject: [exports.QUEUE_CONNECTION],
                },
                {
                    provide: exports.REPORT_QUEUE,
                    useFactory: (conn) => new bullmq_1.Queue('report-jobs', { connection: conn }),
                    inject: [exports.QUEUE_CONNECTION],
                },
            ],
            exports: [exports.INVOICE_QUEUE, exports.SMS_QUEUE, exports.REPORT_QUEUE],
        })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var QueueModule = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            QueueModule = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
    };
    return QueueModule = _classThis;
})();
exports.QueueModule = QueueModule;
