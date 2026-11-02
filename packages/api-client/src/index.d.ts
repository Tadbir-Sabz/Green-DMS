import createClient from 'openapi-fetch';
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
/** اطلاعات درخواستِ 401 که به refresh داده می‌شود تا تصمیم تازه‌سازی درست باشد */
export interface RefreshContext {
    /** توکنی که همین درخواست با آن فرستاده شد (برای تشخیص تازه‌شدنِ هم‌زمان تب دیگر) */
    tokenSent: string | null;
}
/** ساخت کلاینت؛ هر بار با تغییر نشست، getToken را به‌روز نگه دارید */
export declare function createApiClient(options: ApiClientOptions): ApiClient;
export type ApiClient = ReturnType<typeof createClient<paths>>;
