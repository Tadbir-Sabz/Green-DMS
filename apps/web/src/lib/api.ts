"use client";

import { createApiClient, type RefreshContext } from '@dms/api-client';
import { useQuery } from '@tanstack/react-query';

const BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000") + "/api/v1";

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

export function useCustomers() {
  return useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const res = await api.GET("/customers");
      return res.data;
    },
  });
}

export function useOrders() {
  return useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      const res = await api.GET("/orders");
      return res.data;
    },
  });
}

export function useInvoices() {
  return useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const res = await api.GET("/invoices");
      return res.data;
    },
  });
}

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const res = await api.GET("/products");
      return res.data;
    },
  });
}
