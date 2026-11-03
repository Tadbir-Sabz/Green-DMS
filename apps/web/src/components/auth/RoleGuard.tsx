"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

type RoleGuardProps = {
  /** کدهای نقش مجاز (RBAC نقش‌محور) */
  allowed?: string[];
  /** مجوز(های) لازم — اگر هرکدام دارا باشد، دسترسی دارد (اولویت با مجوز است) */
  permission?: string | string[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

/**
 * محافظ دسترسی.
 * - بدون نشست → /login
 * - اگر `permission` داده شود و کاربر هیچ‌کدام را نداشته باشد → /403
 * - وگرنه اگر `allowed` (نقش‌ها) داده شود و نقش منطبق نباشد → /403
 */
export function RoleGuard({ allowed, permission, children, fallback }: RoleGuardProps) {
  const router = useRouter();
  const { user, isLoading, hasPermission, hasRole } = useAuth();

  const permitted = (): boolean => {
    if (permission && hasPermission(permission)) return true;
    if (permission && !allowed) return false;
    if (allowed && allowed.length > 0) return hasRole(allowed);
    return true; // فقط ورود لازم است
  };

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!permitted()) router.replace("/403");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isLoading, allowed, permission, router]);

  if (isLoading) return <div className="p-6 text-ink-muted">در حال بررسی دسترسی...</div>;
  if (!user) return null;
  if (!permitted()) {
    return fallback || <div className="p-6 text-ink-muted">دسترسی غیرمجاز</div>;
  }

  return <>{children}</>;
}
