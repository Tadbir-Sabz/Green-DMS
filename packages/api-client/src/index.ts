import createClient, { type ClientOptions } from 'openapi-fetch';
import type { paths, components } from './schema';

/**
 * کلاینت تایپ‌شده API سامانه Green-DMS برای وب‌اپ.
 *
 * - `schema.ts` با `npm run generate -w packages/api-client` از
 *   packages/contracts/openapi.yaml تولید می‌شود؛ دستی ویرایش نشود.
 * - هر فراخوانی طبق قرارداد تایپ است: مسیر، پارامتر، بدنه ورودی و پاسخ.
 * - هدر Authorization از `getToken` می‌آید (نشست JWT).
 * - اگر `refresh` بدهید، پاسخ 401 (به‌جز مسیرهای اعتبارنامه‌ای NO_REFRESH_PATHS)
 *   یک بار تازه‌سازی می‌شود و همان درخواست با توکن تازه دوباره می‌رود تا کاربر
 *   بی‌دلیل از سیستم خارج نشود — از جمله نشست‌خوان /auth/me.
 */
export type { paths, components, operations } from './schema';
export type ApiPaths = paths;
export type Schemas = components['schemas'];

export interface ApiClientOptions {
  /** آدرس پایه API؛ مثلاً http://localhost:4000 یا NEXT_PUBLIC_API_URL */
  baseUrl: string;
  /** توکن دسترسی فعلی — روی هر درخواست به‌صورت Bearer ارسال می‌شود */
  getToken?: () => string | null | undefined;
  /**
   * تازه‌سازی نشست هنگام 401 (POST /auth/refresh).
   * باید true برگرداند اگر توکن تازه شد (درخواست اصلی دوباره ارسال می‌شود) و
   * false اگر تازه‌سازی ممکن نبود (پاسخ 401 همان‌طور به فراخواننده می‌رسد).
   * فقط برای مسیرهای خارج از NO_REFRESH_PATHS فراخوانی می‌شود.
   */
  refresh?: (ctx: RefreshContext) => Promise<boolean>;
}

/**
 * مسیرهای اعتبارنامه‌ای که 401شان یعنی اطلاعات واردشده درست نیست، نه انقضای نشست؛
 * این‌ها هرگز تازه نمی‌شوند (وگرنه ورود اشتباه با refresh حلقه می‌زند).
 * برعکس /auth/me و /auth/logout نشست‌خوان هستند و 401شان باید با refresh تازه شود
 * تا کاربرِ بیش از ۱۵ دقیقه بی‌کار بی‌دلیل از سیستم خارج نشود.
 */
const NO_REFRESH_PATHS = [
  '/auth/login',
  '/auth/otp/request',
  '/auth/otp/verify',
  '/auth/password-reset',
  '/auth/refresh', // خودِ تازه‌سازی با fetch خام انجام می‌شود؛ تازه‌سازیِ دوباره‌اش حلقه است
];

const canRefreshUrl = (url: string): boolean => {
  try {
    const pathname = new URL(url).pathname;
    return !NO_REFRESH_PATHS.some((p) => pathname.endsWith(p));
  } catch {
    return false;
  }
};

/** اطلاعات درخواستِ 401 که به refresh داده می‌شود تا تصمیم تازه‌سازی درست باشد */
export interface RefreshContext {
  /** توکنی که همین درخواست با آن فرستاده شد (برای تشخیص تازه‌شدنِ هم‌زمان تب دیگر) */
  tokenSent: string | null;
}

/** ساخت کلاینت؛ هر بار با تغییر نشست، getToken را به‌روز نگه دارید */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const clientOptions: ClientOptions = {
    baseUrl: options.baseUrl,
    // openapi-fetch 0.17 گزینه headers را ثابت نگه می‌دارد؛ توکن نشست با fetch
    // سفارشی روی هر درخواست ست می‌شود تا با تغییر نشست همیشه تازه بماند.
    fetch: async (request: Request): Promise<Response> => {
      const currentToken = (): string | null => options.getToken?.() ?? null;
      const withToken = (req: Request): Request => {
        const token = currentToken();
        if (!token) return req;
        const headers = new Headers(req.headers);
        headers.set('Authorization', `Bearer ${token}`);
        return new Request(req, { headers });
      };

      // کپی درخواست پیش از اولین ارسال: بدنهٔ درخواست مصرف‌شدنی است و فقط
      // یک بار می‌توان آن را با توکن تازه دوباره فرستاد
      const canRetry = Boolean(options.refresh) && canRefreshUrl(request.url);
      const replay = canRetry ? request.clone() : null;

      // توکنِ همین ارسال — برای refresh می‌گوید آیا تب دیگری نشست را وسطِ کار عوض کرده است
      const tokenSent = currentToken();
      let response = await fetch(withToken(request));

      if (
        response.status === 401 &&
        replay &&
        options.refresh &&
        (await options.refresh({ tokenSent }))
      ) {
        response = await fetch(withToken(replay));
      }
      return response;
    },
  };
  return createClient<paths>(clientOptions);
}

export type ApiClient = ReturnType<typeof createClient<paths>>;
