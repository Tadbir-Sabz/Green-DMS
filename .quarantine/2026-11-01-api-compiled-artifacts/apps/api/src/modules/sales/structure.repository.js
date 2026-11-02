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
exports.StructureRepository = void 0;
const common_1 = require("@nestjs/common");
/**
 * مرجع صفحه‌بندی keyset روی (code, id) — کد در شرکتِ چندشعبه‌ای یکتا نیست،
 * پس جفت (کد، شناسه) ترتیب پایدار و یکتا می‌سازد.
 */
const encodeCursor = (code, id) => Buffer.from(`${code}|${id}`, 'utf8').toString('base64url');
const decodeCursor = (cursor) => {
    const [code, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    return [code ?? '', id ?? ''];
};
let StructureRepository = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var StructureRepository = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            StructureRepository = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        pool;
        constructor(pool) {
            this.pool = pool;
        }
        // ---------------- حوزه فروش ----------------
        async listAreas(companyId, query) {
            const limit = query.limit ?? 50;
            const params = [companyId];
            const where = ['b.company_id = $1'];
            if (query.parent_area_id) {
                params.push(query.parent_area_id);
                where.push(`a.parent_area_id = $${params.length}`);
            }
            if (query.cursor) {
                const [code, id] = decodeCursor(query.cursor);
                params.push(code, id);
                where.push(`(a.code, a.id) > ($${params.length - 1}, $${params.length})`);
            }
            params.push(limit + 1);
            const { rows } = await this.pool.query(`select a.id, a.branch_id, a.parent_area_id, a.code, a.name, a.is_active
         from sales_area a
         join branch b on b.id = a.branch_id
        where ${where.join(' and ')}
        order by a.code, a.id
        limit $${params.length}`, params);
            const hasMore = rows.length > limit;
            const page = hasMore ? rows.slice(0, limit) : rows;
            const last = page[page.length - 1];
            return { items: page, hasMore, nextCursor: hasMore && last ? encodeCursor(last.code, last.id) : null };
        }
        async findArea(companyId, id) {
            const { rows } = await this.pool.query(`select a.id, a.branch_id, a.parent_area_id, a.code, a.name, a.is_active
         from sales_area a
         join branch b on b.id = a.branch_id
        where a.id = $1 and b.company_id = $2`, [id, companyId]);
            return rows[0] ?? null;
        }
        async insertArea(branchId, dto) {
            const { rows } = await this.pool.query(`insert into sales_area (branch_id, parent_area_id, code, name, is_active)
       values ($1, $2, $3, $4, coalesce($5, true))
       returning id`, [branchId, dto.parent_area_id ?? null, dto.code, dto.name, dto.is_active ?? null]);
            return rows[0].id;
        }
        async updateArea(companyId, id, dto) {
            const sets = [];
            const params = [id, companyId];
            const add = (fragment, value) => {
                params.push(value);
                sets.push(fragment.replace('$?', `$${params.length}`));
            };
            if (dto.code !== undefined)
                add('code = $?', dto.code);
            if (dto.name !== undefined)
                add('name = $?', dto.name);
            if (dto.branch_id !== undefined)
                add('branch_id = $?', dto.branch_id);
            // parent_area_id قابل‌ تنظیم به null (حذف سلسله‌مراتب) است — باید nullِ صریح حفظ شود
            if (dto.parent_area_id !== undefined)
                add('parent_area_id = $?', dto.parent_area_id);
            if (dto.is_active !== undefined)
                add('is_active = $?', dto.is_active);
            if (sets.length === 0)
                return id;
            const { rows } = await this.pool.query(`update sales_area set ${sets.join(', ')}
        where id = $1 and exists (
          select 1 from branch b where b.id = sales_area.branch_id and b.company_id = $2)
        returning id`, params);
            return rows[0]?.id ?? null;
        }
        // ---------------- مسیر فروش ----------------
        async listRoutes(companyId, query) {
            const limit = query.limit ?? 50;
            const params = [companyId];
            const where = ['b.company_id = $1'];
            if (query.area_id) {
                params.push(query.area_id);
                where.push(`r.area_id = $${params.length}`);
            }
            if (query.cursor) {
                const [code, id] = decodeCursor(query.cursor);
                params.push(code, id);
                where.push(`(r.code, r.id) > ($${params.length - 1}, $${params.length})`);
            }
            params.push(limit + 1);
            const { rows } = await this.pool.query(`select r.id, r.area_id, r.code, r.name, r.visit_weekday, r.is_active
         from route r
         join sales_area a on a.id = r.area_id
         join branch b on b.id = a.branch_id
        where ${where.join(' and ')}
        order by r.code, r.id
        limit $${params.length}`, params);
            const hasMore = rows.length > limit;
            const page = hasMore ? rows.slice(0, limit) : rows;
            const last = page[page.length - 1];
            return { items: page, hasMore, nextCursor: hasMore && last ? encodeCursor(last.code, last.id) : null };
        }
        async findRoute(companyId, id) {
            const { rows } = await this.pool.query(`select r.id, r.area_id, r.code, r.name, r.visit_weekday, r.is_active
         from route r
         join sales_area a on a.id = r.area_id
         join branch b on b.id = a.branch_id
        where r.id = $1 and b.company_id = $2`, [id, companyId]);
            return rows[0] ?? null;
        }
        /** مشتریان مسیر به ترتیب بازدید (visit_sequence؛ بدون ترتیب در انتها) */
        async findRouteCustomerIds(companyId, routeId) {
            const { rows } = await this.pool.query(`select c.id
         from customer c
         join branch b on b.id = c.branch_id
        where c.route_id = $1 and b.company_id = $2 and c.deleted_at is null
        order by c.visit_sequence nulls last, c.id`, [routeId, companyId]);
            return rows.map((r) => r.id);
        }
        async insertRoute(companyId, dto) {
            const client = await this.pool.connect();
            try {
                await client.query('begin');
                const header = await client.query(`insert into route (area_id, code, name, visit_weekday, is_active)
         values ($1, $2, $3, $4, coalesce($5, true))
         returning id`, [dto.area_id, dto.code, dto.name, dto.visit_weekday ?? null, dto.is_active ?? null]);
                const id = header.rows[0].id;
                if (dto.customer_ids) {
                    await this.assignRouteCustomers(client, companyId, id, dto.customer_ids);
                }
                await client.query('commit');
                return id;
            }
            catch (err) {
                await client.query('rollback').catch(() => undefined);
                throw err;
            }
            finally {
                client.release();
            }
        }
        async updateRoute(companyId, id, dto) {
            const client = await this.pool.connect();
            try {
                await client.query('begin');
                const sets = [];
                const params = [id, companyId];
                const add = (fragment, value) => {
                    params.push(value);
                    sets.push(fragment.replace('$?', `$${params.length}`));
                };
                if (dto.area_id !== undefined)
                    add('area_id = $?', dto.area_id);
                if (dto.code !== undefined)
                    add('code = $?', dto.code);
                if (dto.name !== undefined)
                    add('name = $?', dto.name);
                // visit_weekday قابل‌ تنظیم به null است — باید nullِ صریح حفظ شود
                if (dto.visit_weekday !== undefined)
                    add('visit_weekday = $?', dto.visit_weekday);
                if (dto.is_active !== undefined)
                    add('is_active = $?', dto.is_active);
                if (sets.length > 0) {
                    const owned = await client.query(`update route set ${sets.join(', ')}
            where id = $1 and exists (
              select 1 from sales_area a join branch b on b.id = a.branch_id
               where a.id = route.area_id and b.company_id = $2)
            returning id`, params);
                    if (owned.rowCount === 0) {
                        await client.query('rollback');
                        return null;
                    }
                }
                if (dto.customer_ids) {
                    await this.assignRouteCustomers(client, companyId, id, dto.customer_ids);
                }
                await client.query('commit');
                return id;
            }
            catch (err) {
                await client.query('rollback').catch(() => undefined);
                throw err;
            }
            finally {
                client.release();
            }
        }
        /**
         * انتساب/ترتیب مشتریان مسیر: هر مشتریِ فهرست به مسیر منتسب و ترتیبش ست می‌شود؛
         * مشتریانی که قبلاً در مسیر بودند ولی در فهرست نیستند از مسیر جدا می‌شوند.
         */
        async assignRouteCustomers(client, companyId, routeId, customerIds) {
            for (let i = 0; i < customerIds.length; i += 1) {
                await client.query(`update customer set route_id = $1, visit_sequence = $3
          where id = $2 and exists (
            select 1 from branch b where b.id = customer.branch_id and b.company_id = $4)`, [routeId, customerIds[i], i + 1, companyId]);
            }
            await client.query(`update customer set route_id = null, visit_sequence = null
        where route_id = $1 and not (id = any($2::uuid[]))`, [routeId, customerIds]);
        }
        // ---------------- بررسی‌های ارجاعی ----------------
        async defaultBranchId(companyId) {
            const { rows } = await this.pool.query('select id from branch where company_id = $1 and is_active order by code limit 1', [companyId]);
            return rows[0]?.id ?? null;
        }
        async branchExists(companyId, branchId) {
            const { rows } = await this.pool.query('select 1 from branch where id = $1 and company_id = $2', [branchId, companyId]);
            return rows.length > 0;
        }
        async areaExists(companyId, areaId) {
            const { rows } = await this.pool.query(`select 1 from sales_area a join branch b on b.id = a.branch_id
        where a.id = $1 and b.company_id = $2`, [areaId, companyId]);
            return rows.length > 0;
        }
        /** همهٔ مشتریانِ فهرست باید متعلق به همین شرکت باشند */
        async customersBelongToCompany(companyId, customerIds) {
            if (customerIds.length === 0)
                return true;
            const { rows } = await this.pool.query(`select count(*)::int as n
         from customer c
         join branch b on b.id = c.branch_id
        where c.id = any($1::uuid[]) and b.company_id = $2`, [customerIds, companyId]);
            return rows[0].n === customerIds.length;
        }
    };
    return StructureRepository = _classThis;
})();
exports.StructureRepository = StructureRepository;
