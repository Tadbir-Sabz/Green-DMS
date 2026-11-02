import { randomBytes } from 'node:crypto';

/** پیکربندی احراز هویت — از env خوانده و یک بار محاسبه می‌شود */
export interface AuthConfig {
  secret: string;
  /** عمر access token به ثانیه (JWT_ACCESS_TTL، پیش‌فرض 15m) */
  accessTtlSeconds: number;
  /** عمر refresh token به ثانیه (JWT_REFRESH_TTL، پیش‌فرض 7d) */
  refreshTtlSeconds: number;
  /** تعداد تلاش ناموفق پیش از قفل (AUTH_MAX_FAILED_ATTEMPTS، پیش‌فرض 5) */
  maxFailedAttempts: number;
  /** مدت قفل به دقیقه (AUTH_LOCK_MINUTES، پیش‌فرض 15) */
  lockMinutes: number;
  /** عمر کد OTP به ثانیه (OTP_TTL_SECONDS، پیش‌فرض 120) */
  otpTtlSeconds: number;
  /** حداقل فاصله دو ارسال مجدد به ثانیه (OTP_RESEND_SECONDS، پیش‌فرض 60) */
  otpResendSeconds: number;
  /** پنجره نرخ‌گیری درخواست کد به دقیقه (OTP_WINDOW_MINUTES، پیش‌فرض 15) */
  otpWindowMinutes: number;
  /** سقف درخواست کد در همان پنجره (OTP_MAX_PER_WINDOW، پیش‌فرض 5) */
  otpMaxPerWindow: number;
  /** سقف تلاش ناموفق تأیید هر کد (OTP_MAX_ATTEMPTS، پیش‌فرض 5) */
  otpMaxAttempts: number;
  /** سقف تلاش‌های ورود هر (ip|username) در پنجره — 429 قرارداد (LOGIN_MAX_PER_WINDOW، پیش‌فرض 10) */
  loginMaxPerWindow: number;
  /** پنجره نرخ‌گیری ورود به دقیقه (LOGIN_WINDOW_MINUTES، پیش‌فرض 15) */
  loginWindowMinutes: number;
  /** طول کد به رقم (OTP_LENGTH، پیش‌فرض ۶؛ قرارداد 4 تا 8) */
  otpLength: number;
}

const TTL_RE = /^(\d+)(s|m|h|d)$/;
const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

export const parseTtl = (value: string, fallbackSeconds: number): number => {
  const m = TTL_RE.exec(value.trim());
  if (!m) return fallbackSeconds;
  return Number(m[1]) * UNIT_SECONDS[m[2]];
};

let cached: AuthConfig | null = null;

/**
 * خواندن تنظیمات به‌صورت تنبل (lazy) — چون dotenv در main.ts پس از import ماژول‌ها
 * اجرا می‌شود، نباید در سطح ماژول از env خواند.
 */
export const getAuthConfig = (): AuthConfig => {
  if (cached) return cached;

  let secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET در محیط production تنظیم نیست؛ صدور توکن ممکن نیست.');
    }
    secret = randomBytes(32).toString('hex');
    console.warn(
      '[auth] JWT_SECRET تنظیم نیست؛ برای توسعه کلید تصادفی موقت ساخته شد (با هر راه‌اندازی عوض می‌شود).',
    );
  }

  cached = {
    secret,
    accessTtlSeconds: parseTtl(process.env.JWT_ACCESS_TTL ?? '15m', 900),
    refreshTtlSeconds: parseTtl(process.env.JWT_REFRESH_TTL ?? '7d', 7 * 86400),
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
