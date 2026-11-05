/**
 * کنترلِ سوءاستفاده برایِ خودخدمت‌دهیِ استقرار (POST /onboarding/register).
 *
 * این endpoint «عمومی و بدونِ نشست» است، پس به‌طورِ طبیعی هدفِ ساختِ انبوهِ اجاره،
 * پیمایشِ فضای نامِ شرکت‌ها و پرکردنِ دیتابیس است. محافظت‌هایِ اینجا:
 *   ۱) نرخ‌گذاریِ لغزان (پنجرهٔ ساعتی به‌ازای IP + سقفِ روزانهٔ سراسری)
 *   ۲) اعتبارسنجیِ مقاومِ رمز (طول + دستِ‌کم ۳ دستهٔ نویسه + ردِ رمزهایِ رایج)
 *   ۳) حالتِ «کدِ دعوت» (اختیاری، با env) برایِ بستنِ ثبتِ کاملاً باز
 *   ۴) ثبتِ رخدادِ هر تلاش در جدولِ ممیزیِ onboarding_attempt (موفق/رد‌شده)
 *
 * وابستگیِ خارجی ندارد (CAPTCHA بیرونی «الزامی» نیست — طبقِ الزامِ کار).
 *
 * محدودیتِ صادقانه: شمارندهٔ نرخ در حافظهٔ همین فرآیند است. در استقرارِ
 * چندنمونه‌ای هر نمونه سقفِ خودش را دارد، پس سقفِ مؤثر ≈ limit × تعدادِ نمونه‌ها.
 * برایِ اشتراکِ سراسری باید همین interface را روی Redis پیاده کرد (زیرساختِ Redis
 * در compose/CI موجود است)؛ آن کار مستلزمِ افزودنِ وابستگیِ کلاینت و پیکربندی است
 * و عمداً از این تغییر بیرون گذاشته شد تا رفتارِ آفلاین/تست‌ها قطعی بماند.
 */

import { timingSafeEqual } from 'node:crypto';

export interface RateLimitDecision {
  allowed: boolean;
  /** تعدادِ سهمیهٔ باقی‌مانده در این پنجره */
  remaining: number;
  limit: number;
  /** ثانیه‌هایِ باقی‌مانده تا خروجِ قدیمی‌ترین ضربه از پنجره */
  retry_after_sec: number;
}

export interface SlidingWindowOptions {
  limit: number;
  windowMs: number;
  /** تزریقِ ساعت برای تستِ قطعی */
  now?: () => number;
}

/**
 * شمارندهٔ «پنجرهٔ لغزانِ» واقعی: زمانِ هر ضربه نگه داشته می‌شود و ضربه‌هایِ
 * بیرون از پنجره دور ریخته می‌شوند. برخلافِ ثابت‌کردنِ پنجره (fixed window)
 * اجازهٔ دو‌برابر‌شدنِ ناگهانیِ نرخ در مرزِ دو پنجره را نمی‌دهد.
 */
export class SlidingWindowCounter {
  private readonly hits = new Map<string, number[]>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(opts: SlidingWindowOptions) {
    this.limit = Math.max(1, Math.floor(opts.limit));
    this.windowMs = Math.max(1, Math.floor(opts.windowMs));
    this.now = opts.now ?? (() => Date.now());
  }

  private prune(key: string, nowMs: number): number[] {
    const cutoff = nowMs - this.windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (list.length === 0) this.hits.delete(key);
    else this.hits.set(key, list);
    return list;
  }

  /** یک ضربه ثبت می‌کند و تصمیم را برمی‌گرداند. */
  hit(key: string): RateLimitDecision {
    const nowMs = this.now();
    const list = this.prune(key, nowMs);
    if (list.length >= this.limit) {
      const oldest = list[0];
      return {
        allowed: false,
        remaining: 0,
        limit: this.limit,
        retry_after_sec: Math.max(1, Math.ceil((oldest + this.windowMs - nowMs) / 1000)),
      };
    }
    list.push(nowMs);
    this.hits.set(key, list);
    return {
      allowed: true,
      remaining: this.limit - list.length,
      limit: this.limit,
      retry_after_sec: 0,
    };
  }

  /** مشاهدهٔ وضعیت بدونِ مصرفِ سهمیه (برای سرصفحه‌هایِ تشخیصی/تست). */
  peek(key: string): { count: number; remaining: number } {
    const list = this.prune(key, this.now());
    return { count: list.length, remaining: Math.max(0, this.limit - list.length) };
  }

