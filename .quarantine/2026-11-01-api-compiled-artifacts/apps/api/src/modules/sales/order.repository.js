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
exports.OrderRepository = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const COLUMNS = `o.id as id, o.branch_id, o.doc_number, o.fiscal_year, o.customer_id, o.request_id, o.salesperson_id,
  o.tour_id, o.channel, o.order_date::text as order_date, o.delivery_date::text as delivery_date,
  o.price_list_id, o.subtotal::text as subtotal, o.discount_total::text as discount_total,
  o.tax_total::text as tax_total, o.grand_total::text as grand_total,
  o.settlement_term_id, o.status, o.approval_request_id, o.note, o.client_uuid`;
const encodeCursor = (id) => Buffer.from(id, 'utf8').toString('base64url');
const decodeCursor = (cursor) => Buffer.from(cursor, 'base64url').toString('utf8');
let OrderRepository = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var OrderRepository = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            OrderRepository = _classThis = _classDescriptor.value;
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
            if (query.customer_id) {
                params.push(query.customer_id);
                where.push(`o.customer_id = $${params.length}`);
            }
            if (query.tour_id) {
                params.push(query.tour_id);
                where.push(`o.tour_id = $${params.length}`);
            }
            if (query.status) {
                params.push(query.status);
                where.push(`o.status = $${params.length}`);
            }
            if (query.order_date) {
                params.push(query.order_date);
                where.push(`o.order_date = $${params.length}::date`);
            }
            if (query.cursor) {
                params.push(decodeCursor(query.cursor));
                where.push(`o.id > $${params.length}`);
            }
            params.push(limit + 1);
            const { rows } = await this.pool.query(`select ${COLUMNS}
         from sales_order o
         join branch b on b.id = o.branch_id
        where ${where.join(' and ')}
        order by o.id
        limit $${params.length}`, params);
            const hasMore = rows.length > limit;
            const page = hasMore ? rows.slice(0, limit) : rows;
            const last = page[page.length - 1];
            return { items: page, hasMore, nextCursor: hasMore && last ? encodeCursor(last.id) : null };
        }
        async findById(companyId, id) {
            const { rows } = await this.pool.query(`select ${COLUMNS}
         from sales_order o
         join branch b on b.id = o.branch_id
        where o.id = $1 and b.company_id = $2`, [id, companyId]);
            return rows[0] ?? null;
        }
        async findLines(orderId) {
            const { rows } = await this.pool.query(`select product_id, packaging_id, qty::float8 as qty,
              unit_price::text as unit_price, discount_amount::text as discount_amount
         from sales_order_line
        where sales_order_id = $1
        order by line_no`, [orderId]);
            return rows;
        }
        /** مشتری برای شعبه و لیست قیمت پیش‌فرض */
        async getCustomerPricing(companyId, customerId) {
            const { rows } = await this.pool.query(`select c.branch_id, c.price_list_id
         from customer c
         join branch b on b.id = c.branch_id
        where c.id = $1 and b.company_id = $2 and c.deleted_at is null`, [customerId, companyId]);
            return rows[0] ?? null;
        }
        async productExists(companyId, productId) {
            const { rows } = await this.pool.query('select 1 from product where id = $1 and company_id = $2', [productId, companyId]);
            return rows.length > 0;
        }
        /** ضریب بسته‌بندی به واحد پایه؛ null وقتی packaging متعلق به کالا نیست */
        async packagingFactor(productId, packagingId) {
            const { rows } = await this.pool.query('select factor_to_base::text as factor from product_packaging where id = $1 and product_id = $2', [packagingId, productId]);
            return rows[0]?.factor ?? null;
        }
        /** قیمت فعال از لیست قیمت برای کالا (قید انحصاری بازه، حداکثر یک ردیف) */
        async priceListPrice(priceListId, productId) {
            const { rows } = await this.pool.query(`select price::text as price from price_list_item
        where price_list_id = $1 and product_id = $2 and valid @> current_date`, [priceListId, productId]);
            return rows[0]?.price ?? null;
        }
        async priceListExists(companyId, priceListId) {
            const { rows } = await this.pool.query('select 1 from price_list where id = $1 and company_id = $2', [priceListId, companyId]);
            return rows.length > 0;
        }
        async settlementTermExists(companyId, termId) {
            const { rows } = await this.pool.query('select 1 from settlement_term where id = $1 and company_id = $2', [termId, companyId]);
            return rows.length > 0;
        }
        async staffExists(companyId, staffId) {
            const { rows } = await this.pool.query(`select 1 from staff s join branch b on b.id = s.branch_id where s.id = $1 and b.company_id = $2`, [staffId, companyId]);
            return rows.length > 0;
        }
        async requestExists(companyId, requestId) {
            const { rows } = await this.pool.query(`select 1 from customer_request r join branch b on b.id = r.branch_id
        where r.id = $1 and b.company_id = $2`, [requestId, companyId]);
            return rows.length > 0;
        }
        /** ساخت سند با وضعیت draft (هدر + اقلام در یک تراکنش) */
        async insert(companyId, dto, opts) {
            const client = await this.pool.connect();
            try {
                await client.query('begin');
                const id = (0, node_crypto_1.randomUUID)();
                const docNumber = `SO-${id.slice(0, 8).toUpperCase()}`;
                await client.query(`insert into sales_order
           (id, branch_id, doc_number, fiscal_year, customer_id, request_id, salesperson_id,
            tour_id, channel, order_date, delivery_date, price_list_id,
            subtotal, discount_total, tax_total, grand_total,
            settlement_term_id, note, client_uuid)
         values ($1, $2, $3, $4, $5, $6, $7,
                 $8, coalesce($9,'field'), $10::date, $11::date, $12,
                 $13, $14, $15, $16,
                 $17, $18, $19)`, [
                    id,
                    opts.branchId,
                    docNumber,
                    opts.fiscalYear,
                    dto.customer_id,
                    dto.request_id ?? null,
                    dto.salesperson_id ?? null,
                    dto.tour_id ?? null,
                    dto.channel ?? null,
                    dto.order_date,
                    dto.delivery_date ?? null,
                    dto.price_list_id ?? null,
                    opts.totals.subtotal,
                    opts.totals.discount_total,
                    opts.totals.tax_total,
                    opts.totals.grand_total,
                    dto.settlement_term_id ?? null,
                    dto.note ?? null,
                    dto.client_uuid ?? null,
                ]);
                await this.insertLines(client, id, opts.lines);
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
        /** ویرایش فقط وقتی status = draft است (قید condition در خود SQL) */
        async update(companyId, id, dto, opts) {
            const client = await this.pool.connect();
            try {
                await client.query('begin');
                const sets = [];
                const params = [id, companyId];
                const add = (fragment, value) => {
                    params.push(value);
                    sets.push(fragment.replace('$?', `$${params.length}`));
                };
                if (dto.customer_id !== undefined)
                    add('customer_id = $?', dto.customer_id);
                if (dto.request_id !== undefined)
                    add('request_id = $?', dto.request_id);
                if (dto.salesperson_id !== undefined)
                    add('salesperson_id = $?', dto.salesperson_id);
                if (dto.tour_id !== undefined)
                    add('tour_id = $?', dto.tour_id);
                if (dto.channel !== undefined)
                    add('channel = $?', dto.channel);
                if (dto.order_date !== undefined)
                    add('order_date = $?::date', dto.order_date);
                if (dto.delivery_date !== undefined)
                    add('delivery_date = $?::date', dto.delivery_date);
                if (dto.price_list_id !== undefined)
                    add('price_list_id = $?', dto.price_list_id);
                if (dto.settlement_term_id !== undefined)
                    add('settlement_term_id = $?', dto.settlement_term_id);
                if (dto.note !== undefined)
                    add('note = $?', dto.note);
                if (dto.client_uuid !== undefined)
                    add('client_uuid = $?', dto.client_uuid);
                // مبالغ همیشه از اقلام تازه محاسبه می‌شوند
                add('subtotal = $?', opts.totals.subtotal);
                add('discount_total = $?', opts.totals.discount_total);
                add('tax_total = $?', opts.totals.tax_total);
                add('grand_total = $?', opts.totals.grand_total);
                const owned = await client.query(`update sales_order set ${sets.join(', ')}
          where id = $1 and exists (
            select 1 from branch b where b.id = sales_order.branch_id and b.company_id = $2)
            and status = 'draft'
          returning id`, params);
                if (owned.rowCount === 0) {
                    await client.query('rollback');
                    return null;
                }
                if (dto.lines) {
                    await client.query('delete from sales_order_line where sales_order_id = $1', [id]);
                    await this.insertLines(client, id, opts.lines);
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
        /** تأیید: فقط از draft/pending_approval به approved */
        async approve(companyId, id) {
            const { rows } = await this.pool.query(`update sales_order set status = 'approved'
        where id = $1 and status in ('draft', 'pending_approval') and exists (
          select 1 from branch b where b.id = sales_order.branch_id and b.company_id = $2)
        returning id`, [id, companyId]);
            return rows[0]?.id ?? null;
        }
        async insertLines(client, orderId, lines) {
            for (const line of lines) {
                await client.query(`insert into sales_order_line
           (sales_order_id, line_no, product_id, packaging_id, qty, qty_base,
            unit_price, discount_amount, line_total)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`, [
                    orderId,
                    line.line_no,
                    line.product_id,
                    line.packaging_id,
                    line.qty,
                    line.qty_base,
                    line.unit_price,
                    line.discount_amount,
                    // line_total در DDL numeric(19,2) است (بدون tax در سطح قلم)
                    (Math.round((line.qty * Number(line.unit_price) - Number(line.discount_amount)) * 100) / 100).toFixed(2),
                ]);
            }
        }
    };
    return OrderRepository = _classThis;
})();
exports.OrderRepository = OrderRepository;
