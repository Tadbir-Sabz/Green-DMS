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
exports.ProductRepository = void 0;
const common_1 = require("@nestjs/common");
/**
 * ستون‌های پاسخ — دقیقاً مطابق اسکیمای Product در openapi.yaml
 * نکته: numeric از pg به‌صورت string برمی‌گردد؛ min_order_qty به عدد
 * cast می‌شود چون قرارداد آن را number اعلام کرده (پول‌ها همچنان string‌اند).
 */
const COLUMNS = `
  id, code, name, category_id, brand_id, base_uom_id, tax_code_id,
  is_batch_tracked, is_expiry_tracked, shelf_life_days,
  is_returnable_container, requires_permit, distribution_kind,
  min_order_qty::double precision as min_order_qty, weight_gr, volume_cm3,
  status, created_at, row_version`;
/** ستون‌های قابل نوشتن در UPDATE — هرگز نام ستون از بیرون نمی‌آید (مصون از injection) */
const UPDATABLE = [
    'code',
    'name',
    'category_id',
    'brand_id',
    'base_uom_id',
    'tax_code_id',
    'is_batch_tracked',
    'is_expiry_tracked',
    'shelf_life_days',
    'is_returnable_container',
    'requires_permit',
    'distribution_kind',
    'min_order_qty',
    'weight_gr',
    'volume_cm3',
    'status',
];
const encodeCursor = (code) => Buffer.from(code, 'utf8').toString('base64url');
const decodeCursor = (cursor) => Buffer.from(cursor, 'base64url').toString('utf8');
/**
 * دسترسی داده کالا — SQL خام روی جدول `product` (بدون ORM، طبق §۳.۲ سند).
 * نکته: به‌روزرسانی‌ها row_version را خودِ تریگر trg_touch (مهاجرت 0020) بالا می‌برد؛
 * حذف نرم با deleted_at است و همه کوئری‌ها آن را رد می‌کنند.
 */
let ProductRepository = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var ProductRepository = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            ProductRepository = _classThis = _classDescriptor.value;
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
            const where = ['company_id = $1', 'deleted_at is null'];
            if (query.q) {
                params.push(`%${query.q}%`);
                where.push(`(code ilike $${params.length} or name ilike $${params.length})`);
            }
            if (query.category_id) {
                params.push(query.category_id);
                where.push(`category_id = $${params.length}`);
            }
            if (query.brand_id) {
                params.push(query.brand_id);
                where.push(`brand_id = $${params.length}`);
            }
            if (query.status) {
                params.push(query.status);
                where.push(`status = $${params.length}`);
            }
            if (query.cursor) {
                params.push(decodeCursor(query.cursor));
                where.push(`code > $${params.length}`);
            }
            params.push(limit + 1);
            const { rows } = await this.pool.query(`select ${COLUMNS} from product
        where ${where.join(' and ')}
        order by code
        limit $${params.length}`, params);
            const hasMore = rows.length > limit;
            const items = hasMore ? rows.slice(0, limit) : rows;
            const last = items[items.length - 1];
            return {
                items,
                hasMore,
                nextCursor: hasMore && last ? encodeCursor(last.code) : null,
            };
        }
        async findById(companyId, id) {
            const { rows } = await this.pool.query(`select ${COLUMNS} from product
        where id = $1 and company_id = $2 and deleted_at is null`, [id, companyId]);
            return rows[0] ?? null;
        }
        /** آیا دسته‌بندی برای همین شرکت تعریف شده؟ */
        async categoryExists(companyId, categoryId) {
            const { rows } = await this.pool.query('select 1 from product_category where id = $1 and company_id = $2', [categoryId, companyId]);
            return rows.length > 0;
        }
        /** آیا واحد اندازه‌گیری (داده مرجع سراسری) وجود دارد؟ */
        async uomExists(uomId) {
            const { rows } = await this.pool.query('select 1 from uom where id = $1', [uomId]);
            return rows.length > 0;
        }
        async insert(companyId, dto) {
            const { rows } = await this.pool.query(`insert into product (company_id, code, name, category_id, base_uom_id,
                            brand_id, tax_code_id,
                            is_batch_tracked, is_expiry_tracked, shelf_life_days,
                            is_returnable_container, requires_permit, distribution_kind,
                            min_order_qty, weight_gr, volume_cm3)
       values ($1, $2, $3, $4, $5,
               $6, $7,
               coalesce($8, false), coalesce($9, false), $10,
               coalesce($11, false), coalesce($12, false), coalesce($13, 'both'),
               coalesce($14, 0), $15, $16)
       returning ${COLUMNS}`, [
                companyId,
                dto.code,
                dto.name,
                dto.category_id,
                dto.base_uom_id,
                dto.brand_id ?? null,
                dto.tax_code_id ?? null,
                dto.is_batch_tracked,
                dto.is_expiry_tracked,
                dto.shelf_life_days ?? null,
                dto.is_returnable_container,
                dto.requires_permit,
                dto.distribution_kind,
                dto.min_order_qty,
                dto.weight_gr ?? null,
                dto.volume_cm3 ?? null,
            ]);
            return rows[0];
        }
        /**
         * بروزرسانی با قفل خوش‌بینانه: اگر expectedRowVersion داده شود و مغایرت داشته
         * باشد، صفر ردیف برمی‌گردد (سرویس آن را 409 می‌کند).
         */
        async update(companyId, id, dto, expectedRowVersion) {
            const sets = [];
            const params = [id, companyId];
            for (const col of UPDATABLE) {
                const value = dto[col];
                if (value !== undefined) {
                    params.push(value);
                    sets.push(`${col} = $${params.length}`);
                }
            }
            if (sets.length === 0)
                return this.findById(companyId, id);
            let where = 'id = $1 and company_id = $2 and deleted_at is null';
            if (expectedRowVersion !== undefined) {
                params.push(expectedRowVersion);
                where += ` and row_version = $${params.length}`;
            }
            const { rows } = await this.pool.query(`update product set ${sets.join(', ')} where ${where} returning ${COLUMNS}`, params);
            return rows[0] ?? null;
        }
        async softDelete(companyId, id) {
            const { rowCount } = await this.pool.query('update product set deleted_at = now() where id = $1 and company_id = $2 and deleted_at is null', [id, companyId]);
            return (rowCount ?? 0) > 0;
        }
    };
    return ProductRepository = _classThis;
})();
exports.ProductRepository = ProductRepository;
