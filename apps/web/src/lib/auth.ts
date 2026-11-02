"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getUser,
  getToken,
  loadSessionContext,
  logout as apiLogout,
  setUser,
  type SessionUser,
} from "@/lib/api";

/**
 * لایهٔ نشست کاربر.
 *
 * مشکل پیشین: `useAuth` فقط `localStorage['dms_user']` را می‌خواند ولی هیچ‌کس آن
 * را نمی‌نوشت → همهٔ صفحه‌های محافظت‌شده به /login پرت می‌شدند. حالا:
 *  - هنگام mount، اگر توکن هست ولی کاربر کش‌نشده، GET /auth/me صدا زده و
 *    نقش‌ها/مجوزها در dms_user ذخیره می‌شود (bootstrap).
 *  - `hasPermission` بر اساس مجوزهای قطعیِ نشست تصمیم می‌گیرد (الگوی wildcard).
 *  - `logout` نشست محلی و سرور را پاک می‌کند.
 */

let bootstrapPromise: Promise<SessionUser | null> | null = null;

/** بارگذاری یکتای نشست برای همهٔ هوک‌ها (از race بین چند mount جلوگیری می‌کند) */
function bootstrapSession(): Promise<SessionUser | null> {
  if (!getToken()) return Promise.resolve(null);
  const cached = getUser();
  if (cached) return Promise.resolve(cached);
  if (!bootstrapPromise) {
    bootstrapPromise = loadSessionContext().finally(() => {
      bootstrapPromise = null;
    });
  }
  return bootstrapPromise;
}

/** تطبیق مجوز با الگوی wildcard — هم‌راستا با permissions.ts سمت API */
export function permissionMatches(granted: string, required: string): boolean {
  if (granted === required) return true;
  if (granted === "*" || granted === "*.*" || granted === "*.*.*") return true;
  const prefix = granted.endsWith(".*") ? granted.slice(0, -1) : `${granted}.`;
  return required.startsWith(prefix);
}

export function hasPermission(
  permissions: string[] | undefined,
  required: string | string[],
): boolean {
  if (!permissions || permissions.length === 0) return false;
  const needs = Array.isArray(required) ? required : [required];
  return needs.some((need) => permissions.some((g) => permissionMatches(g, need)));
}

export interface AuthState {
  user: SessionUser | null;
  isLoading: boolean;
  /** بازخوانی نشست از سرور (پس از ورود یا تغییر نقش) */
  refresh: () => Promise<SessionUser | null>;
  setUser: (user: SessionUser | null) => void;
  logout: () => Promise<void>;
  hasPermission: (required: string | string[]) => boolean;
  hasRole: (allowed: string[]) => boolean;
}

export function useAuth(): AuthState {
  const [user, setUserState] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    // ابتدا کاربر کش‌شده را فوری نشان بده تا flicker نقش نخورد
    const cached = getUser();
    if (cached) setUserState(cached);
    void bootstrapSession().then((u) => {
      if (!active) return;
      setUserState(u);
      setIsLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const u = await loadSessionContext();
    setUserState(u);
    return u;
  }, []);

  const updateUser = useCallback((u: SessionUser | null) => {
    setUser(u);
    setUserState(u);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUserState(null);
  }, []);

  const checkPermission = useCallback(
    (required: string | string[]) => hasPermission(user?.permissions, required),
    [user],
  );

  const checkRole = useCallback(
    (allowed: string[]) => {
      const roles = user?.roles ?? [];
      return allowed.some((r) => roles.includes(r));
    },
    [user],
  );

  return {
    user,
    isLoading,
    refresh,
    setUser: updateUser,
    logout,
    hasPermission: checkPermission,
    hasRole: checkRole,
  };
}
