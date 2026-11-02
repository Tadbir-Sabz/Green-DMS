"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

type RoleGuardProps = {
  allowed?: string[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

export function RoleGuard({ allowed, children, fallback }: RoleGuardProps) {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (allowed && allowed.length > 0) {
      const roles = Array.isArray((user as any).roles)
        ? (user as any).roles
        : (user as any).role
        ? [(user as any).role]
        : [];
      const has = allowed.some((r) => roles.includes(r));
      if (!has) {
        router.replace("/403");
      }
    }
  }, [user, isLoading, allowed, router]);

  if (isLoading) return <div className="p-6 text-slate-500">در حال بررسی دسترسی...</div>;
  if (!user) return null;
  if (allowed && allowed.length > 0) {
    const roles = Array.isArray((user as any).roles)
      ? (user as any).roles
      : (user as any).role
      ? [(user as any).role]
      : [];
    const has = allowed.some((r) => roles.includes(r));
    if (!has) return fallback || <div className="p-6 text-slate-500">دسترسی غیرمجاز</div>;
  }

  return <>{children}</>;
}
