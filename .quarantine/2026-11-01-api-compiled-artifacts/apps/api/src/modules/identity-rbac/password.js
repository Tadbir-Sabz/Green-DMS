"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sha256Hex = exports.dummyPasswordHash = exports.verifyPassword = exports.hashPassword = void 0;
const node_crypto_1 = require("node:crypto");
const node_util_1 = require("node:util");
/**
 * هش رمز عبور با scrypt (KDF استاندارد کتابخانه استاندارد Node) —
 * قالب ذخیره‌شده: scrypt$N$r$p$salt_base64$key_base64
 * انتخاب scrypt به‌جای bcrypt: بدون وابستگی native (سازگار با ویندوز/CI) و مقاوم در برابر GPU.
 */
const scrypt = (0, node_util_1.promisify)(node_crypto_1.scrypt);
const N = 16384;
const R = 8;
const P = 1;
const KEY_LEN = 64;
const hashPassword = async (plain) => {
    const salt = (0, node_crypto_1.randomBytes)(16);
    const key = await scrypt(plain, salt, KEY_LEN, { N, r: R, p: P });
    return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
};
exports.hashPassword = hashPassword;
const verifyPassword = async (plain, stored) => {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt')
        return false;
    const [, n, r, p, saltB64, keyB64] = parts;
    const expected = Buffer.from(keyB64, 'base64');
    if (expected.length === 0)
        return false;
    try {
        const actual = await scrypt(plain, Buffer.from(saltB64, 'base64'), expected.length, {
            N: Number(n),
            r: Number(r),
            p: Number(p),
        });
        return (0, node_crypto_1.timingSafeEqual)(actual, expected);
    }
    catch {
        return false;
    }
};
exports.verifyPassword = verifyPassword;
/**
 * هش ساختگی برای «کاربر یافت نشد»: هزینه محاسباتی را مثل یک ورود واقعی صرف می‌کند
 * تا زمان پاسخ لوی کاربرِ موجود/ناموجود را فاش نکند (ضد user enumeration).
 */
let dummyHash = null;
const dummyPasswordHash = () => (dummyHash ??= (0, exports.hashPassword)((0, node_crypto_1.randomBytes)(16).toString('hex')));
exports.dummyPasswordHash = dummyPasswordHash;
/** هش sha256 برای refresh token — خودِ توکن هرگز در دیتابیس ذخیره نمی‌شود */
const sha256Hex = (value) => (0, node_crypto_1.createHash)('sha256').update(value).digest('hex');
exports.sha256Hex = sha256Hex;
