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
exports.PricingRepository = void 0;
const common_1 = require("@nestjs/common");
const encodeCursor = (v) => Buffer.from(v, 'utf8').toString('base64url');
const decodeCursor = (c) => Buffer.from(c, 'base64url').toString('utf8');
/** ساخت بازهٔ تاریخ از پارامترهای nullable (بدون injection — همه پارامتری) */
const RANGE = `daterange(coalesce($%d::date, current_date), $%d::date)`;
let PricingRepository = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var PricingRepository = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            PricingRepository = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        pool;
        constructor(pool) {
            this.pool = pool;
        }
        // ---------------- لیست قیمت ----------------
        async listPriceLists(companyId, query) {
            const limit = query.limit ?? 50;
            const params = [companyId];
            const where = ['company_id = $1'];
            if (query.cursor) {
                params.push(decodeCursor(query.cursor));
                where.push(`code > $${params.length}`);
            }
            params.push(limit + 1);
            const { rows } = await this.pool.query(`select id, code, title, kind, currency, is_active from price_list
        where ${where.join(' and ')}
        order by code
        limit $${params.length}`, params);
            const hasMore = rows.length > limit;
            const page = hasMore ? rows.slice(0, limit) : rows;
            const last = page[page.length - 1];
            return { items: page, hasMore, nextCursor: hasMore && last ? encodeCursor(last.code) : null };
        }
        async findPriceList(companyId, id) {
            const { rows } = await this.pool.query(`select id, code, title, kind, currency, is_active from price_list
        where id = $1 and company_id = $2`, [id, companyId]);
            return rows[0] ?? null;
        }
        async findPriceListItems(priceListId) {
            const { rows } = await this.pool.query(`select product_id, price::text as price,
              lower(valid)::text as valid_from,
              upper(valid)::text as valid_to
         from price_list_item
        where price_list_id = $1
        order by product_id`, [priceListId]);
            return rows;
        }
        async insertPriceList(companyId, dto) {
            const client = await this.pool.connect();
            try {
                await client.query('begin');
                const header = await client.query(`insert into price_list (company_id, code, title, kind, currency, is_active)
         values ($1, $2, $3, coalesce($4,'general'), coalesce($5,'IRR'), coalesce($6,true))
         returning id`, [companyId, dto.code, dto.title, dto.kind ?? null, dto.currency ?? null, dto.is_active ?? null]);
                const id = header.rows[0].id;
                for (const item of dto.items ?? []) {
                    await this.insertItem(client, id, item);
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
        async updatePriceList(companyId, id, dto) {
            const client = await this.pool.connect();
            try {
                await client.query('begin');
                const owned = await client.query(`update price_list set
           code = coalesce($3, code),
           title = coalesce($4, title),
           kind = coalesce($5, kind),
           currency = coalesce($6, currency),
           is_active = coalesce($7, is_active)
         where id = $1 and company_id = $2
         returning id`, [id, companyId, dto.code ?? null, dto.title ?? null, dto.kind ?? null, dto.currency ?? null, dto.is_active ?? null]);
                if (owned.rowCount === 0) {
                    await client.query('rollback');
                    return null;
                }
                if (dto.items) {
                    await client.query(`delete from price_list_item where price_list_id = $1`, [id]);
                    for (const item of dto.items) {
                        await this.insertItem(client, id, item);
                    }
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
        async insertItem(client, priceListId, item) {
            await client.query(`insert into price_list_item (price_list_id, product_id, price, min_qty, valid)
       values ($1, $2, $3, 0, ${RANGE.replace('%d', '4').replace('%d', '5')})`, [priceListId, item.product_id, item.price, item.valid_from ?? null, item.valid_to ?? null]);
        }
        async productExists(companyId, productId) {
            const { rows } = await this.pool.query(`select 1 from product where id = $1 and company_id = $2`, [productId, companyId]);
            return rows.length > 0;
        }
        // ---------------- تشویق ----------------
        async listPromotions(companyId, query) {
            const limit = query.limit ?? 50;
            const params = [companyId];
            const where = ['company_id = $1'];
            if (query.is_active !== undefined) {
                params.push(query.is_active);
                where.push(`is_active = $${params.length}`);
            }
            if (query.cursor) {
                params.push(decodeCursor(query.cursor));
                where.push(`code > $${params.length}`);
            }
            params.push(limit + 1);
            const { rows } = await this.pool.query(`select id, code, title, kind,
              lower(valid)::text as valid_from,
              upper(valid)::text as valid_to,
              priority, allow_stacking,
              max_discount_amount::text as max_discount_amount,
              max_per_customer_per_day::text as max_per_customer_per_day,
              conditions, benefit, is_active
         from promotion
        where ${where.join(' and ')}
        order by code
        limit $${params.length}`, params);
            const hasMore = rows.length > limit;
            const page = hasMore ? rows.slice(0, limit) : rows;
            const last = page[page.length - 1];
            return { items: page, hasMore, nextCursor: hasMore && last ? encodeCursor(last.code) : null };
        }
        async findPromotion(companyId, id) {
            const { rows } = await this.pool.query(`select id, code, title, kind,
              lower(valid)::text as valid_from,
              upper(valid)::text as valid_to,
              priority, allow_stacking,
              max_discount_amount::text as max_discount_amount,
              max_per_customer_per_day::text as max_per_customer_per_day,
              conditions, benefit, is_active
         from promotion
        where id = $1 and company_id = $2`, [id, companyId]);
            return rows[0] ?? null;
        }
        async insertPromotion(companyId, dto) {
            const { rows } = await this.pool.query(`insert into promotion
         (company_id, code, title, kind, valid, priority, allow_stacking,
          max_discount_amount, max_per_customer_per_day, conditions, benefit, is_active)
       values ($1, $2, $3, $4,
               ${RANGE.replace('%d', '5').replace('%d', '6')},
               coalesce($7,100), coalesce($8,false), $9, $10,
               coalesce($11::jsonb,'{}'::jsonb), coalesce($12::jsonb,'{}'::jsonb), coalesce($13,true))
       returning id`, [
                companyId,
                dto.code,
                dto.title,
                dto.kind,
                dto.valid_from ?? null,
                dto.valid_to ?? null,
                dto.priority ?? null,
                dto.allow_stacking ?? null,
                dto.max_discount_amount ?? null,
                dto.max_per_customer_per_day ?? null,
                JSON.stringify(dto.conditions ?? {}),
                JSON.stringify(dto.benefit ?? {}),
                dto.is_active ?? null,
            ]);
            return rows[0].id;
        }
        async updatePromotion(companyId, id, dto) {
            const sets = [];
            const params = [id, companyId];
            const add = (fragment, value) => {
                params.push(value);
                sets.push(fragment.replace('$?', `$${params.length}`));
            };
            if (dto.code !== undefined)
                add('code = $?', dto.code);
            if (dto.title !== undefined)
                add('title = $?', dto.title);
            if (dto.kind !== undefined)
                add('kind = $?', dto.kind);
            if (dto.valid_from !== undefined || dto.valid_to !== undefined) {
                params.push(dto.valid_from ?? null, dto.valid_to ?? null);
                const n = params.length;
                sets.push(`valid = daterange(coalesce(${n - 1}::date, lower(valid)), coalesce(${n}::date, upper(valid)))`);
            }
            if (dto.priority !== undefined)
                add('priority = $?', dto.priority);
            if (dto.allow_stacking !== undefined)
                add('allow_stacking = $?', dto.allow_stacking);
            if (dto.max_discount_amount !== undefined)
                add('max_discount_amount = $?', dto.max_discount_amount);
            if (dto.max_per_customer_per_day !== undefined)
                add('max_per_customer_per_day = $?', dto.max_per_customer_per_day);
            if (dto.conditions !== undefined)
                add(`conditions = $?::jsonb`, JSON.stringify(dto.conditions));
            if (dto.benefit !== undefined)
                add(`benefit = $?::jsonb`, JSON.stringify(dto.benefit));
            if (dto.is_active !== undefined)
                add('is_active = $?', dto.is_active);
            if (sets.length === 0)
                return id;
            const { rows } = await this.pool.query(`update promotion set ${sets.join(', ')} where id = $1 and company_id = $2 returning id`, params);
            return rows[0]?.id ?? null;
        }
    };
    return PricingRepository = _classThis;
})();
exports.PricingRepository = PricingRepository;
