"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAuthConfig = exports.parseTtl = void 0;
const node_crypto_1 = require("node:crypto");
const TTL_RE = /^(\d+)(s|m|h|d)$/;
const UNIT_SECONDS = { s: 1, m: 60, h: 3600, d: 86400 };
const parseTtl = (value, fallbackSeconds) => {
    const m = TTL_RE.exec(value.trim());
    if (!m)
        return fallbackSeconds;
    return Number(m[1]) * UNIT_SECONDS[m[2]];
};
exports.parseTtl = parseTtl;
let cached = null;
/**
 * خواندن تنظیمات به‌صورت تنبل (lazy) — چون dotenv در main.ts پس از import ماژول‌ها
 * اجرا می‌شود، نباید در سطح ماژول از env خواند.
 */
const getAuthConfig = () => {
    if (cached)
        return cached;
    let secret = process.env.JWT_SECRET;
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            throw new Error('JWT_SECRET در محیط production تنظیم نیست؛ صدور توکن ممکن نیست.');
        }
        secret = (0, node_crypto_1.randomBytes)(32).toString('hex');
        console.warn('[auth] JWT_SECRET تنظیم نیست؛ برای توسعه کلید تصادفی موقت ساخته شد (با هر راه‌اندازی عوض می‌شود).');
    }
    cached = {
        secret,
        accessTtlSeconds: (0, exports.parseTtl)(process.env.JWT_ACCESS_TTL ?? '15m', 900),
        refreshTtlSeconds: (0, exports.parseTtl)(process.env.JWT_REFRESH_TTL ?? '7d', 7 * 86400),
        maxFailedAttempts: Number(process.env.AUTH_MAX_FAILED_ATTEMPTS ?? 5),
        lockMinutes: Number(process.env.AUTH_LOCK_MINUTES ?? 15),
        otpTtlSeconds: Number(process.env.OTP_TTL_SECONDS ?? 120),
        otpResendSeconds: Number(process.env.OTP_RESEND_SECONDS ?? 60),
        otpWindowMinutes: Number(process.env.OTP_WINDOW_MINUTES ?? 15),
        otpMaxPerWindow: Number(process.env.OTP_MAX_PER_WINDOW ?? 5),
        otpMaxAttempts: Number(process.env.OTP_MAX_ATTEMPTS ?? 5),
        loginMaxPerWindow: Number(process.env.LOGIN_MAX_PER_WINDOW ?? 10),
        loginWindowMinutes: Number(process.env.LOGIN_WINDOW_MINUTES ?? 15),
        otpLength: Math.min(8, Math.max(4, Number(process.env.OTP_LENGTH ?? 6))),
    };
    return cached;
};
exports.getAuthConfig = getAuthConfig;