  /** تعدادِ کلیدهایِ فعال — برایِ مهارِ رشدِ حافظه در زیرِ حمله. */
  get size(): number {
    return this.hits.size;
  }

  clear(): void {
    this.hits.clear();
  }
}

/** رمزهایِ رایجی که حتی با «دستهٔ نویسهٔ» کافی هم پذیرفته نمی‌شوند. */
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'passw0rd', 'p@ssw0rd', 'p@ssword',
  '12345678', '123456789', '1234567890', 'qwerty123', 'qwertyuiop',
  'admin123', 'administrator', 'letmein1', 'welcome1', 'changeme',
  'iloveyou', 'abc12345', '11111111', '00000000', 'test1234',
]);

export type OnboardingMode = 'open' | 'invite';

export interface OnboardingPolicy {
  mode: OnboardingMode;
  inviteCodes: string[];
  ipHourLimit: number;
  globalDayLimit: number;
  minPasswordLength: number;
  minPasswordClasses: number;
}

const intEnv = (raw: string | undefined, fallback: number, min: number): number => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min) return fallback;
  return Math.floor(n);
};

/** خواندنِ سیاست از env با پیش‌فرض‌هایِ محافظه‌کارانه و «بدونِ شکستنِ خودخدمت‌دهی». */
export function loadOnboardingPolicy(env: NodeJS.ProcessEnv = process.env): OnboardingPolicy {
  const mode: OnboardingMode = (env.ONBOARDING_MODE ?? 'open').trim().toLowerCase() === 'invite'
    ? 'invite'
    : 'open';
  return {
    mode,
    inviteCodes: (env.ONBOARDING_INVITE_CODES ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    // پیش‌فرض‌ها عمداً سخاوتمندانه‌اند: یک کاربرِ واقعی برایِ راه‌اندازیِ شرکتِ خودش
    // به بیش از یکی دو تلاش نیاز ندارد، اما ساختِ انبوه/خودکار را گران می‌کند.
    ipHourLimit: intEnv(env.ONBOARDING_IP_HOUR_LIMIT, 20, 1),
    globalDayLimit: intEnv(env.ONBOARDING_GLOBAL_DAY_LIMIT, 500, 1),
    minPasswordLength: intEnv(env.ONBOARDING_MIN_PASSWORD_LENGTH, 8, 8),
    minPasswordClasses: intEnv(env.ONBOARDING_MIN_PASSWORD_CLASSES, 3, 1),
  };
}

/** تعدادِ دسته‌هایِ نویسهٔ موجود در رمز: کوچک، بزرگ، رقم، نماد. */
export function passwordClassCount(pw: string): number {
  let n = 0;
  if (/[a-z]/.test(pw)) n++;
  if (/[A-Z]/.test(pw)) n++;
  if (/[0-9]/.test(pw)) n++;
  if (/[^A-Za-z0-9]/.test(pw)) n++;
  return n;
}

/**
 * اعتبارسنجیِ مقاومِ رمز؛ فهرستِ «کدهایِ خطایِ پایدار» برمی‌گرداند (تهی = قابلِ قبول).
 * پیام‌هایِ خطا عمداً جزئیاتِ دقیقِ سیاست را لو نمی‌دهند تا پیمایشِ سیاست سخت بماند،
 * اما برایِ کاربرِ واقعی قابلِ فهم‌اند.
 */
export function passwordIssues(pw: string, policy: OnboardingPolicy): string[] {
  const issues: string[] = [];
  const value = pw ?? '';
  if (value.length < policy.minPasswordLength) issues.push('password_too_short');
  if (passwordClassCount(value) < policy.minPasswordClasses) issues.push('password_too_simple');
  if (COMMON_PASSWORDS.has(value.toLowerCase())) issues.push('password_too_common');
  // تکرارِ یک نویسه (مثلِ aaaaaaaa) یا دنبالهٔ ساده، نشانهٔ رمزِ ضعیفِ خودکار است.
  if (/(.)\1{5,}/.test(value)) issues.push('password_repetitive');
  return issues;
}

/** بررسیِ کدِ دعوت در حالتِ invite (مقایسهٔ زمان‌ثابت تا پیمایشِ کدها سخت شود). */
export function isValidInviteCode(code: string | undefined, policy: OnboardingPolicy): boolean {
  if (policy.mode !== 'invite') return true;
  if (!code) return false;
  if (policy.inviteCodes.length === 0) return false; // invite بدونِ کدِ پیکربندی‌شده = بسته
  const candidate = Buffer.from(String(code).trim());
  return policy.inviteCodes.some((known) => {
    const expected = Buffer.from(known);
    if (expected.length !== candidate.length) return false;
    // timingSafeEqual نیاز به هم‌اندازی دارد؛ طول‌هایِ نابرابر پیش‌تر رد شدند
    return timingSafeEqual(expected, candidate);
  });
}

/**
 * استخراجِ IP کلاینت. در استقرارِ پشتِ پروکسی، نخستین مقدارِ X-Forwarded-For
 * کلاینتِ واقعی است؛ در غیرِ این صورت آدرسِ سوکت. برایِ نرخ‌گذاری استفاده می‌شود،
 * نه برایِ تصمیمِ امنیتیِ حساس (هدرِ XFF قابلِ جعل است اگر مستقیماً در معرضِ
 * اینترنت باشیم — باید فقط از پروکسیِ معتمد خوانده شود).
 */
export function clientIpOf(req: {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}): string {
  const xff = req.headers?.['x-forwarded-for'];
  const first = Array.isArray(xff) ? xff[0] : xff;
  if (first) {
    const hop = first.split(',')[0]?.trim();
    if (hop) return hop;
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * نمونه‌هایِ یکتایِ شمارنده‌ها برایِ فرآیند. policy یک‌بار در زمانِ بارگذاریِ ماژول
 * خوانده می‌شود (همان الگویی که بقیهٔ ماژول‌ها برای env دارند) و برایِ تست‌ها
 * قابلِ بازنشانی است.
 */
export interface OnboardingGuard {
  policy: OnboardingPolicy;
  perIp: SlidingWindowCounter;
  global: SlidingWindowCounter;
}

let guard: OnboardingGuard | null = null;

export function getOnboardingGuard(): OnboardingGuard {
  if (!guard) {
    const policy = loadOnboardingPolicy();
    guard = {
      policy,
      perIp: new SlidingWindowCounter({ limit: policy.ipHourLimit, windowMs: 60 * 60 * 1000 }),
      global: new SlidingWindowCounter({ limit: policy.globalDayLimit, windowMs: 24 * 60 * 60 * 1000 }),
    };
  }
  return guard;
}

/** فقط برای تست: بازنشانیِ سیاست و شمارنده‌ها با envِ دلخواه. */
export function resetOnboardingGuardForTest(env?: NodeJS.ProcessEnv): OnboardingGuard {
  const policy = loadOnboardingPolicy(env);
  guard = {
    policy,
    perIp: new SlidingWindowCounter({ limit: policy.ipHourLimit, windowMs: 60 * 60 * 1000 }),
    global: new SlidingWindowCounter({ limit: policy.globalDayLimit, windowMs: 24 * 60 * 60 * 1000 }),
  };
  return guard;
}

/** نتیجهٔ یک تلاشِ استقرار — همان فهرستِ مجازِ ستونِ outcome در مهاجرت 0040. */
export type OnboardingOutcome =
  | 'created'
  | 'rejected_rate_limit'
  | 'rejected_policy'
  | 'rejected_conflict'
  | 'failed';

/** اطلاعاتِ زمینهٔ درخواست که برایِ ممیزی و نرخ‌گذاری لازم است. */
export interface RegisterMeta {
  clientIp?: string | null;
  userAgent?: string | null;
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6 = /^[0-9a-f:.]+$/i;

/**
 * نرمال‌سازیِ IP برایِ درج در ستونِ inet.
 *
 * مقدارِ غیرقابلِ تفسیر (مثلِ رشتهٔ 'unknown' یا هدرِ جعلیِ XFF) باید «تهی» شود،
 * نه اینکه درج را با خطایِ 22P02 بشکند — وگرنه رکوردِ ممیزی از دست می‌رفت.
 * آدرس‌هایِ Node مثلِ '::ffff:1.2.3.4' و '::1' برای inet معتبرند و دست‌نخورده می‌مانند.
 */
export function normalizeIpForDb(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  if (!value || value.length > 45) return null;
  const v4 = IPV4.exec(value);
  if (v4) return v4.slice(1).every((octet) => Number(octet) <= 255) ? value : null;
  if (value.includes(':') && IPV6.test(value)) return value;
  return null;
}
