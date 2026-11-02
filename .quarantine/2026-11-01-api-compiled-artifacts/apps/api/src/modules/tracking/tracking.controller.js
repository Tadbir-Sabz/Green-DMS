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
exports.TrackingController = void 0;
const common_1 = require("@nestjs/common");
const auth_guard_1 = require("../identity-rbac/auth.guard");
const permissions_guard_1 = require("../identity-rbac/permissions.guard");
const require_permissions_decorator_1 = require("../identity-rbac/require-permissions.decorator");
const tracking_dto_1 = require("./tracking.dto");
/**
 * ماژول ۶ — رهگیری، نقشه و مسیریابی (PostGIS)
 * مسیرها: /tracking/sessions, /tracking/locations, /tracking/live, /tracking/geofences, /tracking/route-plans
 */
let TrackingController = (() => {
    let _classDecorators = [(0, common_1.UseGuards)(auth_guard_1.AuthGuard, permissions_guard_1.PermissionsGuard), (0, common_1.Controller)('tracking')];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _instanceExtraInitializers = [];
    let _info_decorators;
    let _startSession_decorators;
    let _stopSession_decorators;
    let _ingestLocations_decorators;
    let _getLive_decorators;
    let _listGeofences_decorators;
    let _createGeofence_decorators;
    let _listRoutePlans_decorators;
    let _createRoutePlan_decorators;
    let _getRoutePlan_decorators;
    let _addStops_decorators;
    var TrackingController = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            _info_decorators = [(0, common_1.Get)()];
            _startSession_decorators = [(0, common_1.Post)('sessions/start'), (0, require_permissions_decorator_1.RequirePermissions)('tracking.view')];
            _stopSession_decorators = [(0, common_1.Post)('sessions/:id/stop'), (0, require_permissions_decorator_1.RequirePermissions)('tracking.view')];
            _ingestLocations_decorators = [(0, common_1.Post)('locations/batch'), (0, require_permissions_decorator_1.RequirePermissions)('tracking.view')];
            _getLive_decorators = [(0, common_1.Get)('live'), (0, require_permissions_decorator_1.RequirePermissions)('tracking.view')];
            _listGeofences_decorators = [(0, common_1.Get)('geofences'), (0, require_permissions_decorator_1.RequirePermissions)('tracking.view')];
            _createGeofence_decorators = [(0, common_1.Post)('geofences'), (0, require_permissions_decorator_1.RequirePermissions)('tracking.admin')];
            _listRoutePlans_decorators = [(0, common_1.Get)('route-plans'), (0, require_permissions_decorator_1.RequirePermissions)('tracking.view')];
            _createRoutePlan_decorators = [(0, common_1.Post)('route-plans'), (0, require_permissions_decorator_1.RequirePermissions)('tracking.admin')];
            _getRoutePlan_decorators = [(0, common_1.Get)('route-plans/:id'), (0, require_permissions_decorator_1.RequirePermissions)('tracking.view')];
            _addStops_decorators = [(0, common_1.Post)('route-plans/:id/stops'), (0, require_permissions_decorator_1.RequirePermissions)('tracking.admin')];
            __esDecorate(this, null, _info_decorators, { kind: "method", name: "info", static: false, private: false, access: { has: obj => "info" in obj, get: obj => obj.info }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _startSession_decorators, { kind: "method", name: "startSession", static: false, private: false, access: { has: obj => "startSession" in obj, get: obj => obj.startSession }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _stopSession_decorators, { kind: "method", name: "stopSession", static: false, private: false, access: { has: obj => "stopSession" in obj, get: obj => obj.stopSession }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _ingestLocations_decorators, { kind: "method", name: "ingestLocations", static: false, private: false, access: { has: obj => "ingestLocations" in obj, get: obj => obj.ingestLocations }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getLive_decorators, { kind: "method", name: "getLive", static: false, private: false, access: { has: obj => "getLive" in obj, get: obj => obj.getLive }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _listGeofences_decorators, { kind: "method", name: "listGeofences", static: false, private: false, access: { has: obj => "listGeofences" in obj, get: obj => obj.listGeofences }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _createGeofence_decorators, { kind: "method", name: "createGeofence", static: false, private: false, access: { has: obj => "createGeofence" in obj, get: obj => obj.createGeofence }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _listRoutePlans_decorators, { kind: "method", name: "listRoutePlans", static: false, private: false, access: { has: obj => "listRoutePlans" in obj, get: obj => obj.listRoutePlans }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _createRoutePlan_decorators, { kind: "method", name: "createRoutePlan", static: false, private: false, access: { has: obj => "createRoutePlan" in obj, get: obj => obj.createRoutePlan }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getRoutePlan_decorators, { kind: "method", name: "getRoutePlan", static: false, private: false, access: { has: obj => "getRoutePlan" in obj, get: obj => obj.getRoutePlan }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _addStops_decorators, { kind: "method", name: "addStops", static: false, private: false, access: { has: obj => "addStops" in obj, get: obj => obj.addStops }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            TrackingController = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        service = __runInitializers(this, _instanceExtraInitializers);
        constructor(service) {
            this.service = service;
        }
        info() {
            return {
                module: 'tracking',
                title: 'رهگیری، نقشه و مسیریابی',
                resources: [
                    'sessions',
                    'locations',
                    'live-positions',
                    'customer-locations',
                    'route-plans',
                    'geofences',
                    'geofence-events',
                ],
                status: 'scaffold',
            };
        }
        // ---------------- Sessions ----------------
        startSession(companyId, userId, body) {
            return this.service.startSession(companyId, userId, body?.device_id);
        }
        stopSession(id) {
            return this.service.stopSession(id);
        }
        // ---------------- Locations ----------------
        ingestLocations(companyId, body, sessionId, deviceId) {
            const parsed = tracking_dto_1.BatchLocationSchema.parse(body);
            return this.service.ingestLocationSamples(companyId, parsed, sessionId, deviceId);
        }
        getLive(companyId, minutes) {
            const m = minutes ? Number(minutes) : 30;
            return this.service.getLive(companyId, m);
        }
        // ---------------- Geofences ----------------
        listGeofences(companyId) {
            return this.service.listGeofences(companyId);
        }
        createGeofence(companyId, body) {
            const parsed = tracking_dto_1.GeofenceSchema.parse(body);
            return this.service.createGeofence(companyId, parsed);
        }
        // ---------------- Route Plans ----------------
        listRoutePlans(companyId, date) {
            return this.service.listRoutePlans(companyId, date);
        }
        createRoutePlan(companyId, body) {
            const parsed = tracking_dto_1.RoutePlanSchema.parse(body);
            return this.service.createRoutePlan(companyId, parsed);
        }
        getRoutePlan(id) {
            return this.service.getRoutePlan(id);
        }
        addStops(id, body) {
            const parsed = tracking_dto_1.RoutePlanStopSchema.array().parse(body);
            return this.service.addStops(id, parsed);
        }
    };
    return TrackingController = _classThis;
})();
exports.TrackingController = TrackingController;
