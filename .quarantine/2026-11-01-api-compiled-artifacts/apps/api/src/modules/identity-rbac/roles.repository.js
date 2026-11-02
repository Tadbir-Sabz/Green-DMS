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
exports.RolesRepository = void 0;
const common_1 = require("@nestjs/common");
const COLUMNS = `
  r.id, r.code, r.name, r.is_system,
  coalesce((
    select json_agg(rp.permission_code order by rp.permission_code)
      from role_permission rp where rp.role_id = r.id
  ), '[]'::json) as permission_codes`;
const encodeCursor = (code) => Buffer.from(code, 'utf8').toString('base64url');
const decodeCursor = (cursor) => Buffer.from(cursor, 'base64url').toString('utf8');
/**
 * دسترسی داده نقش‌ها — SQL خام روی role/role_permission/permission (بدون ORM، §۳.۲).
 * همه کوئری‌ها company_id نشست را شرط می‌کنند؛ permission جدولی سراسری است
 * (seed مهاجرت 0022) و فقط اعتبار الگوها را می‌سنجد.
 */
let RolesRepository = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var RolesRepository = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            RolesRepository = _classThis = _classDescriptor.value;
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
            const where = ['r.company_id = $1'];
            if (query.cursor) {
                params.push(decodeCursor(query.cursor));
                where.push(`r.code > $${params.length}`);
            }
            params.push(limit + 1);
            const { rows } = await this.pool.query(`select ${COLUMNS} from role r
        where ${where.join(' and ')}
        order by r.code
        limit $${params.length}`, params);
            const hasMore = rows.length > limit;
            const items = hasMore ? rows.slice(0, limit) : rows;
            const last = items[items.length - 1];
            return { items, hasMore, nextCursor: hasMore && last ? encodeCursor(last.code) : null };
        }
        async findById(companyId, id) {
            const { rows } = await this.pool.query(`select ${COLUMNS} from role r where r.id = $1 and r.company_id = $2`, [id, companyId]);
            return rows[0] ?? null;
        }
        /** الگوهای مجوزی که در جدول permission نیستند (برای پیام روشن 400) */
        async findMissingPermissionCodes(codes) {
            if (codes.length === 0)
                return [];
            const { rows } = await this.pool.query('select code from permission where code = any($1::text[])', [codes]);
            const known = new Set(rows.map((r) => r.code));
            return [...new Set(codes)].filter((c) => !known.has(c));
        }
        /** چند کاربر فعال به این نقش نسبت داده‌اند (برای قید DELETE در قرارداد) */
        async countAssignedUsers(roleId) {
            const { rows } = await this.pool.query('select count(*)::text as count from user_role where role_id = $1', [roleId]);
            return Number(rows[0].count);
        }
        /** ساخت نقش و نگاشت مجوزهایش در یک تراکنش */
        async insert(companyId, input) {
            const client = await this.pool.connect();
            let roleId;
            try {
                await client.query('begin');
                const { rows } = await client.query('insert into role (company_id, code, name) values ($1, $2, $3) returning id', [companyId, input.code, input.name]);
                roleId = rows[0].id;
                if (input.permissionCodes.length > 0) {
                    await client.query('insert into role_permission (role_id, permission_code) select $1, unnest($2::text[])', [roleId, input.permissionCodes]);
                }
                await client.query('commit');
            }
            catch (err) {
                await client.query('rollback');
                throw err;
            }
            finally {
                client.release();
            }
            return (await this.findById(companyId, roleId));
        }
        /** بروزرسانی نقش؛ permission_codes داده شده باشد جایگزین کامل می‌شود (یک تراکنش) */
        async update(companyId, id, input) {
            const sets = [];
            const params = [id, companyId];
            if (input.code !== undefined) {
                params.push(input.code);
                sets.push(`code = $${params.length}`);
            }
            if (input.name !== undefined) {
                params.push(input.name);
                sets.push(`name = $${params.length}`);
            }
            const client = await this.pool.connect();
            try {
                await client.query('begin');
                if (sets.length > 0) {
                    const { rows } = await client.query(`update role set ${sets.join(', ')}
            where id = $1 and company_id = $2 returning id`, params);
                    if (rows.length === 0) {
                        await client.query('rollback');
                        return null;
                    }
                }
                if (input.permissionCodes !== undefined) {
                    await client.query('delete from role_permission where role_id = $1', [id]);
                    if (input.permissionCodes.length > 0) {
                        await client.query('insert into role_permission (role_id, permission_code) select $1, unnest($2::text[])', [id, input.permissionCodes]);
                    }
                }
                await client.query('commit');
            }
            catch (err) {
                await client.query('rollback');
                throw err;
            }
            finally {
                client.release();
            }
            return this.findById(companyId, id);
        }
        /** حذف نقش (role_permission و user_role با on delete cascade پاک می‌شوند) */
        async delete(companyId, id) {
            const { rowCount } = await this.pool.query('delete from role where id = $1 and company_id = $2', [id, companyId]);
            return (rowCount ?? 0) > 0;
        }
    };
    return RolesRepository = _classThis;
})();
exports.RolesRepository = RolesRepository;
