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
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const jsonwebtoken_1 = require("jsonwebtoken");
const auth_config_1 = require("./auth.config");
const password_1 = require("./password");
const sms_sender_1 = require("./sms-sender");
const unauthorized = (code, message_fa) => new common_1.UnauthorizedException({ code, message_fa });
const badRequest = (code, message_fa) => new common_1.BadRequestException({ code, message_fa });
const locked = (message_fa) => 
// Nest استثنای 423 ندارد؛ با همان قرارداد Error (کد + پیام فارسی) صادر می‌شود
new common_1.HttpException({ code: 'account_locked', message_fa }, common_1.HttpStatus.LOCKED);
const rateLimited = (code, message_fa) => 
// 429 قرارداد: نرخ درخواست بیش از حد مجاز (TooManyRequests)
new common_1.HttpException({ code, message_fa }, common_1.HttpStatus.TOO_MANY_REQUESTS);
/**
 * سرویس احراز هویت — ورود با رمز، refresh چرخشی، خروج و نشست جاری.
 * قواعد: ضمیمه H (مدت نشست، قفل حساب) و openapi › /auth/*.
 */
let AuthService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var AuthService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            AuthService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        repo;
        sms;
        devices;
        constructor(repo, sms, devices) {
            this.repo = repo;
            this.sms = sms;
            this.devices = devices;
        }
        /**
         * نرخ‌گیری ورود (429 قرارداد): شمارش تلاش‌های اخیر هر (ip|username) در پنجرهٔ
         * دلخواه — جدا از قفل حساب (423) که فقط کاربرِ موجود را می‌بندد. حافظهٔ محلی
         * isolate است؛ برای چند نمونهٔ Worker باید شمارنده در دیتابیس بنشیند (آینده).
         */
        loginAttempts = new Map();
        /** ثبت تلاش ورود؛ رسیدن به سقف پنجره ← 429 قرارداد (login_rate_limited) */
        recordLoginAttempt(ip, username) {
            const cfg = (0, auth_config_1.getAuthConfig)();
            const now = Date.now();
            const windowMs = cfg.loginWindowMinutes * 60_000;
            const key = `${ip ?? '-'}|${username}`;
            const recent = (this.loginAttempts.get(key) ?? []).filter((t) => now - t < windowMs);
            if (recent.length >= cfg.loginMaxPerWindow) {
                this.loginAttempts.set(key, recent);
                throw rateLimited('login_rate_limited', `تلاش‌های ورود بیش از حد مجاز است؛ لطفاً ${cfg.loginWindowMinutes} دقیقه دیگر دوباره تلاش کنید.`);
            }
            recent.push(now);
            this.loginAttempts.set(key, recent);
            // پاک‌سازی تنبل کلیدهای بی‌رکورد تا حافظه رشد نکند (پنجره ۱۵ دقیقه است)
            if (this.loginAttempts.size > 10_000) {
                for (const [k, stamps] of this.loginAttempts) {
                    const alive = stamps.filter((t) => now - t < windowMs);
                    if (alive.length === 0)
                        this.loginAttempts.delete(k);
                    else
                        this.loginAttempts.set(k, alive);
                }
            }
        }
        // ---------------- ورود ----------------
        async login(dto, meta) {
            // سقف نرخ پیش از هر بررسی دیگر (429) — کلید ip|username تا بمبارانِ یک نام
            // از یک مبدأ مسدود شود بی‌آنکه نشست‌های مشروع مبدأهای دیگر آسیب ببینند
            this.recordLoginAttempt(meta.ip, dto.username);
            if (!dto.password) {
                throw unauthorized('password_required', 'ورود در این نسخه با رمز عبور است؛ ورود پیامکی (OTP) هنوز فعال نشده است.');
            }
            const user = await this.repo.findByUsername(dto.username);
            if (!user) {
                // صرف همان هزینه محاسباتی یک ورود واقعی تا زمان پاسخ، وجود/نبود کاربر را لو ندهد
                await (0, password_1.verifyPassword)(dto.password, await (0, password_1.dummyPasswordHash)());
                throw unauthorized('invalid_credentials', 'نام کاربری یا رمز عبور نادرست است.');
            }
            const cfg = (0, auth_config_1.getAuthConfig)();
            const lockedUntil = user.locked_until ? new Date(user.locked_until) : null;
            if (user.is_locked || (lockedUntil && lockedUntil > new Date())) {
                throw locked(`حساب به دلیل ${cfg.maxFailedAttempts} تلاش ناموفق متوالی قفل شد؛ ` +
                    `پس از ${cfg.lockMinutes} دقیقه یا با تأیید مدیر دوباره تلاش کنید.`);
            }
            const ok = await (0, password_1.verifyPassword)(dto.password, user.password_hash ?? (await (0, password_1.dummyPasswordHash)()));
            if (!ok) {
                const failure = await this.repo.recordLoginFailure(user.id, cfg.maxFailedAttempts, cfg.lockMinutes);
                if (failure.failedAttempts >= cfg.maxFailedAttempts) {
                    throw locked(`حساب پس از ${cfg.maxFailedAttempts} تلاش ناموفق قفل شد؛ ` +
                        `پس از ${cfg.lockMinutes} دقیقه دوباره تلاش کنید.`);
                }
                throw unauthorized('invalid_credentials', 'نام کاربری یا رمز عبور نادرست است.');
            }
            if (!user.is_active || !user.person_active) {
                throw unauthorized('account_disabled', 'حساب کاربری غیرفعال شده است؛ با مدیر سیستم تماس بگیرید.');
            }
            // last_login_at باید در پاسخ ورود منعکس شود؛ پس از ثبت، ردیف محلی را تازه می‌کنیم
            user.last_login_at = await this.repo.markLoginSuccess(user.id);
            const issued = await this.issueSession(user, meta);
            return issued.response;
        }
        // ---------------- ورود با کد پیامکی (OTP) ----------------
        /**
         * POST /auth/otp/request — کد یک‌بارمصرف برای نام کاربری.
         * پاسخ عمداً برای نامِ موجود و ناموجود یکسان و بی‌اثر است (202) تا وجود
         * حساب لو نرود (ضد-enumeration طبق توضیح خودِ قرارداد)؛ 429 فقط سقف نرخ است.
         * درگاه پیامک قابل‌تعویض است (SmsSender در DI)؛ شکست ارسال هم پاسخ را عوض نمی‌کند.
         */
        async requestOtp(dto) {
            const cfg = (0, auth_config_1.getAuthConfig)();
            const purpose = dto.purpose ?? 'login';
            // سقف پنجره‌ای: تعداد درخواست‌های اخیر همین کاربر/دلیل
            const windowStart = new Date(Date.now() - cfg.otpWindowMinutes * 60_000);
            const recent = await this.repo.countSince(dto.username, purpose, windowStart);
            if (recent >= cfg.otpMaxPerWindow) {
                throw rateLimited('otp_rate_limited', `درخواست کد بیش از حد مجاز است؛ لطفاً ${cfg.otpWindowMinutes} دقیقه دیگر دوباره تلاش کنید.`);
            }
            // فاصله حداقلی بین دو ارسال (جلوگیری از بمباران پیامک)
            const last = await this.repo.findLastSentAt(dto.username, purpose);
            if (last) {
                const waitMs = cfg.otpResendSeconds * 1000 - (Date.now() - new Date(last).getTime());
                if (waitMs > 0) {
                    throw rateLimited('otp_resend_too_fast', `کد اخیراً ارسال شده است؛ ${Math.ceil(waitMs / 1000)} ثانیه دیگر دوباره درخواست دهید.`);
                }
            }
            // ناشناخته یا بدون شماره: 202 بی‌اثر، بدون ارسال و بدون ردیف (همان پاسخِ کاربر معتبر)
            const phone = await this.repo.findPrimaryPhone(dto.username);
            if (!phone) {
                console.warn(`[auth] درخواست OTP برای «${dto.username}» شماره معتبر نداشت؛ ارسالی انجام نشد.`);
                return;
            }
            const code = String((0, node_crypto_1.randomInt)(0, 10 ** cfg.otpLength)).padStart(cfg.otpLength, '0');
            await this.repo.insertOtp({
                username: dto.username,
                phone,
                purpose,
                codeHash: await (0, password_1.hashPassword)(code),
                ttlSeconds: cfg.otpTtlSeconds,
            });
            try {
                await this.sms.send({
                    to: phone,
                    username: dto.username,
                    purpose,
                    // متن فارسی استاندارد از قالب SMS_TEXT_TEMPLATE (پیش‌فرض: DEFAULT_SMS_TEMPLATE)
                    body: (0, sms_sender_1.renderOtpBody)({ code, ttlSeconds: cfg.otpTtlSeconds, purpose }),
                });
            }
            catch (err) {
                // شکست درگاه نباید وضعیت حساب را لو دهد؛ فقط در سرور ثبت می‌شود
                console.error(`[auth] ارسال پیامک OTP برای «${dto.username}» ناموفق: ${err.message}`);
            }
        }
        /**
         * POST /auth/otp/verify — تأیید کد و صدور نشست (مثل login).
         * قواعد: مهلت کوتاه (expires_at)، سقف تلاش ناموفق (429 و سوختن کد)،
         * مصرف اتمیک (یک‌بارمصرف واقعی) و همان بررسی‌های قفل/غیرفعالیِ ورود با رمز.
         * اگر device_id آمده باشد دستگاه پیش از مصرف کد بررسی می‌شود (device_bind):
         * نامعتبر بودن آن 400/403 می‌دهد و کدِ درست نمی‌سوزد.
         */
        async verifyOtp(dto, meta) {
            const cfg = (0, auth_config_1.getAuthConfig)();
            const pending = await this.repo.findPendingOtp(dto.username);
            if (!pending) {
                // همان هزینه محاسباتی یک تأیید واقعی تا پایان پاسخ، تا وجود/نبود کد لو نرود
                await (0, password_1.verifyPassword)(dto.code, await (0, password_1.dummyPasswordHash)());
                throw unauthorized('otp_invalid', 'کد واردشده نادرست یا منقضی شده است؛ دوباره درخواست دهید.');
            }
            if (new Date(pending.expires_at) <= new Date()) {
                throw unauthorized('otp_expired', 'کد منقضی شده است؛ کد تازه درخواست کنید.');
            }
            if (pending.attempts >= cfg.otpMaxAttempts) {
                throw rateLimited('otp_attempts_exceeded', 'تلاش‌ها بیش از حد مجاز بود؛ کد جدید درخواست کنید.');
            }
            const ok = await (0, password_1.verifyPassword)(dto.code, pending.code_hash);
            if (!ok) {
                const attempts = await this.repo.addOtpAttempt(pending.id);
                if (attempts >= cfg.otpMaxAttempts) {
                    throw rateLimited('otp_attempts_exceeded', `پس از ${cfg.otpMaxAttempts} تلاش ناموفق کد سوخت؛ کد جدید درخواست کنید.`);
                }
                throw unauthorized('otp_invalid', 'کد واردشده نادرست است.');
            }
            // کاربر، قفل/غیرفعالی و دستگاه پیش از مصرف کد بررسی می‌شوند تا کدِ درست
            // با حساب یا دستگاهِ نامعتبر نسوزد (کاربر می‌تواند همان کد را دوباره بفرستد)
            const user = await this.repo.findByUsername(dto.username);
            if (!user || !user.is_active || !user.person_active) {
                throw unauthorized('account_disabled', 'حساب کاربری یافت نشد یا غیرفعال است.');
            }
            const lockedUntil = user.locked_until ? new Date(user.locked_until) : null;
            if (user.is_locked || (lockedUntil && lockedUntil > new Date())) {
                throw locked('حساب کاربری قفل است؛ برای ادامه با مدیر تماس بخواهید.');
            }
            if (dto.device_id) {
                // device_bind: کد باید با همین دلیل صادر شده باشد؛ وگرنه کدِ ورودِ معمولی
                // نمی‌تواند دستگاهی را مجاز کند (هدف دلیل purpose در قرارداد)
                if (pending.purpose !== 'device_bind') {
                    throw badRequest('device_bind_purpose', 'برای اتصال دستگاه باید کد را با دلیل device_bind درخواست دهید.');
                }
                await this.devices.assertBindable(user.id, dto.device_id);
            }
            // مصرف اتمیک: همان کد فقط یک بار نشست صادر می‌کند (تقابل هم‌زمان → 401)
            if (!(await this.repo.consumeOtp(pending.id))) {
                throw unauthorized('otp_consumed', 'این کد قبلاً استفاده شده است؛ کد تازه درخواست کنید.');
            }
            // device_bind: با تأیید موفق کد، دستگاه مجاز (is_trusted) و حاضر ثبت می‌شود
            if (dto.device_id)
                await this.devices.markBound(dto.device_id);
            user.last_login_at = await this.repo.markLoginSuccess(user.id);
            const issued = await this.issueSession(user, {
                ...meta,
                deviceId: dto.device_id ?? meta.deviceId ?? null,
            });
            return issued.response;
        }
        /**
         * POST /auth/password-reset — بازیابی رمز عبور با کدِ دلیل password_reset.
         * قواعد کد دقیقاً مثل verifyOtp است (مهلت کوتاه، سقف تلاش، مصرف اتمیک و
         * ضد-enumeration) با این تفاوت که نشست صادر نمی‌شود: کدِ مصرف‌شده رمز را عوض
         * می‌کند و همه نشست‌های باز کاربر با revoked_reason=password_reset بسته می‌شود.
         * قفلِ دستیِ مدیر (is_locked) مانع بازیابی می‌شود؛ قفلِ زمانیِ تلاش‌های ناموفق
         * با موفقیت همین عملیات پاک می‌شود چون کاربر دلیلِ فراموشی رمزش را ثابت کرده است.
         */
        async resetPassword(dto) {
            const cfg = (0, auth_config_1.getAuthConfig)();
            const pending = await this.repo.findPendingOtp(dto.username);
            if (!pending) {
                // همان هزینه محاسباتی یک تأیید واقعی تا پایان پاسخ، تا وجود/نبود کد لو نرود
                await (0, password_1.verifyPassword)(dto.code, await (0, password_1.dummyPasswordHash)());
                throw unauthorized('otp_invalid', 'کد واردشده نادرست یا منقضی شده است؛ دوباره درخواست دهید.');
            }
            if (pending.purpose !== 'password_reset') {
                // کدِ ورود/اتصال دستگاه نمی‌تواند رمز را عوض کند — پاسخ 401 تا با بقیه
                // خطاهای کد یکی باشد و وجود حساب لو نرود
                throw unauthorized('otp_wrong_purpose', 'این کد برای بازیابی رمز صادر نشده است؛ کد تازه با دلیل password_reset درخواست کنید.');
            }
            if (new Date(pending.expires_at) <= new Date()) {
                throw unauthorized('otp_expired', 'کد منقضی شده است؛ کد تازه درخواست کنید.');
            }
            if (pending.attempts >= cfg.otpMaxAttempts) {
                throw rateLimited('otp_attempts_exceeded', `پس از ${cfg.otpMaxAttempts} تلاش ناموفق کد سوخت؛ کد جدید درخواست کنید.`);
            }
            const ok = await (0, password_1.verifyPassword)(dto.code, pending.code_hash);
            if (!ok) {
                const attempts = await this.repo.addOtpAttempt(pending.id);
                if (attempts >= cfg.otpMaxAttempts) {
                    throw rateLimited('otp_attempts_exceeded', `پس از ${cfg.otpMaxAttempts} تلاش ناموفق کد سوخت؛ کد جدید درخواست کنید.`);
                }
                throw unauthorized('otp_invalid', 'کد واردشده نادرست است.');
            }
            const user = await this.repo.findByUsername(dto.username);
            if (!user || !user.is_active || !user.person_active) {
                throw unauthorized('account_disabled', 'حساب کاربری یافت نشد یا غیرفعال است.');
            }
            if (user.is_locked) {
                // قفل دستیِ مدیر فقط با تأیید مدیر باز می‌شود؛ بازیابی خودکار آن را دور نمی‌زند
                throw locked('حساب کاربری قفل است؛ برای ادامه با مدیر تماس بخواهید.');
            }
            // مصرف اتمیک: همان کد فقط یک بار رمز را عوض می‌کند (تقابل هم‌زمان → 401)
            if (!(await this.repo.consumeOtp(pending.id))) {
                throw unauthorized('otp_consumed', 'این کد قبلاً استفاده شده است؛ کد تازه درخواست کنید.');
            }
            await this.repo.setPassword(user.id, await (0, password_1.hashPassword)(dto.new_password));
            // همه نشست‌های باز (دستگاه‌های دیگر) باطل می‌شوند؛ دلیل قابل تفکیک برای ممیزی
            await this.repo.revokeAllForUser(user.id, 'password_reset');
        }
        // ---------------- تازه‌سازی (چرخش refresh) ----------------
        async refresh(refreshToken, meta) {
            const session = await this.repo.findSessionByRefreshHash((0, password_1.sha256Hex)(refreshToken));
            if (!session) {
                throw unauthorized('invalid_refresh_token', 'نشست معتبر نیست؛ دوباره وارد شوید.');
            }
            if (session.revoked_at) {
                if (session.revoked_reason === 'rotated') {
                    // استفاده مجدد از توکنِ قبلاً چرخش‌شده ← نشانه سرقت احتمالی: همه نشست‌ها باطل می‌شوند
                    await this.repo.revokeAllForUser(session.app_user_id, 'reuse_detected');
                    throw unauthorized('refresh_reused', 'توکن تازه‌سازی قبلاً استفاده شده بود؛ برای امنیت، همه نشست‌های شما باطل شد. دوباره وارد شوید.');
                }
                throw unauthorized('invalid_refresh_token', 'نشست باطل شده است؛ دوباره وارد شوید.');
            }
            if (new Date(session.expires_at) <= new Date()) {
                throw unauthorized('refresh_expired', 'نشست منقضی شده است؛ دوباره وارد شوید.');
            }
            const user = await this.repo.findUserById(session.app_user_id);
            if (!user)
                throw unauthorized('invalid_refresh_token', 'نشست معتبر نیست؛ دوباره وارد شوید.');
            if (!user.is_active || !user.person_active) {
                throw unauthorized('account_disabled', 'حساب کاربری غیرفعال شده است؛ با مدیر سیستم تماس بگیرید.');
            }
            const cfg = (0, auth_config_1.getAuthConfig)();
            const lockedUntil = user.locked_until ? new Date(user.locked_until) : null;
            if (user.is_locked || (lockedUntil && lockedUntil > new Date())) {
                throw locked('حساب کاربری قفل است؛ برای ادامه با مدیر تماس بگیرید.');
            }
            const issued = await this.issueSession(user, {
                ...meta,
                deviceId: meta.deviceId ?? session.device_id,
            });
            // بستن نشست قبلی پس از صدور موفق نشست تازه (زنجیره rotated_to)
            await this.repo.rotateSession(session.id, issued.sessionId);
            return issued.response;
        }
        // ---------------- خروج و نشست جاری ----------------
        async logout(sessionId) {
            await this.repo.revokeSession(sessionId, 'logout');
        }
        async me(userId) {
            const user = await this.repo.findUserById(userId);
            if (!user || !user.is_active || !user.person_active) {
                throw unauthorized('account_disabled', 'حساب کاربری یافت نشد یا غیرفعال است.');
            }
            const summary = await this.repo.getRolesAndPermissions(userId);
            return {
                user: this.toUserResponse(user, summary),
                roles: summary.roles.map((r) => r.code),
                permissions: summary.permissions,
            };
        }
        // ---------------- صدور نشست ----------------
        async issueSession(user, meta) {
            const cfg = (0, auth_config_1.getAuthConfig)();
            const refreshToken = generateRefreshToken();
            const expiresAt = new Date(Date.now() + cfg.refreshTtlSeconds * 1000);
            const sessionId = await this.repo.createSession({
                appUserId: user.id,
                refreshTokenHash: (0, password_1.sha256Hex)(refreshToken),
                deviceId: meta.deviceId ?? null,
                ip: meta.ip ?? null,
                userAgent: meta.userAgent ?? null,
                expiresAt,
            });
            const payload = {
                sub: user.id,
                sid: sessionId,
                cid: user.company_id,
                usr: user.username,
                typ: 'access',
            };
            const options = { algorithm: 'HS256', expiresIn: cfg.accessTtlSeconds };
            const accessToken = (0, jsonwebtoken_1.sign)(payload, cfg.secret, options);
            const summary = await this.repo.getRolesAndPermissions(user.id);
            return {
                sessionId,
                response: {
                    access_token: accessToken,
                    refresh_token: refreshToken,
                    expires_in: cfg.accessTtlSeconds,
                    user: this.toUserResponse(user, summary),
                },
            };
        }
        toUserResponse(user, summary) {
            return {
                id: user.id,
                username: user.username,
                staff_id: user.staff_id,
                role_ids: summary.roles.map((r) => r.id),
                is_active: user.is_active && user.person_active,
                locked_until: user.locked_until,
                last_login_at: user.last_login_at,
                created_at: user.created_at,
            };
        }
    };
    return AuthService = _classThis;
})();
exports.AuthService = AuthService;
/** refresh token: ۴۸ بایت تصادفی (بدون قابلیت حدس‌زدن) */
const generateRefreshToken = () => (0, node_crypto_1.randomBytes)(48).toString('base64url');
