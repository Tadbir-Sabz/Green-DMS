"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { EmptyState, Skeleton } from "@/components/ui/Feedback";
import { IconLock } from "@/components/icons";

type RoleGuardProps = {
  /** کدهای نقش مجاز (RBAC نقش‌محور) */
  allowed?: string[];
  /** مجوز(های) لازم — اگر هرکدام دارا باشد، دسترسی دارد (اولویت با مجوز است) */
  permission?: string | string[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

/** اسکلتون تمام‌صفحه هنگام بررسی دسترسی — از «چشمک» محتوای واقعی جلوگیری می‌کند */
function GuardLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">در حال بررسی دسترسی…</span>
      <div className="space-y-2">
        <Skeleton className="h-7 w-52" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-32 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  );
}

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

  if (isLoading) return <GuardLoading />;
  if (!user) return null;
  if (!permitted()) {
    return (
      fallback || (
        <EmptyState
          icon={<IconLock />}
          title="دسترسی غیرمجاز"
          description="نقش یا مجوز لازم برای دیدن این بخش را ندارید. در صورت نیاز با مدیر سامانه تماس بگیرید."
        />
      )
    );
  }

  return <>{children}</>;
}
