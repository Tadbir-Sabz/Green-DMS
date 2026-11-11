"use client";

import { createApiClient, type RefreshContext } from '@dms/api-client';
import type { components } from '@dms/api-client';

// پیش‌فرض «مسیر نسبیِ هم‌مبدأ» است (نه http://localhost:4000). دلیل: وقتی وب پشت
// پروکسی سرو می‌شود (محیط پیش‌نمایش یا تولیدِ ریموت)، مرورگرِ کاربر روی localhost
// خودش هیچ API ندارد و درخواست به localhost:4000 هرگز به بک‌اندِ واقعی نمی‌رسد →
// ورود شکست می‌خورد و کاربر به پنل نمی‌رسد. با مسیر نسبی، درخواست /api/* به همان
// مبدأ وب می‌رود و next.config (rewrites) آن را سمتِ سرور به بک‌اند پروکسی می‌کند
// (API_PROXY_TARGET، پیش‌فرض http://localhost:4000) — بدون نیاز به CORS.
// برای صدا زدنِ مستقیمِ یک API روی دامنهٔ دیگر، NEXT_PUBLIC_API_URL را در زمان build ست کنید.
const BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "") + "/api/v1";

export const TOKEN_KEY = 'dms.access_token';
export const USERNAME_KEY = 'dms.username';
export const REFRESH_KEY = 'dms.refresh_token';
export const EXPIRES_KEY = 'dms.expires_at';
/** کاربرِ resolveشده (نقش‌ها + مجوزها) از GET /auth/me — RoleGuard/منو از این می‌خوانند */
export const USER_KEY = 'dms_user';

/** شکل کاربرِ نشست که در localStorage['dms_user'] ذخیره می‌شود */
export interface SessionUser {
  id?: string;
  username: string;
  staff_id?: string | null;
  roles: string[];
  permissions: string[];
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsername(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(USERNAME_KEY);
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(REFRESH_KEY);
}

export function getUser(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SessionUser>;
    if (!parsed || typeof parsed.username !== 'string') return null;
    return {
      id: parsed.id,
      username: parsed.username,
      staff_id: parsed.staff_id ?? null,
      roles: Array.isArray(parsed.roles) ? parsed.roles : [],
      permissions: Array.isArray(parsed.permissions) ? parsed.permissions : [],
    };
  } catch {
    return null;
  }
}

export function setUser(user: SessionUser | null): void {
  if (typeof window === 'undefined') return;
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
}

export function setSession(
  token: string,
  username: string,
  refreshToken?: string | null,
  expiresInSeconds?: number,
): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
  if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  else localStorage.removeItem(REFRESH_KEY);
  if (typeof expiresInSeconds === 'number') {
    localStorage.setItem(EXPIRES_KEY, String(Date.now() + expiresInSeconds * 1000));
  } else {
    localStorage.removeItem(EXPIRES_KEY);
  }
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USERNAME_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(EXPIRES_KEY);
  localStorage.removeItem(USER_KEY);
}

export function errorMessage(error: unknown): string {
  const e = error as { message_fa?: string; message?: string } | undefined;
  return e?.message_fa ?? (typeof e?.message === 'string' ? e.message : 'خطای ناشناخته‌ای رخ داد.');
}

/**
 * تازه‌سازی نشست با POST /auth/refresh (fetch خام تا با کلاینتِ دارای refresh
 * بازگشتی نخوریم). چند 401 هم‌زمان با یک promise مشترک تنها یک‌بار refresh می‌کنند.
 * موفق → true (درخواست اصلی دوباره ارسال می‌شود)؛ ناموفق → clearSession و false.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function doRefresh(ctx: RefreshContext): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  // اگر تب دیگری نشست را تازه کرده (توکن عوض شده)، همین توکنِ تازه کافی است
  if (ctx.tokenSent && getToken() && ctx.tokenSent !== getToken()) return true;

  try {
    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) {
      clearSession();
      return false;
    }
    const session = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      user?: { username: string };
    };
    setSession(
      session.access_token,
      session.user?.username ?? getUsername() ?? '',
      session.refresh_token ?? refreshToken,
      session.expires_in,
    );
    return true;
  } catch {
    clearSession();
    return false;
  }
}

function refresh(ctx: RefreshContext): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh(ctx).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export const api = createApiClient({
  baseUrl: BASE_URL,
  getToken,
  refresh,
});

/** شکلِ ضمیمهٔ بازگشتی از POST /attachments (هم‌راستا با schemas.Attachment) */
export interface UploadedAttachment {
  id: string;
  owner_type: string;
  owner_id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  url: string;
  created_at: string;
}

/**
 * بارگذاری ضمیمه (multipart/form-data) با fetch خام. openapi-fetch برای بدنهٔ
 * multipart تایپِ سخت‌گیرانه دارد، پس اینجا مستقیم FormData می‌فرستیم و از همان
 * زیرساختِ توکن/تازه‌سازی نشست استفاده می‌کنیم: ۴۰۱ → یک‌بار refresh و تلاش مجدد.
 */
