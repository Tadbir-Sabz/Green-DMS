import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * هش رمز عبور با scrypt (KDF استاندارد کتابخانه استاندارد Node) —
 * قالب ذخیره‌شده: scrypt$N$r$p$salt_base64$key_base64
 * انتخاب scrypt به‌جای bcrypt: بدون وابستگی native (سازگار با ویندوز/CI) و مقاوم در برابر GPU.
 */
const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number },
) => Promise<Buffer>;

const N = 16384;
const R = 8;
const P = 1;
const KEY_LEN = 64;

export const hashPassword = async (plain: string): Promise<string> => {
  const salt = randomBytes(16);
  const key = await scrypt(plain, salt, KEY_LEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
};

export const verifyPassword = async (plain: string, stored: string): Promise<boolean> => {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, 'base64');
  if (expected.length === 0) return false;
  try {
    const actual = await scrypt(plain, Buffer.from(saltB64, 'base64'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
};

/**
 * هش ساختگی برای «کاربر یافت نشد»: هزینه محاسباتی را مثل یک ورود واقعی صرف می‌کند
 * تا زمان پاسخ لوی کاربرِ موجود/ناموجود را فاش نکند (ضد user enumeration).
 */
let dummyHash: Promise<string> | null = null;
export const dummyPasswordHash = (): Promise<string> =>
  (dummyHash ??= hashPassword(randomBytes(16).toString('hex')));

/** هش sha256 برای refresh token — خودِ توکن هرگز در دیتابیس ذخیره نمی‌شود */
export const sha256Hex = (value: string): string =>
  createHash('sha256').update(value).digest('hex');
