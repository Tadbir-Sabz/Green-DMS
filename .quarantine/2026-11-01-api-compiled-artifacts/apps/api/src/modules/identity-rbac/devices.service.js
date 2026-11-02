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
exports.DevicesService = void 0;
const common_1 = require("@nestjs/common");
const class_validator_1 = require("class-validator");
/** پیام‌های قرارداد Error برای خطاهای دامنه دستگاه‌های مجاز */
const invalidId = () => new common_1.BadRequestException({ code: 'invalid_id', message_fa: 'شناسه دستگاه معتبر نیست.' });
const notFound = () => new common_1.NotFoundException({ code: 'device_not_found', message_fa: 'دستگاه یافت نشد.' });
const deviceExists = () => new common_1.ConflictException({
    code: 'device_exists',
    message_fa: 'این دستگاه قبلاً ثبت شده است؛ برای ابطال از فهرست دستگاه‌ها اقدام کنید.',
});
const deviceTaken = () => new common_1.ConflictException({
    code: 'device_taken',
    message_fa: 'این شناسه دستگاه به کاربر دیگری ثبت شده است؛ از دستگاه خودتان استفاده کنید.',
});
const notRegistered = () => new common_1.BadRequestException({
    code: 'device_not_registered',
    message_fa: 'این دستگاه هنوز ثبت نشده است؛ پیش از ورود، دستگاه را ثبت کنید.',
});
const deviceRevoked = () => new common_1.ForbiddenException({
    code: 'device_revoked',
    message_fa: 'این دستگاه باطل شده است؛ برای فعال‌سازی مجدد با مدیر سیستم تماس بگیرید.',
});
const notOwned = () => new common_1.ForbiddenException({
    code: 'device_not_owned',
    message_fa: 'این دستگاه به کاربر دیگری تعلق دارد.',
});
const toInput = (dto) => ({
    deviceUuid: dto.device_uuid,
    platform: dto.platform,
    appKind: dto.app_kind,
    appVersion: dto.app_version ?? null,
    osVersion: dto.os_version ?? null,
    pushToken: dto.push_token ?? null,
});
/**
 * سرویس دستگاه‌های مجاز — openapi › /devices و منطق device_bind در /auth/otp/verify.
 * قواعد:
 * - هر دستگاه فقط برای کاربرِ نشست قابل دیدن/ابطال است (درز بین کاربران ندارد)
 * - ثبت، دستگاه را is_trusted=false می‌سازد؛ تأیید با کد پیامکی آن را مجاز می‌کند
 * - ابطال، نشست‌های فعال همان دستگاه را هم با revoked_reason=device_revoked می‌بندد
 *   (مهاجرت 0025) تا گوشی سرقتی بلافاصله از سیستم بیرون برود
 */
let DevicesService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var DevicesService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            DevicesService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        repo;
        authRepo;
        constructor(repo, authRepo) {
            this.repo = repo;
            this.authRepo = authRepo;
        }
        async list(userId, query) {
            const { items, nextCursor, hasMore } = await this.repo.listByUser(userId, query.cursor, query.limit);
            return { items, next_cursor: nextCursor, has_more: hasMore };
        }
        async create(userId, dto) {
            const mine = await this.repo.findByUserAndUuid(userId, dto.device_uuid);
            if (mine) {
                // دستگاه باطل‌شدهٔ خودِ کاربر دوباره فعال می‌شود (نسخه تازه اپ/نصح مجدد)
                if (mine.revoked_at) {
                    const revived = await this.repo.reactivate(mine.id, userId, toInput(dto));
                    if (revived)
                        return revived;
                    // همزمانی: ردیف هم‌زمان توسط درخواست دیگری فعال شد؛ همان را برمی‌گردانیم
                    const current = await this.repo.findById(mine.id);
                    if (current)
                        return current;
                }
                throw deviceExists();
            }
            const taken = await this.repo.findByUuid(dto.device_uuid);
            if (taken)
                throw deviceTaken();
            try {
                return await this.repo.insert(userId, toInput(dto));
            }
            catch (err) {
                // uq_device: ثبت هم‌زمان دو درخواست — برنده ردیف را می‌خواند و بازنده 409 می‌گیرد
                if (err.code === '23505') {
                    const again = await this.repo.findByUserAndUuid(userId, dto.device_uuid);
                    if (again)
                        throw deviceExists();
                    throw deviceTaken();
                }
                throw err;
            }
        }
        async remove(userId, id) {
            if (!(0, class_validator_1.isUUID)(id, '4'))
                throw invalidId();
            const device = await this.repo.findById(id);
            // 404 برای دستگاهِ دیگری هم همان است تا وجود دستگاه‌های بقیه لو نرود
            if (!device || device.app_user_id !== userId)
                throw notFound();
            await this.repo.revoke(id, userId);
            // ابطال از راه دور: نشست‌های باز روی همین دستگاه هم بسته می‌شوند (0025)
            await this.authRepo.revokeSessionsForDevice(id);
        }
        // ---------------- اتصال دستگاه در /auth/otp/verify (device_bind) ----------------
        /**
         * اعتبارسنجی دستگاهِ ارسال‌شده در verify، پیش از مصرف کد:
         * کدِ درست با دستگاهِ نامعتبر نمی‌سوزد و کاربر می‌تواند همان کد را دوباره بفرستد.
         */
        async assertBindable(userId, deviceId) {
            if (!(0, class_validator_1.isUUID)(deviceId, '4'))
                throw notRegistered();
            const device = await this.repo.findById(deviceId);
            if (!device)
                throw notRegistered();
            if (device.app_user_id !== userId)
                throw notOwned();
            if (device.revoked_at)
                throw deviceRevoked();
        }
        /** پس از مصرف موفق کد: دستگاه مجاز و حاضر ثبت می‌شود */
        async markBound(deviceId) {
            await this.repo.markTrusted(deviceId);
        }
    };
    return DevicesService = _classThis;
})();
exports.DevicesService = DevicesService;
