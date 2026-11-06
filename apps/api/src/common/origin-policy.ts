/**
 * سیاستِ صریحِ originهای مجاز (TASK-19 — Phase 2C).
 *
 * پیش‌تر `app.enableCors({ origin: true, credentials: true })` هر خاستگاهی را
 * **بازتاب** می‌داد (reflected origin) در حالی که credentials هم روشن بود؛ یعنی هر
 * سایتِ مهاجمی می‌توانست با کوکیِ کاربر درخواستِ هم‌مبدأ بزند. این ماژول:
 *
 *  - فهرستِ ALLOWED_ORIGINS را با قواعدِ سخت‌گیرانه تجزیه می‌کند (scheme اجباری،
 *    بدونِ مسیر/userinfo/query/پرده‌دار)؛
 *  - در production بدونِ فهرستِ معتبر ⇒ **fail-closed** (خطای فارسی، بدونِ هیچ مقدارِ
 *    رمزی در پیام)؛
 *  - بیرون از production پیش‌فرضِ توسعهٔ محلی را نگه می‌دارد و ورودیِ نامعتبر را با
 *    هشدار حذف می‌کند تا جریانِ توسعه نشکند؛
 *  - همین فهرست برایِ socket.io (tracking.gateway) هم استفاده می‌شود.
 */

export interface ParsedOrigins {
  /** originهای معتبر (نرمال‌شده: فقط scheme://host[:port]) */
  origins: string[];
  /** ورودی‌های نامعتبر — برایِ پیامِ خطا/هشدار (خودِ origin راز نیست) */
  invalid: string[];
}

/** حداقلِ قواعدِ یک origin مرورگری: http/https + host، بدونِ مسیر/کوئری/userinfo */
const isValidOrigin = (raw: string): boolean => {
  if (raw === '*' || raw.includes('*')) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username || url.password) return false;
  if (url.pathname !== '/' || url.search || url.hash) return false;
  // ورودی باید دقیقاً همان origin باشد (نه با اسلشِ انتهاییِ اضافه)
  return raw === url.origin;
};

/** تجزیهٔ فهرستِ جداشده با کاما — هرگز throw نمی‌کند */
export const parseOriginList = (raw: string | undefined | null): ParsedOrigins => {
  const origins: string[] = [];
  const invalid: string[] = [];
  for (const part of (raw ?? '').split(',')) {
    const item = part.trim();
    if (!item) continue;
    if (isValidOrigin(item)) {
      if (!origins.includes(item)) origins.push(item);
    } else {
      invalid.push(item);
    }
  }
  return { origins, invalid };
};

/** پیش‌فرضِ توسعهٔ محلی — فقط بیرون از production */
export const DEV_DEFAULT_ORIGINS = ['http://localhost:3000', 'http://localhost:3001'];

const isProduction = (env: NodeJS.ProcessEnv): boolean =>
  String(env.NODE_ENV ?? '').trim().toLowerCase() === 'production';

/**
 * فهرستِ نهاییِ originهای مجاز بر اساسِ محیط.
 * در production: نبودِ ALLOWED_ORIGINS یا وجودِ حتی یک ورودیِ نامعتبر ⇒ throw
 * (fail-closed — رفتارِ «بازتابِ همه» یا نادیده‌گرفتنِ خطا مجاز نیست).
 */
export const resolveCorsOrigins = (env: NodeJS.ProcessEnv = process.env): string[] => {
  const raw = env.ALLOWED_ORIGINS?.trim();
  if (isProduction(env)) {
    if (!raw) {
      throw new Error(
        [
          'پیکربندیِ ناامنِ CORS: در محیطِ production متغیرِ ALLOWED_ORIGINS الزامی است.',
          'بازتابِ همهٔ خاستگاه‌ها با credentials مجاز نیست. فهرستِ جداشده با کاما از',
          'originهای دقیق (مثل https://app.example.com) را ست کنید.',
        ].join('\n'),
      );
    }
    const { origins, invalid } = parseOriginList(raw);
    if (invalid.length > 0) {
      throw new Error(
        [
          `پیکربندیِ نامعتبرِ CORS: ${invalid.length} ورودیِ ALLOWED_ORIGINS معتبر نیست:`,
          ...invalid.map((v) => `  - ${v}`),
          'هر ورودی باید origin کامل با scheme باشد (http/https + host[:port])؛',
          'بدونِ مسیر، بدونِ *، بدونِ userinfo.',
        ].join('\n'),
      );
    }
    return origins;
  }

  if (!raw) return [...DEV_DEFAULT_ORIGINS];
  const { origins, invalid } = parseOriginList(raw);
  if (invalid.length > 0) {
    console.warn(
      `⚠ [cors] ورودی‌های نامعتبرِ ALLOWED_ORIGINS نادیده گرفته شدند: ${invalid.join(', ')}`,
    );
  }
  return origins.length > 0 ? origins : [...DEV_DEFAULT_ORIGINS];
};

/**
 * گزینه‌های `app.enableCors` — همان شیء در main.ts و تستِ CORS ساخته می‌شود تا
 * رگرسیون دقیقاً رفتارِ سیم‌کشیِ واقعی را بسنجد (نه نسخه‌ای موازی).
 */
export const corsOptionsFor = (
  env: NodeJS.ProcessEnv = process.env,
): { origin: string[]; credentials: boolean } => ({
  origin: resolveCorsOrigins(env),
  credentials: true,
});
