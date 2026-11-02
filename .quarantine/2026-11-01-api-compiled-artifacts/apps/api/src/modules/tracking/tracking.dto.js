"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoutePlanStopSchema = exports.RoutePlanSchema = exports.GeofenceSchema = exports.BatchLocationSchema = exports.LocationSampleSchema = void 0;
const zod_1 = require("zod");
exports.LocationSampleSchema = zod_1.z.object({
    device_id: zod_1.z.string().uuid().optional(),
    session_id: zod_1.z.string().uuid().optional(),
    lat: zod_1.z.coerce.number().min(-90).max(90),
    lng: zod_1.z.coerce.number().min(-180).max(180),
    accuracy_m: zod_1.z.coerce.number().min(0).max(10000).optional(),
    speed_kmh: zod_1.z.coerce.number().min(0).optional(),
    heading: zod_1.z.coerce.number().min(0).max(360).optional(),
    altitude_m: zod_1.z.coerce.number().optional(),
    battery_pct: zod_1.z.coerce.number().min(0).max(100).optional(),
    captured_at: zod_1.z.string().datetime().optional(),
    is_offline_capture: zod_1.z.boolean().optional(),
});
exports.BatchLocationSchema = zod_1.z.object({
    samples: zod_1.z.array(exports.LocationSampleSchema).min(1).max(500),
});
exports.GeofenceSchema = zod_1.z.object({
    branch_id: zod_1.z.string().uuid().optional(),
    code: zod_1.z.string().min(1).max(50),
    title: zod_1.z.string().min(1).max(150),
    kind: zod_1.z.enum(['area', 'branch', 'customer', 'route', 'restricted']).optional(),
    geom_geojson: zod_1.z.any(), // GeoJSON polygon/point
    is_active: zod_1.z.boolean().optional(),
});
exports.RoutePlanSchema = zod_1.z.object({
    branch_id: zod_1.z.string().uuid().optional(),
    route_id: zod_1.z.string().uuid().optional(),
    tour_id: zod_1.z.string().uuid().optional(),
    planned_date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: zod_1.z.enum(['draft', 'planned', 'optimized', 'published', 'cancelled']).optional(),
});
exports.RoutePlanStopSchema = zod_1.z.object({
    customer_id: zod_1.z.string().uuid(),
    seq: zod_1.z.coerce.number().int().min(1),
    planned_at: zod_1.z.string().datetime().optional(),
    note: zod_1.z.string().optional(),
});
