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
exports.WarehouseRepository = void 0;
const common_1 = require("@nestjs/common");
/**
 * ستون‌های پاسخ — دقیقاً مطابق اسکیمای Warehouse در openapi.yaml.
 * همه فیلدها مطابق DDL (مهاجرت 0008) برمی‌گردند.
 */
const COLUMNS = `
  w.id, w.branch_id, w.code, w.name, w.kind, w.parent_warehouse_id,
  w.vehicle_id, w.area_id, w.allow_negative, w.is_active`;
const FROM = `from warehouse w
  join branch b on b.id = w.branch_id`;
/** کرسر ترکیبی code|id چون کد انبار در شعبه یکتا است نه در کل شرکت */
const encodeCursor = (code, id) => Buffer.from(`${code}|${id}`, 'utf8').toString('base64url');
const decodeCursor = (cursor) => {
    const [code, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    return [code, id];
};
/**
 * دسترسی داده انبار — SQL خام روی warehouse (بدون ORM، طبق §۳.۲).
 * همه کوئری‌ها از طریق branch.company_id به شرکت نشست قفل می‌شوند؛ حذف نرم ندارد
 * (ستون deleted_at تعریف نشده) و به‌روزرسانی‌ها را trg_touch (مهاجرت 0020) بالا می‌برد.
 */
let WarehouseRepository = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var WarehouseRepository = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            WarehouseRepository = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        pool;
        constructor(pool) {
            this.pool = pool;
        }
        async list(companyId, query) {
            const limit = query.limit ?? 50;
            const params = [companyId];
            const where = ['b.company_id = $1'];
            if (query.kind) {
                params.push(query.kind);
                where.push(`w.kind = $${params.length}`);
            }
            if (query.branch_id) {
                params.push(query.branch_id);
                where.push(`w.branch_id = $${params.length}`);
            }
            if (query.cursor) {
                const [code, id] = decodeCursor(query.cursor);
                params.push(code, id);
                where.push(`(w.code, w.id) > ($${params.length - 1}, $${params.length})`);
            }
            params.push(limit + 1);
            const { rows } = await this.pool.query(`select ${COLUMNS}
         ${FROM}
        where ${where.join(' and ')}
        order by w.code, w.id
        limit $${params.length}`, params);
            const hasMore = rows.length > limit;
            const page = hasMore ? rows.slice(0, limit) : rows;
            const last = page[page.length - 1];
            return {
                items: page,
                hasMore,
                nextCursor: hasMore && last ? encodeCursor(last.code, last.id) : null,
            };
        }
        async findById(companyId, id) {
            const { rows } = await this.pool.query(`select ${COLUMNS} ${FROM} where w.id = $1 and b.company_id = $2`, [id, companyId]);
            return rows[0] ?? null;
        }
        // ---------------- بررسی‌های ارجاعی (پیام فارسی به‌جای خطای قید) ----------------
        /** شعبه پیش‌فرض شرکت وقتی client شعبه نفرستد */
        async defaultBranchId(companyId) {
            const { rows } = await this.pool.query('select id from branch where company_id = $1 and is_active order by code limit 1', [companyId]);
            return rows[0]?.id ?? null;
        }
        async branchExists(companyId, branchId) {
            return this.exists('select 1 from branch where id = $1 and company_id = $2', branchId, companyId);
        }
        async areaExists(companyId, areaId) {
            return this.exists(`select 1 from sales_area a join branch b on b.id = a.branch_id
        where a.id = $1 and b.company_id = $2`, areaId, companyId);
        }
        async vehicleExists(vehicleId) {
            return this.exists('select 1 from vehicle where id = $1', vehicleId);
        }
        /** انبار والد باید متعلق به همان شرکت باشد */
        async warehouseExists(companyId, warehouseId) {
            return this.exists(`select 1 from warehouse w join branch b on b.id = w.branch_id
        where w.id = $1 and b.company_id = $2`, warehouseId, companyId);
        }
        async exists(sql, ...values) {
            const { rows } = await this.pool.query(sql, values);
            return rows.length > 0;
        }
        // ---------------- نوشتن ----------------
        async insert(companyId, dto, branchId) {
            const { rows } = await this.pool.query(`insert into warehouse (branch_id, code, name, kind, parent_warehouse_id,
                              vehicle_id, area_id, allow_negative, is_active)
       values ($1, $2, $3, $4, $5, $6, $7, coalesce($8, false), coalesce($9, true))
       returning id`, [
                branchId,
                dto.code,
                dto.name,
                dto.kind,
                dto.parent_warehouse_id ?? null,
                dto.vehicle_id ?? null,
                dto.area_id ?? null,
                dto.allow_negative ?? null,
                dto.is_active ?? null,
            ]);
            return rows[0].id;
        }
        async update(companyId, id, dto) {
            const sets = [];
            const params = [id, companyId];
            const add = (fragment, value) => {
                params.push(value);
                sets.push(fragment.replace('$?', `$${params.length}`));
            };
            if (dto.branch_id !== undefined)
                add('branch_id = $?', dto.branch_id);
            if (dto.code !== undefined)
                add('code = $?', dto.code);
            if (dto.name !== undefined)
                add('name = $?', dto.name);
            if (dto.kind !== undefined)
                add('kind = $?', dto.kind);
            if (dto.parent_warehouse_id !== undefined)
                add('parent_warehouse_id = $?', dto.parent_warehouse_id);
            if (dto.vehicle_id !== undefined)
                add('vehicle_id = $?', dto.vehicle_id);
            if (dto.area_id !== undefined)
                add('area_id = $?', dto.area_id);
            if (dto.allow_negative !== undefined)
                add('allow_negative = $?', dto.allow_negative);
            if (dto.is_active !== undefined)
                add('is_active = $?', dto.is_active);
            if (sets.length === 0)
                return id;
            const { rows } = await this.pool.query(`update warehouse w set ${sets.join(', ')}
        where w.id = $1
          and exists (select 1 from branch b where b.id = w.branch_id and b.company_id = $2)
        returning w.id`, params);
            return rows[0]?.id ?? null;
        }
    };
    return WarehouseRepository = _classThis;
})();
exports.WarehouseRepository = WarehouseRepository;
