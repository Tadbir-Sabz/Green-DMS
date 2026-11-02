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
exports.DevicesRepository = void 0;
const common_1 = require("@nestjs/common");
const COLUMNS = `id, app_user_id, device_uuid, platform, app_kind, app_version,
  os_version, push_token, is_trusted, last_seen_at, revoked_at, created_at`;
/**
 * cursor از `created_at|id` آخرین ردیف ساخته می‌شود (صفحه‌بندی keyset با ترتیب نزولی)
 */
const encodeCursor = (row) => Buffer.from(`${new Date(row.created_at).toISOString()}|${row.id}`, 'utf8').toString('base64url');
const decodeCursor = (cursor) => {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const at = raw.lastIndexOf('|');
    if (at <= 0)
        return null;
    const createdAt = raw.slice(0, at);
    const id = raw.slice(at + 1);
    if (Number.isNaN(Date.parse(createdAt)))
        return null;
    return { createdAt, id };
};
/**
 * دسترسی داده دستگاه‌های مجاز — SQL خام روی جدول `device` (بدون ORM، §۳.۲).
 * همه کوئری‌ها بر اساس app_user_id کاربرِ نشست‌اند؛ شناسه دستگاه از بیرون نمی‌آید
 * و به‌روزرسانی‌ها ستون‌های ثابت‌اند (مصون از injection).
 */
let DevicesRepository = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var DevicesRepository = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            DevicesRepository = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        pool;
        constructor(pool) {
            this.pool = pool;
        }
        /** دستگاه‌های کاربر، از تازه‌ترین به قدیمی‌ترین، با صفحه‌بندی keyset */
        async listByUser(userId, cursor, limit = 50) {
            const decoded = cursor ? decodeCursor(cursor) : null;
            const params = [userId, limit + 1];
            let where = 'where app_user_id = $1';
            if (decoded) {
                params.push(decoded.createdAt, decoded.id);
                where += ` and (created_at, id) < ($3::timestamptz, $4::uuid)`;
            }
            const { rows } = await this.pool.query(`select ${COLUMNS} from device ${where}
        order by created_at desc, id desc
        limit $2`, params);
            const hasMore = rows.length > limit;
            const items = hasMore ? rows.slice(0, limit) : rows;
            return { items, hasMore, nextCursor: hasMore && items.length > 0 ? encodeCursor(items[items.length - 1]) : null };
        }
        async findById(id) {
            const { rows } = await this.pool.query(`select ${COLUMNS} from device where id = $1`, [id]);
            return rows[0] ?? null;
        }
        /** دستگاهِ همین کاربر با همین شناسه سخت‌افزاری (ثبت تکراری / فعال‌سازی مجدد) */
        async findByUserAndUuid(userId, deviceUuid) {
            const { rows } = await this.pool.query(`select ${COLUMNS} from device where app_user_id = $1 and device_uuid = $2`, [userId, deviceUuid]);
            return rows[0] ?? null;
        }
        /** هر ردیفی با همین شناسه سخت‌افزاری — برای ردِ تخصیص به کاربر دیگر */
        async findByUuid(deviceUuid) {
            const { rows } = await this.pool.query(`select ${COLUMNS} from device where device_uuid = $1 limit 1`, [deviceUuid]);
            return rows[0] ?? null;
        }
        async insert(userId, input) {
            const { rows } = await this.pool.query(`insert into device (app_user_id, device_uuid, platform, app_kind, app_version, os_version, push_token)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning ${COLUMNS}`, [
                userId,
                input.deviceUuid,
                input.platform,
                input.appKind,
                input.appVersion ?? null,
                input.osVersion ?? null,
                input.pushToken ?? null,
            ]);
            return rows[0];
        }
        /** دستگاه باطل‌شدهٔ همان کاربر: دوباره فعال می‌شود (is_trusted تا تأیید مجدد false) */
        async reactivate(id, userId, input) {
            const { rows } = await this.pool.query(`update device
          set revoked_at = null, is_trusted = false, last_seen_at = null,
              platform = $3, app_kind = $4, app_version = $5, os_version = $6, push_token = $7
        where id = $1 and app_user_id = $2 and revoked_at is not null
        returning ${COLUMNS}`, [
                id,
                userId,
                input.platform,
                input.appKind,
                input.appVersion ?? null,
                input.osVersion ?? null,
                input.pushToken ?? null,
            ]);
            return rows[0] ?? null;
        }
        /** تأیید نهایی دستگاه با کد پیامکی (device_bind) + ثبت آخرین حضور */
        async markTrusted(id) {
            await this.pool.query(`update device set is_trusted = true, last_seen_at = now()
        where id = $1 and revoked_at is null`, [id]);
        }
        /** ابطال دستگاه همان کاربر؛ ردیف برای ممیزی می‌ماند */
        async revoke(id, userId) {
            const { rows } = await this.pool.query(`update device set revoked_at = now(), is_trusted = false, last_seen_at = now()
        where id = $1 and app_user_id = $2 and revoked_at is null
        returning ${COLUMNS}`, [id, userId]);
            return rows[0] ?? null;
        }
    };
    return DevicesRepository = _classThis;
})();
exports.DevicesRepository = DevicesRepository;
