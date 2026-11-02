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
exports.StockRepository = void 0;
const common_1 = require("@nestjs/common");
const encodeCursor = (parts) => Buffer.from(parts.join('|'), 'utf8').toString('base64url');
const decodeCursor = (cursor) => Buffer.from(cursor, 'base64url').toString('utf8').split('|');
/**
 * خواندن مانده موجودی + اعمال اصلاحیه.
 * scope شرکت از warehouse → branch → company؛ کوئری‌های نوشتن داخل تراکنش اندام‌وار
 * (header → line → inventory_txn + fn_apply_stock_txn) تا در صورت رد قید، همه برگردد.
 */
let StockRepository = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var StockRepository = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            StockRepository = _classThis = _classDescriptor.value;
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
            if (query.warehouse_id) {
                params.push(query.warehouse_id);
                where.push(`sb.warehouse_id = $${params.length}`);
            }
            if (query.product_id) {
                params.push(query.product_id);
                where.push(`sb.product_id = $${params.length}`);
            }
            if (query.batch_id) {
                params.push(query.batch_id);
                where.push(`sb.batch_id = $${params.length}`);
            }
            // کرسر ترکیبی روی سه ستون کلید (بچ null با رشته خالی نرمال می‌شود)
            if (query.cursor) {
                const [wh, pr, ba] = decodeCursor(query.cursor);
                params.push(wh, pr, ba);
                const n = params.length;
                where.push(`(sb.warehouse_id, sb.product_id, coalesce(sb.batch_id::text, '')) > ($${n - 2}, $${n - 1}, $${n})`);
            }
            params.push(limit + 1);
            const { rows } = await this.pool.query(`select sb.warehouse_id, sb.product_id, sb.batch_id,
              sb.qty_on_hand::float8 as qty_on_hand,
              sb.qty_reserved::float8 as qty_reserved,
              (sb.qty_on_hand - sb.qty_reserved)::float8 as qty_available,
              sb.qty_on_hand_value::text as qty_on_hand_value,
              sb.updated_at
         from stock_balance sb
         join warehouse w on w.id = sb.warehouse_id
         join branch b on b.id = w.branch_id
        where ${where.join(' and ')}
        order by sb.warehouse_id, sb.product_id, coalesce(sb.batch_id::text, '')
        limit $${params.length}`, params);
            const hasMore = rows.length > limit;
            const page = hasMore ? rows.slice(0, limit) : rows;
            const last = page[page.length - 1];
            return {
                items: page,
                hasMore,
                nextCursor: hasMore && last
                    ? encodeCursor([last.warehouse_id, last.product_id, last.batch_id ?? ''])
                    : null,
            };
        }
        /**
         * ایجاد اصلاحیه: header + line + inventory_txn و اعمال مانده با fn_apply_stock_txn.
         * اگر مانده منفی شود و allow_negative خاموش باشد، تابع با check_violation بالا می‌آید.
         * برگردانده شناسه header است؛ خواندن نهایی در سرویس انجام می‌شود.
         */
        async createAdjustment(companyId, dto) {
            const client = await this.pool.connect();
            try {
                await client.query('begin');
                // scope: انبار باید متعلق به شرکت باشد و branch آن را برداریم
                const wh = await client.query(`select w.branch_id from warehouse w join branch b on b.id = w.branch_id
          where w.id = $1 and b.company_id = $2`, [dto.warehouse_id, companyId]);
                if (wh.rowCount === 0)
                    throw Object.assign(new Error('warehouse not found'), { pgCode: 'no_data' });
                const branchId = wh.rows[0].branch_id;
                const docNumber = dto.reason_code === 'count_fix' ? null : null; // شماره سند اختیاری
                const header = await client.query(`insert into stock_adjustment (branch_id, warehouse_id, doc_number, reason_code, status, note)
         values ($1, $2, $3, $4, 'posted', $5) returning id`, [branchId, dto.warehouse_id, docNumber, dto.reason_code, dto.note ?? null]);
                const headerId = header.rows[0].id;
                const line = await client.query(`insert into stock_adjustment_line (stock_adjustment_id, product_id, batch_id, qty, unit_cost)
         values ($1, $2, $3, $4, 0) returning id`, [headerId, dto.product_id, dto.batch_id ?? null, dto.qty_delta]);
                const lineId = line.rows[0].id;
                const txnKind = dto.qty_delta > 0 ? 'adjust_in' : 'adjust_out';
                // اعمال مانده در همین statement (insert txn + فراخوانی fn_apply_stock_txn روی ردیف درج‌شده)
                await client.query(`with ins as (
           insert into inventory_txn
             (branch_id, warehouse_id, product_id, batch_id, txn_kind, qty, unit_cost,
              source_type, source_id, source_line_id, occurred_at)
           values ($1, $2, $3, $4, $5, $6, 0, 'stock_adjustment', $7, $8, now())
           returning *
         )
         select fn_apply_stock_txn(ins) from ins`, [branchId, dto.warehouse_id, dto.product_id, dto.batch_id ?? null, txnKind, dto.qty_delta, headerId, lineId]);
                await client.query('commit');
                return { id: headerId, branchId };
            }
            catch (err) {
                await client.query('rollback').catch(() => undefined);
                throw err;
            }
            finally {
                client.release();
            }
        }
        /** خواندن اصلاحیه برای پاسخ (نمای تخت) */
        async findAdjustment(companyId, id) {
            const { rows } = await this.pool.query(`select a.warehouse_id, l.product_id, l.batch_id, l.qty::float8 as qty_delta,
              a.reason_code, a.note
         from stock_adjustment a
         join stock_adjustment_line l on l.stock_adjustment_id = a.id
         join branch b on b.id = a.branch_id
        where a.id = $1 and b.company_id = $2`, [id, companyId]);
            return rows[0] ?? null;
        }
    };
    return StockRepository = _classThis;
})();
exports.StockRepository = StockRepository;