export async function uploadAttachment(
  file: File,
  ownerType: string,
  ownerId: string,
): Promise<UploadedAttachment> {
  const send = (token: string | null) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('owner_type', ownerType);
    fd.append('owner_id', ownerId);
    return fetch(`${BASE_URL}/attachments`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: fd,
    });
  };

  let res = await send(getToken());
  if (res.status === 401) {
    const ok = await refresh({ tokenSent: getToken() });
    if (ok) res = await send(getToken());
  }
  if (!res.ok) {
    const err = await res.json().catch(() => undefined);
    throw new Error(errorMessage(err));
  }
  return (await res.json()) as UploadedAttachment;
}

/** پاسخ POST /entity-attachments/{ownerType}/{ownerId} — schemas.EntityAttachmentItem */
export type UploadedEntityAttachment = components['schemas']['EntityAttachmentItem'];

/**
 * بارگذاری ضمیمهٔ سازمانی (TASK-PM-02-C3) با **پیشرفت واقعی** بایتها.
 *
 * `fetch` پیشرفت آپلود نمیدهد، پس از XMLHttpRequest و `xhr.upload.onprogress`
 * استفاده میشود. مالک فقط در مسیر است: هیچ `owner_type`/`owner_id`/`company_id`
 * در FormData فرستاده نمیشود و سرور ارسال آنها را ۴۰۰ میگیرد. ۴۰۱ → همان
 * زیرساخت تازهسازی نشست (یکبار refresh) و تلاش مجدد. خطاها به پیام فارسی
 * قرارداد Error تبدیل میشوند؛ URL امضاشده هرگز لاگ نمیشود.
 */
export async function uploadEntityAttachment(
  file: File,
  ownerType: string,
  ownerId: string,
  onProgress?: (percent: number) => void,
): Promise<UploadedEntityAttachment> {
  const send = (token: string | null): Promise<{ status: number; body: unknown }> =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(
        'POST',
        `${BASE_URL}/entity-attachments/${encodeURIComponent(ownerType)}/${encodeURIComponent(ownerId)}`,
      );
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          onProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
        }
      };
      xhr.onload = () => {
        let body: unknown;
        try { body = JSON.parse(xhr.responseText); } catch { body = undefined; }
        resolve({ status: xhr.status, body });
      };
      xhr.onerror = () => reject(new Error('ارتباط با سرور برقرار نشد. دوباره تلاش کنید.'));
      xhr.onabort = () => reject(new Error('بارگذاری لغو شد.'));
      const fd = new FormData();
      fd.append('file', file);
      xhr.send(fd);
    });

  onProgress?.(0);
  let res = await send(getToken());
  if (res.status === 401) {
    const ok = await refresh({ tokenSent: getToken() });
    if (ok) {
      onProgress?.(0);
      res = await send(getToken());
    }
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(errorMessage(res.body));
  }
  onProgress?.(100);
  return res.body as UploadedEntityAttachment;
}

/** پاسخ POST /products/{id}/media — همان schemas.ProductMediaItem قرارداد */
export type UploadedProductMedia = components['schemas']['ProductMediaItem'];

/**
 * بارگذاری تصویر/سندِ کالا (TASK-PM-02-C1) با fetch خامِ multipart.
 *
 * برخلاف `uploadAttachment`، هیچ فیلد مالکیتی ارسال نمیشود: سرور `owner_type`
 * و `owner_id` را فقط از مسیر و نشست مشتق میکند و ارسال آنها را ۴۰۰ میگیرد.
 * همان زیرساخت توکن/تازهسازی نشست (یکبار refresh روی ۴۰۱) بهکار میرود.
 */
export async function uploadProductMedia(
  file: File,
  productId: string,
): Promise<UploadedProductMedia> {
  const send = (token: string | null) => {
    const fd = new FormData();
    fd.append('file', file);
    return fetch(`${BASE_URL}/products/${encodeURIComponent(productId)}/media`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: fd,
    });
  };

  let res = await send(getToken());
  if (res.status === 401) {
    const ok = await refresh({ tokenSent: getToken() });
    if (ok) res = await send(getToken());
  }
  if (!res.ok) {
    const err = await res.json().catch(() => undefined);
    throw new Error(errorMessage(err));
  }
  return (await res.json()) as UploadedProductMedia;
}

/**
 * بارگذاری نشست جاری از GET /auth/me و ذخیره در localStorage['dms_user'].
 * بدون توکن → null (کاربر وارد نشده). 401 پس از تلاش refresh → پاک کردن نشست.
 */
export async function loadSessionContext(): Promise<SessionUser | null> {
  if (!getToken()) return null;
  const { data, error } = await api.GET('/auth/me');
  if (error || !data) {
    // اگر refresh هم نتوانست نشست را برگرداند، خروج قطعی است
    clearSession();
    return null;
  }
  const user: SessionUser = {
    id: data.user?.id,
    username: data.user?.username ?? getUsername() ?? '',
    staff_id: data.user?.staff_id ?? null,
    roles: data.roles ?? [],
    permissions: data.permissions ?? [],
  };
  setUser(user);
  return user;
}

/** خروج: فراخوانی POST /auth/logout (بهتر-effort) سپس پاک کردن نشست محلی */
export async function logout(): Promise<void> {
  if (getToken()) {
    try {
      await api.POST('/auth/logout');
    } catch {
      // شکست logout سمت سرور نباید خروج محلی را متوقف کند
    }
  }
  clearSession();
}

