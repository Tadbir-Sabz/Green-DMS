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
exports.StocktakeRepository = void 0;
const common_1 = require("@nestjs/common");
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
const encodeCursor = (id) => Buffer.from(id, 'utf8').toString('base64url');
const decodeCursor = (cursor) => Buffer.from(cursor, 'base64url').toString('utf8');
const COLUMNS = 'id, branch_id, warehouse_id, status';
let StocktakeRepository = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var StocktakeRepository = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            StocktakeRepository = _classThis = _classDescriptor.value;
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
            const where = ['s.branch_id in (select id from branch where company_id = $1)'];
            if (query.status) {
                params.push(query.status);
                where.push(`s.status = $${params.length}`);
            }
            if (query.cursor) {
                params.push(decodeCursor(query.cursor));
                where.push(`s.id > $${params.length}`);
            }
            params.push(limit + 1);
            const { rows } = await this.pool.query(`select ${COLUMNS} from stock_count s
        where ${where.join(' and ')}
        order by s.id
        limit $${params.length}`, params);
            const hasMore = rows.length > limit;
            const page = hasMore ? rows.slice(0, limit) : rows;
            const last = page[page.length - 1];
            return { items: page, hasMore, nextCursor: hasMore && last ? encodeCursor(last.id) : null };
        }
        async findById(companyId, id) {
            const { rows } = await this.pool.query(`select ${COLUMNS} from stock_count s
        where s.id = $1 and s.branch_id in (select id from branch where company_id = $2)`, [id, companyId]);
            return rows[0] ?? null;
        }
        async findLines(stockTakeId) {
            const { rows } = await this.pool.query(`select product_id, batch_id,
              qty_system::float8 as qty_system,
              qty_counted::float8 as qty_counted,
              (coalesce(qty_counted, 0) - qty_system)::float8 as variance
         from stock_count_line
        where stock_count_id = $1
        order by product_id`, [stockTakeId]);
            return rows;
        }
        /** مانده فعلی سیستم برای یک کالا/بچ در انبار (مرجع شمارش) */
        async systemQty(warehouseId, productId, batchId) {
            const { rows } = await this.pool.query(batchId
                ? `select qty_on_hand::text as q from stock_balance where warehouse_id = $1 and product_id = $2 and batch_id = $3`
                : `select qty_on_hand::text as q from stock_balance where warehouse_id = $1 and product_id = $2 and batch_id is null`, batchId ? [warehouseId, productId, batchId] : [warehouseId, productId]);
            return rows[0] ? Number(rows[0].q) : 0;
        }
        /** شعبهٔ انبار (برای سند)؛ null اگر انبار در شرکت نباشد */
        async resolveWarehouseBranch(companyId, warehouseId) {
            const { rows } = await this.pool.query(`select w.branch_id from warehouse w join branch b on b.id = w.branch_id
        where w.id = $1 and b.company_id = $2`, [warehouseId, companyId]);
            return rows[0]?.branch_id ?? null;
        }
        async insert(companyId, dto, branchId) {
            const client = await this.pool.connect();
            try {
                await client.query('begin');
                const header = await client.query(`insert into stock_count (branch_id, warehouse_id, mode, status)
         values ($1, $2, 'full', 'draft') returning id`, [branchId, dto.warehouse_id]);
                const id = header.rows[0].id;
                for (const line of dto.lines ?? []) {
                    const sys = await this.systemQty(dto.warehouse_id, line.product_id, line.batch_id ?? null);
                    await client.query(`insert into stock_count_line (stock_count_id, product_id, batch_id, qty_system, qty_counted)
           values ($1, $2, $3, $4, $5)`, [id, line.product_id, line.batch_id ?? null, sys, line.counted_qty ?? null]);
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
        /** ثبت/به‌روزرسانی شمارش اقلام (upsert با snapshot مانده سیستم) */
        async upsertLines(stockTakeId, warehouseId, lines) {
            const client = await this.pool.connect();
            try {
                await client.query('begin');
                for (const line of lines) {
                    const sys = await this.systemQty(warehouseId, line.product_id, line.batch_id ?? null);
                    await client.query(`insert into stock_count_line (stock_count_id, product_id, batch_id, qty_system, qty_counted)
           values ($1, $2, $3, $4, $5)
           on conflict (stock_count_id, product_id, coalesce(batch_id, '${ZERO_UUID}'::uuid))
           do update set qty_counted = excluded.qty_counted`, [stockTakeId, line.product_id, line.batch_id ?? null, sys, line.counted_qty ?? null]);
                }
                await client.query('commit');
            }
            catch (err) {
                await client.query('rollback').catch(() => undefined);
                throw err;
            }
            finally {
                client.release();
            }
        }
        /** تغییر وضعیت سند (برای PATCH؛ از قید DDL عبور می‌کند) */
        async updateStatus(id, status) {
            await this.pool.query(`update stock_count set status = $2, updated_at = now() where id = $1`, [id, status]);
        }
        /**
         * اعمال مغایرت‌ها: هر قلم با counted متفاوت از system → inventory_txn (count_gain/count_loss)
         * + fn_apply_stock_txn، سپس وضعیت posted.
         * پیش‌نیاز: شرکت مالک، وضعیت قابل ارسال، حداقل یک قلم شمارش‌شده.
         */
        async submit(companyId, id, approverId) {
            const client = await this.pool.connect();
            try {
                await client.query('begin');
                const header = await client.query(`select s.branch_id, s.warehouse_id, s.status from stock_count s
          where s.id = $1 and s.branch_id in (select id from branch where company_id = $2)
          for update`, [id, companyId]);
                if (header.rowCount === 0)
                    throw Object.assign(new Error('not found'), { pgCode: 'no_data' });
                const lines = await client.query(`select product_id, batch_id, qty_system, qty_counted from stock_count_line where stock_count_id = $1`, [id]);
                const { branch_id: branchId, warehouse_id: warehouseId, status } = header.rows[0];
                if (status === 'posted' || status === 'voided') {
                    throw Object.assign(new Error('bad state'), { pgCode: 'bad_state' });
                }
                const counted = lines.rows.filter((l) => l.qty_counted !== null);
                if (counted.length === 0) {
                    throw Object.assign(new Error('no lines'), { pgCode: 'no_lines' });
                }
                for (const line of counted) {
                    const variance = Number(line.qty_counted) - Number(line.qty_system);
                    if (Math.abs(variance) < 1e-9)
                        continue;
                    const kind = variance > 0 ? 'count_gain' : 'count_loss';
                    await client.query(`with ins as (
             insert into inventory_txn
               (branch_id, warehouse_id, product_id, batch_id, txn_kind, qty, unit_cost,
                source_type, source_id, source_line_id, occurred_at)
             values ($1, $2, $3, $4, $5, $6, 0, 'stock_count', $7, null, now())
             returning *
           )
           select fn_apply_stock_txn(ins) from ins`, [branchId, warehouseId, line.product_id, line.batch_id, kind, variance, id]);
                }
                await client.query(`update stock_count set status = 'posted', approved_by = $2, updated_at = now() where id = $1`, [id, approverId]);
                await client.query('commit');
            }
            catch (err) {
                await client.query('rollback').catch(() => undefined);
                throw err;
            }
            finally {
                client.release();
            }
        }
    };
    return StocktakeRepository = _classThis;
})();
exports.StocktakeRepository = StocktakeRepository;
