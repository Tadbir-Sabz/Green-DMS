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
exports.TrackingRepository = void 0;
const common_1 = require("@nestjs/common");
let TrackingRepository = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var TrackingRepository = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            TrackingRepository = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        pool;
        constructor(pool) {
            this.pool = pool;
        }
        async createSession(branchId, userId, deviceId) {
            // Try to find staff by userId or just create minimal session
            let staffId = userId;
            if (userId) {
                const s = await this.pool.query('select id from staff where id =  limit 1', [userId]);
                if (s.rows[0])
                    staffId = s.rows[0].id;
                else {
                    const s2 = await this.pool.query('select id from staff limit 1');
                    if (s2.rows[0])
                        staffId = s2.rows[0].id;
                }
            }
            else {
                const s2 = await this.pool.query('select id from staff limit 1');
                if (s2.rows[0])
                    staffId = s2.rows[0].id;
            }
            if (!staffId)
                throw new Error('no_staff_found');
            const res = await this.pool.query("insert into field_session (staff_id, device_id, kind, started_at, status) values (,,'sales',now(),'open') returning *", [staffId, deviceId ?? null]);
            return res.rows[0];
        }
        async endSession(sessionId) {
            const res = await this.pool.query("update field_session set ended_at = now(), status = 'closed' where id =  returning *", [sessionId]);
            return res.rows[0];
        }
        async insertLocationSamples(branchId, samples, sessionId, deviceId) {
            const client = await this.pool.connect();
            try {
                await client.query('begin');
                // resolve staff
                let staffId = null;
                if (sessionId) {
                    const sr = await client.query('select staff_id from field_session where id = ', [sessionId]);
                    if (sr.rows[0])
                        staffId = sr.rows[0].staff_id;
                }
                if (!staffId) {
                    const s2 = await client.query('select id from staff limit 1');
                    if (s2.rows[0])
                        staffId = s2.rows[0].id;
                }
                if (!staffId)
                    throw new Error('no_staff_found');
                const inserted = [];
                for (const s of samples) {
                    const capturedAt = s.captured_at ? new Date(s.captured_at) : new Date();
                    const res = await client.query("insert into location_sample (staff_id, session_id, tour_id, geo, accuracy_m, speed_mps, heading_deg, battery_pct, is_mocked, provider, recorded_at) values (,,, ST_SetSRID(ST_MakePoint(,), 4326)::geography, ,,,,false,'gps',) returning id, staff_id, session_id, tour_id, accuracy_m, speed_mps, heading_deg, battery_pct, recorded_at, is_mocked, provider, ST_AsGeoJSON(geo)::json as geo", [staffId, sessionId ?? null, null, s.lng, s.lat, s.accuracy_m ?? null, s.speed_kmh ? s.speed_kmh / 3.6 : null, s.heading ?? null, s.battery_pct ?? null, capturedAt]);
                    inserted.push(res.rows[0]);
                }
                await client.query('commit');
                return inserted;
            }
            catch (e) {
                await client.query('rollback');
                throw e;
            }
            finally {
                client.release();
            }
        }
        async getLivePositions(branchId, minutes = 30) {
            const params = [minutes];
            const res = await this.pool.query("select distinct on (ls.session_id) ls.id, ls.staff_id, ls.session_id, ls.tour_id, ls.accuracy_m, ls.speed_mps, ls.heading_deg, ls.recorded_at, ST_AsGeoJSON(ls.geo)::json as geo, fs.status as session_status, s.full_name as staff_name from location_sample ls left join field_session fs on fs.id = ls.session_id left join staff s on s.id = ls.staff_id where ls.recorded_at > now() - ( || ' minutes')::interval order by ls.session_id, ls.recorded_at desc", params);
            return res.rows;
        }
        async listGeofences(branchId) {
            const params = [];
            let where = 'where gf.is_active = true';
            if (branchId) {
                params.push(branchId);
                where += ' and gf.branch_id = ';
            }
            const res = await this.pool.query('select id, branch_id, name, kind, customer_id, warehouse_id, is_active, ST_AsGeoJSON(area)::json as geom from geofence gf ' + where + ' order by gf.name', params);
            return res.rows;
        }
        async createGeofence(dto) {
            const res = await this.pool.query("insert into geofence (branch_id, name, kind, area, customer_id, warehouse_id, is_active, created_at) values (,,, ST_SetSRID(ST_Multi(ST_GeomFromGeoJSON(::text)), 4326), ,, coalesce(,true), now()) returning id, branch_id, name, kind, customer_id, warehouse_id, is_active, ST_AsGeoJSON(area)::json as geom", [dto.branch_id ?? null, dto.title || dto.code, dto.kind === 'restricted' ? 'restricted' : (dto.kind === 'customer' ? 'customer' : 'work_area'), JSON.stringify(dto.geom_geojson), null, null, dto.is_active ?? true]);
            return res.rows[0];
        }
        async createRoutePlan(dto) {
            let staffId = null;
            const s2 = await this.pool.query('select id from staff limit 1');
            if (s2.rows[0])
                staffId = s2.rows[0].id;
            if (!staffId)
                throw new Error('no_staff_found');
            const res = await this.pool.query("insert into route_plan (tour_id, staff_id, plan_date, provider, objective, request_params, created_at) values (,,,'manual','distance','{}'::jsonb, now()) returning *", [dto.tour_id ?? null, staffId, dto.planned_date]);
            return res.rows[0];
        }
        async addRoutePlanStops(routePlanId, stops) {
            const client = await this.pool.connect();
            try {
                await client.query('begin');
                const inserted = [];
                let seq = 1;
                for (const s of stops) {
                    const res = await client.query('insert into route_plan_stop (route_plan_id, seq, customer_id) values (,,) returning *', [routePlanId, s.seq ?? seq++, s.customer_id]);
                    inserted.push(res.rows[0]);
                }
                await client.query('commit');
                return inserted;
            }
            catch (e) {
                await client.query('rollback');
                throw e;
            }
            finally {
                client.release();
            }
        }
        async getRoutePlan(routePlanId) {
            const planRes = await this.pool.query('select * from route_plan where id = ', [routePlanId]);
            const stopsRes = await this.pool.query('select rps.*, c.code as customer_code, ST_AsGeoJSON(c.geo)::json as geo from route_plan_stop rps left join customer c on c.id = rps.customer_id where rps.route_plan_id =  order by rps.seq', [routePlanId]);
            return { ...(planRes.rows[0] || {}), stops: stopsRes.rows };
        }
        async listRoutePlans(branchId, plannedDate) {
            const params = [];
            let where = 'where 1=1';
            if (plannedDate) {
                params.push(plannedDate);
                where += ' and rp.plan_date = $' + params.length;
            }
            const res = await this.pool.query('select * from route_plan rp ' + where + ' order by rp.plan_date desc', params);
            return res.rows;
        }
    };
    return TrackingRepository = _classThis;
})();
exports.TrackingRepository = TrackingRepository;
