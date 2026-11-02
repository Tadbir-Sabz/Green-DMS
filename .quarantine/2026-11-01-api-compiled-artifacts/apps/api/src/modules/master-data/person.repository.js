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
exports.PersonRepository = void 0;
const common_1 = require("@nestjs/common");
/**
 * ستون‌های پاسخ — دقیقاً مطابق اسکیمای Person در openapi.yaml
 * (id/created_at فقط‌خواندنی‌اند؛ deleted_at/row_version داخل قرارداد نیستند
 *  پس هرگز در پاسخ برنمی‌گردند.)
 */
const COLUMNS = `
  id, code, legal_type, first_name, last_name, legal_name,
  national_id, economic_code, is_active, created_at`;
/** ستون‌های قابل نوشتن در UPDATE — هرگز نام ستون از بیرون نمی‌آید (مصون از injection) */
const UPDATABLE = [
    'code',
    'legal_type',
    'first_name',
    'last_name',
    'legal_name',
    'national_id',
    'economic_code',
    'is_active',
];
const encodeCursor = (code) => Buffer.from(code, 'utf8').toString('base64url');
const decodeCursor = (cursor) => Buffer.from(cursor, 'base64url').toString('utf8');
/**
 * دسترسی داده اشخاص — SQL خام روی جدول `person` (بدون ORM، طبق §۳.۲ سند).
 * همه کوئری‌ها company_id نشست را شرط می‌کنند (درز چندشرکتی ندارد) و حذف نرم
 * (deleted_at) رد می‌شود؛ به‌روزرسانی‌ها row_version/updated_at را تریگر trg_touch
 * (مهاجرت 0020) بالا می‌برد.
 */
let PersonRepository = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var PersonRepository = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            PersonRepository = _classThis = _classDescriptor.value;
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
                where.push(`(code ilike $${params.length}
                or legal_name ilike $${params.length}
                or (coalesce(first_name, '') || ' ' || coalesce(last_name, '')) ilike $${params.length}
                or national_id ilike $${params.length})`);
            }
            if (query.legal_type) {
                params.push(query.legal_type);
                where.push(`legal_type = $${params.length}`);
            }
            if (query.cursor) {
                params.push(decodeCursor(query.cursor));
                where.push(`code > $${params.length}`);
            }
            params.push(limit + 1);
            const { rows } = await this.pool.query(`select ${COLUMNS} from person
        where ${where.join(' and ')}
        order by code
        limit $${params.length}`, params);
            const hasMore = rows.length > limit;
            const items = hasMore ? rows.slice(0, limit) : rows;
            const last = items[items.length - 1];
            return { items, hasMore, nextCursor: hasMore && last ? encodeCursor(last.code) : null };
        }
        async findById(companyId, id) {
            const { rows } = await this.pool.query(`select ${COLUMNS} from person
        where id = $1 and company_id = $2 and deleted_at is null`, [id, companyId]);
            return rows[0] ?? null;
        }
        /** آیا این کد/شناسه ملی پیش‌تر برای همین شرکت ثبت شده؟ (برای پیام 409 روشن) */
        async codeExists(companyId, code, exceptId) {
            const { rows } = await this.pool.query(`select 1 from person
        where company_id = $1 and code = $2 and deleted_at is null
          and ($3::uuid is null or id <> $3::uuid)`, [companyId, code, exceptId ?? null]);
            return rows.length > 0;
        }
        async insert(companyId, dto) {
            const { rows } = await this.pool.query(`insert into person (company_id, code, legal_type,
                           first_name, last_name, legal_name,
                           national_id, economic_code, is_active)
       values ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9, true))
       returning ${COLUMNS}`, [
                companyId,
                dto.code,
                dto.legal_type,
                dto.first_name ?? null,
                dto.last_name ?? null,
                dto.legal_name ?? null,
                dto.national_id ?? null,
                dto.economic_code ?? null,
                dto.is_active,
            ]);
            return rows[0];
        }
        async update(companyId, id, dto) {
            const sets = [];
            const params = [id, companyId];
            const add = (fragment, value) => {
                params.push(value);
                sets.push(fragment.replace('$?', `$${params.length}`));
            };
            for (const col of UPDATABLE) {
                const value = dto[col];
                if (value !== undefined)
                    add(`${col} = $?`, value);
            }
            if (sets.length === 0)
                return this.findById(companyId, id);
            const { rows } = await this.pool.query(`update person set ${sets.join(', ')}
        where id = $1
          and company_id = $2
          and deleted_at is null
        returning ${COLUMNS}`, params);
            return rows[0] ?? null;
        }
    };
    return PersonRepository = _classThis;
})();
exports.PersonRepository = PersonRepository;
