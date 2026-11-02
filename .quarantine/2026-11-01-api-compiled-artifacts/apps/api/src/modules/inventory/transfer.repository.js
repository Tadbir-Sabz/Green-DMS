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
exports.TransferRepository = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const encodeCursor = (id) => Buffer.from(id, 'utf8').toString('base64url');
const decodeCursor = (cursor) => Buffer.from(cursor, 'base64url').toString('utf8');
const COLUMNS = 'id, doc_number, from_warehouse_id, to_warehouse_id, status';
let TransferRepository = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var TransferRepository = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            TransferRepository = _classThis = _classDescriptor.value;
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
            const where = ['t.branch_id in (select id from branch where company_id = $1)'];
            if (query.cursor) {
                params.push(decodeCursor(query.cursor));
                where.push(`t.id > $${params.length}`);
            }
            params.push(limit + 1);
            const { rows } = await this.pool.query(`select ${COLUMNS} from stock_transfer t
        where ${where.join(' and ')}
        order by t.id
        limit $${params.length}`, params);
            const hasMore = rows.length > limit;
            const page = hasMore ? rows.slice(0, limit) : rows;
            const last = page[page.length - 1];
            return { items: page, hasMore, nextCursor: hasMore && last ? encodeCursor(last.id) : null };
        }
        async findById(companyId, id) {
            const { rows } = await this.pool.query(`select ${COLUMNS} from stock_transfer t
        where t.id = $1 and t.branch_id in (select id from branch where company_id = $2)`, [id, companyId]);
            return rows[0] ?? null;
        }
        async findLines(transferId) {
            const { rows } = await this.pool.query(`select product_id, batch_id, qty::float8 as qty
         from stock_transfer_line
        where stock_transfer_id = $1
        order by product_id`, [transferId]);
            return rows;
        }
        /**
         * ثبت انتقال با وضعیت draft (header + خطوط در یک تراکنش).
         * شعبهٔ سند از انبار مبدأ گرفته می‌شود؛ doc_number از شناسهٔ سند ساخته می‌شود.
         */
        async insert(companyId, dto) {
            const client = await this.pool.connect();
            try {
                await client.query('begin');
                const branch = await client.query(`select w.branch_id from warehouse w join branch b on b.id = w.branch_id
          where w.id = $1 and b.company_id = $2`, [dto.from_warehouse_id, companyId]);
                if (branch.rowCount === 0)
                    throw Object.assign(new Error('warehouse not found'), { pgCode: 'no_data' });
                const id = (0, node_crypto_1.randomUUID)();
                const docNumber = `TR-${id.slice(0, 8).toUpperCase()}`;
                await client.query(`insert into stock_transfer (id, branch_id, doc_number, from_warehouse_id, to_warehouse_id, status)
         values ($1, $2, $3, $4, $5, 'draft')`, [id, branch.rows[0].branch_id, docNumber, dto.from_warehouse_id, dto.to_warehouse_id]);
                for (const line of dto.lines ?? []) {
                    await client.query(`insert into stock_transfer_line (stock_transfer_id, product_id, batch_id, qty, unit_cost)
           values ($1, $2, $3, $4, 0)`, [id, line.product_id, line.batch_id ?? null, line.qty]);
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
        /** اعتبارسنجی اینکه هر دو انبار متعلق به شرکت‌اند و متفاوت‌اند */
        async warehousesValid(companyId, fromId, toId) {
            const { rows } = await this.pool.query(`select w.id from warehouse w join branch b on b.id = w.branch_id
        where w.id = any($1::uuid[]) and b.company_id = $2`, [[fromId, toId], companyId]);
            return { valid: rows.length === 2, same: fromId === toId };
        }
    };
    return TransferRepository = _classThis;
})();
exports.TransferRepository = TransferRepository;
